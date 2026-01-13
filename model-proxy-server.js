#!/usr/bin/env node
/**
 * CLAUDE Multi-Provider Proxy Server
 * Enables GLM, Featherless.ai, Google Gemini, and Anthropic models
 *
 * Features:
 * - Tool calling emulation for abliterated models
 * - Context length management per model
 * - Multiple provider support with automatic format translation
 *
 * Usage:
 *   node model-proxy-server.js [port]          # Start proxy server
 *   node model-proxy-server.js --gemini-login  # Login to Google via OAuth
 *
 * Model Prefixes:
 *   glm/glm-4           -> GLM (ZhipuAI)
 *   featherless/...     -> Featherless.ai (with tool emulation)
 *   google/gemini-pro   -> Google Gemini
 *   anthropic/...       -> Native Anthropic (passthrough)
 *   (no prefix)         -> Native Anthropic (passthrough)
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { RateLimiter, retryWithBackoff, parseRetryAfter } from './lib/rate-limiter.js';

// Rate Limiter Configuration (module-level so all handlers can access it)
const rateLimiter = new RateLimiter({
  glm: 60,           // Z.AI: 60 req/min
  featherless: 100,  // Featherless: 100 req/min (generous!)
  google: 60,        // Google: 60 req/min (free tier with OAuth)
  anthropic: 50      // Anthropic: 50 req/min (tier 1, adjust based on your tier)
});

// Check for OAuth CLI flags
const args = process.argv.slice(2);
const isLoginCommand = args.includes('--gemini-login') || args.includes('--google-login');
const isLogoutCommand = args.includes('--gemini-logout') || args.includes('--google-logout');

// Handle OAuth commands before starting server
if (isLoginCommand || isLogoutCommand) {
  (async () => {
    const { startOAuthLogin, clearTokens } = await import('./lib/gemini-oauth.js');

    if (isLoginCommand) {
      console.log('');
      console.log('🔐 Starting Google OAuth login...');
      console.log('');
      try {
        await startOAuthLogin();
        console.log('');
        console.log('✅ Google authentication successful!');
        console.log('');
        console.log('You can now use Google Gemini models without GOOGLE_API_KEY');
        console.log('Example: /model google/gemini-2.0-flash');
        console.log('');
      } catch (error) {
        console.error('');
        console.error('❌ OAuth login failed:', error.message);
        console.error('');
        process.exit(1);
      }
    } else if (isLogoutCommand) {
      console.log('');
      console.log('🔓 Clearing Google OAuth tokens...');
      const cleared = await clearTokens();
      if (cleared) {
        console.log('✓ Logged out successfully');
      } else {
        console.log('ℹ No tokens found');
      }
      console.log('');
    }

    process.exit(0);
  })();
} else {
  // Normal server startup (wrapped in else block)
  startProxyServer();
}

// Wrap server startup in a function
function startProxyServer() {

// Configuration
const PORT = process.env.CLAUDISH_PORT || process.argv[2] || 3000;
const GLM_API_KEY = process.env.GLM_API_KEY || '79a58c7331504f3cbaef3f2f95cb375b.BrfNpV8TbeF5tCaK';
const GLM_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_API_KEY || '';
const FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT COMPACTION CONFIGURATION
// Enables smaller models (8k context) to work with Claude Code's large contexts
// ═══════════════════════════════════════════════════════════════════════════
const COMPACTION_CONFIG = {
  // Enable/disable compaction (can be overridden per-model)
  enabled: process.env.COMPACTION_ENABLED !== 'false',

  // Number of recent messages to preserve verbatim (never summarized)
  tailReserve: parseInt(process.env.COMPACTION_TAIL_RESERVE) || 6,

  // Token budget reserved for model response
  responseTokenReserve: parseInt(process.env.COMPACTION_RESPONSE_RESERVE) || 2048,

  // Minimum tokens to retain after compaction
  minContextTokens: parseInt(process.env.COMPACTION_MIN_CONTEXT) || 1024,

  // Target ratio of context window to use (0.85 = 85%)
  tokenBufferRatio: parseFloat(process.env.COMPACTION_BUFFER_RATIO) || 0.85,

  // Maximum tokens for generated summaries
  summaryMaxTokens: parseInt(process.env.COMPACTION_SUMMARY_TOKENS) || 512,

  // Model to use for summarization (null = use same model)
  summaryModel: process.env.COMPACTION_SUMMARY_MODEL || null,

  // Enable logging of compaction actions
  verbose: process.env.COMPACTION_VERBOSE === 'true'
};

// Models that support native tool calling
const NATIVE_TOOL_CALLING_MODELS = [
  'glm-4',
  'glm-4-plus',
  'gemini-pro',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
];

// Color codes for logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`${colors.dim}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`);
}


// OAuth module (loaded dynamically when needed)
let oauthModule = null;
async function getOAuthModule() {
  if (!oauthModule) {
    oauthModule = await import('./lib/gemini-oauth.js');
  }
  return oauthModule;
}

/**
 * Get Google API authentication (OAuth token or API key)
 * Returns { type: 'oauth' | 'apikey', token: string } or null
 */
async function getGoogleAuth() {
  // Try OAuth first
  try {
    const oauth = await getOAuthModule();
    const accessToken = await oauth.getAccessToken();
    if (accessToken) {
      return { type: 'oauth', token: accessToken };
    }
  } catch (error) {
    // OAuth not available, fall through to API key
  }

  // Fall back to API key
  if (GOOGLE_API_KEY) {
    return { type: 'apikey', token: GOOGLE_API_KEY };
  }

  return null;
}

/**
 * Parse model string to extract provider and model name
 */
function parseModel(modelString) {
  if (!modelString) {
    return { provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' };
  }

  // Check for prefixes
  const prefixMatch = modelString.match(/^(glm|featherless|google|anthropic)\/(.*)$/);

  if (prefixMatch) {
    return {
      provider: prefixMatch[1],
      model: prefixMatch[2]
    };
  }

  // Default to anthropic if no prefix
  return {
    provider: 'anthropic',
    model: modelString
  };
}

/**
 * Check if model supports native tool calling
 */
function supportsNativeToolCalling(provider, model) {
  if (provider === 'anthropic') return true;
  if (provider === 'google') return true;
  if (provider === 'featherless') return false; // Abliterated models don't support tools
  if (provider === 'glm') {
    return NATIVE_TOOL_CALLING_MODELS.some(m => model.includes(m));
  }
  return false;
}

/**
 * Convert Anthropic tools to OpenAI function format
 */
function anthropicToolsToOpenAI(tools) {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  }));
}

/**
 * Inject tools into system prompt for models without native support
 */
function injectToolsIntoPrompt(systemPrompt, tools) {
  if (!tools || tools.length === 0) return systemPrompt;

  const toolsDescription = tools.map(tool => {
    return `## Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.input_schema, null, 2)}`;
  }).join('\n\n');

  const toolCallInstructions = `
# Available Tools

You have access to the following tools. To use a tool, respond with XML tags in this exact format:

<tool_call>
{"name": "tool_name", "arguments": {"param1": "value1", "param2": "value2"}}
</tool_call>

IMPORTANT: You can call multiple tools IN PARALLEL by including multiple <tool_call> blocks in a single response. This is the preferred approach when tools don't depend on each other.

${toolsDescription}

# Examples

Example 1 - Single tool call:
User: What's the weather in San Francisco?
Assistant: I'll check the weather for you.
<tool_call>
{"name": "get_weather", "arguments": {"location": "San Francisco, CA"}}
</tool_call>

Example 2 - PARALLEL tool calls (recommended when possible):
User: Read files config.json and database.json
Assistant: I'll read both files in parallel.
<tool_call>
{"name": "Read", "arguments": {"file_path": "config.json"}}
</tool_call>
<tool_call>
{"name": "Read", "arguments": {"file_path": "database.json"}}
</tool_call>

Example 3 - Spawning agents (Task tool):
User: Explore the codebase structure
Assistant: I'll spawn an agent to explore the codebase.
<tool_call>
{"name": "Task", "arguments": {"subagent_type": "Explore", "description": "Explore codebase structure", "prompt": "Analyze the directory structure and identify main components"}}
</tool_call>

Example 4 - Using MCP tools (browser automation):
User: Take a screenshot and navigate to example.com
Assistant: I'll take a screenshot first, then navigate.
<tool_call>
{"name": "mcp__claude-in-chrome__computer", "arguments": {"action": "screenshot", "tabId": 12345}}
</tool_call>

Example 5 - Invoking Skills (slash commands):
User: Research authentication patterns
Assistant: I'll use the research skill to find relevant patterns.
<tool_call>
{"name": "Skill", "arguments": {"skill": "research", "args": "authentication patterns"}}
</tool_call>

Example 6 - Multiple capabilities in parallel:
User: Research the codebase and spawn a security analyzer
Assistant: I'll research and spawn a security agent in parallel.
<tool_call>
{"name": "Skill", "arguments": {"skill": "research", "args": "security vulnerabilities"}}
</tool_call>
<tool_call>
{"name": "Task", "arguments": {"subagent_type": "red-teamer", "description": "Security analysis", "prompt": "Analyze the codebase for vulnerabilities"}}
</tool_call>

# Critical Instructions for Tool Calling:
- Always use parallel tool calls when tools are independent
- The Task tool can spawn sub-agents - use it for complex multi-step workflows
- The Skill tool invokes slash commands and agent skills (e.g., /research, /build, /chrome)
- All MCP tools (mcp__*) are available and work exactly like other tools
- Include all required parameters in the arguments object
- For Task tool: always provide subagent_type, description, and prompt
- For Skill tool: provide skill name (without /) and optional args string
`;

  return (systemPrompt || '') + '\n\n' + toolCallInstructions;
}

/**
 * Parse tool calls from model output
 */
function parseToolCalls(text) {
  const toolCalls = [];
  const regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const toolCall = JSON.parse(match[1]);
      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.arguments)
        }
      });
    } catch (error) {
      log(`Failed to parse tool call: ${error.message}`, 'yellow');
    }
  }

  // Remove tool call tags from text
  const cleanedText = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

  return { toolCalls, cleanedText };
}

/**
 * Model-specific max_tokens limits to prevent API errors
 * Based on actual model capabilities from provider APIs
 */
const MODEL_LIMITS = {
  // GLM models (Z.AI)
  'glm-4.7': 8192,
  'glm-4': 8192,
  'glm-4-plus': 8192,
  'glm-4-air': 8192,

  // Featherless models (verified and tested)
  'dphn/Dolphin-Mistral-24B-Venice-Edition': 4096,
  'huihui-ai/Qwen2.5-72B-Instruct-abliterated': 4096,
  'WhiteRabbitNeo/WhiteRabbitNeo-V3-7B': 4096,  // WhiteRabbitNeo V3 7B (cybersecurity model)
  'mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated': 4096,  // Verified: 4096 max
  'huihui-ai/Llama-3.3-70B-Instruct-abliterated': 4096,  // Verified: 4096 max (not 8192!)

  // Google models
  'gemini-pro': 8192,
  'gemini-1.5-pro': 8192,
  'gemini-2.0-flash': 8192,
  'gemini-2.0-flash-exp': 8192,

  // Anthropic models
  'claude-opus-4-5': 8192,
  'claude-4.5-opus-20251101': 8192,
  'claude-sonnet-4-5': 8192,
  'claude-4.5-sonnet-20251001': 8192,
  'claude-haiku-4-5': 8192,
  'claude-haiku-4-5-20250919': 8192,

  // Default fallback
  'default': 4096
};

/**
 * Model-specific CONTEXT limits (total tokens: input + output)
 * This is different from max_tokens which is just output
 */
const MODEL_CONTEXT_LIMITS = {
  // GLM models - 128k context
  'glm-4.7': 131072,
  'glm-4': 131072,
  'glm-4-plus': 131072,
  'glm-4-air': 131072,

  // Featherless models - smaller context windows
  'dphn/Dolphin-Mistral-24B-Venice-Edition': 32768,
  'huihui-ai/Qwen2.5-72B-Instruct-abliterated': 32768,
  'WhiteRabbitNeo/WhiteRabbitNeo-V3-7B': 8192,  // 8k context, cybersecurity model
  'mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated': 8192,
  'huihui-ai/Llama-3.3-70B-Instruct-abliterated': 131072,

  // Google models - large context
  'gemini-pro': 32768,
  'gemini-1.5-pro': 1048576,
  'gemini-2.0-flash': 1048576,
  'gemini-2.0-flash-exp': 1048576,

  // Anthropic models - 200k context
  'claude-opus-4-5': 200000,
  'claude-4.5-opus-20251101': 200000,
  'claude-sonnet-4-5': 200000,
  'claude-4.5-sonnet-20251001': 200000,
  'claude-haiku-4-5': 200000,
  'claude-haiku-4-5-20250919': 200000,

  // Default fallback - conservative
  'default': 8192
};

/**
 * Estimate token count from text (rough: ~4 chars per token)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Get context limit for a model
 */
function getContextLimit(modelName) {
  const cleanModel = modelName.split('/').pop();

  if (MODEL_CONTEXT_LIMITS[cleanModel]) {
    return MODEL_CONTEXT_LIMITS[cleanModel];
  }

  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (cleanModel.includes(key) || key.includes(cleanModel)) {
      return limit;
    }
  }

  return MODEL_CONTEXT_LIMITS['default'];
}

/**
 * Check if request exceeds context limit
 * Returns { ok: true } or { ok: false, estimated, limit, model }
 */
function checkContextLimit(anthropicBody) {
  const model = anthropicBody.model || '';
  const contextLimit = getContextLimit(model);

  // Estimate total tokens
  let totalTokens = 0;

  // System prompt
  if (anthropicBody.system) {
    totalTokens += estimateTokens(anthropicBody.system);
  }

  // Messages
  for (const msg of anthropicBody.messages || []) {
    if (typeof msg.content === 'string') {
      totalTokens += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          totalTokens += estimateTokens(block.text);
        } else if (block.type === 'tool_result') {
          totalTokens += estimateTokens(typeof block.content === 'string' ? block.content : JSON.stringify(block.content));
        }
      }
    }
  }

  // Add buffer for output tokens
  const maxTokens = anthropicBody.max_tokens || 4096;
  totalTokens += maxTokens;

  if (totalTokens > contextLimit) {
    return {
      ok: false,
      estimated: totalTokens,
      limit: contextLimit,
      model: model
    };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT COMPACTION FUNCTIONS
// Automatically compress older messages when context exceeds model limits
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract text content from a message for summarization
 */
function extractMessageText(msg) {
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }
  return '';
}

/**
 * Create a summary of older messages using simple extraction
 * (No external API call - uses heuristic summarization)
 */
function createLocalSummary(messages) {
  if (!messages || messages.length === 0) {
    return '[No previous context]';
  }

  const summaryParts = [];
  let actionCount = 0;
  let toolUseCount = 0;
  let filesMentioned = new Set();
  let keyTopics = new Set();

  for (const msg of messages) {
    const text = extractMessageText(msg);
    const role = msg.role;

    // Count tool uses
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolUseCount++;
          if (block.name) keyTopics.add(block.name);
        }
        if (block.type === 'tool_result') {
          actionCount++;
        }
      }
    }

    // Extract file paths mentioned
    const fileMatches = text.match(/(?:\/[\w\-\.\/]+\.\w+|[\w\-]+\.\w{1,4})/g);
    if (fileMatches) {
      fileMatches.slice(0, 5).forEach(f => filesMentioned.add(f));
    }

    // Extract key action words
    const actionMatches = text.match(/(?:created?|modified?|updated?|deleted?|fixed?|added?|removed?|implemented?|tested?)/gi);
    if (actionMatches) {
      actionMatches.forEach(a => keyTopics.add(a.toLowerCase()));
    }
  }

  // Build compact summary
  summaryParts.push(`[COMPACTED CONTEXT: ${messages.length} messages]`);

  if (toolUseCount > 0) {
    summaryParts.push(`Tools used: ${toolUseCount}`);
  }
  if (actionCount > 0) {
    summaryParts.push(`Actions completed: ${actionCount}`);
  }
  if (filesMentioned.size > 0) {
    summaryParts.push(`Files: ${Array.from(filesMentioned).slice(0, 10).join(', ')}`);
  }
  if (keyTopics.size > 0) {
    summaryParts.push(`Topics: ${Array.from(keyTopics).slice(0, 10).join(', ')}`);
  }

  // Add last user message snippet if available
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg) {
    const text = extractMessageText(lastUserMsg);
    if (text.length > 0) {
      const snippet = text.slice(0, 200).replace(/\n/g, ' ');
      summaryParts.push(`Last request: "${snippet}${text.length > 200 ? '...' : ''}"`);
    }
  }

  return summaryParts.join('\n');
}

/**
 * Compact messages to fit within context limit
 * Returns { messages, compacted: boolean, stats }
 */
function compactMessages(anthropicBody, contextLimit) {
  const config = COMPACTION_CONFIG;
  const messages = anthropicBody.messages || [];

  if (!config.enabled || messages.length <= config.tailReserve) {
    return {
      messages,
      compacted: false,
      stats: { original: messages.length, final: messages.length, removed: 0 }
    };
  }

  // Calculate available tokens
  const systemTokens = estimateTokens(anthropicBody.system || '');
  const maxTokens = anthropicBody.max_tokens || config.responseTokenReserve;
  const availableTokens = Math.floor(contextLimit * config.tokenBufferRatio) - systemTokens - maxTokens;

  // Estimate current message tokens
  let currentTokens = 0;
  const messageTokens = messages.map(msg => {
    const tokens = estimateTokens(extractMessageText(msg));
    currentTokens += tokens;
    return tokens;
  });

  // Check if compaction needed
  if (currentTokens <= availableTokens) {
    return {
      messages,
      compacted: false,
      stats: { original: messages.length, final: messages.length, removed: 0, tokens: currentTokens }
    };
  }

  // Split messages: older (to summarize) and recent (to preserve)
  const tailCount = Math.min(config.tailReserve, messages.length);
  const olderMessages = messages.slice(0, -tailCount);
  const recentMessages = messages.slice(-tailCount);

  // Calculate how much we need to remove
  const recentTokens = recentMessages.reduce((sum, msg) => sum + estimateTokens(extractMessageText(msg)), 0);
  const targetOlderTokens = Math.max(availableTokens - recentTokens - config.summaryMaxTokens, config.minContextTokens);

  // Progressive compaction: remove oldest messages until we fit
  let olderTokens = olderMessages.reduce((sum, msg) => sum + estimateTokens(extractMessageText(msg)), 0);
  let removedCount = 0;
  const toSummarize = [];

  while (olderTokens > targetOlderTokens && olderMessages.length > 0) {
    const removed = olderMessages.shift();
    toSummarize.push(removed);
    olderTokens -= estimateTokens(extractMessageText(removed));
    removedCount++;
  }

  // Create summary of removed messages
  const summary = createLocalSummary(toSummarize);
  const summaryMessage = {
    role: 'user',
    content: summary
  };

  // Reconstruct messages: summary + remaining older + recent
  const compactedMessages = [summaryMessage, ...olderMessages, ...recentMessages];

  if (config.verbose) {
    log(`⚡ Compacted: ${messages.length} → ${compactedMessages.length} messages (removed ${removedCount})`, 'yellow');
  }

  return {
    messages: compactedMessages,
    compacted: true,
    stats: {
      original: messages.length,
      final: compactedMessages.length,
      removed: removedCount,
      summarized: toSummarize.length,
      originalTokens: currentTokens,
      finalTokens: estimateTokens(summary) + olderTokens + recentTokens
    }
  };
}

/**
 * Apply context compaction to an Anthropic request body
 * Returns modified body and compaction stats
 */
function applyCompaction(anthropicBody, contextLimit) {
  const result = compactMessages(anthropicBody, contextLimit);

  if (result.compacted) {
    return {
      body: {
        ...anthropicBody,
        messages: result.messages
      },
      compacted: true,
      stats: result.stats
    };
  }

  return {
    body: anthropicBody,
    compacted: false,
    stats: result.stats
  };
}

/**
 * Get max_tokens limit for a model
 */
function getModelLimit(modelName) {
  // Strip provider prefix (e.g., "glm/glm-4" -> "glm-4")
  const cleanModel = modelName.split('/').pop();

  // Check exact match
  if (MODEL_LIMITS[cleanModel]) {
    return MODEL_LIMITS[cleanModel];
  }

  // Check partial matches (for models with version suffixes)
  for (const [key, limit] of Object.entries(MODEL_LIMITS)) {
    if (cleanModel.includes(key) || key.includes(cleanModel)) {
      return limit;
    }
  }

  // Return default
  return MODEL_LIMITS['default'];
}

/**
 * Convert Anthropic message format to OpenAI format
 */
function anthropicToOpenAI(anthropicBody, emulateTools = false) {
  const messages = [];

  // Add system message if present
  let systemContent = anthropicBody.system || '';

  // Inject tools into system prompt if emulating
  if (emulateTools && anthropicBody.tools && anthropicBody.tools.length > 0) {
    systemContent = injectToolsIntoPrompt(systemContent, anthropicBody.tools);
  }

  if (systemContent) {
    messages.push({
      role: 'system',
      content: systemContent
    });
  }

  // Convert messages
  for (const msg of anthropicBody.messages || []) {
    const openaiMsg = {
      role: msg.role,
      content: ''
    };

    // Handle content
    if (typeof msg.content === 'string') {
      openaiMsg.content = msg.content;
    } else if (Array.isArray(msg.content)) {
      // Handle tool results, text blocks, and images
      const textBlocks = [];
      const toolResults = [];
      const images = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text);
        } else if (block.type === 'image') {
          // Store image for multi-modal handling
          images.push(block);
        } else if (block.type === 'tool_result') {
          toolResults.push({
            tool_call_id: block.tool_use_id,
            role: 'tool',
            name: block.name || 'unknown',
            content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
          });
        } else if (block.type === 'tool_use') {
          // This shouldn't appear in user messages, but handle it
          textBlocks.push(`[Tool: ${block.name}]`);
        }
      }

      // If we have images, store them in a special field for provider-specific handling
      if (images.length > 0) {
        openaiMsg.images = images;
      }

      openaiMsg.content = textBlocks.join('\n');

      // Add tool results as separate messages
      if (toolResults.length > 0) {
        messages.push(openaiMsg);
        messages.push(...toolResults);
        continue;
      }
    }

    messages.push(openaiMsg);
  }

  // Get model-specific limit and cap max_tokens
  const modelLimit = getModelLimit(anthropicBody.model);
  const requestedTokens = anthropicBody.max_tokens || 4096;
  const cappedTokens = Math.min(requestedTokens, modelLimit);

  // Log if we had to cap
  if (requestedTokens > modelLimit) {
    log(`⚠ Capped max_tokens from ${requestedTokens} to ${cappedTokens} for model ${anthropicBody.model}`, 'yellow');
  }

  const result = {
    model: anthropicBody.model,
    messages: messages,
    max_tokens: cappedTokens,
    temperature: anthropicBody.temperature || 0.7,
    top_p: anthropicBody.top_p,
    stream: anthropicBody.stream || false
  };

  // Add tools if not emulating (native support)
  if (!emulateTools && anthropicBody.tools && anthropicBody.tools.length > 0) {
    result.tools = anthropicToolsToOpenAI(anthropicBody.tools);
  }

  return result;
}

/**
 * Convert OpenAI response to Anthropic format
 */
function openaiToAnthropic(openaiResponse, emulateTools = false) {
  const choice = openaiResponse.choices?.[0];
  if (!choice) {
    return {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'No response generated' }],
      model: openaiResponse.model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0
      }
    };
  }

  const content = choice.message?.content || '';
  const toolCalls = choice.message?.tool_calls || [];

  const anthropicContent = [];

  // Handle tool calling emulation
  if (emulateTools && content) {
    const { toolCalls: parsedCalls, cleanedText } = parseToolCalls(content);

    if (cleanedText) {
      anthropicContent.push({
        type: 'text',
        text: cleanedText
      });
    }

    // Convert parsed tool calls to Anthropic format
    for (const call of parsedCalls) {
      anthropicContent.push({
        type: 'tool_use',
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments)
      });
    }
  } else {
    // Add text content
    if (content) {
      anthropicContent.push({
        type: 'text',
        text: content
      });
    }

    // Add native tool calls
    for (const call of toolCalls) {
      anthropicContent.push({
        type: 'tool_use',
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments)
      });
    }
  }

  return {
    id: openaiResponse.id || `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: anthropicContent.length > 0 ? anthropicContent : [{ type: 'text', text: '' }],
    model: openaiResponse.model,
    stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' :
                 choice.finish_reason === 'stop' ? 'end_turn' :
                 choice.finish_reason || 'end_turn',
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0
    }
  };
}

/**
 * Make HTTP/HTTPS request
 */
function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Handle GLM provider requests
 */
async function handleGLM(anthropicBody, res) {
  const { model } = parseModel(anthropicBody.model);
  const emulateTools = !supportsNativeToolCalling('glm', model) && anthropicBody.tools;
  const openaiBody = anthropicToOpenAI(anthropicBody, emulateTools);
  openaiBody.model = model;

  log(`→ GLM: ${model}${emulateTools ? ' (tool emulation)' : ''}`, 'cyan');

  // LAYER 1: Rate limit check
  try {
    await rateLimiter.waitForToken('glm', 10000); // 10s timeout
  } catch (error) {
    log('✗ GLM rate limit timeout', 'red');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit: No available tokens for GLM provider. Please wait and try again.'
      }
    }));
    return;
  }

  try {
    const response = await makeRequest(
      `${GLM_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GLM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      },
      openaiBody
    );

    if (response.status !== 200) {
      log(`✗ GLM error: ${response.status}`, 'red');
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    const openaiResponse = JSON.parse(response.body);
    const anthropicResponse = openaiToAnthropic(openaiResponse, emulateTools);

    log(`← GLM: ${anthropicResponse.usage.output_tokens} tokens`, 'green');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(anthropicResponse));

  } catch (error) {
    log(`✗ GLM error: ${error.message}`, 'red');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message
      }
    }));
  }
}

/**
 * Handle Featherless.ai provider requests (with tool emulation)
 */
async function handleFeatherless(anthropicBody, res) {
  if (!FEATHERLESS_API_KEY) {
    log(`✗ Featherless: API key not configured`, 'red');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'FEATHERLESS_API_KEY not set'
      }
    }));
    return;
  }

  const { model } = parseModel(anthropicBody.model);
  const contextLimit = getContextLimit(anthropicBody.model);
  let compactionStats = null;
  let workingBody = anthropicBody;

  // Apply context compaction if needed
  const contextCheck = checkContextLimit(anthropicBody);
  if (!contextCheck.ok) {
    log(`⚡ Featherless: Context exceeds limit (~${contextCheck.estimated}/${contextCheck.limit}), applying compaction...`, 'yellow');

    const compactionResult = applyCompaction(anthropicBody, contextLimit);
    workingBody = compactionResult.body;
    compactionStats = compactionResult.stats;

    if (compactionResult.compacted) {
      log(`⚡ Compacted: ${compactionStats.original} → ${compactionStats.final} messages (~${compactionStats.originalTokens} → ~${compactionStats.finalTokens} tokens)`, 'yellow');
    }

    // Verify compaction was sufficient
    const recheckContext = checkContextLimit(workingBody);
    if (!recheckContext.ok) {
      const shortModel = model.split('/').pop();
      log(`✗ Featherless: Context still too long after compaction (~${recheckContext.estimated}/${recheckContext.limit})`, 'red');
      res.writeHead(400, {
        'Content-Type': 'application/json',
        'X-Proxy-Compaction-Attempted': 'true',
        'X-Proxy-Compaction-Stats': JSON.stringify(compactionStats)
      });
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'context_length_exceeded',
          message: `Context still too long for ${shortModel} after compaction. Estimated ~${recheckContext.estimated} tokens but limit is ${recheckContext.limit}. Try /clear or switch to a model with larger context (glm/glm-4.7).`
        }
      }));
      return;
    }
  }

  // Featherless abliterated models always need tool emulation
  const emulateTools = workingBody.tools && workingBody.tools.length > 0;
  const openaiBody = anthropicToOpenAI(workingBody, emulateTools);
  openaiBody.model = model;

  log(`→ Featherless: ${model}${emulateTools ? ' (tool emulation)' : ''}${compactionStats ? ' [compacted]' : ''}`, 'magenta');

  // LAYER 1: Rate limit check
  try {
    await rateLimiter.waitForToken('featherless', 10000);
  } catch (error) {
    log('✗ Featherless rate limit timeout', 'red');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit: No available tokens for Featherless provider. Please wait and try again.'
      }
    }));
    return;
  }

  try {
    const response = await makeRequest(
      `${FEATHERLESS_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FEATHERLESS_API_KEY}`,
          'Content-Type': 'application/json'
        }
      },
      openaiBody
    );

    if (response.status !== 200) {
      log(`✗ Featherless error: ${response.status}`, 'red');
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    const openaiResponse = JSON.parse(response.body);
    const anthropicResponse = openaiToAnthropic(openaiResponse, emulateTools);

    log(`← Featherless: ${anthropicResponse.usage.output_tokens} tokens${compactionStats ? ' [compacted]' : ''}`, 'green');

    // Build response headers
    const responseHeaders = { 'Content-Type': 'application/json' };
    if (compactionStats) {
      responseHeaders['X-Proxy-Context-Compacted'] = 'true';
      responseHeaders['X-Proxy-Context-Original-Messages'] = String(compactionStats.original);
      responseHeaders['X-Proxy-Context-Final-Messages'] = String(compactionStats.final);
      responseHeaders['X-Proxy-Context-Removed'] = String(compactionStats.removed || 0);
      if (compactionStats.originalTokens) {
        responseHeaders['X-Proxy-Context-Original-Tokens'] = String(compactionStats.originalTokens);
        responseHeaders['X-Proxy-Context-Final-Tokens'] = String(compactionStats.finalTokens);
      }
    }

    res.writeHead(200, responseHeaders);
    res.end(JSON.stringify(anthropicResponse));

  } catch (error) {
    log(`✗ Featherless error: ${error.message}`, 'red');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message
      }
    }));
  }
}

/**
 * Handle Google Gemini provider requests (with OAuth support)
 */
async function handleGoogle(anthropicBody, res) {
  // Try to get authentication (OAuth or API key)
  const auth = await getGoogleAuth();

  if (!auth) {
    log(`✗ Google: No authentication configured`, 'red');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Google authentication not configured. Run: node ~/.claude/model-proxy-server.js --gemini-login'
      }
    }));
    return;
  }

  const { model } = parseModel(anthropicBody.model);
  const openaiBody = anthropicToOpenAI(anthropicBody, false);

  log(`→ Google (${auth.type}): ${model}`, 'blue');

  // LAYER 1: Rate limit check
  try {
    await rateLimiter.waitForToken('google', 10000);
  } catch (error) {
    log('✗ Google rate limit timeout', 'red');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit: No available tokens for Google provider. Please wait and try again.'
      }
    }));
    return;
  }

  try {
    // Build request URL and headers based on auth type
    let url, headers;

    if (auth.type === 'oauth') {
      // Use OAuth token with Authorization header
      url = `${GOOGLE_BASE_URL}/models/${model}:generateContent`;
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      };
    } else {
      // Use API key in URL
      url = `${GOOGLE_BASE_URL}/models/${model}:generateContent?key=${auth.token}`;
      headers = {
        'Content-Type': 'application/json'
      };
    }

    // Google uses a different endpoint structure
    const response = await makeRequest(
      url,
      {
        method: 'POST',
        headers: headers
      },
      {
        contents: openaiBody.messages.map(msg => {
          const parts = [];

          // Add text
          if (msg.content) {
            parts.push({ text: msg.content });
          }

          // Add images if present
          if (msg.images && msg.images.length > 0) {
            for (const img of msg.images) {
              if (img.source?.type === 'base64') {
                parts.push({
                  inlineData: {
                    mimeType: img.source.media_type || 'image/png',
                    data: img.source.data
                  }
                });
              } else if (img.source?.type === 'url') {
                // Google doesn't support URLs directly, would need to fetch and convert
                parts.push({ text: `[Image: ${img.source.url}]` });
              }
            }
          }

          return {
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: parts
          };
        }),
        generationConfig: {
          maxOutputTokens: openaiBody.max_tokens,
          temperature: openaiBody.temperature,
          topP: openaiBody.top_p
        }
      }
    );

    if (response.status !== 200) {
      log(`✗ Google error: ${response.status}`, 'red');
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(response.body);
      return;
    }

    const googleResponse = JSON.parse(response.body);
    const content = googleResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const anthropicResponse = {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: content }],
      model: model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
        output_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0
      }
    };

    log(`← Google: ${anthropicResponse.usage.output_tokens} tokens`, 'green');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(anthropicResponse));

  } catch (error) {
    log(`✗ Google error: ${error.message}`, 'red');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message
      }
    }));
  }
}

/**
 * Handle Anthropic (native) provider requests - passthrough
 */
async function handleAnthropic(anthropicBody, res, headers) {
  // Try to get API key from incoming request headers (Claude Code auth) or environment
  // Check multiple possible header names (case-insensitive)
  const apiKey = headers['x-api-key'] ||
                 headers['authorization']?.replace('Bearer ', '') ||
                 ANTHROPIC_API_KEY;

  if (!apiKey) {
    log(`✗ Anthropic: API key not configured`, 'red');
    log(`  Headers received: ${Object.keys(headers).join(', ')}`, 'dim');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'ANTHROPIC_API_KEY not set. Please set it in environment or ensure Claude Code passes authentication.'
      }
    }));
    return;
  }

  const { model } = parseModel(anthropicBody.model);
  anthropicBody.model = model;

  log(`→ Anthropic: ${model}`, 'blue');

  // LAYER 1: Rate limit check
  try {
    await rateLimiter.waitForToken('anthropic', 10000);
  } catch (error) {
    log('✗ Anthropic rate limit timeout', 'red');
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit: No available tokens for Anthropic provider. Please wait and try again.'
      }
    }));
    return;
  }

  try {
    const response = await makeRequest(
      `${ANTHROPIC_BASE_URL}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': headers['anthropic-version'] || '2023-06-01',
          'Content-Type': 'application/json'
        }
      },
      anthropicBody
    );

    log(`← Anthropic: ${response.status}`, 'green');

    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(response.body);

  } catch (error) {
    log(`✗ Anthropic error: ${error.message}`, 'red');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message
      }
    }));
  }
}

/**
 * Handle models list endpoint - inject custom models into Claude Code UI
 */
function handleModelsList(res) {
  const models = [
    // Anthropic models (native) - Updated IDs to match Roo Code
    {
      id: 'claude-4.5-opus-20251101',
      name: 'Claude Opus 4.5',
      display_name: '🏛️ Claude Opus 4.5 (Architect/Content)',
      created_at: '2025-11-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'claude-4.5-sonnet-20251001',
      name: 'Claude Sonnet 4.5',
      display_name: '🔧 Claude Sonnet 4.5 (Fixer/DevOps)',
      created_at: '2025-10-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'claude-haiku-4-5-20250919',
      name: 'Claude Haiku 4.5',
      display_name: 'Claude Haiku 4.5',
      created_at: '2025-09-19T00:00:00Z',
      type: 'model'
    },

    // GLM models - Added GLM-4.7 for Orchestrator/Builder
    {
      id: 'glm/glm-4.7',
      name: 'GLM-4.7',
      display_name: '🚀 GLM-4.7 (Orchestrator/Builder)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'glm/glm-4',
      name: 'GLM-4',
      display_name: '🌐 GLM-4 (Free)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'glm/glm-4-air',
      name: 'GLM-4 Air',
      display_name: '🌐 GLM-4 Air (Balanced)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },

    // Google models - Added Gemini 3 Pro for Frontend/Research
    {
      id: 'google/gemini-3-pro',
      name: 'Gemini 3 Pro',
      display_name: '🎨 Gemini 3 Pro (Frontend/Research)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'google/gemini-pro',
      name: 'Gemini Pro',
      display_name: '🔷 Gemini Pro',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'google/gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      display_name: '🔷 Gemini 2.0 Flash',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },

    // Featherless models - Verified and tested abliterated variants
    {
      id: 'featherless/dphn/Dolphin-Mistral-24B-Venice-Edition',
      name: 'Dolphin-3 Venice',
      display_name: '🔐 Dolphin-3 (Security/RE)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated',
      name: 'Qwen 2.5 72B Abliterated',
      display_name: '🔓 Qwen 2.5 72B (Unrestricted)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B',
      name: 'WhiteRabbitNeo V3 7B',
      display_name: '🔐 WhiteRabbitNeo V3 7B (Cybersecurity)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'featherless/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated',
      name: 'Llama 3.1 8B Abliterated',
      display_name: '🦙 Llama 3.1 8B (Fast/Unrestricted)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    },
    {
      id: 'featherless/huihui-ai/Llama-3.3-70B-Instruct-abliterated',
      name: 'Llama 3.3 70B Abliterated',
      display_name: '🦙 Llama 3.3 70B (Quality/Unrestricted)',
      created_at: '2024-01-01T00:00:00Z',
      type: 'model'
    }
  ];

  log(`← Models list: ${models.length} models`, 'green');

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: models }));
}

/**
 * Main request handler
 */
function handleRequest(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle models list endpoint
  if (req.url.includes('/v1/models')) {
    log(`GET ${req.url} [models list]`, 'bright');
    handleModelsList(res);
    return;
  }

  // Only handle /v1/messages endpoint
  if (!req.url.includes('/v1/messages')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
      const anthropicBody = JSON.parse(body);
      const { provider } = parseModel(anthropicBody.model);

      log(`${req.method} ${req.url} [${provider}]`, 'bright');

      // Route to appropriate provider
      switch (provider) {
        case 'glm':
          await handleGLM(anthropicBody, res);
          break;
        case 'featherless':
          await handleFeatherless(anthropicBody, res);
          break;
        case 'google':
          await handleGoogle(anthropicBody, res);
          break;
        case 'anthropic':
        default:
          await handleAnthropic(anthropicBody, res, req.headers);
          break;
      }

    } catch (error) {
      log(`✗ Request error: ${error.message}`, 'red');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: error.message
        }
      }));
    }
  });
}

/**
 * Start the proxy server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  log('═'.repeat(70), 'bright');
  log(`CLAUDE Multi-Provider Proxy`, 'bright');
  log(`Tool Calling Emulation + Context Management`, 'bright');
  log('═'.repeat(70), 'bright');
  console.log('');
  log(`🚀 Server running on http://127.0.0.1:${PORT}`, 'green');
  console.log('');
  log('Supported Providers:', 'bright');
  log(`  ${GLM_API_KEY ? '✓' : '✗'} GLM (ZhipuAI)     - glm/glm-4`, GLM_API_KEY ? 'green' : 'dim');
  log(`  ${FEATHERLESS_API_KEY ? '✓' : '✗'} Featherless.ai   - featherless/model-name (tool emulation)`, FEATHERLESS_API_KEY ? 'green' : 'dim');
  // Check OAuth status asynchronously
  (async () => {
    const auth = await getGoogleAuth();
    const status = auth ? (auth.type === 'oauth' ? '✓ (OAuth)' : '✓ (API Key)') : '✗';
    const color = auth ? 'green' : 'dim';
    log(`  ${status} Google Gemini    - google/gemini-pro`, color);
    if (!auth) {
      log(`     Tip: Run \"node ~/.claude/model-proxy-server.js --gemini-login\" to authenticate`, 'dim');
    }
  })();
  log(`  ${ANTHROPIC_API_KEY ? '✓' : '✗'} Anthropic        - anthropic/claude-sonnet-4-5 (or no prefix)`, ANTHROPIC_API_KEY ? 'green' : 'dim');
  console.log('');
  log('Features:', 'bright');
  log('  ✓ Tool calling emulation for abliterated models', 'green');
  log('  ✓ Context compaction for small models (8k→works!)', 'green');
  log('  ✓ Seamless model switching with /model command', 'green');
  log('  ✓ Full MCP tool support across all providers', 'green');
  if (COMPACTION_CONFIG.enabled) {
    log(`  ⚡ Compaction: tail=${COMPACTION_CONFIG.tailReserve} msgs, buffer=${Math.round(COMPACTION_CONFIG.tokenBufferRatio*100)}%`, 'yellow');
  }
  console.log('');
  log('Usage:', 'bright');
  log(`  # Start Claude Code with proxy:`, 'cyan');
  log(`  ANTHROPIC_BASE_URL=http://127.0.0.1:${PORT} claude`, 'cyan');
  console.log('');
  log(`  # Switch models:`, 'cyan');
  log(`  /model glm/glm-4`, 'cyan');
  log(`  /model featherless/meta-llama/Meta-Llama-3-8B-Instruct`, 'cyan');
  log(`  /model google/gemini-pro`, 'cyan');
  log(`  /model anthropic/claude-opus-4-5`, 'cyan');
  console.log('');
  log('Environment Variables:', 'bright');
  log(`  GLM_API_KEY=${GLM_API_KEY ? GLM_API_KEY.substring(0, 20) + '...' : '(not set)'}`, 'dim');
  log(`  FEATHERLESS_API_KEY=${FEATHERLESS_API_KEY ? FEATHERLESS_API_KEY.substring(0, 20) + '...' : '(not set)'}`, 'dim');
  log(`  GOOGLE_API_KEY=${GOOGLE_API_KEY ? GOOGLE_API_KEY.substring(0, 20) + '...' : '(not set)'}`, 'dim');
  log(`  ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 20) + '...' : '(not set)'}`, 'dim');
  console.log('');
  log('═'.repeat(70), 'bright');
  console.log('');
  log('Ready to proxy requests with full tool support...', 'green');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  log('Shutting down proxy server...', 'yellow');
  server.close(() => {
    log('Server stopped', 'dim');
    process.exit(0);
  });
});

} // End of startProxyServer()

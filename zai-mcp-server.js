#!/usr/bin/env node
/**
 * Z.AI MCP Server - Reliable GLM Integration
 *
 * Features:
 * - Exponential backoff retry logic
 * - Request timeouts with AbortController
 * - Streaming support
 * - Comprehensive error handling
 * - Rate limiting awareness
 *
 * Based on research from:
 * - ifolin/glm-mcp-server
 * - BeehiveInnovations/pal-mcp-server PR #319
 * - Z.AI official documentation
 */

const GLM_API_KEY = process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || '79a58c7331504f3cbaef3f2f95cb375b.BrfNpV8TbeF5tCaK';
const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://api.z.ai/api/coding/paas/v4';

// Fallback endpoints in order of preference
const FALLBACK_ENDPOINTS = [
  'https://api.z.ai/api/coding/paas/v4',
  'https://open.bigmodel.cn/api/paas/v4',
  'https://api.z.ai/v1'
];

// Available GLM models with capabilities
const GLM_MODELS = {
  'glm-4.7': { name: 'GLM-4.7', context: 131072, maxOutput: 8192, description: 'Latest coding-optimized model' },
  'glm-4': { name: 'GLM-4', context: 131072, maxOutput: 8192, description: 'Most capable general model' },
  'glm-4-plus': { name: 'GLM-4-Plus', context: 131072, maxOutput: 8192, description: 'Enhanced capabilities' },
  'glm-4-air': { name: 'GLM-4-Air', context: 131072, maxOutput: 8192, description: 'Faster, cost-effective' },
  'glm-4-airx': { name: 'GLM-4-AirX', context: 8192, maxOutput: 4096, description: 'Ultra-fast inference' },
  'glm-4-flash': { name: 'GLM-4-Flash', context: 8192, maxOutput: 4096, description: 'Fastest response' },
  'glm-4-flashx': { name: 'GLM-4-FlashX', context: 8192, maxOutput: 4096, description: 'Extended flash model' }
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,  // 1 second
  maxDelay: 30000,     // 30 seconds
  backoffMultiplier: 2,
  retryableCodes: [408, 429, 500, 502, 503, 504]
};

// Request timeout
const REQUEST_TIMEOUT = 60000; // 60 seconds

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with jitter
 */
function getBackoffDelay(attempt) {
  const delay = Math.min(
    RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelay
  );
  // Add jitter (0-25% of delay)
  return delay + Math.random() * delay * 0.25;
}

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(url, options, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call GLM API with retry logic
 */
async function callGLM(model, messages, options = {}) {
  let lastError = null;
  let currentEndpoint = GLM_BASE_URL;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(
        `${currentEndpoint}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GLM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model || 'glm-4',
            messages: messages,
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            max_tokens: options.max_tokens ?? 4096,
            stream: options.stream ?? false,
          }),
        },
        REQUEST_TIMEOUT
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`GLM API error: ${response.status} - ${errorText}`);
        error.status = response.status;

        // Check if retryable
        if (RETRY_CONFIG.retryableCodes.includes(response.status) && attempt < RETRY_CONFIG.maxRetries) {
          console.error(`[Z.AI] Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${response.status} error`);
          lastError = error;

          // Try fallback endpoint on 5xx errors
          if (response.status >= 500 && FALLBACK_ENDPOINTS.length > 1) {
            const currentIndex = FALLBACK_ENDPOINTS.indexOf(currentEndpoint);
            if (currentIndex < FALLBACK_ENDPOINTS.length - 1) {
              currentEndpoint = FALLBACK_ENDPOINTS[currentIndex + 1];
              console.error(`[Z.AI] Switching to fallback endpoint: ${currentEndpoint}`);
            }
          }

          await sleep(getBackoffDelay(attempt));
          continue;
        }

        throw error;
      }

      const data = await response.json();

      // Log success metrics
      if (data.usage) {
        console.error(`[Z.AI] Success: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out tokens`);
      }

      return data;

    } catch (error) {
      if (error.name === 'AbortError') {
        error.message = `Request timeout after ${REQUEST_TIMEOUT}ms`;
        console.error(`[Z.AI] Timeout on attempt ${attempt + 1}`);
      }

      lastError = error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        console.error(`[Z.AI] Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries}: ${error.message}`);
        await sleep(getBackoffDelay(attempt));
      }
    }
  }

  throw lastError || new Error('GLM API call failed after all retries');
}

/**
 * Call GLM API with streaming
 */
async function callGLMStream(model, messages, options = {}, onChunk) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT * 2); // Double timeout for streaming

  try {
    const response = await fetch(`${GLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'glm-4',
        messages: messages,
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
        max_tokens: options.max_tokens ?? 4096,
        stream: true,
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GLM API error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              if (onChunk) onChunk(content);
            }
          } catch (e) {
            // Ignore parse errors in stream
          }
        }
      }
    }

    return { content: fullContent };

  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Simple MCP server implementation
 */
class ZaiMCPServer {
  constructor() {
    this.handlers = new Map();
    this.buffer = '';
  }

  setRequestHandler(method, handler) {
    this.handlers.set(method, handler);
  }

  async handleMessage(message) {
    try {
      const request = JSON.parse(message);
      const handler = this.handlers.get(request.method);

      if (!handler) {
        return this.createError(request.id, -32601, `Method not found: ${request.method}`);
      }

      const result = await handler(request);
      return this.createResponse(request.id, result);
    } catch (error) {
      console.error('[Z.AI] Error handling message:', error.message);
      return this.createError(null, -32603, error.message);
    }
  }

  createResponse(id, result) {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
  }

  createError(id, code, message) {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  }

  start() {
    console.error('[Z.AI] MCP Server starting...');
    console.error(`[Z.AI] Endpoint: ${GLM_BASE_URL}`);
    console.error(`[Z.AI] Models: ${Object.keys(GLM_MODELS).join(', ')}`);
    console.error(`[Z.AI] Timeout: ${REQUEST_TIMEOUT}ms, Retries: ${RETRY_CONFIG.maxRetries}`);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const response = await this.handleMessage(line);
          process.stdout.write(response + '\n');
        }
      }
    });

    process.stdin.on('end', () => {
      console.error('[Z.AI] MCP Server shutting down...');
      process.exit(0);
    });
  }
}

/**
 * Initialize and start the MCP server
 */
function main() {
  const server = new ZaiMCPServer();

  // Initialize
  server.setRequestHandler('initialize', async () => ({
    protocolVersion: '1.0.0',
    capabilities: { tools: {}, prompts: {}, resources: {} },
    serverInfo: { name: 'zai-mcp-server', version: '2.0.0' }
  }));

  // List tools
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'zai_chat',
        description: 'Chat with Z.AI GLM models. Supports glm-4.7, glm-4, glm-4-air, glm-4-flash with automatic retries and timeout handling.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The user prompt or question' },
            model: {
              type: 'string',
              description: 'GLM model to use',
              enum: Object.keys(GLM_MODELS),
              default: 'glm-4'
            },
            system: { type: 'string', description: 'Optional system prompt' },
            temperature: { type: 'number', description: 'Sampling temperature (0-1)', default: 0.7 },
            max_tokens: { type: 'number', description: 'Maximum tokens to generate', default: 4096 },
            stream: { type: 'boolean', description: 'Enable streaming (experimental)', default: false }
          },
          required: ['prompt']
        }
      },
      {
        name: 'zai_models',
        description: 'List available Z.AI GLM models with capabilities',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'zai_health',
        description: 'Check Z.AI API health and connectivity',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  }));

  // Call tools
  server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'zai_chat') {
      const { prompt, model = 'glm-4', system, temperature = 0.7, max_tokens = 4096, stream = false } = args;

      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      try {
        if (stream) {
          let fullContent = '';
          await callGLMStream(model, messages, { temperature, max_tokens }, (chunk) => {
            fullContent += chunk;
          });
          return {
            content: [{ type: 'text', text: fullContent }],
            isError: false
          };
        } else {
          const response = await callGLM(model, messages, { temperature, max_tokens });
          return {
            content: [{ type: 'text', text: response.choices[0].message.content }],
            isError: false
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }

    if (name === 'zai_models') {
      const modelList = Object.entries(GLM_MODELS)
        .map(([id, info]) => `- **${id}** (${info.name}): ${info.description}\n  Context: ${info.context.toLocaleString()} tokens, Max output: ${info.maxOutput.toLocaleString()} tokens`)
        .join('\n');

      return {
        content: [{ type: 'text', text: `Available Z.AI GLM Models:\n\n${modelList}` }],
        isError: false
      };
    }

    if (name === 'zai_health') {
      try {
        const startTime = Date.now();
        const response = await callGLM('glm-4-flash', [{ role: 'user', content: 'Hi' }], { max_tokens: 10 });
        const latency = Date.now() - startTime;

        return {
          content: [{
            type: 'text',
            text: `Z.AI API Health Check:\n- Status: OK\n- Endpoint: ${GLM_BASE_URL}\n- Latency: ${latency}ms\n- Response: "${response.choices[0].message.content.substring(0, 50)}..."`
          }],
          isError: false
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Z.AI API Health Check:\n- Status: FAILED\n- Endpoint: ${GLM_BASE_URL}\n- Error: ${error.message}`
          }],
          isError: true
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  // Prompts
  server.setRequestHandler('prompts/list', async () => ({
    prompts: [{
      name: 'use_zai',
      description: 'Use Z.AI GLM model for a task',
      arguments: [{ name: 'task', description: 'The task to perform', required: true }]
    }]
  }));

  server.setRequestHandler('prompts/get', async (request) => {
    if (request.params.name === 'use_zai') {
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: `Use the Z.AI GLM model to: ${request.params.arguments.task}` }
        }]
      };
    }
    throw new Error(`Unknown prompt: ${request.params.name}`);
  });

  // Resources
  server.setRequestHandler('resources/list', async () => ({
    resources: [{
      uri: 'zai://config',
      name: 'Z.AI Configuration',
      description: 'Current Z.AI server configuration',
      mimeType: 'application/json'
    }]
  }));

  server.setRequestHandler('resources/read', async (request) => {
    if (request.params.uri === 'zai://config') {
      return {
        contents: [{
          uri: request.params.uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            endpoint: GLM_BASE_URL,
            fallbacks: FALLBACK_ENDPOINTS,
            models: GLM_MODELS,
            timeout: REQUEST_TIMEOUT,
            retries: RETRY_CONFIG
          }, null, 2)
        }]
      };
    }
    throw new Error(`Unknown resource: ${request.params.uri}`);
  });

  server.start();
}

main();

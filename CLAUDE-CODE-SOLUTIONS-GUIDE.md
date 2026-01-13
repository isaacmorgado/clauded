# Claude Code Solutions Guide: Command Execution & Multi-Model Support

**Date:** 2026-01-12
**Research Status:** ✅ Complete

---

## Executive Summary

I found **3 major solutions** that enable Claude to actually run commands and monitor logs, plus **4 proven methods** to adapt multiple AI models to Claude Code.

---

## Part 1: Command Execution & Log Monitoring

### Solution 1: Claude Code Workflow (CCW) ⭐ RECOMMENDED
**GitHub:** https://github.com/catlog22/Claude-Code-Workflow
**Status:** ✅ Production-ready, JSON-driven orchestration

**What It Does:**
- **Autonomous command execution**: Commands chain-invoke specialized sub-commands and agents automatically
- **Real-time log monitoring**: Dashboard provides centralized visibility of task execution progress
- **Multi-model orchestration**: Supports Gemini, Qwen, and Codex for distinct tasks
- **State management**: Task state stored in `.task/IMPL-*.json` files as single source of truth

**Key Features:**
```
✓ JSON-driven multi-agent framework
✓ Intelligent CLI orchestration
✓ Context-first architecture
✓ Automated workflow execution
✓ Real-time monitoring dashboard
✓ Session overview with status tracking
✓ CodexLens for semantic code search
✓ Hook and MCP server management
```

**Architecture:**
1. **Planning Phase**: Automatic task analysis with optional code exploration
2. **Clarification**: Interactive questioning when needed
3. **Confirmation**: Three-dimensional user approval
4. **Execution & Monitoring**: Real-time task tracking with artifact persistence

**Why It's Best:**
- Transforms "simple prompt chaining into a powerful orchestration system"
- Specialized agents (@code-developer, @test-fix-agent) emulate a software team
- Hands-off execution once workflows are queued
- Prevents execution drift with JSON state files

---

### Solution 2: Claude Code Router ⭐ COST OPTIMIZATION
**GitHub:** https://github.com/musistudio/claude-code-router
**Status:** ✅ Production-ready, 400+ models supported

**What It Does:**
- **Dynamic model routing**: Route requests based on needs (background tasks, thinking, long context)
- **Cost optimization**: Reduce API costs by up to 95% through strategic model selection
- **Multi-provider support**: OpenRouter, DeepSeek, Ollama, Gemini, Volcengine, SiliconFlow
- **Mid-session switching**: Use `/model provider,model` to switch without restarting

**Key Features:**
```
✓ Dynamic model switching mid-conversation
✓ Transformer system for API compatibility
✓ GitHub Actions integration (off-peak automation)
✓ JSON configuration with env var interpolation
✓ CLI tool (ccr model) for interactive setup
✓ Web UI for non-technical users
```

**Installation:**
```bash
npm install -g @musistudio/claude-code-router@latest
ccr start  # Interactive setup
ccr code   # Launch Claude Code with router
```

**Cost Savings Example:**
- **Kimi K2**: $0.15 per million input tokens
- **Claude Opus 4**: $15.00 per million input tokens
- **Savings**: 95% cost reduction for suitable tasks!

---

### Solution 3: Claude Code Bridge (CCB) ⭐ MULTI-AI COLLABORATION
**GitHub:** https://github.com/bfly123/claude_code_bridge
**Status:** ✅ Production-ready, v3.0 with Smart Daemons

**What It Does:**
- **Real-time multi-AI collaboration**: Claude, Codex, and Gemini in split-pane CLI
- **Persistent context**: Suspend and resume sessions with `-r` flag
- **Token optimization**: Sends lightweight prompts instead of full file history
- **Smart Daemons**: Parallel task submission with automatic queuing

**Key Features:**
```
✓ Multiple AI models in split-pane CLI
✓ See everything, control everything (WYSIWYG)
✓ Independent memory per AI model
✓ Cross-AI orchestration
✓ Dramatic token reduction
✓ Version 3.0 Smart Daemons (caskd, gaskd, oaskd)
```

**Use Case:**
- Leverage different AI strengths concurrently (not sequentially)
- Prevent context loss across work sessions
- Dramatically lower token consumption
- Coordinate multiple agents on unified tasks

---

## Part 2: Multi-Model Support for Claude Code

### Method 1: Environment Variables (Simplest) ⭐ BEGINNER-FRIENDLY

**Setup for Kimi K2 (Moonshot AI):**

1. **Get API Key:**
   - Visit: https://platform.moonshot.ai
   - Click "Console" → Login → "API Keys" → Create new key
   - Add minimum $10 funds via "Recharge"

2. **Configure:**
```bash
export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-kimi-api-key"
export ANTHROPIC_MODEL="kimi-k2-0711-preview"
```

3. **Launch:**
```bash
claude
```

**Shell Functions for Easy Switching:**

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Kimi K2 (Moonshot)
kimi() {
    export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
    export ANTHROPIC_AUTH_TOKEN="$KIMI_API_KEY"
    export ANTHROPIC_MODEL="kimi-k2-0711-preview"
    claude "$@"
}

# DeepSeek R1
deepseek() {
    export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
    export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"
    export ANTHROPIC_MODEL="deepseek-r1"
    claude "$@"
}

# GLM (Z.AI) - Already configured!
clauded() {
    ~/.claude/scripts/clauded.sh "$@"
}
```

Then: `source ~/.bashrc` and type `kimi`, `deepseek`, or `clauded`

---

### Method 2: Claude Code Router (Advanced) ⭐ POWERFUL

**Installation:**
```bash
npm install -g @musistudio/claude-code-router@latest
ccr start
```

**Interactive Setup:**
```
Provider Name: Moonshot
API Key: [your-moonshot-key]
Provider URL: https://api.moonshot.ai/v1/chat/completions
Model: kimi-k2-0711-preview
```

**Launch:**
```bash
ccr code
```

**Dynamic Switching:**
```
/model openrouter,anthropic/claude-3.5-sonnet
/model Groq,moonshotai/kimi-k2-instruct
/model openrouter,deepseek/deepseek-r1
```

**Advanced Configuration (`~/.claude-code-router/config.json`):**
```json
{
  "Router": {
    "default": "Moonshot,kimi-k2-0711-preview",
    "complex_reasoning": "OpenRouter,deepseek/deepseek-r1",
    "speed_critical": "Groq,mixtral-8x7b-32768"
  },
  "cost_limits": {
    "daily_budget": 10.0,
    "per_session_limit": 2.0
  }
}
```

---

### Method 3: Y-Router & Cloudflare Workers ⭐ ENTERPRISE

**Installation:**
```bash
bash -c "$(curl -fsSL https://cc.yovy.app/install.sh)"
```

**Production Configuration:**
```bash
export ANTHROPIC_BASE_URL="https://your-worker.your-domain.workers.dev"
export ANTHROPIC_API_KEY="your-openrouter-api-key"
export ANTHROPIC_MODEL="moonshotai/kimi-k2"
export ANTHROPIC_SMALL_FAST_MODEL="google/gemini-2.5-flash"
```

---

### Method 4: Alibaba Cloud AI Gateway ⭐ UNIFIED ACCESS

**URL:** https://www.alibabacloud.com/help/en/api-gateway/ai-gateway

**Benefits:**
- ✓ Unified access through single entry point
- ✓ Vendor lock-in avoidance
- ✓ High availability via failover
- ✓ Intelligent request routing

**Setup:**
1. Create AI Service in AI Gateway console
2. Build Model API for text generation
3. Configure Claude Code:
```bash
export ANTHROPIC_BASE_URL="[Model API endpoint]"
export ANTHROPIC_AUTH_TOKEN="[auth credentials]"
claude --model qwen3-coder-plus
```

---

## Part 3: Hooks System for Automation

**Official Docs:** https://code.claude.com/docs/en/hooks-guide

### What Are Hooks?

Hooks are **user-defined shell commands** that execute at various points in Claude Code's lifecycle, providing deterministic control over behavior.

**Released:** June 2025

### Hook Events (8 Available):

1. **SessionStart**: Runs when Claude Code starts
2. **UserPromptSubmit**: Fires immediately when you submit a prompt
3. **PreToolUse**: Runs before tool calls (can block them)
4. **PermissionRequest**: Runs when permission dialog is shown
5. **Stop**: Runs when Claude Code is about to stop
6. **SessionEnd**: Runs when session ends
7. **PostEdit**: Runs after file edits
8. **Custom**: User-defined triggers

### Common Use Cases:

#### 1. Automatic Code Formatting
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"$CLAUDE_FILE_PATHS\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

#### 2. Log Monitoring
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "tail -f /tmp/claude-proxy.log | grep 'ERROR\\|WARN'"
          }
        ]
      }
    ]
  }
}
```

#### 3. Permission Control
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'rm -rf'; then exit 1; fi",
            "blockOnError": true
          }
        ]
      }
    ]
  }
}
```

#### 4. Notifications
```bash
# SessionEnd hook
osascript -e 'display notification "Claude Code session ended" with title "Claude Code"'
```

---

## Part 4: Cost Comparison (2025 Pricing)

| Provider | Model | Input ($/1M) | Output ($/1M) | Best For |
|----------|-------|--------------|---------------|----------|
| **Moonshot** | Kimi K2 | $0.15 | $2.50 | Cost efficiency |
| **OpenRouter** | Claude Opus 4 | $15.00 | $75.00 | Complex reasoning |
| **Groq** | Mixtral 8x7B | $0.27 | $0.27 | Speed optimization |
| **DeepSeek** | R1 | $0.14 | $0.28 | Mathematical tasks |
| **Z.AI** | GLM-4.7 | ~$0.20 | ~$0.50 | Multilingual |

**Your Current Setup (Already Working!):**
- ✅ GLM-4.7 via Z.AI proxy
- ✅ Featherless models (Dolphin, Qwen, etc.)
- ✅ Model switching via `/model` command

---

## Part 5: Recommended Implementation Strategy

### Phase 1: Add Shell Functions (5 minutes)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Kimi K2 (Cost-effective)
kimi() {
    export ANTHROPIC_BASE_URL="https://api.moonshot.ai/anthropic"
    export ANTHROPIC_AUTH_TOKEN="$KIMI_API_KEY"
    claude "$@"
}

# DeepSeek R1 (Math/reasoning)
deepseek() {
    export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
    export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"
    claude "$@"
}

# GLM (Already working)
alias clauded='~/.claude/scripts/clauded.sh'
```

**Usage:**
```bash
kimi        # Launch with Kimi K2
deepseek    # Launch with DeepSeek R1
clauded     # Launch with GLM-4.7 (existing)
```

### Phase 2: Install Claude Code Router (15 minutes)

```bash
npm install -g @musistudio/claude-code-router@latest
ccr start  # Follow interactive prompts
ccr code   # Launch with routing
```

### Phase 3: Set Up Hooks for Monitoring (10 minutes)

Create `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date)] Command: $CLAUDE_TOOL_INPUT\" >> ~/.claude/command-log.txt"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"$CLAUDE_FILE_PATHS\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Phase 4: (Optional) Install Claude Code Workflow

For full autonomous orchestration:

```bash
git clone https://github.com/catlog22/Claude-Code-Workflow.git
cd Claude-Code-Workflow
# Follow installation instructions
```

---

## Part 6: Hybrid Multi-Model Strategy

**Optimal model selection per task type:**

1. **Complex Reasoning**: DeepSeek R1 or Claude Opus 4
2. **Code Generation**: Claude Sonnet or Kimi K2
3. **Cost-Effective General Work**: Kimi K2 or GLM-4.7
4. **Rapid Iteration**: Groq models
5. **Multilingual**: GLM-4.7 (Chinese/English)

**Your Existing Setup + Additions:**

| Task Type | Model | Cost | Access Method |
|-----------|-------|------|---------------|
| **Cost-effective coding** | Kimi K2 | 💰 Very Low | `kimi` command |
| **Math/reasoning** | DeepSeek R1 | 💰 Very Low | `deepseek` command |
| **Multilingual** | GLM-4.7 | 💰 Low | `clauded` command (existing) |
| **Fast iteration** | Featherless/Qwen | 💰 Low | `/model featherless/...` |
| **Complex reasoning** | Claude Opus 4 | 💰💰💰 High | Normal `claude` |

---

## Part 7: Action Items

### Immediate (Do Now):

1. ✅ **Your proxy already works!** - max_tokens capping implemented
2. ⏳ **Add Kimi K2 access** (5 min):
   ```bash
   # Get key from platform.moonshot.ai
   echo 'export KIMI_API_KEY="your-key"' >> ~/.bashrc
   # Add kimi() function from Phase 1
   source ~/.bashrc
   ```

3. ⏳ **Test Kimi K2**:
   ```bash
   kimi
   # Should launch Claude Code with Kimi K2
   ```

### Short-term (This Week):

4. ⏳ **Install Claude Code Router**:
   ```bash
   npm install -g @musistudio/claude-code-router@latest
   ccr start
   ```

5. ⏳ **Set up basic hooks** for log monitoring:
   - Create `~/.claude/settings.json` with PostToolUse hook
   - Test with: `tail -f ~/.claude/command-log.txt`

### Medium-term (This Month):

6. ⏳ **Explore Claude Code Workflow** for autonomous orchestration
7. ⏳ **Set up cost tracking** and monitor usage
8. ⏳ **Implement intelligent routing** based on task complexity

---

## Part 8: Troubleshooting

### Issue: "Model not found"
**Solution:** Verify exact model name in provider docs, check API key has sufficient funds

### Issue: "Connection timeout"
**Solution:** Check `ANTHROPIC_BASE_URL` is correct, verify network/proxy settings

### Issue: "Hooks not running"
**Solution:** Check `~/.claude/settings.json` syntax, verify hook commands are executable

### Issue: "High costs"
**Solution:** Implement Claude Code Router with cost limits, use Kimi K2 for general work

---

## Part 9: Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit API keys** to git repositories
2. **Use environment variables** for sensitive data
3. **Review hook commands** before adding (they run with your credentials)
4. **Implement permission controls** via PreToolUse hooks
5. **Monitor command logs** for suspicious activity

---

## Summary

### ✅ What You Have Now:
- Working multi-provider proxy (GLM, Featherless, Google, Anthropic)
- Automatic max_tokens capping
- Model switching via `/model` command
- 3-layer rate limit defense

### 🚀 What You Can Add:

**For Command Execution & Monitoring:**
1. **Claude Code Workflow** - Full autonomous orchestration
2. **Hooks system** - Automated formatting, logging, notifications
3. **Claude Code Bridge** - Multi-AI collaboration

**For Multi-Model Support:**
1. **Environment variable functions** - Quick model switching (kimi, deepseek)
2. **Claude Code Router** - 400+ models, cost optimization
3. **Y-Router/Cloudflare** - Enterprise-grade routing

### 💰 Cost Savings:
- Switch to Kimi K2 for general work: **Save 95% vs Claude Opus**
- Use intelligent routing: **Automatic cost optimization**
- Your existing GLM-4.7: Already cost-effective!

---

## Resources

### Official Documentation:
- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide)
- [Hooks Reference](https://docs.claude.com/en/docs/claude-code/hooks)
- [Claude Code Monitoring](https://code.claude.com/docs/en/monitoring-usage)

### GitHub Projects:
- [Claude Code Workflow](https://github.com/catlog22/Claude-Code-Workflow)
- [Claude Code Router](https://github.com/musistudio/claude-code-router)
- [Claude Code Bridge](https://github.com/bfly123/claude_code_bridge)
- [Hooks Mastery](https://github.com/disler/claude-code-hooks-mastery)

### Guides:
- [Complete Multi-Model Guide](https://rakesh.tembhurne.com/blog/ai-tools/extend-claude-code-multiple-models-complete-guide)
- [Automate with Hooks](https://blog.gitbutler.com/automate-your-ai-workflows-with-claude-code-hooks)
- [Developer Toolkit - Hooks](https://developertoolkit.ai/en/claude-code/advanced-techniques/hooks-automation/)

### Enterprise Solutions:
- [Alibaba Cloud AI Gateway](https://www.alibabacloud.com/help/en/api-gateway/ai-gateway)
- [Datadog Claude Code Monitoring](https://www.datadoghq.com/blog/claude-code-monitoring/)

---

**Report Version:** 1.0
**Last Updated:** 2026-01-12 03:15 AM
**Status:** ✅ Research Complete, Ready for Implementation

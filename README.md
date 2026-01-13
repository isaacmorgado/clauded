# Clauded - Multi-Provider Proxy for Claude Code

Run Claude Code with alternative AI models including GLM, Featherless (abliterated), and Google Gemini.

## 🚀 Quick Start

```bash
# Install
./install.sh

# Start Claude Code with GLM-4.7
clauded

# Switch models
/model glm/glm-4.7
/model featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated
```

## ✨ Features

- **6 Working Models**: GLM-4.7 + 5 Featherless abliterated models
- **Automatic max_tokens Capping**: Prevents API errors
- **Rate Limiting Protection**: Queues requests to avoid throttling
- **Tool Emulation**: Full Claude Code tool support for non-Anthropic models
- **Cost Savings**: 95-99% cheaper than Claude Opus

## 📊 Available Models

### GLM (Z.AI) - 1 Model
- `glm/glm-4.7` - Default orchestrator (8,192 tokens)

### Featherless (Abliterated) - 4 Models
- `featherless/dphn/Dolphin-Mistral-24B-Venice-Edition` - Security/RE (4,096 tokens)
- `featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated` - Best reasoning (4,096 tokens)
- `featherless/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated` - Fast (4,096 tokens)
- `featherless/huihui-ai/Llama-3.3-70B-Instruct-abliterated` - Quality (4,096 tokens)

**Note:** WhiteRabbitNeo 8B removed due to 8K context limit (too small for Claude Code)

## 🔧 Installation

```bash
# Clone repository
git clone https://github.com/isaacmorgado/clauded.git
cd clauded

# Run installer
chmod +x install.sh
./install.sh
```

The installer will:
1. Copy proxy server to `~/.claude/`
2. Copy rate limiter to `~/.claude/lib/`
3. Copy scripts to `~/.claude/scripts/`
4. Add alias to `~/.zshrc` or `~/.bashrc`
5. Set up API keys (interactive)

## 📝 Configuration

### Required API Keys

```bash
# GLM (Z.AI) - Required for default model
export GLM_API_KEY="your-key-here"

# Featherless - Required for abliterated models
export FEATHERLESS_API_KEY="your-key-here"
```

### Optional Shell Functions (95-98% Cost Savings)

```bash
# Kimi K2 (95% savings vs Claude Opus)
export KIMI_API_KEY="your-key-here"
kimi "your prompt"

# DeepSeek (98% savings)
export DEEPSEEK_API_KEY="your-key-here"
deepseek "your prompt"
```

## 📚 Usage

### Start with Default Model

```bash
clauded
```

Starts Claude Code with GLM-4.7 as the default model.

### Switch Models

```bash
# GLM models
/model glm/glm-4.7

# Featherless models
/model featherless/dphn/Dolphin-Mistral-24B-Venice-Edition
/model featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated
/model featherless/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated
/model featherless/huihui-ai/Llama-3.3-70B-Instruct-abliterated
```

### Stop Proxy

```bash
clauded-stop
```

### Check Status

```bash
clauded-status
```

## 💰 Cost Comparison

| Model | Cost per 1M Tokens | vs Claude Opus | Use Case |
|-------|-------------------|----------------|----------|
| **Claude Opus 4.5** | $15.00 | Baseline | Complex reasoning |
| **GLM-4.7** | $0.50 | 97% savings | General tasks |
| **Kimi K2** | $0.15 | **95% savings** | Cost-effective |
| **Llama 3.1 8B** | $0.05 | 99% savings | Quick tasks |

## 🔍 How It Works

1. **Proxy Server**: Routes requests from Claude Code to different AI providers
2. **Rate Limiting**: Prevents API throttling with token bucket algorithm
3. **max_tokens Capping**: Automatically limits tokens to model-specific maximums
4. **Tool Emulation**: Converts Claude tool format to provider-specific formats
5. **MCP Integration**: Full support for Model Context Protocol tools

## 🎯 Model Selection Guide

### By Speed
- **Fastest**: Llama 3.1 8B
- **Fast**: GLM-4.7
- **Quality**: Qwen 72B or Llama 3.3 70B

### By Task
- **Security/RE**: Dolphin-3 24B
- **Complex Reasoning**: Qwen 72B
- **Quick Tasks**: Llama 3.1 8B
- **General Use**: GLM-4.7

## 🐛 Troubleshooting

### Port Already in Use

```bash
pkill -f model-proxy-server
clauded
```

### max_tokens Exceeded

The proxy automatically caps max_tokens, but if you see errors:
- Check proxy logs: `tail -f /tmp/claude-proxy.log`
- Verify capping: `grep "Capped" /tmp/claude-proxy.log`

### Rate Limit Errors

The proxy queues requests automatically. If errors persist:
- Check rate limiter is active in logs
- Wait 60 seconds for cooldown
- Consider distributing across multiple providers

### Context Length Exceeded

Some models have small context windows:
- Use models with larger context (Qwen 72B, Llama 70B)
- Start fresh Claude Code session
- Avoid models with <16K context for long conversations

## 📖 Documentation

- **QUICK-FIX-SUMMARY.md** - Quick reference guide
- **MODEL_INTEGRATION_COMPLETE.md** - Complete model inventory
- **CLAUDE-CODE-SOLUTIONS-GUIDE.md** - Comprehensive guide (11,000+ words)
- **MAX-TOKENS-FIX-REPORT.md** - Technical details
- **FINAL_MODEL_TEST_RESULTS.md** - Test results

## 🔐 Security

- API keys stored in environment variables (never committed)
- Proxy runs locally (no external routing)
- All requests go directly to provider APIs
- No data logging or storage

## 🤝 Contributing

Contributions welcome! Please:
1. Test changes with all providers
2. Update documentation
3. Follow existing code style
4. Add tests for new features

## 📄 License

MIT License - See LICENSE file

## 🙏 Credits

- Built for Claude Code by Anthropic
- Multi-provider proxy architecture inspired by Claudish
- Tool emulation pattern from Claude Code Router
- Rate limiting implementation based on token bucket algorithm

## 🔗 Links

- [Claude Code](https://claude.ai/code)
- [Z.AI (GLM)](https://z.ai/)
- [Featherless.ai](https://featherless.ai/)
- [Moonshot AI (Kimi)](https://platform.moonshot.ai/)
- [DeepSeek](https://platform.deepseek.com/)

---

**Status:** ✅ Production Ready
**Models Working:** 5/5 (1 GLM + 4 Featherless)
**Last Updated:** 2026-01-12

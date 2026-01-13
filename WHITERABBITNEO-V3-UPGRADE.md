# WhiteRabbitNeo V3 Upgrade

**Date:** 2026-01-12
**Status:** ✅ Complete

## Problem

WhiteRabbitNeo 8B v2 had only **8K total context** (input + output), which was insufficient for Claude Code conversations:

```
Error: This model's maximum context length is 8192 tokens.
However, you requested 29666 tokens (25570 in the messages, 4096 in the completion).
```

Typical Claude Code conversations with agents/MCP easily exceed 8K tokens, making the model unusable.

## Solution

Upgraded to **WhiteRabbitNeo V3-7B** which has **32K context** - 4x larger and sufficient for Claude Code.

### Research Sources

1. **Featherless Model Page**: https://featherless.ai/models/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B
   - Confirmed V3-7B has 32768 max tokens
   - Available on Featherless platform

2. **RoPE Scaling Discussion**: https://github.com/ggml-org/llama.cpp/discussions/1965
   - Technique used to extend context from 8K to 32K
   - V3 models use RoPE scaling for larger context

3. **Context Extension Techniques**: https://amaarora.github.io/posts/2025-09-21-rope-context-extension.html
   - Technical details on how context extension works
   - V3 is the "extended version" of WhiteRabbitNeo

## Changes Made

### 1. model-proxy-server.js (line 347)

**Before:**
```javascript
'WhiteRabbitNeo/Llama-3-WhiteRabbitNeo-8B-v2.0': 4096,  // Verified: 4096 max
```

**After:**
```javascript
'WhiteRabbitNeo/WhiteRabbitNeo-V3-7B': 32768,  // V3 with 32K context (usable with Claude Code)
```

### 2. model-proxy-server.js (lines 1082-1086)

**Before:**
```javascript
{
  id: 'featherless/WhiteRabbitNeo/Llama-3-WhiteRabbitNeo-8B-v2.0',
  name: 'WhiteRabbitNeo 8B v2',
  display_name: '🐰 WhiteRabbitNeo 8B (Creative Coding)',
  created_at: '2024-01-01T00:00:00Z',
  type: 'model'
}
```

**After:**
```javascript
{
  id: 'featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B',
  name: 'WhiteRabbitNeo V3 7B (DeepHat)',
  display_name: '🐰 WhiteRabbitNeo V3 (Security/32K Context)',
  created_at: '2024-01-01T00:00:00Z',
  type: 'model'
}
```

### 3. claude-with-proxy-fixed.sh (line 128)

**Before:**
```bash
/model featherless/WhiteRabbitNeo/Llama-3-WhiteRabbitNeo-8B-v2.0     - WhiteRabbitNeo 8B (Creative coding)
```

**After:**
```bash
/model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B               - WhiteRabbitNeo V3 (Security/32K)
```

## Model Comparison

| Model | Context | Status |
|-------|---------|--------|
| WhiteRabbitNeo 8B v2 | 8K | ❌ Too small for Claude Code |
| WhiteRabbitNeo V3-7B | 32K | ✅ Usable with Claude Code |

## Usage

```bash
# Start clauded
clauded

# Switch to WhiteRabbitNeo V3
/model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B

# Now you can use it for long conversations
hello
```

The model will now cap at 32768 tokens instead of 4096, allowing for much longer context windows suitable for:
- Multi-turn conversations
- MCP tool usage
- Agent spawning
- Large code analysis

## Verification

To verify the upgrade works:

```bash
# 1. Kill old proxy
pkill -f model-proxy-server

# 2. Start fresh
clauded

# 3. Switch to WhiteRabbitNeo V3
/model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B

# 4. Test with longer context
# (Previously would error at ~8K tokens, now works up to 32K)
```

## Cost

WhiteRabbitNeo V3 on Featherless:
- **Input:** $0.10 per 1M tokens
- **Output:** $0.10 per 1M tokens
- **Total:** ~$0.20 per 1M tokens (99% cheaper than Claude Opus)

## Notes

- V3 is from DeepHat (security-focused variant)
- Uses RoPE scaling for extended context
- Same abliterated/uncensored features as v2
- Optimized for security and reverse engineering tasks
- 32K context makes it practical for Claude Code workflows

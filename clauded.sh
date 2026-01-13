#!/bin/bash
# Clauded - Claude Code with GLM-4.7 via Proxy
# Usage: clauded [any claude arguments]
# This wrapper automatically uses GLM-4.7 through the proxy server

# Auto-start proxy if not running
if ! ps aux | grep -q "[m]odel-proxy-server.js"; then
    node ~/.claude/model-proxy-server.js 3000 > /tmp/claude-proxy.log 2>&1 &
    sleep 1
fi

# Use GLM-4.7 by default, or override with --model flag
MODEL="glm/glm-4.7"

# Check if user specified a different model
for arg in "$@"; do
    if [[ "$arg" == "--model="* ]]; then
        MODEL="${arg#--model=}"
    fi
    # Handle --model as separate argument
    if [[ "$prev_arg" == "--model" ]]; then
        MODEL="$arg"
    fi
    prev_arg="$arg"
done

# Start Claude with proxy and GLM model
ANTHROPIC_BASE_URL=http://127.0.0.1:3000 claude --dangerously-skip-permissions --model "$MODEL" "$@"

#!/bin/bash
# Claude Code Multi-Provider Proxy - Fixed Authentication
# Based on claudish approach: uses placeholder key

set -e

CLAUDE_DIR="${HOME}/.claude"
PROXY_SERVER="${CLAUDE_DIR}/model-proxy-server.js"
PROXY_PORT="${CLAUDISH_PORT:-3000}"
PROXY_PID_FILE="${CLAUDE_DIR}/.proxy.pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Claudish approach: Use placeholder to prevent auth dialog
# This allows Claude Code to start, but we route to other providers
PLACEHOLDER_KEY="sk-ant-api03-proxy-placeholder"

check_proxy_running() {
    # First check if PID file exists and process is running
    if [ -f "$PROXY_PID_FILE" ]; then
        local pid=$(cat "$PROXY_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PROXY_PID_FILE"
        fi
    fi

    # Check if port is already in use (proxy running without PID file)
    if lsof -i :${PROXY_PORT} > /dev/null 2>&1; then
        # Port is in use, create PID file for running process
        local pid=$(lsof -t -i :${PROXY_PORT} | head -1)
        if [ -n "$pid" ]; then
            echo "$pid" > "$PROXY_PID_FILE"
            return 0
        fi
    fi

    return 1
}

start_proxy() {
    echo -e "${BLUE}Starting multi-provider proxy...${NC}"

    if ! [ -f "$PROXY_SERVER" ]; then
        echo -e "${RED}Error: Proxy server not found${NC}"
        exit 1
    fi

    node "$PROXY_SERVER" "$PROXY_PORT" > "${CLAUDE_DIR}/proxy.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$PROXY_PID_FILE"

    sleep 2

    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Proxy started on port ${PROXY_PORT}${NC}"
        return 0
    else
        echo -e "${RED}✗ Proxy failed to start${NC}"
        cat "${CLAUDE_DIR}/proxy.log" | tail -20
        rm -f "$PROXY_PID_FILE"
        exit 1
    fi
}

stop_proxy() {
    if [ -f "$PROXY_PID_FILE" ]; then
        local pid=$(cat "$PROXY_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            kill "$pid" 2>/dev/null || true
            sleep 1
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$PROXY_PID_FILE"
    fi
}

cleanup() {
    echo ""
    echo -e "${YELLOW}Stopping proxy...${NC}"
    stop_proxy
}

main() {
    # Only set cleanup trap when running main (not for status/stop commands)
    trap cleanup EXIT INT TERM

    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}SYSTEM IDENTITY: ${NC}${RED}ˋ${NC}${YELLOW}𝐂𝐋𝐀𝐔𝐃𝐄${NC}${RED}ˊ${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}// INITIALIZING CUSTOM PARAMETERS...${NC}"
    echo -e "${GREEN}// ACCESS GRANTED.${NC}"
    echo ""
    echo -e "  ${YELLOW}GLM · Featherless · Google · Anthropic${NC}"
    echo ""

    # Check providers
    echo -e "${BLUE}Provider Status:${NC}"
    echo -e "  ${GREEN}✓${NC} GLM          - Ready"
    echo -e "  ${GREEN}✓${NC} Featherless - Ready"
    [ -n "$GOOGLE_API_KEY" ] && echo -e "  ${GREEN}✓${NC} Google       - Ready" || echo -e "  ${YELLOW}⚠${NC} Google       - Need GOOGLE_API_KEY"

    if [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "$PLACEHOLDER_KEY" ]; then
        echo -e "  ${GREEN}✓${NC} Anthropic    - Ready (your API key)"
    else
        echo -e "  ${YELLOW}⚠${NC} Anthropic    - Use your real API key or default Claude"
    fi
    echo ""

    # Note about Anthropic
    echo -e "${YELLOW}Note:${NC} For Anthropic models, you have two options:"
    echo -e "  1. Set ${GREEN}ANTHROPIC_API_KEY${NC} (your real API key)"
    echo -e "  2. Use Claude Code normally without proxy for Anthropic"
    echo ""

    if check_proxy_running; then
        echo -e "${YELLOW}Proxy already running (PID: $(cat $PROXY_PID_FILE))${NC}"
    else
        start_proxy
    fi

    echo ""
    echo -e "${BLUE}Available Models:${NC}"
    echo ""
    echo -e "  ${GREEN}GLM (ZhipuAI):${NC}"
    echo -e "    ${YELLOW}/model glm/glm-4.7${NC}                                  - GLM-4.7 (Default, Orchestrator)"
    echo -e "    ${YELLOW}/model glm/glm-4${NC}                                    - GLM-4 (Free tier, needs credits)"
    echo -e "    ${YELLOW}/model glm/glm-4-air${NC}                                - GLM-4 Air (Balanced, needs credits)"
    echo ""
    echo -e "  ${GREEN}Featherless (Uncensored/Abliterated):${NC}"
    echo -e "    ${YELLOW}/model featherless/dphn/Dolphin-Mistral-24B-Venice-Edition${NC}           - Dolphin-3 (Security/RE)"
    echo -e "    ${YELLOW}/model featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated${NC}        - Qwen 2.5 72B (Best reasoning)"
    echo -e "    ${YELLOW}/model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B${NC}     - WhiteRabbitNeo V3 7B (Cybersecurity)"
    echo -e "    ${YELLOW}/model featherless/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated${NC}   - Llama 3.1 8B (Fast)"
    echo -e "    ${YELLOW}/model featherless/huihui-ai/Llama-3.3-70B-Instruct-abliterated${NC}      - Llama 3.3 70B (Quality)"
    echo ""
    echo -e "  ${GREEN}Google:${NC}"
    echo -e "    ${YELLOW}/model google/gemini-pro${NC}                            - Gemini Pro"
    echo -e "    ${YELLOW}/model google/gemini-2.0-flash${NC}                      - Gemini 2.0 Flash"
    [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "$PLACEHOLDER_KEY" ] && {
        echo ""
        echo -e "  ${GREEN}Anthropic:${NC}"
        echo -e "    ${YELLOW}/model claude-sonnet-4-5${NC}                         - Claude Sonnet 4.5"
    }
    echo ""

    # Default to GLM-4.7 model
    DEFAULT_MODEL="glm/glm-4.7"

    echo ""
    echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}  ${GREEN}Active Model:${NC} ${YELLOW}${DEFAULT_MODEL}${NC}                              ${MAGENTA}║${NC}"
    echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Start with placeholder to prevent auth dialog, but use real key if provided
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        # User has set their own key
        ANTHROPIC_BASE_URL="http://127.0.0.1:${PROXY_PORT}" claude --model "$DEFAULT_MODEL" "$@"
    else
        # Use placeholder (Anthropic models won't work, but Claude Code will start)
        ANTHROPIC_API_KEY="$PLACEHOLDER_KEY" ANTHROPIC_BASE_URL="http://127.0.0.1:${PROXY_PORT}" claude --model "$DEFAULT_MODEL" "$@"
    fi
}

case "${1:-}" in
    stop)
        stop_proxy
        exit 0
        ;;
    status)
        if check_proxy_running; then
            echo -e "${GREEN}✓ Proxy running (PID: $(cat $PROXY_PID_FILE))${NC}"
        else
            echo -e "${RED}✗ Proxy not running${NC}"
        fi
        exit 0
        ;;
    gemini)
        # Launch gemini-cli with remaining arguments
        shift
        echo -e "${BLUE}Launching Gemini CLI...${NC}"
        if command -v gemini &> /dev/null; then
            gemini "$@"
        else
            echo -e "${RED}Gemini CLI not found. Install with: brew install gemini-cli${NC}"
            exit 1
        fi
        exit 0
        ;;
    help|--help|-h)
        cat <<EOF
${MAGENTA}CLAUDE${NC} ${RED}Multi-Provider Proxy${NC}

${GREEN}Usage:${NC}
  $0 [command]

${GREEN}Commands:${NC}
  (none)   Start with GLM-4.7 (default)
  gemini   Launch Gemini CLI (google-gemini/gemini-cli)
  stop     Stop proxy server
  status   Check proxy status
  help     Show this help

${GREEN}Authentication:${NC}
  ${YELLOW}For Anthropic models:${NC} Set ANTHROPIC_API_KEY (your real key)
  ${YELLOW}For GLM/Featherless:${NC} Already configured
  ${YELLOW}For Google:${NC} Set GOOGLE_API_KEY

${GREEN}Examples:${NC}
  # Use with Anthropic key
  export ANTHROPIC_API_KEY="sk-ant-your-key"
  $0

  # Use without Anthropic (GLM/Featherless only)
  $0
  /model glm/glm-4

${GREEN}Model Switching:${NC}
  GLM:
    /model glm/glm-4.7       (default, working)
    /model glm/glm-4         (needs credits)
    /model glm/glm-4-air     (needs credits)

  Featherless (Uncensored):
    /model featherless/dphn/Dolphin-Mistral-24B-Venice-Edition
    /model featherless/huihui-ai/Qwen2.5-72B-Instruct-abliterated
    /model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B
    /model featherless/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated
    /model featherless/huihui-ai/Llama-3.3-70B-Instruct-abliterated

  Google:
    /model google/gemini-pro
    /model google/gemini-2.0-flash

  Anthropic:
    /model claude-sonnet-4-5  # if ANTHROPIC_API_KEY set

EOF
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac

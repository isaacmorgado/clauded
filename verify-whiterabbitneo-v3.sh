#!/bin/bash
# Verification script for WhiteRabbitNeo V3 integration

echo "🔍 Verifying WhiteRabbitNeo V3 Integration..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check MODEL_LIMITS has V3-7B with 32768
echo "Test 1: Checking MODEL_LIMITS..."
if grep -q "'WhiteRabbitNeo/WhiteRabbitNeo-V3-7B': 32768" model-proxy-server.js; then
    echo -e "${GREEN}✓${NC} MODEL_LIMITS correctly set to 32768 for V3-7B"
else
    echo -e "${RED}✗${NC} MODEL_LIMITS not found or incorrect"
    exit 1
fi

# Test 2: Check model list has V3-7B entry
echo "Test 2: Checking models list..."
if grep -q "id: 'featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B'" model-proxy-server.js; then
    echo -e "${GREEN}✓${NC} Model list contains WhiteRabbitNeo V3-7B"
else
    echo -e "${RED}✗${NC} Model entry not found in models list"
    exit 1
fi

# Test 3: Check display name is correct
echo "Test 3: Checking display name..."
if grep -q "display_name: '🐰 WhiteRabbitNeo V3 (Security/32K Context)'" model-proxy-server.js; then
    echo -e "${GREEN}✓${NC} Display name is correct"
else
    echo -e "${RED}✗${NC} Display name not found or incorrect"
    exit 1
fi

# Test 4: Check startup script has V3-7B
echo "Test 4: Checking startup script..."
if grep -q "WhiteRabbitNeo/WhiteRabbitNeo-V3-7B" claude-with-proxy-fixed.sh; then
    echo -e "${GREEN}✓${NC} Startup script updated to V3-7B"
else
    echo -e "${RED}✗${NC} Startup script not updated"
    exit 1
fi

# Test 5: Check README mentions V3
echo "Test 5: Checking README..."
if grep -q "WhiteRabbitNeo/WhiteRabbitNeo-V3-7B" README.md; then
    echo -e "${GREEN}✓${NC} README updated with V3-7B"
else
    echo -e "${RED}✗${NC} README not updated"
    exit 1
fi

# Test 6: Check that old 8B v2 is NOT in code
echo "Test 6: Verifying old model removed..."
if grep -q "Llama-3-WhiteRabbitNeo-8B-v2.0" model-proxy-server.js; then
    echo -e "${RED}✗${NC} Old 8B v2 model still in code"
    exit 1
else
    echo -e "${GREEN}✓${NC} Old 8B v2 model removed"
fi

# Test 7: Check upgrade documentation exists
echo "Test 7: Checking upgrade documentation..."
if [ -f "WHITERABBITNEO-V3-UPGRADE.md" ]; then
    echo -e "${GREEN}✓${NC} Upgrade documentation exists"
else
    echo -e "${RED}✗${NC} Upgrade documentation not found"
    exit 1
fi

# Test 8: Check model count is 6
echo "Test 8: Verifying model count..."
if grep -q "6/6 (1 GLM + 5 Featherless)" README.md; then
    echo -e "${GREEN}✓${NC} Model count updated to 6"
else
    echo -e "${RED}✗${NC} Model count not updated"
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ All 8 verification tests passed!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "WhiteRabbitNeo V3-7B integration complete!"
echo ""
echo "To test the model:"
echo "  1. Run: clauded"
echo "  2. Execute: /model featherless/WhiteRabbitNeo/WhiteRabbitNeo-V3-7B"
echo "  3. Test with a message (should now support up to 32K tokens)"
echo ""
echo "Context comparison:"
echo "  - Old 8B v2: 8,192 tokens (insufficient for Claude Code)"
echo "  - New V3-7B: 32,768 tokens (4x larger, usable)"

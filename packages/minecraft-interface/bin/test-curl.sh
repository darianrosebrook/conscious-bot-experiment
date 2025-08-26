#!/bin/bash

# Bot Action Tester - Curl Commands
# Quick command-line testing of bot actions using curl
#
# @author @darianrosebrook

# Check if --quick flag is provided
if [[ "$1" == "--quick" ]]; then
    BASE_URL="http://localhost:3005"
    echo "🤖 Bot Action Tester - Quick Test"
    echo "Target: $BASE_URL"
    echo ""
    
    # Check if bot is connected
    echo "📡 Checking bot connection..."
    curl -s "$BASE_URL/status" | jq '.connected' 2>/dev/null || echo "❌ Cannot connect to bot server"
    echo ""
    
    # Run quick tests
    echo "🚀 Running quick test..."
    echo "Testing move forward..."
    curl -s -X POST "$BASE_URL/action" -H 'Content-Type: application/json' -d '{"type":"move_forward","parameters":{"distance":1}}' | jq '.'
    
    echo "Testing chat..."
    curl -s -X POST "$BASE_URL/action" -H 'Content-Type: application/json' -d '{"type":"chat","parameters":{"message":"Quick test!"}}' | jq '.'
    
    echo "Testing jump..."
    curl -s -X POST "$BASE_URL/action" -H 'Content-Type: application/json' -d '{"type":"jump","parameters":{}}' | jq '.'
    
    echo "✅ Quick test completed!"
    exit 0
fi

BASE_URL=${1:-"http://localhost:3005"}

echo "🤖 Bot Action Tester - Curl Commands"
echo "Target: $BASE_URL"
echo ""

# Check if bot is connected
echo "📡 Checking bot connection..."
curl -s "$BASE_URL/state" | jq '.success' 2>/dev/null || echo "❌ Cannot connect to bot server"

echo ""
echo "Available test commands:"
echo ""

# Movement tests
echo "🚶 Movement Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"move_forward\",\"parameters\":{\"distance\":3}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"turn_left\",\"parameters\":{}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"turn_right\",\"parameters\":{}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"jump\",\"parameters\":{}}'"
echo ""

# Mining tests
echo "⛏️ Mining Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"mine_block\",\"parameters\":{\"position\":\"current\",\"blockType\":\"dirt\"}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"dig_blocks\",\"parameters\":{\"position\":\"current\",\"tool\":\"hand\"}}'"
echo ""

# Building tests
echo "🏗️ Building Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"place_block\",\"parameters\":{\"block_type\":\"dirt\",\"count\":1,\"placement\":\"around_player\"}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"place_block\",\"parameters\":{\"block_type\":\"torch\",\"count\":1,\"placement\":\"around_player\"}}'"
echo ""

# Crafting tests
echo "🔨 Crafting Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"craft_item\",\"parameters\":{\"item\":\"stick\",\"quantity\":4}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"craft_item\",\"parameters\":{\"item\":\"wooden_pickaxe\",\"quantity\":1}}'"
echo ""

# Interaction tests
echo "💬 Interaction Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"chat\",\"parameters\":{\"message\":\"Hello from curl!\"}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"attack_entity\",\"parameters\":{\"target\":\"nearest\"}}'"
echo ""

# Survival tests
echo "🍎 Survival Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"consume_food\",\"parameters\":{\"food_type\":\"any\",\"amount\":1}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"experiment_with_item\",\"parameters\":{\"item_type\":\"apple\",\"action\":\"consume\"}}'"
echo ""

# Exploration tests
echo "🔍 Exploration Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"scan_for_trees\",\"parameters\":{}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"scan_for_animals\",\"parameters\":{}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"analyze_biome_resources\",\"parameters\":{}}'"
echo ""

# Navigation tests
echo "🧭 Navigation Tests:"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"navigate\",\"parameters\":{\"target\":{\"x\":10,\"y\":64,\"z\":10},\"range\":2}}'"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"look_at\",\"parameters\":{\"direction\":\"around\"}}'"
echo ""

# Utility commands
echo "📊 Utility Commands:"
echo "  curl -s $BASE_URL/status | jq '.'                    # Get bot status"
echo "  curl -s $BASE_URL/state | jq '.'                     # Get bot state"
echo "  curl -s $BASE_URL/inventory | jq '.'                 # Get inventory"
echo "  curl -s $BASE_URL/telemetry | jq '.'                 # Get telemetry"
echo ""



echo "💡 Tips:"
echo "  - Use 'jq' for pretty JSON output: curl ... | jq '.'"
echo "  - Add '--quick' flag to run basic tests: $0 --quick"
echo "  - Check bot status first: curl -s $BASE_URL/status"
echo ""
echo "🎯 Example usage:"
echo "  # Test movement"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"move_forward\",\"parameters\":{\"distance\":3}}' | jq '.'"
echo ""
echo "  # Test chat"
echo "  curl -X POST $BASE_URL/action -H 'Content-Type: application/json' -d '{\"type\":\"chat\",\"parameters\":{\"message\":\"Hello!\"}}' | jq '.'"
echo ""

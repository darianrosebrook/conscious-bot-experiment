#!/bin/bash
# setup-test-world.sh — Create a controlled test environment for bot validation
#
# Resets the Minecraft world to a known state with:
# - Flat terrain at spawn
# - Trees within 10 blocks
# - Stone/ores accessible underground
# - Known worldspawn position
# - Bot given survival mode with empty inventory
#
# Usage: bash scripts/setup-test-world.sh
#
# Requires: docker compose running with the minecraft server

set -e

CONTAINER="conscious-bot-minecraft"
RCON="docker exec $CONTAINER rcon-cli"

echo "=== Setting up controlled test world ==="

# Wait for server to be ready
echo "Waiting for Minecraft server..."
for i in $(seq 1 30); do
  if docker logs $CONTAINER 2>&1 | grep -q "Done\|RCON running"; then
    echo "Server ready"
    break
  fi
  sleep 2
done

# Set a known seed for the next world reset
# Seed 12345 gives a plains/forest mix at origin on 1.21.x
echo "Setting world properties..."
$RCON "setworldspawn 0 64 0"
$RCON "gamerule spawnRadius 0"
$RCON "gamerule doDaylightCycle false"
$RCON "time set day"
$RCON "weather clear"
$RCON "difficulty peaceful"  # No mobs during testing
$RCON "gamerule doMobSpawning false"

# Kill the bot if connected so we can set up the world
$RCON "kick BotSterling Setting up test world" 2>/dev/null || true
sleep 2

# Teleport spawn chunks to load them
$RCON "forceload add -32 -32 32 32"

# Place oak trees at known positions around spawn
echo "Planting trees..."
# Tree 1: 5 blocks east
$RCON "fill 5 64 0 5 64 0 minecraft:dirt"
$RCON "place feature minecraft:oak 5 65 0"

# Tree 2: 8 blocks north
$RCON "fill 0 64 -8 0 64 -8 minecraft:dirt"
$RCON "place feature minecraft:oak 0 65 -8"

# Tree 3: 6 blocks south-east
$RCON "fill 6 64 6 6 64 6 minecraft:dirt"
$RCON "place feature minecraft:birch 6 65 6"

# Ensure flat ground at spawn (3x3 grass platform)
echo "Flattening spawn area..."
$RCON "fill -2 63 -2 2 63 2 minecraft:grass_block"
$RCON "fill -2 64 -2 2 68 2 minecraft:air"

# Place stone underground (accessible by digging down 2 blocks)
echo "Placing underground stone..."
$RCON "fill -3 60 -3 3 62 3 minecraft:stone"
$RCON "fill -1 61 -1 1 62 1 minecraft:cobblestone"

# Place iron ore nearby underground
$RCON "setblock 2 61 2 minecraft:iron_ore"
$RCON "setblock -2 61 -2 minecraft:coal_ore"

# Clear bot inventory and set survival mode
echo "Resetting bot state..."
$RCON "clear BotSterling" 2>/dev/null || true
$RCON "gamemode survival BotSterling" 2>/dev/null || true
$RCON "effect give BotSterling minecraft:instant_health 1 5" 2>/dev/null || true
$RCON "effect give BotSterling minecraft:saturation 1 10" 2>/dev/null || true

echo ""
echo "=== Test world ready ==="
echo "Spawn: (0, 64, 0) — flat grass platform"
echo "Trees: oak at (5,65,0), oak at (0,65,-8), birch at (6,65,6)"
echo "Stone: underground at Y=60-62"
echo "Mode: survival, peaceful, day, clear weather"
echo ""
echo "To reset: run this script again"
echo "To start bot: pnpm start --debug --capture-logs=420 --skip-install --skip-build"

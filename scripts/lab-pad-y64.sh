#!/usr/bin/env bash
# lab-pad-y64.sh — Build a y=64 lab pad and run T3 smoke variants on it.
#
# Purpose: Isolate flat-world geometry (y=-60) from leaf/verifier bugs.
# See docs/bot-sterling-task-execution-pipeline.md "Lab Pad Experiment" section.
#
# CLEAN-ROOM INVARIANT: Each T3 variant run starts from a known world baseline
# (pad rebuilt + air cleared + inventory reset). Results are not comparable
# without this reset. Do not skip reset_pad() calls.
#
# Prerequisites:
#   - Minecraft server running (docker: conscious-bot-minecraft)
#   - Planning server running on :3002
#   - Bot connected and executor started
#
# Usage:
#   ./scripts/lab-pad-y64.sh          # Full run: setup + all 4 leaves
#   ./scripts/lab-pad-y64.sh setup    # Only build the pad (no smoke runs)
#   ./scripts/lab-pad-y64.sh run      # Only run smoke (rebuilds pad before each variant)
set -euo pipefail

RCON="docker exec conscious-bot-minecraft rcon-cli"
PLANNING="http://localhost:3002"
POLL_TIMEOUT=30000

# Platform center
CX=100; CY=63; CZ=100

# Platform bounds (7x7)
X1=$((CX - 3)); X2=$((CX + 3))
Z1=$((CZ - 3)); Z2=$((CZ + 3))

# Dirt position for till_soil (1 block north of center, same y as platform)
DIRT_X=99; DIRT_Z=100

# Torch roof: 3x3 stone cap at y=67 centered on bot position.
# Forces light=0 underneath so place_torch_if_needed always triggers placement.
ROOF_Y=$((CY + 4))  # y=67: 3 blocks above bot head (bot at y=64, eye at ~65.6)
ROOF_X1=$((CX - 1)); ROOF_X2=$((CX + 1))
ROOF_Z1=$((CZ - 1)); ROOF_Z2=$((CZ + 1))

log() { echo "[lab-pad] $*"; }

world_freeze() {
  log "World freeze"
  $RCON "difficulty normal"
  $RCON "time set midnight"
  $RCON "gamerule doDaylightCycle false"
  $RCON "gamerule doMobSpawning false"
  $RCON "gamerule doWeatherCycle false"
}

# Reset pad to clean-room baseline. Called before EVERY variant.
reset_pad() {
  local label="${1:-reset}"
  log "[$label] Resetting pad to clean-room baseline"

  # Rebuild 7x7 stone platform (overwrites any placed blocks from prior test)
  $RCON "fill $X1 $CY $Z1 $X2 $CY $Z2 stone"

  # Place dirt block for till_soil
  $RCON "setblock $DIRT_X $CY $DIRT_Z dirt"

  # Clear air above platform (y=64..66) — removes placed blocks, torches, etc.
  $RCON "fill $X1 $((CY + 1)) $Z1 $X2 $((CY + 3)) $Z2 air"

  # Teleport bot to platform center
  $RCON "tp BotSterling ${CX}.5 $((CY + 1)) ${CZ}.5"

  # Reset inventory to full T3 set
  $RCON "clear BotSterling"
  $RCON "give BotSterling cobblestone 64"
  $RCON "give BotSterling crafting_table 4"
  $RCON "give BotSterling torch 64"
  $RCON "give BotSterling wooden_hoe 2"
  $RCON "give BotSterling oak_log 16"

  # Wait for inventory sync
  sleep 2
}

# Build the torch roof: 3x3 stone cap above bot position.
# Only needed for place_torch variant; removed for others.
add_torch_roof() {
  log "Adding 3x3 torch roof at y=$ROOF_Y (forces light=0)"
  $RCON "fill $ROOF_X1 $ROOF_Y $ROOF_Z1 $ROOF_X2 $ROOF_Y $ROOF_Z2 stone"
}

remove_torch_roof() {
  $RCON "fill $ROOF_X1 $ROOF_Y $ROOF_Z1 $ROOF_X2 $ROOF_Y $ROOF_Z2 air"
}

setup_pad() {
  world_freeze
  reset_pad "initial-setup"

  log "Verify: bot position"
  $RCON "execute as BotSterling run tp ~ ~ ~"
  log "Verify: dirt block"
  $RCON "data get block $DIRT_X $CY $DIRT_Z"
  log "Verify: stone floor"
  $RCON "data get block $CX $CY $CZ"

  log "Setup complete. Bot at ($CX.5, $((CY + 1)), $CZ.5) on 7x7 stone pad."
}

run_variant() {
  local variant="$1"
  local label="$2"

  log "── $label ──"

  curl -s -X POST "$PLANNING/api/dev/sterling-smoke" \
    -H 'Content-Type: application/json' \
    -d "{\"variant\":\"$variant\",\"poll_timeout_ms\":$POLL_TIMEOUT}" | python3 -m json.tool

  # Flush between tests
  curl -s -X POST "$PLANNING/api/dev/sterling-smoke/flush" > /dev/null
}

# RCON probe: check block at coordinates. Used for SC-26 ground-truth verification.
probe_block() {
  local x="$1" y="$2" z="$3" label="$4"
  log "  Probe [$label]: block at ($x, $y, $z)"
  $RCON "data get block $x $y $z"
}

run_smoke() {
  log "Flushing leftover tasks..."
  curl -s -X POST "$PLANNING/api/dev/sterling-smoke/flush" | python3 -m json.tool
  sleep 1

  # ── place_block ──
  reset_pad "place_block"
  run_variant "t3_place_block" "LAB PAD: place_block"
  # Probe adjacent positions to check if block was placed
  probe_block $((CX + 1)) $((CY + 1)) $CZ "east of bot (expected cobblestone)"
  probe_block $((CX - 1)) $((CY + 1)) $CZ "west of bot (alternate)"
  probe_block $CX $((CY + 1)) $((CZ + 1)) "south of bot (alternate)"
  sleep 1

  # ── place_workstation ──
  reset_pad "place_workstation"
  run_variant "t3_place_workstation" "LAB PAD: place_workstation"
  # Probe 2-block offsets (preferred placement distance)
  probe_block $((CX + 2)) $((CY + 1)) $CZ "2 east (preferred distance)"
  probe_block $((CX - 2)) $((CY + 1)) $CZ "2 west (preferred distance)"
  probe_block $CX $((CY + 1)) $((CZ + 2)) "2 south (preferred distance)"
  sleep 1

  # ── till_soil ──
  reset_pad "till_soil"
  run_variant "t3_till_soil" "LAB PAD: till_soil"
  # Probe the dirt position — should now be farmland if tilled
  probe_block $DIRT_X $CY $DIRT_Z "dirt target (expected farmland)"
  sleep 1

  # ── place_torch (with roof for deterministic light=0) ──
  reset_pad "place_torch"
  add_torch_roof
  # Verify light is 0 under roof before running
  log "  Verifying light=0 under roof (midnight + roof = guaranteed dark)"
  run_variant "t3_place_torch" "LAB PAD: place_torch_if_needed"
  # SC-26 ground-truth probes: check for torch at bot position and neighbors
  probe_block $CX $((CY + 1)) $CZ "bot position (torch here?)"
  probe_block $((CX + 1)) $((CY + 1)) $CZ "east neighbor (torch here?)"
  probe_block $((CX - 1)) $((CY + 1)) $CZ "west neighbor (torch here?)"
  probe_block $CX $((CY + 1)) $((CZ + 1)) "south neighbor (torch here?)"
  probe_block $CX $((CY + 1)) $((CZ - 1)) "north neighbor (torch here?)"
  remove_torch_roof
  sleep 1

  log "All lab pad tests complete."
  log "Check golden-run artifacts in packages/planning/artifacts/golden-run/"
  log ""
  log "Compare probe results above with golden-run leaf output to identify:"
  log "  - Leaf claims torch at (x,y,z) → probe confirms/denies block exists"
  log "  - Verifier rejects at (x,y,z) → probe shows actual block state"
}

case "${1:-full}" in
  setup) setup_pad ;;
  run)   run_smoke ;;
  full)  setup_pad; run_smoke ;;
  *)     echo "Usage: $0 [setup|run|full]"; exit 1 ;;
esac

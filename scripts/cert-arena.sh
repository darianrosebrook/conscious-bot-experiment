#!/usr/bin/env bash
set -euo pipefail

# Certification Arena reset / probe utility
#
# Usage:
#   ./cert-arena.sh reset base
#   ./cert-arena.sh reset scn-001
#   ./cert-arena.sh reset scn-002
#   ./cert-arena.sh reset scn-003
#   ./cert-arena.sh reset scn-004
#   ./cert-arena.sh probe pickup [item] [count]
#   ./cert-arena.sh verify scn-001
#
# Environment overrides:
#   MC_CONTAINER=conscious-bot-minecraft
#   BOT_NAME=BotSterling
#   ARENA_CX=1000
#   ARENA_CZ=1000
#   FLOOR_Y=63

MC_CONTAINER="${MC_CONTAINER:-conscious-bot-minecraft}"
BOT_NAME="${BOT_NAME:-BotSterling}"
ARENA_CX="${ARENA_CX:-1000}"
ARENA_CZ="${ARENA_CZ:-1000}"
FLOOR_Y="${FLOOR_Y:-63}"
BOT_Y=$((FLOOR_Y + 1))
MIN_X=$((ARENA_CX - 32))
MAX_X=$((ARENA_CX + 32))
MIN_Z=$((ARENA_CZ - 32))
MAX_Z=$((ARENA_CZ + 32))
WALL_TOP_Y=$((FLOOR_Y + 5))
CLEAR_TOP_Y=90

rcon() {
  local cmd="$1"
  docker exec "$MC_CONTAINER" rcon-cli "$cmd" >/dev/null
}

rcon_out() {
  local cmd="$1"
  docker exec "$MC_CONTAINER" rcon-cli "$cmd"
}

info() {
  printf '[cert-arena] %s\n' "$*"
}

freeze_env() {
  info "Freezing environment"
  rcon 'gamerule doDaylightCycle false'
  rcon 'gamerule doWeatherCycle false'
  rcon 'gamerule doMobSpawning false'
  rcon 'gamerule keepInventory true'
  rcon 'gamerule doTileDrops true'
  rcon 'gamerule spawnRadius 0'
  rcon 'difficulty peaceful'
  rcon 'time set 6000'
  rcon 'weather clear'
}

hard_clear_arena() {
  info "Hard-clearing arena at (${ARENA_CX},${BOT_Y},${ARENA_CZ})"
  # forceload takes block coordinates, not chunk coordinates
  rcon "forceload add ${MIN_X} ${MIN_Z} ${MAX_X} ${MAX_Z}"
  rcon "kill @e[type=!player,x=${ARENA_CX},y=${BOT_Y},z=${ARENA_CZ},distance=..96]"
  rcon "fill ${MIN_X} $((FLOOR_Y + 1)) ${MIN_Z} ${MAX_X} ${CLEAR_TOP_Y} ${MAX_Z} air"
  # Solid floor stack: bedrock at Y=59, smooth_stone fill Y=60-63.
  # Drops land on the floor surface rather than falling into the void.
  rcon "fill ${MIN_X} $((FLOOR_Y - 4)) ${MIN_Z} ${MAX_X} $((FLOOR_Y - 4)) ${MAX_Z} bedrock"
  rcon "fill ${MIN_X} $((FLOOR_Y - 3)) ${MIN_Z} ${MAX_X} ${FLOOR_Y} ${MAX_Z} smooth_stone"
}

build_perimeter() {
  info "Building glass perimeter"
  rcon "fill ${MIN_X} $((FLOOR_Y + 1)) ${MIN_Z} ${MAX_X} ${WALL_TOP_Y} ${MIN_Z} glass"
  rcon "fill ${MIN_X} $((FLOOR_Y + 1)) ${MAX_Z} ${MAX_X} ${WALL_TOP_Y} ${MAX_Z} glass"
  rcon "fill ${MIN_X} $((FLOOR_Y + 1)) ${MIN_Z} ${MIN_X} ${WALL_TOP_Y} ${MAX_Z} glass"
  rcon "fill ${MAX_X} $((FLOOR_Y + 1)) ${MIN_Z} ${MAX_X} ${WALL_TOP_Y} ${MAX_Z} glass"
}

reset_bot() {
  info "Resetting bot state"
  rcon "tp ${BOT_NAME} ${ARENA_CX}.5 ${BOT_Y} ${ARENA_CZ}.5"
  rcon "gamemode survival ${BOT_NAME}"
  rcon "clear ${BOT_NAME}"
  rcon "effect clear ${BOT_NAME}"
  rcon "effect give ${BOT_NAME} minecraft:instant_health 1 10 true"
  rcon "effect give ${BOT_NAME} minecraft:saturation 1 10 true"
}

# North pad: wood acquisition
place_wood_pad() {
  info "Placing wood pad"
  local x=${ARENA_CX}
  local z=$((ARENA_CZ - 10))
  # clear local zone
  rcon "fill $((x - 6)) $((FLOOR_Y + 1)) $((z - 4)) $((x + 6)) $((FLOOR_Y + 8)) $((z + 4)) air"
  # three pure log columns; no leaf clutter
  for dx in 0 -4 4; do
    for y in $(seq $((FLOOR_Y + 1)) $((FLOOR_Y + 4))); do
      rcon "setblock $((x + dx)) ${y} ${z} oak_log"
    done
  done
}

# East pad: workstation placement
clear_workstation_pad() {
  info "Clearing workstation pad"
  local x=$((ARENA_CX + 12))
  local z=${ARENA_CZ}
  rcon "fill $((x - 4)) $((FLOOR_Y + 1)) $((z - 4)) $((x + 4)) $((FLOOR_Y + 4)) $((z + 4)) air"
}

# South pad: stone columns above the floor (not stone AS floor)
place_stone_pad() {
  info "Placing stone columns on south pad"
  local x=${ARENA_CX}
  local z=$((ARENA_CZ + 10))
  # Clear the area first
  rcon "fill $((x - 4)) $((FLOOR_Y + 1)) $((z - 4)) $((x + 4)) $((FLOOR_Y + 4)) $((z + 4)) air"
  # Place 4 stone columns (2 blocks tall) around the pad center.
  # Bot can mine these without falling through the floor.
  for dx in -2 2; do
    for dz in -2 2; do
      rcon "setblock $((x + dx)) $((FLOOR_Y + 1)) $((z + dz)) stone"
      rcon "setblock $((x + dx)) $((FLOOR_Y + 2)) $((z + dz)) stone"
    done
  done
  # Also place some stone blocks at ground+1 level in a ring
  for pos in \
    "$((x + 1)) $((FLOOR_Y + 1)) ${z}" \
    "$((x - 1)) $((FLOOR_Y + 1)) ${z}" \
    "${x} $((FLOOR_Y + 1)) $((z + 1))" \
    "${x} $((FLOOR_Y + 1)) $((z - 1))"; do
    rcon "setblock ${pos} stone"
  done
}

# West pad: item collection probe
spawn_probe_item() {
  local item="${1:-cobblestone}"
  local count="${2:-1}"
  info "Spawning pickup probe item: ${item} x${count}"
  local x=$((ARENA_CX - 12))
  local z=${ARENA_CZ}
  rcon "fill $((x - 3)) $((FLOOR_Y + 1)) $((z - 3)) $((x + 3)) $((FLOOR_Y + 3)) $((z + 3)) air"
  # summon dropped item entity at center of west pad
  rcon "summon item ${x}.5 $((FLOOR_Y + 2)).0 ${z}.5 {Item:{id:\"minecraft:${item}\",Count:${count}b},PickupDelay:0,Age:0}"
}

give_inv() {
  local item="$1"
  local count="$2"
  rcon "give ${BOT_NAME} minecraft:${item} ${count}"
}

verify_block() {
  local x="$1" y="$2" z="$3" block="$4"
  rcon_out "execute if block ${x} ${y} ${z} minecraft:${block}"
}

verify_inventory_count() {
  local item="$1"
  rcon_out "clear ${BOT_NAME} minecraft:${item} 0"
}

reset_base() {
  freeze_env
  hard_clear_arena
  build_perimeter
  clear_workstation_pad
  reset_bot
}

reset_scn_001() {
  reset_base
  place_wood_pad
  info "SCN-001 ready"
}

reset_scn_002() {
  reset_base
  clear_workstation_pad
  give_inv oak_log 4
  info "SCN-002 ready"
}

reset_scn_003() {
  reset_base
  place_stone_pad
  give_inv wooden_pickaxe 1
  # Teleport bot directly to south pad so stone is in nearby_blocks
  rcon "tp ${BOT_NAME} ${ARENA_CX}.5 ${BOT_Y} $((ARENA_CZ + 10)).5"
  info "SCN-003 ready (bot on south pad)"
}

reset_scn_004() {
  reset_base
  # Place stone columns near CENTER (not on distant south pad)
  # so the bot can reach both stone and workstation pad without wandering
  info "Placing stone blocks near center (single height, air above)"
  # Single-height stone blocks with guaranteed air above — the exposed-first
  # scan requires air above the target block.
  for pos in \
    "$((ARENA_CX + 2)) $((FLOOR_Y + 1)) ${ARENA_CZ}" \
    "$((ARENA_CX - 2)) $((FLOOR_Y + 1)) ${ARENA_CZ}" \
    "${ARENA_CX} $((FLOOR_Y + 1)) $((ARENA_CZ + 2))" \
    "${ARENA_CX} $((FLOOR_Y + 1)) $((ARENA_CZ - 2))" \
    "$((ARENA_CX + 3)) $((FLOOR_Y + 1)) $((ARENA_CZ + 3))" \
    "$((ARENA_CX - 3)) $((FLOOR_Y + 1)) $((ARENA_CZ - 3))" \
    "$((ARENA_CX + 3)) $((FLOOR_Y + 1)) $((ARENA_CZ - 3))" \
    "$((ARENA_CX - 3)) $((FLOOR_Y + 1)) $((ARENA_CZ + 3))" \
    "$((ARENA_CX + 4)) $((FLOOR_Y + 1)) ${ARENA_CZ}" \
    "$((ARENA_CX - 4)) $((FLOOR_Y + 1)) ${ARENA_CZ}" \
    "${ARENA_CX} $((FLOOR_Y + 1)) $((ARENA_CZ + 4))" \
    "${ARENA_CX} $((FLOOR_Y + 1)) $((ARENA_CZ - 4))"; do
    rcon "setblock ${pos} stone"
  done
  # Place a crafting table near center so craft_recipe can find it
  rcon "setblock $((ARENA_CX + 2)) $((FLOOR_Y + 1)) ${ARENA_CZ} crafting_table"
  give_inv wooden_pickaxe 1
  give_inv stick 2
  info "SCN-004 ready (table placed, must mine stone for cobblestone)"
}

verify_scn_001() {
  info "Verifying SCN-001"
  verify_block ${ARENA_CX} $((FLOOR_Y + 1)) $((ARENA_CZ - 10)) oak_log
  verify_inventory_count oak_log || true
}

verify_scn_002() {
  info "Verifying SCN-002"
  verify_inventory_count oak_log || true
  rcon_out "execute unless block $((ARENA_CX + 12)) $((FLOOR_Y + 1)) ${ARENA_CZ} minecraft:crafting_table"
}

verify_scn_003() {
  info "Verifying SCN-003"
  verify_block $((ARENA_CX + 1)) ${FLOOR_Y} $((ARENA_CZ + 10)) stone
  verify_inventory_count wooden_pickaxe || true
}

verify_scn_004() {
  info "Verifying SCN-004"
  verify_block $((ARENA_CX + 1)) ${FLOOR_Y} $((ARENA_CZ + 10)) stone
  verify_inventory_count wooden_pickaxe || true
  verify_inventory_count crafting_table || true
  verify_inventory_count stick || true
}

main() {
  local cmd="${1:-}"
  local arg="${2:-}"
  case "${cmd}:${arg}" in
    reset:base)   reset_base ;;
    reset:scn-001) reset_scn_001 ;;
    reset:scn-002) reset_scn_002 ;;
    reset:scn-003) reset_scn_003 ;;
    reset:scn-004) reset_scn_004 ;;
    verify:scn-001) verify_scn_001 ;;
    verify:scn-002) verify_scn_002 ;;
    verify:scn-003) verify_scn_003 ;;
    verify:scn-004) verify_scn_004 ;;
    probe:pickup) spawn_probe_item "${3:-cobblestone}" "${4:-1}" ;;
    *)
      cat <<USAGE
Usage:
  $0 reset base
  $0 reset scn-001
  $0 reset scn-002
  $0 reset scn-003
  $0 reset scn-004
  $0 verify scn-001|scn-002|scn-003|scn-004
  $0 probe pickup [item] [count]

Env:
  MC_CONTAINER=${MC_CONTAINER}
  BOT_NAME=${BOT_NAME}
  ARENA_CX=${ARENA_CX}
  ARENA_CZ=${ARENA_CZ}
  FLOOR_Y=${FLOOR_Y}
USAGE
      exit 2
      ;;
  esac
}

main "$@"

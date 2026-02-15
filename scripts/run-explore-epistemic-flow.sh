#!/usr/bin/env bash
# run-explore-epistemic-flow.sh — Full-system test of needsBlocks -> explore_for_resources flow.
#
# Starts the conscious bot, injects a tool_progression task (Get stone_pickaxe), and captures
# logs. The epistemic loop triggers when the bot has no stone in nearbyBlocks; exploration
# runs, then replan occurs.
#
# Usage:
#   bash scripts/run-explore-epistemic-flow.sh              # Start system, inject task, capture 90s
#   bash scripts/run-explore-epistemic-flow.sh --no-inject  # Start only, no task injection
#   bash scripts/run-explore-epistemic-flow.sh --capture=120
#
# Prerequisites: Docker (Postgres, Minecraft), Sterling at ../sterling, MLX-LM sidecar.
# For needsBlocks to trigger, the bot should spawn in an area with no stone nearby.
# If stone is visible, the solver will plan normally instead of emitting explore_for_resources.
#
# @author @darianrosebrook

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

CAPTURE_SEC=90
INJECT_TASK=true

for arg in "$@"; do
  case "$arg" in
    --no-inject) INJECT_TASK=false ;;
    --capture=*) CAPTURE_SEC="${arg#*=}" ;;
    *) ;;
  esac
done

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "[explore-epistemic] Starting full system with debug + capture-logs=${CAPTURE_SEC}s..."
echo "[explore-epistemic] TEST_EMPTY_NEARBY_BLOCKS=1 forces empty nearbyBlocks so needsBlocks triggers"
TEST_EMPTY_NEARBY_BLOCKS=1 pnpm start -- --debug --capture-logs="$CAPTURE_SEC" &
START_PID=$!

cleanup() {
  if kill -0 "$START_PID" 2>/dev/null; then
    echo "[explore-epistemic] Stopping start process (PID $START_PID)"
    kill "$START_PID" 2>/dev/null || true
    wait "$START_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "[explore-epistemic] Waiting for Planning service (port 3002)..."
TRIES=0
MAX_TRIES=90
while [[ $TRIES -lt $MAX_TRIES ]]; do
  if curl -sf http://localhost:3002/health >/dev/null 2>&1; then
    echo "[explore-epistemic] Planning service ready"
    break
  fi
  TRIES=$((TRIES + 1))
  sleep 2
  if [[ $((TRIES % 10)) -eq 0 ]]; then
    echo "[explore-epistemic]   Still waiting... (attempt $TRIES/$MAX_TRIES)"
  fi
done

if [[ $TRIES -ge $MAX_TRIES ]]; then
  echo "[explore-epistemic] Planning service did not become ready in time"
  exit 1
fi

if [[ "$INJECT_TASK" == true ]]; then
  echo "[explore-epistemic] Injecting tool_progression task (Get stone_pickaxe)..."
  TASK_RESP=$(curl -sf -X POST http://localhost:3002/task \
    -H "Content-Type: application/json" \
    -d '{
      "title": "Get stone pickaxe",
      "description": "Tool progression test",
      "type": "tool_progression",
      "priority": 0.5,
      "urgency": 0.3,
      "source": "epistemic_flow_test",
      "parameters": {
        "requirementCandidate": {
          "kind": "tool_progression",
          "targetTool": "stone_pickaxe",
          "toolType": "pickaxe",
          "targetTier": "stone",
          "quantity": 1
        }
      },
      "metadata": {
        "category": "tool_progression",
        "currentState": {
          "inventory": [{"name": "wooden_pickaxe", "count": 1}],
          "nearbyBlocks": [],
          "nearbyEntities": []
        }
      }
    }' 2>/dev/null || echo '{"success":false}')

  if echo "$TASK_RESP" | grep -q '"success":true'; then
    TASK_ID=$(echo "$TASK_RESP" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)
    echo "[explore-epistemic] Task injected: $TASK_ID"
  else
    echo "[explore-epistemic] Task injection failed (response may require currentState in PROPAGATED_META_KEYS)"
    echo "[explore-epistemic] Continuing — executor may still pick up tasks from cognition stream"
  fi
fi

echo "[explore-epistemic] Capturing logs for ${CAPTURE_SEC}s. Check run.log after completion."
wait "$START_PID" 2>/dev/null || true

if [[ -f run.log ]]; then
  echo "[explore-epistemic] run.log written. Verifying epistemic flow markers..."
  if grep -q "explore_for_resources\|needsBlocks\|resource_tags" run.log 2>/dev/null; then
    echo "[explore-epistemic] Found explore/epistemic markers in run.log"
  else
    echo "[explore-epistemic] No explore_for_resources/needsBlocks markers in run.log"
    echo "[explore-epistemic] This may mean: (1) no tool_progression task ran, (2) bot had stone nearby, (3) task injection did not preserve currentState"
  fi
fi

#!/usr/bin/env bash
# run-e2e.sh — Bring up infrastructure, start Sterling, run all E2E test suites.
#
# Usage:
#   bash scripts/run-e2e.sh                  # run core suites (fast, no infra)
#   bash scripts/run-e2e.sh --teardown       # run tests, then docker compose down
#   bash scripts/run-e2e.sh --sterling-dir=/path/to/sterling
#
# Environment:
#   STERLING_DIR   Path to the Sterling repo (default: ../sterling)
#   E2E_SUITES     Comma-separated suite categories: core, sterling, all (default: core)

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}[e2e]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}[e2e]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[e2e]${RESET} %s\n" "$*"; }
fail()  { printf "${RED}[e2e]${RESET} %s\n" "$*"; }

# ── Parse flags ──────────────────────────────────────────────────────
TEARDOWN=false
STERLING_DIR="${STERLING_DIR:-../sterling}"

for arg in "$@"; do
  case "$arg" in
    --teardown) TEARDOWN=true ;;
    --sterling-dir=*) STERLING_DIR="${arg#*=}" ;;
    *) warn "Unknown flag: $arg" ;;
  esac
done

# ── Suite categories ───────────────────────────────────────────────
# E2E_SUITES controls which suite categories run. Comma-separated.
# Categories:
#   core      — no infra needed, fast (mocked E2E tests)
#   sterling  — needs Sterling server (implies infra)
#   infra     — start Docker/Postgres/Minecraft/MLX (implied by sterling)
#   all       — everything
# Default: "core" — fast, no external dependencies
# Normalize: strip whitespace so "core, sterling" → "core,sterling"
E2E_SUITES="${E2E_SUITES:-core}"
E2E_SUITES="${E2E_SUITES//[[:space:]]/}"

should_run_category() {
  local category="$1"
  [[ "$E2E_SUITES" == "all" ]] && return 0
  # Delimiter-safe: wrap both sides with commas so "core" doesn't match "coreutils"
  [[ ",${E2E_SUITES}," == *",${category},"* ]] && return 0
  # "sterling" implies "infra"
  if [[ "$category" == "infra" ]]; then
    [[ ",${E2E_SUITES}," == *",sterling,"* ]] && return 0
  fi
  return 1
}

# ── Resolve project root (where this script lives -> parent) ─────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Load .env if present
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── PID / state tracking ──────────────────────────────────────────
STERLING_PID=""
STERLING_LOG="$PROJECT_ROOT/.sterling-e2e.log"
MLX_PID=""
MLX_LOG="$PROJECT_ROOT/.mlx-e2e.log"
DID_START_INFRA=false

cleanup() {
  info "Cleaning up..."
  if [[ -n "$STERLING_PID" ]] && kill -0 "$STERLING_PID" 2>/dev/null; then
    info "Stopping Sterling (PID $STERLING_PID)"
    kill "$STERLING_PID" 2>/dev/null || true
    wait "$STERLING_PID" 2>/dev/null || true
  fi
  [[ -f "$STERLING_LOG" ]] && rm -f "$STERLING_LOG"
  if [[ -n "$MLX_PID" ]] && kill -0 "$MLX_PID" 2>/dev/null; then
    info "Stopping MLX-LM sidecar (PID $MLX_PID)"
    kill "$MLX_PID" 2>/dev/null || true
    wait "$MLX_PID" 2>/dev/null || true
  fi
  [[ -f "$MLX_LOG" ]] && rm -f "$MLX_LOG"
  # Only tear down Docker if we actually started it in this invocation
  if [[ "$TEARDOWN" == true && "$DID_START_INFRA" == true ]]; then
    info "Tearing down Docker services..."
    docker compose down 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── 1. Docker up ─────────────────────────────────────────────────────
if should_run_category "infra"; then
  info "Starting Docker services..."
  if ! command -v docker &>/dev/null; then
    fail "Docker is not installed or not in PATH"
    exit 1
  fi

  docker compose up -d
  DID_START_INFRA=true

  # Wait for Postgres
  info "Waiting for Postgres..."
  TRIES=0
  MAX_TRIES=30
  while ! docker exec conscious-bot-postgres pg_isready -U conscious_bot -q 2>/dev/null; do
    TRIES=$((TRIES + 1))
    if [[ $TRIES -ge $MAX_TRIES ]]; then
      fail "Postgres did not become ready in time"
      exit 1
    fi
    sleep 2
  done
  ok "Postgres is ready"

  # Wait for Minecraft (optional — long startup for world gen)
  info "Waiting for Minecraft server (this may take a while on first run)..."
  TRIES=0
  MAX_TRIES=40  # 40 x 5s = 200s
  MC_READY=false
  while [[ $TRIES -lt $MAX_TRIES ]]; do
    if docker exec conscious-bot-minecraft mc-health 2>/dev/null; then
      MC_READY=true
      break
    fi
    TRIES=$((TRIES + 1))
    if [[ $((TRIES % 6)) -eq 0 ]]; then
      info "  Still waiting for Minecraft... (attempt $TRIES/$MAX_TRIES)"
    fi
    sleep 5
  done

  if [[ "$MC_READY" == true ]]; then
    ok "Minecraft server is ready"
  else
    warn "Minecraft server did not become ready in time (tests requiring it will be skipped)"
  fi
else
  info "Skipping Docker/Postgres/Minecraft startup (E2E_SUITES=$E2E_SUITES — no infra needed)"
fi

# ── 2. Sterling start ───────────────────────────────────────────────
STERLING_RUNNING=false

if ! should_run_category "infra"; then
  info "Skipping Sterling startup (E2E_SUITES=$E2E_SUITES — no infra needed)"
elif command -v lsof &>/dev/null && lsof -Pi :8766 -sTCP:LISTEN -t &>/dev/null; then
  # Check if Sterling is already running on the expected port
  ok "Sterling is already running on port 8766"
  STERLING_RUNNING=true
fi

if [[ "$STERLING_RUNNING" == false ]] && should_run_category "infra"; then
  STERLING_PYTHON="$STERLING_DIR/.venv/bin/python"
  STERLING_SCRIPT="$STERLING_DIR/scripts/utils/sterling_unified_server.py"

  if [[ ! -x "$STERLING_PYTHON" ]]; then
    warn "Sterling venv not found at $STERLING_PYTHON"
    warn "Set up: cd $STERLING_DIR && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    warn "Sterling E2E tests will be skipped"
  elif [[ ! -f "$STERLING_SCRIPT" ]]; then
    warn "Sterling server script not found at $STERLING_SCRIPT"
    warn "Expected at: $STERLING_DIR/scripts/utils/sterling_unified_server.py"
    warn "Sterling E2E tests will be skipped"
  else
    info "Starting Sterling server..."
    "$STERLING_PYTHON" "$STERLING_SCRIPT" > "$STERLING_LOG" 2>&1 &
    STERLING_PID=$!

    # Wait for Sterling to be ready (look for readiness in log)
    TRIES=0
    MAX_TRIES=90  # 90 x 2s = 180s (Sterling can be slow on first run / cold start)
    while [[ $TRIES -lt $MAX_TRIES ]]; do
      if grep -q "Waiting for connections" "$STERLING_LOG" 2>/dev/null; then
        STERLING_RUNNING=true
        break
      fi
      # Also check if process died
      if ! kill -0 "$STERLING_PID" 2>/dev/null; then
        fail "Sterling process exited unexpectedly"
        if [[ -f "$STERLING_LOG" ]]; then
          fail "Last output:"
          tail -5 "$STERLING_LOG" | while IFS= read -r line; do fail "  $line"; done
        fi
        break
      fi
      TRIES=$((TRIES + 1))
      if [[ $((TRIES % 15)) -eq 0 ]]; then
        info "  Waiting for Sterling... (attempt $TRIES/$MAX_TRIES)"
      fi
      sleep 2
    done

    if [[ "$STERLING_RUNNING" == true ]]; then
      ok "Sterling server is ready (PID $STERLING_PID)"
    else
      warn "Sterling did not become ready in 180s — Sterling E2E tests will be skipped"
      warn "Try starting manually: cd $STERLING_DIR && source .venv/bin/activate && python scripts/utils/sterling_unified_server.py"
      # Kill the hung process
      if [[ -n "$STERLING_PID" ]] && kill -0 "$STERLING_PID" 2>/dev/null; then
        kill "$STERLING_PID" 2>/dev/null || true
      fi
      STERLING_PID=""
    fi
  fi
fi

# ── 2b. MLX-LM Sidecar start ────────────────────────────────────────
MLX_RUNNING=false

if ! should_run_category "infra"; then
  info "Skipping MLX-LM sidecar startup (E2E_SUITES=$E2E_SUITES — no infra needed)"
elif lsof -Pi :5002 -sTCP:LISTEN -t &>/dev/null; then
  ok "MLX-LM sidecar is already running on port 5002"
  MLX_RUNNING=true
fi

if [[ "$MLX_RUNNING" == false ]] && should_run_category "infra"; then
  MLX_VENV="$PROJECT_ROOT/mlx-lm-sidecar/venv-mlx/bin/python"
  MLX_SCRIPT="$PROJECT_ROOT/mlx-lm-sidecar/mlx_server.py"

  if [[ ! -x "$MLX_VENV" ]]; then
    warn "MLX venv not found at $MLX_VENV — skipping MLX sidecar"
  elif [[ ! -f "$MLX_SCRIPT" ]]; then
    warn "MLX server script not found — skipping MLX sidecar"
  else
    info "Starting MLX-LM sidecar..."
    "$MLX_VENV" "$MLX_SCRIPT" --port 5002 > "$MLX_LOG" 2>&1 &
    MLX_PID=$!

    TRIES=0
    MAX_TRIES=60  # 60 x 2s = 120s (model loading can be slow on first run)
    while [[ $TRIES -lt $MAX_TRIES ]]; do
      if curl -sf http://localhost:5002/health >/dev/null 2>&1; then
        MLX_RUNNING=true
        break
      fi
      if ! kill -0 "$MLX_PID" 2>/dev/null; then
        fail "MLX process exited unexpectedly"
        break
      fi
      TRIES=$((TRIES + 1))
      if [[ $((TRIES % 10)) -eq 0 ]]; then
        info "  Waiting for MLX models to load... (attempt $TRIES/$MAX_TRIES)"
      fi
      sleep 2
    done

    if [[ "$MLX_RUNNING" == true ]]; then
      ok "MLX-LM sidecar is ready (PID $MLX_PID)"
    else
      warn "MLX-LM sidecar did not become ready — tests needing LLM/embeddings may fail"
    fi
  fi
fi

# ── 3. Run test suites ──────────────────────────────────────────────

# Check if any test-running category is selected
if ! should_run_category "core" && ! should_run_category "sterling"; then
  warn "No test suites selected (E2E_SUITES=$E2E_SUITES)"
  warn "Use E2E_SUITES=core for mocked tests, E2E_SUITES=all for everything"
  if [[ "$DID_START_INFRA" == true ]]; then
    ok "Infrastructure is up — Ctrl+C to exit; add --teardown to bring services down"
    # Explicit keepalive: wait returns immediately if no background jobs; use sleep so infra-only mode stays alive
    sleep 2147483647 &
    WAIT_PID=$!
    wait "$WAIT_PID"
  fi
  exit 0
fi

info ""
info "═══════════════════════════════════════════════════"
info "  Running E2E test suites"
info "═══════════════════════════════════════════════════"
info ""

declare -a SUITE_NAMES=()
declare -a SUITE_RESULTS=()
FAILURES=0

run_suite() {
  local name="$1"
  local env_prefix="$2"
  local test_path="$3"

  SUITE_NAMES+=("$name")

  info "── $name ──"

  # shellcheck disable=SC2086
  if eval "$env_prefix npx vitest run $test_path --reporter=verbose 2>&1"; then
    SUITE_RESULTS+=("PASS")
    ok "$name: PASS"
  else
    local exit_code=$?
    # vitest exits 1 for test failures, but also for "no tests found" etc.
    SUITE_RESULTS+=("FAIL")
    FAILURES=$((FAILURES + 1))
    fail "$name: FAIL (exit $exit_code)"
  fi
  echo ""
}

skip_suite() {
  local name="$1"
  local reason="$2"
  SUITE_NAMES+=("$name")
  SUITE_RESULTS+=("SKIP")
  warn "$name: SKIP ($reason)"
  echo ""
}

# ── Sterling-backed suites (category: sterling) ──

if should_run_category "sterling"; then
  if [[ "$STERLING_RUNNING" == true ]]; then
    run_suite \
      "Solver Class E2E" \
      "STERLING_E2E=1" \
      "packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts"

    run_suite \
      "Performance Baseline E2E" \
      "STERLING_E2E=1" \
      "packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts"

    run_suite \
      "Sterling Pipeline E2E" \
      "STERLING_E2E=1" \
      "packages/minecraft-interface/src/__tests__/sterling-pipeline-e2e.test.ts"
  else
    skip_suite "Solver Class E2E" "Sterling not started (see setup instructions above)"
    skip_suite "Performance Baseline E2E" "Sterling not started (see setup instructions above)"
    skip_suite "Sterling Pipeline E2E" "Sterling not started"
  fi
fi

# ── Core suites (category: core) — no infra needed, fast ──

if should_run_category "core"; then
  run_suite \
    "Tool Progression Integration" \
    "" \
    "packages/planning/src/sterling/__tests__/tool-progression-integration.test.ts"

  CRAFTING_GRID_TEST="packages/minecraft-interface/src/__tests__/crafting-grid-integration.test.ts"
  if [[ -f "$PROJECT_ROOT/$CRAFTING_GRID_TEST" ]]; then
    run_suite \
      "Crafting Grid Integration" \
      "" \
      "$CRAFTING_GRID_TEST"
  else
    skip_suite "Crafting Grid Integration" "Test file $CRAFTING_GRID_TEST not found"
  fi

  run_suite \
    "Cross-Boundary Bootstrap Contract" \
    "" \
    "packages/planning/src/server/__tests__/cross-boundary-bootstrap.test.ts"

  run_suite \
    "Gather-Food Dispatch Chain" \
    "" \
    "packages/planning/src/__tests__/gather-food-dispatch-chain-e2e.test.ts"

  run_suite \
    "Cognition–Planning Handshake" \
    "" \
    "packages/planning/src/__tests__/cognition-planning-handshake-e2e.test.ts"

  run_suite \
    "Thought-to-Execution Pipeline" \
    "" \
    "packages/planning/src/__tests__/thought-to-execution-e2e.test.ts"

  run_suite \
    "Executor Task Loop" \
    "" \
    "packages/planning/src/__tests__/executor-task-loop-e2e.test.ts"

  # ── New suites from leaf reachability audit ──

  run_suite \
    "Building Solver Dispatch Chain" \
    "" \
    "packages/planning/src/__tests__/building-solver-dispatch-chain-e2e.test.ts"

  run_suite \
    "Explore-Replan Dispatch Chain" \
    "" \
    "packages/planning/src/__tests__/explore-replan-dispatch-e2e.test.ts"

  run_suite \
    "Exploration Driveshaft E2E" \
    "" \
    "packages/planning/src/goal-formulation/__tests__/exploration-driveshaft-e2e.test.ts"

  run_suite \
    "Safety Monitor Dispatch" \
    "" \
    "packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts"

  run_suite \
    "Reachability Governance" \
    "" \
    "packages/planning/src/__tests__/reachability-governance.test.ts"

  run_suite \
    "Sleep Driveshaft" \
    "" \
    "packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-controller.test.ts"

  run_suite \
    "Sleep Driveshaft E2E" \
    "" \
    "packages/planning/src/goal-formulation/__tests__/sleep-driveshaft-e2e.test.ts"
fi

# ── 4. Summary ───────────────────────────────────────────────────────
echo ""
info "═══════════════════════════════════════════════════"
info "  E2E Summary"
info "═══════════════════════════════════════════════════"

for i in "${!SUITE_NAMES[@]}"; do
  local_name="${SUITE_NAMES[$i]}"
  local_result="${SUITE_RESULTS[$i]}"
  case "$local_result" in
    PASS) ok   "  PASS  $local_name" ;;
    FAIL) fail "  FAIL  $local_name" ;;
    SKIP) warn "  SKIP  $local_name" ;;
  esac
done

echo ""
if [[ $FAILURES -gt 0 ]]; then
  fail "$FAILURES suite(s) failed"
  exit 1
else
  ok "All suites passed or skipped"
  exit 0
fi

#!/usr/bin/env bash
# run-e2e.sh — Bring up infrastructure, start Sterling, run all E2E test suites.
#
# Usage:
#   bash scripts/run-e2e.sh                  # run tests, leave Docker running
#   bash scripts/run-e2e.sh --teardown       # run tests, then docker compose down
#   bash scripts/run-e2e.sh --sterling-dir=/path/to/sterling
#
# Environment:
#   STERLING_DIR   Path to the Sterling repo (default: ../sterling)

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

# ── PID tracking ───────────────────────────────────────────────────
STERLING_PID=""
STERLING_LOG="$PROJECT_ROOT/.sterling-e2e.log"
MLX_PID=""
MLX_LOG="$PROJECT_ROOT/.mlx-e2e.log"

cleanup() {
  info "Cleaning up..."
  if [[ -n "$STERLING_PID" ]] && kill -0 "$STERLING_PID" 2>/dev/null; then
    info "Stopping Sterling (PID $STERLING_PID)"
    kill "$STERLING_PID" 2>/dev/null || true
    wait "$STERLING_PID" 2>/dev/null || true
  fi
  rm -f "$STERLING_LOG"
  if [[ -n "$MLX_PID" ]] && kill -0 "$MLX_PID" 2>/dev/null; then
    info "Stopping MLX-LM sidecar (PID $MLX_PID)"
    kill "$MLX_PID" 2>/dev/null || true
    wait "$MLX_PID" 2>/dev/null || true
  fi
  rm -f "$MLX_LOG"
  if [[ "$TEARDOWN" == true ]]; then
    info "Tearing down Docker services..."
    docker compose down 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── 1. Docker up ─────────────────────────────────────────────────────
info "Starting Docker services..."
if ! command -v docker &>/dev/null; then
  fail "Docker is not installed or not in PATH"
  exit 1
fi

docker compose up -d

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

# ── 2. Sterling start ───────────────────────────────────────────────
STERLING_RUNNING=false

# Check if Sterling is already running on the expected port
if command -v lsof &>/dev/null && lsof -Pi :8766 -sTCP:LISTEN -t &>/dev/null; then
  ok "Sterling is already running on port 8766"
  STERLING_RUNNING=true
fi

if [[ "$STERLING_RUNNING" == false ]]; then
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
    MAX_TRIES=30  # 30 x 2s = 60s
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
      sleep 2
    done

    if [[ "$STERLING_RUNNING" == true ]]; then
      ok "Sterling server is ready (PID $STERLING_PID)"
    else
      warn "Sterling did not become ready in 60s — Sterling E2E tests will be skipped"
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

if lsof -Pi :5002 -sTCP:LISTEN -t &>/dev/null; then
  ok "MLX-LM sidecar is already running on port 5002"
  MLX_RUNNING=true
fi

if [[ "$MLX_RUNNING" == false ]]; then
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

# Suite 1: Solver class E2E (needs Sterling — start it above or manually)
if [[ "$STERLING_RUNNING" == true ]]; then
  run_suite \
    "Solver Class E2E" \
    "STERLING_E2E=1" \
    "packages/planning/src/sterling/__tests__/solver-class-e2e.test.ts"
else
  skip_suite "Solver Class E2E" "Sterling not started (see setup instructions above)"
fi

# Suite 2: Performance baseline E2E (needs Sterling)
if [[ "$STERLING_RUNNING" == true ]]; then
  run_suite \
    "Performance Baseline E2E" \
    "STERLING_E2E=1" \
    "packages/planning/src/sterling/__tests__/performance-baseline-e2e.test.ts"
else
  skip_suite "Performance Baseline E2E" "Sterling not started (see setup instructions above)"
fi

# Suite 3: Tool progression integration (auto-detect)
run_suite \
  "Tool Progression Integration" \
  "" \
  "packages/planning/src/sterling/__tests__/tool-progression-integration.test.ts"

# Suite 4: Crafting grid integration (requires Minecraft)
if [[ "$MC_READY" == true ]]; then
  run_suite \
    "Crafting Grid Integration" \
    "MINECRAFT_SERVER_AVAILABLE=true" \
    "packages/minecraft-interface/src/__tests__/crafting-grid-integration.test.ts"
else
  skip_suite "Crafting Grid Integration" "Minecraft server not available"
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

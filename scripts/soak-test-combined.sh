#!/usr/bin/env bash
#
# Combined Soak Test Runner
#
# Runs both agency and memory soak tests in parallel, then produces a unified report.
#
# Tests:
#   1. Agency Emission Soak — cognition → planning pipeline (goal extraction, task lifecycle)
#   2. Reflection Persistence Soak — memory service pipeline (deduplication, metadata threading)
#
# Prerequisites:
#   - All services running (pnpm start)
#   - Bot connected to Minecraft server
#   - Embedding service healthy (Ollama or MLX-LM)
#
# Usage:
#   ./scripts/soak-test-combined.sh [duration_minutes]
#
# Default duration: 5 minutes (reflection soak is fixed ~5min, agency matches)
#
# Output:
#   - Individual logs in docs/testing/soak-results/
#   - Combined summary printed to stdout
#

set -uo pipefail

DURATION_MIN="${1:-5}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="$(dirname "$0")/../docs/testing/soak-results"
AGENCY_LOG="${OUTPUT_DIR}/agency-${TIMESTAMP}.log"
REFLECTION_LOG="${OUTPUT_DIR}/reflection-${TIMESTAMP}.log"
COMBINED_REPORT="${OUTPUT_DIR}/combined-${TIMESTAMP}.json"

mkdir -p "$OUTPUT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         COMBINED SOAK TEST RUNNER                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Duration:    ${YELLOW}${DURATION_MIN} minutes${NC}"
echo -e "Timestamp:   ${TIMESTAMP}"
echo -e "Output dir:  ${OUTPUT_DIR}"
echo ""

# ============================================================================
# Preflight Checks
# ============================================================================

echo -e "${BLUE}[preflight]${NC} Checking services..."

COGNITION_URL="${COGNITION_ENDPOINT:-http://localhost:3003}"
PLANNING_URL="${PLANNING_ENDPOINT:-http://localhost:3002}"
MEMORY_URL="${MEMORY_ENDPOINT:-http://localhost:3001}"
MC_URL="${MINECRAFT_ENDPOINT:-http://localhost:3005}"

check_service() {
  local name="$1"
  local url="$2"
  local status
  status=$(curl -sf "${url}/health" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo "unreachable")
  if [[ "$status" == "healthy" || "$status" == "connected" ]]; then
    echo -e "  ${GREEN}✓${NC} ${name}: ${status}"
    return 0
  else
    echo -e "  ${RED}✗${NC} ${name}: ${status}"
    return 1
  fi
}

PREFLIGHT_PASS=true
check_service "Cognition" "$COGNITION_URL" || PREFLIGHT_PASS=false
check_service "Planning" "$PLANNING_URL" || PREFLIGHT_PASS=false
check_service "Memory" "$MEMORY_URL" || PREFLIGHT_PASS=false
check_service "Minecraft" "$MC_URL" || PREFLIGHT_PASS=false

# Check embedding service via memory status
EMBEDDING_STATUS=$(curl -sf "${MEMORY_URL}/enhanced/status" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",{}).get("services",{}).get("embeddingService","?"))' 2>/dev/null || echo "unknown")
if [[ "$EMBEDDING_STATUS" == "healthy" ]]; then
  echo -e "  ${GREEN}✓${NC} Embedding: ${EMBEDDING_STATUS}"
else
  echo -e "  ${YELLOW}⚠${NC} Embedding: ${EMBEDDING_STATUS} (reflection soak may fail)"
fi

if [[ "$PREFLIGHT_PASS" != "true" ]]; then
  echo ""
  echo -e "${RED}ERROR: Preflight failed. Ensure all services are running.${NC}"
  echo "  Run: pnpm start"
  exit 1
fi

echo ""
echo -e "${GREEN}All services healthy.${NC}"
echo ""

# ============================================================================
# Run Soak Tests in Parallel
# ============================================================================

echo -e "${BLUE}[soak]${NC} Starting parallel soak tests..."
echo ""

# Start agency soak in background
echo -e "  ${YELLOW}→${NC} Agency soak (${DURATION_MIN}min) → ${AGENCY_LOG}"
./scripts/soak-test-agency.sh "$DURATION_MIN" > "$AGENCY_LOG" 2>&1 &
AGENCY_PID=$!

# Start reflection soak in background
# Note: reflection soak has fixed ~5min duration, we run it regardless
echo -e "  ${YELLOW}→${NC} Reflection soak (~5min) → ${REFLECTION_LOG}"
npx tsx packages/memory/src/__tests__/reflection-soak-harness.ts --both > "$REFLECTION_LOG" 2>&1 &
REFLECTION_PID=$!

echo ""
echo -e "${BLUE}[soak]${NC} Tests running in background..."
echo "  Agency PID:     $AGENCY_PID"
echo "  Reflection PID: $REFLECTION_PID"
echo ""

# Progress indicator
ELAPSED=0
INTERVAL=30
DURATION_SEC=$((DURATION_MIN * 60))

while true; do
  # Check if both processes are still running
  AGENCY_RUNNING=false
  REFLECTION_RUNNING=false

  if kill -0 "$AGENCY_PID" 2>/dev/null; then
    AGENCY_RUNNING=true
  fi
  if kill -0 "$REFLECTION_PID" 2>/dev/null; then
    REFLECTION_RUNNING=true
  fi

  # If both are done, break
  if [[ "$AGENCY_RUNNING" == "false" && "$REFLECTION_RUNNING" == "false" ]]; then
    break
  fi

  # Progress update
  ELAPSED=$((ELAPSED + INTERVAL))
  ELAPSED_MIN=$((ELAPSED / 60))
  AGENCY_MARK="${GREEN}✓${NC}"
  REFLECTION_MARK="${GREEN}✓${NC}"
  [[ "$AGENCY_RUNNING" == "true" ]] && AGENCY_MARK="${YELLOW}⏳${NC}"
  [[ "$REFLECTION_RUNNING" == "true" ]] && REFLECTION_MARK="${YELLOW}⏳${NC}"

  echo -e "  [t=${ELAPSED_MIN}m] Agency: ${AGENCY_MARK}  Reflection: ${REFLECTION_MARK}"

  sleep $INTERVAL
done

# Wait for both to fully complete and capture exit codes
wait $AGENCY_PID
AGENCY_EXIT=$?
wait $REFLECTION_PID
REFLECTION_EXIT=$?

echo ""
echo -e "${BLUE}[soak]${NC} Both tests complete."
echo ""

# ============================================================================
# Parse Results and Generate Combined Report
# ============================================================================

echo -e "${BLUE}[report]${NC} Generating combined report..."

# Extract agency results
AGENCY_PASS="false"
AGENCY_DRIVE_TICKS=0
AGENCY_GOALS=0
AGENCY_TASKS_CREATED=0
AGENCY_DET_FAILURES=0
AGENCY_POSTCOND_FAILURES=0

if [[ -f "$AGENCY_LOG" ]]; then
  # Check for PASS/FAIL markers
  if grep -q "\[PASS\] Drive ticks fired" "$AGENCY_LOG"; then
    AGENCY_PASS="true"
  fi

  # Extract metrics from final analysis
  AGENCY_DRIVE_TICKS=$(grep -oP 'Drive-tick: \K\d+' "$AGENCY_LOG" | tail -1 || echo "0")
  AGENCY_GOALS=$(grep -oP 'With goals: \K\d+' "$AGENCY_LOG" | tail -1 || echo "0")
  AGENCY_TASKS_CREATED=$(grep -oP 'Total tasks: \K\d+' "$AGENCY_LOG" | tail -1 || echo "0")
  AGENCY_DET_FAILURES=$(grep -oP 'Deterministic failures: \K\d+' "$AGENCY_LOG" | tail -1 || echo "0")
  AGENCY_POSTCOND_FAILURES=$(grep -oP 'Postcondition failures: \K\d+' "$AGENCY_LOG" | tail -1 || echo "0")
fi

# Extract reflection results
REFLECTION_PASS="false"
REFLECTION_EVENTS=0
REFLECTION_DEDUPE_REJECTS=0
REFLECTION_VIOLATIONS=0
REFLECTION_SCHEMA_VALID=0

if [[ -f "$REFLECTION_LOG" ]]; then
  # Check for PASSED marker
  if grep -q "SOAK TEST PASSED" "$REFLECTION_LOG"; then
    REFLECTION_PASS="true"
  fi

  # Extract metrics
  REFLECTION_EVENTS=$(grep -oP 'Unique events: \K\d+' "$REFLECTION_LOG" | tail -1 || echo "0")
  REFLECTION_DEDUPE_REJECTS=$(grep -oP 'Dedupe \(status\): \K\d+' "$REFLECTION_LOG" | tail -1 || echo "0")
  REFLECTION_VIOLATIONS=$(grep -oP 'Violations: \K\d+' "$REFLECTION_LOG" | tail -1 || echo "0")
  REFLECTION_SCHEMA_VALID=$(grep -oP 'Schema valid: \K\d+' "$REFLECTION_LOG" | tail -1 || echo "0")
fi

# Determine overall pass/fail
OVERALL_PASS="true"
[[ "$AGENCY_EXIT" != "0" ]] && OVERALL_PASS="false"
[[ "$REFLECTION_EXIT" != "0" ]] && OVERALL_PASS="false"

# Generate JSON report
cat > "$COMBINED_REPORT" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "durationMinutes": ${DURATION_MIN},
  "overall": {
    "passed": ${OVERALL_PASS},
    "agencyPassed": ${AGENCY_PASS},
    "reflectionPassed": ${REFLECTION_PASS}
  },
  "agency": {
    "exitCode": ${AGENCY_EXIT},
    "logFile": "${AGENCY_LOG}",
    "metrics": {
      "driveTicks": ${AGENCY_DRIVE_TICKS:-0},
      "goalsExtracted": ${AGENCY_GOALS:-0},
      "tasksCreated": ${AGENCY_TASKS_CREATED:-0},
      "deterministicFailures": ${AGENCY_DET_FAILURES:-0},
      "postconditionFailures": ${AGENCY_POSTCOND_FAILURES:-0}
    }
  },
  "reflection": {
    "exitCode": ${REFLECTION_EXIT},
    "logFile": "${REFLECTION_LOG}",
    "metrics": {
      "uniqueEvents": ${REFLECTION_EVENTS:-0},
      "dedupeRejects": ${REFLECTION_DEDUPE_REJECTS:-0},
      "violations": ${REFLECTION_VIOLATIONS:-0},
      "schemaValid": ${REFLECTION_SCHEMA_VALID:-0}
    }
  }
}
EOF

echo "  Combined report: ${COMBINED_REPORT}"
echo ""

# ============================================================================
# Print Summary
# ============================================================================

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    SOAK TEST SUMMARY                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Agency results
if [[ "$AGENCY_PASS" == "true" ]]; then
  echo -e "${GREEN}✓ AGENCY SOAK PASSED${NC}"
else
  echo -e "${RED}✗ AGENCY SOAK FAILED${NC}"
fi
echo "  Drive ticks:           ${AGENCY_DRIVE_TICKS:-0}"
echo "  Goals extracted:       ${AGENCY_GOALS:-0}"
echo "  Tasks created:         ${AGENCY_TASKS_CREATED:-0}"
echo "  Deterministic failures: ${AGENCY_DET_FAILURES:-0}"
echo "  Postcondition failures: ${AGENCY_POSTCOND_FAILURES:-0}"
echo ""

# Reflection results
if [[ "$REFLECTION_PASS" == "true" ]]; then
  echo -e "${GREEN}✓ REFLECTION SOAK PASSED${NC}"
else
  echo -e "${RED}✗ REFLECTION SOAK FAILED${NC}"
fi
echo "  Unique events:         ${REFLECTION_EVENTS:-0}"
echo "  Dedupe rejects:        ${REFLECTION_DEDUPE_REJECTS:-0}"
echo "  Violations:            ${REFLECTION_VIOLATIONS:-0}"
echo "  Schema valid:          ${REFLECTION_SCHEMA_VALID:-0}"
echo ""

# Overall
echo "────────────────────────────────────────────────────────────"
if [[ "$OVERALL_PASS" == "true" ]]; then
  echo -e "${GREEN}OVERALL: PASSED ✓${NC}"
else
  echo -e "${RED}OVERALL: FAILED ✗${NC}"
fi
echo "────────────────────────────────────────────────────────────"
echo ""
echo "Logs:"
echo "  Agency:     ${AGENCY_LOG}"
echo "  Reflection: ${REFLECTION_LOG}"
echo "  Combined:   ${COMBINED_REPORT}"
echo ""

exit $([[ "$OVERALL_PASS" == "true" ]] && echo 0 || echo 1)

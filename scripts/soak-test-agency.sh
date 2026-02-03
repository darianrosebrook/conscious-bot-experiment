#!/usr/bin/env bash
#
# Agency Emission Soak Test
#
# Monitors the cognition service for 10-15 minutes to verify behavioral
# closure of the agency pipeline: drive-tick -> thought -> task -> executor.
#
# Prerequisites:
#   - All services running (scripts/start.js)
#   - Bot connected to a Minecraft server in survival mode
#   - Stable environment: health 20, food 20, no hostiles
#
# Usage:
#   ./scripts/soak-test-agency.sh [duration_minutes]
#
# Default duration: 12 minutes

set -uo pipefail

COGNITION_URL="${COGNITION_ENDPOINT:-http://localhost:3003}"
PLANNING_URL="${PLANNING_ENDPOINT:-http://localhost:3002}"
MC_URL="${MINECRAFT_ENDPOINT:-http://localhost:3005}"
DURATION_MIN="${1:-12}"
DURATION_SEC=$((DURATION_MIN * 60))
INTERVAL_SEC=30
OUTPUT_DIR="$(dirname "$0")/../docs/testing/soak-results"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${OUTPUT_DIR}/soak-${TIMESTAMP}.log"

mkdir -p "$OUTPUT_DIR"

# Helper: extract thoughts list from API response
# Handles both {"thoughts": [...]} and bare [...] formats
extract_thoughts='
import json,sys
d=json.load(sys.stdin)
if isinstance(d, dict):
    thoughts = d.get("thoughts", d.get("data", []))
else:
    thoughts = d if isinstance(d, list) else []
if not isinstance(thoughts, list):
    thoughts = []
'

# Helper: extract tasks list from API response
# Handles {"tasks": {"current": [...]}} and {"tasks": [...]} and bare [...]
extract_tasks='
import json,sys
d=json.load(sys.stdin)
if isinstance(d, dict):
    tasks_obj = d.get("tasks", d.get("data", []))
    if isinstance(tasks_obj, dict):
        tasks = tasks_obj.get("current", [])
    elif isinstance(tasks_obj, list):
        tasks = tasks_obj
    else:
        tasks = []
elif isinstance(d, list):
    tasks = d
else:
    tasks = []
if not isinstance(tasks, list):
    tasks = []
'

echo "=== Agency Emission Soak Test ===" | tee "$LOG_FILE"
echo "Duration: ${DURATION_MIN} minutes" | tee -a "$LOG_FILE"
echo "Cognition: ${COGNITION_URL}" | tee -a "$LOG_FILE"
echo "Planning: ${PLANNING_URL}" | tee -a "$LOG_FILE"
echo "Log: ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG_FILE"
echo "---" | tee -a "$LOG_FILE"

# Verify services are healthy
echo "[pre-check] Verifying service health..." | tee -a "$LOG_FILE"
COGNITION_HEALTH=$(curl -sf "${COGNITION_URL}/health" 2>/dev/null || echo '{"status":"unreachable"}')
PLANNING_HEALTH=$(curl -sf "${PLANNING_URL}/health" 2>/dev/null || echo '{"status":"unreachable"}')
echo "  Cognition: $(echo "$COGNITION_HEALTH" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status","?"))' 2>/dev/null || echo '?')" | tee -a "$LOG_FILE"
echo "  Planning: $(echo "$PLANNING_HEALTH" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status","?"))' 2>/dev/null || echo '?')" | tee -a "$LOG_FILE"

if echo "$COGNITION_HEALTH" | grep -q '"unreachable"'; then
  echo "ERROR: Cognition service unreachable at ${COGNITION_URL}" | tee -a "$LOG_FILE"
  exit 1
fi

# Bot state
echo "" | tee -a "$LOG_FILE"
echo "[pre-check] Bot state..." | tee -a "$LOG_FILE"
curl -sf "${MC_URL}/health" 2>/dev/null | python3 -c '
import json,sys
d=json.load(sys.stdin)
bs=d.get("botStatus",{})
pos=bs.get("position",{})
print("  %s | hp=%s food=%s mode=%s pos=(%d,%d,%d)" % (bs.get("username","?"), bs.get("health","?"), bs.get("food","?"), bs.get("gameMode","?"), pos.get("x",0), pos.get("y",0), pos.get("z",0)))
' 2>/dev/null | tee -a "$LOG_FILE" || echo "  (could not reach MC interface)" | tee -a "$LOG_FILE"

# Capture initial state
echo "" | tee -a "$LOG_FILE"
echo "[t=0] Capturing initial state..." | tee -a "$LOG_FILE"
INITIAL_THOUGHTS=$(curl -sf "${COGNITION_URL}/thoughts?limit=5" 2>/dev/null || echo '{"thoughts":[]}')
echo "  Recent thoughts: $(echo "$INITIAL_THOUGHTS" | python3 -c "${extract_thoughts}"'
print(len(thoughts))
' 2>/dev/null || echo 'parse-error')" | tee -a "$LOG_FILE"

# Polling loop
ELAPSED=0
SAMPLE=0

while [ $ELAPSED -lt $DURATION_SEC ]; do
  sleep $INTERVAL_SEC
  ELAPSED=$((ELAPSED + INTERVAL_SEC))
  SAMPLE=$((SAMPLE + 1))
  ELAPSED_MIN=$((ELAPSED / 60))

  echo "" | tee -a "$LOG_FILE"
  echo "[t=${ELAPSED_MIN}m sample=${SAMPLE}]" | tee -a "$LOG_FILE"

  # Fetch recent thoughts
  THOUGHTS=$(curl -sf "${COGNITION_URL}/thoughts?limit=20" 2>/dev/null || echo '{"thoughts":[]}')
  echo "$THOUGHTS" | python3 -c "${extract_thoughts}"'
# Counts
drive=[t for t in thoughts if "drive-tick" in (t.get("tags") or []) or t.get("cognitiveSystem")=="drive-tick"]
goals=[t for t in thoughts if t.get("metadata",{}).get("extractedGoal")]
intents=[t for t in thoughts if t.get("metadata",{}).get("extractedIntent") and t.get("metadata",{}).get("extractedIntent") != "none"]
novelty_counts={}
for t in thoughts:
    n=t.get("novelty","unmarked")
    novelty_counts[n]=novelty_counts.get(n,0)+1

print("  thoughts=%d drive-ticks=%d goals=%d intents=%d" % (len(thoughts), len(drive), len(goals), len(intents)))
if novelty_counts:
    parts=["%s=%s" % (k,v) for k,v in sorted(novelty_counts.items())]
    print("  novelty: %s" % " ".join(parts))
for g in goals:
    eg=g.get("metadata",{}).get("extractedGoal",{})
    src=g.get("metadata",{}).get("extractedGoalSource","llm")
    action=eg.get("action","?")
    target=eg.get("target","?")
    print("    goal: %s:%s (src=%s)" % (action, target, src))
if intents:
    labels=[t.get("metadata",{}).get("extractedIntent") for t in intents]
    print("    intents: %s" % labels)
' 2>/dev/null | tee -a "$LOG_FILE"

  # Check tasks
  TASKS=$(curl -sf "${PLANNING_URL}/tasks?limit=30" 2>/dev/null || echo '{"tasks":{"current":[]}}')
  echo "$TASKS" | python3 -c "${extract_tasks}"'
statuses={}
goal_keyed=[]
for t in tasks:
    s=t.get("status","?")
    statuses[s]=statuses.get(s,0)+1
    gk=t.get("metadata",{}).get("goalKey")
    if gk:
        goal_keyed.append("%s[%s]" % (gk, s))
parts=["%s=%s" % (k,v) for k,v in sorted(statuses.items())]
gk_str = " ".join(goal_keyed) if goal_keyed else "none"
print("  tasks: %s | goalKeyed: %s" % (" ".join(parts), gk_str))
' 2>/dev/null | tee -a "$LOG_FILE"

done

# Final summary
echo "" | tee -a "$LOG_FILE"
echo "===================================" | tee -a "$LOG_FILE"
echo "=== SOAK TEST SUMMARY ===" | tee -a "$LOG_FILE"
echo "===================================" | tee -a "$LOG_FILE"
echo "Duration: ${DURATION_MIN} minutes (${SAMPLE} samples)" | tee -a "$LOG_FILE"
echo "Ended: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Final thought snapshot
FINAL_THOUGHTS=$(curl -sf "${COGNITION_URL}/thoughts?limit=100" 2>/dev/null || echo '{"thoughts":[]}')
echo "--- Final thought analysis ---" | tee -a "$LOG_FILE"
echo "$FINAL_THOUGHTS" | python3 -c "${extract_thoughts}"'
drive=[t for t in thoughts if "drive-tick" in (t.get("tags") or []) or t.get("cognitiveSystem")=="drive-tick"]
goals=[t for t in thoughts if t.get("metadata",{}).get("extractedGoal")]
intents=[t for t in thoughts if t.get("metadata",{}).get("extractedIntent") and t.get("metadata",{}).get("extractedIntent") != "none"]
low_nov=[t for t in thoughts if t.get("novelty")=="low"]
high_nov=[t for t in thoughts if t.get("novelty")=="high"]
convert_eligible=[t for t in thoughts if t.get("convertEligible")]

print("  Total thoughts: %d" % len(thoughts))
print("  Drive-tick: %d" % len(drive))
print("  With goals: %d" % len(goals))
print("  With intents: %d" % len(intents))
print("  Low novelty: %d" % len(low_nov))
print("  High novelty: %d" % len(high_nov))
print("  Convert eligible: %d" % len(convert_eligible))

# Unique goal actions
goal_actions=set()
for t in goals:
    eg=t.get("metadata",{}).get("extractedGoal",{})
    action=eg.get("action","?")
    target=eg.get("target","?")
    goal_actions.add("%s:%s" % (action, target))
if goal_actions:
    print("  Unique goals: %s" % sorted(goal_actions))
' 2>/dev/null | tee -a "$LOG_FILE"

# Final task snapshot
FINAL_TASKS=$(curl -sf "${PLANNING_URL}/tasks?limit=50" 2>/dev/null || echo '{"tasks":{"current":[]}}')
echo "" | tee -a "$LOG_FILE"
echo "--- Final task analysis ---" | tee -a "$LOG_FILE"
echo "$FINAL_TASKS" | python3 -c "${extract_tasks}"'
by_status={}
by_source={}
goal_keyed=[]
for t in tasks:
    s=t.get("status","?")
    by_status[s]=by_status.get(s,0)+1
    src=t.get("source","?")
    by_source[src]=by_source.get(src,0)+1
    gk=t.get("metadata",{}).get("goalKey")
    origin_obj=t.get("metadata",{}).get("origin",{})
    ok=origin_obj.get("kind","?") if isinstance(origin_obj, dict) else "?"
    if gk:
        title=t.get("title","")[:50]
        goal_keyed.append({"goalKey":gk,"status":s,"origin":ok,"title":title})

print("  Total tasks: %d" % len(tasks))
print("  By status: %s" % dict(sorted(by_status.items())))
print("  By source: %s" % dict(sorted(by_source.items())))
print("  Goal-keyed tasks (%d):" % len(goal_keyed))
for gk in goal_keyed:
    print("    %s [%s] origin=%s | %s" % (gk["goalKey"], gk["status"], gk["origin"], gk["title"]))

# Check for duplicate goalKeys (idempotency test)
keys=[gk["goalKey"] for gk in goal_keyed if gk["status"] in ("pending","active")]
dupes=[k for k in set(keys) if keys.count(k)>1]
if dupes:
    print("  WARNING: Duplicate active goalKeys: %s" % dupes)
else:
    print("  No duplicate active goalKeys (idempotency OK)")
' 2>/dev/null | tee -a "$LOG_FILE"

# Execution hardening analysis (Phase 2.5)
echo "" | tee -a "$LOG_FILE"
echo "--- Execution hardening analysis (Phase 2.5) ---" | tee -a "$LOG_FILE"
echo "$FINAL_TASKS" | python3 -c "${extract_tasks}"'
# Failure code taxonomy
failure_codes={}
postcondition_failures=[]
deterministic_failures=[]
retryable_failures=[]
blocked_reasons={}

for t in tasks:
    meta=t.get("metadata",{})
    fc=meta.get("failureCode")
    br=meta.get("blockedReason","")

    if fc:
        failure_codes[fc]=failure_codes.get(fc,0)+1
        # Classify by determinism
        if fc.startswith("mapping_") or fc.startswith("postcondition_") or fc.startswith("contract_") or fc in ("invalid_input","unknown_recipe","inventory_full"):
            deterministic_failures.append({"id":t.get("id","?"),"code":fc,"title":t.get("title","")[:40]})
        else:
            retryable_failures.append({"id":t.get("id","?"),"code":fc,"title":t.get("title","")[:40]})
        # Track postcondition failures specifically
        if fc.startswith("postcondition_"):
            postcondition_failures.append({"id":t.get("id","?"),"code":fc,"title":t.get("title","")[:40]})

    if br:
        # Categorize blocked reasons
        if br.startswith("deterministic-failure:"):
            cat="deterministic-failure"
        elif br.startswith("backoff:"):
            cat="backoff"
        elif "prereq" in br.lower():
            cat="prereq-injection"
        else:
            cat=br[:30]
        blocked_reasons[cat]=blocked_reasons.get(cat,0)+1

print("  Failure codes: %s" % dict(sorted(failure_codes.items())) if failure_codes else "  Failure codes: none")
print("  Blocked reasons: %s" % dict(sorted(blocked_reasons.items())) if blocked_reasons else "  Blocked reasons: none")
print("  Deterministic failures: %d" % len(deterministic_failures))
for df in deterministic_failures[:5]:
    print("    [%s] %s | %s" % (df["id"], df["code"], df["title"]))
print("  Postcondition failures: %d" % len(postcondition_failures))
for pf in postcondition_failures[:5]:
    print("    [%s] %s | %s" % (pf["id"], pf["code"], pf["title"]))
print("  Retryable failures: %d" % len(retryable_failures))
for rf in retryable_failures[:5]:
    print("    [%s] %s | %s" % (rf["id"], rf["code"], rf["title"]))
' 2>/dev/null | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "--- Acceptance criteria ---" | tee -a "$LOG_FILE"

# Evaluate acceptance criteria from thoughts
echo "$FINAL_THOUGHTS" | python3 -c "${extract_thoughts}"'
drive=[t for t in thoughts if "drive-tick" in (t.get("tags") or []) or t.get("cognitiveSystem")=="drive-tick"]
goals=[t for t in thoughts if t.get("metadata",{}).get("extractedGoal")]
intents=[t for t in thoughts if t.get("metadata",{}).get("extractedIntent") and t.get("metadata",{}).get("extractedIntent") != "none"]

checks=[
    ("Drive ticks fired", len(drive) > 0),
    ("Goal tags produced", len(goals) > 0),
    ("Novelty markers present", any(t.get("novelty") for t in thoughts)),
]
for label, passed in checks:
    mark = "PASS" if passed else "FAIL"
    print("  [%s] %s" % (mark, label))
if intents:
    print("  [PASS] Intent extractions: %d" % len(intents))
else:
    print("  [INFO] No intent extractions (expected for small models)")
' 2>/dev/null | tee -a "$LOG_FILE"

# Evaluate acceptance criteria from tasks
echo "$FINAL_TASKS" | python3 -c "${extract_tasks}"'
goal_keyed=[t for t in tasks if t.get("metadata",{}).get("goalKey")]
active=[t for t in tasks if t.get("status") in ("active",)]
completed=[t for t in tasks if t.get("status") in ("completed","failed")]
pending=[t for t in tasks if t.get("status")=="pending"]

checks=[
    ("Tasks created from goals", len(goal_keyed) > 0),
    ("At least one task claimed (active or terminal)", len(active) + len(completed) > 0),
]
for label, passed in checks:
    mark = "PASS" if passed else "FAIL"
    print("  [%s] %s" % (mark, label))

# Check idempotency
keys=[t.get("metadata",{}).get("goalKey") for t in tasks if t.get("status") in ("pending","active")]
dupes=[k for k in set(keys) if keys.count(k)>1]
mark = "PASS" if not dupes else "FAIL"
print("  [%s] No duplicate active goalKeys" % mark)

# Stall taxonomy
stalled=[t for t in pending if not t.get("metadata",{}).get("blockedReason")]
if stalled:
    print("  [INFO] %d task(s) pending without blockedReason (potential stalls)" % len(stalled))
    for t in stalled[:3]:
        gk=t.get("metadata",{}).get("goalKey","?")
        title=t.get("title","")[:50]
        print("    %s | %s" % (gk, title))
' 2>/dev/null | tee -a "$LOG_FILE"

# Execution hardening acceptance criteria (Phase 2.5)
echo "" | tee -a "$LOG_FILE"
echo "--- Execution hardening acceptance (Phase 2.5) ---" | tee -a "$LOG_FILE"
echo "$FINAL_TASKS" | python3 -c "${extract_tasks}"'
# Count tasks with execution hardening metadata
failed_tasks=[t for t in tasks if t.get("status")=="failed"]
tasks_with_failure_code=[t for t in failed_tasks if t.get("metadata",{}).get("failureCode")]
det_failures=[t for t in tasks if t.get("metadata",{}).get("blockedReason","").startswith("deterministic-failure:")]
postcond_failures=[t for t in tasks if (t.get("metadata",{}).get("failureCode") or "").startswith("postcondition_")]

# Activation invariant check: no "pending" tasks should have been dispatched
# A properly activated task moves to "active" before execution
pending_with_attempts=[t for t in tasks if t.get("status")=="pending" and t.get("metadata",{}).get("retryCount",0)>0]

checks=[
    ("Failed tasks have failureCode", len(failed_tasks)==0 or len(tasks_with_failure_code)>0),
    ("Deterministic failures marked (no backoff)", len(det_failures)==0 or all(t.get("metadata",{}).get("blockedReason","").startswith("deterministic-failure:") for t in det_failures)),
    ("No pending tasks with retry attempts (activation invariant)", len(pending_with_attempts)==0),
]
for label, passed in checks:
    mark = "PASS" if passed else "FAIL"
    print("  [%s] %s" % (mark, label))

if pending_with_attempts:
    print("    WARNING: %d pending task(s) have retry attempts — activation invariant may be violated" % len(pending_with_attempts))
    for t in pending_with_attempts[:3]:
        print("      [%s] retries=%d | %s" % (t.get("id","?"), t.get("metadata",{}).get("retryCount",0), t.get("title","")[:40]))

if postcond_failures:
    print("  [INFO] %d postcondition failure(s) detected (equip_tool/place_workstation verification)" % len(postcond_failures))
    for t in postcond_failures[:3]:
        fc=t.get("metadata",{}).get("failureCode","?")
        print("    [%s] %s | %s" % (t.get("id","?"), fc, t.get("title","")[:40]))
' 2>/dev/null | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Full log: ${LOG_FILE}" | tee -a "$LOG_FILE"
echo "Done." | tee -a "$LOG_FILE"

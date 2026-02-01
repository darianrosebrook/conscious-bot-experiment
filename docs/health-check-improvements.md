# Health Check Improvements

## Problem

The startup script was reporting health check timeouts even though services were actually running and healthy. This was causing confusion and made it appear that services were failing when they were actually working correctly.

## Root Cause Analysis

The issue was in the health check configuration in `scripts/start.js`:

1. **Insufficient timeout values**: 5-second timeout per request was too short for services during startup
2. **Inadequate retry attempts**: 30 attempts with 2-second intervals (60 seconds total) wasn't enough for slower-starting services
3. **Poor feedback**: No timing information to understand how long services were taking to start
4. **Concurrent health checks**: All services were checked simultaneously, potentially overwhelming the system

## Solutions Implemented

### 1. Enhanced Health Check Configuration

**File**: `scripts/start.js`

**Changes**:
- Increased `maxAttempts` from 30 to 60 (120 seconds total timeout)
- Increased request timeout from 5s to 10s per attempt
- Added timing information to all log messages
- Reduced log verbosity (every 10 attempts instead of 5)
- Changed from concurrent to sequential health checks
- Increased initial wait time from 5s to 8s before starting health checks

**Before**:
```javascript
async function waitForService(url, serviceName, maxAttempts = 30) {
  // 5-second timeout, 30 attempts = 60 seconds total
  req.setTimeout(5000, () => { ... });
}
```

**After**:
```javascript
async function waitForService(url, serviceName, maxAttempts = 60) {
  // 10-second timeout, 60 attempts = 120 seconds total
  req.setTimeout(10000, () => { ... });
  // Added timing information: "✅ Service is ready! (12.3s)"
}
```

### 2. Sequential Health Checks

**Before**: All services checked simultaneously
```javascript
await Promise.all(
  processes.map(({ service }) =>
    waitForService(service.healthUrl, service.name)
  )
);
```

**After**: Services checked one at a time with delays
```javascript
for (const { service } of processes) {
  await waitForService(service.healthUrl, service.name);
  await wait(500); // 500ms delay between checks
}
```

### 3. Health Check Diagnostic Tool

**New File**: `scripts/health-check-diagnostic.js`

A comprehensive diagnostic tool that provides:

- **System resource monitoring**: Memory and CPU usage
- **Process verification**: Lists all running Node.js processes
- **Individual service testing**: Tests each health endpoint with detailed timing
- **Troubleshooting guidance**: Provides specific steps for common issues
- **Detailed reporting**: Shows exactly what's working and what isn't

**Usage**:
```bash
pnpm health
# or
node scripts/health-check-diagnostic.js
```

**Sample Output**:
```
🔍 Conscious Bot Health Check Diagnostic
==========================================

📊 System Resources:
  Memory: 59GB / 64GB (92% used)
  CPU Load: 5.04 (50% of 10 cores)

🏥 Health Check Results:
 ✅ Dashboard: Healthy (94ms)
 ✅ Core API: Healthy (3ms)
 ✅ Minecraft Interface: Healthy (5ms)
 ✅ Cognition: Healthy (2ms)
 ✅ Memory: Healthy (4ms)
 ✅ World: Healthy (3ms)
 ✅ Planning: Healthy (3ms)

📋 Summary:
  7/7 services are healthy
```

## Verification

After implementing these improvements:

1. **All services start successfully** with proper timing information
2. **Health checks are more reliable** with longer timeouts and better retry logic
3. **Diagnostic tool provides clear feedback** about system status
4. **Startup process is more robust** with sequential health checks

## Troubleshooting

If you still experience health check issues:

1. **Run the diagnostic tool**:
   ```bash
   pnpm health
   ```

2. **Check system resources**:
   - High memory usage (>90%) can slow down services
   - High CPU load can cause timeouts

3. **Verify service logs**:
   ```bash
   pnpm status
   ```

4. **Restart services**:
   ```bash
   pnpm kill && pnpm start
   ```

5. **Check port conflicts**:
   ```bash
   lsof -i :3000-3010
   ```

## Execution Readiness Gate (February 2025)

A runtime readiness layer was added to gate executor enablement without blocking server startup.

### ReadinessMonitor

`packages/planning/src/server/execution-readiness.ts` provides `ReadinessMonitor`, which probes service health endpoints at startup and re-probes every 2 minutes.

**Probed services**: minecraft, memory, cognition, dashboard

**Tri-state per service**: `up` (2xx), `unhealthy` (non-2xx), `down` (network error)

**Executor gating**: The executor only starts when all `executionRequired` services (default: `['minecraft']`) are `up` AND results are fresh (within 120s). If minecraft is down at startup, the executor defers and starts automatically when re-probe detects it coming online.

**State-change logging**: Only transitions are logged (e.g., `[readiness] minecraft: down → up`). Steady-state silence eliminates the 95+ ECONNREFUSED lines/minute that previously masked real errors.

### Resilient Fetch Log Dedup

`packages/core/src/utils/resilient-service-client.ts` now deduplicates failure logs using a bounded LRU map:

- **Key**: `label:errorKind` (e.g., `mc/health:ECONNREFUSED`)
- **Error classes**: ECONNREFUSED, ETIMEDOUT, timeout, fetch_failed, unknown — different classes for the same label are logged independently
- **Cooldown**: 60s between duplicate warns for the same key (override: `RESILIENT_FETCH_DEDUP_COOLDOWN_MS`)
- **Capacity**: 64 entries with LRU eviction (override: `RESILIENT_FETCH_DEDUP_MAX`)
- **Silent mode**: `silent: true` option suppresses all logging (used by readiness probes and memory discovery)
- **Hot-but-suppressed keys** refresh their LRU position to prevent eviction by cold keys

### State-Change Logging Pattern

Applied across the planning package:

- **Memory discovery** (`memory-integration.ts`): logs endpoint UP/DOWN transitions only
- **LiveStream integration** (`live-stream-integration.ts`): logs MC interface and Dashboard UP/DOWN transitions only
- **WorldState manager** (`world-state-manager.ts`): suppresses catch-block warns (resilientFetch owns the deduped warn)

## Future Improvements

- **Service dependency management**: Start services in dependency order
- **Health check metrics**: Track and report startup times over time
- **Automatic recovery**: Restart failed services automatically
- **Configuration validation**: Verify service configuration before startup

---

*Last updated: February 2025*
*Author: @darianrosebrook*

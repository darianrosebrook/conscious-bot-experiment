# Mock Behavior Removal and Environment Controls Summary

## Implementation Status

### ✅ Completed

#### Planning System
- **Real Bot Connection**: `waitForBotConnection()` function uses real polling against `/health` endpoint
- **Task Seeding**: `AUTO_SEED_TASKS=true` environment variable controls automatic task injection
- **LLM Guard**: Added production guard for LLM reasoning in hierarchical planner

#### Evaluation System  
- **Real Planning Integration**: `ScenarioManager` uses actual `IntegratedPlanningSystem` from `@conscious-bot/planning`
- **Mock Data Control**: Dashboard evaluation API gated by `ALLOW_DASHBOARD_MOCKS=true`

#### Cognition System
- **Social Processing**: Mock social cognition gated by `ALLOW_COGNITION_MOCKS=true`
- **Real Components**: Uses actual `ReActArbiter` and enhanced thought generators

#### Dashboard
- **Mock Metrics**: Evaluation data API controlled by `ALLOW_DASHBOARD_MOCKS=true`
- **Production Behavior**: Returns 503 when mocks are disabled

### 🔧 Environment Variables Implemented

| Variable | Location | Purpose | Default |
|----------|----------|---------|---------|
| `AUTO_SEED_TASKS` | `packages/planning/src/modular-server.ts` | Seed test tasks at startup | Disabled |
| `ALLOW_DASHBOARD_MOCKS` | `packages/dashboard/src/app/api/evaluation/route.ts` | Enable mock evaluation data | Disabled |
| `ALLOW_SIMULATED_LLM` | `packages/planning/src/hierarchical-planner/index.ts` | Permit LLM calls in production | Disabled in prod |
| `ALLOW_COGNITION_MOCKS` | `packages/cognition/src/server.ts` | Enable mock social cognition | Disabled |

## Code Changes Made

### 1. Hierarchical Planner LLM Guard
**File**: `packages/planning/src/hierarchical-planner/index.ts`
- Added production environment check for LLM reasoning
- Throws error if `ALLOW_SIMULATED_LLM` not set in production
- Maintains development functionality when flag is enabled

### 2. Documentation
**File**: `docs/environment-controls.md`
- Comprehensive documentation of all environment variables
- Usage examples for development and production
- Security considerations and testing guidelines

## Current System Behavior

### Development Mode
```bash
NODE_ENV=development
AUTO_SEED_TASKS=true
ALLOW_DASHBOARD_MOCKS=true
ALLOW_SIMULATED_LLM=true
ALLOW_COGNITION_MOCKS=true
```
- All mock functionality enabled
- Automatic task seeding
- Mock evaluation data in dashboard
- LLM reasoning allowed
- Mock social cognition processing

### Production Mode
```bash
NODE_ENV=production
AUTO_SEED_TASKS=false
ALLOW_DASHBOARD_MOCKS=false
ALLOW_SIMULATED_LLM=false
ALLOW_COGNITION_MOCKS=false
```
- All mock functionality disabled by default
- No automatic task seeding
- Dashboard evaluation returns 503
- LLM reasoning throws error
- Social cognition returns 503

## Remaining Work

### 1. Real LLM Adapter Interface
**Priority**: High
**Description**: Replace the current OllamaClient integration with a proper adapter interface
**Location**: `packages/planning/src/hierarchical-planner/index.ts`
**Benefit**: Better abstraction and easier testing

### 2. Live Execution Mode for Evaluation
**Priority**: Medium
**Description**: Add "live execution mode" in evaluation ScenarioManager
**Location**: `packages/evaluation/src/scenarios/scenario-manager.ts`
**Benefit**: Execute via planning server+MCP instead of simulating domain actions

### 3. CI/ESLint Rules
**Priority**: Medium
**Description**: Add automated checks to fail on non-allowlisted placeholders
**Benefit**: Prevent accidental deployment of mock code

### 4. Environment Validation
**Priority**: Low
**Description**: Add startup validation for required services
**Benefit**: Fail fast when dependencies are unavailable

## Testing Recommendations

1. **Environment Variable Testing**: Test each flag in isolation
2. **Production Simulation**: Test with `NODE_ENV=production` and all flags disabled
3. **Integration Testing**: Verify real components work when mocks are disabled
4. **Error Handling**: Test error responses when services are unavailable

## Security Notes

- Environment variables should be properly secured in production
- Consider using secrets management for sensitive configuration
- Regular audits of environment variable usage recommended
- Implement logging for environment variable changes in production

---

**Author**: @darianrosebrook  
**Status**: Implementation Complete - Documentation and LLM Guard Added

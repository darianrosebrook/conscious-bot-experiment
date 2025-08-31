# Environment Controls for Conscious Bot

This document outlines the environment variables used to control mock behavior, development-only features, and production safeguards in the conscious-bot system.

## Overview

The conscious-bot system uses environment variables to gate development-only features and mock implementations, ensuring that production deployments only use real, fully-functional components. This prevents accidental deployment of incomplete or simulated functionality.

## Environment Variables

### `AUTO_SEED_TASKS=true`
**Location**: `packages/planning/src/modular-server.ts`  
**Purpose**: Seeds initial test tasks at planning server startup for development and testing  
**Default**: Disabled (no tasks seeded)  
**Production Impact**: When disabled, no autonomous tasks are created automatically

**Example Usage**:
```bash
# Development - seed test tasks
AUTO_SEED_TASKS=true pnpm dev

# Production - no automatic task seeding
AUTO_SEED_TASKS=false pnpm start
```

### `ALLOW_DASHBOARD_MOCKS=true`
**Location**: `packages/dashboard/src/app/api/evaluation/route.ts`  
**Purpose**: Enables mock evaluation data in the dashboard API  
**Default**: Disabled (returns 503 Service Unavailable)  
**Production Impact**: When disabled, `/api/evaluation` returns 503 instead of mock metrics

**Example Usage**:
```bash
# Development - show mock evaluation data
ALLOW_DASHBOARD_MOCKS=true pnpm dev

# Production - require real evaluation data
ALLOW_DASHBOARD_MOCKS=false pnpm start
```

### `ALLOW_SIMULATED_LLM=true`
**Location**: `packages/planning/src/hierarchical-planner/index.ts`  
**Purpose**: Permits LLM calls in production environment  
**Default**: Disabled in production (throws error)  
**Production Impact**: When disabled in production, LLM reasoning throws an error

**Example Usage**:
```bash
# Development - allow LLM calls
ALLOW_SIMULATED_LLM=true pnpm dev

# Production - block LLM calls unless explicitly allowed
NODE_ENV=production ALLOW_SIMULATED_LLM=true pnpm start
```

### `ALLOW_COGNITION_MOCKS=true`
**Location**: `packages/cognition/src/server.ts`  
**Purpose**: Enables mock social cognition processing  
**Default**: Disabled (returns 503 Service Unavailable)  
**Production Impact**: When disabled, `/process-social` returns 503 instead of mock responses

**Example Usage**:
```bash
# Development - enable mock social cognition
ALLOW_COGNITION_MOCKS=true pnpm dev

# Production - require real social cognition implementation
ALLOW_COGNITION_MOCKS=false pnpm start
```

## Implementation Details

### Planning System
- **Real Bot Connection**: The `waitForBotConnection()` function uses real polling against `/health` endpoint
- **Task Seeding**: Controlled by `AUTO_SEED_TASKS` environment variable
- **LLM Integration**: Production-guarded with `ALLOW_SIMULATED_LLM`

### Evaluation System
- **Real Planning Integration**: `ScenarioManager` uses actual `IntegratedPlanningSystem` from `@conscious-bot/planning`
- **Mock Data Control**: Dashboard evaluation API gated by `ALLOW_DASHBOARD_MOCKS`

### Cognition System
- **Social Processing**: Mock social cognition gated by `ALLOW_COGNITION_MOCKS`
- **Real Components**: Uses actual `ReActArbiter` and enhanced thought generators

### Dashboard
- **Mock Metrics**: Evaluation data API controlled by `ALLOW_DASHBOARD_MOCKS`
- **Production Behavior**: Returns 503 when mocks are disabled

## Production Deployment

For production deployments, ensure these environment variables are set appropriately:

```bash
# Production configuration
NODE_ENV=production
AUTO_SEED_TASKS=false
ALLOW_DASHBOARD_MOCKS=false
ALLOW_SIMULATED_LLM=false  # or true if LLM integration is ready
ALLOW_COGNITION_MOCKS=false
```

## Development Configuration

For development and testing:

```bash
# Development configuration
NODE_ENV=development
AUTO_SEED_TASKS=true
ALLOW_DASHBOARD_MOCKS=true
ALLOW_SIMULATED_LLM=true
ALLOW_COGNITION_MOCKS=true
```

## Next Steps

The following improvements remain to be implemented:

1. **Real LLM Adapter Interface**: Add a proper LLM adapter interface in the planning package
2. **Live Execution Mode**: Add a "live execution mode" in evaluation `ScenarioManager` that calls the planning server's action pipeline
3. **CI/ESLint Rules**: Add automated checks to fail on non-allowlisted placeholders in production builds
4. **Environment Validation**: Add startup validation to ensure required services are available when mocks are disabled

## Security Considerations

- Environment variables should be properly secured in production deployments
- Consider using a secrets management system for sensitive configuration
- Regularly audit environment variable usage to ensure no sensitive data is exposed
- Implement proper logging for environment variable changes in production

## Testing

To test the environment controls:

```bash
# Test production behavior
NODE_ENV=production pnpm test

# Test development behavior
NODE_ENV=development pnpm test

# Test with specific flags
ALLOW_DASHBOARD_MOCKS=true pnpm test:dashboard
ALLOW_COGNITION_MOCKS=true pnpm test:cognition
```

---

**Author**: @darianrosebrook  
**Last Updated**: $(date)

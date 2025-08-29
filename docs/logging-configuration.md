# Logging Configuration

**Author:** @darianrosebrook  
**Date:** January 2025  
**Status:** Implemented

## Overview

The conscious bot system now uses configurable logging to reduce verbose output and provide better control over debug information. This system allows you to enable specific debug categories only when needed, significantly reducing log noise during normal operation.

## Problem Solved

Previously, the system was generating excessive logs:
- Environment updates every few seconds
- Inventory updates on every change
- Mini-map position updates continuously
- API request logs for every call
- Health check attempt logs every 2 seconds

This created a noisy console output that made it difficult to see important information.

## Solution Implemented

### 1. Conditional Logging

All verbose logging is now controlled through environment variables and conditional checks. Logs are only output when specific debug flags are enabled.

### 2. Debug Categories

The system supports the following debug categories:

| Category | Environment Variable | Description |
|----------|---------------------|-------------|
| `DEBUG_ENVIRONMENT` | `DEBUG_ENVIRONMENT=true` | Environment biome and time updates |
| `DEBUG_INVENTORY` | `DEBUG_INVENTORY=true` | Inventory item count changes |
| `DEBUG_RESOURCES` | `DEBUG_RESOURCES=true` | Resource scarcity level updates |
| `DEBUG_LIVESTREAM` | `DEBUG_LIVESTREAM=true` | Live stream status updates |
| `DEBUG_ACTIONS` | `DEBUG_ACTIONS=true` | Action execution logs |
| `DEBUG_FEEDBACK` | `DEBUG_FEEDBACK=true` | Visual feedback events |
| `DEBUG_MINIMAP` | `DEBUG_MINIMAP=true` | Mini-map position updates |
| `DEBUG_SCREENSHOTS` | `DEBUG_SCREENSHOTS=true` | Screenshot capture events |
| `DEBUG_API` | `DEBUG_API=true` | API request/response logs |

### 3. Health Check Optimization

The startup script now logs health check attempts less frequently (every 5 attempts instead of every attempt) to reduce verbosity.

## Usage

### Normal Operation (Quiet Logs)

By default, the system runs with minimal logging. Only critical errors and important status changes are logged.

### Enable Specific Debug Categories

To enable specific debug categories, set the corresponding environment variable:

```bash
# Enable only environment updates debugging
export DEBUG_ENVIRONMENT=true
pnpm dev

# Enable multiple categories
export DEBUG_ENVIRONMENT=true
export DEBUG_INVENTORY=true
export DEBUG_API=true
pnpm dev
```

### Development vs Production

Debug logging is automatically disabled in production environments. The system checks `NODE_ENV` and only enables debug logging when `NODE_ENV=development`.

## Implementation Details

### 1. Planning Server Logging

```typescript
// packages/planning/src/server.ts
enhancedEnvironmentIntegration.on('environmentUpdated', (environment) => {
  // Only log if there's a significant change or in debug mode
  if (process.env.NODE_ENV === 'development' && process.env.DEBUG_ENVIRONMENT === 'true') {
    console.log('Environment updated:', environment.biome, environment.timeOfDay);
  }
});
```

### 2. Dashboard API Logging

```typescript
// packages/dashboard/src/app/api/environment-updates/route.ts
// Only log in debug mode
if (process.env.NODE_ENV === 'development' && process.env.DEBUG_API === 'true') {
  console.log(`[Dashboard] POST /api/environment-updates 200 in ${duration}ms`);
}
```

### 3. Health Check Optimization

```javascript
// scripts/start.js
// Only log every 5 attempts to reduce verbosity
if (attempts - lastLogAttempt >= 5 || attempts === 1) {
  log(` ⏳ Attempt ${attempts}/${maxAttempts} - ${serviceName} starting...`, colors.yellow);
  lastLogAttempt = attempts;
}
```

## Benefits

1. **Reduced Noise**: Console output is now clean and focused on important information
2. **Configurable**: Easy to enable specific debug categories when needed
3. **Performance**: Reduced logging overhead in production
4. **Maintainable**: Simple conditional checks make it easy to modify logging behavior
5. **Developer Friendly**: Clear separation between normal operation and debugging

## Migration Notes

- All existing debug logs are now controlled by environment variables
- No changes needed to existing code - the system is backward compatible
- Debug categories can be enabled/disabled by setting environment variables
- Environment variables are checked at runtime

## Future Enhancements

1. **Log Levels**: Add support for different log levels (ERROR, WARN, INFO, DEBUG)
2. **Log Persistence**: Add option to persist debug logs to files
3. **Real-time Configuration**: Add API endpoints to change debug settings at runtime
4. **Metrics**: Add logging metrics to track which categories are most used

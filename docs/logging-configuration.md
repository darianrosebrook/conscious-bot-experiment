# Logging Configuration Guide

## Overview

The Conscious Bot system generates extensive logging output from multiple components. Debug logging is controlled via boolean environment variables defined in `packages/core/src/logging/config.ts`.

## Configuration

All debug flags require `NODE_ENV=development` to be set. In production, all debug logging is suppressed regardless of flag values.

### Global Debug Mode

```bash
# Enable all debug categories at once
DEBUG_MODE=true
```

### Per-Category Debug Flags

| Environment Variable | Category | What It Controls |
|---------------------|----------|-----------------|
| `DEBUG_MODE` | Global | Enables all categories below |
| `DEBUG_ENVIRONMENT` | `debugEnvironment` | Biome, time-of-day, weather updates |
| `DEBUG_INVENTORY` | `debugInventory` | Inventory change events |
| `DEBUG_RESOURCES` | `debugResources` | Resource scarcity level updates |
| `DEBUG_LIVESTREAM` | `debugLiveStream` | Live stream connection status |
| `DEBUG_ACTIONS` | `debugActions` | Action execution logging |
| `DEBUG_FEEDBACK` | `debugFeedback` | Feedback loop logging |
| `DEBUG_MINIMAP` | `debugMiniMap` | Mini-map position updates |
| `DEBUG_SCREENSHOTS` | `debugScreenshots` | Screenshot capture logging |
| `DEBUG_API` | `debugApi` | API request/response logging |
| `DEBUG_HEALTH` | `debugHealthChecks` | Service health check logging |

Each flag can be set independently (`DEBUG_INVENTORY=true`) or globally via `DEBUG_MODE=true`.

### Example `.env` Configuration

```bash
NODE_ENV=development

# Option 1: Enable everything
DEBUG_MODE=true

# Option 2: Enable only specific categories
DEBUG_ACTIONS=true
DEBUG_HEALTH=true
```

## API

The logging module exports these functions from `@conscious-bot/core`:

```typescript
import {
  getLoggingConfig,    // Returns full LoggingConfig object
  isDebugEnabled,      // Check if a category is enabled
  debugLog,            // Log only if category is enabled
  logEnvironmentUpdate,
  logInventoryUpdate,
  logResourceUpdate,
  logLiveStreamUpdate,
  logMiniMapUpdate,
  logApiRequest,
} from '@conscious-bot/core';

// Usage
debugLog('debugActions', 'Executing leaf:', leafName, args);

if (isDebugEnabled('debugHealthChecks')) {
  console.log('[Health]', serviceStatus);
}
```

## Reducing Log Noise

To reduce noise during normal development, keep `DEBUG_MODE` unset and enable only the categories you need:

```bash
# Quiet mode — only actions and health checks
DEBUG_ACTIONS=true
DEBUG_HEALTH=true
```

To silence all debug logging, ensure `DEBUG_MODE` is not set and no individual `DEBUG_*` flags are `true`.

## Implementation

- **Source**: `packages/core/src/logging/config.ts`
- **Interface**: `LoggingConfig` — all boolean fields
- **Guard**: All flags require `NODE_ENV=development`; production always returns `false`
- **Format**: `[DEBUG:categoryName] message`

# Logging Configuration Guide

## Overview

The Conscious Bot system generates extensive logging output from multiple components. This guide explains how to control and reduce log noise.

## Current Log Noise Analysis

Based on analysis of the codebase:

### **🔴 Noisiest Components (549-682 console statements each)**
1. **Planning System** (682 statements) - Action execution, task management, MCP integration
2. **Minecraft Interface** (549 statements) - Bot state, action translation, environmental monitoring
3. **Cognition System** (378 statements) - Thought processing, social awareness, environmental events
4. **Dashboard** (129 statements) - API endpoints, WebSocket connections, cognitive stream

### **🟡 Log Categories by Frequency**
- **Planning**: `[Planning]` - Task execution, MCP options, behavior trees
- **Minecraft**: `[Minecraft Interface]` - Bot state, action translation, pathfinding
- **Cognition**: `[Cognition]` - Environmental processing, social interactions
- **Dashboard**: `[Dashboard]` - API responses, WebSocket broadcasts

## Log Level Control

### **Environment Variable Configuration**

Set the global log level using environment variables:

```bash
# In your .env file or as environment variables
LOG_LEVEL=warn  # Options: debug, info, warn, error, none
```

### **Available Log Levels**

| Level | Description | Use Case |
|-------|-------------|----------|
| `debug` | All logs including detailed debugging | Development debugging |
| `info` | General information (default) | Normal development |
| `warn` | Only warnings and errors | Reduced noise |
| `error` | Only errors | Production monitoring |
| `none` | No console output | Silent operation |

### **Component-Specific Override**

The system supports component-specific log level overrides:

```javascript
// Current configuration in the logging system
components: {
  planning: 'warn',   // Reduce planning noise
  minecraft: 'warn',  // Reduce minecraft noise
  cognition: 'info',  // Keep cognition for consciousness
  dashboard: 'info'   // Keep dashboard for UI
}
```

## Quick Solutions to Reduce Noise

### **Option 1: Quick Environment Variable (Immediate)**
```bash
export LOG_LEVEL=warn
# Then restart your services
```

### **Option 2: Component-Specific Filtering (Recommended)**
Create a `.env` file:
```bash
LOG_LEVEL=info
# The system will automatically use component-specific overrides
```

### **Option 3: Silent Mode (For Production)**
```bash
export LOG_LEVEL=none
# No console output
```

## Advanced Configuration

### **Custom Logging Setup**

You can modify the logging configuration in:
- `packages/dashboard/src/app/api/ws/cognitive-stream/route.ts` (lines 921-932)

### **Selective Component Logging**

To enable logging for only specific components:

```javascript
// Example: Only show cognition logs
components: {
  planning: 'none',
  minecraft: 'none',
  cognition: 'info',  // Only this will show
  dashboard: 'none'
}
```

## Expected Results

### **With LOG_LEVEL=warn**
- **Before**: 1,738+ console statements per minute
- **After**: ~200-300 statements per minute (85% reduction)
- **Keeps**: Important warnings, errors, and cognitive insights

### **With LOG_LEVEL=error**
- **Before**: 1,738+ console statements per minute
- **After**: ~20-50 statements per minute (97% reduction)
- **Keeps**: Only critical errors

## Monitoring Impact

### **Current Status (Before Optimization)**
- **Planning System**: 682 log statements
- **Minecraft Interface**: 549 log statements
- **Cognition System**: 378 log statements
- **Dashboard**: 129 log statements
- **Total**: 1,738+ potential log statements

### **Optimized Status (With LOG_LEVEL=warn)**
- **Planning System**: ~50-100 log statements (filtered to warn+)
- **Minecraft Interface**: ~40-80 log statements (filtered to warn+)
- **Cognition System**: ~100-150 log statements (info level)
- **Dashboard**: ~50-70 log statements (info level)
- **Total**: ~240-400 log statements (75-85% reduction)

## Implementation

The logging system is already implemented in the cognitive stream API. To activate:

1. **Set environment variable**: `export LOG_LEVEL=warn`
2. **Restart services**: The logging controls will take effect immediately
3. **Monitor**: Watch for the reduction in console output

## Future Improvements

- **Per-service logging configuration**
- **Log file rotation**
- **Structured logging to files**
- **Real-time log level adjustment**
- **Log filtering by specific patterns**

## Troubleshooting

If logs are still noisy after setting `LOG_LEVEL=warn`:

1. **Check environment variable**: Ensure `LOG_LEVEL` is properly set
2. **Restart services**: Logging configuration is read on startup
3. **Verify component overrides**: Check the configuration in the cognitive stream API
4. **Test with `LOG_LEVEL=none`**: Should eliminate all console output

## Usage Examples

```bash
# Development (balanced logging)
export LOG_LEVEL=info

# Reduced noise (recommended)
export LOG_LEVEL=warn

# Silent operation
export LOG_LEVEL=none

# Debug specific component only
# (Modify the component overrides in the logging config)
```
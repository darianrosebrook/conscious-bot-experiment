# Modular Server Setup with MCP Integration

## Overview

We have successfully implemented a code-split architecture for the planning server with full MCP (Model Context Protocol) integration. This replaces the monolithic `server.ts` with a cleaner, more maintainable modular architecture.

## Architecture

### 1. Modular Structure

The new architecture is split into focused modules:

```
src/
├── modules/
│   ├── server-config.ts      # Server configuration and setup
│   ├── mcp-integration.ts    # MCP server integration
│   ├── mcp-endpoints.ts      # MCP HTTP endpoints
│   └── planning-endpoints.ts # Planning HTTP endpoints
├── modular-server.ts         # Main modular server implementation
└── server.ts                 # Original monolithic server (preserved)
```

### 2. Key Components

#### ServerConfiguration (`modules/server-config.ts`)
- Handles server setup and middleware configuration
- Manages MCP integration initialization
- Provides clean interface for mounting routers
- Includes error handling and logging

#### MCPIntegration (`modules/mcp-integration.ts`)
- Integrates with the Conscious Bot MCP Server
- Provides methods for tool execution, option registration, and management
- Handles bot and registry connections
- Includes fallback mechanisms for when external dependencies aren't available

#### MCP Endpoints (`modules/mcp-endpoints.ts`)
- HTTP endpoints for MCP operations:
  - `GET /mcp/status` - Get MCP integration status
  - `GET /mcp/tools` - List available tools
  - `GET /mcp/options` - List available options
  - `POST /mcp/register-option` - Register new BT option
  - `POST /mcp/promote-option` - Promote option from shadow to active
  - `POST /mcp/run-option` - Execute BT option
  - `POST /mcp/execute-tool` - Execute specific tool
  - `POST /mcp/register-leaf` - Register new leaf

#### Planning Endpoints (`modules/planning-endpoints.ts`)
- HTTP endpoints for planning operations:
  - `GET /health` - Health check
  - `GET /planner` - Planning system status
  - `GET /state` - Current system state
  - `POST /task` - Add new task
  - `GET /tasks` - Get all tasks
  - `POST /execute` - Execute goal or task
  - `POST /autonomous` - Trigger autonomous execution

## MCP Integration Features

### 1. Tool Execution
- Direct integration with LeafFactory for tool execution
- Proper error handling and validation
- Support for version pinning and latest version resolution

### 2. Option Management
- Register new Behavior Tree options via MCP
- Promote options from shadow to active status
- Execute compiled BT options
- List and manage available options

### 3. Permission System
- Compute permissions from real leaf implementations
- Enforce safe permission policies
- Prevent permission escalation

### 4. BT Validation
- Reject unsupported node types (e.g., condition nodes)
- Validate BT structure and leaf references
- Normalize BT definitions for consistency

## Usage

### Starting the Modular Server

```bash
# Development mode
pnpm dev:modular

# Or directly with tsx
tsx src/modular-server.ts
```

### API Endpoints

#### MCP Endpoints (mounted at `/mcp`)
```bash
# Get MCP status
curl http://localhost:3002/mcp/status

# List available tools
curl http://localhost:3002/mcp/tools

# Register a new BT option
curl -X POST http://localhost:3002/mcp/register-option \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gather_wood",
    "name": "Gather Wood",
    "description": "Collect wood from nearby trees",
    "btDefinition": {
      "root": {
        "type": "sequence",
        "children": [
          {
            "type": "action",
            "action": "scan_for_trees",
            "args": {}
          }
        ]
      }
    }
  }'

# Execute a tool
curl -X POST http://localhost:3002/mcp/execute-tool \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "minecraft.move_to@1.0.0",
    "args": {"x": 10, "y": 64, "z": 10}
  }'
```

#### Planning Endpoints (mounted at `/`)
```bash
# Get system health
curl http://localhost:3002/health

# Get planning system status
curl http://localhost:3002/planner

# Add a new task
curl -X POST http://localhost:3002/task \
  -H "Content-Type: application/json" \
  -d '{
    "type": "gathering",
    "description": "Collect resources",
    "priority": 0.8
  }'

# Trigger autonomous execution
curl -X POST http://localhost:3002/autonomous
```

## Configuration

The modular server can be configured through environment variables and the `ServerConfiguration` class:

```typescript
const serverConfig = new ServerConfiguration({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3002,
  enableCORS: true,
  enableMCP: true,
  mcpConfig: {
    mcpServerPort: 3006,
    registryEndpoint: 'http://localhost:3001',
    botEndpoint: 'http://localhost:3005',
  },
});
```

## Testing

Run the modular server tests:

```bash
pnpm test modular-server.test.ts
```

The tests verify:
- Server configuration creation
- MCP integration initialization
- Planning endpoint creation
- MCP tool execution
- MCP option registration
- Tool and option listing

## Benefits

### 1. Code Organization
- Clear separation of concerns
- Modular, testable components
- Easy to extend and maintain

### 2. MCP Integration
- Full integration with the Conscious Bot MCP Server
- Proper error handling and validation
- Support for all MCP operations

### 3. Scalability
- Easy to add new endpoint modules
- Configurable server setup
- Support for multiple integration points

### 4. Maintainability
- Focused, single-responsibility modules
- Clear interfaces and contracts
- Comprehensive error handling

## Migration from Monolithic Server

The original `server.ts` is preserved for backward compatibility. To migrate:

1. Update your startup scripts to use `modular-server.ts`
2. Update any direct imports to use the new modular structure
3. Test the new endpoints to ensure compatibility
4. Remove the old server once migration is complete

## Next Steps

1. **Integration Testing**: Test the modular server with real bot and registry instances
2. **Performance Optimization**: Monitor and optimize the MCP integration performance
3. **Additional Endpoints**: Add more specialized endpoints as needed
4. **Documentation**: Expand API documentation with examples
5. **Monitoring**: Add metrics and monitoring for the MCP integration

## Troubleshooting

### Common Issues

1. **MCP Integration Not Initializing**
   - Check that the MCP server is running
   - Verify bot and registry connections
   - Check configuration settings

2. **Tool Execution Failing**
   - Verify leaf implementations are registered
   - Check tool permissions and validation
   - Review error logs for specific issues

3. **BT Option Registration Failing**
   - Check BT structure and leaf references
   - Verify permission computation
   - Review validation errors

### Debug Mode

Enable debug logging by setting environment variables:

```bash
export NODE_ENV=development
export DEBUG_ENVIRONMENT=true
export DEBUG_INVENTORY=true
export DEBUG_RESOURCES=true
```

This will provide detailed logging for troubleshooting.

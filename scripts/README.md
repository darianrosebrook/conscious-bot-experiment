# Conscious Bot Startup Scripts

This directory contains scripts for managing the Conscious Bot system startup and development environment.

## Quick Start

To start the entire Conscious Bot system with a single command:

```bash
pnpm start
# or
pnpm dev
```

This will:
- ✅ Check system requirements (Node.js 18+, pnpm)
- 🔄 Clean up existing processes
- 📦 Install dependencies
- 🔨 Build all packages
- 🚀 Start all services
- 🔍 Monitor service health
- 🎉 Provide status and URLs

## Available Scripts

### `start.js` / `dev` - Main Startup Script
The primary script for starting the entire system. Handles everything from dependency installation to service monitoring.

**Usage:**
```bash
pnpm start
```

**Features:**
- System requirement validation
- Process cleanup
- Dependency management
- Package building
- Service orchestration
- Health monitoring
- Graceful shutdown

### `start-servers.js` - Legacy Server Manager
Legacy script for starting services without full system setup.

**Usage:**
```bash
node scripts/start-servers.js
```

### `dev.js` - Development Environment
Alternative development startup with enhanced monitoring.

**Usage:**
```bash
node scripts/dev.js
```

### `kill-servers.js` - Process Cleanup
Kills all running Conscious Bot processes.

**Usage:**
```bash
pnpm kill
```

### `status.js` - Service Status
Shows the status of all running services.

**Usage:**
```bash
pnpm status
```

## Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 3000 | Web dashboard for monitoring and control |
| Minecraft Interface | 3005 | Minecraft bot interface and control |
| Cognition | 3003 | Cognitive reasoning and decision making |
| Memory | 3001 | Memory storage and retrieval system |
| World | 3004 | World state management and simulation |
| Planning | 3002 | Task planning and execution coordination |

## Quick Commands

### Start the system
```bash
pnpm start
```

### Stop all services
```bash
pnpm kill
```

### Check service status
```bash
pnpm status
```

### Start individual services
```bash
pnpm dev:dashboard      # Dashboard only
pnpm dev:minecraft      # Minecraft interface only
pnpm dev:cognition      # Cognition service only
pnpm dev:memory         # Memory service only
pnpm dev:world          # World service only
pnpm dev:planning       # Planning service only
```

## Minecraft Integration

Once the system is running, you can interact with the Minecraft bot:

```bash
# Connect the bot to Minecraft
curl -X POST http://localhost:3005/connect

# Disconnect the bot
curl -X POST http://localhost:3005/disconnect

# Get bot status
curl http://localhost:3005/status
```

## Troubleshooting

### Port Conflicts
If you see port conflicts, run:
```bash
pnpm kill
```
Then try starting again.

### Node.js Version
Ensure you have Node.js 18 or higher:
```bash
node --version
```

### pnpm Installation
If pnpm is not installed:
```bash
npm install -g pnpm
```

### Build Issues
If packages fail to build:
```bash
pnpm clean
pnpm install
pnpm build
```

## Development

### Adding New Services
To add a new service to the startup script:

1. Add the service configuration to the `services` array in `start.js`
2. Include the service in the package.json scripts
3. Update this README with the new service information

### Modifying Service Configuration
Edit the `services` array in `start.js` to modify:
- Service names and descriptions
- Port assignments
- Health check URLs
- Startup commands

## Architecture

The startup system uses:
- **Process Management**: Spawns and monitors child processes
- **Health Monitoring**: HTTP health checks for service readiness
- **Graceful Shutdown**: SIGTERM/SIGKILL handling for clean exits
- **Port Management**: Automatic port conflict detection and resolution
- **Dependency Management**: Automatic installation and building

## Environment Variables

The following environment variables can be set:
- `FORCE_COLOR=1`: Enable colored output
- `NODE_ENV`: Set to 'development' for dev mode
- `PORT`: Override default ports (not recommended)

## Logging

All services output is prefixed with the service name:
```
[Dashboard] Ready on http://localhost:3000
[Minecraft Interface] Server started on port 3005
[Cognition] Health check passed
```

## Error Handling

The startup script includes comprehensive error handling:
- System requirement validation
- Process cleanup on failures
- Graceful degradation for health check failures
- Clear error messages with resolution steps

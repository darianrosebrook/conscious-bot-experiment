# Development Environment Setup

This directory contains scripts to start the complete Conscious Bot development environment.

## Quick Start

To start all services with one command:

```bash
pnpm dev
```

This will:
1. Check port availability
2. Install dependencies
3. Build all packages
4. Start all services in parallel
5. Monitor service health
6. Display service URLs

## Available Scripts

### Main Commands
- `pnpm dev` - Start all services (recommended)
- `pnpm dev:all` - Same as `pnpm dev`
- `pnpm dev:services` - Start services using concurrently

### Individual Service Commands
- `pnpm dev:dashboard` - Start dashboard only
- `pnpm dev:minecraft` - Start minecraft bot only
- `pnpm dev:cognition` - Start cognition service only
- `pnpm dev:memory` - Start memory service only
- `pnpm dev:world` - Start world service only
- `pnpm dev:planning` - Start planning service only

## Service Ports

| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3000 | http://localhost:3000 |
| Minecraft Bot | 3005 | http://localhost:3005 |
| Minecraft Viewer | 3006 | http://localhost:3006 |
| Cognition | 3003 | http://localhost:3003 |
| Memory | 3001 | http://localhost:3001 |
| World | 3004 | http://localhost:3004 |
| Planning | 3002 | http://localhost:3002 |

## Connecting to Minecraft

Once all services are running, connect the bot to Minecraft:

```bash
curl -X POST http://localhost:3005/connect
```

## Stopping Services

Press `Ctrl+C` to stop all services gracefully.

## Troubleshooting

### Port Already in Use
If you see "Port X is already in use", stop the process using that port:

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Service Not Starting
Check the logs for specific error messages. Common issues:
- Missing dependencies: Run `pnpm install`
- Build errors: Run `pnpm build`
- Canvas compilation: Run `pnpm rebuild canvas`

### Health Check Failures
Some services might take longer to start. The script will continue even if health checks fail initially.

## Scripts

### `dev.js`
Cross-platform JavaScript script that:
- Checks port availability
- Installs dependencies
- Builds packages
- Starts all services
- Monitors health endpoints
- Provides colored output
- Handles graceful shutdown

### `dev.sh`
Bash script with similar functionality (Unix/macOS only).

## Environment Variables

The scripts use default ports. To override, set environment variables:

```bash
export DASHBOARD_PORT=3000
export MINECRAFT_PORT=3005
# ... etc
```

## Development Workflow

1. **Start Development**: `pnpm dev`
2. **Open Dashboard**: http://localhost:3000
3. **Connect Bot**: `curl -X POST http://localhost:3005/connect`
4. **View Minecraft**: http://localhost:3006 (when connected)
5. **Monitor Services**: Check individual service URLs
6. **Stop Development**: `Ctrl+C`

## Architecture

The development environment starts these microservices:

- **Dashboard**: Next.js frontend for monitoring
- **Minecraft Bot**: Mineflayer integration with prismarine viewer
- **Cognition**: High-level reasoning and self-awareness
- **Memory**: Multi-store memory system with GraphRAG
- **World**: World sensing and navigation
- **Planning**: Hierarchical planning and goal management

All services communicate via HTTP APIs and can be monitored through the dashboard.

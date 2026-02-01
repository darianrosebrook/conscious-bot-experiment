# Scripts Documentation

## Start Script Output Modes

The `start.js` script supports multiple output modes for different use cases:

### Usage

```bash
# Default verbose mode (shows all logs)
pnpm start
node scripts/start.js

# Quiet mode (minimal output, errors only)
pnpm start:quiet
node scripts/start.js --quiet

# Progress mode (dynamic progress bars)
pnpm start:progress
node scripts/start.js --progress

# Debug mode (extra verbose)
pnpm start:debug
node scripts/start.js --debug

# Production mode (no debug logs)
pnpm start:production
node scripts/start.js --production
```

### Output Mode Comparison

| Mode | Use Case | Output Level | MLX Install | Service Logs |
|------|----------|--------------|-------------|--------------|
| **verbose** | Development (default) | Full | Visible | All prefixed |
| **quiet** | CI/Scripts | Errors only | Hidden | Errors only |
| **progress** | Interactive dev | Progress bars | Hidden | In-place updates |
| **debug** | Troubleshooting | Extra verbose | Visible | All + debug |
| **production** | Production deploy | Info + errors | Hidden | No debug |

### Progress Mode Example

```
✔ System Requirements (Node.js v22.19.0) [1s]
✔ MLX-LM Sidecar (Ready) [8s]
✔ Docker Services (Running) [5s]
✔ Cleanup (Complete) [2s]
✔ Dependencies (Installed) [4s]
✔ Build (Complete) [18s]
⠸ Starting Services [12s]
  ✔ Core API (Port 3007)
  ✔ Memory (Port 3001)
  ✔ World (Port 3004)
  ⠸ Cognition (Port 3003) - Waiting for health check...
  ⠋ Planning (Port 3002) - Starting...
  ⠋ Minecraft Interface (Port 3005)
  ⠋ Dashboard (Port 3000)
```

### Benefits

**Verbose Mode:**
- Traditional sequential logging
- Easy to grep and pipe
- Good for debugging specific services
- Full visibility into all operations

**Quiet Mode:**
- Minimal noise for CI pipelines
- Only shows critical errors and success
- Fast startup feedback
- Good for automated scripts

**Progress Mode:**
- Clean, modern interface
- Real-time status updates
- No log spam
- Shows timing for each step
- Best for interactive development

**Debug Mode:**
- Shows all internal operations
- Includes timing information
- Service-specific color coding
- Detailed health check logs

**Production Mode:**
- Structured logging only
- No debug/verbose output
- Performance-optimized
- Suitable for production deployments

### Implementation Details

The output mode is controlled by:
- Command line flags (`--quiet`, `--progress`, etc.)
- Stored in `OUTPUT_MODE` constant
- All logging functions check mode before output
- Progress mode uses `listr2` for dynamic updates

### Service Output Handling

In verbose/debug modes, service output is prefixed:
```
[Core API] Server listening on port 3007
[Memory] Connected to database
[Planning] Task queue initialized
```

In progress mode, service output is captured but not displayed (available in logs if needed).

In quiet mode, only errors are shown:
```
[Core API] ERROR: Failed to connect to database
```

### Customization

To add new output modes, edit `scripts/start.js`:

1. Add flag parsing in the args section
2. Update `OUTPUT_MODE` constant
3. Add mode-specific behavior in logging functions
4. Add corresponding npm script in `package.json`

### Dependencies

Progress mode requires:
```bash
pnpm add -D listr2 cli-progress ora
```

These are already installed in the project.

#!/usr/bin/env node

/**
 * Conscious Bot Startup Script
 *
 * Single command to start the entire conscious bot system:
 * - Installs dependencies
 * - Builds all packages
 * - Starts sidecars (MLX-LM, Sterling when ../sterling exists)
 * - Starts all pnpm servers (Core, Memory, World, Cognition, Planning, Minecraft Interface, Dashboard)
 * - Provides health monitoring
 * - Handles graceful shutdown
 *
 * Sterling: set STERLING_DIR or clone Sterling to ../sterling to enable.
 *
 * Usage:
 *   node scripts/start.js                  # Default (verbose)
 *   node scripts/start.js --quiet          # Minimal output
 *   node scripts/start.js --progress       # Progress bars (listr2)
 *   node scripts/start.js --debug          # Extra verbose
 *   node scripts/start.js --production     # Production mode (no dev logs)
 *
 * @author @darianrosebrook
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Parse command line arguments
const args = process.argv.slice(2);
const OUTPUT_MODE = args.includes('--quiet')
  ? 'quiet'
  : args.includes('--progress')
    ? 'progress'
    : args.includes('--debug')
      ? 'debug'
      : args.includes('--production')
        ? 'production'
        : 'verbose';

// Dynamically import listr2 only if needed
let Listr = null;
if (OUTPUT_MODE === 'progress') {
  try {
    const listrModule = await import('listr2');
    Listr = listrModule.Listr;
  } catch (err) {
    console.error('listr2 not installed. Run: pnpm add -D listr2');
    console.error('Falling back to verbose mode');
    OUTPUT_MODE = 'verbose';
  }
}

// Sterling repo path (sibling of conscious-bot by default)
const sterlingDir = path.resolve(
  projectRoot,
  process.env.STERLING_DIR || path.join('..', 'sterling')
);
const sterlingPython = path.join(sterlingDir, '.venv', 'bin', 'python');
const sterlingScript = path.join(
  sterlingDir,
  'scripts',
  'utils',
  'sterling_unified_server.py'
);
const sterlingAvailable =
  fs.existsSync(sterlingDir) &&
  fs.existsSync(sterlingPython) &&
  fs.existsSync(sterlingScript);

// UMAP service path (for embedding visualization)
const umapDir = path.join(projectRoot, 'umap-service');
const umapVenv = path.join(umapDir, 'venv');
const umapPython = path.join(umapVenv, 'bin', 'python');
const umapScript = path.join(umapDir, 'umap_server.py');
const umapRequirements = path.join(umapDir, 'requirements.txt');
const umapAvailable =
  fs.existsSync(umapDir) &&
  fs.existsSync(umapScript) &&
  fs.existsSync(umapRequirements);

// Load .env file if present
const envPath = path.join(path.dirname(__dirname), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
  console.log('\x1b[32m Loaded environment from .env\x1b[0m');
}

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Service configuration with startup dependencies
let services = [
  // Core infrastructure services (start first)
  {
    name: 'Core API',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/core', 'run', 'dev:server'],
    port: 3007,
    healthUrl: 'http://localhost:3007/health',
    readyUrl: 'http://localhost:3007/system/ready',
    description: 'Core API and capability registry',
    priority: 1, // Start first
    dependencies: [], // No dependencies
  },
  {
    name: 'Memory',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/memory', 'run', 'dev:server'],
    port: 3001,
    healthUrl: 'http://localhost:3001/health',
    readyUrl: 'http://localhost:3001/system/ready',
    description: 'Memory storage and retrieval system',
    priority: 2, // Start after core
    dependencies: ['Core API'],
  },
  {
    name: 'World',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/world', 'run', 'dev:server'],
    port: 3004,
    healthUrl: 'http://localhost:3004/health',
    readyUrl: 'http://localhost:3004/system/ready',
    description: 'World state management and simulation',
    priority: 2, // Start after core
    dependencies: ['Core API'],
  },
  {
    name: 'Cognition',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/cognition', 'run', 'dev:server'],
    port: 3003,
    healthUrl: 'http://localhost:3003/health',
    readyUrl: 'http://localhost:3003/system/ready',
    description: 'Cognitive reasoning and decision making',
    priority: 3, // Start after core services
    dependencies: ['Core API'],
  },
  {
    name: 'Planning',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/planning', 'run', 'dev:server'],
    port: 3002,
    healthUrl: 'http://localhost:3002/health',
    readyUrl: 'http://localhost:3002/system/ready',
    description: 'Task planning and execution coordination',
    priority: 4, // Start after core and memory/world
    dependencies: ['Core API', 'Memory', 'World'],
  },
  {
    name: 'Minecraft Interface',
    command: 'pnpm',
    args: [
      '--filter',
      '@conscious-bot/minecraft-interface',
      'run',
      'dev:server',
    ],
    port: 3005,
    healthUrl: 'http://localhost:3005/health',
    readyUrl: 'http://localhost:3005/system/ready',
    description: 'Minecraft bot interface and control',
    priority: 5, // Start after planning
    dependencies: ['Core API', 'Planning'],
  },
  {
    name: 'MLX-LM Sidecar',
    command: 'bash',
    args: [
      '-c',
      'cd mlx-lm-sidecar && ./venv-mlx/bin/python mlx_server.py --port 5002',
    ],
    port: 5002,
    healthUrl: 'http://localhost:5002/health',
    description: 'MLX-LM inference and embedding server for Apple Silicon',
    priority: 2, // Before Cognition and Memory need it
    dependencies: [],
  },
  // Dashboard should start last for monitoring all services
  {
    name: 'Dashboard',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/dashboard', 'dev'],
    port: 3000,
    healthUrl: 'http://localhost:3000',
    description: 'Web dashboard for monitoring and control',
    priority: 7, // Start last
    dependencies: ['Core API', 'Planning', 'Minecraft Interface'],
  },
];

if (sterlingAvailable) {
  services.push({
    name: 'Sterling',
    command: sterlingPython,
    args: [sterlingScript],
    port: 8766,
    healthUrl: null, // WebSocket server; use wsUrl for readiness
    wsUrl: process.env.STERLING_WS_URL || 'ws://127.0.0.1:8766',
    description:
      'Sterling symbolic reasoning server (crafting, building, tool progression)',
    priority: 2,
    dependencies: [],
    cwd: sterlingDir,
  });
}

// UMAP service for embedding visualization (optional - only if venv exists)
const umapVenvExists = fs.existsSync(umapPython);
if (umapAvailable && umapVenvExists) {
  services.push({
    name: 'UMAP Service',
    command: umapPython,
    args: [umapScript],
    port: 5003,
    healthUrl: 'http://localhost:5003/health',
    description:
      'UMAP dimensionality reduction service for embedding visualization',
    priority: 2,
    dependencies: [],
    cwd: umapDir,
  });
}

// Utility functions with output mode support
function log(message, color = colors.reset) {
  if (OUTPUT_MODE === 'quiet') return;
  if (OUTPUT_MODE === 'progress') return; // Handled by listr2
  console.log(`${color}${message}${colors.reset}`);
}

function logBanner() {
  if (OUTPUT_MODE === 'quiet' || OUTPUT_MODE === 'progress') return;
  log('', colors.reset);
  log('Conscious Bot System', colors.bold + colors.blue);
  log('========================', colors.blue);
  log('', colors.reset);
}

// Enhanced logging with structured format
function logWithTimestamp(message, level = 'INFO', color = colors.reset) {
  if (OUTPUT_MODE === 'quiet' && level !== 'ERROR' && level !== 'SUCCESS')
    return;
  if (OUTPUT_MODE === 'progress') return; // Handled by listr2
  if (OUTPUT_MODE === 'production' && level === 'DEBUG') return;

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  console.log(`${color}${logEntry}${colors.reset}`);
}

// Service-specific logging with consistent format
function logService(serviceName, message, level = 'INFO') {
  if (OUTPUT_MODE === 'quiet' && level !== 'ERROR') return;
  if (OUTPUT_MODE === 'progress') return; // Handled by listr2
  if (OUTPUT_MODE === 'production' && level === 'DEBUG') return;

  const timestamp = new Date().toISOString();
  const color = getServiceColor(serviceName);
  const logEntry = `[${timestamp}] [${serviceName}] [${level}] ${message}`;
  console.log(`${color}${logEntry}${colors.reset}`);
}

// Get color for service based on name
function getServiceColor(serviceName) {
  const colorMap = {
    'Core API': colors.cyan,
    Dashboard: colors.green,
    'Minecraft Interface': colors.yellow,
    Cognition: colors.purple,
    Memory: colors.blue,
    World: colors.magenta,
    Planning: colors.red,
    'MLX-LM Sidecar': colors.purple,
    Sterling: colors.cyan,
    'UMAP Service': colors.purple,
  };
  return colorMap[serviceName] || colors.reset;
}

async function postJson(url, body, timeoutMs = 4000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timeout);
  }
}

function checkPort(port) {
  try {
    execSync(`lsof -Pi :${port} -sTCP:LISTEN -t`, { stdio: 'ignore' });
    return true; // Port is in use
  } catch {
    return false; // Port is available
  }
}

// Enhanced port checking with logging
function checkPortWithLogging(port, serviceName) {
  const isInUse = checkPort(port);
  if (isInUse) {
    logService(serviceName, `Port ${port} is already in use`, 'WARN');
  } else {
    logService(serviceName, `Port ${port} is available`, 'INFO');
  }
  return isInUse;
}

function killProcessesByPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function killProcessesByPattern(pattern) {
  try {
    execSync(`pkill -f "${pattern}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function waitForPort(port, serviceName, maxAttempts = 60) {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const startTime = Date.now();

    const tryConnect = () => {
      attempts++;
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        if (attempts >= maxAttempts) {
          reject(
            new Error(
              `Port ${port} not listening after ${((Date.now() - startTime) / 1000).toFixed(1)}s`
            )
          );
        } else {
          setTimeout(tryConnect, 2000);
        }
      }, 2000);

      socket.connect(port, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        if (attempts >= maxAttempts) {
          reject(
            new Error(
              `Port ${port} not listening after ${((Date.now() - startTime) / 1000).toFixed(1)}s`
            )
          );
        } else {
          setTimeout(tryConnect, 2000);
        }
      });
    };

    tryConnect();
  });
}

/**
 * Wait for a WebSocket server to accept connections (proper handshake, then close).
 * Use for WebSocket-only services (e.g. Sterling) to avoid "invalid HTTP request" errors
 * that occur when a raw TCP probe connects and closes without sending a handshake.
 */
async function waitForWebSocket(wsUrl, serviceName, maxAttempts = 60) {
  const { default: WebSocket } = await import('ws');
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
        const timeout = setTimeout(() => {
          try {
            ws.close();
          } catch (_) {}
          reject(new Error('timeout'));
        }, 5000);

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        });
        ws.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      return;
    } catch (err) {
      if (attempt >= maxAttempts) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        throw new Error(`WebSocket ${serviceName} not ready after ${elapsed}s`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function waitForService(url, serviceName, maxAttempts = 60) {
  return new Promise(async (resolve, reject) => {
    const http = await import('http');
    const https = await import('https');
    const client = url.startsWith('https') ? https.default : http.default;

    let attempts = 0;
    let lastLogAttempt = 0;
    const startTime = Date.now();

    const check = () => {
      attempts++;

      const req = client.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          resolve();
        } else {
          if (attempts < maxAttempts) {
            setTimeout(check, 2000);
          } else {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            reject(
              new Error(
                `Health check failed with status ${res.statusCode} after ${elapsed}s`
              )
            );
          }
        }
      });

      req.on('error', (error) => {
        if (attempts < maxAttempts) {
          // Only log every 5 attempts to reduce verbosity
          if (attempts - lastLogAttempt >= 5 || attempts === 1) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            log(
              ` ⏳ Attempt ${attempts}/${maxAttempts} - ${serviceName} not ready yet (${elapsed}s)`,
              colors.yellow
            );
            lastLogAttempt = attempts;
          }
          setTimeout(check, 2000);
        } else {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          reject(
            new Error(`Health check failed after ${elapsed}s: ${error.message}`)
          );
        }
      });

      req.setTimeout(10000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, 2000);
        } else {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          reject(new Error(`Health check timeout after ${elapsed}s`));
        }
      });
    };

    check();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setupMLXEnvironment() {
  log('\nSetting up MLX-LM sidecar environment...', colors.purple);

  const mlxDir = path.join(process.cwd(), 'mlx-lm-sidecar');
  const venvPath = path.join(mlxDir, 'venv-mlx');

  // Check if directory exists
  if (!fs.existsSync(mlxDir)) {
    log(
      ' ⚠️  mlx-lm-sidecar directory not found, skipping MLX setup',
      colors.yellow
    );
    return;
  }

  // Check for Apple Silicon
  try {
    const arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
    if (arch !== 'arm64') {
      log(
        ' ⚠️  MLX requires Apple Silicon (arm64). Skipping MLX setup.',
        colors.yellow
      );
      return;
    }
  } catch {
    log(
      ' ⚠️  Could not detect architecture, skipping MLX setup',
      colors.yellow
    );
    return;
  }

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    log(' 📦 Creating MLX virtual environment...', colors.purple);
    try {
      execSync(`cd ${mlxDir} && python3 -m venv venv-mlx`, {
        stdio: 'inherit',
      });
      log(' MLX virtual environment created', colors.green);
    } catch (error) {
      log(' Failed to create MLX virtual environment', colors.red);
      return;
    }
  } else {
    log(' MLX virtual environment already exists', colors.green);
  }

  // Install Python dependencies
  log(' Installing MLX dependencies...', colors.purple);
  try {
    const pipStdio =
      OUTPUT_MODE === 'quiet' || OUTPUT_MODE === 'production'
        ? 'pipe'
        : 'inherit';
    execSync(`cd ${mlxDir} && ./venv-mlx/bin/pip install -q --upgrade pip`, {
      stdio: pipStdio,
      shell: true,
    });
    execSync(
      `cd ${mlxDir} && ./venv-mlx/bin/pip install -q -r requirements.txt`,
      {
        stdio: pipStdio,
        shell: true,
      }
    );
    log(' MLX dependencies installed', colors.green);
  } catch (error) {
    log(' Failed to install MLX dependencies', colors.red);
  }

  // Verify MLX models are cached
  log(' Verifying MLX model cache...', colors.purple);
  try {
    execSync(
      `cd ${mlxDir} && ./venv-mlx/bin/python -c "
import os, sys
cache = os.path.expanduser('~/.cache/huggingface/hub')
gen = os.path.join(cache, 'models--mlx-community--gemma-3n-E2B-it-lm-4bit')
emb = os.path.join(cache, 'models--mlx-community--embeddinggemma-300m-4bit')
missing = []
if not os.path.isdir(gen): missing.append('generation (gemma-3n-E2B-it-lm-4bit)')
if not os.path.isdir(emb): missing.append('embedding (embeddinggemma-300m-4bit)')
if missing:
    print('MISSING: ' + ', '.join(missing))
    sys.exit(1)
print('OK')
"`,
      { stdio: 'pipe', shell: true, encoding: 'utf-8' }
    );
    log(' MLX models are cached locally', colors.green);
  } catch (error) {
    log(
      ' ⚠️  Some MLX models are not cached — first startup will download them',
      colors.yellow
    );
    log(
      '     Run: cd mlx-lm-sidecar && bash setup.sh to pre-download',
      colors.cyan
    );
  }
}

async function setupUMAPEnvironment() {
  log('\nSetting up UMAP service environment...', colors.purple);

  if (!umapAvailable) {
    log(
      ' ⚠️  umap-service directory not found, skipping UMAP setup',
      colors.yellow
    );
    return;
  }

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(umapVenv)) {
    log(' 📦 Creating UMAP virtual environment...', colors.purple);
    try {
      execSync(`cd ${umapDir} && python3 -m venv venv`, {
        stdio: 'inherit',
      });
      log(' UMAP virtual environment created', colors.green);
    } catch (error) {
      log(' Failed to create UMAP virtual environment', colors.red);
      return;
    }
  } else {
    log(' UMAP virtual environment already exists', colors.green);
  }

  // Install Python dependencies
  log(' Installing UMAP dependencies...', colors.purple);
  try {
    const pipStdio =
      OUTPUT_MODE === 'quiet' || OUTPUT_MODE === 'production'
        ? 'pipe'
        : 'inherit';
    execSync(`cd ${umapDir} && ./venv/bin/pip install -q --upgrade pip`, {
      stdio: pipStdio,
      shell: true,
    });
    execSync(
      `cd ${umapDir} && ./venv/bin/pip install -q -r requirements.txt`,
      {
        stdio: pipStdio,
        shell: true,
      }
    );
    log(' UMAP dependencies installed', colors.green);
  } catch (error) {
    log(' Failed to install UMAP dependencies', colors.red);
  }
}

// Docker compose management
async function startDockerServices() {
  log('\n🐳 Starting Docker services...', colors.cyan);

  // Check if Docker is available
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    log(
      ' ⚠️  Docker is not installed or not in PATH — skipping Docker services',
      colors.yellow
    );
    return;
  }

  // Check if Docker daemon is running
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    log(
      ' ⚠️  Docker daemon is not running — skipping Docker services',
      colors.yellow
    );
    return;
  }

  try {
    execSync('docker compose up -d', { stdio: 'inherit', cwd: process.cwd() });
    log(' Docker compose started', colors.green);
  } catch (error) {
    log(` ⚠️  docker compose up failed: ${error.message}`, colors.yellow);
    return;
  }

  // Wait for Postgres healthcheck
  log(' ⏳ Waiting for Postgres...', colors.cyan);
  let pgReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      execSync(
        'docker exec conscious-bot-postgres pg_isready -U conscious_bot -q',
        { stdio: 'ignore' }
      );
      pgReady = true;
      break;
    } catch {
      await wait(2000);
    }
  }
  if (pgReady) {
    log(' Postgres is ready', colors.green);
  } else {
    log(' ⚠️  Postgres did not become ready in time', colors.yellow);
  }

  // Log Minecraft status (non-blocking — it's optional)
  try {
    execSync('docker exec conscious-bot-minecraft mc-health', {
      stdio: 'ignore',
    });
    log(' Minecraft server is ready', colors.green);
  } catch {
    log(
      ' ℹ️  Minecraft server is still starting (non-blocking)',
      colors.yellow
    );
  }
}

// Main function with output mode routing
async function main() {
  if (OUTPUT_MODE === 'progress' && Listr) {
    return await mainWithProgress();
  }
  return await mainVerbose();
}

// Progress bar mode using listr2
async function mainWithProgress() {
  const processes = [];

  const tasks = new Listr(
    [
      {
        title: 'System Requirements',
        task: async (ctx, task) => {
          const nodeVersion = process.version;
          const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
          if (nodeMajor < 18) {
            throw new Error(`Node.js ${nodeVersion} not supported. Need 18+`);
          }
          try {
            execSync('pnpm --version', { stdio: 'ignore' });
          } catch {
            throw new Error('pnpm not installed');
          }
          task.title = `System Requirements (Node.js ${nodeVersion})`;
        },
      },
      {
        title: 'MLX-LM Sidecar',
        task: async (ctx, task) => {
          const mlxDir = path.join(process.cwd(), 'mlx-lm-sidecar');
          const venvPath = path.join(mlxDir, 'venv-mlx');

          if (!fs.existsSync(venvPath)) {
            task.output = 'Creating virtual environment...';
            execSync(`cd ${mlxDir} && python3 -m venv venv-mlx`, {
              stdio: 'pipe',
            });
          }

          task.output = 'Installing dependencies...';
          execSync(
            `cd ${mlxDir} && ./venv-mlx/bin/pip install -q --upgrade pip`,
            { stdio: 'pipe' }
          );
          execSync(
            `cd ${mlxDir} && ./venv-mlx/bin/pip install -q -r requirements.txt`,
            { stdio: 'pipe' }
          );

          task.title = 'MLX-LM Sidecar (Ready)';
        },
      },
      {
        title: 'UMAP Service',
        skip: () => !umapAvailable,
        task: async (ctx, task) => {
          if (!fs.existsSync(umapVenv)) {
            task.output = 'Creating virtual environment...';
            execSync(`cd ${umapDir} && python3 -m venv venv`, {
              stdio: 'pipe',
            });
          }

          task.output = 'Installing dependencies...';
          execSync(
            `cd ${umapDir} && ./venv/bin/pip install -q --upgrade pip`,
            { stdio: 'pipe' }
          );
          execSync(
            `cd ${umapDir} && ./venv/bin/pip install -q -r requirements.txt`,
            { stdio: 'pipe' }
          );

          task.title = 'UMAP Service (Ready)';
        },
      },
      {
        title: 'Docker Services',
        skip: () => process.argv.includes('--skip-docker'),
        task: async (ctx, task) => {
          task.output = 'Starting Postgres and Minecraft...';
          execSync('docker compose up -d', { cwd: projectRoot, stdio: 'pipe' });
          await wait(2000);
          task.title = 'Docker Services (Running)';
        },
      },
      {
        title: 'Cleanup',
        task: async (ctx, task) => {
          task.output = 'Killing existing processes...';
          const processPatterns = [
            'tsx src/server.ts',
            'next dev',
            'node.*dev.js',
            'pnpm.*dev',
            'minecraft-interface',
            'python3.*mlx_server.py',
            'mlx_server.py',
            'sterling_unified_server.py',
            'umap_server.py',
          ];
          for (const pattern of processPatterns) {
            killProcessesByPattern(pattern);
          }
          for (const service of services) {
            killProcessesByPort(service.port);
          }
          await wait(2000);
          task.title = 'Cleanup (Complete)';
        },
      },
      {
        title: 'Dependencies',
        task: async (ctx, task) => {
          task.output = 'Installing Node.js packages...';
          execSync('pnpm install', { stdio: 'pipe' });
          task.title = 'Dependencies (Installed)';
        },
      },
      {
        title: 'Build',
        task: async (ctx, task) => {
          task.output = 'Building packages...';
          execSync('pnpm build', { stdio: 'pipe' });
          task.title = 'Build (Complete)';
        },
      },
      {
        title: 'Starting Services',
        task: (ctx, task) => {
          const sortedServices = [...services].sort(
            (a, b) => a.priority - b.priority
          );
          return task.newListr(
            sortedServices.map((service) => ({
              title: service.name,
              task: async (ctx, subtask) => {
                subtask.output = `Starting on port ${service.port}...`;

                const baseEnv = { ...process.env, FORCE_COLOR: '1' };
                if (service.name === 'Memory' && !baseEnv.WORLD_SEED) {
                  baseEnv.MEMORY_DEV_DEFAULT_SEED = 'true';
                }
                if (service.name === 'Minecraft Interface' && !baseEnv.MINECRAFT_VERSION) {
                  baseEnv.MINECRAFT_VERSION = '1.21.4';
                }

                const child = spawn(service.command, service.args, {
                  stdio: 'pipe',
                  shell: service.cwd ? false : true,
                  cwd: service.cwd || process.cwd(),
                  env: baseEnv,
                });

                processes.push({ child, service });

                subtask.output = 'Waiting for health check...';
                await wait(service.priority <= 3 ? 5000 : 3000);

                if (service.healthUrl) {
                  await waitForService(service.healthUrl, service.name, 30);
                } else if (service.wsUrl) {
                  await waitForWebSocket(service.wsUrl, service.name, 30);
                } else if (service.port) {
                  await waitForPort(service.port, service.name, 30);
                }

                subtask.title = `${service.name} (Port ${service.port})`;
              },
            })),
            { concurrent: false, exitOnError: false }
          );
        },
      },
    ],
    {
      concurrent: false,
      rendererOptions: {
        collapse: false,
        collapseErrors: false,
        showTimer: true,
      },
    }
  );

  try {
    await tasks.run();

    console.log('\n\nConscious Bot System Ready');
    console.log('==========================\n');
    services.forEach((s) => {
      console.log(`  ${s.name.padEnd(20)} http://localhost:${s.port}`);
    });
    console.log('\nPress Ctrl+C to stop all services\n');

    // Graceful shutdown
    const cleanup = async () => {
      console.log('\n\nShutting down services...');
      for (const { child, service } of processes) {
        console.log(`  Stopping ${service.name}...`);
        child.kill('SIGTERM');
      }
      await wait(2000);
      for (const { child } of processes) {
        if (!child.killed) child.kill('SIGKILL');
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep running
    await new Promise(() => {});
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

// Verbose mode (original implementation)
async function mainVerbose() {
  logBanner();

  // Step 1: Check Node.js version
  log('Checking system requirements...', colors.cyan);
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (nodeMajor < 18) {
    log(
      ` Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`,
      colors.red
    );
    process.exit(1);
  }
  log(` Node.js ${nodeVersion} is supported`, colors.green);

  // Step 2: Check if pnpm is available
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    log(' pnpm is available', colors.green);
  } catch {
    log(
      ' pnpm is not installed. Please install pnpm first: npm install -g pnpm',
      colors.red
    );
    process.exit(1);
  }

  // Step 3: Setup MLX-LM sidecar environment
  await setupMLXEnvironment();

  // Step 3a: Setup UMAP service environment (for embedding visualization)
  await setupUMAPEnvironment();

  // Step 3b: Start Docker services (Postgres + Minecraft)
  const skipDocker = process.argv.includes('--skip-docker');
  if (skipDocker) {
    log('\n🐳 Skipping Docker services (--skip-docker)', colors.yellow);
  } else {
    await startDockerServices();
  }

  // Step 4: Kill existing processes
  log('\nCleaning up existing processes...', colors.cyan);

  const processPatterns = [
    'tsx src/server.ts',
    'next dev',
    'node.*dev.js',
    'pnpm.*dev',
    'minecraft-interface',
    'python3.*mlx_server.py',
    'mlx_server.py',
    'sterling_unified_server.py',
    'umap_server.py',
  ];

  for (const pattern of processPatterns) {
    killProcessesByPattern(pattern);
  }

  for (const service of services) {
    killProcessesByPort(service.port);
  }

  await wait(2000);

  // Step 5: Check port availability
  log('\nChecking port availability...', colors.cyan);
  const portConflicts = [];

  for (const service of services) {
    if (checkPortWithLogging(service.port, service.name)) {
      portConflicts.push(service);
    }
  }

  if (portConflicts.length > 0) {
    log(
      '\n⚠️  Some ports are still in use. Please stop the conflicting processes and try again.',
      colors.yellow
    );
    log('   You can use: pnpm kill', colors.cyan);
    process.exit(1);
  }

  // Step 6: Install dependencies
  log('\nInstalling Node.js dependencies...', colors.cyan);
  try {
    const installStdio =
      OUTPUT_MODE === 'quiet' || OUTPUT_MODE === 'production'
        ? 'pipe'
        : 'inherit';
    execSync('pnpm install', { stdio: installStdio });
    log(' Node.js dependencies installed', colors.green);
  } catch (error) {
    log(' Failed to install Node.js dependencies', colors.red);
    process.exit(1);
  }

  // Step 7: Build packages
  log('\nBuilding packages...', colors.cyan);
  try {
    if (OUTPUT_MODE === 'quiet' || OUTPUT_MODE === 'production') {
      // Silent mode - no output
      execSync('pnpm build', { stdio: 'pipe' });
      log(' Packages built successfully', colors.green);
    } else if (OUTPUT_MODE === 'debug') {
      // Debug mode - full output
      execSync('pnpm build', { stdio: 'inherit' });
      log(' Packages built successfully', colors.green);
    } else {
      // Verbose mode - summarized output
      const buildOutput = execSync('pnpm build', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large builds
      });

      // Parse turbo build output for summary
      const lines = buildOutput.split('\n');
      const buildResults = [];
      let totalTime = null;
      let cached = 0;
      let total = 0;

      for (const line of lines) {
        // Match package build lines: "@conscious-bot/core:build: cache hit" or "cache miss"
        const buildMatch = line.match(/@conscious-bot\/([^:]+):build:\s*(cache hit|cache miss)/);
        if (buildMatch) {
          const pkg = buildMatch[1];
          const cacheStatus = buildMatch[2] === 'cache hit' ? 'cached' : 'built';
          buildResults.push({ pkg, cacheStatus });
          if (cacheStatus === 'cached') cached++;
          total++;
        }

        // Match total time line: "  Time:    16.012s"
        const timeMatch = line.match(/Time:\s+([\d.]+)s/);
        if (timeMatch) {
          totalTime = timeMatch[1];
        }
      }

      // Print summarized build results
      if (buildResults.length > 0) {
        const cachedPkgs = buildResults.filter(r => r.cacheStatus === 'cached').map(r => r.pkg);
        const builtPkgs = buildResults.filter(r => r.cacheStatus === 'built').map(r => r.pkg);

        if (cachedPkgs.length > 0) {
          log(`  ${colors.cyan}cached${colors.reset}: ${cachedPkgs.join(', ')}`, colors.reset);
        }
        if (builtPkgs.length > 0) {
          log(`  ${colors.green}built${colors.reset}:  ${builtPkgs.join(', ')}`, colors.reset);
        }

        const timeStr = totalTime ? ` in ${totalTime}s` : '';
        log(` ${colors.green}✓${colors.reset} ${total} packages (${cached} cached)${timeStr}`, colors.green);
      } else {
        log(' Packages built successfully', colors.green);
      }
    }
  } catch (error) {
    log(' Failed to build packages', colors.red);
    // In verbose mode, show the error output
    if (error.stdout) {
      console.error(error.stdout.toString());
    }
    if (error.stderr) {
      console.error(error.stderr.toString());
    }
    process.exit(1);
  }

  // Step 8: Start services in priority order with dependency checking
  log('\n🚀 Starting services in dependency order...', colors.cyan);
  if (!sterlingAvailable) {
    log(
      `  Sterling repo not found at ${sterlingDir}, skipping Sterling service`,
      colors.yellow
    );
  }
  log('');

  const processes = [];
  const startedServices = new Set();

  // Sort services by priority
  const sortedServices = [...services].sort((a, b) => a.priority - b.priority);

  for (const service of sortedServices) {
    // Wait for dependencies to be ready
    if (service.dependencies.length > 0) {
      log(
        ` ⏳ Waiting for dependencies: ${service.dependencies.join(', ')}`,
        colors.yellow
      );

      for (const dep of service.dependencies) {
        while (!startedServices.has(dep)) {
          await wait(1000); // Wait 1 second before checking again
          log(`   Waiting for ${dep} to be ready...`, colors.yellow);
        }
      }
    }

    logService(
      service.name,
      `Starting service on port ${service.port}`,
      'START'
    );
    logService(service.name, service.description, 'INFO');

    const baseEnv = { ...process.env, FORCE_COLOR: '1' };
    if (service.name === 'Memory' && !baseEnv.WORLD_SEED) {
      baseEnv.MEMORY_DEV_DEFAULT_SEED = 'true';
    }
    if (service.name === 'Minecraft Interface' && !baseEnv.MINECRAFT_VERSION) {
      baseEnv.MINECRAFT_VERSION = '1.21.4';
    }
    const child = spawn(service.command, service.args, {
      stdio: 'pipe',
      shell: service.cwd ? false : true,
      cwd: service.cwd
        ? service.cwd
        : service.name === 'MLX-LM Sidecar'
          ? `${process.cwd()}/mlx-lm-sidecar`
          : process.cwd(),
      env: baseEnv,
    });

    // Handle output with service prefix - ensure every line is prefixed
    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed) {
          console.log(`[${service.name}] ${trimmed}`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed && !trimmed.includes('Warning')) {
          console.error(`[${service.name}] ${trimmed}`);
        }
      }
    });

    child.on('error', (error) => {
      logService(service.name, `Failed to start: ${error.message}`, 'ERROR');
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        logService(service.name, `Exited with code ${code}`, 'ERROR');
      } else {
        logService(service.name, 'Exited normally', 'INFO');
      }
    });

    processes.push({ child, service });

    // Wait for service to be healthy before marking as started
    // This ensures dependencies are actually ready, not just spawned
    try {
      // Give service time to start (longer for core services)
      const startupDelay = service.priority <= 3 ? 5000 : 3000;
      await wait(startupDelay);

      // Check if service is healthy (HTTP healthUrl, WebSocket wsUrl, or TCP port)
      if (service.healthUrl) {
        await waitForService(service.healthUrl, service.name, 30);
      } else if (service.wsUrl) {
        await waitForWebSocket(service.wsUrl, service.name, 30);
      } else if (service.port) {
        await waitForPort(service.port, service.name, 30);
      }

      // Only mark as started if health check passes
      startedServices.add(service.name);
      logService(service.name, 'Service is healthy and ready', 'HEALTH');
    } catch (error) {
      // Service failed to become healthy
      logService(
        service.name,
        `Failed to become healthy: ${error.message}`,
        'ERROR'
      );
      // Don't mark as started - this will prevent dependent services from starting
      // But continue with other services
    }

    // Small delay before starting next service
    await wait(1000);
  }

  // Step 9: Wait for services to start and check health with retry logic
  log('\n⏳ Waiting for services to start...', colors.cyan);
  await wait(8000); // Give services time to initialize

  log('\nChecking service health...', colors.cyan);

  const healthResults = [];
  const failedServices = [];

  // Check services with improved error handling
  for (const { service } of processes) {
    try {
      if (service.healthUrl) {
        await waitForService(service.healthUrl, service.name);
      } else if (service.wsUrl) {
        await waitForWebSocket(service.wsUrl, service.name);
      } else if (service.port) {
        await waitForPort(service.port, service.name);
      }
      healthResults.push({ service: service.name, status: 'healthy' });
      logService(service.name, 'Health check passed', 'HEALTH');
    } catch (error) {
      healthResults.push({
        service: service.name,
        status: 'unhealthy',
        error: error.message,
      });
      failedServices.push(service.name);
      logService(
        service.name,
        `Health check failed: ${error.message}`,
        'ERROR'
      );
    }

    // Small delay between health checks
    await wait(500);
  }

  // Summary of health checks - compact status line
  const healthyServices = healthResults.filter((r) => r.status === 'healthy');
  const unhealthyServices = healthResults.filter((r) => r.status !== 'healthy');

  // Build a compact ready status line: "core✓ memory✓ world✓ cognition✗"
  const statusLine = healthResults
    .map((r) => {
      const shortName = r.service
        .replace(' Interface', '')
        .replace(' API', '')
        .replace(' Service', '')
        .replace('MLX-LM Sidecar', 'MLX')
        .toLowerCase();
      return r.status === 'healthy'
        ? `${colors.green}${shortName}✓${colors.reset}`
        : `${colors.red}${shortName}✗${colors.reset}`;
    })
    .join(' ');

  log('');
  log('═══════════════════════════════════════════════════════════════', colors.blue);
  log(`  SERVICES: ${statusLine}`, colors.reset);
  log('═══════════════════════════════════════════════════════════════', colors.blue);

  // Show detailed failures if any
  if (unhealthyServices.length > 0) {
    log('');
    for (const result of unhealthyServices) {
      log(`  ${result.service}: ${result.error}`, colors.red);
    }
  }

  // Exit if critical services failed
  const criticalServices = ['Core API', 'Planning', 'Minecraft Interface'];
  const criticalFailures = failedServices.filter((service) =>
    criticalServices.includes(service)
  );

  if (criticalFailures.length > 0) {
    logWithTimestamp(
      '\n🚨 Critical services failed to start:',
      'CRITICAL',
      colors.red
    );
    criticalFailures.forEach((service) =>
      logService(service, 'Failed to start', 'CRITICAL')
    );

    logWithTimestamp('\nTroubleshooting suggestions:', 'INFO', colors.yellow);
    logWithTimestamp(
      '  1. Check if ports are already in use',
      'INFO',
      colors.cyan
    );
    logWithTimestamp(
      '  2. Verify all dependencies are installed',
      'INFO',
      colors.cyan
    );
    logWithTimestamp('  3. Check service logs for errors', 'INFO', colors.cyan);
    logWithTimestamp(
      '  4. Try running "pnpm kill" to clean up processes',
      'INFO',
      colors.cyan
    );

    // Don't exit immediately - let user see the status
    logWithTimestamp(
      '\n⚠️  System may not function properly with failed critical services',
      'WARN',
      colors.yellow
    );
  } else if (failedServices.length > 0) {
    logWithTimestamp(
      '\n⚠️  Some non-critical services failed, but system should still function:',
      'WARN',
      colors.yellow
    );
    failedServices.forEach((service) =>
      logService(service, 'Failed to start (non-critical)', 'WARN')
    );
  } else {
    log('');
    log(`${colors.green}${colors.bold}✓ All ${healthyServices.length} services ready${colors.reset}`, colors.green);
  }

  // Step 9b: Broadcast readiness barrier to services that support it
  const healthByService = new Map(
    healthResults.map((r) => [r.service, r.status])
  );
  const readinessTargets = processes
    .map((p) => p.service)
    .filter((service) => service.readyUrl);
  const unhealthyTargets = readinessTargets.filter(
    (service) => healthByService.get(service.name) !== 'healthy'
  );
  const forceReady = process.env.FORCE_SYSTEM_READY === '1';

  if (unhealthyTargets.length > 0 && !forceReady) {
    logWithTimestamp(
      `\n⚠️  Readiness broadcast skipped; unhealthy services: ${unhealthyTargets
        .map((s) => s.name)
        .join(', ')}`,
      'WARN',
      colors.yellow
    );
    logWithTimestamp(
      '   Set FORCE_SYSTEM_READY=1 to override',
      'INFO',
      colors.cyan
    );
  } else {
    logWithTimestamp('\nBroadcasting system readiness...', 'INFO', colors.cyan);
    const payload = {
      ready: true,
      services: readinessTargets.map((s) => s.name),
      timestamp: Date.now(),
      source: 'scripts/start.js',
    };
    for (const service of readinessTargets) {
      try {
        await postJson(service.readyUrl, payload, 4000);
        logService(service.name, 'Readiness acknowledged', 'HEALTH');
      } catch (error) {
        logService(
          service.name,
          `Readiness push failed: ${error.message}`,
          'WARN'
        );
      }
      await wait(200);
    }
    logWithTimestamp('Readiness broadcast complete', 'SUCCESS', colors.green);
  }

  // Step 10: Check optional external services (Sterling is now started by this script when available)
  log('\nChecking optional external services...', colors.cyan);

  const sterlingUrl = process.env.STERLING_WS_URL || 'ws://localhost:8766';
  if (sterlingAvailable) {
    try {
      const { default: WS } = await import('ws');
      await new Promise((resolve, reject) => {
        const ws = new WS(sterlingUrl, { handshakeTimeout: 3000 });
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error('timeout'));
        }, 4000);
        ws.on('open', () => {
          ws.send(JSON.stringify({ command: 'ping' }));
          ws.on('message', (data) => {
            try {
              const msg = JSON.parse(data.toString());
              if (msg.type === 'pong') {
                clearTimeout(timer);
                ws.close();
                resolve();
              }
            } catch {}
          });
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
      log(
        `  Sterling reasoning server available at ${sterlingUrl}`,
        colors.green
      );
    } catch {
      log(
        `  ℹ️  Sterling started but not responding at ${sterlingUrl} yet (optional)`,
        colors.yellow
      );
    }
  } else {
    log(
      `  ℹ️  Sterling not started (repo not found at ${sterlingDir})`,
      colors.yellow
    );
    log(
      '     To enable: clone Sterling to ../sterling or set STERLING_DIR',
      colors.cyan
    );
  }

  // Minecraft server (external or Docker-managed)
  const mcHost = process.env.MINECRAFT_HOST || 'localhost';
  const mcPort = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
  try {
    const net = await import('net');
    await new Promise((resolve, reject) => {
      const sock = new net.default.Socket();
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error('timeout'));
      }, 3000);
      sock.connect(mcPort, mcHost, () => {
        clearTimeout(timer);
        sock.destroy();
        resolve();
      });
      sock.on('error', (err) => {
        clearTimeout(timer);
        sock.destroy();
        reject(err);
      });
    });
    log(`  Minecraft server available at ${mcHost}:${mcPort}`, colors.green);
  } catch {
    log(
      `  ℹ️  Minecraft server not available at ${mcHost}:${mcPort} (optional)`,
      colors.yellow
    );
    log(
      '     To enable: pnpm docker:up (or start a Minecraft 1.21.9 server manually)',
      colors.cyan
    );
  }

  // Kokoro TTS (optional)
  const ttsUrl = process.env.TTS_API_URL || 'http://localhost:8080';
  if (process.env.TTS_ENABLED !== 'false') {
    // Check for sox first
    let soxOk = false;
    try {
      execSync('which sox', { stdio: 'ignore' });
      soxOk = true;
    } catch {
      log(
        '  ℹ️  sox not found on PATH — TTS playback will be disabled',
        colors.yellow
      );
      log(
        '     To enable: brew install sox',
        colors.cyan
      );
    }

    if (soxOk) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${ttsUrl}/health`, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          log(`  Kokoro TTS available at ${ttsUrl}`, colors.green);
        } else {
          throw new Error('non-ok');
        }
      } catch {
        log(
          `  ℹ️  Kokoro TTS not running at ${ttsUrl} (optional)`,
          colors.yellow
        );
        log(
          '     To enable: cd ../kokoro-onnx && ./start_development.sh',
          colors.cyan
        );
      }
    }
  }

  // Step 11: Display status and URLs
  logWithTimestamp(
    '\nConscious Bot System is running!',
    'SUCCESS',
    colors.green
  );
  logWithTimestamp('Service Status:', 'INFO', colors.blue);

  for (const service of services) {
    const scheme = service.healthUrl == null ? 'ws' : 'http';
    logWithTimestamp(
      `  ${service.name}:     ${scheme}://localhost:${service.port}`,
      'INFO',
      colors.cyan
    );
  }

  logWithTimestamp('', 'INFO');
  logWithTimestamp('Quick Actions:', 'INFO', colors.blue);
  logWithTimestamp(
    '  Dashboard:     http://localhost:3000',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  Core API:      http://localhost:3007',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  Minecraft Bot: http://localhost:3005',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  MLX-LM Sidecar: http://localhost:5002',
    'INFO',
    colors.cyan
  );
  logWithTimestamp('', 'INFO');
  logWithTimestamp('Minecraft Commands:', 'INFO', colors.yellow);
  logWithTimestamp(
    '  Connect bot: curl -X POST http://localhost:3005/connect',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  Disconnect bot: curl -X POST http://localhost:3005/disconnect',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  Get status: curl http://localhost:3005/status',
    'INFO',
    colors.cyan
  );
  logWithTimestamp('', 'INFO');
  logWithTimestamp('To stop all services:', 'INFO', colors.yellow);
  logWithTimestamp('  Press Ctrl+C or run: pnpm kill', 'INFO', colors.cyan);
  logWithTimestamp('', 'INFO');

  // Step 12: Handle graceful shutdown
  const cleanup = async () => {
    logWithTimestamp(
      '\nShutting down Conscious Bot System...',
      'SHUTDOWN',
      colors.yellow
    );

    // Kill all child processes
    for (const { child, service } of processes) {
      logService(service.name, 'Stopping service...', 'SHUTDOWN');
      child.kill('SIGTERM');
    }

    // Wait for graceful shutdown
    await wait(2000);

    // Force kill any remaining processes
    for (const { child, service } of processes) {
      if (!child.killed) {
        logService(service.name, 'Force killing service...', 'SHUTDOWN');
        child.kill('SIGKILL');
      }
    }

    // Kill processes by port
    for (const service of services) {
      killProcessesByPort(service.port);
    }

    logWithTimestamp('All services stopped', 'SUCCESS', colors.green);
    logWithTimestamp('👋 Goodbye!', 'INFO', colors.blue);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the script running
  logWithTimestamp(
    'Services are running. Press Ctrl+C to stop.',
    'INFO',
    colors.green
  );
}

// Run the main function
main().catch((error) => {
  const msg =
    OUTPUT_MODE === 'quiet' ? error.message : `Error: ${error.message}`;
  console.error(`\x1b[31m${msg}\x1b[0m`);
  process.exit(1);
});

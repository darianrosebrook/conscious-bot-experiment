#!/usr/bin/env node

/**
 * Conscious Bot Startup Script
 *
 * Single command to start the entire conscious bot system:
 * - Installs dependencies
 * - Builds all packages
 * - Starts all services
 * - Provides health monitoring
 * - Handles graceful shutdown
 *
 * @author @darianrosebrook
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const services = [
  // Core infrastructure services (start first)
  {
    name: 'Core API',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/core', 'run', 'dev:server'],
    port: 3007,
    healthUrl: 'http://localhost:3007/health',
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
  {
    name: 'Sapient HRM',
    command: 'bash',
    args: [
      '-c',
      'cd sapient-hrm && ./venv-hrm-py311/bin/python hrm_bridge.py --port 5001',
    ],
    port: 5001,
    healthUrl: 'http://localhost:5001/health',
    description: 'Python HRM model for hierarchical reasoning',
    priority: 6, // Start after core services
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

// Utility functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logBanner() {
  log('', colors.reset);
  log('🧠 Conscious Bot System', colors.bold + colors.blue);
  log('========================', colors.blue);
  log('', colors.reset);
}

// Enhanced logging with structured format
function logWithTimestamp(message, level = 'INFO', color = colors.reset) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  console.log(`${color}${logEntry}${colors.reset}`);
}

// Service-specific logging with consistent format
function logService(serviceName, message, level = 'INFO') {
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
    'Sapient HRM': colors.cyan,
  };
  return colorMap[serviceName] || colors.reset;
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

async function setupPythonEnvironment() {
  log('\n🐍 Setting up Python 3.11 environment for HRM...', colors.cyan);

  const hrmDir = path.join(process.cwd(), 'sapient-hrm');
  const venvPath = path.join(hrmDir, 'venv-hrm-py311');

  // Check if Python 3.11 is available
  try {
    execSync('python3.11 --version', { stdio: 'ignore' });
    log(' ✅ Python 3.11 is available', colors.green);
  } catch {
    log(
      ' ❌ Python 3.11 is not available. Please install Python 3.11 first.',
      colors.red
    );
    log('   On macOS: brew install python@3.11', colors.cyan);
    process.exit(1);
  }

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    log(' 📦 Creating Python 3.11 virtual environment...', colors.cyan);
    try {
      execSync(`cd ${hrmDir} && python3.11 -m venv venv-hrm-py311`, {
        stdio: 'inherit',
      });
      log(' ✅ Virtual environment created', colors.green);
    } catch (error) {
      log(' ❌ Failed to create virtual environment', colors.red);
      process.exit(1);
    }
  } else {
    log(' ✅ Virtual environment already exists', colors.green);
  }

  // Install Python dependencies
  log(' 📦 Installing Python dependencies...', colors.cyan);
  try {
    execSync(
      `cd ${hrmDir} && source venv-hrm-py311/bin/activate && pip install --upgrade pip`,
      {
        stdio: 'inherit',
        shell: true,
      }
    );
    execSync(
      `cd ${hrmDir} && source venv-hrm-py311/bin/activate && pip install -r requirements.txt`,
      {
        stdio: 'inherit',
        shell: true,
      }
    );
    log(' ✅ Python dependencies installed', colors.green);
  } catch (error) {
    log(' ❌ Failed to install Python dependencies', colors.red);
    process.exit(1);
  }

  // Test HRM import
  log(' 🔍 Testing HRM model import...', colors.cyan);
  try {
    execSync(
      `cd ${hrmDir} && source venv-hrm-py311/bin/activate && python3.11 -c "from models.hrm.hrm_act_v1 import HierarchicalReasoningModel_ACTV1; print('HRM model import successful')"`,
      {
        stdio: 'inherit',
        shell: true,
      }
    );
    log(' ✅ HRM model import successful', colors.green);
  } catch (error) {
    log(' ⚠️  HRM model import failed, will use mock model', colors.yellow);
  }
}

async function setupMLXEnvironment() {
  log('\n🧠 Setting up MLX-LM sidecar environment...', colors.purple);

  const mlxDir = path.join(process.cwd(), 'mlx-lm-sidecar');
  const venvPath = path.join(mlxDir, 'venv-mlx');

  // Check if directory exists
  if (!fs.existsSync(mlxDir)) {
    log(' ⚠️  mlx-lm-sidecar directory not found, skipping MLX setup', colors.yellow);
    return;
  }

  // Check for Apple Silicon
  try {
    const arch = execSync('uname -m', { encoding: 'utf-8' }).trim();
    if (arch !== 'arm64') {
      log(' ⚠️  MLX requires Apple Silicon (arm64). Skipping MLX setup.', colors.yellow);
      return;
    }
  } catch {
    log(' ⚠️  Could not detect architecture, skipping MLX setup', colors.yellow);
    return;
  }

  // Create virtual environment if it doesn't exist
  if (!fs.existsSync(venvPath)) {
    log(' 📦 Creating MLX virtual environment...', colors.purple);
    try {
      execSync(`cd ${mlxDir} && python3 -m venv venv-mlx`, {
        stdio: 'inherit',
      });
      log(' ✅ MLX virtual environment created', colors.green);
    } catch (error) {
      log(' ❌ Failed to create MLX virtual environment', colors.red);
      return;
    }
  } else {
    log(' ✅ MLX virtual environment already exists', colors.green);
  }

  // Install Python dependencies
  log(' 📦 Installing MLX dependencies...', colors.purple);
  try {
    execSync(
      `cd ${mlxDir} && ./venv-mlx/bin/pip install --upgrade pip`,
      { stdio: 'inherit', shell: true }
    );
    execSync(
      `cd ${mlxDir} && ./venv-mlx/bin/pip install -r requirements.txt`,
      { stdio: 'inherit', shell: true }
    );
    log(' ✅ MLX dependencies installed', colors.green);
  } catch (error) {
    log(' ❌ Failed to install MLX dependencies', colors.red);
  }

  // Verify MLX models are cached
  log(' 🔍 Verifying MLX model cache...', colors.purple);
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
    log(' ✅ MLX models are cached locally', colors.green);
  } catch (error) {
    log(' ⚠️  Some MLX models are not cached — first startup will download them', colors.yellow);
    log('     Run: cd mlx-lm-sidecar && bash setup.sh to pre-download', colors.cyan);
  }
}

// Docker compose management
async function startDockerServices() {
  log('\n🐳 Starting Docker services...', colors.cyan);

  // Check if Docker is available
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    log(' ⚠️  Docker is not installed or not in PATH — skipping Docker services', colors.yellow);
    return;
  }

  // Check if Docker daemon is running
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch {
    log(' ⚠️  Docker daemon is not running — skipping Docker services', colors.yellow);
    return;
  }

  try {
    execSync('docker compose up -d', { stdio: 'inherit', cwd: process.cwd() });
    log(' ✅ Docker compose started', colors.green);
  } catch (error) {
    log(` ⚠️  docker compose up failed: ${error.message}`, colors.yellow);
    return;
  }

  // Wait for Postgres healthcheck
  log(' ⏳ Waiting for Postgres...', colors.cyan);
  let pgReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      execSync('docker exec conscious-bot-postgres pg_isready -U conscious_bot -q', { stdio: 'ignore' });
      pgReady = true;
      break;
    } catch {
      await wait(2000);
    }
  }
  if (pgReady) {
    log(' ✅ Postgres is ready', colors.green);
  } else {
    log(' ⚠️  Postgres did not become ready in time', colors.yellow);
  }

  // Log Minecraft status (non-blocking — it's optional)
  try {
    execSync('docker exec conscious-bot-minecraft mc-health', { stdio: 'ignore' });
    log(' ✅ Minecraft server is ready', colors.green);
  } catch {
    log(' ℹ️  Minecraft server is still starting (non-blocking)', colors.yellow);
  }
}

// Main function
async function main() {
  logBanner();

  // Step 1: Check Node.js version
  log('🔍 Checking system requirements...', colors.cyan);
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);

  if (nodeMajor < 18) {
    log(
      ` ❌ Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`,
      colors.red
    );
    process.exit(1);
  }
  log(` ✅ Node.js ${nodeVersion} is supported`, colors.green);

  // Step 2: Check if pnpm is available
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    log(' ✅ pnpm is available', colors.green);
  } catch {
    log(
      ' ❌ pnpm is not installed. Please install pnpm first: npm install -g pnpm',
      colors.red
    );
    process.exit(1);
  }

  // Step 3: Setup Python environment
  await setupPythonEnvironment();

  // Step 3b: Setup MLX-LM sidecar environment
  await setupMLXEnvironment();

  // Step 3c: Start Docker services (Postgres + Minecraft)
  const skipDocker = process.argv.includes('--skip-docker');
  if (skipDocker) {
    log('\n🐳 Skipping Docker services (--skip-docker)', colors.yellow);
  } else {
    await startDockerServices();
  }

  // Step 4: Kill existing processes
  log('\n🔄 Cleaning up existing processes...', colors.cyan);

  const processPatterns = [
    'tsx src/server.ts',
    'next dev',
    'node.*dev.js',
    'pnpm.*dev',
    'minecraft-interface',
    'python3.*hrm_bridge.py',
    'hrm_bridge.py',
    'python3.*mlx_server.py',
    'mlx_server.py',
  ];

  for (const pattern of processPatterns) {
    killProcessesByPattern(pattern);
  }

  for (const service of services) {
    killProcessesByPort(service.port);
  }

  await wait(2000);

  // Step 5: Check port availability
  log('\n🔍 Checking port availability...', colors.cyan);
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
  log('\n📦 Installing Node.js dependencies...', colors.cyan);
  try {
    execSync('pnpm install', { stdio: 'inherit' });
    log(' ✅ Node.js dependencies installed', colors.green);
  } catch (error) {
    log(' ❌ Failed to install Node.js dependencies', colors.red);
    process.exit(1);
  }

  // Step 7: Build packages
  log('\n🔨 Building packages...', colors.cyan);
  try {
    execSync('pnpm build', { stdio: 'inherit' });
    log(' ✅ Packages built successfully', colors.green);
  } catch (error) {
    log(' ❌ Failed to build packages', colors.red);
    process.exit(1);
  }

  // Step 8: Start services in priority order with dependency checking
  log('\n🚀 Starting services in dependency order...', colors.cyan);
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

    const child = spawn(service.command, service.args, {
      stdio: 'pipe',
      shell: true,
      cwd:
        service.name === 'Sapient HRM'
          ? `${process.cwd()}/sapient-hrm`
          : service.name === 'MLX-LM Sidecar'
            ? `${process.cwd()}/mlx-lm-sidecar`
            : process.cwd(),
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    // Handle output with service prefix
    child.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[${service.name}] ${output}`);
      }
    });

    child.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !output.includes('Warning')) {
        console.error(`[${service.name}] ${output}`);
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

      // Check if service is healthy
      await waitForService(service.healthUrl, service.name, 30); // 30 attempts = 60 seconds max

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

  log('\n🔍 Checking service health...', colors.cyan);

  const healthResults = [];
  const failedServices = [];

  // Check services with improved error handling
  for (const { service } of processes) {
    try {
      await waitForService(service.healthUrl, service.name);
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

  // Summary of health checks
  log('\n📊 Health Check Summary:', colors.blue);
  for (const result of healthResults) {
    if (result.status === 'healthy') {
      log(`  ✅ ${result.service}`, colors.green);
    } else {
      log(`  ❌ ${result.service}: ${result.error}`, colors.red);
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

    logWithTimestamp(
      '\n💡 Troubleshooting suggestions:',
      'INFO',
      colors.yellow
    );
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
    logWithTimestamp(
      '\n🎉 All services passed health checks!',
      'SUCCESS',
      colors.green
    );
  }

  // Step 10: Check optional external services
  log('\n🔍 Checking optional external services...', colors.cyan);

  // Sterling reasoning server (external, not managed by us)
  const sterlingUrl = process.env.STERLING_WS_URL || 'ws://localhost:8766';
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
    log(`  ✅ Sterling reasoning server available at ${sterlingUrl}`, colors.green);
  } catch {
    log(`  ℹ️  Sterling reasoning server not available at ${sterlingUrl} (optional)`, colors.yellow);
    log('     To enable: cd /path/to/sterling && source venv/bin/activate && python scripts/utils/sterling_unified_server.py', colors.cyan);
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
    log(`  ✅ Minecraft server available at ${mcHost}:${mcPort}`, colors.green);
  } catch {
    log(`  ℹ️  Minecraft server not available at ${mcHost}:${mcPort} (optional)`, colors.yellow);
    log('     To enable: pnpm docker:up (or start a Minecraft 1.20.1 server manually)', colors.cyan);
  }

  // Step 11: Display status and URLs
  logWithTimestamp(
    '\n🎉 Conscious Bot System is running!',
    'SUCCESS',
    colors.green
  );
  logWithTimestamp('📊 Service Status:', 'INFO', colors.blue);

  for (const service of services) {
    logWithTimestamp(
      `  ${service.name}:     http://localhost:${service.port}`,
      'INFO',
      colors.cyan
    );
  }

  logWithTimestamp('', 'INFO');
  logWithTimestamp('🔗 Quick Actions:', 'INFO', colors.blue);
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
    '  Sapient HRM:   http://localhost:5001',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  MLX-LM Sidecar: http://localhost:5002',
    'INFO',
    colors.cyan
  );
  logWithTimestamp('', 'INFO');
  logWithTimestamp('🎮 Minecraft Commands:', 'INFO', colors.yellow);
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
  logWithTimestamp('🧠 HRM Commands:', 'INFO', colors.yellow);
  logWithTimestamp(
    '  Health check: curl http://localhost:5001/health',
    'INFO',
    colors.cyan
  );
  logWithTimestamp(
    '  Test reasoning: curl -X POST http://localhost:5001/reason -H "Content-Type: application/json" -d \'{"task": "test", "context": {}}\'',
    'INFO',
    colors.cyan
  );
  logWithTimestamp('', 'INFO');
  logWithTimestamp('🛑 To stop all services:', 'INFO', colors.yellow);
  logWithTimestamp('  Press Ctrl+C or run: pnpm kill', 'INFO', colors.cyan);
  logWithTimestamp('', 'INFO');

  // Step 12: Handle graceful shutdown
  const cleanup = async () => {
    logWithTimestamp(
      '\n🛑 Shutting down Conscious Bot System...',
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

    logWithTimestamp('✅ All services stopped', 'SUCCESS', colors.green);
    logWithTimestamp('👋 Goodbye!', 'INFO', colors.blue);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the script running
  logWithTimestamp(
    '💡 Services are running. Press Ctrl+C to stop.',
    'INFO',
    colors.green
  );
}

// Run the main function
main().catch((error) => {
  logWithTimestamp(`❌ Error: ${error.message}`, 'ERROR', colors.red);
  process.exit(1);
});

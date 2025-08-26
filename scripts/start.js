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

// Service configuration
const services = [
  {
    name: 'Dashboard',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/dashboard', 'dev'],
    port: 3000,
    healthUrl: 'http://localhost:3000',
    description: 'Web dashboard for monitoring and control',
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
  },
  {
    name: 'Cognition',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/cognition', 'run', 'dev:server'],
    port: 3003,
    healthUrl: 'http://localhost:3003/health',
    description: 'Cognitive reasoning and decision making',
  },
  {
    name: 'Memory',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/memory', 'run', 'dev:server'],
    port: 3001,
    healthUrl: 'http://localhost:3001/health',
    description: 'Memory storage and retrieval system',
  },
  {
    name: 'World',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/world', 'run', 'dev:server'],
    port: 3004,
    healthUrl: 'http://localhost:3004/health',
    description: 'World state management and simulation',
  },
  {
    name: 'Planning',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/planning', 'run', 'dev:server'],
    port: 3002,
    healthUrl: 'http://localhost:3002/health',
    description: 'Task planning and execution coordination',
  },
  {
    name: 'Sapient HRM',
    command: 'python3',
    args: ['sapient-hrm/hrm_bridge.py', '--port', '5000'],
    port: 5000,
    healthUrl: 'http://localhost:5000/health',
    description: 'Python HRM model for hierarchical reasoning',
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

function checkPort(port) {
  try {
    execSync(`lsof -Pi :${port} -sTCP:LISTEN -t`, { stdio: 'ignore' });
    return true; // Port is in use
  } catch {
    return false; // Port is available
  }
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

async function waitForService(url, serviceName, maxAttempts = 30) {
  return new Promise(async (resolve, reject) => {
    const http = await import('http');
    const https = await import('https');
    const client = url.startsWith('https') ? https.default : http.default;

    let attempts = 0;

    const check = () => {
      attempts++;

      const req = client.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          log(` ✅ ${serviceName} is ready!`, colors.green);
          resolve();
        } else {
          if (attempts < maxAttempts) {
            setTimeout(check, 2000);
          } else {
            log(` ⚠️  ${serviceName} health check failed`, colors.yellow);
            resolve(); // Don't fail, just warn
          }
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          log(
            ` ⏳ Attempt ${attempts}/${maxAttempts} - ${serviceName} starting...`,
            colors.yellow
          );
          setTimeout(check, 2000);
        } else {
          log(` ⚠️  ${serviceName} health check timeout`, colors.yellow);
          resolve(); // Don't fail, just warn
        }
      });

      req.setTimeout(5000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, 2000);
        } else {
          log(` ⚠️  ${serviceName} health check timeout`, colors.yellow);
          resolve(); // Don't fail, just warn
        }
      });
    };

    check();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Step 2.5: Check if Python 3 is available
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    log(' ✅ Python 3 is available', colors.green);
  } catch {
    log(' ❌ Python 3 is not installed. Please install Python 3 first.', colors.red);
    process.exit(1);
  }

  // Step 3: Kill existing processes
  log('\n🔄 Cleaning up existing processes...', colors.cyan);

  const processPatterns = [
    'tsx src/server.ts',
    'next dev',
    'node.*dev.js',
    'pnpm.*dev',
    'minecraft-interface',
    'python3.*hrm_bridge.py',
    'hrm_bridge.py',
  ];

  for (const pattern of processPatterns) {
    killProcessesByPattern(pattern);
  }

  for (const service of services) {
    killProcessesByPort(service.port);
  }

  await wait(2000);

  // Step 4: Check port availability
  log('\n🔍 Checking port availability...', colors.cyan);
  const portConflicts = [];

  for (const service of services) {
    if (checkPort(service.port)) {
      portConflicts.push(service);
      log(
        ` ❌ Port ${service.port} is still in use for ${service.name}`,
        colors.red
      );
    } else {
      log(
        ` ✅ Port ${service.port} is available for ${service.name}`,
        colors.green
      );
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

  // Step 5: Install dependencies
  log('\n📦 Installing dependencies...', colors.cyan);
  try {
    execSync('pnpm install', { stdio: 'inherit' });
    log(' ✅ Node.js dependencies installed', colors.green);
  } catch (error) {
    log(' ❌ Failed to install Node.js dependencies', colors.red);
    process.exit(1);
  }

  // Step 5.5: Install Python dependencies for sapient-hrm
  log('\n🐍 Installing Python dependencies...', colors.cyan);
  try {
    execSync('cd sapient-hrm && pip install -r requirements.txt', { stdio: 'inherit' });
    log(' ✅ Python dependencies installed', colors.green);
  } catch (error) {
    log(' ⚠️  Failed to install Python dependencies. Continuing anyway...', colors.yellow);
  }

  // Step 6: Build packages
  log('\n🔨 Building packages...', colors.cyan);
  try {
    execSync('pnpm build', { stdio: 'inherit' });
    log(' ✅ Packages built successfully', colors.green);
  } catch (error) {
    log(' ❌ Failed to build packages', colors.red);
    process.exit(1);
  }

  // Step 7: Start all services
  log('\n🚀 Starting all services...', colors.cyan);
  log('');

  const processes = [];

  for (const service of services) {
    log(
      ` 🚀 Starting ${service.name} (port ${service.port})...`,
      colors.purple
    );
    log(`    ${service.description}`, colors.reset);

    const child = spawn(service.command, service.args, {
      stdio: 'pipe',
      shell: true,
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
      log(` ❌ Failed to start ${service.name}: ${error.message}`, colors.red);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        log(` ❌ ${service.name} exited with code ${code}`, colors.red);
      } else {
        log(` ✅ ${service.name} exited normally`, colors.green);
      }
    });

    processes.push({ child, service });

    // Small delay between starts
    await wait(1000);
  }

  // Step 8: Wait for services to start and check health
  log('\n⏳ Waiting for services to start...', colors.cyan);
  await wait(5000);

  log('\n🔍 Checking service health...', colors.cyan);

  try {
    await Promise.all(
      processes.map(({ service }) =>
        waitForService(service.healthUrl, service.name)
      )
    );
  } catch (error) {
    log(
      ` ⚠️  Some services may not be fully ready: ${error.message}`,
      colors.yellow
    );
  }

  // Step 9: Display status and URLs
  log('\n🎉 Conscious Bot System is running!', colors.green);
  log('');
  log('📊 Service Status:', colors.blue);

  for (const service of services) {
    log(
      `  ${colors.cyan}${service.name}:${colors.reset}     http://localhost:${service.port}`,
      colors.reset
    );
  }

  log('');
  log('🔗 Quick Actions:', colors.blue);
  log(
    `  ${colors.cyan}Dashboard:${colors.reset}     http://localhost:3000`,
    colors.reset
  );
  log(
    `  ${colors.cyan}Minecraft Bot:${colors.reset}  http://localhost:3005`,
    colors.reset
  );
  log(
    `  ${colors.cyan}Minecraft Viewer:${colors.reset} http://localhost:3006`,
    colors.reset
  );
  log(
    `  ${colors.cyan}Sapient HRM:${colors.reset}    http://localhost:5000`,
    colors.reset
  );
  log('');
  log('🎮 Minecraft Commands:', colors.yellow);
  log('  Connect bot: curl -X POST http://localhost:3005/connect');
  log('  Disconnect bot: curl -X POST http://localhost:3005/disconnect');
  log('  Get status: curl http://localhost:3005/status');
  log('');
  log('🛑 To stop all services:', colors.yellow);
  log('  Press Ctrl+C or run: pnpm kill');
  log('');

  // Step 10: Handle graceful shutdown
  const cleanup = async () => {
    log('\n🛑 Shutting down Conscious Bot System...', colors.yellow);

    // Kill all child processes
    for (const { child, service } of processes) {
      log(`  Stopping ${service.name}...`, colors.yellow);
      child.kill('SIGTERM');
    }

    // Wait for graceful shutdown
    await wait(2000);

    // Force kill any remaining processes
    for (const { child, service } of processes) {
      if (!child.killed) {
        log(`  Force killing ${service.name}...`, colors.yellow);
        child.kill('SIGKILL');
      }
    }

    // Kill processes by port
    for (const service of services) {
      killProcessesByPort(service.port);
    }

    log('✅ All services stopped', colors.green);
    log('👋 Goodbye!', colors.blue);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the script running
  log('💡 Services are running. Press Ctrl+C to stop.', colors.green);
}

// Run the main function
main().catch((error) => {
  log(`❌ Error: ${error.message}`, colors.red);
  process.exit(1);
});

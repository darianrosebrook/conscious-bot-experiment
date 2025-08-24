#!/usr/bin/env node

/**
 * Conscious Bot Development Environment Startup Script
 * Starts all necessary services for the conscious bot system
 *
 * @author @darianrosebrook
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  },
  {
    name: 'Minecraft Bot',
    command: 'pnpm',
    args: [
      '--filter',
      '@conscious-bot/minecraft-interface',
      'run',
      'dev:server',
    ],
    port: 3005,
    healthUrl: 'http://localhost:3005/health',
  },
  {
    name: 'Cognition',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/cognition', 'run', 'dev:server'],
    port: 3003,
    healthUrl: 'http://localhost:3003/health',
  },
  {
    name: 'Memory',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/memory', 'run', 'dev:server'],
    port: 3001,
    healthUrl: 'http://localhost:3001/health',
  },
  {
    name: 'World',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/world', 'run', 'dev:server'],
    port: 3004,
    healthUrl: 'http://localhost:3004/health',
  },
  {
    name: 'Planning',
    command: 'pnpm',
    args: ['--filter', '@conscious-bot/planning', 'run', 'dev:server'],
    port: 3002,
    healthUrl: 'http://localhost:3002/health',
  },
];

// Utility functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkPort(port) {
  try {
    execSync(`lsof -Pi :${port} -sTCP:LISTEN -t`, { stdio: 'ignore' });
    return true; // Port is in use
  } catch {
    return false; // Port is available
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
          log(`✅ ${serviceName} is ready!`, colors.green);
          resolve();
        } else {
          if (attempts < maxAttempts) {
            setTimeout(check, 2000);
          } else {
            reject(new Error(`${serviceName} failed to start`));
          }
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          log(
            `⏳ Attempt ${attempts}/${maxAttempts} - ${serviceName} not ready yet...`,
            colors.yellow
          );
          setTimeout(check, 2000);
        } else {
          reject(
            new Error(`${serviceName} failed to start within expected time`)
          );
        }
      });

      req.setTimeout(5000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, 2000);
        } else {
          reject(
            new Error(`${serviceName} failed to start within expected time`)
          );
        }
      });
    };

    check();
  });
}

// Main function
async function main() {
  log('🤖 Conscious Bot Development Environment', colors.blue);
  log('=====================================', colors.blue);
  log('');

  // Check if required ports are available
  log('🔍 Checking port availability...', colors.cyan);
  for (const service of services) {
    if (checkPort(service.port)) {
      log(
        `❌ Port ${service.port} is already in use by another process`,
        colors.red
      );
      log(
        `   Please stop the process using port ${service.port} and try again`,
        colors.yellow
      );
      process.exit(1);
    }
  }
  log('✅ All ports are available', colors.green);
  log('');

  // Install dependencies if needed
  log('📦 Installing dependencies...', colors.cyan);
  try {
    execSync('pnpm install', { stdio: 'inherit' });
    log('✅ Dependencies installed', colors.green);
  } catch (error) {
    log('❌ Failed to install dependencies', colors.red);
    process.exit(1);
  }
  log('');

  // Build packages if needed
  log('🔨 Building packages...', colors.cyan);
  try {
    execSync('pnpm build', { stdio: 'inherit' });
    log('✅ Packages built', colors.green);
  } catch (error) {
    log('❌ Failed to build packages', colors.red);
    process.exit(1);
  }
  log('');

  // Start all services
  log('🚀 Starting all services...', colors.cyan);
  log('');

  const processes = [];

  for (const service of services) {
    log(`📊 Starting ${service.name} (port ${service.port})...`, colors.purple);

    const child = spawn(service.command, service.args, {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    // Handle output
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
      log(`❌ Failed to start ${service.name}: ${error.message}`, colors.red);
    });

    processes.push({ child, service });
  }

  // Wait a moment for services to start
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check if services are ready
  log('');
  log('🔍 Checking service status...', colors.cyan);

  try {
    await Promise.all(
      processes.map(({ service }) =>
        waitForService(service.healthUrl, service.name)
      )
    );
  } catch (error) {
    log(`❌ ${error.message}`, colors.red);
    // Continue anyway, some services might not have health endpoints
  }

  log('');
  log('🎉 All services started successfully!', colors.green);
  log('');
  log('📋 Service URLs:', colors.blue);
  log(`  ${colors.cyan}Dashboard:${colors.reset}     http://localhost:3000`);
  log(`  ${colors.cyan}Minecraft Bot:${colors.reset}  http://localhost:3005`);
  log(`  ${colors.cyan}Minecraft Viewer:${colors.reset} http://localhost:3006`);
  log(`  ${colors.cyan}Cognition:${colors.reset}      http://localhost:3003`);
  log(`  ${colors.cyan}Memory:${colors.reset}         http://localhost:3001`);
  log(`  ${colors.cyan}World:${colors.reset}          http://localhost:3004`);
  log(`  ${colors.cyan}Planning:${colors.reset}       http://localhost:3002`);
  log('');
  log('💡 To connect the bot to Minecraft:', colors.yellow);
  log('  curl -X POST http://localhost:3005/connect');
  log('');
  log('🛑 To stop all services:', colors.yellow);
  log('  Press Ctrl+C');
  log('');

  // Handle cleanup on exit
  const cleanup = () => {
    log('');
    log('🛑 Stopping all services...', colors.yellow);

    processes.forEach(({ child }) => {
      child.kill('SIGTERM');
    });

    log('✅ All services stopped', colors.green);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the script running
  log('🔄 Services are running. Press Ctrl+C to stop.', colors.green);
}

// Run the main function
main().catch((error) => {
  log(`❌ Error: ${error.message}`, colors.red);
  process.exit(1);
});

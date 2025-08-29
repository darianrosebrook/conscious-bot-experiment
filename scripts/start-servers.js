#!/usr/bin/env node

/**
 * Server Management Script
 *
 * Kills existing server processes and starts all services fresh
 *
 * @author @darianrosebrook
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Server ports used by our services
const SERVER_PORTS = {
  dashboard: 3000,
  minecraft: 3005,
  cognition: 3003,
  memory: 3001,
  world: 3004,
  planning: 3002,
  core: 3007,
};

// Process patterns to kill
const PROCESS_PATTERNS = [
  'tsx src/server.ts',
  'next dev',
  'node.*dev.js',
  'pnpm.*dev',
  'minecraft-interface',
];

/**
 * Kill processes by pattern
 */
async function killProcessesByPattern(pattern) {
  try {
    const { stdout } = await execAsync(`pkill -f "${pattern}"`);
    console.log(`✅ Killed processes matching: ${pattern}`);
    return true;
  } catch (error) {
    // pkill returns non-zero if no processes found, which is fine
    console.log(`ℹ️  No processes found for pattern: ${pattern}`);
    return false;
  }
}

/**
 * Kill processes by port
 */
async function killProcessesByPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port} | xargs kill -9`);
    console.log(`✅ Killed processes on port ${port}`);
    return true;
  } catch (error) {
    console.log(`ℹ️  No processes found on port ${port}`);
    return false;
  }
}

/**
 * Wait for a specified time
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if port is available
 */
async function isPortAvailable(port) {
  try {
    await execAsync(`lsof -i:${port}`);
    return false; // Port is in use
  } catch (error) {
    return true; // Port is available
  }
}

/**
 * Wait for port to become available
 */
async function waitForPort(port, maxWaitMs = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (await isPortAvailable(port)) {
      return true;
    }
    await wait(100);
  }
  return false;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Conscious Bot Server Management...\n');

  // Step 1: Kill existing processes
  console.log('🔄 Killing existing server processes...');

  for (const pattern of PROCESS_PATTERNS) {
    await killProcessesByPattern(pattern);
  }

  // Step 2: Kill processes by port
  console.log('\n🔄 Killing processes by port...');

  for (const [service, port] of Object.entries(SERVER_PORTS)) {
    await killProcessesByPort(port);
  }

  // Step 3: Wait for ports to be released
  console.log('\n⏳ Waiting for ports to be released...');
  await wait(2000);

  // Step 4: Verify ports are available
  console.log('\n🔍 Verifying ports are available...');
  for (const [service, port] of Object.entries(SERVER_PORTS)) {
    const available = await isPortAvailable(port);
    if (available) {
      console.log(`✅ Port ${port} (${service}) is available`);
    } else {
      console.log(`⚠️  Port ${port} (${service}) is still in use`);
    }
  }

  // Step 5: Start all services
  console.log('\n🚀 Starting all services...');

  const services = [
    {
      name: 'dashboard',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/dashboard', 'dev'],
    },
    {
      name: 'core',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/core', 'run', 'dev:server'],
    },
    {
      name: 'minecraft',
      command: 'pnpm',
      args: [
        '--filter',
        '@conscious-bot/minecraft-interface',
        'run',
        'dev:server',
      ],
    },
    {
      name: 'cognition',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/cognition', 'run', 'dev:server'],
    },
    {
      name: 'memory',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/memory', 'run', 'dev:server'],
    },
    {
      name: 'world',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/world', 'run', 'dev:server'],
    },
    {
      name: 'planning',
      command: 'pnpm',
      args: ['--filter', '@conscious-bot/planning', 'run', 'dev:server'],
    },
  ];

  const processes = [];

  for (const service of services) {
    console.log(`Starting ${service.name}...`);

    const child = spawn(service.command, service.args, {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    // Add service name to output
    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          console.log(`[${service.name.toUpperCase()}] ${line}`);
        }
      });
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach((line) => {
        if (line.trim()) {
          console.error(`[${service.name.toUpperCase()}] ${line}`);
        }
      });
    });

    child.on('error', (error) => {
      console.error(`❌ Error starting ${service.name}:`, error.message);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`❌ ${service.name} exited with code ${code}`);
      } else {
        console.log(`✅ ${service.name} exited normally`);
      }
    });

    processes.push({ name: service.name, process: child });

    // Small delay between starts to avoid overwhelming the system
    await wait(500);
  }

  console.log('\n🎉 All services started!');
  console.log('\n📊 Service Status:');
  console.log('Dashboard: http://localhost:3000');
  console.log('Core API: http://localhost:3007');
  console.log('Minecraft Interface: http://localhost:3005');
  console.log('Cognition: http://localhost:3003');
  console.log('Memory: http://localhost:3001');
  console.log('World: http://localhost:3004');
  console.log('Planning: http://localhost:3002');

  console.log('\n💡 Press Ctrl+C to stop all services');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down all services...');

    for (const { name, process: child } of processes) {
      console.log(`Stopping ${name}...`);
      child.kill('SIGTERM');
    }

    // Wait a bit for graceful shutdown
    await wait(2000);

    // Force kill any remaining processes
    for (const { name, process: child } of processes) {
      if (!child.killed) {
        console.log(`Force killing ${name}...`);
        child.kill('SIGKILL');
      }
    }

    console.log('✅ All services stopped');
    process.exit(0);
  });

  // Keep the script running
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    process.exit(0);
  });
}

// Run the main function
main().catch((error) => {
  console.error('❌ Error in server management:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Kill All Servers Script
 *
 * Kills all running server processes for the conscious bot
 *
 * @author @darianrosebrook
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Server ports used by our services (must match start.js)
const SERVER_PORTS = {
  core: 3007,
  memory: 3001,
  world: 3004,
  cognition: 3003,
  planning: 3002,
  minecraft: 3005,
  dashboard: 3000,
  mlx: 5002,
  sterling: 8766,
};

// Process patterns to kill (catches orphaned children from scripts)
const PROCESS_PATTERNS = [
  'tsx src/server.ts',
  'next dev',
  'node.*dev.js',
  'pnpm.*dev',
  'minecraft-interface',
  'python3.*mlx_server.py',
  'mlx_server.py',
  'sterling_unified_server.py',
];

/**
 * Kill processes by pattern
 */
async function killProcessesByPattern(pattern) {
  try {
    await execAsync(`pkill -f "${pattern}"`);
    console.log(`Killed processes matching: ${pattern}`);
    return true;
  } catch {
    console.log(`No processes for pattern: ${pattern}`);
    return false;
  }
}

/**
 * Kill processes by port
 */
async function killProcessesByPort(port) {
  try {
    await execAsync(`lsof -ti:${port} | xargs kill -9`);
    console.log(`Killed processes on port ${port}`);
    return true;
  } catch {
    console.log(`No processes on port ${port}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Killing all Conscious Bot servers...\n');

  console.log('By process pattern...');
  for (const pattern of PROCESS_PATTERNS) {
    await killProcessesByPattern(pattern);
  }

  console.log('\nBy port...');
  for (const [service, port] of Object.entries(SERVER_PORTS)) {
    await killProcessesByPort(port);
  }

  console.log('\nDone. Run "pnpm start" or "pnpm dev" to start again.');
}

main().catch((error) => {
  console.error('Error killing servers:', error.message);
  process.exit(1);
});

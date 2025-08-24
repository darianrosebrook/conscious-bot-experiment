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

// Server ports used by our services
const SERVER_PORTS = {
  dashboard: 3000,
  minecraft: 3005,
  cognition: 3003,
  memory: 3001,
  world: 3004,
  planning: 3002,
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
 * Main function
 */
async function main() {
  console.log('🛑 Killing all Conscious Bot servers...\n');

  // Kill processes by pattern
  console.log('🔄 Killing processes by pattern...');
  for (const pattern of PROCESS_PATTERNS) {
    await killProcessesByPattern(pattern);
  }

  // Kill processes by port
  console.log('\n🔄 Killing processes by port...');
  for (const [service, port] of Object.entries(SERVER_PORTS)) {
    await killProcessesByPort(port);
  }

  console.log('\n✅ All servers killed!');
  console.log('\n💡 Run "pnpm dev" to start servers again');
}

// Run the main function
main().catch((error) => {
  console.error('❌ Error killing servers:', error);
  process.exit(1);
});

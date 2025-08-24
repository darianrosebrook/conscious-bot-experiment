#!/usr/bin/env node

/**
 * Server Status Script
 *
 * Checks the status of all conscious bot servers
 *
 * @author @darianrosebrook
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Server configuration
const SERVERS = [
  { name: 'Dashboard', port: 3000, url: 'http://localhost:3000' },
  { name: 'Minecraft Interface', port: 3005, url: 'http://localhost:3005' },
  { name: 'Cognition', port: 3003, url: 'http://localhost:3003' },
  { name: 'Memory', port: 3001, url: 'http://localhost:3001' },
  { name: 'World', port: 3004, url: 'http://localhost:3004' },
  { name: 'Planning', port: 3002, url: 'http://localhost:3002' },
];

/**
 * Check if port is in use
 */
async function isPortInUse(port) {
  try {
    await execAsync(`lsof -i:${port}`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if server is responding
 */
async function checkServerHealth(url) {
  try {
    const { stdout } = await execAsync(
      `curl -s -o /dev/null -w "%{http_code}" ${url}/health || curl -s -o /dev/null -w "%{http_code}" ${url}`
    );
    return (
      stdout.trim() === '200' ||
      stdout.trim() === '404' ||
      stdout.trim() === '000'
    );
  } catch (error) {
    return false;
  }
}

/**
 * Get process info for port
 */
async function getProcessInfo(port) {
  try {
    const { stdout } = await execAsync(`lsof -i:${port} -t`);
    const pids = stdout
      .trim()
      .split('\n')
      .filter((pid) => pid);

    if (pids.length === 0) return null;

    const processInfo = [];
    for (const pid of pids) {
      try {
        const { stdout: psOutput } = await execAsync(
          `ps -p ${pid} -o pid,ppid,command --no-headers`
        );
        processInfo.push(psOutput.trim());
      } catch (error) {
        processInfo.push(`PID ${pid} (process info unavailable)`);
      }
    }

    return processInfo;
  } catch (error) {
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('📊 Conscious Bot Server Status\n');

  const statuses = [];

  for (const server of SERVERS) {
    const portInUse = await isPortInUse(server.port);
    const healthy = portInUse ? await checkServerHealth(server.url) : false;
    const processInfo = portInUse ? await getProcessInfo(server.port) : null;

    statuses.push({
      ...server,
      portInUse,
      healthy,
      processInfo,
    });
  }

  // Display status
  for (const status of statuses) {
    const statusIcon = status.portInUse ? (status.healthy ? '✅' : '⚠️') : '❌';
    const statusText = status.portInUse
      ? status.healthy
        ? 'Running'
        : 'Port in use'
      : 'Not running';

    console.log(`${statusIcon} ${status.name} (Port ${status.port})`);
    console.log(`   Status: ${statusText}`);
    console.log(`   URL: ${status.url}`);

    if (status.processInfo) {
      console.log(`   Process: ${status.processInfo.join(', ')}`);
    }

    console.log('');
  }

  // Summary
  const running = statuses.filter((s) => s.portInUse).length;
  const healthy = statuses.filter((s) => s.healthy).length;
  const total = statuses.length;

  console.log('📈 Summary:');
  console.log(`   Total servers: ${total}`);
  console.log(`   Running: ${running}/${total}`);
  console.log(`   Healthy: ${healthy}/${total}`);

  if (running === total && healthy === total) {
    console.log('\n🎉 All servers are running and healthy!');
  } else if (running === total) {
    console.log(
      '\n⚠️  All servers are running but some may not be fully healthy'
    );
  } else {
    console.log('\n❌ Some servers are not running');
    console.log('💡 Run "pnpm dev" to start all servers');
  }
}

// Run the main function
main().catch((error) => {
  console.error('❌ Error checking server status:', error);
  process.exit(1);
});

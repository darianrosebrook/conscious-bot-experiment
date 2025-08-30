#!/usr/bin/env node

/**
 * Health Check Diagnostic Script
 *
 * Helps diagnose health check issues by testing individual service endpoints
 * and providing detailed feedback about what's working and what isn't.
 *
 * @author @darianrosebrook
 */

import { spawn } from 'child_process';
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
    port: 3000,
    healthUrl: 'http://localhost:3000',
    description: 'Web dashboard for monitoring and control',
    isWebApp: true, // Dashboard serves HTML, not JSON
  },
  {
    name: 'Core API',
    port: 3007,
    healthUrl: 'http://localhost:3007/health',
    description: 'Core API and capability registry',
  },
  {
    name: 'Minecraft Interface',
    port: 3005,
    healthUrl: 'http://localhost:3005/health',
    description: 'Minecraft bot interface and control',
  },
  {
    name: 'Cognition',
    port: 3003,
    healthUrl: 'http://localhost:3003/health',
    description: 'Cognitive reasoning and decision making',
  },
  {
    name: 'Memory',
    port: 3001,
    healthUrl: 'http://localhost:3001/health',
    description: 'Memory storage and retrieval system',
  },
  {
    name: 'World',
    port: 3004,
    healthUrl: 'http://localhost:3004/health',
    description: 'World state management and simulation',
  },
  {
    name: 'Planning',
    port: 3002,
    healthUrl: 'http://localhost:3002/health',
    description: 'Task planning and execution coordination',
  },
];

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logBanner() {
  log('\n🔍 Conscious Bot Health Check Diagnostic', colors.cyan);
  log('==========================================\n', colors.cyan);
}

/**
 * Check if a port is in use
 */
async function checkPort(port) {
  try {
    const net = await import('net');
    const server = net.default.createServer();
    return new Promise((resolve) => {
      server.listen(port, () => {
        server.close();
        resolve(false); // Port is available
      });
      server.on('error', () => {
        resolve(true); // Port is in use
      });
    });
  } catch {
    return true; // Port is in use
  }
}

/**
 * Test a health endpoint with detailed diagnostics
 */
async function testHealthEndpoint(service) {
  const startTime = Date.now();

  try {
    // First check if port is in use
    const portInUse = await checkPort(service.port);
    if (!portInUse) {
      log(
        ` ❌ ${service.name}: Port ${service.port} is not in use`,
        colors.red
      );
      return {
        service: service.name,
        status: 'not_running',
        port: service.port,
        elapsed: 0,
        error: 'Port not in use',
      };
    }

    // Test the health endpoint
    const response = await fetch(service.healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const elapsed = Date.now() - startTime;

    if (response.ok) {
      if (service.isWebApp) {
        // For web apps, just check if we get HTML content
        const text = await response.text();
        if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
          log(` ✅ ${service.name}: Healthy (${elapsed}ms)`, colors.green);
          return {
            service: service.name,
            status: 'healthy',
            port: service.port,
            elapsed,
            data: { type: 'web_app', contentLength: text.length },
          };
        } else {
          log(
            ` ⚠️  ${service.name}: Not serving HTML (${elapsed}ms)`,
            colors.yellow
          );
          return {
            service: service.name,
            status: 'error',
            port: service.port,
            elapsed,
            error: 'Not serving HTML content',
          };
        }
      } else {
        // For API services, expect JSON
        const data = await response.json();
        log(` ✅ ${service.name}: Healthy (${elapsed}ms)`, colors.green);
        return {
          service: service.name,
          status: 'healthy',
          port: service.port,
          elapsed,
          data,
        };
      }
    } else {
      log(
        ` ⚠️  ${service.name}: HTTP ${response.status} (${elapsed}ms)`,
        colors.yellow
      );
      return {
        service: service.name,
        status: 'error',
        port: service.port,
        elapsed,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;

    if (error.name === 'AbortError') {
      log(` ⚠️  ${service.name}: Timeout after ${elapsed}ms`, colors.yellow);
      return {
        service: service.name,
        status: 'timeout',
        port: service.port,
        elapsed,
        error: 'Request timeout',
      };
    } else {
      log(` ❌ ${service.name}: ${error.message} (${elapsed}ms)`, colors.red);
      return {
        service: service.name,
        status: 'error',
        port: service.port,
        elapsed,
        error: error.message,
      };
    }
  }
}

/**
 * Check system resources
 */
async function checkSystemResources() {
  log('\n📊 System Resources:', colors.blue);

  try {
    const os = await import('os');
    const totalMem = Math.round(os.default.totalmem() / 1024 / 1024 / 1024);
    const freeMem = Math.round(os.default.freemem() / 1024 / 1024 / 1024);
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    log(
      `  Memory: ${usedMem}GB / ${totalMem}GB (${memUsage}% used)`,
      memUsage > 80 ? colors.yellow : colors.reset
    );

    const loadAvg = os.default.loadavg();
    const cpuCount = os.default.cpus().length;
    const loadPercent = Math.round((loadAvg[0] / cpuCount) * 100);

    log(
      `  CPU Load: ${loadAvg[0].toFixed(2)} (${loadPercent}% of ${cpuCount} cores)`,
      loadPercent > 80 ? colors.yellow : colors.reset
    );
  } catch (error) {
    log(`  Unable to check system resources: ${error.message}`, colors.yellow);
  }
}

/**
 * Check running processes
 */
async function checkRunningProcesses() {
  log('\n🔍 Running Processes:', colors.blue);

  try {
    const { execSync } = await import('child_process');
    const processes = execSync(
      'ps aux | grep -E "(node|pnpm)" | grep -v grep',
      { encoding: 'utf8' }
    );

    if (processes.trim()) {
      const lines = processes.split('\n').filter((line) => line.trim());
      lines.forEach((line) => {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        const command = parts.slice(10).join(' ');
        log(`  PID ${pid}: ${command}`, colors.reset);
      });
    } else {
      log('  No Node.js processes found', colors.yellow);
    }
  } catch (error) {
    log(`  Unable to check processes: ${error.message}`, colors.yellow);
  }
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  logBanner();

  // Check system resources
  await checkSystemResources();

  // Check running processes
  await checkRunningProcesses();

  // Test all health endpoints
  log('\n🏥 Health Check Results:', colors.blue);

  const results = [];

  for (const service of services) {
    const result = await testHealthEndpoint(service);
    results.push(result);

    // Small delay between checks
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Summary
  log('\n📋 Summary:', colors.blue);

  const healthy = results.filter((r) => r.status === 'healthy').length;
  const total = results.length;

  log(
    `  ${healthy}/${total} services are healthy`,
    healthy === total ? colors.green : colors.yellow
  );

  if (healthy < total) {
    log('\n🔧 Troubleshooting Tips:', colors.yellow);
    log('  1. Check if all services are running: pnpm status');
    log('  2. Restart services: pnpm kill && pnpm start');
    log('  3. Check logs for specific service errors');
    log('  4. Verify port availability: lsof -i :3000-3010');
    log('  5. Check system resources (memory, CPU)');
  }

  // Detailed results for debugging
  log('\n📄 Detailed Results:', colors.blue);
  results.forEach((result) => {
    const statusIcon =
      result.status === 'healthy'
        ? '✅'
        : result.status === 'timeout'
          ? '⏰'
          : '❌';
    log(
      `  ${statusIcon} ${result.service}: ${result.status} (${result.elapsed}ms)`,
      result.status === 'healthy' ? colors.green : colors.yellow
    );

    if (result.error) {
      log(`      Error: ${result.error}`, colors.red);
    }
  });

  log('\n');
}

// Run diagnostics if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiagnostics().catch((error) => {
    log(`\n❌ Diagnostic failed: ${error.message}`, colors.red);
    process.exit(1);
  });
}

export { runDiagnostics, testHealthEndpoint };

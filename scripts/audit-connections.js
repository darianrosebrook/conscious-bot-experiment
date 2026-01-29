#!/usr/bin/env node

/**
 * System Connection Audit Script
 *
 * Tests all inter-service connections and data flows to identify broken links
 *
 * @author @darianrosebrook
 */

const http = require('http');

const services = {
  core: { port: 3007, name: 'Core API' },
  memory: { port: 3001, name: 'Memory' },
  world: { port: 3004, name: 'World' },
  cognition: { port: 3003, name: 'Cognition' },
  planning: { port: 3002, name: 'Planning' },
  minecraft: { port: 3005, name: 'Minecraft Interface' },
  dashboard: { port: 3000, name: 'Dashboard' },
  hrm: { port: 5001, name: 'Sapient HRM' },
};

const connections = [
  // World -> Planning
  { from: 'world', to: 'planning', endpoint: '/world-state', method: 'GET' },

  // Planning -> Minecraft
  { from: 'planning', to: 'minecraft', endpoint: '/state', method: 'GET' },
  { from: 'planning', to: 'minecraft', endpoint: '/inventory', method: 'GET' },
  { from: 'planning', to: 'minecraft', endpoint: '/health', method: 'GET' },

  // Planning -> Cognition
  {
    from: 'planning',
    to: 'cognition',
    endpoint: '/generate-steps',
    method: 'POST',
  },

  // Cognition -> Planning
  { from: 'cognition', to: 'planning', endpoint: '/state', method: 'GET' },
  { from: 'cognition', to: 'planning', endpoint: '/api/goal', method: 'POST' },

  // Cognition -> Minecraft
  { from: 'cognition', to: 'minecraft', endpoint: '/state', method: 'GET' },

  // Cognition -> Dashboard
  {
    from: 'cognition',
    to: 'dashboard',
    endpoint: '/api/ws/cognitive-stream',
    method: 'POST',
  },

  // Planning -> Dashboard
  {
    from: 'planning',
    to: 'dashboard',
    endpoint: '/api/live-stream-updates',
    method: 'POST',
  },

  // Dashboard -> All services (health checks)
  { from: 'dashboard', to: 'minecraft', endpoint: '/health', method: 'GET' },
  { from: 'dashboard', to: 'cognition', endpoint: '/health', method: 'GET' },
  { from: 'dashboard', to: 'memory', endpoint: '/health', method: 'GET' },
  { from: 'dashboard', to: 'planning', endpoint: '/health', method: 'GET' },
  { from: 'dashboard', to: 'world', endpoint: '/health', method: 'GET' },
];

function makeRequest(host, port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: method,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          ok: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function checkServiceHealth(service) {
  try {
    const result = await makeRequest('localhost', service.port, '/health');
    return {
      healthy: result.ok,
      status: result.status,
      responseTime: Date.now(), // Simplified
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
    };
  }
}

async function testConnection(connection) {
  const fromService = services[connection.from];
  const toService = services[connection.to];

  if (!fromService || !toService) {
    return {
      success: false,
      error: `Unknown service: ${connection.from} or ${connection.to}`,
    };
  }

  try {
    const result = await makeRequest(
      'localhost',
      toService.port,
      connection.endpoint,
      connection.method,
      connection.body || null
    );

    return {
      success: result.ok,
      status: result.status,
      from: fromService.name,
      to: toService.name,
      endpoint: connection.endpoint,
      method: connection.method,
    };
  } catch (error) {
    return {
      success: false,
      from: fromService.name,
      to: toService.name,
      endpoint: connection.endpoint,
      method: connection.method,
      error: error.message,
    };
  }
}

async function audit() {
  console.log('🔍 Starting System Connection Audit...\n');
  console.log('='.repeat(60));

  // Step 1: Check all service health
  console.log('\n📊 Step 1: Service Health Checks\n');
  const healthResults = {};

  for (const [key, service] of Object.entries(services)) {
    process.stdout.write(
      `  Checking ${service.name} (port ${service.port})... `
    );
    const result = await checkServiceHealth(service);
    healthResults[key] = result;

    if (result.healthy) {
      console.log(`✅ Healthy (${result.status})`);
    } else {
      console.log(`❌ Unhealthy: ${result.error || `Status ${result.status}`}`);
    }
  }

  // Step 2: Test inter-service connections
  console.log('\n🔗 Step 2: Inter-Service Connection Tests\n');
  const connectionResults = [];

  for (const connection of connections) {
    // Skip if source or target service is unhealthy
    if (
      !healthResults[connection.from]?.healthy ||
      !healthResults[connection.to]?.healthy
    ) {
      console.log(
        `  ⏭️  Skipping ${connection.from} -> ${connection.to}${connection.endpoint} (service unhealthy)`
      );
      continue;
    }

    process.stdout.write(
      `  Testing ${connection.from} -> ${connection.to}${connection.endpoint}... `
    );
    const result = await testConnection(connection);
    connectionResults.push(result);

    if (result.success) {
      console.log(`✅ OK (${result.status})`);
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }
  }

  // Step 3: Summary
  console.log('\n📋 Step 3: Audit Summary\n');
  console.log('='.repeat(60));

  const healthyServices = Object.values(healthResults).filter(
    (r) => r.healthy
  ).length;
  const totalServices = Object.keys(services).length;
  const successfulConnections = connectionResults.filter(
    (r) => r.success
  ).length;
  const totalConnections = connectionResults.length;

  console.log(`Services: ${healthyServices}/${totalServices} healthy`);
  console.log(
    `Connections: ${successfulConnections}/${totalConnections} working`
  );

  // Identify broken connections
  const brokenConnections = connectionResults.filter((r) => !r.success);
  if (brokenConnections.length > 0) {
    console.log('\n❌ Broken Connections:');
    brokenConnections.forEach((conn) => {
      console.log(
        `  - ${conn.from} -> ${conn.to}${conn.endpoint} (${conn.method})`
      );
      console.log(`    Error: ${conn.error}`);
    });
  }

  // Identify missing services
  const unhealthyServices = Object.entries(healthResults)
    .filter(([_, result]) => !result.healthy)
    .map(([key, _]) => services[key].name);

  if (unhealthyServices.length > 0) {
    console.log('\n⚠️  Unhealthy Services:');
    unhealthyServices.forEach((name) => {
      console.log(`  - ${name}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (
    healthyServices === totalServices &&
    successfulConnections === totalConnections
  ) {
    console.log('\n✅ All systems operational!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Issues detected. Review the audit results above.');
    process.exit(1);
  }
}

// Run audit
audit().catch((error) => {
  console.error('❌ Audit failed:', error);
  process.exit(1);
});

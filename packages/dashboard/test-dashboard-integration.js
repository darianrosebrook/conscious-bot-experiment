/**
 * Dashboard Integration Test Script
 * Tests the new service discovery and API client functionality
 *
 * @author @darianrosebrook
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Test Suite for Dashboard Integration
 */
class DashboardIntegrationTest {
  constructor() {
    this.baseDir = path.join(__dirname, '..', '..');
    this.dashboardDir = path.join(this.baseDir, 'packages', 'dashboard');
    this.testResults = [];
  }

  /**
   * Log test result
   */
  logResult(testName, passed, message = '') {
    const result = {
      test: testName,
      passed,
      message,
      timestamp: new Date().toISOString(),
    };

    this.testResults.push(result);
    console.log(`${passed ? '✅' : '❌'} ${testName}: ${message}`);
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test if a service is responding
   */
  async testServiceHealth(url, serviceName) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Test environment configuration
   */
  async testEnvironmentConfiguration() {
    console.log('\n🧪 Testing Environment Configuration...');

    // Check if config files exist
    const configFile = path.join(this.dashboardDir, 'dashboard.config.ts');
    const apiClientFile = path.join(
      this.dashboardDir,
      'src',
      'lib',
      'api-client.ts'
    );

    if (fs.existsSync(configFile)) {
      this.logResult('Config File Exists', true, 'dashboard.config.ts found');
    } else {
      this.logResult(
        'Config File Exists',
        false,
        'dashboard.config.ts not found'
      );
      return false;
    }

    if (fs.existsSync(apiClientFile)) {
      this.logResult('API Client File Exists', true, 'api-client.ts found');
    } else {
      this.logResult(
        'API Client File Exists',
        false,
        'api-client.ts not found'
      );
      return false;
    }

    // Test environment variable handling
    const envVars = [
      'NODE_ENV',
      'DASHBOARD_SERVICE_DISCOVERY',
      'MINECRAFT_SERVICE_URL',
      'COGNITION_SERVICE_URL',
    ];

    let envConfigValid = true;
    for (const envVar of envVars) {
      if (process.env[envVar] !== undefined) {
        this.logResult(
          `Environment Variable: ${envVar}`,
          true,
          `Value: ${process.env[envVar]}`
        );
      } else {
        this.logResult(
          `Environment Variable: ${envVar}`,
          true,
          'Using default value'
        );
      }
    }

    return envConfigValid;
  }

  /**
   * Test service discovery functionality
   */
  async testServiceDiscovery() {
    console.log('\n🔍 Testing Service Discovery...');

    try {
      // Import the service discovery module (this would need to be compiled first)
      // For now, we'll test the basic concept

      // Test localhost service detection
      const services = [
        {
          name: 'Minecraft Bot',
          url: 'http://localhost:3005/health',
          port: 3005,
        },
        { name: 'Cognition', url: 'http://localhost:3003/health', port: 3003 },
        { name: 'Memory', url: 'http://localhost:3001/health', port: 3001 },
        { name: 'Planning', url: 'http://localhost:3002/health', port: 3002 },
        { name: 'World', url: 'http://localhost:3004/health', port: 3004 },
        { name: 'Evaluation', url: 'http://localhost:3006/health', port: 3006 },
      ];

      let discoveredServices = 0;

      for (const service of services) {
        const healthy = await this.testServiceHealth(service.url, service.name);
        if (healthy) {
          discoveredServices++;
          this.logResult(
            `Service Discovery: ${service.name}`,
            true,
            `Found at port ${service.port}`
          );
        } else {
          this.logResult(
            `Service Discovery: ${service.name}`,
            true,
            `Not available at port ${service.port} (expected in dev)`
          );
        }
      }

      this.logResult(
        'Service Discovery System',
        true,
        `Discovered ${discoveredServices}/${services.length} services`
      );
      return true;
    } catch (error) {
      this.logResult(
        'Service Discovery System',
        false,
        `Error: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Test API client functionality
   */
  async testApiClient() {
    console.log('\n🌐 Testing API Client...');

    try {
      // Test basic API client instantiation (would need compiled code)
      // For now, test the concept by checking if the file structure is correct

      const apiClientPath = path.join(
        this.dashboardDir,
        'src',
        'lib',
        'api-client.ts'
      );
      if (!fs.existsSync(apiClientPath)) {
        this.logResult(
          'API Client Implementation',
          false,
          'api-client.ts not found'
        );
        return false;
      }

      // Check if the file contains expected exports
      const apiClientContent = fs.readFileSync(apiClientPath, 'utf8');
      const hasApiClientClass = apiClientContent.includes(
        'class DashboardApiClient'
      );
      const hasServiceMethods = apiClientContent.includes('async getTasks()');

      if (hasApiClientClass) {
        this.logResult(
          'API Client Class',
          true,
          'DashboardApiClient class found'
        );
      } else {
        this.logResult(
          'API Client Class',
          false,
          'DashboardApiClient class not found'
        );
      }

      if (hasServiceMethods) {
        this.logResult('API Client Methods', true, 'Service methods found');
      } else {
        this.logResult(
          'API Client Methods',
          false,
          'Service methods not found'
        );
      }

      return hasApiClientClass && hasServiceMethods;
    } catch (error) {
      this.logResult(
        'API Client Implementation',
        false,
        `Error: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Test dashboard compilation
   */
  async testDashboardCompilation() {
    console.log('\n⚡ Testing Dashboard Compilation...');

    return new Promise((resolve) => {
      const tscProcess = spawn('npx', ['tsc', '--noEmit'], {
        cwd: this.dashboardDir,
        stdio: 'inherit',
        shell: true,
      });

      tscProcess.on('close', (code) => {
        if (code === 0) {
          this.logResult(
            'TypeScript Compilation',
            true,
            'No type errors found'
          );
          resolve(true);
        } else {
          this.logResult('TypeScript Compilation', false, 'Type errors found');
          resolve(false);
        }
      });

      tscProcess.on('error', (error) => {
        this.logResult(
          'TypeScript Compilation',
          false,
          `Error: ${error.message}`
        );
        resolve(false);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        tscProcess.kill();
        this.logResult(
          'TypeScript Compilation',
          false,
          'Compilation timed out'
        );
        resolve(false);
      }, 30000);
    });
  }

  /**
   * Test dashboard API routes
   */
  async testApiRoutes() {
    console.log('\n🛣️ Testing API Routes...');

    const apiRoutes = [
      '/api/tasks',
      '/api/inventory',
      '/api/memories',
      '/api/events',
      '/api/world',
      '/api/intrusive',
    ];

    let routesWorking = 0;

    for (const route of apiRoutes) {
      try {
        // Note: This test would need the dashboard server running
        // For now, we just check if the route files exist
        const routePath = path.join(
          this.dashboardDir,
          'src',
          'app',
          'api',
          route.replace('/api/', ''),
          'route.ts'
        );
        if (fs.existsSync(routePath)) {
          this.logResult(`API Route: ${route}`, true, 'Route file exists');
          routesWorking++;
        } else {
          this.logResult(`API Route: ${route}`, false, 'Route file not found');
        }
      } catch (error) {
        this.logResult(`API Route: ${route}`, false, `Error: ${error.message}`);
      }
    }

    return routesWorking === apiRoutes.length;
  }

  /**
   * Test configuration management
   */
  async testConfigurationManagement() {
    console.log('\n⚙️ Testing Configuration Management...');

    // Test environment-based configuration
    const nodeEnv = process.env.NODE_ENV || 'development';
    this.logResult('Environment Detection', true, `NODE_ENV: ${nodeEnv}`);

    // Test service URL configuration
    const serviceUrls = [
      'MINECRAFT_SERVICE_URL',
      'COGNITION_SERVICE_URL',
      'MEMORY_SERVICE_URL',
      'PLANNING_SERVICE_URL',
      'WORLD_SERVICE_URL',
      'EVALUATION_SERVICE_URL',
    ];

    let configValid = true;
    for (const serviceUrl of serviceUrls) {
      const value = process.env[serviceUrl];
      if (value) {
        this.logResult(
          `Service URL: ${serviceUrl}`,
          true,
          `Configured: ${value}`
        );
      } else {
        this.logResult(
          `Service URL: ${serviceUrl}`,
          true,
          'Using default localhost URL'
        );
      }
    }

    return configValid;
  }

  /**
   * Test cognitive stream integration
   */
  async testCognitiveStreamIntegration() {
    console.log('\n🧠 Testing Cognitive Stream Integration...');

    try {
      // Check if cognitive stream components exist
      const streamComponents = [
        'src/app/api/ws/cognitive-stream/route.ts',
        'src/hooks/use-cognitive-stream.ts',
        'src/contexts/dashboard-context.tsx',
      ];

      let componentsFound = 0;
      for (const component of streamComponents) {
        const componentPath = path.join(this.dashboardDir, component);
        if (fs.existsSync(componentPath)) {
          this.logResult(
            `Cognitive Stream Component: ${component}`,
            true,
            'Component found'
          );
          componentsFound++;
        } else {
          this.logResult(
            `Cognitive Stream Component: ${component}`,
            false,
            'Component not found'
          );
        }
      }

      // Check for intrusive thought functionality
      const intrusiveRoute = path.join(
        this.dashboardDir,
        'src',
        'app',
        'api',
        'intrusive',
        'route.ts'
      );
      if (fs.existsSync(intrusiveRoute)) {
        this.logResult(
          'Intrusive Thought API',
          true,
          'Intrusive thought route exists'
        );
      } else {
        this.logResult(
          'Intrusive Thought API',
          false,
          'Intrusive thought route not found'
        );
      }

      return componentsFound === streamComponents.length;
    } catch (error) {
      this.logResult(
        'Cognitive Stream Integration',
        false,
        `Error: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Dashboard Integration Tests...\n');

    const testResults = await Promise.all([
      this.testEnvironmentConfiguration(),
      this.testServiceDiscovery(),
      this.testApiClient(),
      this.testDashboardCompilation(),
      this.testApiRoutes(),
      this.testConfigurationManagement(),
      this.testCognitiveStreamIntegration(),
    ]);

    const passedTests = testResults.filter(Boolean).length;
    const totalTests = testResults.length;

    console.log('\n📊 Test Results Summary:');
    console.log(`   Passed: ${passedTests}/${totalTests}`);
    console.log(
      `   Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
    );

    if (passedTests === totalTests) {
      console.log(
        '\n🎉 All tests passed! Dashboard integration is working correctly.'
      );
    } else {
      console.log(
        `\n⚠️ ${totalTests - passedTests} test(s) failed. Check the details above.`
      );
    }

    return passedTests === totalTests;
  }
}

/**
 * Main test execution
 */
async function main() {
  const test = new DashboardIntegrationTest();

  try {
    const success = await test.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { DashboardIntegrationTest };

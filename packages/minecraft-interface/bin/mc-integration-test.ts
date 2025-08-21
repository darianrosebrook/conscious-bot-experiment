#!/usr/bin/env node

/**
 * Minecraft Planning Integration Test CLI
 *
 * Command-line tool to run comprehensive integration tests between
 * the Minecraft interface and the planning system.
 *
 * @author @darianrosebrook
 */

import {
  runMinecraftPlanningIntegrationTest,
  IntegrationTestConfig,
} from '../src/integration-test';

interface CLIOptions {
  host?: string;
  port?: number;
  username?: string;
  strategy?: 'adaptive' | 'hrm_first' | 'llm_first';
  signals?: boolean;
  repair?: boolean;
  timeout?: number;
  scenarios?: string[];
  verbose?: boolean;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.includes('=')) {
      const [key, value] = arg.split('=');
      const cleanKey = key.replace(/^--/, '');

      switch (cleanKey) {
        case 'host':
          options.host = value;
          break;
        case 'port':
          options.port = parseInt(value, 10);
          break;
        case 'username':
          options.username = value;
          break;
        case 'strategy':
          options.strategy = value as 'adaptive' | 'hrm_first' | 'llm_first';
          break;
        case 'timeout':
          options.timeout = parseInt(value, 10);
          break;
        case 'scenarios':
          options.scenarios = value.split(',');
          break;
      }
    } else {
      switch (arg) {
        case '--host':
          options.host = args[++i];
          break;
        case '--port':
          options.port = parseInt(args[++i], 10);
          break;
        case '--username':
          options.username = args[++i];
          break;
        case '--strategy':
          options.strategy = args[++i] as
            | 'adaptive'
            | 'hrm_first'
            | 'llm_first';
          break;
        case '--timeout':
          options.timeout = parseInt(args[++i], 10);
          break;
        case '--scenarios':
          options.scenarios = args[++i].split(',');
          break;
        case '--signals':
          options.signals = true;
          break;
        case '--no-signals':
          options.signals = false;
          break;
        case '--repair':
          options.repair = true;
          break;
        case '--no-repair':
          options.repair = false;
          break;
        case '--verbose':
        case '-v':
          options.verbose = true;
          break;
        case '--help':
        case '-h':
          options.help = true;
          break;
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
🤖 Minecraft Planning Integration Test CLI

Usage: mc-integration-test [options]

Connection Options:
  --host <host>              Minecraft server host (default: localhost)
  --port <port>              Minecraft server port (default: 25565)
  --username <name>          Bot username (default: IntegrationTestBot)

Planning Options:
  --strategy <strategy>      Planning strategy: adaptive|hrm_first|llm_first (default: adaptive)
  --signals / --no-signals   Enable/disable signal processing (default: enabled)
  --repair / --no-repair     Enable/disable plan repair (default: enabled)
  --timeout <ms>            Max planning time in ms (default: 5000)

Test Options:
  --scenarios <list>        Comma-separated test scenarios to run
  --verbose, -v             Enable verbose output
  --help, -h               Show this help message

Available Test Scenarios:
  • basic_connection_and_signals     - Test connection and signal generation
  • simple_goal_planning             - Test simple goal-based planning
  • multi_step_plan_execution        - Test complex multi-step plans
  • plan_repair_and_adaptation       - Test plan repair capabilities
  • emergency_response               - Test emergency response speed
  • resource_driven_planning         - Test resource optimization
  • social_environmental_adaptation  - Test social/environmental awareness

Examples:
  # Run all tests with default settings
  mc-integration-test

  # Run specific tests with custom server
  mc-integration-test --host=192.168.1.100 --port=58879 --scenarios=basic_connection_and_signals,simple_goal_planning

  # Test HRM-first planning approach
  mc-integration-test --strategy=hrm_first --verbose

  # Test with plan repair disabled
  mc-integration-test --no-repair --timeout=10000
`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('🚀 Minecraft Planning Integration Test CLI');
  console.log('='.repeat(50));

  // Build test configuration
  const config: Partial<IntegrationTestConfig> = {
    minecraft: {
      host: options.host || 'localhost',
      port: options.port || 25565,
      username: options.username || 'IntegrationTestBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 5000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      emergencyDisconnect: true,
    },
    planning: {
      routingStrategy: options.strategy || 'adaptive',
      enableSignalProcessing: options.signals !== false,
      enablePlanRepair: options.repair !== false,
      maxPlanningTime: options.timeout || 5000,
    },
    scenarios: options.scenarios || [
      'basic_connection_and_signals',
      'simple_goal_planning',
      'multi_step_plan_execution',
      'plan_repair_and_adaptation',
      'emergency_response',
      'resource_driven_planning',
      'social_environmental_adaptation',
    ],
    verbose: options.verbose || false,
  };

  console.log(`🎯 Test Configuration:`);
  console.log(`   Server: ${config.minecraft!.host}:${config.minecraft!.port}`);
  console.log(`   Bot: ${config.minecraft!.username}`);
  console.log(`   Strategy: ${config.planning!.routingStrategy}`);
  console.log(
    `   Signals: ${config.planning!.enableSignalProcessing ? 'enabled' : 'disabled'}`
  );
  console.log(
    `   Repair: ${config.planning!.enablePlanRepair ? 'enabled' : 'disabled'}`
  );
  console.log(`   Scenarios: ${config.scenarios!.length} selected`);
  console.log('');

  try {
    const startTime = Date.now();

    console.log('🔬 Starting integration tests...');
    const result = await runMinecraftPlanningIntegrationTest(config);

    const totalTime = Date.now() - startTime;

    // Print final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL TEST REPORT');
    console.log('='.repeat(60));
    console.log(
      `🎯 Overall Result: ${result.success ? '✅ PASSED' : '❌ FAILED'}`
    );
    console.log(
      `📈 Success Rate: ${Math.round((result.passedTests / result.totalTests) * 100)}% (${result.passedTests}/${result.totalTests})`
    );
    console.log(`⏱️  Total Duration: ${Math.round(totalTime / 1000)}s`);
    console.log(
      `🧠 Planning Avg: ${result.summary.planningSystemPerformance.averageExecutionTime}ms`
    );
    console.log(
      `⚙️  Steps Executed: ${result.summary.minecraftInterfacePerformance.totalStepsExecuted}`
    );
    console.log(
      `🔧 Repairs Needed: ${result.summary.minecraftInterfacePerformance.totalRepairAttempts}`
    );

    if (
      result.summary.integrationQuality.emergencyResponseCapability ===
      'operational'
    ) {
      console.log(`🚨 Emergency Response: ✅ Operational`);
    } else {
      console.log(`🚨 Emergency Response: ⚠️  Needs Improvement`);
    }

    if (
      result.summary.integrationQuality.planningIntegrationStability ===
      'stable'
    ) {
      console.log(`🔗 Integration Stability: ✅ Stable`);
    } else {
      console.log(`🔗 Integration Stability: ⚠️  Unstable`);
    }

    console.log('\n📋 Test Details:');
    result.results.forEach((test, index) => {
      const status = test.success ? '✅' : '❌';
      const duration = Math.round((test.executionTime / 1000) * 100) / 100;
      console.log(`   ${index + 1}. ${status} ${test.scenario}`);
      console.log(
        `      Duration: ${duration}s | Steps: ${test.stepsExecuted} | Approach: ${test.planningApproach}`
      );
      if (test.error) {
        console.log(`      Error: ${test.error}`);
      }
    });

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (result.summary.integrationQuality.overallSuccessRate >= 90) {
      console.log('   🎉 Excellent! Planning integration is production-ready.');
    } else if (result.summary.integrationQuality.overallSuccessRate >= 75) {
      console.log(
        '   ✅ Good integration. Consider optimizing failed scenarios.'
      );
    } else if (result.summary.integrationQuality.overallSuccessRate >= 50) {
      console.log(
        '   ⚠️  Moderate integration. Review and fix critical issues.'
      );
    } else {
      console.log(
        '   🚫 Poor integration. Major fixes needed before production.'
      );
    }

    if (result.summary.planningSystemPerformance.averageExecutionTime > 3000) {
      console.log(
        '   ⏱️  Consider optimizing planning latency for better real-time performance.'
      );
    }

    if (result.summary.minecraftInterfacePerformance.totalRepairAttempts > 5) {
      console.log(
        '   🔧 High repair attempts indicate planning instability - review algorithms.'
      );
    }

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n💥 Integration test failed with error:');
    console.error(error);

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.error(
        '\n💡 Tip: Make sure a Minecraft server is running on the specified host/port.'
      );
      console.error(
        '   You can use the simulation mode instead: npm run sim:demo'
      );
    }

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Integration test interrupted by user.');
  process.exit(130);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled promise rejection:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
}

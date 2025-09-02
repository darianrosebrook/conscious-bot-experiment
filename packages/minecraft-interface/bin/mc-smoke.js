#!/usr/bin/env node
/**
 * Minecraft Smoke Test CLI
 *
 * Command-line tool for running Minecraft integration smoke tests
 *
 * @author @darianrosebrook
 */
import { runMinecraftScenario } from '../src/index';
import { validateBotConfig, parseBotConfigFromArgs, formatTelemetryOutput, createPerformanceSummary, } from '../src/utils';
// Available scenarios
const SCENARIOS = {
    navigate: {
        name: 'Navigate to Target',
        description: 'Bot spawns and navigates to a nearby coordinate',
        signals: [
            { type: 'exploration_drive', value: 70, urgency: 'medium' },
            { type: 'curiosity', value: 60, urgency: 'low' },
        ],
        timeout: 30000,
    },
    'gather-wood': {
        name: 'Gather Wood',
        description: 'Bot locates and mines a log block',
        signals: [
            { type: 'resource_need', value: 85, urgency: 'high' },
            { type: 'achievement_drive', value: 70, urgency: 'medium' },
        ],
        timeout: 60000,
    },
    'craft-planks': {
        name: 'Craft Planks',
        description: 'Bot crafts planks from logs (requires logs in inventory)',
        signals: [
            { type: 'achievement_drive', value: 80, urgency: 'medium' },
            { type: 'resource_optimization', value: 65, urgency: 'medium' },
        ],
        timeout: 30000,
    },
};
async function main() {
    try {
        const options = parseArgs();
        console.log(' Minecraft Smoke Test Runner');
        console.log('================================');
        console.log();
        if (options.verbose) {
            console.log('Config:', JSON.stringify(options.config, null, 2));
            console.log();
        }
        const scenario = SCENARIOS[options.scenario];
        if (!scenario) {
            console.error(` Unknown scenario: ${options.scenario}`);
            console.error(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
            process.exit(1);
        }
        console.log(` Scenario: ${scenario.name}`);
        console.log(` Description: ${scenario.description}`);
        console.log(` Runs: ${options.runs}`);
        console.log();
        const results = [];
        for (let run = 1; run <= options.runs; run++) {
            console.log(`\n Run ${run}/${options.runs}`);
            console.log('─'.repeat(40));
            try {
                const result = await runSingleTest(scenario, options.config, options.verbose);
                results.push(result);
                const status = result.success ? '' : '';
                console.log(`${status} ${result.success ? 'SUCCESS' : 'FAILED'}`);
                if (result.error) {
                    console.log(`   Error: ${result.error}`);
                }
                console.log(`   Time: ${result.executionTime}ms`);
                console.log(`   Steps: ${result.stepsExecuted}/${result.totalSteps}`);
                if (result.repairAttempts > 0) {
                    console.log(`   Repairs: ${result.repairAttempts}`);
                }
            }
            catch (error) {
                console.error(` FAILED: ${error}`);
                results.push({
                    scenario: scenario.name,
                    success: false,
                    executionTime: 0,
                    stepsExecuted: 0,
                    totalSteps: 0,
                    repairAttempts: 0,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            // Delay between runs
            if (run < options.runs) {
                console.log('⏱️  Waiting 3s before next run...');
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        }
        // Summary
        console.log('\n Summary');
        console.log('═'.repeat(40));
        console.log(createPerformanceSummary(results));
        // Log to file if requested
        if (options.logFile) {
            const logData = {
                scenario: scenario.name,
                timestamp: new Date().toISOString(),
                config: options.config,
                results,
                summary: createPerformanceSummary(results),
            };
            await require('fs').promises.writeFile(options.logFile, JSON.stringify(logData, null, 2));
            console.log(`\n Results logged to: ${options.logFile}`);
        }
        // Exit code based on overall success
        const successRate = results.filter((r) => r.success).length / results.length;
        process.exit(successRate >= 0.8 ? 0 : 1);
    }
    catch (error) {
        console.error(' Fatal error:', error);
        process.exit(1);
    }
}
async function runSingleTest(scenario, config, verbose) {
    if (verbose) {
        console.log(` Connecting to ${config.host}:${config.port}...`);
    }
    const result = await runMinecraftScenario(config, scenario);
    if (verbose && result.telemetry) {
        console.log('\n Telemetry:');
        console.log(formatTelemetryOutput(result.telemetry));
    }
    return result;
}
function parseArgs() {
    const args = process.argv.slice(2);
    let scenario = 'navigate';
    let verbose = false;
    let runs = 1;
    let logFile;
    // Parse named arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--scenario':
                scenario = args[++i];
                break;
            case '--verbose':
            case '-v':
                verbose = true;
                break;
            case '--runs':
                runs = parseInt(args[++i]);
                break;
            case '--log':
                logFile = args[++i];
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
        }
    }
    // Parse bot config from remaining args
    const configArgs = parseBotConfigFromArgs(args);
    const config = validateBotConfig(configArgs);
    return {
        scenario,
        config,
        verbose,
        runs: Math.max(1, runs),
        logFile,
    };
}
function printHelp() {
    console.log(`
 Minecraft Smoke Test Runner

Usage: mc-smoke [options]

Scenarios:
  navigate      Navigate to a target coordinate (Tier 0)
  gather-wood   Locate and mine a log block (Tier 1)
  craft-planks  Craft planks from logs (Tier 1)

Options:
  --scenario <name>     Scenario to run (default: navigate)
  --runs <number>       Number of test runs (default: 1)
  --verbose, -v         Verbose output with telemetry
  --log <file>          Save results to JSON file
  --help, -h            Show this help

Bot Configuration:
  --host <host>         Server host (default: localhost)
  --port <port>         Server port (default: 58879)
  --username <name>     Bot username (default: ConsciousBot)
  --version <version>   Minecraft version (default: 1.20.1)
  --auth <type>         Auth type: offline|mojang (default: offline)
  --timeout <ms>        Operation timeout (default: 30000)
  --radius <blocks>     Observation radius (default: 16)

Examples:
  mc-smoke --scenario navigate --verbose
  mc-smoke --scenario gather-wood --runs 5 --log results.json
  mc-smoke --host play.example.com --port 58879 --username TestBot
`);
}
// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(' Unhandled error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=mc-smoke.js.map
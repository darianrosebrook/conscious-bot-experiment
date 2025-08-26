#!/usr/bin/env tsx

/**
 * Bot Test Runner CLI
 *
 * Simple command-line interface for running bot capability tests
 *
 * @author @darianrosebrook
 */

import BotTestSuite from '../src/bot-test-suite';

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const baseUrl =
    args.find((arg) => arg.startsWith('--url='))?.split('=')[1] ||
    'http://localhost:3005';
  const saveResults = args.includes('--save') || args.includes('-s');
  const filename = args
    .find((arg) => arg.startsWith('--output='))
    ?.split('=')[1];
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
Bot Test Runner - Test Minecraft Bot Capabilities

Usage: test-bot [options]

Options:
  --url=<url>        Bot server URL (default: http://localhost:3005)
  --save, -s         Save test results to files
  --output=<file>    Specify output filename for results
  --help, -h         Show this help message

Examples:
  test-bot                           # Run tests against localhost:3005
  test-bot --url=http://localhost:3005 --save
  test-bot --output=my-results.json --save

Test Suites:
  - Movement & Navigation
  - Mining & Resource Gathering  
  - Building & Construction
  - Crafting & Item Creation
  - Interaction & Communication
  - Exploration & Discovery
  - Survival & Sustenance
`);
    process.exit(0);
  }

  const testSuite = new BotTestSuite(baseUrl);

  try {
    console.log(`🚀 Starting bot tests against: ${baseUrl}\n`);

    const results = await testSuite.runAllTests();

    if (saveResults) {
      await testSuite.saveResults(results, filename);
    }

    // Exit with appropriate code
    const allPassed = results.every((r) => r.success);
    const exitCode = allPassed ? 0 : 1;

    console.log(`\n🎯 Test run completed with exit code: ${exitCode}`);
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

main();

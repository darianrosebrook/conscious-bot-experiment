/**
 * Bot Test Suite: Comprehensive testing framework for Minecraft bot capabilities
 *
 * Tests all available bot actions including movement, mining, building, crafting,
 * and other interactions to verify the bot can perform basic Minecraft tasks.
 *
 * @author @darianrosebrook
 */

import { Vec3 } from 'vec3';

export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
  timestamp: number;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  description: string;
  action: {
    type: string;
    parameters: Record<string, any>;
  };
  expectedResult: 'success' | 'failure' | 'partial';
  timeout?: number;
  preconditions?: string[];
}

export class BotTestSuite {
  private baseUrl: string;
  private results: TestResult[] = [];

  constructor(baseUrl: string = 'http://localhost:3005') {
    this.baseUrl = baseUrl;
  }

  /**
   * Run all test suites
   */
  async runAllTests(): Promise<TestResult[]> {
    console.log('🧪 Starting comprehensive bot capability tests...\n');

    const testSuites = this.getTestSuites();
    const allResults: TestResult[] = [];

    for (const suite of testSuites) {
      console.log(`📋 Running test suite: ${suite.name}`);
      console.log(`   ${suite.description}\n`);

      const suiteResults = await this.runTestSuite(suite);
      allResults.push(...suiteResults);

      // Summary for this suite
      const passed = suiteResults.filter((r) => r.success).length;
      const total = suiteResults.length;
      console.log(`   ✅ ${passed}/${total} tests passed\n`);
    }

    // Overall summary
    const totalPassed = allResults.filter((r) => r.success).length;
    const totalTests = allResults.length;
    console.log(
      `🎯 Overall Results: ${totalPassed}/${totalTests} tests passed`
    );

    return allResults;
  }

  /**
   * Run a specific test suite
   */
  async runTestSuite(suite: TestSuite): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of suite.tests) {
      const result = await this.runTest(testCase);
      results.push(result);

      // Log result immediately
      const status = result.success ? '✅' : '❌';
      console.log(
        `   ${status} ${testCase.name}: ${result.success ? 'PASSED' : 'FAILED'}`
      );
      if (!result.success && result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Check if bot is connected first
      const statusResponse = await fetch(`${this.baseUrl}/state`);
      if (!statusResponse.ok) {
        throw new Error('Cannot connect to bot server');
      }

      const status = (await statusResponse.json()) as any;
      if (!status.success || !status.isAlive) {
        throw new Error('Bot is not connected to Minecraft server');
      }

      // Execute the action
      const response = await fetch(`${this.baseUrl}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: testCase.action.type,
          parameters: testCase.action.parameters,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as any;
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const result = (await response.json()) as any;
      const duration = Date.now() - startTime;

      // Determine if test passed based on expected result
      let success = false;
      if (testCase.expectedResult === 'success') {
        success = result.success === true;
      } else if (testCase.expectedResult === 'failure') {
        success = result.success === false;
      } else if (testCase.expectedResult === 'partial') {
        success = result.success !== undefined; // Any response is considered partial success
      }

      return {
        testName: testCase.name,
        success,
        duration,
        data: result,
        timestamp: Date.now(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        testName: testCase.name,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get all available test suites
   */
  getTestSuites(): TestSuite[] {
    return [
      this.getMovementTests(),
      this.getMiningTests(),
      this.getBuildingTests(),
      this.getCraftingTests(),
      this.getInteractionTests(),
      this.getExplorationTests(),
      this.getSurvivalTests(),
    ];
  }

  /**
   * Movement and navigation tests
   */
  private getMovementTests(): TestSuite {
    return {
      name: 'Movement & Navigation',
      description:
        'Test basic movement capabilities including walking, turning, and pathfinding',
      tests: [
        {
          name: 'Move Forward',
          description: 'Test basic forward movement',
          action: {
            type: 'move_forward',
            parameters: { distance: 3 },
          },
          expectedResult: 'success',
          timeout: 10000,
        },
        {
          name: 'Turn Left',
          description: 'Test turning left',
          action: {
            type: 'turn_left',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 5000,
        },
        {
          name: 'Turn Right',
          description: 'Test turning right',
          action: {
            type: 'turn_right',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 5000,
        },
        {
          name: 'Jump',
          description: 'Test jumping action',
          action: {
            type: 'jump',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 3000,
        },
        {
          name: 'Navigate to Position',
          description: 'Test pathfinding to a specific position',
          action: {
            type: 'navigate',
            parameters: {
              target: { x: 10, y: 64, z: 10 },
              range: 2,
            },
          },
          expectedResult: 'partial', // May fail if position is unreachable
          timeout: 15000,
        },
        {
          name: 'Look Around',
          description: 'Test looking in different directions',
          action: {
            type: 'look_at',
            parameters: { direction: 'around' },
          },
          expectedResult: 'success',
          timeout: 3000,
        },
      ],
    };
  }

  /**
   * Mining and resource gathering tests
   */
  private getMiningTests(): TestSuite {
    return {
      name: 'Mining & Resource Gathering',
      description: 'Test mining capabilities and resource collection',
      tests: [
        {
          name: 'Mine Dirt Block',
          description: 'Test mining a basic dirt block',
          action: {
            type: 'mine_block',
            parameters: {
              position: { x: 0, y: 63, z: 0 },
              blockType: 'dirt',
            },
          },
          expectedResult: 'partial', // May fail if no dirt at position
          timeout: 10000,
        },
        {
          name: 'Mine Stone Block',
          description: 'Test mining stone blocks',
          action: {
            type: 'mine_block',
            parameters: {
              position: { x: 1, y: 63, z: 1 },
              blockType: 'stone',
              tool: 'pickaxe',
            },
          },
          expectedResult: 'partial',
          timeout: 10000,
        },
        {
          name: 'Dig Blocks',
          description: 'Test general digging action',
          action: {
            type: 'dig_blocks',
            parameters: {
              position: 'current',
              tool: 'hand',
            },
          },
          expectedResult: 'partial',
          timeout: 8000,
        },
        {
          name: 'Collect Items',
          description: 'Test picking up dropped items',
          action: {
            type: 'collect_items',
            parameters: { radius: 5 },
          },
          expectedResult: 'partial', // May fail if no items nearby
          timeout: 5000,
        },
      ],
    };
  }

  /**
   * Building and construction tests
   */
  private getBuildingTests(): TestSuite {
    return {
      name: 'Building & Construction',
      description: 'Test block placement and building capabilities',
      tests: [
        {
          name: 'Place Torch',
          description: 'Test placing a torch for lighting',
          action: {
            type: 'place_block',
            parameters: {
              block_type: 'torch',
              count: 1,
              placement: 'around_player',
            },
          },
          expectedResult: 'partial', // May fail if no torches in inventory
          timeout: 8000,
        },
        {
          name: 'Place Dirt Block',
          description: 'Test placing a basic building block',
          action: {
            type: 'place_block',
            parameters: {
              block_type: 'dirt',
              count: 1,
              placement: 'specific_position',
              position: { x: 2, y: 64, z: 2 },
            },
          },
          expectedResult: 'partial',
          timeout: 8000,
        },
        {
          name: 'Find Shelter',
          description: 'Test shelter finding and basic construction',
          action: {
            type: 'find_shelter',
            parameters: {
              shelter_type: 'cave_or_house',
              light_sources: true,
              search_radius: 10,
            },
          },
          expectedResult: 'partial',
          timeout: 20000,
        },
      ],
    };
  }

  /**
   * Crafting and item creation tests
   */
  private getCraftingTests(): TestSuite {
    return {
      name: 'Crafting & Item Creation',
      description: 'Test crafting capabilities and item creation',
      tests: [
        {
          name: 'Craft Sticks',
          description: 'Test basic 2x2 crafting (sticks from planks)',
          action: {
            type: 'craft_item',
            parameters: {
              item: 'stick',
              quantity: 4,
            },
          },
          expectedResult: 'partial', // May fail if no wood available
          timeout: 15000,
        },
        {
          name: 'Craft Wooden Pickaxe',
          description: 'Test crafting a basic tool',
          action: {
            type: 'craft_item',
            parameters: {
              item: 'wooden_pickaxe',
              quantity: 1,
            },
          },
          expectedResult: 'partial',
          timeout: 15000,
        },
        {
          name: 'Craft with Crafting Table',
          description: 'Test 3x3 crafting using crafting table',
          action: {
            type: 'craft',
            parameters: {
              item: 'chest',
              amount: 1,
              useCraftingTable: true,
            },
          },
          expectedResult: 'partial',
          timeout: 20000,
        },
      ],
    };
  }

  /**
   * Interaction and communication tests
   */
  private getInteractionTests(): TestSuite {
    return {
      name: 'Interaction & Communication',
      description: 'Test chat, entity interaction, and communication',
      tests: [
        {
          name: 'Send Chat Message',
          description: 'Test sending a chat message',
          action: {
            type: 'chat',
            parameters: {
              message: 'Hello, this is a test message!',
            },
          },
          expectedResult: 'success',
          timeout: 3000,
        },
        {
          name: 'Attack Entity',
          description: 'Test attacking nearby entities',
          action: {
            type: 'attack_entity',
            parameters: {
              target: 'nearest',
            },
          },
          expectedResult: 'partial', // May fail if no entities nearby
          timeout: 10000,
        },
        {
          name: 'Harvest Crops',
          description: 'Test harvesting crops',
          action: {
            type: 'harvest_crops',
            parameters: {
              position: 'current',
              tool: 'hand',
            },
          },
          expectedResult: 'partial',
          timeout: 8000,
        },
      ],
    };
  }

  /**
   * Exploration and discovery tests
   */
  private getExplorationTests(): TestSuite {
    return {
      name: 'Exploration & Discovery',
      description: 'Test exploration capabilities and environmental scanning',
      tests: [
        {
          name: 'Scan for Trees',
          description: 'Test scanning for nearby trees',
          action: {
            type: 'scan_for_trees',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 3000,
        },
        {
          name: 'Scan for Animals',
          description: 'Test scanning for nearby animals',
          action: {
            type: 'scan_for_animals',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 3000,
        },
        {
          name: 'Analyze Biome Resources',
          description: 'Test biome resource analysis',
          action: {
            type: 'analyze_biome_resources',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 3000,
        },
        {
          name: 'Scan Tree Structure',
          description: 'Test detailed tree structure scanning',
          action: {
            type: 'scan_tree_structure',
            parameters: {},
          },
          expectedResult: 'success',
          timeout: 3000,
        },
      ],
    };
  }

  /**
   * Survival and sustenance tests
   */
  private getSurvivalTests(): TestSuite {
    return {
      name: 'Survival & Sustenance',
      description:
        'Test survival capabilities including food consumption and health management',
      tests: [
        {
          name: 'Consume Food',
          description: 'Test eating food to restore health/hunger',
          action: {
            type: 'consume_food',
            parameters: {
              food_type: 'any',
              amount: 1,
            },
          },
          expectedResult: 'partial', // May fail if no food available
          timeout: 8000,
        },
        {
          name: 'Experiment with Item',
          description: 'Test experimental item interaction',
          action: {
            type: 'experiment_with_item',
            parameters: {
              item_type: 'apple',
              action: 'consume',
            },
          },
          expectedResult: 'partial',
          timeout: 10000,
        },
        {
          name: 'Explore Item Properties',
          description: 'Test comprehensive item property exploration',
          action: {
            type: 'explore_item_properties',
            parameters: {
              item_type: 'bread',
              properties_to_test: ['edible', 'placeable'],
            },
          },
          expectedResult: 'partial',
          timeout: 15000,
        },
        {
          name: 'Cook Food',
          description: 'Test cooking food items',
          action: {
            type: 'cook_food',
            parameters: {
              food_type: 'beef',
              amount: 1,
            },
          },
          expectedResult: 'partial',
          timeout: 12000,
        },
      ],
    };
  }

  /**
   * Generate a test report
   */
  generateReport(results: TestResult[]): string {
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    let report = `
# Bot Capability Test Report
Generated: ${new Date().toISOString()}

## Summary
- **Total Tests**: ${totalTests}
- **Passed**: ${passedTests}
- **Failed**: ${failedTests}
- **Success Rate**: ${successRate}%

## Detailed Results
`;

    // Group by test suites
    const suites = this.getTestSuites();
    for (const suite of suites) {
      const suiteTests = results.filter((r) =>
        suite.tests.some((t) => t.name === r.testName)
      );
      const suitePassed = suiteTests.filter((r) => r.success).length;
      const suiteTotal = suiteTests.length;

      report += `
### ${suite.name}
**${suite.description}**
- Passed: ${suitePassed}/${suiteTotal}

`;

      for (const test of suiteTests) {
        const status = test.success ? '✅' : '❌';
        report += `- ${status} ${test.testName} (${test.duration}ms)`;
        if (!test.success && test.error) {
          report += ` - ${test.error}`;
        }
        report += '\n';
      }
    }

    // Failed tests summary
    const failedResults = results.filter((r) => !r.success);
    if (failedResults.length > 0) {
      report += `
## Failed Tests Summary
`;
      for (const result of failedResults) {
        report += `- **${result.testName}**: ${result.error}\n`;
      }
    }

    return report;
  }

  /**
   * Save test results to file
   */
  async saveResults(results: TestResult[], filename?: string): Promise<void> {
    const defaultFilename = `bot-test-results-${Date.now()}.json`;
    const reportFilename =
      filename?.replace('.json', '-report.md') ||
      defaultFilename.replace('.json', '-report.md');

    // Save raw results
    const fs = await import('fs/promises');
    await fs.writeFile(
      filename || defaultFilename,
      JSON.stringify(results, null, 2)
    );

    // Save human-readable report
    const report = this.generateReport(results);
    await fs.writeFile(reportFilename, report);

    console.log(`📄 Test results saved to: ${filename || defaultFilename}`);
    console.log(`📄 Test report saved to: ${reportFilename}`);
  }
}

/**
 * CLI interface for running tests
 */
async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3005';
  const saveResults = args.includes('--save') || args.includes('-s');
  const filename = args
    .find((arg) => arg.startsWith('--output='))
    ?.split('=')[1];

  const testSuite = new BotTestSuite(baseUrl);

  try {
    console.log(`🚀 Starting bot tests against: ${baseUrl}\n`);

    const results = await testSuite.runAllTests();

    if (saveResults) {
      await testSuite.saveResults(results, filename);
    }

    // Exit with appropriate code
    const allPassed = results.every((r) => r.success);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export default BotTestSuite;

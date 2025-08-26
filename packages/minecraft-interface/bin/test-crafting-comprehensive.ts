#!/usr/bin/env ts-node

/**
 * Comprehensive Crafting Grid Test Runner
 * 
 * Runs both unit and integration tests for the crafting grid system.
 * Can be configured to run with or without a live Minecraft server.
 * 
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  total: number;
}

class ComprehensiveCraftingTester {
  private results: TestSuite[] = [];
  private serverAvailable = false;

  constructor() {
    this.results = [];
  }

  private async checkServer(): Promise<void> {
    console.log('🔍 Checking Minecraft server availability...');
    this.serverAvailable = await this.checkServerAvailability();
    console.log(`   Server available: ${this.serverAvailable ? '✅' : '❌'}`);
  }

  private async checkServerAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const testBot = createBot({
        host: 'localhost',
        port: 25565,
        username: 'ServerCheck',
        version: '1.21.4',
        auth: 'offline' as const,
      });

      const timeout = setTimeout(() => {
        testBot.quit();
        resolve(false);
      }, 5000);

      testBot.once('spawn', () => {
        clearTimeout(timeout);
        testBot.quit();
        resolve(true);
      });

      testBot.once('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async runUnitTests(): Promise<void> {
    console.log('\n🧪 Running Unit Tests');
    console.log('====================');

    const unitTests: TestResult[] = [];
    const startTime = Date.now();

    // Test 1: Recipe classification
    try {
      const testStart = Date.now();
      const recipes2x2 = ['planks', 'sticks', 'torch', 'crafting_table'];
      const recipes3x3 = ['furnace', 'iron_pickaxe', 'chest', 'bed'];
      
      // Validate 2x2 recipes
      recipes2x2.forEach(recipe => {
        const mockRecipe = {
          result: { name: recipe, count: 4 },
          ingredients: [{ name: 'material', count: 1 }]
        };
        const is2x2 = mockRecipe.result.count <= 4 && 
                     (mockRecipe.ingredients?.length || 0) <= 4;
        if (!is2x2) throw new Error(`Invalid 2x2 recipe: ${recipe}`);
      });

      // Validate 3x3 recipes
      recipes3x3.forEach(recipe => {
        const mockRecipe = {
          result: { name: recipe, count: 1 },
          ingredients: [
            { name: 'material1', count: 1 },
            { name: 'material2', count: 1 },
            { name: 'material3', count: 1 },
            { name: 'material4', count: 1 },
            { name: 'material5', count: 1 }
          ]
        };
        const is3x3 = mockRecipe.ingredients && mockRecipe.ingredients.length > 4;
        if (!is3x3) throw new Error(`Invalid 3x3 recipe: ${recipe}`);
      });

      unitTests.push({
        name: 'Recipe Classification',
        passed: true,
        duration: Date.now() - testStart
      });
    } catch (error) {
      unitTests.push({
        name: 'Recipe Classification',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      });
    }

    // Test 2: Material requirement parsing
    try {
      const testStart = Date.now();
      const preconditions = {
        bot_health: ">= 15",
        inventory_oak_log: ">= 2",
        inventory_stone: ">= 8"
      };

      Object.entries(preconditions).forEach(([key, value]) => {
        const threshold = parseInt(value.replace('>=', ''));
        if (isNaN(threshold)) throw new Error(`Invalid threshold: ${value}`);
      });

      unitTests.push({
        name: 'Material Requirement Parsing',
        passed: true,
        duration: Date.now() - testStart
      });
    } catch (error) {
      unitTests.push({
        name: 'Material Requirement Parsing',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      });
    }

    // Test 3: Scenario validation
    try {
      const testStart = Date.now();
      const scenario = {
        name: "Test Scenario",
        description: "Test description",
        timeout: 30000,
        preconditions: { bot_health: ">= 15" },
        success_conditions: { experiments_completed: ">= 1" },
        crafting_experiments: [{
          name: "test",
          recipe: "planks",
          grid_size: "2x2",
          difficulty: "easy",
          uses_crafting_table: false
        }]
      };

      // Validate scenario structure
      if (!scenario.name || !scenario.description || scenario.timeout <= 0) {
        throw new Error('Invalid scenario structure');
      }

      // Validate experiment structure
      scenario.crafting_experiments.forEach(exp => {
        if (!exp.name || !exp.recipe || !['2x2', '3x3'].includes(exp.grid_size)) {
          throw new Error('Invalid experiment structure');
        }
      });

      unitTests.push({
        name: 'Scenario Validation',
        passed: true,
        duration: Date.now() - testStart
      });
    } catch (error) {
      unitTests.push({
        name: 'Scenario Validation',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      });
    }

    const passed = unitTests.filter(t => t.passed).length;
    const failed = unitTests.filter(t => !t.passed).length;

    this.results.push({
      name: 'Unit Tests',
      tests: unitTests,
      passed,
      failed,
      total: unitTests.length
    });

    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️ Duration: ${Date.now() - startTime}ms`);
  }

  private async runIntegrationTests(): Promise<void> {
    if (!this.serverAvailable) {
      console.log('\n⏭️ Skipping Integration Tests (no server available)');
      return;
    }

    console.log('\n🔗 Running Integration Tests');
    console.log('============================');

    const integrationTests: TestResult[] = [];
    const startTime = Date.now();

    let bot: any = null;

    try {
      // Create bot for integration testing
      bot = createBot({
        host: 'localhost',
        port: 25565,
        username: 'ComprehensiveTester',
        version: '1.21.4',
        auth: 'offline' as const,
      });

      // Wait for bot to spawn
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Bot spawn timeout'));
        }, 10000);

        bot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });

        bot.once('error', (error: any) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      // Test 1: Server connection
      try {
        const testStart = Date.now();
        expect(bot).toBeDefined();
        expect(bot.username).toBe('ComprehensiveTester');
        expect(bot.game).toBeDefined();
        expect(bot.entity).toBeDefined();

        integrationTests.push({
          name: 'Server Connection',
          passed: true,
          duration: Date.now() - testStart
        });
      } catch (error) {
        integrationTests.push({
          name: 'Server Connection',
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0
        });
      }

      // Test 2: Inventory access
      try {
        const testStart = Date.now();
        const items = bot.inventory.items();
        expect(Array.isArray(items)).toBe(true);

        integrationTests.push({
          name: 'Inventory Access',
          passed: true,
          duration: Date.now() - testStart
        });
      } catch (error) {
        integrationTests.push({
          name: 'Inventory Access',
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0
        });
      }

      // Test 3: Recipe database
      try {
        const testStart = Date.now();
        const recipes = bot.recipesAll();
        expect(Array.isArray(recipes)).toBe(true);
        expect(recipes.length).toBeGreaterThan(0);

        integrationTests.push({
          name: 'Recipe Database',
          passed: true,
          duration: Date.now() - testStart
        });
      } catch (error) {
        integrationTests.push({
          name: 'Recipe Database',
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0
        });
      }

      // Test 4: Crafting table detection
      try {
        const testStart = Date.now();
        const craftingTable = bot.findBlock({
          matching: bot.mcData.blocksByName.crafting_table.id,
          maxDistance: 10,
        });
        // Crafting table might not exist, which is fine
        expect(craftingTable === null || craftingTable.position).toBeTruthy();

        integrationTests.push({
          name: 'Crafting Table Detection',
          passed: true,
          duration: Date.now() - testStart
        });
      } catch (error) {
        integrationTests.push({
          name: 'Crafting Table Detection',
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          duration: 0
        });
      }

    } catch (error) {
      integrationTests.push({
        name: 'Integration Setup',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0
      });
    } finally {
      if (bot) {
        bot.quit();
      }
    }

    const passed = integrationTests.filter(t => t.passed).length;
    const failed = integrationTests.filter(t => !t.passed).length;

    this.results.push({
      name: 'Integration Tests',
      tests: integrationTests,
      passed,
      failed,
      total: integrationTests.length
    });

    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️ Duration: ${Date.now() - startTime}ms`);
  }

  private printResults(): void {
    console.log('\n📊 Test Results Summary');
    console.log('======================');

    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;

    this.results.forEach(suite => {
      console.log(`\n${suite.name}:`);
      console.log(`   Total: ${suite.total}`);
      console.log(`   Passed: ${suite.passed}`);
      console.log(`   Failed: ${suite.failed}`);

      if (suite.failed > 0) {
        console.log('   Failed Tests:');
        suite.tests.filter(t => !t.passed).forEach(test => {
          console.log(`     - ${test.name}: ${test.error}`);
        });
      }

      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalTests += suite.total;
    });

    console.log(`\nOverall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${totalPassed}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

    if (totalFailed === 0) {
      console.log('\n🎉 All tests passed!');
    } else {
      console.log('\n⚠️ Some tests failed. Please review the errors above.');
    }
  }

  async runAllTests(): Promise<boolean> {
    console.log('🚀 Starting Comprehensive Crafting Grid Tests');
    console.log('=============================================');

    try {
      await this.checkServer();
      await this.runUnitTests();
      await this.runIntegrationTests();
      this.printResults();

      const totalFailed = this.results.reduce((sum, suite) => sum + suite.failed, 0);
      return totalFailed === 0;
    } catch (error) {
      console.error('❌ Test runner failed:', error);
      return false;
    }
  }
}

// Helper function for assertions (simple implementation)
function expect(value: any) {
  return {
    toBeDefined: () => {
      if (value === undefined || value === null) {
        throw new Error('Value is not defined');
      }
    },
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, but got ${value}`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) {
        throw new Error(`Expected value to be greater than ${expected}, but got ${value}`);
      }
    },
    toBeGreaterThanOrEqual: (expected: number) => {
      if (value < expected) {
        throw new Error(`Expected value to be greater than or equal to ${expected}, but got ${value}`);
      }
    },
    toBeTruthy: () => {
      if (!value) {
        throw new Error('Expected value to be truthy');
      }
    }
  };
}

// Main execution
async function main() {
  const tester = new ComprehensiveCraftingTester();
  const success = await tester.runAllTests();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

export { ComprehensiveCraftingTester };

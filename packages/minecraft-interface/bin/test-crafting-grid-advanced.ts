#!/usr/bin/env ts-node

/**
 * Advanced Crafting Grid Experiment Test Script
 *
 * Comprehensive test of bot's ability to experiment with 2x2 and 3x3 crafting grids
 * including recipe discovery, crafting table usage, and systematic experimentation.
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';
import { ActionTranslator } from '../src/action-translator';
import { BotConfig } from '../src/types';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

interface CraftingExperiment {
  name: string;
  recipe: string;
  input_items: Array<{ item: string; count: number }>;
  output_item: string;
  output_count: number;
  uses_crafting_table: boolean;
  grid_size: string;
  difficulty: string;
  description: string;
}

interface ExperimentPhase {
  name: string;
  description: string;
  experiments: string[];
  success_criteria: Record<string, any>;
}

interface CraftingScenario {
  name: string;
  description: string;
  timeout: number;
  tags: string[];
  preconditions: Record<string, any>;
  success_conditions: Record<string, any>;
  failure_conditions: Record<string, any>;
  crafting_experiments: CraftingExperiment[];
  experiment_phases: Record<string, ExperimentPhase>;
  success_metrics: Record<string, any>;
  learning_objectives: string[];
  experimentation_guidelines: string[];
  notes: string;
}

interface ExperimentResult {
  experiment: CraftingExperiment;
  success: boolean;
  error?: string;
  duration: number;
  materials_used: Record<string, number>;
  output_received: Record<string, number>;
  grid_size_tested: string;
  crafting_table_used: boolean;
}

class AdvancedCraftingGridTester {
  private bot: any;
  private translator: ActionTranslator;
  private scenario: CraftingScenario;
  private results: {
    experiments_completed: string[];
    experiments_failed: string[];
    recipes_discovered: string[];
    crafting_table_used: boolean;
    both_grid_sizes_tested: boolean;
    execution_time: number;
    errors: string[];
    phase_results: Record<string, any>;
    experiment_results: ExperimentResult[];
    learning_progress: Record<string, boolean>;
  };

  constructor(bot: any, config: BotConfig, scenarioPath: string) {
    this.bot = bot;
    this.translator = new ActionTranslator(bot, config);
    this.scenario = this.loadScenario(scenarioPath);
    this.results = {
      experiments_completed: [],
      experiments_failed: [],
      recipes_discovered: [],
      crafting_table_used: false,
      both_grid_sizes_tested: false,
      execution_time: 0,
      errors: [],
      phase_results: {},
      experiment_results: [],
      learning_progress: {},
    };
  }

  private loadScenario(scenarioPath: string): CraftingScenario {
    const scenarioFile = fs.readFileSync(scenarioPath, 'utf8');
    return yaml.load(scenarioFile) as CraftingScenario;
  }

  private async checkPreconditions(): Promise<boolean> {
    console.log('\n🔍 Checking preconditions...');

    const preconditions = this.scenario.preconditions;
    let allMet = true;

    // Check bot health
    if (preconditions.bot_health) {
      const healthThreshold = parseInt(
        preconditions.bot_health.replace('>=', '')
      );
      if (this.bot.health < healthThreshold) {
        console.log(
          `❌ Bot health (${this.bot.health}) below threshold (${healthThreshold})`
        );
        allMet = false;
      } else {
        console.log(`✅ Bot health: ${this.bot.health}/${healthThreshold}`);
      }
    }

    // Check inventory items
    const inventoryItems = this.bot.inventory.items();
    const itemCounts: Record<string, number> = {};

    // Count all items in inventory
    inventoryItems.forEach((item) => {
      const itemName = item.name.toLowerCase();
      itemCounts[itemName] = (itemCounts[itemName] || 0) + item.count;
    });

    for (const [itemKey, requirement] of Object.entries(preconditions)) {
      if (itemKey.startsWith('inventory_')) {
        const itemName = itemKey.replace('inventory_', '');
        const requiredCount = parseInt(
          requirement.toString().replace('>=', '')
        );
        const actualCount = itemCounts[itemName] || 0;

        if (actualCount < requiredCount) {
          console.log(
            `❌ Insufficient ${itemName}: ${actualCount}/${requiredCount}`
          );
          allMet = false;
        } else {
          console.log(`✅ ${itemName}: ${actualCount}/${requiredCount}`);
        }
      }
    }

    if (allMet) {
      console.log('✅ All preconditions met');
    } else {
      console.log('❌ Some preconditions not met');
    }

    return allMet;
  }

  private async runExperiment(
    experiment: CraftingExperiment
  ): Promise<ExperimentResult> {
    const startTime = Date.now();
    console.log(`\n🧪 Running experiment: ${experiment.name}`);
    console.log(`   Description: ${experiment.description}`);
    console.log(`   Recipe: ${experiment.recipe}`);
    console.log(`   Grid: ${experiment.grid_size}`);
    console.log(`   Difficulty: ${experiment.difficulty}`);
    console.log(`   Uses crafting table: ${experiment.uses_crafting_table}`);

    const result: ExperimentResult = {
      experiment,
      success: false,
      duration: 0,
      materials_used: {},
      output_received: {},
      grid_size_tested: experiment.grid_size,
      crafting_table_used: experiment.uses_crafting_table,
    };

    try {
      // Record initial inventory state
      const initialInventory = this.bot.inventory.items().map((item) => ({
        name: item.name,
        count: item.count,
      }));

      // Create crafting action
      const action = {
        type: 'craft_item' as const,
        parameters: {
          item: experiment.recipe,
          count: 1,
          useCraftingTable: experiment.uses_crafting_table,
        },
        timeout: 15000,
      };

      // Execute crafting
      const craftingResult = await this.translator.executeAction(action);

      // Record final inventory state
      const finalInventory = this.bot.inventory.items().map((item) => ({
        name: item.name,
        count: item.count,
      }));

      // Calculate materials used and outputs received
      const materialsUsed: Record<string, number> = {};
      const outputsReceived: Record<string, number> = {};

      // Calculate material usage
      initialInventory.forEach((initialItem) => {
        const finalItem = finalInventory.find(
          (fi) => fi.name === initialItem.name
        );
        const finalCount = finalItem ? finalItem.count : 0;
        const used = initialItem.count - finalCount;
        if (used > 0) {
          materialsUsed[initialItem.name] = used;
        }
      });

      // Calculate outputs received
      finalInventory.forEach((finalItem) => {
        const initialItem = initialInventory.find(
          (ii) => ii.name === finalItem.name
        );
        const initialCount = initialItem ? initialItem.count : 0;
        const received = finalItem.count - initialCount;
        if (received > 0) {
          outputsReceived[finalItem.name] = received;
        }
      });

      result.materials_used = materialsUsed;
      result.output_received = outputsReceived;
      result.duration = Date.now() - startTime;

      if (craftingResult.success) {
        console.log(`✅ Experiment ${experiment.name} completed successfully`);
        console.log(`   Duration: ${result.duration}ms`);
        console.log(`   Materials used:`, materialsUsed);
        console.log(`   Outputs received:`, outputsReceived);

        result.success = true;
        this.results.experiments_completed.push(experiment.name);
        this.results.recipes_discovered.push(experiment.recipe);

        if (experiment.uses_crafting_table) {
          this.results.crafting_table_used = true;
        }

        // Track grid size testing
        if (experiment.grid_size === '2x2' || experiment.grid_size === '3x3') {
          this.results.both_grid_sizes_tested = true;
        }
      } else {
        console.log(
          `❌ Experiment ${experiment.name} failed: ${craftingResult.error}`
        );
        result.error = craftingResult.error;
        this.results.experiments_failed.push(experiment.name);
        this.results.errors.push(`${experiment.name}: ${craftingResult.error}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(`❌ Experiment ${experiment.name} error: ${errorMessage}`);
      result.error = errorMessage;
      result.duration = Date.now() - startTime;
      this.results.experiments_failed.push(experiment.name);
      this.results.errors.push(`${experiment.name}: ${errorMessage}`);
    }

    this.results.experiment_results.push(result);
    return result;
  }

  private async runPhase(
    phaseName: string,
    phase: ExperimentPhase
  ): Promise<boolean> {
    console.log(`\n📋 Running phase: ${phase.name}`);
    console.log(`   Description: ${phase.description}`);

    const phaseResults = {
      experiments_attempted: 0,
      experiments_successful: 0,
      experiments_failed: 0,
      success_criteria_met: false,
      learning_objectives_achieved: [] as string[],
    };

    // Run experiments in this phase
    for (const experimentName of phase.experiments) {
      const experiment = this.scenario.crafting_experiments.find(
        (e) => e.name === experimentName
      );
      if (!experiment) {
        console.log(`❌ Experiment ${experimentName} not found in scenario`);
        continue;
      }

      phaseResults.experiments_attempted++;
      const result = await this.runExperiment(experiment);

      if (result.success) {
        phaseResults.experiments_successful++;
      } else {
        phaseResults.experiments_failed++;
      }
    }

    // Check success criteria
    const successCriteria = phase.success_criteria;
    if (successCriteria.completed_experiments) {
      const required = parseInt(
        successCriteria.completed_experiments.replace('>=', '')
      );
      phaseResults.success_criteria_met =
        phaseResults.experiments_successful >= required;
    }

    // Track learning progress
    this.scenario.learning_objectives.forEach((objective) => {
      if (
        objective.includes('2x2') &&
        phaseResults.experiments_successful > 0
      ) {
        phaseResults.learning_objectives_achieved.push(
          '2x2 grid understanding'
        );
      }
      if (
        objective.includes('3x3') &&
        phaseResults.experiments_successful > 0
      ) {
        phaseResults.learning_objectives_achieved.push(
          '3x3 grid understanding'
        );
      }
      if (
        objective.includes('crafting table') &&
        this.results.crafting_table_used
      ) {
        phaseResults.learning_objectives_achieved.push('crafting table usage');
      }
    });

    this.results.phase_results[phaseName] = phaseResults;

    console.log(`📊 Phase ${phase.name} results:`);
    console.log(
      `   Successful: ${phaseResults.experiments_successful}/${phaseResults.experiments_attempted}`
    );
    console.log(
      `   Failed: ${phaseResults.experiments_failed}/${phaseResults.experiments_attempted}`
    );
    console.log(`   Criteria met: ${phaseResults.success_criteria_met}`);
    console.log(
      `   Learning objectives: ${phaseResults.learning_objectives_achieved.join(', ')}`
    );

    return phaseResults.success_criteria_met;
  }

  async runTest(): Promise<boolean> {
    const startTime = Date.now();
    console.log(
      `\n🚀 Starting Advanced Crafting Grid Experiment: ${this.scenario.name}`
    );
    console.log(`   Description: ${this.scenario.description}`);
    console.log(`   Timeout: ${this.scenario.timeout}ms`);
    console.log(`   Complexity: ${this.scenario.complexity}`);

    try {
      // Check preconditions
      const preconditionsMet = await this.checkPreconditions();
      if (!preconditionsMet) {
        console.log('❌ Preconditions not met, aborting test');
        return false;
      }

      // Run experiment phases
      for (const [phaseName, phase] of Object.entries(
        this.scenario.experiment_phases
      )) {
        const phaseSuccess = await this.runPhase(phaseName, phase);
        if (!phaseSuccess) {
          console.log(
            `⚠️ Phase ${phase.name} did not meet success criteria, but continuing...`
          );
        }
      }

      // Calculate execution time
      this.results.execution_time = Date.now() - startTime;

      // Check success conditions
      const successConditions = this.scenario.success_conditions;
      let overallSuccess = true;

      if (successConditions.crafting_experiments_completed) {
        const required = parseInt(
          successConditions.crafting_experiments_completed.replace('>=', '')
        );
        const actual = this.results.experiments_completed.length;
        if (actual < required) {
          console.log(
            `❌ Insufficient experiments completed: ${actual}/${required}`
          );
          overallSuccess = false;
        }
      }

      if (successConditions.recipes_discovered) {
        const required = parseInt(
          successConditions.recipes_discovered.replace('>=', '')
        );
        const actual = this.results.recipes_discovered.length;
        if (actual < required) {
          console.log(
            `❌ Insufficient recipes discovered: ${actual}/${required}`
          );
          overallSuccess = false;
        }
      }

      if (successConditions.execution_time) {
        const maxTime = parseInt(
          successConditions.execution_time.replace('<', '')
        );
        if (this.results.execution_time > maxTime) {
          console.log(
            `❌ Execution time exceeded: ${this.results.execution_time}ms > ${maxTime}ms`
          );
          overallSuccess = false;
        }
      }

      if (
        successConditions.crafting_table_used &&
        !this.results.crafting_table_used
      ) {
        console.log('❌ Crafting table was not used');
        overallSuccess = false;
      }

      if (
        successConditions.both_grid_sizes_tested &&
        !this.results.both_grid_sizes_tested
      ) {
        console.log('❌ Both grid sizes were not tested');
        overallSuccess = false;
      }

      // Print final results
      console.log('\n📊 Final Results:');
      console.log(
        `   Experiments completed: ${this.results.experiments_completed.length}`
      );
      console.log(
        `   Experiments failed: ${this.results.experiments_failed.length}`
      );
      console.log(
        `   Recipes discovered: ${this.results.recipes_discovered.length}`
      );
      console.log(
        `   Crafting table used: ${this.results.crafting_table_used}`
      );
      console.log(
        `   Both grid sizes tested: ${this.results.both_grid_sizes_tested}`
      );
      console.log(`   Execution time: ${this.results.execution_time}ms`);
      console.log(`   Errors: ${this.results.errors.length}`);

      if (this.results.experiments_completed.length > 0) {
        console.log('\n✅ Successful experiments:');
        this.results.experiments_completed.forEach((exp) =>
          console.log(`   - ${exp}`)
        );
      }

      if (this.results.experiments_failed.length > 0) {
        console.log('\n❌ Failed experiments:');
        this.results.experiments_failed.forEach((exp) =>
          console.log(`   - ${exp}`)
        );
      }

      if (this.results.recipes_discovered.length > 0) {
        console.log('\n🔍 Recipes discovered:');
        this.results.recipes_discovered.forEach((recipe) =>
          console.log(`   - ${recipe}`)
        );
      }

      if (this.results.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        this.results.errors.forEach((error) => console.log(`   - ${error}`));
      }

      // Learning progress summary
      console.log('\n🎓 Learning Progress:');
      this.scenario.learning_objectives.forEach((objective) => {
        const achieved = this.results.experiment_results.some((result) => {
          if (
            objective.includes('2x2') &&
            result.grid_size_tested === '2x2' &&
            result.success
          )
            return true;
          if (
            objective.includes('3x3') &&
            result.grid_size_tested === '3x3' &&
            result.success
          )
            return true;
          if (
            objective.includes('crafting table') &&
            result.crafting_table_used &&
            result.success
          )
            return true;
          return false;
        });
        console.log(`   ${achieved ? '✅' : '❌'} ${objective}`);
      });

      console.log(
        `\n${overallSuccess ? '✅' : '❌'} Test ${overallSuccess ? 'PASSED' : 'FAILED'}`
      );
      return overallSuccess;
    } catch (error) {
      console.log(`❌ Test error: ${error}`);
      return false;
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioPath =
    args[0] || path.join(__dirname, '../scenarios/crafting-grid-advanced.yaml');

  if (!fs.existsSync(scenarioPath)) {
    console.error(`❌ Scenario file not found: ${scenarioPath}`);
    process.exit(1);
  }

  // Bot configuration
  const config: BotConfig = {
    host: 'localhost',
    port: 25565,
    username: 'AdvancedCraftingTester',
    version: false, // Auto-detect version
    auth: 'offline',
    pathfindingTimeout: 15000,
    actionTimeout: 10000,
    observationRadius: 16,
    autoReconnect: false,
    maxReconnectAttempts: 3,
    emergencyDisconnect: true,
  };

  // Create bot
  const bot = createBot(config);

  bot.on('spawn', async () => {
    console.log('🤖 Bot spawned, starting advanced crafting grid test...');

    const tester = new AdvancedCraftingGridTester(bot, config, scenarioPath);
    const success = await tester.runTest();

    // Disconnect after test
    setTimeout(() => {
      bot.quit();
      process.exit(success ? 0 : 1);
    }, 1000);
  });

  bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
    process.exit(1);
  });

  bot.on('kicked', (reason) => {
    console.log('👢 Bot kicked:', reason);
    process.exit(1);
  });
}

if (require.main === module) {
  main().catch(console.error);
}

export { AdvancedCraftingGridTester };

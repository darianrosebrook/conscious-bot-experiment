#!/usr/bin/env ts-node

/**
 * Test script for crafting grid experimentation scenarios
 *
 * Tests the bot's ability to experiment with 2x2 and 3x3 crafting grids
 * including recipe discovery and crafting table usage.
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
  notes: string;
}

class CraftingGridTester {
  private bot: any;
  private translator: ActionTranslator;
  private scenario: CraftingScenario;
  private results: {
    experiments_completed: string[];
    recipes_discovered: string[];
    crafting_table_used: boolean;
    execution_time: number;
    errors: string[];
    phase_results: Record<string, any>;
  };

  constructor(bot: any, config: BotConfig, scenarioPath: string) {
    this.bot = bot;
    this.translator = new ActionTranslator(bot, config);
    this.scenario = this.loadScenario(scenarioPath);
    this.results = {
      experiments_completed: [],
      recipes_discovered: [],
      crafting_table_used: false,
      execution_time: 0,
      errors: [],
      phase_results: {},
    };
  }

  private loadScenario(scenarioPath: string): CraftingScenario {
    const scenarioFile = fs.readFileSync(scenarioPath, 'utf8');
    return yaml.load(scenarioFile) as CraftingScenario;
  }

  private async checkPreconditions(): Promise<boolean> {
    console.log('Checking preconditions...');

    const preconditions = this.scenario.preconditions;

    // Check bot health
    if (preconditions.bot_health) {
      const healthThreshold = parseInt(
        preconditions.bot_health.replace('>=', '')
      );
      if (this.bot.health < healthThreshold) {
        console.log(
          `❌ Bot health (${this.bot.health}) below threshold (${healthThreshold})`
        );
        return false;
      }
    }

    // Check inventory items
    for (const [itemKey, requirement] of Object.entries(preconditions)) {
      if (itemKey.startsWith('inventory_')) {
        const itemName = itemKey.replace('inventory_', '');
        const itemCount = this.bot.inventory
          .items()
          .filter((item) => item.name.includes(itemName))
          .reduce((sum, item) => sum + item.count, 0);

        const requiredCount = parseInt(
          requirement.toString().replace('>=', '')
        );
        if (itemCount < requiredCount) {
          console.log(
            `❌ Insufficient ${itemName}: ${itemCount}/${requiredCount}`
          );
          return false;
        }
        console.log(`✅ ${itemName}: ${itemCount}/${requiredCount}`);
      }
    }

    return true;
  }

  private async runExperiment(
    experiment: CraftingExperiment
  ): Promise<boolean> {
    console.log(`\n🧪 Running experiment: ${experiment.name}`);
    console.log(`   Recipe: ${experiment.recipe}`);
    console.log(`   Grid: ${experiment.grid_size}`);
    console.log(`   Uses crafting table: ${experiment.uses_crafting_table}`);

    try {
      // Create crafting action
      const action = {
        type: 'craft_item' as const,
        parameters: {
          item: experiment.recipe,
          count: 1,
          useCraftingTable: experiment.uses_crafting_table,
        },
        timeout: 10000,
      };

      // Execute crafting
      const result = await this.translator.executeAction(action);

      if (result.success) {
        console.log(`✅ Experiment ${experiment.name} completed successfully`);
        this.results.experiments_completed.push(experiment.name);
        this.results.recipes_discovered.push(experiment.recipe);

        if (experiment.uses_crafting_table) {
          this.results.crafting_table_used = true;
        }

        return true;
      } else {
        console.log(`❌ Experiment ${experiment.name} failed: ${result.error}`);
        this.results.errors.push(`${experiment.name}: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.log(`❌ Experiment ${experiment.name} error: ${error}`);
      this.results.errors.push(`${experiment.name}: ${error}`);
      return false;
    }
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
      success_criteria_met: false,
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
      const success = await this.runExperiment(experiment);
      if (success) {
        phaseResults.experiments_successful++;
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

    this.results.phase_results[phaseName] = phaseResults;

    console.log(`📊 Phase ${phase.name} results:`);
    console.log(
      `   Successful: ${phaseResults.experiments_successful}/${phaseResults.experiments_attempted}`
    );
    console.log(`   Criteria met: ${phaseResults.success_criteria_met}`);

    return phaseResults.success_criteria_met;
  }

  async runTest(): Promise<boolean> {
    const startTime = Date.now();
    console.log(
      `\n🚀 Starting Crafting Grid Experiment: ${this.scenario.name}`
    );
    console.log(`   Description: ${this.scenario.description}`);
    console.log(`   Timeout: ${this.scenario.timeout}ms`);

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

      // Print final results
      console.log('\n📊 Final Results:');
      console.log(
        `   Experiments completed: ${this.results.experiments_completed.length}`
      );
      console.log(
        `   Recipes discovered: ${this.results.recipes_discovered.length}`
      );
      console.log(
        `   Crafting table used: ${this.results.crafting_table_used}`
      );
      console.log(`   Execution time: ${this.results.execution_time}ms`);
      console.log(`   Errors: ${this.results.errors.length}`);

      if (this.results.errors.length > 0) {
        console.log('\n❌ Errors encountered:');
        this.results.errors.forEach((error) => console.log(`   - ${error}`));
      }

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
    args[0] || path.join(__dirname, '../scenarios/crafting-grid-basic.yaml');

  if (!fs.existsSync(scenarioPath)) {
    console.error(`❌ Scenario file not found: ${scenarioPath}`);
    process.exit(1);
  }

  // Bot configuration
  const config: BotConfig = {
    host: 'localhost',
    port: 25565,
    username: 'CraftingTester',
    version: false, // Auto-detect version
    auth: 'offline',
    pathfindingTimeout: 10000,
    actionTimeout: 5000,
    observationRadius: 16,
    autoReconnect: false,
    maxReconnectAttempts: 3,
    emergencyDisconnect: true,
  };

  // Create bot
  const bot = createBot(config);

  bot.on('spawn', async () => {
    console.log('🤖 Bot spawned, starting crafting grid test...');

    const tester = new CraftingGridTester(bot, config, scenarioPath);
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

export { CraftingGridTester };

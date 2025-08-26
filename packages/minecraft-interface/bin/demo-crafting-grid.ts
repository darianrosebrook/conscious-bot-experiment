#!/usr/bin/env ts-node

/**
 * Crafting Grid Experimentation Demo
 *
 * Interactive demonstration of bot's ability to experiment with 2x2 and 3x3 crafting grids
 * Shows real-time experimentation and learning progress.
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
  description: string;
  grid_size: string;
  difficulty: string;
  uses_crafting_table: boolean;
}

class CraftingGridDemo {
  private bot: any;
  private translator: ActionTranslator;
  private experiments: CraftingExperiment[] = [
    {
      name: 'Planks from Logs',
      recipe: 'planks',
      description: 'Convert logs to planks using 2x2 grid',
      grid_size: '2x2',
      difficulty: 'easy',
      uses_crafting_table: false,
    },
    {
      name: 'Sticks from Planks',
      recipe: 'sticks',
      description: 'Create sticks from planks using 2x2 grid',
      grid_size: '2x2',
      difficulty: 'easy',
      uses_crafting_table: false,
    },
    {
      name: 'Crafting Table',
      recipe: 'crafting_table',
      description: 'Create crafting table to enable 3x3 crafting',
      grid_size: '2x2',
      difficulty: 'easy',
      uses_crafting_table: false,
    },
    {
      name: 'Furnace',
      recipe: 'furnace',
      description: 'Create furnace using 3x3 grid',
      grid_size: '3x3',
      difficulty: 'medium',
      uses_crafting_table: true,
    },
    {
      name: 'Iron Pickaxe',
      recipe: 'iron_pickaxe',
      description: 'Create iron pickaxe using 3x3 grid',
      grid_size: '3x3',
      difficulty: 'hard',
      uses_crafting_table: true,
    },
  ];

  private results = {
    experiments_completed: 0,
    experiments_failed: 0,
    recipes_discovered: [] as string[],
    grid_sizes_tested: new Set<string>(),
    crafting_table_used: false,
    learning_progress: {
      '2x2_grid_understanding': false,
      '3x3_grid_understanding': false,
      crafting_table_usage: false,
      recipe_discovery: false,
    },
  };

  constructor(bot: any, config: BotConfig) {
    this.bot = bot;
    this.translator = new ActionTranslator(bot, config);
  }

  private async checkInventory(): Promise<void> {
    console.log('\n📦 Current Inventory:');
    const items = this.bot.inventory.items();
    const itemCounts: Record<string, number> = {};

    items.forEach((item) => {
      const name = item.name;
      itemCounts[name] = (itemCounts[name] || 0) + item.count;
    });

    Object.entries(itemCounts).forEach(([name, count]) => {
      console.log(`   ${name}: ${count}`);
    });
  }

  private async runExperiment(
    experiment: CraftingExperiment
  ): Promise<boolean> {
    console.log(`\n🧪 Experiment: ${experiment.name}`);
    console.log(`   ${experiment.description}`);
    console.log(
      `   Grid: ${experiment.grid_size} | Difficulty: ${experiment.difficulty}`
    );
    console.log(`   Uses crafting table: ${experiment.uses_crafting_table}`);

    try {
      // Check if we have a crafting table for 3x3 recipes
      if (experiment.uses_crafting_table) {
        const craftingTable = this.bot.findBlock({
          matching: (this.bot as any).mcData.blocksByName.crafting_table.id,
          maxDistance: 3,
        });

        if (!craftingTable) {
          console.log('   ❌ No crafting table found nearby');
          return false;
        }
        console.log('   ✅ Crafting table found');
      }

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
        console.log(`   ✅ Success! Created ${experiment.recipe}`);
        this.results.experiments_completed++;
        this.results.recipes_discovered.push(experiment.recipe);
        this.results.grid_sizes_tested.add(experiment.grid_size);

        if (experiment.uses_crafting_table) {
          this.results.crafting_table_used = true;
        }

        // Update learning progress
        if (experiment.grid_size === '2x2') {
          this.results.learning_progress['2x2_grid_understanding'] = true;
        }
        if (experiment.grid_size === '3x3') {
          this.results.learning_progress['3x3_grid_understanding'] = true;
        }
        if (experiment.uses_crafting_table) {
          this.results.learning_progress['crafting_table_usage'] = true;
        }
        this.results.learning_progress['recipe_discovery'] = true;

        return true;
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
        this.results.experiments_failed++;
        return false;
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      this.results.experiments_failed++;
      return false;
    }
  }

  private async demonstrateExperimentation(): Promise<void> {
    console.log('\n🎯 Starting Crafting Grid Experimentation Demo');
    console.log('==============================================');

    // Show initial inventory
    await this.checkInventory();

    // Run experiments in order of complexity
    for (const experiment of this.experiments) {
      await this.runExperiment(experiment);

      // Show updated inventory after each experiment
      await this.checkInventory();

      // Show learning progress
      this.showLearningProgress();

      // Small delay between experiments
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Final summary
    this.showFinalResults();
  }

  private showLearningProgress(): void {
    console.log('\n🎓 Learning Progress:');
    Object.entries(this.results.learning_progress).forEach(
      ([skill, achieved]) => {
        const status = achieved ? '✅' : '❌';
        const skillName = skill
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        console.log(`   ${status} ${skillName}`);
      }
    );
  }

  private showFinalResults(): void {
    console.log('\n📊 Final Results:');
    console.log('================');
    console.log(
      `   Experiments completed: ${this.results.experiments_completed}`
    );
    console.log(`   Experiments failed: ${this.results.experiments_failed}`);
    console.log(
      `   Recipes discovered: ${this.results.recipes_discovered.length}`
    );
    console.log(
      `   Grid sizes tested: ${Array.from(this.results.grid_sizes_tested).join(', ')}`
    );
    console.log(
      `   Crafting table used: ${this.results.crafting_table_used ? 'Yes' : 'No'}`
    );

    console.log('\n🔍 Recipes Discovered:');
    this.results.recipes_discovered.forEach((recipe) => {
      console.log(`   - ${recipe}`);
    });

    console.log('\n🎓 Skills Developed:');
    Object.entries(this.results.learning_progress).forEach(
      ([skill, achieved]) => {
        const status = achieved ? '✅' : '❌';
        const skillName = skill
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
        console.log(`   ${status} ${skillName}`);
      }
    );

    const successRate =
      this.results.experiments_completed /
      (this.results.experiments_completed + this.results.experiments_failed);
    console.log(`\n📈 Success Rate: ${(successRate * 100).toFixed(1)}%`);
  }

  async run(): Promise<void> {
    try {
      await this.demonstrateExperimentation();
    } catch (error) {
      console.error('Demo failed:', error);
    }
  }
}

// Main execution
async function main() {
  // Bot configuration
  const config: BotConfig = {
    host: 'localhost',
    port: 25565,
    username: 'CraftingDemoBot',
    version: false, // Auto-detect version
    auth: 'offline',
    pathfindingTimeout: 10000,
    actionTimeout: 8000,
    observationRadius: 16,
    autoReconnect: false,
    maxReconnectAttempts: 3,
    emergencyDisconnect: true,
  };

  // Create bot
  const bot = createBot(config);

  bot.on('spawn', async () => {
    console.log(
      '🤖 Bot spawned, starting crafting grid experimentation demo...'
    );

    const demo = new CraftingGridDemo(bot, config);
    await demo.run();

    // Disconnect after demo
    setTimeout(() => {
      bot.quit();
      process.exit(0);
    }, 2000);
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

export { CraftingGridDemo };

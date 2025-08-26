#!/usr/bin/env tsx

/**
 * Manual Bot Action Tester
 *
 * Interactive testing tool for individual bot actions
 *
 * @author @darianrosebrook
 */

import readline from 'readline';

interface ActionTemplate {
  name: string;
  description: string;
  type: string;
  parameters: Record<string, any>;
}

const actionTemplates: ActionTemplate[] = [
  {
    name: 'Move Forward',
    description: 'Move forward a specified distance',
    type: 'move_forward',
    parameters: { distance: 3 },
  },
  {
    name: 'Turn Left',
    description: 'Turn left',
    type: 'turn_left',
    parameters: {},
  },
  {
    name: 'Turn Right',
    description: 'Turn right',
    type: 'turn_right',
    parameters: {},
  },
  {
    name: 'Jump',
    description: 'Jump',
    type: 'jump',
    parameters: {},
  },
  {
    name: 'Chat Message',
    description: 'Send a chat message',
    type: 'chat',
    parameters: { message: 'Hello from bot!' },
  },
  {
    name: 'Look Around',
    description: 'Look in a random direction',
    type: 'look_at',
    parameters: { direction: 'around' },
  },
  {
    name: 'Mine Block',
    description: 'Mine a block at current position',
    type: 'mine_block',
    parameters: { position: 'current', blockType: 'dirt' },
  },
  {
    name: 'Place Torch',
    description: 'Place a torch for lighting',
    type: 'place_block',
    parameters: { block_type: 'torch', count: 1, placement: 'around_player' },
  },
  {
    name: 'Consume Food',
    description: 'Eat food to restore health/hunger',
    type: 'consume_food',
    parameters: { food_type: 'any', amount: 1 },
  },
  {
    name: 'Craft Sticks',
    description: 'Craft sticks from wood planks',
    type: 'craft_item',
    parameters: { item: 'stick', quantity: 4 },
  },
  {
    name: 'Find Shelter',
    description: 'Find or build a shelter',
    type: 'find_shelter',
    parameters: {
      shelter_type: 'cave_or_house',
      light_sources: true,
      search_radius: 10,
    },
  },
  {
    name: 'Attack Entity',
    description: 'Attack nearest entity',
    type: 'attack_entity',
    parameters: { target: 'nearest' },
  },
  {
    name: 'Collect Items',
    description: 'Collect nearby dropped items',
    type: 'collect_items',
    parameters: { radius: 5 },
  },
  {
    name: 'Scan for Trees',
    description: 'Scan for nearby trees',
    type: 'scan_for_trees',
    parameters: {},
  },
  {
    name: 'Experiment with Item',
    description: 'Experiment with an item',
    type: 'experiment_with_item',
    parameters: { item_type: 'apple', action: 'consume' },
  },
];

class ManualTester {
  private baseUrl: string;
  private rl: readline.Interface;

  constructor(baseUrl: string = 'http://localhost:3005') {
    this.baseUrl = baseUrl;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async start() {
    console.log('🎮 Manual Bot Action Tester');
    console.log(`Target: ${this.baseUrl}\n`);

    // Check if bot is connected
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      console.log('❌ Bot is not connected. Please start the bot first.');
      this.rl.close();
      return;
    }

    console.log('✅ Bot is connected and ready for testing!\n');

    await this.showMenu();
  }

  private async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) return false;

      const status = await response.json();
      return status.connected === true;
    } catch {
      return false;
    }
  }

  private async showMenu() {
    console.log('Available Actions:');
    actionTemplates.forEach((action, index) => {
      console.log(`${index + 1}. ${action.name} - ${action.description}`);
    });
    console.log('0. Exit');
    console.log('');

    this.rl.question('Select an action (0-15): ', async (answer) => {
      const choice = parseInt(answer);

      if (choice === 0) {
        console.log('👋 Goodbye!');
        this.rl.close();
        return;
      }

      if (choice >= 1 && choice <= actionTemplates.length) {
        const action = actionTemplates[choice - 1];
        await this.executeAction(action);
      } else {
        console.log('❌ Invalid choice. Please try again.\n');
      }

      // Show menu again
      await this.showMenu();
    });
  }

  private async executeAction(action: ActionTemplate) {
    console.log(`\n🚀 Executing: ${action.name}`);
    console.log(`Type: ${action.type}`);
    console.log(`Parameters: ${JSON.stringify(action.parameters, null, 2)}`);
    console.log('');

    try {
      const startTime = Date.now();

      const response = await fetch(`${this.baseUrl}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: action.type,
          parameters: action.parameters,
        }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json();
        console.log(`❌ Action failed (${duration}ms): ${errorData.message}`);
      } else {
        const result = await response.json();
        console.log(`✅ Action completed (${duration}ms)`);
        console.log(`Success: ${result.success}`);

        if (result.result) {
          console.log('Result data:');
          console.log(JSON.stringify(result.result, null, 2));
        }
      }
    } catch (error) {
      console.log(
        `❌ Action failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log('');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3005';
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
Manual Bot Action Tester

Usage: test-manual [url]

Arguments:
  url    Bot server URL (default: http://localhost:3005)

Examples:
  test-manual                           # Use default localhost:3005
  test-manual http://localhost:3005     # Specify custom URL

This tool provides an interactive menu to test individual bot actions.
Make sure the bot is connected to a Minecraft server before testing.
`);
    process.exit(0);
  }

  const tester = new ManualTester(baseUrl);
  await tester.start();
}

main();

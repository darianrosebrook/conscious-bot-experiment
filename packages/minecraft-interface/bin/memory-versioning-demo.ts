#!/usr/bin/env tsx

/**
 * Memory Versioning Demo
 *
 * Demonstrates seed-based memory isolation for different Minecraft worlds.
 * Shows how the bot maintains separate memory states for different seeds.
 *
 * @author @darianrosebrook
 */

import { MemoryIntegrationService } from '../src/memory-integration';
import { BotConfig } from '../src/types';

/**
 * Demo configuration for different worlds
 */
const demoWorlds: Array<{ name: string; seed: string; description: string }> = [
  {
    name: 'Plains World',
    seed: '12345',
    description: 'A peaceful plains world with villages',
  },
  {
    name: 'Mountain World',
    seed: '67890',
    description: 'A challenging mountain world with caves',
  },
  {
    name: 'Desert World',
    seed: '11111',
    description: 'A hot desert world with temples',
  },
];

/**
 * Demo memories for each world
 */
const demoMemories = {
  '12345': [
    {
      type: 'exploration',
      description: 'Found a village with friendly villagers',
      location: { x: 100, y: 64, z: 200 },
      timestamp: Date.now(),
      salienceScore: 0.8,
    },
    {
      type: 'learning',
      description: 'Learned that oak trees are common in plains',
      location: { x: 50, y: 64, z: 150 },
      timestamp: Date.now(),
      salienceScore: 0.6,
    },
  ],
  '67890': [
    {
      type: 'danger_encounter',
      description: 'Encountered hostile mobs in dark caves',
      location: { x: 0, y: 32, z: 0 },
      timestamp: Date.now(),
      salienceScore: 0.9,
    },
    {
      type: 'skill_improvement',
      description: 'Improved mining skills in mountain terrain',
      location: { x: 25, y: 45, z: 25 },
      timestamp: Date.now(),
      salienceScore: 0.7,
    },
  ],
  '11111': [
    {
      type: 'exploration',
      description: 'Discovered a desert temple with treasure',
      location: { x: 300, y: 64, z: 300 },
      timestamp: Date.now(),
      salienceScore: 0.9,
    },
    {
      type: 'goal_achievement',
      description: 'Successfully navigated harsh desert conditions',
      location: { x: 250, y: 64, z: 250 },
      timestamp: Date.now(),
      salienceScore: 0.8,
    },
  ],
};

/**
 * Run the memory versioning demo
 */
async function runMemoryVersioningDemo(): Promise<void> {
  console.log('🧠 Memory Versioning Demo');
  console.log('========================\n');

  for (const world of demoWorlds) {
    console.log(`🌍 Switching to: ${world.name} (Seed: ${world.seed})`);
    console.log(`📝 ${world.description}\n`);

    // Create bot config for this world
    const botConfig: BotConfig = {
      host: 'localhost',
      port: 25565,
      username: 'DemoBot',
      version: '1.21.4',
      auth: 'offline',
      worldSeed: world.seed,
      worldName: world.name,
      pathfindingTimeout: 30000,
      actionTimeout: 10000,
      observationRadius: 32,
      autoReconnect: true,
      maxReconnectAttempts: 3,
      emergencyDisconnect: false,
    };

    // Create memory integration service
    const memoryIntegration = new MemoryIntegrationService(botConfig, {
      memoryServiceUrl: 'http://localhost:3001',
      autoActivateNamespaces: true,
    });

    try {
      // Activate memory namespace for this world
      console.log('🔄 Activating memory namespace...');
      const activated = await memoryIntegration.activateWorldMemory();

      if (activated) {
        console.log('✅ Memory namespace activated successfully');

        // Get namespace information
        const namespace = await memoryIntegration.getActiveNamespace();
        console.log(`📦 Namespace ID: ${namespace?.id}`);
        console.log(`🌱 World Seed: ${namespace?.context.worldSeed}`);
        console.log(`🏷️  World Name: ${namespace?.context.worldName}`);

        // Store demo memories for this world
        console.log('💾 Storing demo memories...');
        const memories =
          demoMemories[world.seed as keyof typeof demoMemories] || [];

        for (const memory of memories) {
          const stored = await memoryIntegration.storeMemory(memory);
          if (stored) {
            console.log(`  ✅ Stored: ${memory.description}`);
          } else {
            console.log(`  ❌ Failed to store: ${memory.description}`);
          }
        }

        // Retrieve memories for this world
        console.log('🔍 Retrieving memories for this world...');
        const retrievedMemories = await memoryIntegration.retrieveMemories({
          type: 'exploration',
        });

        console.log(
          `📚 Found ${retrievedMemories.length} exploration memories in this world\n`
        );

        // Get memory statistics
        const stats = await memoryIntegration.getMemoryStats();
        if (stats) {
          console.log('📊 Memory Statistics:');
          console.log(`  Episodic memories: ${stats.episodic}`);
          console.log(`  Semantic entities: ${stats.semantic?.entities || 0}`);
          console.log(
            `  Active namespace: ${stats.versioning?.activeNamespaces || 0}`
          );
        }
      } else {
        console.log('❌ Failed to activate memory namespace');
      }
    } catch (error) {
      console.error('❌ Error during memory operations:', error);
    }

    console.log('\n' + '='.repeat(50) + '\n');
  }

  console.log('🎉 Memory Versioning Demo Complete!');
  console.log('\nKey Benefits:');
  console.log('✅ Each world maintains separate memory context');
  console.log('✅ No cross-contamination between different seeds');
  console.log('✅ Bot can learn world-specific knowledge');
  console.log('✅ Memory isolation enables focused learning');
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    await runMemoryVersioningDemo();
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  main();
}

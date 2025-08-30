/**
 * Enhanced Thought Generator Test
 *
 * Test the enhanced thought generator with improved LLM configuration.
 *
 * @author @darianrosebrook
 */

import { EnhancedThoughtGenerator } from '@conscious-bot/cognition';

async function testThoughtGenerator() {
  console.log('🧠 Testing Enhanced Thought Generator...\n');

  const thoughtGenerator = new EnhancedThoughtGenerator({
    thoughtInterval: 5000, // 5 seconds
    maxThoughtsPerCycle: 2,
    enableIdleThoughts: true,
    enableContextualThoughts: true,
    enableEventDrivenThoughts: true,
  });

  // Test context
  const testContext = {
    currentTasks: [
      {
        id: 'test-task-1',
        title: 'Explore cave system',
        status: 'active',
        progress: 0.3,
        type: 'exploration',
      },
    ],
    recentEvents: [
      {
        id: 'event-1',
        type: 'resource_found',
        timestamp: Date.now(),
        data: { resource: 'iron_ore' },
      },
      {
        id: 'event-2',
        type: 'health_change',
        timestamp: Date.now(),
        data: { change: -2 },
      },
    ],
    currentState: {
      health: 15,
      position: { x: 100, y: 64, z: 200 },
      inventory: [
        { name: 'iron_ore', count: 5, displayName: 'Iron Ore' },
        { name: 'stone_pickaxe', count: 1, displayName: 'Stone Pickaxe' },
        { name: 'torch', count: 8, displayName: 'Torch' },
      ],
    },
    emotionalState: 'cautious',
  };

  console.log('Generating thoughts with context...');

  for (let i = 0; i < 3; i++) {
    try {
      console.log(`\n--- Thought ${i + 1} ---`);
      const thought = await thoughtGenerator.generateThought(testContext);

      if (thought) {
        console.log(`✅ Generated: ${thought.content.substring(0, 150)}...`);
        console.log(`   Type: ${thought.type}`);
        console.log(`   Category: ${thought.category}`);
        console.log(`   Confidence: ${thought.context.confidence}`);
        console.log(`   System: ${thought.context.cognitiveSystem}`);
      } else {
        console.log('❌ No thought generated');
      }
    } catch (error) {
      console.log(
        `❌ Error generating thought: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  console.log('\n🎯 Thought Generator Test completed!');
}

// Run the test
testThoughtGenerator().catch(console.error);

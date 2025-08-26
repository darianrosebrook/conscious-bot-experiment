#!/usr/bin/env tsx

/**
 * Simple Integration Test
 *
 * Tests the basic HybridHRMArbiter functionality without requiring
 * a full Minecraft connection.
 *
 * @author @darianrosebrook
 */

import { HybridHRMArbiter, HRMSignal } from '@conscious-bot/core';

// Mock bot for testing
const mockBot = {
  entity: { position: { x: 100, y: 64, z: 100 } },
  health: 20,
  food: 20,
  world: {
    getLight: () => 15,
    getBiome: () => ({ name: 'plains' }),
  },
  time: { timeOfDay: 6000 },
  inventory: {
    items: () => [
      { name: 'bread', count: 5, slot: 0 },
      { name: 'wooden_pickaxe', count: 1, slot: 1 },
    ],
    slots: { length: 36 },
    emptySlotCount: () => 30,
  },
  entities: {},
  quickBarSlot: 0,
  // Add mock methods for leaf operations
  pathfinder: {
    goto: async () => ({ success: true }),
  },
  moveTo: async () => ({ success: true }),
  dig: async () => ({ success: true }),
  placeBlock: async () => ({ success: true }),
  chat: async () => ({ success: true }),
  wait: async () => ({ success: true }),
  getLight: () => 15,
  getBiome: () => ({ name: 'plains' }),
};

/**
 * Test the basic arbiter functionality
 */
async function testBasicArbiter() {
  console.log('🧠 Simple Integration Test');
  console.log('==========================\n');

  try {
    // Create arbiter with mock HRM config
    const arbiter = new HybridHRMArbiter({
      serverUrl: 'http://localhost',
      port: 5001,
    });

    console.log('✅ Arbiter created successfully');

    // Test initialization
    console.log('🚀 Testing initialization...');
    const initialized = await arbiter.initialize();

    if (initialized) {
      console.log('✅ Arbiter initialized successfully');
    } else {
      console.log('⚠️ Arbiter initialization failed (expected for mock)');
    }

    // Test signal processing
    console.log('\n📡 Testing signal processing...');

    const testSignal: HRMSignal = {
      id: 'test-1',
      name: 'threatProximity',
      value: 0.8,
      trend: 0.1,
      confidence: 0.9,
      provenance: 'env',
      timestamp: Date.now(),
    };

    // Create a simple context with mock bot
    const context = {
      bot: mockBot,
      snapshot: async () => ({
        position: { x: 100, y: 64, z: 100 },
        health: 20,
        food: 20,
        lightLevel: 15,
        time: 6000,
        weather: 'clear',
        biome: 'plains',
        inventory: {
          items: [
            { name: 'bread', count: 5 },
            { name: 'wooden_pickaxe', count: 1 },
          ],
        },
        nearbyHostiles: [],
        nearbyEntities: [],
      }),
      emitMetric: (name: string, value: number) => {
        console.log(`📊 Metric: ${name} = ${value}`);
      },
    };

    const startTime = performance.now();
    const goals = await arbiter.processHRMSignal(testSignal, context as any);
    const totalTime = performance.now() - startTime;

    console.log(`📊 Signal processing completed in ${totalTime.toFixed(1)}ms`);
    console.log(`🎯 Generated ${goals.length} goals`);

    for (const goal of goals) {
      console.log(
        `   - ${goal.template.name} (priority: ${goal.priority.toFixed(2)})`
      );
      console.log(`     Need: ${goal.template.needType}`);
      console.log(`     Feasible: ${goal.feasibility.ok ? 'Yes' : 'No'}`);
      if (goal.plan) {
        console.log(`     Plan: Generated`);
      }
      if (goal.executionResult) {
        const result = goal.executionResult;
        console.log(
          `     Execution: ${result.success ? '✅ Success' : '❌ Failed'}`
        );
        if (result.actions && result.actions.length > 0) {
          console.log(`     Actions: ${result.actions.join(', ')}`);
        }
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
      }
    }

    // Test optimization stats
    console.log('\n🔧 Testing optimization stats...');
    try {
      const stats = arbiter.getOptimizationStats();
      console.log('📊 Optimization Stats:', stats);
    } catch (error) {
      console.log('⚠️ Optimization stats not available:', error);
    }

    console.log('\n✅ Simple integration test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testBasicArbiter().catch(console.error);
}

export { testBasicArbiter };

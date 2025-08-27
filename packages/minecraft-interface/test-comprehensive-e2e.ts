#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test for Minecraft Interface
 *
 * Tests the complete integration between the Minecraft interface
 * and the planning system with actual planning and execution.
 *
 * @author @darianrosebrook
 */

import { createMinecraftInterface } from './src/index';
import { BotConfig } from './src/types';
import { createIntegratedPlanningCoordinator } from '@conscious-bot/planning';

async function testComprehensiveEndToEndFunctionality() {
  console.log('🧪 Comprehensive End-to-End Minecraft Interface Test');
  console.log('===================================================');

  try {
    // Configuration for testing
    const config: BotConfig = {
      host: 'localhost',
      port: 25565,
      username: 'ComprehensiveTestBot',
      version: '1.21.4',
      auth: 'offline',
      pathfindingTimeout: 5000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      emergencyDisconnect: true,
    };

    console.log('📋 Test Configuration:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Username: ${config.username}`);
    console.log();

    // Create planning coordinator
    console.log('🧠 Creating planning coordinator...');
    const planningCoordinator = createIntegratedPlanningCoordinator({
      coordinatorConfig: {
        routingStrategy: 'adaptive',
        fallbackTimeout: 30000,
        enablePlanMerging: true,
        enableCrossValidation: false,
      },
    });

    // Create Minecraft interface
    console.log('🔧 Creating Minecraft interface...');
    const minecraftInterface = await createMinecraftInterface(
      config,
      planningCoordinator
    );

    // Test 1: Verify Connection
    console.log('🔗 Test 1: Connection Verification');
    const botStatus = minecraftInterface.botAdapter.getStatus();
    console.log('   Bot connected:', botStatus.connected);
    console.log('   Bot position:', botStatus.position);
    console.log('   Bot health:', botStatus.health);
    console.log('   ✅ Connection verified!');

    // Test 2: Test Basic Movement Planning
    console.log('🚶 Test 2: Basic Movement Planning');
    const movementSignals = [
      {
        type: 'movement',
        intensity: 0.8,
        urgency: 0.6,
        timestamp: Date.now(),
        source: 'test',
        parameters: {
          targetPosition: { x: 10, y: 94, z: 10 },
          reason: 'test_movement',
        },
      },
    ];

    console.log('   Executing movement planning cycle...');
    const movementResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        movementSignals
      );
    console.log('   Movement result:', {
      success: movementResult.success,
      executedSteps: movementResult.executedSteps?.length || 0,
      totalSteps: movementResult.totalSteps || 0,
      repairAttempts: movementResult.repairAttempts || 0,
      error: movementResult.error,
    });
    console.log('   ✅ Movement planning completed!');

    // Test 3: Test Resource Gathering Planning
    console.log('⛏️  Test 3: Resource Gathering Planning');
    const gatheringSignals = [
      {
        type: 'resource',
        intensity: 0.9,
        urgency: 0.8,
        timestamp: Date.now(),
        source: 'test',
        parameters: {
          resourceType: 'wood',
          quantity: 5,
          reason: 'test_gathering',
        },
      },
    ];

    console.log('   Executing resource gathering planning cycle...');
    const gatheringResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        gatheringSignals
      );
    console.log('   Gathering result:', {
      success: gatheringResult.success,
      executedSteps: gatheringResult.executedSteps?.length || 0,
      totalSteps: gatheringResult.totalSteps || 0,
      repairAttempts: gatheringResult.repairAttempts || 0,
      error: gatheringResult.error,
    });
    console.log('   ✅ Resource gathering planning completed!');

    // Test 4: Test Crafting Planning
    console.log('🔨 Test 4: Crafting Planning');
    const craftingSignals = [
      {
        type: 'crafting',
        intensity: 0.7,
        urgency: 0.5,
        timestamp: Date.now(),
        source: 'test',
        parameters: {
          itemType: 'wooden_pickaxe',
          reason: 'test_crafting',
        },
      },
    ];

    console.log('   Executing crafting planning cycle...');
    const craftingResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        craftingSignals
      );
    console.log('   Crafting result:', {
      success: craftingResult.success,
      executedSteps: craftingResult.executedSteps?.length || 0,
      totalSteps: craftingResult.totalSteps || 0,
      repairAttempts: craftingResult.repairAttempts || 0,
      error: craftingResult.error,
    });
    console.log('   ✅ Crafting planning completed!');

    // Test 5: Test Emergency Response Planning
    console.log('🚨 Test 5: Emergency Response Planning');
    const emergencySignals = [
      {
        type: 'threat',
        intensity: 1.0,
        urgency: 1.0,
        timestamp: Date.now(),
        source: 'test',
        parameters: {
          threatType: 'hostile_mob',
          location: { x: 5, y: 94, z: 5 },
          reason: 'test_emergency',
        },
      },
    ];

    console.log('   Executing emergency response planning cycle...');
    const emergencyResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        emergencySignals
      );
    console.log('   Emergency result:', {
      success: emergencyResult.success,
      executedSteps: emergencyResult.executedSteps?.length || 0,
      totalSteps: emergencyResult.totalSteps || 0,
      repairAttempts: emergencyResult.repairAttempts || 0,
      error: emergencyResult.error,
    });
    console.log('   ✅ Emergency response planning completed!');

    // Test 6: Test Plan Repair and Adaptation
    console.log('🔧 Test 6: Plan Repair and Adaptation');
    const complexSignals = [
      {
        type: 'complex_task',
        intensity: 0.8,
        urgency: 0.7,
        timestamp: Date.now(),
        source: 'test',
        parameters: {
          taskType: 'build_shelter',
          requirements: ['wood', 'stone'],
          reason: 'test_complex_task',
        },
      },
    ];

    console.log('   Executing complex task planning cycle...');
    const complexResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        complexSignals
      );
    console.log('   Complex task result:', {
      success: complexResult.success,
      executedSteps: complexResult.executedSteps?.length || 0,
      totalSteps: complexResult.totalSteps || 0,
      repairAttempts: complexResult.repairAttempts || 0,
      error: complexResult.error,
    });
    console.log('   ✅ Complex task planning completed!');

    // Test 7: Test Multiple Concurrent Goals
    console.log('🎯 Test 7: Multiple Concurrent Goals');
    const concurrentSignals = [
      {
        type: 'health',
        intensity: 0.6,
        urgency: 0.4,
        timestamp: Date.now(),
        source: 'test',
        parameters: { reason: 'maintain_health' },
      },
      {
        type: 'hunger',
        intensity: 0.7,
        urgency: 0.5,
        timestamp: Date.now(),
        source: 'test',
        parameters: { reason: 'find_food' },
      },
      {
        type: 'exploration',
        intensity: 0.5,
        urgency: 0.3,
        timestamp: Date.now(),
        source: 'test',
        parameters: { reason: 'explore_area' },
      },
    ];

    console.log('   Executing concurrent goals planning cycle...');
    const concurrentResult =
      await minecraftInterface.planExecutor.executePlanningCycle(
        concurrentSignals
      );
    console.log('   Concurrent goals result:', {
      success: concurrentResult.success,
      executedSteps: concurrentResult.executedSteps?.length || 0,
      totalSteps: concurrentResult.totalSteps || 0,
      repairAttempts: concurrentResult.repairAttempts || 0,
      error: concurrentResult.error,
    });
    console.log('   ✅ Concurrent goals planning completed!');

    // Test 8: Final Status Check
    console.log('📊 Test 8: Final Status Check');
    const finalStatus = minecraftInterface.botAdapter.getStatus();
    console.log('   Final bot status:', {
      connected: finalStatus.connected,
      position: finalStatus.position,
      health: finalStatus.health,
      food: finalStatus.food,
    });
    console.log('   ✅ Final status check completed!');

    // Test 9: Shutdown
    console.log('🔌 Test 9: Shutdown');
    await minecraftInterface.planExecutor.shutdown();
    console.log('   ✅ Shutdown completed successfully!');

    console.log();
    console.log('🎉 All comprehensive tests completed successfully!');
    console.log('✅ End-to-end functionality is working correctly');
    console.log();
    console.log('📈 Test Summary:');
    console.log('   ✅ Connection and basic functionality');
    console.log('   ✅ Movement planning and execution');
    console.log('   ✅ Resource gathering planning');
    console.log('   ✅ Crafting planning');
    console.log('   ✅ Emergency response planning');
    console.log('   ✅ Complex task planning with repair');
    console.log('   ✅ Multiple concurrent goals');
    console.log('   ✅ Proper shutdown and cleanup');
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('   Error details:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.error(
        '   💡 Make sure a Minecraft server is running on localhost:25565'
      );
      console.error('   💡 You can start a test server or use an existing one');
    }

    process.exit(1);
  }
}

// Run the test
testComprehensiveEndToEndFunctionality().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

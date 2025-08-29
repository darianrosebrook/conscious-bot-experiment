/**
 * Test Planning Validation
 *
 * This script tests that the planning system properly validates task execution
 * instead of always reporting success when the bot hasn't actually performed actions.
 *
 * @author @darianrosebrook
 */

import { EnhancedReactiveExecutor } from './reactive-executor/enhanced-reactive-executor.js';

async function testPlanningValidation() {
  console.log('🧪 Test Planning Validation\n');

  const executor = new EnhancedReactiveExecutor();

  // Test 1: Craft task when bot is not connected
  console.log('🎯 Test 1: Craft task when bot is not connected');
  const craftTask = {
    id: 'test-craft-1',
    type: 'craft',
    description: 'Craft wooden pickaxe for resource gathering',
    parameters: { item: 'wooden_pickaxe', quantity: 1 },
  };

  const craftResult = await executor.executeTask(craftTask);
  console.log('Craft result:', {
    success: craftResult.success,
    error: craftResult.error,
    type: craftResult.data?.type,
  });

  // Test 2: Move task when bot is not connected
  console.log('\n🎯 Test 2: Move task when bot is not connected');
  const moveTask = {
    id: 'test-move-1',
    type: 'move',
    description: 'Move forward 5 blocks',
    parameters: { distance: 5 },
  };

  const moveResult = await executor.executeTask(moveTask);
  console.log('Move result:', {
    success: moveResult.success,
    error: moveResult.error,
    type: moveResult.data?.type,
  });

  // Test 3: Gather task when bot is not connected
  console.log('\n🎯 Test 3: Gather task when bot is not connected');
  const gatherTask = {
    id: 'test-gather-1',
    type: 'gather',
    description: 'Gather wood from nearby trees',
    parameters: { resource: 'wood', amount: 5 },
  };

  const gatherResult = await executor.executeTask(gatherTask);
  console.log('Gather result:', {
    success: gatherResult.success,
    error: gatherResult.error,
    type: gatherResult.data?.type,
  });

  // Test 4: Unknown task type
  console.log('\n🎯 Test 4: Unknown task type');
  const unknownTask = {
    id: 'test-unknown-1',
    type: 'unknown_action',
    description: 'Unknown action type',
    parameters: { test: 'value' },
  };

  const unknownResult = await executor.executeTask(unknownTask);
  console.log('Unknown task result:', {
    success: unknownResult.success,
    error: unknownResult.error,
    type: unknownResult.data?.type,
  });

  // Summary
  console.log('\n📊 Test Summary:');
  console.log(`Craft task success: ${craftResult.success} (expected: false)`);
  console.log(`Move task success: ${moveResult.success} (expected: false)`);
  console.log(`Gather task success: ${gatherResult.success} (expected: false)`);
  console.log(
    `Unknown task success: ${unknownResult.success} (expected: false)`
  );

  const allFailed =
    !craftResult.success &&
    !moveResult.success &&
    !gatherResult.success &&
    !unknownResult.success;
  console.log(
    `\n✅ All tests failed as expected: ${allFailed ? 'PASS' : 'FAIL'}`
  );

  if (allFailed) {
    console.log('🎉 Planning validation is working correctly!');
    console.log(
      '   Tasks are now properly validated instead of always reporting success.'
    );
  } else {
    console.log('❌ Planning validation is still not working correctly.');
    console.log(
      '   Some tasks are still reporting success when they should fail.'
    );
  }
}

// Run the test
testPlanningValidation().catch(console.error);

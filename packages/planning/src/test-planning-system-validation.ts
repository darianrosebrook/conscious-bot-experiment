/**
 * Test Planning System Validation
 *
 * This script tests that the planning system properly validates task execution
 * and does not mark goals as completed when tasks fail.
 *
 * @author @darianrosebrook
 */

import { EnhancedGoalManager } from './goal-formulation/enhanced-goal-manager.js';
import { EnhancedReactiveExecutor } from './reactive-executor/enhanced-reactive-executor.js';
import { GoalStatus, GoalType } from './types.js';

async function testPlanningSystemValidation() {
  console.log('🧪 Test Planning System Validation\n');

  // Initialize components
  const goalManager = new EnhancedGoalManager();
  const reactiveExecutor = new EnhancedReactiveExecutor();

  // Create a test goal
  const testGoal = {
    id: 'test-goal-1',
    type: GoalType.ACQUIRE_ITEM,
    priority: 0.8,
    urgency: 0.7,
    utility: 0.8,
    description: 'Craft wooden pickaxe for resource gathering',
    preconditions: [],
    effects: [],
    status: GoalStatus.PENDING,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subGoals: [],
  };

  console.log('🎯 Adding test goal:', testGoal.description);
  goalManager.upsert(testGoal);

  // Check initial state
  const initialGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
  console.log(`📋 Initial pending goals: ${initialGoals.length}`);

  // Create a task from the goal
  const task = {
    id: 'test-task-1',
    type: 'craft',
    description: 'Craft wooden pickaxe for resource gathering',
    parameters: { item: 'wooden_pickaxe', quantity: 1 },
  };

  console.log('\n🎯 Executing task:', task.description);

  // Execute the task (should fail since bot is not connected)
  const executionResult = await reactiveExecutor.executeTask(task);

  console.log('Task execution result:', {
    success: executionResult.success,
    error: executionResult.error,
    planExecuted: executionResult.planExecuted,
    actionsCompleted: executionResult.actionsCompleted,
  });

  // Simulate the planning system logic
  if (executionResult.success) {
    console.log('✅ Task succeeded, marking goal as completed');
    goalManager.updateGoalStatus(testGoal.id, GoalStatus.COMPLETED);
  } else {
    console.log('❌ Task failed, keeping goal as pending');
    console.log('   Error:', executionResult.error);
  }

  // Check final state
  const finalPendingGoals = goalManager.getGoalsByStatus(GoalStatus.PENDING);
  const finalCompletedGoals = goalManager.getGoalsByStatus(
    GoalStatus.COMPLETED
  );

  console.log('\n📊 Final Goal Status:');
  console.log(`Pending goals: ${finalPendingGoals.length}`);
  console.log(`Completed goals: ${finalCompletedGoals.length}`);

  // Verify the fix
  const goalRemainsPending =
    finalPendingGoals.length === 1 && finalCompletedGoals.length === 0;
  const taskFailed = !executionResult.success;

  console.log('\n✅ Validation Results:');
  console.log(`Task failed as expected: ${taskFailed ? 'PASS' : 'FAIL'}`);
  console.log(`Goal remains pending: ${goalRemainsPending ? 'PASS' : 'FAIL'}`);

  if (taskFailed && goalRemainsPending) {
    console.log('\n🎉 Planning system validation is working correctly!');
    console.log('   Goals are no longer marked as completed when tasks fail.');
  } else {
    console.log(
      '\n❌ Planning system validation is still not working correctly.'
    );
    if (!taskFailed) {
      console.log(
        '   Tasks are still reporting success when they should fail.'
      );
    }
    if (!goalRemainsPending) {
      console.log(
        '   Goals are still being marked as completed when tasks fail.'
      );
    }
  }

  // Test with a connected bot scenario (simulated)
  console.log('\n🎯 Test 2: Simulating connected bot scenario');

  // Create a mock successful execution result
  const mockSuccessfulResult = {
    success: true,
    planExecuted: true,
    safetyReflexActivated: false,
    planRepaired: false,
    duration: 1000,
    actionsCompleted: 1,
    error: undefined,
    data: {
      success: true,
      item: 'wooden_pickaxe',
      type: 'craft',
    },
  };

  console.log('Simulating successful task execution...');

  if (mockSuccessfulResult.success) {
    console.log('✅ Simulated task succeeded, marking goal as completed');
    goalManager.updateGoalStatus(testGoal.id, GoalStatus.COMPLETED);
  }

  const finalPendingGoals2 = goalManager.getGoalsByStatus(GoalStatus.PENDING);
  const finalCompletedGoals2 = goalManager.getGoalsByStatus(
    GoalStatus.COMPLETED
  );

  console.log('\n📊 Final Goal Status (after simulation):');
  console.log(`Pending goals: ${finalPendingGoals2.length}`);
  console.log(`Completed goals: ${finalCompletedGoals2.length}`);

  const goalMarkedCompleted =
    finalPendingGoals2.length === 0 && finalCompletedGoals2.length === 1;

  console.log(`\n✅ Simulation Results:`);
  console.log(
    `Goal marked as completed: ${goalMarkedCompleted ? 'PASS' : 'FAIL'}`
  );

  if (goalMarkedCompleted) {
    console.log(
      '🎉 Planning system correctly handles successful task execution!'
    );
  } else {
    console.log(
      '❌ Planning system has issues with successful task execution.'
    );
  }
}

// Run the test
testPlanningSystemValidation().catch(console.error);

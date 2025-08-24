/**
 * Test script to verify task validation fix
 *
 * This script tests the actual server endpoints to ensure that
 * task validation is now working correctly and tasks are not failing.
 *
 * @author @darianrosebrook
 */

import fetch from 'node-fetch';

async function testTaskValidation() {
  console.log('🧪 Testing task validation fix...\n');

  try {
    // Test 1: Check server health
    console.log('1. Checking server health...');
    const healthResponse = await fetch('http://localhost:3002/health');
    const healthData = await healthResponse.json();
    console.log(`   ✅ Server is healthy: ${healthData.status}`);
    console.log(
      `   📊 System: ${healthData.system}, Version: ${healthData.version}\n`
    );

    // Test 2: Check current state
    console.log('2. Checking current planning system state...');
    const stateResponse = await fetch('http://localhost:3002/state');
    const stateData = await stateResponse.json();
    console.log(
      `   📋 Current goals: ${stateData.goalFormulation?.currentGoals?.length || 0}`
    );
    console.log(
      `   📝 Active goals: ${stateData.goalFormulation?.activeGoals?.length || 0}`
    );
    console.log(
      `   🔄 Current tasks: ${stateData.goalFormulation?.currentTasks?.length || 0}`
    );
    console.log(
      `   ✅ Completed tasks: ${stateData.goalFormulation?.completedTasks?.length || 0}`
    );
    console.log(
      `   ❌ Failed task count: ${stateData.goalFormulation?.failedTaskCount || 0}\n`
    );

    // Test 3: Trigger autonomous task execution
    console.log('3. Triggering autonomous task execution...');
    const executeResponse = await fetch('http://localhost:3002/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autonomous: true }),
    });

    if (executeResponse.ok) {
      const executeData = await executeResponse.json();
      console.log(
        `   ✅ Task execution triggered: ${executeData.message || 'Success'}`
      );

      if (executeData.task) {
        console.log(`   📋 Task ID: ${executeData.task.id}`);
        console.log(`   🎯 Task Type: ${executeData.task.type}`);
        console.log(`   📝 Description: ${executeData.task.description}`);
        console.log(`   🏷️  Status: ${executeData.task.status}`);
      }
    } else {
      console.log(
        `   ❌ Task execution failed: ${executeResponse.status} ${executeResponse.statusText}`
      );
    }

    // Test 4: Wait a moment and check state again
    console.log('\n4. Waiting for task execution to complete...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const stateResponse2 = await fetch('http://localhost:3002/state');
    const stateData2 = await stateResponse2.json();

    console.log(`   📊 Updated state:`);
    console.log(
      `      - Current tasks: ${stateData2.goalFormulation?.currentTasks?.length || 0}`
    );
    console.log(
      `      - Completed tasks: ${stateData2.goalFormulation?.completedTasks?.length || 0}`
    );
    console.log(
      `      - Failed task count: ${stateData2.goalFormulation?.failedTaskCount || 0}`
    );

    // Test 5: Check if tasks are completing successfully
    const completedTasks = stateData2.goalFormulation?.completedTasks || [];
    const failedTaskCount = stateData2.goalFormulation?.failedTaskCount || 0;

    if (completedTasks.length > 0) {
      console.log(`\n   ✅ SUCCESS: Tasks are completing successfully!`);
      console.log(`      - Completed tasks: ${completedTasks.length}`);
      console.log(`      - Failed task count: ${failedTaskCount}`);

      // Show details of completed tasks
      completedTasks.forEach((task, index) => {
        console.log(
          `      ${index + 1}. ${task.type} - ${task.description} (${task.status})`
        );
      });
    } else if (failedTaskCount === 0) {
      console.log(`\n   ⚠️  No tasks completed yet, but no failures either.`);
    } else {
      console.log(`\n   ❌ ISSUE: Tasks are still failing.`);
      console.log(`      - Failed task count: ${failedTaskCount}`);
    }

    // Test 6: Check recent logs for validation messages
    console.log('\n5. Checking for validation-related log messages...');
    console.log('   📋 Look for these patterns in the server logs:');
    console.log('      ✅ "Task completed successfully"');
    console.log('      ❌ "Task validation failed" (should be rare now)');
    console.log('      ✅ "Cognitive feedback: Successfully completed"');
  } catch (error) {
    console.error('❌ Error testing task validation:', error.message);
  }
}

// Run the test
testTaskValidation()
  .then(() => {
    console.log('\n🎉 Task validation test completed!');
    console.log('\n💡 To see real-time logs, check the server output.');
    console.log(
      '   The fix should show tasks completing successfully instead of failing validation.'
    );
  })
  .catch((error) => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });

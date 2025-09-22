/**
 * Test script to verify thought-to-task conversion
 * @author @darianrosebrook
 */

async function testThoughtToTaskConversion() {
  console.log('🧪 Testing thought-to-task conversion...');

  try {
    // Test 1: Check if we can get recent thoughts
    console.log('\n📋 Testing: Get recent thoughts');
    const recentResponse = await fetch(
      'http://localhost:3000/api/cognitive-stream/recent',
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (recentResponse.ok) {
      const recentData = await recentResponse.json();
      console.log(`✅ Got ${recentData.count} recent thoughts`);
      console.log(
        'Sample thought:',
        recentData.thoughts[0]?.content?.substring(0, 50) + '...'
      );
    } else {
      console.log(
        '❌ Failed to get recent thoughts:',
        recentResponse.statusText
      );
    }

    // Test 2: Check if we can get actionable thoughts
    console.log('\n🎯 Testing: Get actionable thoughts');
    const actionableResponse = await fetch(
      'http://localhost:3001/api/tasks/actionable',
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (actionableResponse.ok) {
      const actionableData = await actionableResponse.json();
      console.log(`✅ Got ${actionableData.length} actionable thoughts`);
      actionableData.forEach((thought, index) => {
        console.log(`  ${index + 1}. ${thought.content.substring(0, 50)}...`);
      });
    } else {
      console.log(
        '❌ Failed to get actionable thoughts:',
        actionableResponse.statusText
      );
    }

    // Test 3: Check if planning system has tasks
    console.log('\n📊 Testing: Check planning system tasks');
    const tasksResponse = await fetch('http://localhost:3002/api/tasks', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (tasksResponse.ok) {
      const tasksData = await tasksResponse.json();
      console.log(`✅ Planning system has ${tasksData.length} tasks`);
      tasksData.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.title} (${task.status})`);
      });
    } else {
      console.log('❌ Failed to get planning tasks:', tasksResponse.statusText);
    }

    console.log('\n✨ Test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testThoughtToTaskConversion().catch(console.error);

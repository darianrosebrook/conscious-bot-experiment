/**
 * Test Crafting Fix
 * 
 * This script tests the fixed crafting functionality to ensure
 * that crafting tasks can now be executed successfully.
 * 
 * @author @darianrosebrook
 */

import axios from 'axios';

async function testCraftingFix() {
  console.log('🧪 Testing Crafting Fix\n');

  try {
    // Test 1: Check if planning server is running
    console.log('1. Checking planning server status...');
    const statusResponse = await axios.get('http://localhost:3002/mcp/status');
    console.log('✅ Planning server status:', statusResponse.data);

    // Test 2: Add a crafting task
    console.log('\n2. Adding crafting task...');
    const addTaskResponse = await axios.post('http://localhost:3002/task', {
      title: 'Test Craft Wooden Pickaxe',
      description: 'Craft a wooden pickaxe for testing',
      type: 'crafting',
      priority: 1,
      parameters: {
        item: 'wooden_pickaxe',
        quantity: 1
      }
    });
    console.log('✅ Task added:', addTaskResponse.data);

    // Test 3: Check if Minecraft interface is working
    console.log('\n3. Testing Minecraft interface crafting...');
    const craftResponse = await axios.post('http://localhost:3005/action', {
      type: 'craft_item',
      parameters: {
        item: 'wooden_pickaxe',
        quantity: 1
      }
    });
    console.log('✅ Minecraft crafting result:', craftResponse.data);

    console.log('\n🎉 Crafting fix test completed successfully!');
    console.log('The crafting system should now work properly.');

  } catch (error) {
    console.error(
      '❌ Crafting fix test failed:',
      error.response?.data || error.message
    );
  }
}

// Run the test
testCraftingFix().catch(console.error);

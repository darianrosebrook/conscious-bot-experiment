#!/usr/bin/env tsx

/**
 * Test mineflayer-pathfinder import issue
 */

console.log('🔧 Testing mineflayer-pathfinder imports...');

try {
  // Test 1: CommonJS require
  console.log('\n📦 Test 1: CommonJS require');
  const pathfinderCJS = require('mineflayer-pathfinder');
  console.log('✅ CommonJS pathfinder:', Object.keys(pathfinderCJS));

  if (pathfinderCJS.goals) {
    console.log('✅ CommonJS goals:', Object.keys(pathfinderCJS.goals));
  } else {
    console.log('❌ CommonJS goals not found');
  }

  // Test 2: ES Module import
  console.log('\n📦 Test 2: ES Module import');
  import('mineflayer-pathfinder')
    .then((pathfinderESM) => {
      console.log('✅ ESM pathfinder:', Object.keys(pathfinderESM));

      if (pathfinderESM.goals) {
        console.log('✅ ESM goals:', Object.keys(pathfinderESM.goals));
      } else {
        console.log('❌ ESM goals not found');
      }
    })
    .catch((error) => {
      console.log('❌ ESM import failed:', error.message);
    });

  // Test 3: Destructured import
  console.log('\n📦 Test 3: Destructured import');
  const { pathfinder, goals, Movements } = require('mineflayer-pathfinder');
  console.log('✅ Destructured pathfinder:', typeof pathfinder);
  console.log('✅ Destructured goals:', typeof goals);
  console.log('✅ Destructured Movements:', typeof Movements);

  if (goals) {
    console.log('✅ Destructured goals keys:', Object.keys(goals));
  }

  // Test 4: Check specific goal classes
  console.log('\n📦 Test 4: Specific goal classes');
  if (goals.GoalBlock) {
    console.log('✅ GoalBlock available');
  } else {
    console.log('❌ GoalBlock not found');
  }

  if (goals.GoalNear) {
    console.log('✅ GoalNear available');
  } else {
    console.log('❌ GoalNear not found');
  }
} catch (error) {
  console.error('❌ Import test failed:', error);
}

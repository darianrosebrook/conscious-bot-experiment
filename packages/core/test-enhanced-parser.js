/**
 * Simple test script for Enhanced Task Parser
 * 
 * This script demonstrates the key functionality of the Enhanced Task Parser
 * without requiring complex module resolution.
 */

import { TaskParser, EnvironmentalImmersion } from './dist/src/enhanced-task-parser/index.js';

async function testEnhancedTaskParser() {
  console.log('=== Enhanced Task Parser Test ===\n');

  // Initialize components
  const taskParser = new TaskParser({
    enable_validation: true,
    enable_feasibility_check: true,
    debug_mode: true,
  });

  const environmentalImmersion = new EnvironmentalImmersion();

  // Test 1: Parse JSON task
  console.log('1. Testing JSON Task Parsing:');
  const jsonTask = JSON.stringify({
    type: 'gathering',
    parameters: {
      resource: 'cobblestone',
      quantity: 64,
      tool_required: 'pickaxe'
    },
    priority: 0.8,
    safety_level: 'safe'
  });

  const environmentalContext = {
    time_of_day: 'day',
    weather: 'clear',
    biome: 'plains',
    light_level: 15,
    threat_level: 0.1,
    nearby_entities: [],
    resource_availability: {
      pickaxe: {
        available: true,
        quantity: 1,
        location: 'inventory',
        last_seen: Date.now(),
        confidence: 1.0,
      },
      cobblestone: {
        available: true,
        quantity: 0,
        location: 'nearby',
        last_seen: Date.now(),
        confidence: 0.8,
      }
    },
    social_context: {
      nearby_players: [],
      nearby_villagers: [],
      chat_activity: false,
    },
    timestamp: Date.now(),
  };

  try {
    const result = await taskParser.parseLLMOutput(jsonTask, environmentalContext);
    console.log('✅ JSON task parsed successfully:');
    console.log(`   Type: ${result.task.type}`);
    console.log(`   Resource: ${result.task.parameters.resource}`);
    console.log(`   Quantity: ${result.task.parameters.quantity}`);
    console.log(`   Valid: ${result.validation.is_valid}`);
    console.log(`   Feasible: ${result.feasibility.is_feasible}\n`);
  } catch (error) {
    console.error('❌ Failed to parse JSON task:', error.message);
  }

  // Test 2: Parse natural language
  console.log('2. Testing Natural Language Parsing:');
  const naturalTask = 'I need to gather 32 cobblestone urgently for building';
  
  try {
    const result = await taskParser.parseLLMOutput(naturalTask, environmentalContext);
    console.log('✅ Natural language task parsed successfully:');
    console.log(`   Type: ${result.task.type}`);
    console.log(`   Resource: ${result.task.parameters.resource}`);
    console.log(`   Quantity: ${result.task.parameters.quantity}`);
    console.log(`   Priority: ${result.task.priority}\n`);
  } catch (error) {
    console.error('❌ Failed to parse natural language task:', error.message);
  }

  // Test 3: Environmental context
  console.log('3. Testing Environmental Context:');
  const worldState = {
    time: 18000, // Night
    weather: 'storm',
    biome: 'forest',
    light_level: 3,
    position: { x: 100, y: 64, z: 200 },
    entities: [
      {
        id: 'creeper-1',
        type: 'creeper',
        position: { x: 101, y: 64, z: 200 },
        is_hostile: true
      }
    ],
    inventory: [{ name: 'stone_pickaxe', quantity: 1 }],
    nearby_blocks: [],
    chat_messages: []
  };

  const context = environmentalImmersion.updateContext(worldState);
  console.log('✅ Environmental context created:');
  console.log(`   Time of day: ${context.time_of_day}`);
  console.log(`   Weather: ${context.weather}`);
  console.log(`   Threat level: ${context.threat_level}`);
  console.log(`   Nearby entities: ${context.nearby_entities.length}\n`);

  // Test 4: Behavior adaptations
  console.log('4. Testing Behavior Adaptations:');
  const adaptations = environmentalImmersion.getBehaviorAdaptations(context);
  console.log('✅ Behavior adaptations:');
  console.log(`   Adaptations: ${adaptations.adaptations.join(', ')}`);
  console.log(`   Priority: ${adaptations.priority}`);
  console.log(`   Reasoning: ${adaptations.reasoning}\n`);

  // Test 5: Performance metrics
  console.log('5. Testing Performance Metrics:');
  const metrics = taskParser.getPerformanceMetrics();
  console.log('✅ Performance metrics:');
  console.log(`   Parsing time: ${metrics.parsing_time}ms`);
  console.log(`   Validation time: ${metrics.validation_time}ms`);
  console.log(`   Feasibility time: ${metrics.feasibility_time}ms`);
  console.log(`   Success rate: ${(metrics.success_rate * 100).toFixed(1)}%\n`);

  console.log('=== Test Complete ===');
}

// Run the test
testEnhancedTaskParser().catch(console.error);

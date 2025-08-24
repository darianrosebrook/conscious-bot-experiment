/**
 * Enhanced Task Parser Example
 * 
 * Demonstrates how to use the Enhanced Task Parser module for sophisticated
 * task parsing and environmental immersion capabilities.
 * 
 * @author @darianrosebrook
 */

import { TaskParser, EnvironmentalImmersion } from './index';
import { EnvironmentalContext } from './types';

/**
 * Example usage of the Enhanced Task Parser
 */
export async function enhancedTaskParserExample() {
  console.log('=== Enhanced Task Parser Example ===\n');

  // Initialize the task parser and environmental immersion
  const taskParser = new TaskParser({
    enable_validation: true,
    enable_feasibility_check: true,
    enable_progress_persistence: true,
    debug_mode: true,
  });

  const environmentalImmersion = new EnvironmentalImmersion();

  // Start environmental monitoring
  environmentalImmersion.start(2000); // Update every 2 seconds

  // Example 1: Parse a JSON task definition
  console.log('1. Parsing JSON Task Definition:');
  const jsonTask = JSON.stringify({
    type: 'gathering',
    parameters: {
      resource: 'cobblestone',
      quantity: 64,
      location: 'nearest_surface',
      tool_required: 'pickaxe'
    },
    priority: 0.8,
    safety_level: 'safe',
    estimated_duration: 300000
  });

  const environmentalContext: EnvironmentalContext = {
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
    console.log('✅ Task parsed successfully:');
    console.log(`   Type: ${result.task.type}`);
    console.log(`   Resource: ${result.task.parameters.resource}`);
    console.log(`   Quantity: ${result.task.parameters.quantity}`);
    console.log(`   Priority: ${result.task.priority}`);
    console.log(`   Valid: ${result.validation.is_valid}`);
    console.log(`   Feasible: ${result.feasibility.is_feasible}`);
    console.log(`   Parsing time: ${result.parsing_time}ms\n`);
  } catch (error) {
    console.error('❌ Failed to parse JSON task:', error);
  }

  // Example 2: Parse natural language task description
  console.log('2. Parsing Natural Language Task:');
  const naturalLanguageTask = 'I need to gather 32 cobblestone urgently for building a shelter';
  
  try {
    const result = await taskParser.parseLLMOutput(naturalLanguageTask, environmentalContext);
    console.log('✅ Natural language task parsed successfully:');
    console.log(`   Type: ${result.task.type}`);
    console.log(`   Resource: ${result.task.parameters.resource}`);
    console.log(`   Quantity: ${result.task.parameters.quantity}`);
    console.log(`   Priority: ${result.task.priority}`);
    console.log(`   Valid: ${result.validation.is_valid}`);
    console.log(`   Feasible: ${result.feasibility.is_feasible}\n`);
  } catch (error) {
    console.error('❌ Failed to parse natural language task:', error);
  }

  // Example 3: Environmental context with threats
  console.log('3. Environmental Context with Threats:');
  const threateningWorldState = {
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
      },
      {
        id: 'skeleton-1',
        type: 'skeleton',
        position: { x: 105, y: 64, z: 200 },
        is_hostile: true
      }
    ],
    inventory: [{ name: 'stone_pickaxe', quantity: 1 }],
    nearby_blocks: [],
    chat_messages: []
  };

  const threateningContext = environmentalImmersion.updateContext(threateningWorldState);
  console.log('✅ Environmental context updated:');
  console.log(`   Time of day: ${threateningContext.time_of_day}`);
  console.log(`   Weather: ${threateningContext.weather}`);
  console.log(`   Light level: ${threateningContext.light_level}`);
  console.log(`   Threat level: ${threateningContext.threat_level}`);
  console.log(`   Nearby entities: ${threateningContext.nearby_entities.length}\n`);

  // Example 4: Behavior adaptations
  console.log('4. Behavior Adaptations:');
  const adaptations = environmentalImmersion.getBehaviorAdaptations(threateningContext);
  console.log('✅ Behavior adaptations recommended:');
  console.log(`   Adaptations: ${adaptations.adaptations.join(', ')}`);
  console.log(`   Priority: ${adaptations.priority}`);
  console.log(`   Reasoning: ${adaptations.reasoning}\n`);

  // Example 5: Environmental summary
  console.log('5. Environmental Summary:');
  const summary = environmentalImmersion.getEnvironmentalSummary();
  console.log('✅ Environmental summary:');
  console.log(`   Safety level: ${summary.safety_level}`);
  console.log(`   Warnings: ${summary.warnings.join(', ')}`);
  console.log(`   Recommendations: ${summary.activity_recommendations.join(', ')}\n`);

  // Example 6: Task validation with environmental constraints
  console.log('6. Task Validation with Environmental Constraints:');
  const nightTask = 'I need to gather wood for building';
  
  try {
    const result = await taskParser.parseLLMOutput(nightTask, threateningContext);
    console.log('✅ Night task validation:');
    console.log(`   Task type: ${result.task.type}`);
    console.log(`   Valid: ${result.validation.is_valid}`);
    console.log(`   Warnings: ${result.validation.warnings.join(', ')}`);
    console.log(`   Suggestions: ${result.validation.suggestions.join(', ')}`);
    console.log(`   Feasible: ${result.feasibility.is_feasible}`);
    console.log(`   Risk level: ${result.feasibility.risk_assessment.level}\n`);
  } catch (error) {
    console.error('❌ Failed to validate night task:', error);
  }

  // Example 7: Performance metrics
  console.log('7. Performance Metrics:');
  const metrics = taskParser.getPerformanceMetrics();
  console.log('✅ Performance metrics:');
  console.log(`   Parsing time: ${metrics.parsing_time}ms`);
  console.log(`   Validation time: ${metrics.validation_time}ms`);
  console.log(`   Feasibility time: ${metrics.feasibility_time}ms`);
  console.log(`   Success rate: ${(metrics.success_rate * 100).toFixed(1)}%`);
  console.log(`   Error rate: ${(metrics.error_rate * 100).toFixed(1)}%\n`);

  // Example 8: Task history
  console.log('8. Task History:');
  const history = taskParser.getTaskHistory();
  console.log(`✅ Task history: ${history.length} tasks`);
  history.forEach((task, index) => {
    console.log(`   ${index + 1}. ${task.type} - ${task.parameters.resource || 'N/A'}`);
  });

  // Stop environmental monitoring
  environmentalImmersion.stop();
  
  console.log('\n=== Example Complete ===');
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  enhancedTaskParserExample().catch(console.error);
}

/**
 * Integration Example: Task-Oriented + Cognitive Architecture
 *
 * Demonstrates how the task-oriented approach integrates
 * with the cognitive depth of the conscious-bot architecture.
 *
 * @author @darianrosebrook
 */

import {
  CognitiveTaskParser,
  TaskOrientedCognitiveIntegration,
  TaskExecutor,
} from './index';
import { TaskDefinition, TaskExecutionContext } from './types';

/**
 * Example task executors implementing immediate execution patterns
 */
class GatheringTaskExecutor implements TaskExecutor {
  async execute(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): Promise<any> {
    console.log(` Executing gathering task: ${task.parameters.resource}`);

    // Simulate vibe-coded style execution
    const steps = [
      'Locating resource...',
      'Navigating to location...',
      'Extracting resource...',
      'Returning to safe location...',
    ];

    for (const step of steps) {
      console.log(`  ${step}`);
      await this.delay(1000); // Simulate execution time
    }

    return {
      success: true,
      gathered: task.parameters.quantity || 1,
      resource: task.parameters.resource,
      duration: 4000,
    };
  }

  canExecute(task: TaskDefinition): boolean {
    return task.type === 'gathering' && task.parameters.resource;
  }

  estimateDuration(task: TaskDefinition): number {
    return 4000; // 4 seconds for gathering
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class CraftingTaskExecutor implements TaskExecutor {
  async execute(
    task: TaskDefinition,
    context: TaskExecutionContext
  ): Promise<any> {
    console.log(` Executing crafting task: ${task.parameters.item}`);

    const steps = [
      'Gathering materials...',
      'Locating crafting station...',
      'Executing crafting process...',
      'Collecting crafted item...',
    ];

    for (const step of steps) {
      console.log(`  ${step}`);
      await this.delay(1500);
    }

    return {
      success: true,
      crafted: task.parameters.item,
      quantity: task.parameters.quantity || 1,
      duration: 6000,
    };
  }

  canExecute(task: TaskDefinition): boolean {
    return task.type === 'crafting' && task.parameters.item;
  }

  estimateDuration(task: TaskDefinition): number {
    return 6000; // 6 seconds for crafting
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Example integration demonstrating both architectures
 */
export async function demonstrateIntegration() {
  console.log(
    '=== Task-Oriented + Cognitive Architecture Integration Demo ===\n'
  );

  // Initialize the cognitive integration
  const cognitiveIntegration = new TaskOrientedCognitiveIntegration();

  // Register task executors (immediate execution style)
  cognitiveIntegration.registerTaskExecutor(
    'gathering',
    new GatheringTaskExecutor()
  );
  cognitiveIntegration.registerTaskExecutor(
    'crafting',
    new CraftingTaskExecutor()
  );

  // Initialize the cognitive task parser
  const cognitiveTaskParser = new CognitiveTaskParser(
    { debug_mode: true },
    cognitiveIntegration
  );

  // Start environmental monitoring
  cognitiveTaskParser.startMonitoring(2000);

  // Example 1: User command with cognitive context
  console.log('1. User Command with Cognitive Context:');
  const userCommand = '.bot mine 32 cobblestone urgently';

  const cognitiveContext = {
    currentNeeds: {
      safety: 0.3,
      nutrition: 0.7,
      progress: 0.8,
    },
    currentPriority: 0.6,
    skills: ['basic_mining', 'basic_movement'],
    socialNeeds: { interaction: 0.4 },
  };

  const worldState = {
    time: 12000, // Day
    weather: 'clear',
    biome: 'plains',
    light_level: 15,
    position: { x: 100, y: 64, z: 200 },
    entities: [],
    inventory: [{ name: 'stone_pickaxe', quantity: 1 }],
    nearby_blocks: [{ type: 'stone', position: { x: 101, y: 63, z: 200 } }],
    chat_messages: [],
  };

  try {
    const result = await cognitiveTaskParser.parseUserCommand(
      userCommand,
      cognitiveContext,
      worldState
    );

    console.log(' Command parsed successfully:');
    console.log(
      `   Task: ${result.task.type} - ${result.task.parameters.resource}`
    );
    console.log(`   Priority: ${result.priority.toFixed(2)}`);
    console.log(`   Reasoning: ${result.reasoning}`);
    console.log(`   Cognitive Task: ${result.cognitiveTask.type}`);
    console.log(
      `   Emotional Context: ${JSON.stringify(result.cognitiveTask.emotionalContext)}`
    );
    console.log(
      `   Memory Integration: ${result.cognitiveTask.memoryIntegration.similarTasksFound} similar tasks found`
    );
    console.log(
      `   Execution Plan: ${result.cognitiveTask.executionPlan.steps.length} steps`
    );
    console.log(
      `   Fallback Strategies: ${result.cognitiveTask.fallbackStrategies.length} strategies\n`
    );

    // Execute the task
    console.log(' Executing task...');
    const taskContext: TaskExecutionContext = {
      task: result.task,
      environmental_context: result.environmentalContext,
      available_resources: result.environmentalContext.resource_availability,
      current_skills: ['basic_movement', 'basic_interaction'],
      social_context: result.environmentalContext.social_context,
      timestamp: Date.now(),
    };
    const executionResult = await cognitiveIntegration.executeTask(
      result.task,
      taskContext
    );
    console.log(` Task completed: ${JSON.stringify(executionResult)}\n`);
  } catch (error) {
    console.error(' Error:', error);
  }

  // Example 2: Cognitive goal to executable task
  console.log('2. Cognitive Goal to Executable Task:');
  const cognitiveGoal = {
    type: 'survival',
    priority: 0.9,
    urgency: 'high',
    reasoning: 'Hunger levels are critical, need food immediately',
    resource: 'apple',
    quantity: 5,
    complexity: 'low',
  };

  try {
    const executableTask =
      await cognitiveTaskParser.cognitiveGoalToExecutableTask(
        cognitiveGoal,
        worldState
      );

    console.log(' Cognitive goal converted to executable task:');
    console.log(`   Type: ${executableTask.type}`);
    console.log(`   Resource: ${executableTask.parameters.resource}`);
    console.log(`   Priority: ${executableTask.priority}`);
    console.log(`   Safety Level: ${executableTask.safety_level}`);
    console.log(
      `   Dependencies: ${executableTask.dependencies?.join(', ') || 'none'}`
    );
    console.log(
      `   Fallback Actions: ${executableTask.fallback_actions?.join(', ') || 'none'}\n`
    );
  } catch (error) {
    console.error(' Error:', error);
  }

  // Example 3: Chat message processing
  console.log('3. Chat Message Processing:');
  const chatMessage = {
    id: 'msg-1',
    sender: 'Player1',
    content: 'Hi bot, can you help me build a house?',
    timestamp: Date.now(),
    is_own_message: false,
    message_type: 'request' as const,
    intent: 'request_help',
    emotion: 'friendly' as const,
    requires_response: true,
    response_priority: 0.7,
  };

  try {
    const chatResult = await cognitiveTaskParser.processChatMessage(
      chatMessage,
      cognitiveContext,
      worldState
    );

    console.log(' Chat message processed:');
    console.log(`   Should Respond: ${chatResult.shouldRespond}`);
    if (chatResult.command) {
      console.log(`   Command Type: ${chatResult.command.type}`);
    }
    if (chatResult.cognitiveResponse) {
      console.log(`   Response: ${chatResult.cognitiveResponse.content}`);
    }
    console.log();
  } catch (error) {
    console.error(' Error:', error);
  }

  // Example 4: Priority merging demonstration
  console.log('4. Priority Merging Demonstration:');
  const externalPriority = 0.8; // User command
  const internalPriority = 0.6; // Internal drive

  const mergedPriority = cognitiveIntegration.mergeTaskPriorities(
    externalPriority,
    internalPriority
  );

  console.log(' Priority merging:');
  console.log(`   External Priority: ${externalPriority}`);
  console.log(`   Internal Priority: ${internalPriority}`);
  console.log(`   Merged Priority: ${mergedPriority.toFixed(2)}`);
  console.log(
    `   Available Executors: ${cognitiveIntegration.getAvailableExecutors().join(', ')}\n`
  );

  // Example 5: Performance metrics
  console.log('5. Performance Metrics:');
  const metrics = cognitiveTaskParser.getPerformanceMetrics();
  console.log(' Performance metrics:');
  console.log(`   Task Parser: ${JSON.stringify(metrics.taskParser, null, 2)}`);
  console.log(
    `   Environmental Immersion: ${JSON.stringify(metrics.environmentalImmersion, null, 2)}\n`
  );

  // Stop monitoring
  cognitiveTaskParser.stopMonitoring();

  console.log('=== Integration Demo Complete ===');
  console.log('\nKey Benefits Demonstrated:');
  console.log(' Task-oriented parsing and immediate execution');
  console.log(' Cognitive depth and reasoning');
  console.log(' Environmental context awareness');
  console.log(' Priority merging between external and internal drives');
  console.log(' Memory integration and learning');
  console.log(' Emotional context assessment');
  console.log(' Social implications consideration');
  console.log(' Fallback strategy generation');
  console.log(' Performance monitoring and metrics');
}

// Run the example if this file is executed directly
if (require.main === module) {
  demonstrateIntegration().catch(console.error);
}

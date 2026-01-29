/**
 * Memory System Integration Examples
 *
 * Comprehensive examples showing how to integrate the enhanced memory system
 * with the core cognitive architecture components for optimal memory retrieval
 * and cognitive processing.
 *
 * @author @darianrosebrook
 */

import { MemorySignalGenerator } from './memory-signal-generator';
import { CognitiveTaskMemoryManager } from './cognitive-task-memory';
import { ReflectionMemoryManager } from './reflection-memory';
import { createDefaultMemorySystem } from './index';
// Temporary local type definitions until @conscious-bot/core is available
export interface Signal {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  source: string;
}

export interface MemorySignal extends Signal {
  memoryType: string;
  confidence: number;
}

export interface CognitiveTask {
  id: string;
  type: string;
  description: string;
  priority: number;
  deadline?: number;
  context: Record<string, any>;
}

// Placeholder classes - these would normally come from @conscious-bot/core
export class AdvancedSignalProcessor {
  constructor() {}
  async processSignal(signal: Signal): Promise<any> {
    return { processed: true };
  }
}

export class AdvancedNeedGenerator {
  constructor() {}
  generateNeeds(context: any): any[] {
    return [];
  }
}

export class CognitiveIntegration {
  constructor() {}
  integrate(cognitive: any, memory: any): any {
    return { integrated: true };
  }
}
import { ContextManager } from './working/context-manager';
import { CentralExecutive } from './working/central-executive';

// ============================================================================
// Example 1: Memory Signal Integration with Core Signal Processing
// ============================================================================

/**
 * Example showing how memory signals integrate with the core signal system
 * to influence goal formulation based on salient memories.
 */
export async function memorySignalIntegrationExample() {
  console.log('🎯 Memory Signal Integration Example');

  // 1. Create enhanced memory system
  const memorySystem = await createDefaultMemorySystem();

  // 2. Create memory signal generator
  const memorySignalGenerator = new MemorySignalGenerator(memorySystem);

  // 3. Generate signals based on current context
  const currentContext = {
    world: 'MyWorld',
    location: { x: 100, y: 64, z: 200 },
    timeOfDay: 'night',
    recentEvents: ['found_diamonds', 'killed_creeper'],
    emotionalState: 'cautious',
    currentGoals: ['find_shelter', 'gather_resources'],
  };

  // 4. Generate memory signals
  const signalResult =
    await memorySignalGenerator.generateSignals(currentContext);
  console.log(
    `📡 Generated ${signalResult.generatedSignals.length} memory signals`
  );

  // 5. Process signals with core signal processor
  const signalProcessor = new AdvancedSignalProcessor();

  for (const signal of signalResult.generatedSignals) {
    // Memory signals would be processed here by the core signal system
    console.log(
      `⚡ Processing memory signal: ${signal.memoryType} - ${signal.metadata?.originalContent?.substring(0, 100)}...`
    );

    // The core signal processor would:
    // - Fuse memory signals with other signals
    // - Apply context gates
    // - Generate need scores
    // - Influence goal formulation
  }

  return { memorySystem, memorySignalGenerator, signalResult };
}

// ============================================================================
// Example 2: Cognitive Task Memory Enhancement
// ============================================================================

/**
 * Example showing how cognitive task memory enhances task understanding
 * and provides better context for planning and execution.
 */
export async function cognitiveTaskMemoryExample() {
  console.log('🧠 Cognitive Task Memory Example');

  // 1. Create enhanced memory system
  const memorySystem = await createDefaultMemorySystem();

  // 2. Create cognitive task memory manager
  const contextManager = new ContextManager(new CentralExecutive());
  const cognitiveTaskMemory = new CognitiveTaskMemoryManager(
    contextManager,
    new CentralExecutive()
  );

  // 3. Create a cognitive task
  const task: CognitiveTask = {
    id: 'build_base_defenses',
    type: 'planning',
    description: 'Build base defenses against hostile mobs',
    priority: 0.8,
    context: {
      currentThreats: ['creepers', 'zombies'],
      availableResources: ['cobblestone', 'torches'],
      timePressure: 0.6, // Night approaching
      safetyLevel: 'medium',
    },
    deadline: Date.now() + 3600000, // 1 hour
    metadata: {
      location: { x: 100, y: 64, z: 200 },
      world: 'MyWorld',
      previousAttempts: 2,
    },
  };

  // 4. Create task memory
  const taskMemory = await cognitiveTaskMemory.createTaskMemory(task);
  console.log(`📋 Created task memory: ${taskMemory.id}`);

  // 5. Record task progress
  await cognitiveTaskMemory.recordTaskProgress(
    task.id,
    0.3, // 30% complete
    {
      currentActivity: 'gathering_materials',
      challenges: ['limited_cobblestone'],
      adaptations: ['using_alternative_materials'],
    },
    {
      success: true,
      resources: { cobblestone: -5 },
      emotionalImpact: 0.2, // Slightly positive
      duration: 300000, // 5 minutes
    }
  );

  // 6. Get task predictions
  const predictions = await cognitiveTaskMemory.getTaskPredictions(task.id);
  console.log(
    `🔮 Task predictions: ${predictions.successProbability.toFixed(2)} success rate, ${predictions.estimatedDuration}ms estimated`
  );

  // 7. Find similar tasks
  const similarTasks = await cognitiveTaskMemory.findSimilarTasks(task, {
    minSimilarity: 0.4,
    maxResults: 3,
  });
  console.log(`🔍 Found ${similarTasks.length} similar tasks`);

  return { memorySystem, cognitiveTaskMemory, taskMemory, predictions };
}

// ============================================================================
// Example 3: Reflection and Learning Memory
// ============================================================================

/**
 * Example showing how reflection memory enables learning from experiences
 * and narrative development.
 */
export async function reflectionMemoryExample() {
  console.log('🧘 Reflection Memory Example');

  // 1. Create reflection memory manager
  const reflectionMemory = new ReflectionMemoryManager();

  // 2. Add a reflection about a successful mining expedition
  const successReflection = await reflectionMemory.addReflection(
    'success',
    'Successfully mined 8 diamonds in a deep cave system. The branch mining strategy worked well, but I need to be more careful about cave-ins.',
    {
      emotionalState: 'excited',
      currentGoals: ['gather_resources', 'upgrade_tools'],
      recentEvents: ['found_diamonds', 'avoided_lava', 'killed_spider'],
      location: { x: -50, y: 12, z: 150 },
      timeOfDay: 'day',
    },
    [
      'Branch mining at Y=12 is effective for diamonds',
      'Always carry water buckets for lava protection',
      'Light up caves thoroughly to prevent mob spawns',
    ],
    [
      'Always prioritize safety when mining valuable resources',
      'Document successful strategies for future reference',
    ]
  );

  console.log(`✨ Added success reflection: ${successReflection.id}`);

  // 3. Add a reflection about a failure
  const failureReflection = await reflectionMemory.addReflection(
    'failure',
    "Lost 3 diamonds due to a cave-in. I was too greedy and didn't secure the area properly.",
    {
      emotionalState: 'frustrated',
      currentGoals: ['gather_resources'],
      recentEvents: ['cave_in', 'lost_items'],
      location: { x: -45, y: 11, z: 155 },
      timeOfDay: 'day',
    },
    [
      'Mining safety is crucial when dealing with valuable resources',
      'Always secure unstable blocks before continuing',
    ],
    [
      "Don't let greed override safety protocols",
      'Have emergency escape plans when mining underground',
    ]
  );

  console.log(`💥 Added failure reflection: ${failureReflection.id}`);

  // 4. Get contextual reflections
  const contextualReflections = reflectionMemory.getContextualReflections({
    emotionalState: 'excited',
    currentGoals: ['gather_resources'],
    maxResults: 5,
  });

  console.log(
    `🔍 Found ${contextualReflections.length} contextual reflections`
  );

  // 5. Get lessons learned
  const lessons = reflectionMemory.getLessons();
  console.log(`📚 Extracted ${lessons.length} lessons from reflections`);

  // 6. Generate narrative checkpoint
  const checkpoint = await reflectionMemory.generateNarrativeCheckpoint();
  console.log(`📖 Generated narrative checkpoint: ${checkpoint.title}`);

  // 7. Add metacognition entry
  const metaEntry = reflectionMemory.addMetacognitionEntry(
    'evaluation',
    'I need to improve my mining safety protocols to prevent losing valuable resources.',
    'resource_gathering',
    'improved',
    "Recognizing that greed led to loss of diamonds, I'm adjusting my approach to prioritize safety."
  );

  console.log(
    `🧠 Added metacognition: ${metaEntry.type} - ${metaEntry.cognitiveProcess}`
  );

  return {
    reflectionMemory,
    successReflection,
    failureReflection,
    lessons,
    checkpoint,
  };
}

// ============================================================================
// Example 4: Complete Integration with Core Systems
// ============================================================================

/**
 * Example showing complete integration of enhanced memory with core systems
 * for a realistic cognitive processing scenario.
 */
export async function completeIntegrationExample() {
  console.log('🔗 Complete Memory Integration Example');

  // 1. Initialize all systems
  const memorySystem = await createDefaultMemorySystem();
  const contextManager = new ContextManager(new CentralExecutive());
  const cognitiveTaskMemory = new CognitiveTaskMemoryManager(
    contextManager,
    new CentralExecutive()
  );
  const reflectionMemory = new ReflectionMemoryManager();
  const memorySignalGenerator = new MemorySignalGenerator(memorySystem);

  // 2. Create a complex task scenario
  const complexTask: CognitiveTask = {
    id: 'nether_exploration',
    type: 'exploration',
    description: 'Explore the Nether dimension',
    priority: 0.9,
    context: {
      dangerous: true,
      requiresPreparation: true,
      unknownOutcomes: true,
      timeCritical: false,
    },
    metadata: {
      location: { x: 0, y: 64, z: 0 },
      world: 'MyWorld',
      riskLevel: 'high',
      requiredSkills: ['combat', 'navigation', 'resource_management'],
    },
  };

  console.log('🎯 Created complex task: Nether exploration');

  // 3. Create task memory
  const taskMemory = await cognitiveTaskMemory.createTaskMemory(complexTask);

  // 4. Record initial planning phase
  await cognitiveTaskMemory.recordTaskProgress(
    complexTask.id,
    0.1, // 10% - Planning phase
    {
      phase: 'planning',
      considerations: [
        'gear_preparation',
        'portal_construction',
        'emergency_plans',
      ],
    },
    {
      success: true,
      resources: { obsidian: -10, flint_and_steel: -1 },
      emotionalImpact: -0.1, // Slightly nervous
      duration: 180000, // 3 minutes
    }
  );

  // 5. Generate memory signals for current context
  const currentContext = {
    world: 'MyWorld',
    location: { x: 0, y: 64, z: 0 },
    timeOfDay: 'day',
    recentEvents: ['built_portal', 'gathered_armor'],
    emotionalState: 'determined',
    currentGoals: ['explore_nether', 'find_fortress'],
  };

  const signals = await memorySignalGenerator.generateSignals(currentContext);

  // 6. Add reflection about the preparation
  const preparationReflection = await reflectionMemory.addReflection(
    'progress',
    'Prepared thoroughly for Nether exploration with full diamond armor, potions, and emergency supplies. Feeling confident but aware of the dangers.',
    {
      emotionalState: 'determined',
      currentGoals: ['explore_nether'],
      recentEvents: ['gathered_armor', 'brewed_potions'],
      location: { x: 0, y: 64, z: 0 },
      timeOfDay: 'day',
    },
    [
      'Thorough preparation is key for high-risk activities',
      'Multiple backup plans increase survival chances',
    ],
    [
      'Always prepare emergency supplies for dangerous environments',
      'Mental preparation is as important as physical gear',
    ]
  );

  // 7. Get task predictions
  const predictions = await cognitiveTaskMemory.getTaskPredictions(
    complexTask.id
  );

  // 8. Get relevant lessons
  const relevantLessons = reflectionMemory.getLessons('strategic');

  // 9. Generate narrative checkpoint
  const checkpoint = await reflectionMemory.generateNarrativeCheckpoint();

  console.log('✅ Complete integration scenario completed');
  console.log(
    `   📊 Task predictions: ${(predictions.successProbability * 100).toFixed(1)}% success rate`
  );
  console.log(`   📚 Lessons learned: ${relevantLessons.length}`);
  console.log(`   📖 Narrative checkpoint: ${checkpoint.title}`);
  console.log(`   📡 Memory signals: ${signals.generatedSignals.length}`);

  return {
    memorySystem,
    cognitiveTaskMemory,
    reflectionMemory,
    memorySignalGenerator,
    taskMemory,
    predictions,
    relevantLessons,
    checkpoint,
    signals,
  };
}

// ============================================================================
// Example 5: Memory-Driven Goal Formulation
// ============================================================================

/**
 * Example showing how memory signals can influence goal formulation
 * through integration with the core need generation system.
 */
export async function memoryDrivenGoalFormulationExample() {
  console.log('🎯 Memory-Driven Goal Formulation Example');

  // 1. Initialize systems
  const memorySystem = await createDefaultMemorySystem();
  const memorySignalGenerator = new MemorySignalGenerator(memorySystem);

  // 2. Create memory signals based on salient memories
  const context = {
    world: 'MyWorld',
    location: { x: 100, y: 64, z: 200 },
    timeOfDay: 'dawn',
    recentEvents: ['low_health', 'hunger', 'found_iron'],
    emotionalState: 'hungry',
    currentGoals: ['survive', 'find_food'],
  };

  const memorySignals = await memorySignalGenerator.generateSignals(context);

  // 3. Simulate integration with need generator
  const needGenerator = new AdvancedNeedGenerator();

  // Memory signals would influence need generation here
  console.log(
    `📡 Generated ${memorySignals.generatedSignals.length} memory signals for goal formulation`
  );

  for (const signal of memorySignals.generatedSignals) {
    console.log(
      `   🔍 Memory signal: ${signal.memoryType} (${signal.intensity.toFixed(2)} intensity)`
    );

    // The need generator would:
    // - Process memory signals as additional context
    // - Boost need scores based on memory relevance
    // - Generate goals influenced by past experiences
    // - Apply context gates based on memory content
  }

  // 4. Simulate goal generation influenced by memory
  const memoryInfluencedGoals = [
    {
      type: 'safety',
      score: 0.8,
      reasoning: 'Memory signal indicates recent low health experience',
      memoryContext: 'Previous hunger episode led to vulnerability',
    },
    {
      type: 'nutrition',
      score: 0.9,
      reasoning: 'Current hunger plus memory of recent starvation',
      memoryContext: 'Last time hunger was this high, I nearly died',
    },
    {
      type: 'progress',
      score: 0.6,
      reasoning: 'Memory of finding iron suggests exploration opportunity',
      memoryContext: 'Iron deposits found nearby before',
    },
  ];

  console.log('🎯 Memory-influenced goals generated:');
  memoryInfluencedGoals.forEach((goal) => {
    console.log(
      `   ${goal.type}: ${goal.score.toFixed(2)} - ${goal.reasoning}`
    );
  });

  return { memorySignalGenerator, memorySignals, memoryInfluencedGoals };
}

// ============================================================================
// Example 6: Social Memory Integration
// ============================================================================

/**
 * Example showing how memory system integrates with social cognition
 * for relationship tracking and social learning.
 */
export async function socialMemoryIntegrationExample() {
  console.log('👥 Social Memory Integration Example');

  // This would integrate with the social cognition system
  // For now, showing the memory structure that would support it

  const socialMemoryStructure = {
    relationships: {
      PlayerAlice: {
        type: 'friendly',
        trustLevel: 0.8,
        interactionHistory: [
          {
            type: 'trade',
            outcome: 'successful',
            timestamp: Date.now() - 3600000,
            memoryId: 'social_interaction_123',
          },
        ],
        sharedExperiences: ['joint_mining_expedition', 'village_defense'],
        communicationStyle: 'direct',
        reliability: 0.9,
        lastInteraction: Date.now() - 1800000,
      },
    },
    socialNorms: {
      server_rules: {
        content: 'No griefing allowed',
        source: 'server_admin',
        confidence: 0.95,
        lastReinforced: Date.now() - 86400000,
      },
      trading_etiquette: {
        content: 'Fair trades build trust',
        source: 'experience',
        confidence: 0.7,
        learnedFrom: 'successful_trades',
      },
    },
    socialLearning: {
      leadership: {
        observedFrom: 'PlayerBob',
        effectiveness: 0.8,
        applicableContexts: ['group_activities', 'crisis_situations'],
      },
    },
  };

  console.log('👥 Social memory structure ready for integration');
  console.log(
    `   Relationships: ${Object.keys(socialMemoryStructure.relationships).length}`
  );
  console.log(
    `   Social norms: ${Object.keys(socialMemoryStructure.socialNorms).length}`
  );
  console.log(
    `   Social learning: ${Object.keys(socialMemoryStructure.socialLearning).length}`
  );

  return { socialMemoryStructure };
}

// ============================================================================
// Utility Functions for Running Examples
// ============================================================================

/**
 * Run all integration examples
 */
export async function runAllExamples() {
  console.log('🚀 Running All Memory Integration Examples');
  console.log('='.repeat(60));

  try {
    await memorySignalIntegrationExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    await cognitiveTaskMemoryExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    await reflectionMemoryExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    await completeIntegrationExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    await memoryDrivenGoalFormulationExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    await socialMemoryIntegrationExample();
    console.log('\n' + '-'.repeat(40) + '\n');

    console.log('✅ All integration examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running integration examples:', error);
  }
}

/**
 * Run a specific example by name
 */
export async function runExample(exampleName: string) {
  const examples = {
    'memory-signals': memorySignalIntegrationExample,
    'cognitive-tasks': cognitiveTaskMemoryExample,
    reflections: reflectionMemoryExample,
    complete: completeIntegrationExample,
    goals: memoryDrivenGoalFormulationExample,
    social: socialMemoryIntegrationExample,
    all: runAllExamples,
  };

  const example = examples[exampleName as keyof typeof examples];
  if (!example) {
    console.error(`❌ Unknown example: ${exampleName}`);
    console.log('Available examples:', Object.keys(examples));
    return;
  }

  await example();
}

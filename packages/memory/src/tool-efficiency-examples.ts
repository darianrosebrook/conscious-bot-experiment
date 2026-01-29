/**
 * Tool Efficiency Memory System Examples
 *
 * Comprehensive examples showing how the tool efficiency memory system integrates
 * with behavior trees, cognitive processing, and planning systems to learn
 * optimal tool usage patterns and improve bot performance.
 *
 * @author @darianrosebrook
 */

import { EnhancedMemorySystem } from './memory-system';

// ============================================================================
// Example 1: Tool Usage Tracking with Behavior Trees
// ============================================================================

export async function toolUsageTrackingExample() {
  console.log('🛠️ Example 1: Tool Usage Tracking with Behavior Trees');

  // Initialize the enhanced memory system
  const memorySystem = new EnhancedMemorySystem({
    worldSeed: '12345',
    enableToolEfficiencyTracking: true,
    enableBehaviorTreeLearning: true,
    enableCognitivePatternTracking: true,
  } as any);

  await memorySystem.initialize();

  // Simulate tool usage in a crafting scenario
  console.log('📝 Recording tool usage patterns...');

  // Example 1: Stone tool crafting
  await memorySystem.recordToolUsage(
    'wooden_pickaxe',
    'crafting',
    'craft_stone_pickaxe',
    {
      biome: 'forest',
      timeOfDay: 'day',
      difficulty: 'easy',
      material: 'cobblestone',
    },
    {
      success: true,
      duration: 2500, // 2.5 seconds
      damageTaken: 0,
      resourcesGained: 1, // 1 stone pickaxe
      durabilityUsed: 0,
      efficiency: 0.4, // pickaxes per second
      successRate: 1.0,
    },
    {
      result: 'success',
      reason: 'Standard crafting recipe followed',
      alternativeTools: ['stone_pickaxe'],
      improvementSuggestions: ['Could use crafting table for faster crafting'],
    },
    'crafting_session_001'
  );

  // Example 2: Mining with different tools
  await memorySystem.recordToolUsage(
    'stone_pickaxe',
    'mining',
    'mine_cobblestone',
    {
      biome: 'mountains',
      timeOfDay: 'day',
      difficulty: 'normal',
      material: 'cobblestone',
    },
    {
      success: true,
      duration: 1800, // 1.8 seconds
      damageTaken: 0,
      resourcesGained: 8,
      durabilityUsed: 2,
      efficiency: 4.44, // cobblestone per second
      successRate: 1.0,
    },
    {
      result: 'success',
      reason: 'Effective mining with stone tools',
    }
  );

  await memorySystem.recordToolUsage(
    'iron_pickaxe',
    'mining',
    'mine_iron_ore',
    {
      biome: 'mountains',
      timeOfDay: 'day',
      difficulty: 'normal',
      material: 'iron_ore',
    },
    {
      success: true,
      duration: 2200, // 2.2 seconds
      damageTaken: 0,
      resourcesGained: 6,
      durabilityUsed: 1,
      efficiency: 2.73, // iron ore per second
      successRate: 1.0,
    },
    {
      result: 'success',
      reason: 'Iron pickaxe efficient for iron ore',
    }
  );

  // Example 3: Failed tool usage
  await memorySystem.recordToolUsage(
    'wooden_pickaxe',
    'mining',
    'mine_iron_ore',
    {
      biome: 'mountains',
      timeOfDay: 'day',
      difficulty: 'normal',
      material: 'iron_ore',
    },
    {
      success: false,
      duration: 5000, // 5 seconds (timeout)
      damageTaken: 0,
      resourcesGained: 0,
      durabilityUsed: 0,
      efficiency: 0,
      successRate: 0.0,
    },
    {
      result: 'failure',
      reason: 'Wooden pickaxe cannot mine iron ore',
      alternativeTools: ['stone_pickaxe', 'iron_pickaxe'],
      improvementSuggestions: ['Use stone or iron pickaxe for iron ore'],
    }
  );

  // Get tool recommendations for mining iron ore
  console.log('🔍 Getting tool recommendations for mining iron ore...');
  const recommendations = await memorySystem.getToolRecommendations(
    'mine_iron_ore',
    {
      biome: 'mountains',
      timeOfDay: 'day',
      material: 'iron_ore',
    },
    3
  );

  console.log('📊 Tool Recommendations:');
  recommendations.forEach((rec, index) => {
    console.log(
      `   ${index + 1}. ${rec.toolName} (Confidence: ${(rec.confidence * 100).toFixed(1)}%)`
    );
    console.log(`      ${rec.reasoning}`);
  });

  // Record behavior tree pattern
  console.log('🧠 Recording behavior tree pattern...');
  await memorySystem.recordBehaviorTreePattern(
    'mine_and_craft_sequence',
    [
      'find_cobblestone',
      'craft_stone_pickaxe',
      'find_iron_ore',
      'mine_iron_ore',
      'craft_iron_pickaxe',
    ],
    {
      taskType: 'resource_gathering',
      initialConditions: {
        has_wooden_pickaxe: true,
        has_crafting_table: false,
      },
      environmentalFactors: { biome: 'forest', timeOfDay: 'day' },
    },
    {
      success: true,
      duration: 45000, // 45 seconds
      resourcesUsed: { wooden_pickaxe: 1, cobblestone: 8, iron_ore: 6 },
      lessonsLearned: [
        'Stone pickaxe is essential for iron ore mining',
        'Wooden tools are insufficient for harder materials',
        'Sequence planning improves efficiency',
      ],
      timestamp: Date.now(),
    },
    { creator: 'bot' }
  );

  // Get behavior tree recommendations
  console.log('🎯 Getting behavior tree recommendations...');
  const behaviorPatterns =
    await memorySystem.getBehaviorTreeRecommendations('resource_gathering');

  console.log('📋 Behavior Tree Patterns:');
  behaviorPatterns.forEach((pattern, index) => {
    console.log(
      `   ${index + 1}. ${pattern.name} (Success Rate: ${(pattern.performance.averageSuccessRate * 100).toFixed(1)}%)`
    );
    console.log(`      Sequence: ${pattern.sequence.join(' → ')}`);
  });

  // Get efficiency statistics
  console.log('📈 Getting efficiency statistics...');
  const stats = memorySystem.getToolEfficiencyStats();
  console.log(`   Total Tools Tracked: ${stats.totalTools}`);
  console.log(`   Total Records: ${stats.totalRecords}`);
  console.log(
    `   Average Success Rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%`
  );
  console.log('   Top Performing Tools:');
  stats.topPerformingTools.forEach((tool, index) => {
    console.log(
      `     ${index + 1}. ${tool.tool} (${(tool.successRate * 100).toFixed(1)}% success, ${tool.uses} uses)`
    );
  });

  await memorySystem.close();
}

// ============================================================================
// Example 2: Cognitive Processing Pattern Learning
// ============================================================================

export async function cognitivePatternLearningExample() {
  console.log('🧠 Example 2: Cognitive Processing Pattern Learning');

  const memorySystem = new EnhancedMemorySystem({
    worldSeed: '12345',
    enableToolEfficiencyTracking: true,
    enableCognitivePatternTracking: true,
  } as any);

  await memorySystem.initialize();

  // Record successful decision making
  console.log('📝 Recording successful cognitive patterns...');
  await memorySystem.recordCognitivePattern(
    'decision',
    {
      taskComplexity: 'medium',
      timePressure: 0.3,
      emotionalState: 'calm',
      cognitiveLoad: 0.4,
      socialContext: false,
    },
    {
      approach: 'analytical_reasoning',
      reasoning:
        'Evaluated tool efficiency data and selected optimal tool based on context',
      confidence: 0.85,
      processingTime: 1200, // 1.2 seconds
    },
    {
      success: true,
      quality: 0.9,
      followThrough: true,
      longTermImpact: 0.8,
    },
    {
      commonBiases: [],
      effectiveStrategies: [
        'data_driven_decision',
        'context_awareness',
        'efficiency_optimization',
      ],
      failureModes: [],
    }
  );

  // Record failed decision making
  await memorySystem.recordCognitivePattern(
    'decision',
    {
      taskComplexity: 'simple',
      timePressure: 0.8,
      emotionalState: 'stressed',
      cognitiveLoad: 0.9,
      socialContext: false,
    },
    {
      approach: 'intuitive_guess',
      reasoning: 'Made quick decision without checking tool efficiency data',
      confidence: 0.4,
      processingTime: 300, // 0.3 seconds
    },
    {
      success: false,
      quality: 0.3,
      followThrough: false,
      longTermImpact: 0.2,
    },
    {
      commonBiases: ['recency_bias', 'stress_induced_errors'],
      effectiveStrategies: [],
      failureModes: ['insufficient_data_analysis', 'rushed_decision_making'],
    }
  );

  // Get cognitive insights for decision making
  console.log('🔍 Getting cognitive insights for decision making...');
  const insights = await memorySystem.getCognitiveInsights('decision', {
    taskComplexity: 'medium',
    emotionalState: 'calm',
  });

  console.log('📊 Cognitive Insights:');
  console.log(`   Success Rate: ${(insights.successRate * 100).toFixed(1)}%`);
  console.log(
    `   Average Processing Time: ${insights.averageProcessingTime}ms`
  );
  console.log('   Effective Strategies:', insights.effectiveStrategies);
  console.log('   Common Biases:', insights.commonBiases);

  await memorySystem.close();
}

// ============================================================================
// Example 3: Planning Strategy Learning
// ============================================================================

export async function planningStrategyLearningExample() {
  console.log('🎯 Example 3: Planning Strategy Learning');

  const memorySystem = new EnhancedMemorySystem({
    worldSeed: '12345',
    enableToolEfficiencyTracking: true,
    enableCognitivePatternTracking: true,
  } as any);

  await memorySystem.initialize();

  // Record successful planning strategy
  console.log('📝 Recording successful planning strategies...');
  await memorySystem.recordCognitivePattern(
    'planning',
    {
      taskComplexity: 'complex',
      timePressure: 0.1,
      emotionalState: 'focused',
      cognitiveLoad: 0.7,
      socialContext: false,
    },
    {
      approach: 'hierarchical_decomposition',
      reasoning:
        'Broke down complex mining task into subtasks: gather materials → craft tools → mine ore → process results',
      confidence: 0.9,
      processingTime: 3500, // 3.5 seconds
    },
    {
      success: true,
      quality: 0.95,
      followThrough: true,
      longTermImpact: 0.9,
    },
    {
      commonBiases: [],
      effectiveStrategies: [
        'task_decomposition',
        'resource_planning',
        'risk_assessment',
        'sequential_execution',
      ],
      failureModes: [],
    }
  );

  // Record failed planning strategy
  await memorySystem.recordCognitivePattern(
    'planning',
    {
      taskComplexity: 'medium',
      timePressure: 0.5,
      emotionalState: 'frustrated',
      cognitiveLoad: 0.8,
      socialContext: false,
    },
    {
      approach: 'linear_approach',
      reasoning:
        'Attempted to execute all steps simultaneously without proper sequencing',
      confidence: 0.6,
      processingTime: 1800, // 1.8 seconds
    },
    {
      success: false,
      quality: 0.4,
      followThrough: false,
      longTermImpact: 0.3,
    },
    {
      commonBiases: ['optimism_bias'],
      effectiveStrategies: [],
      failureModes: [
        'poor_task_sequencing',
        'resource_conflicts',
        'lack_of_contingency_planning',
      ],
    }
  );

  // Get planning insights
  console.log('🔍 Getting planning insights...');
  const planningInsights = await memorySystem.getCognitiveInsights('planning', {
    taskComplexity: 'complex',
  });

  console.log('📊 Planning Insights:');
  console.log(
    `   Success Rate: ${(planningInsights.successRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Average Processing Time: ${planningInsights.averageProcessingTime}ms`
  );
  console.log('   Effective Strategies:', planningInsights.effectiveStrategies);
  console.log('   Common Biases:', planningInsights.commonBiases);

  await memorySystem.close();
}

// ============================================================================
// Example 4: Adaptive Tool Selection
// ============================================================================

export async function adaptiveToolSelectionExample() {
  console.log('🎛️ Example 4: Adaptive Tool Selection');

  const memorySystem = new EnhancedMemorySystem({
    worldSeed: '12345',
    enableToolEfficiencyTracking: true,
    enableAutoRecommendations: true,
  } as any);

  await memorySystem.initialize();

  // Simulate learning over multiple attempts
  console.log('📝 Simulating tool learning over multiple attempts...');

  const scenarios = [
    { tool: 'wooden_pickaxe', material: 'cobblestone', expectedSuccess: true },
    { tool: 'wooden_pickaxe', material: 'iron_ore', expectedSuccess: false },
    { tool: 'stone_pickaxe', material: 'cobblestone', expectedSuccess: true },
    { tool: 'stone_pickaxe', material: 'iron_ore', expectedSuccess: true },
    { tool: 'iron_pickaxe', material: 'cobblestone', expectedSuccess: true },
    { tool: 'iron_pickaxe', material: 'iron_ore', expectedSuccess: true },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];

    await memorySystem.recordToolUsage(
      scenario.tool,
      'mining',
      `mine_${scenario.material}`,
      {
        biome: 'mountains',
        timeOfDay: 'day',
        material: scenario.material,
      },
      {
        success: scenario.expectedSuccess,
        duration: scenario.expectedSuccess ? 2000 : 3000,
        damageTaken: 0,
        resourcesGained: scenario.expectedSuccess ? 5 : 0,
        durabilityUsed: scenario.expectedSuccess ? 1 : 0,
        efficiency: scenario.expectedSuccess ? 2.5 : 0,
        successRate: scenario.expectedSuccess ? 1.0 : 0.0,
      },
      {
        result: scenario.expectedSuccess ? 'success' : 'failure',
        reason: scenario.expectedSuccess
          ? 'Correct tool for material'
          : 'Incorrect tool for material',
        alternativeTools: scenario.expectedSuccess
          ? []
          : ['stone_pickaxe', 'iron_pickaxe'],
      }
    );

    console.log(
      `   Attempt ${i + 1}: ${scenario.tool} on ${scenario.material} - ${scenario.expectedSuccess ? 'Success' : 'Failed'}`
    );
  }

  // Test tool recommendation system
  console.log('🔍 Testing tool recommendation system...');

  const testScenarios = [
    { material: 'cobblestone', context: 'Need reliable tool' },
    { material: 'iron_ore', context: 'Need efficient tool' },
    { material: 'diamond_ore', context: 'Need best tool available' },
  ];

  for (const scenario of testScenarios) {
    console.log(`\n   Scenario: ${scenario.context}`);
    const recommendations = await memorySystem.getToolRecommendations(
      `mine_${scenario.material}`,
      { material: scenario.material },
      3
    );

    if (recommendations.length > 0) {
      console.log(
        `   Recommended: ${recommendations[0].toolName} (${(recommendations[0].confidence * 100).toFixed(1)}% confidence)`
      );
      console.log(`   Reasoning: ${recommendations[0].reasoning}`);
    } else {
      console.log(`   No recommendations available yet`);
    }
  }

  // Evaluate efficiency
  console.log('📈 Evaluating tool efficiency...');
  await memorySystem.evaluateToolEfficiency();

  const stats = memorySystem.getToolEfficiencyStats();
  console.log(`\n   Final Statistics:`);
  console.log(`   Total Tools: ${stats.totalTools}`);
  console.log(
    `   Success Rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%`
  );
  console.log(`   Top Tools:`);
  stats.topPerformingTools.forEach((tool, index) => {
    console.log(
      `     ${index + 1}. ${tool.tool} (${(tool.successRate * 100).toFixed(1)}% success rate)`
    );
  });

  await memorySystem.close();
}

// ============================================================================
// Example 5: Behavior Tree Evolution
// ============================================================================

export async function behaviorTreeEvolutionExample() {
  console.log('🌳 Example 5: Behavior Tree Evolution');

  const memorySystem = new EnhancedMemorySystem({
    worldSeed: '12345',
    enableToolEfficiencyTracking: true,
    enableBehaviorTreeLearning: true,
  } as any);

  await memorySystem.initialize();

  // Simulate behavior tree learning over time
  console.log('📝 Simulating behavior tree evolution...');

  const treeVersions = [
    {
      name: 'basic_mining_v1',
      sequence: ['find_cobblestone', 'mine_cobblestone', 'collect_cobblestone'],
      success: false,
      reason: 'Inefficient - no tool progression',
    },
    {
      name: 'basic_mining_v2',
      sequence: [
        'find_cobblestone',
        'craft_stone_pickaxe',
        'mine_cobblestone',
        'collect_cobblestone',
      ],
      success: true,
      reason: 'Better - includes tool crafting',
    },
    {
      name: 'advanced_mining_v3',
      sequence: [
        'check_inventory',
        'find_cobblestone',
        'craft_stone_pickaxe',
        'find_iron_ore',
        'mine_iron_ore',
        'craft_iron_pickaxe',
        'mine_more_ore',
        'collect_resources',
      ],
      success: true,
      reason: 'Optimal - full tool progression and resource optimization',
    },
  ];

  for (let i = 0; i < treeVersions.length; i++) {
    const version = treeVersions[i];

    await memorySystem.recordBehaviorTreePattern(
      version.name,
      version.sequence,
      {
        taskType: 'resource_gathering',
        initialConditions: { has_tools: i > 0 },
        environmentalFactors: { biome: 'mountains', timeOfDay: 'day' },
      },
      {
        success: version.success,
        duration: version.success ? 30000 + i * 10000 : 60000,
        resourcesUsed: { cobblestone: 3 + i },
        lessonsLearned: version.success
          ? [
              `Version ${i + 1} improved efficiency`,
              'Tool progression is key',
              'Sequential planning works',
            ]
          : [
              `Version ${i + 1} failed`,
              'Missing tool progression',
              'Need better planning',
            ],
        timestamp: Date.now() + i * 60000, // Stagger timestamps
      },
      { creator: 'bot', usageCount: i + 1 }
    );

    console.log(
      `   Version ${i + 1}: ${version.name} - ${version.success ? 'Success' : 'Failed'}`
    );
  }

  // Get behavior tree recommendations
  console.log('🔍 Getting behavior tree recommendations...');
  const recommendations =
    await memorySystem.getBehaviorTreeRecommendations('resource_gathering');

  console.log('📋 Recommended Patterns:');
  recommendations.forEach((pattern, index) => {
    console.log(`   ${index + 1}. ${pattern.name}`);
    console.log(
      `      Success Rate: ${(pattern.performance.averageSuccessRate * 100).toFixed(1)}%`
    );
    console.log(
      `      Reliability: ${(pattern.performance.reliability * 100).toFixed(1)}%`
    );
    console.log(
      `      Adaptability: ${(pattern.performance.adaptability * 100).toFixed(1)}%`
    );
    console.log(`      Sequence: ${pattern.sequence.join(' → ')}`);
  });

  await memorySystem.close();
}

// ============================================================================
// Run All Examples
// ============================================================================

export async function runAllToolEfficiencyExamples() {
  console.log('🚀 Running All Tool Efficiency Examples\n');

  try {
    await toolUsageTrackingExample();
    console.log('\n' + '='.repeat(60) + '\n');

    await cognitivePatternLearningExample();
    console.log('\n' + '='.repeat(60) + '\n');

    await planningStrategyLearningExample();
    console.log('\n' + '='.repeat(60) + '\n');

    await adaptiveToolSelectionExample();
    console.log('\n' + '='.repeat(60) + '\n');

    await behaviorTreeEvolutionExample();

    console.log('\n✅ All tool efficiency examples completed successfully!');
    console.log('\n📊 Key Insights:');
    console.log(
      '   • Tool efficiency tracking learns optimal tool usage patterns'
    );
    console.log('   • Behavior tree patterns evolve and improve over time');
    console.log('   • Cognitive processing learns from success and failure');
    console.log('   • Planning strategies adapt based on context and outcomes');
    console.log(
      '   • The system provides intelligent recommendations based on historical data'
    );
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

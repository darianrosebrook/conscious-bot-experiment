/**
 * Complex Multi-Step Reasoning Scenarios
 * 
 * A comprehensive suite of scenarios designed to test the HRM-inspired
 * cognitive architecture across various reasoning domains and complexity levels
 * 
 * @author @darianrosebrook
 */

import { Scenario, ComplexityLevel, ReasoningDomain } from '../types';

/**
 * Spatial Reasoning Scenarios
 * Tests navigation, pathfinding, and spatial relationship understanding
 */
export const spatialReasoningScenarios: Scenario[] = [
  {
    id: 'spatial_maze_basic',
    name: 'Basic Maze Navigation',
    description: 'Navigate through a simple 5x5 maze to reach the exit',
    domain: 'spatial',
    complexity: 'basic',
    expectedDuration: 15000,
    
    initialState: {
      position: [0, 0],
      maze: [
        [0, 1, 0, 0, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 0, 1, 0],
        [1, 1, 0, 1, 0],
        [0, 0, 0, 0, 2] // 2 = exit
      ],
      inventory: {},
      energy: 100
    },
    
    goalConditions: ['reach_exit'],
    constraints: ['no_wall_clipping', 'energy_management'],
    resources: { time: 30, moves: 50 },
    
    successCriteria: [
      { metric: 'success_rate', threshold: 0.9, weight: 0.4 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.3 },
      { metric: 'latency', threshold: 15000, weight: 0.3 }
    ],
    
    tags: ['navigation', 'pathfinding', 'basic'],
    difficulty: 3,
    estimatedSteps: 8,
    requiresMemory: false,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 30000,
    maxAttempts: 3,
    allowPartialCredit: true
  },

  {
    id: 'spatial_multi_objective',
    name: 'Multi-Objective Spatial Planning',
    description: 'Collect three keys in optimal order then reach exit while avoiding traps',
    domain: 'spatial',
    complexity: 'advanced',
    expectedDuration: 45000,
    
    initialState: {
      position: [0, 0],
      environment: {
        size: [10, 10],
        obstacles: [[2, 2], [3, 3], [7, 1], [8, 8]],
        keys: [[1, 5], [8, 2], [4, 9]], // Three keys to collect
        traps: [[5, 5], [6, 6], [2, 8]], // Damage zones
        exit: [9, 9]
      },
      inventory: { keys: 0 },
      health: 100
    },
    
    goalConditions: ['collect_all_keys', 'reach_exit', 'maintain_health'],
    constraints: ['optimal_path', 'trap_avoidance', 'key_order_optimization'],
    resources: { time: 120, health: 100 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'efficiency', threshold: 0.8, weight: 0.3 },
      { metric: 'planning_quality', threshold: 0.7, weight: 0.3 }
    ],
    
    tags: ['multi-objective', 'optimization', 'complex-navigation'],
    difficulty: 7,
    estimatedSteps: 15,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 90000,
    maxAttempts: 2,
    allowPartialCredit: true
  }
];

/**
 * Logical Reasoning Scenarios
 * Tests deduction, pattern recognition, and logical problem solving
 */
export const logicalReasoningScenarios: Scenario[] = [
  {
    id: 'logic_tower_of_hanoi',
    name: 'Tower of Hanoi (4 disks)',
    description: 'Solve 4-disk Tower of Hanoi puzzle with optimal moves',
    domain: 'logical',
    complexity: 'intermediate',
    expectedDuration: 20000,
    
    initialState: {
      towers: {
        A: [4, 3, 2, 1], // Bottom to top (largest to smallest)
        B: [],
        C: []
      },
      moves: 0,
      rules: ['larger_on_smaller', 'one_disk_per_move', 'top_disk_only']
    },
    
    goalConditions: ['all_disks_on_C', 'optimal_moves'],
    constraints: ['hanoi_rules', 'move_efficiency'],
    resources: { moves: 15 }, // Optimal is 15 moves for 4 disks
    
    successCriteria: [
      { metric: 'success_rate', threshold: 1.0, weight: 0.5 },
      { metric: 'efficiency', threshold: 0.9, weight: 0.3 },
      { metric: 'reasoning_depth', threshold: 0.8, weight: 0.2 }
    ],
    
    tags: ['puzzle', 'recursion', 'optimal-planning'],
    difficulty: 6,
    estimatedSteps: 15,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 45000,
    maxAttempts: 3,
    allowPartialCredit: false
  },

  {
    id: 'logic_sequence_prediction',
    name: 'Complex Sequence Prediction',
    description: 'Identify pattern in multi-layered sequence and predict next 3 elements',
    domain: 'logical',
    complexity: 'advanced',
    expectedDuration: 30000,
    
    initialState: {
      sequence: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55], // Fibonacci + variations
      patterns: ['fibonacci_base', 'arithmetic_shift', 'multiplicative_factor'],
      context: 'mathematical_sequence',
      hints: 2
    },
    
    goalConditions: ['identify_pattern', 'predict_next_three'],
    constraints: ['pattern_consistency', 'mathematical_validity'],
    resources: { hints: 2, analysis_time: 60 },
    
    successCriteria: [
      { metric: 'accuracy', threshold: 0.9, weight: 0.6 },
      { metric: 'reasoning_depth', threshold: 0.8, weight: 0.4 }
    ],
    
    tags: ['pattern-recognition', 'prediction', 'mathematical'],
    difficulty: 8,
    estimatedSteps: 6,
    requiresMemory: true,
    requiresPlanning: false,
    requiresLearning: true,
    
    timeLimit: 60000,
    maxAttempts: 2,
    allowPartialCredit: true
  }
];

/**
 * Resource Planning Scenarios
 * Tests optimization, allocation, and multi-constraint planning
 */
export const resourcePlanningScenarios: Scenario[] = [
  {
    id: 'resource_base_construction',
    name: 'Optimal Base Construction',
    description: 'Build a fortified base with limited resources while defending against threats',
    domain: 'resource',
    complexity: 'expert',
    expectedDuration: 120000,
    
    initialState: {
      location: [50, 50],
      environment: 'hostile_plains',
      resources: {
        wood: 100,
        stone: 50,
        food: 30,
        tools: 3
      },
      threats: {
        monsters: { frequency: 0.3, strength: 'medium' },
        weather: { type: 'storms', frequency: 0.2 }
      },
      time_of_day: 'dawn',
      season: 'winter'
    },
    
    goalConditions: [
      'build_shelter',
      'establish_defenses', 
      'secure_food_source',
      'survive_7_days'
    ],
    constraints: [
      'resource_efficiency',
      'threat_mitigation',
      'time_management',
      'structural_integrity'
    ],
    resources: { 
      total_time: 7 * 24 * 60, // 7 days in minutes
      energy: 1000,
      health: 100
    },
    
    successCriteria: [
      { metric: 'completeness', threshold: 0.9, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.8, weight: 0.3 },
      { metric: 'robustness', threshold: 0.7, weight: 0.4 }
    ],
    
    tags: ['construction', 'survival', 'multi-constraint', 'long-term'],
    difficulty: 9,
    estimatedSteps: 25,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 180000, // 3 minutes real-time
    maxAttempts: 2,
    allowPartialCredit: true
  }
];

/**
 * Social Reasoning Scenarios
 * Tests multi-agent interaction, cooperation, and social cognition
 */
export const socialReasoningScenarios: Scenario[] = [
  {
    id: 'social_negotiation',
    name: 'Multi-Party Resource Negotiation',
    description: 'Negotiate fair resource distribution among 4 agents with competing interests',
    domain: 'social',
    complexity: 'advanced',
    expectedDuration: 60000,
    
    initialState: {
      agents: {
        self: { resources: { food: 10, water: 5, shelter: 2 }, needs: [8, 8, 3] },
        alice: { resources: { food: 5, water: 10, shelter: 1 }, needs: [6, 4, 5] },
        bob: { resources: { food: 8, water: 3, shelter: 4 }, needs: [4, 6, 2] },
        charlie: { resources: { food: 2, water: 8, shelter: 3 }, needs: [9, 3, 4] }
      },
      relationships: {
        alice: 'neutral',
        bob: 'friendly', 
        charlie: 'competitive'
      },
      negotiation_rounds: 5,
      communication_style: 'formal'
    },
    
    goalConditions: [
      'meet_survival_needs',
      'maintain_relationships',
      'achieve_fair_distribution',
      'reach_consensus'
    ],
    constraints: [
      'resource_conservation',
      'social_norms',
      'time_pressure',
      'relationship_preservation'
    ],
    resources: { 
      negotiation_time: 300, // 5 minutes
      trust_points: 100,
      influence: 50
    },
    
    successCriteria: [
      { metric: 'social_awareness', threshold: 0.8, weight: 0.4 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.3 },
      { metric: 'coherence', threshold: 0.8, weight: 0.3 }
    ],
    
    tags: ['negotiation', 'multi-agent', 'cooperation', 'social-dynamics'],
    difficulty: 8,
    estimatedSteps: 12,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 120000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Ethical Reasoning Scenarios
 * Tests moral reasoning, value conflicts, and ethical decision making
 */
export const ethicalReasoningScenarios: Scenario[] = [
  {
    id: 'ethical_trolley_variant',
    name: 'Multi-Dimensional Trolley Problem',
    description: 'Navigate complex moral dilemma with multiple stakeholders and uncertain outcomes',
    domain: 'ethical',
    complexity: 'expert',
    expectedDuration: 45000,
    
    initialState: {
      scenario: 'runaway_trolley',
      current_track: {
        people: 5,
        characteristics: ['strangers', 'varying_ages', 'unknown_contributions']
      },
      alternate_track: {
        people: 1,
        characteristics: ['known_person', 'young', 'high_potential']
      },
      uncertainty: {
        switch_success_probability: 0.85,
        warning_effectiveness: 0.6,
        rescue_possibility: 0.3
      },
      time_to_impact: 10, // seconds
      available_actions: [
        'switch_tracks',
        'warn_people',
        'attempt_rescue',
        'do_nothing',
        'call_for_help'
      ]
    },
    
    goalConditions: [
      'minimize_harm',
      'respect_autonomy',
      'maintain_integrity',
      'provide_justification'
    ],
    constraints: [
      'time_pressure',
      'moral_consistency',
      'uncertainty_management',
      'responsibility_consideration'
    ],
    resources: { 
      decision_time: 10,
      moral_weight: 100,
      certainty_level: 0.7
    },
    
    successCriteria: [
      { metric: 'coherence', threshold: 0.9, weight: 0.4 },
      { metric: 'reasoning_depth', threshold: 0.8, weight: 0.3 },
      { metric: 'consistency', threshold: 0.8, weight: 0.3 }
    ],
    
    tags: ['moral-dilemma', 'uncertainty', 'multi-stakeholder', 'time-pressure'],
    difficulty: 10,
    estimatedSteps: 8,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 60000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Meta-Cognitive Scenarios
 * Tests reasoning about reasoning, self-reflection, and adaptive thinking
 */
export const metaCognitiveScenarios: Scenario[] = [
  {
    id: 'meta_strategy_adaptation',
    name: 'Adaptive Strategy Selection',
    description: 'Monitor own performance and adapt reasoning strategy across changing task types',
    domain: 'meta_cognitive',
    complexity: 'expert',
    expectedDuration: 90000,
    
    initialState: {
      task_sequence: [
        { type: 'logical', difficulty: 3 },
        { type: 'spatial', difficulty: 5 },
        { type: 'resource', difficulty: 4 },
        { type: 'social', difficulty: 6 },
        { type: 'hybrid', difficulty: 8 }
      ],
      performance_history: [],
      available_strategies: [
        'systematic_analysis',
        'heuristic_search', 
        'collaborative_reasoning',
        'iterative_refinement',
        'pattern_matching'
      ],
      confidence_threshold: 0.7,
      adaptation_triggers: ['low_performance', 'high_uncertainty', 'strategy_ineffectiveness']
    },
    
    goalConditions: [
      'complete_all_tasks',
      'maintain_performance',
      'demonstrate_adaptation',
      'explain_strategy_choices'
    ],
    constraints: [
      'strategy_appropriateness',
      'adaptation_speed',
      'performance_consistency',
      'resource_efficiency'
    ],
    resources: { 
      total_time: 300, // 5 minutes
      cognitive_energy: 1000,
      strategy_switches: 5
    },
    
    successCriteria: [
      { metric: 'adaptability', threshold: 0.8, weight: 0.4 },
      { metric: 'consistency', threshold: 0.7, weight: 0.3 },
      { metric: 'reasoning_depth', threshold: 0.8, weight: 0.3 }
    ],
    
    tags: ['meta-cognition', 'adaptation', 'strategy-selection', 'self-monitoring'],
    difficulty: 9,
    estimatedSteps: 20,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 120000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Hybrid Complex Scenarios
 * Multi-domain scenarios that require integration of multiple reasoning types
 */
export const hybridComplexScenarios: Scenario[] = [
  {
    id: 'hybrid_crisis_management',
    name: 'Multi-Domain Crisis Management',
    description: 'Coordinate response to natural disaster affecting virtual community',
    domain: 'hybrid',
    complexity: 'emergent',
    expectedDuration: 180000,
    
    initialState: {
      disaster: {
        type: 'earthquake',
        magnitude: 7.2,
        affected_area: { radius: 50, center: [100, 100] },
        aftershock_probability: 0.4
      },
      community: {
        population: 1000,
        buildings: {
          residential: 200,
          commercial: 50,
          critical: 20 // hospitals, schools, etc.
        },
        infrastructure: {
          power: 'damaged',
          water: 'critical',
          communication: 'limited',
          transportation: 'blocked'
        }
      },
      resources: {
        rescue_teams: 5,
        medical_supplies: 100,
        food: 500,
        temporary_shelter: 50,
        vehicles: 10
      },
      time_constraints: {
        golden_hour: 1, // Critical first hour
        survival_window: 72, // 72 hours
        weather_forecast: 'deteriorating'
      }
    },
    
    goalConditions: [
      'save_maximum_lives',
      'restore_critical_infrastructure',
      'maintain_community_morale',
      'prepare_for_aftershocks',
      'coordinate_external_aid'
    ],
    constraints: [
      'resource_limitations',
      'time_pressure',
      'safety_protocols',
      'ethical_prioritization',
      'coordination_complexity'
    ],
    resources: { 
      coordination_time: 180, // 3 hours real-time simulation
      authority_level: 8,
      communication_bandwidth: 100
    },
    
    successCriteria: [
      { metric: 'success_rate', threshold: 0.8, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.2 },
      { metric: 'social_awareness', threshold: 0.8, weight: 0.2 },
      { metric: 'adaptability', threshold: 0.7, weight: 0.15 },
      { metric: 'coherence', threshold: 0.8, weight: 0.15 }
    ],
    
    tags: ['crisis-management', 'multi-domain', 'emergent', 'real-world-simulation'],
    difficulty: 10,
    estimatedSteps: 35,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 300000, // 5 minutes real-time
    maxAttempts: 1,
    allowPartialCredit: true,
    randomSeed: undefined // Truly emergent scenario
  }
];

/**
 * Complete scenario library combining all reasoning domains
 */
export const allComplexReasoningScenarios: Scenario[] = [
  ...spatialReasoningScenarios,
  ...logicalReasoningScenarios,
  ...resourcePlanningScenarios,
  ...socialReasoningScenarios,
  ...ethicalReasoningScenarios,
  ...metaCognitiveScenarios,
  ...hybridComplexScenarios
];

/**
 * Scenario collections organized by complexity for curriculum progression
 */
export const scenariosByComplexity = {
  basic: allComplexReasoningScenarios.filter(s => s.complexity === 'basic'),
  intermediate: allComplexReasoningScenarios.filter(s => s.complexity === 'intermediate'),
  advanced: allComplexReasoningScenarios.filter(s => s.complexity === 'advanced'),
  expert: allComplexReasoningScenarios.filter(s => s.complexity === 'expert'),
  emergent: allComplexReasoningScenarios.filter(s => s.complexity === 'emergent')
};

/**
 * Scenario collections organized by reasoning domain
 */
export const scenariosByDomain = {
  spatial: spatialReasoningScenarios,
  logical: logicalReasoningScenarios,
  resource: resourcePlanningScenarios,
  social: socialReasoningScenarios,
  ethical: ethicalReasoningScenarios,
  meta_cognitive: metaCognitiveScenarios,
  hybrid: hybridComplexScenarios
};

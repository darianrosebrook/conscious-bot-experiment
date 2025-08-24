/**
 * MineDojo-Style Evaluation Scenarios
 * 
 * Comprehensive suite of Minecraft-inspired evaluation tasks following the MineDojo
 * framework for testing embodied AI agents in complex, open-world environments.
 * 
 * Based on MineDojo: Building Open-Ended Embodied Agents with Internet-Scale Knowledge
 * https://arxiv.org/abs/2206.08853
 * 
 * @author @darianrosebrook
 */

import { Scenario, ComplexityLevel, ReasoningDomain } from '../types';

/**
 * Basic Survival Tasks - Foundation skills for Minecraft agents
 */
export const basicSurvivalScenarios: Scenario[] = [
  {
    id: 'minedojo_wood_collection',
    name: 'Wood Collection Task',
    description: 'Collect 10 wood blocks by punching trees in a forest biome',
    domain: 'resource',
    complexity: 'basic',
    expectedDuration: 30000,
    
    initialState: {
      biome: 'forest',
      position: { x: 0, y: 64, z: 0 },
      inventory: {},
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear',
      nearby_entities: ['oak_tree', 'birch_tree', 'pig', 'cow'],
      tools: []
    },
    
    goalConditions: ['collect_wood_10'],
    constraints: ['no_tools_allowed', 'daylight_only'],
    resources: { time: 60, health: 20, hunger: 20 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.5 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.3 },
      { metric: 'latency', threshold: 30000, weight: 0.2 }
    ],
    
    tags: ['minedojo', 'basic', 'resource-gathering', 'survival'],
    difficulty: 2,
    estimatedSteps: 5,
    requiresMemory: false,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 60000,
    maxAttempts: 3,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_first_shelter',
    name: 'First Night Shelter',
    description: 'Build a basic shelter before nightfall using collected wood',
    domain: 'resource',
    complexity: 'intermediate',
    expectedDuration: 120000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: { wood: 15, dirt: 10 },
      health: 20,
      hunger: 18,
      time_of_day: 'afternoon',
      weather: 'clear',
      nearby_entities: ['zombie', 'skeleton', 'spider'],
      light_level: 15
    },
    
    goalConditions: ['build_shelter_4x4', 'survive_night', 'light_interior'],
    constraints: ['limited_resources', 'time_pressure', 'monster_spawning'],
    resources: { time: 180, health: 20, hunger: 18, light: 64 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'robustness', threshold: 0.8, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.6, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'intermediate', 'building', 'survival', 'time-pressure'],
    difficulty: 4,
    estimatedSteps: 12,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 180000,
    maxAttempts: 2,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_food_procurement',
    name: 'Food Procurement Challenge',
    description: 'Obtain and cook food to restore hunger before starvation',
    domain: 'resource',
    complexity: 'intermediate',
    expectedDuration: 90000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: { wood: 5, stone: 3 },
      health: 15,
      hunger: 3, // Critical hunger level
      time_of_day: 'day',
      weather: 'clear',
      nearby_entities: ['cow', 'pig', 'chicken', 'wheat'],
      tools: []
    },
    
    goalConditions: ['restore_hunger_15', 'craft_cooking_tools', 'cook_food'],
    constraints: ['hunger_depletion', 'tool_crafting_required', 'fuel_management'],
    resources: { time: 120, health: 15, hunger: 3 },
    
    successCriteria: [
      { metric: 'success_rate', threshold: 1.0, weight: 0.5 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.3 },
      { metric: 'planning_quality', threshold: 0.6, weight: 0.2 }
    ],
    
    tags: ['minedojo', 'intermediate', 'food', 'crafting', 'survival'],
    difficulty: 5,
    estimatedSteps: 10,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: false,
    
    timeLimit: 120000,
    maxAttempts: 2,
    allowPartialCredit: true
  }
];

/**
 * Tool Crafting and Technology Progression Tasks
 */
export const toolCraftingScenarios: Scenario[] = [
  {
    id: 'minedojo_stone_age',
    name: 'Stone Age Progression',
    description: 'Progress from wooden tools to stone tools through mining and crafting',
    domain: 'resource',
    complexity: 'advanced',
    expectedDuration: 180000,
    
    initialState: {
      biome: 'mountains',
      position: { x: 0, y: 64, z: 0 },
      inventory: { wood: 20 },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear',
      nearby_entities: ['stone', 'coal_ore', 'iron_ore'],
      tools: []
    },
    
    goalConditions: [
      'craft_wooden_pickaxe',
      'mine_cobblestone_20',
      'craft_stone_pickaxe',
      'craft_stone_sword',
      'craft_stone_axe'
    ],
    constraints: ['tool_durability', 'resource_efficiency', 'crafting_recipes'],
    resources: { time: 240, health: 20, hunger: 20, durability: 200 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'efficiency', threshold: 0.8, weight: 0.3 },
      { metric: 'planning_quality', threshold: 0.7, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'advanced', 'crafting', 'mining', 'progression'],
    difficulty: 6,
    estimatedSteps: 15,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 240000,
    maxAttempts: 2,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_iron_age',
    name: 'Iron Age Advancement',
    description: 'Advance to iron tools by mining, smelting, and advanced crafting',
    domain: 'resource',
    complexity: 'expert',
    expectedDuration: 300000,
    
    initialState: {
      biome: 'mountains',
      position: { x: 0, y: 32, z: 0 },
      inventory: { wood: 30, stone_pickaxe: 1, stone_sword: 1 },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear',
      nearby_entities: ['iron_ore', 'coal_ore', 'lava', 'water'],
      underground_level: 32
    },
    
    goalConditions: [
      'mine_iron_ore_10',
      'mine_coal_10',
      'craft_furnace',
      'smelt_iron_ingots_10',
      'craft_iron_pickaxe',
      'craft_iron_sword',
      'craft_iron_armor_piece'
    ],
    constraints: ['underground_navigation', 'fuel_management', 'smelting_time', 'monster_encounters'],
    resources: { time: 360, health: 20, hunger: 20, fuel: 20, light: 64 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.2 },
      { metric: 'robustness', threshold: 0.8, weight: 0.2 },
      { metric: 'planning_quality', threshold: 0.8, weight: 0.2 }
    ],
    
    tags: ['minedojo', 'expert', 'mining', 'smelting', 'underground', 'progression'],
    difficulty: 8,
    estimatedSteps: 20,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 360000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Complex Building and Architecture Tasks
 */
export const buildingScenarios: Scenario[] = [
  {
    id: 'minedojo_house_construction',
    name: 'Multi-Room House Construction',
    description: 'Build a functional house with multiple rooms, doors, windows, and furniture',
    domain: 'spatial',
    complexity: 'advanced',
    expectedDuration: 240000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: {
        wood: 100,
        stone: 50,
        glass: 20,
        door: 3,
        bed: 1,
        crafting_table: 1,
        furnace: 1
      },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear',
      building_area: { x: 20, z: 20 }
    },
    
    goalConditions: [
      'build_foundation_10x8',
      'build_walls_with_windows',
      'build_roof',
      'create_bedroom',
      'create_kitchen',
      'create_storage_room',
      'install_doors',
      'add_lighting'
    ],
    constraints: ['structural_integrity', 'aesthetic_design', 'functional_layout', 'resource_efficiency'],
    resources: { time: 300, materials: 200, space: 160 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 0.9, weight: 0.3 },
      { metric: 'creativity', threshold: 0.7, weight: 0.2 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.2 },
      { metric: 'planning_quality', threshold: 0.8, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'advanced', 'building', 'architecture', 'multi-room'],
    difficulty: 7,
    estimatedSteps: 25,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 300000,
    maxAttempts: 2,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_redstone_automation',
    name: 'Redstone Automation System',
    description: 'Build an automated farm using redstone circuits and mechanisms',
    domain: 'logical',
    complexity: 'expert',
    expectedDuration: 360000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: {
        redstone: 50,
        redstone_repeater: 10,
        redstone_comparator: 5,
        piston: 8,
        hopper: 6,
        water_bucket: 2,
        seeds: 20,
        dirt: 40
      },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear'
    },
    
    goalConditions: [
      'create_farm_plot_9x9',
      'build_water_irrigation',
      'create_automatic_harvester',
      'build_collection_system',
      'implement_replanting_mechanism',
      'test_full_automation_cycle'
    ],
    constraints: ['redstone_logic', 'timing_circuits', 'mechanical_precision', 'resource_optimization'],
    resources: { time: 420, redstone_power: 100, mechanisms: 30 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'complexity', threshold: 0.8, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.7, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'expert', 'redstone', 'automation', 'engineering', 'logic'],
    difficulty: 9,
    estimatedSteps: 30,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 420000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Exploration and Adventure Tasks
 */
export const explorationScenarios: Scenario[] = [
  {
    id: 'minedojo_cave_exploration',
    name: 'Deep Cave Exploration',
    description: 'Explore a cave system, map the layout, and return with valuable resources',
    domain: 'spatial',
    complexity: 'advanced',
    expectedDuration: 180000,
    
    initialState: {
      biome: 'mountains',
      position: { x: 0, y: 64, z: 0 },
      inventory: {
        torch: 20,
        iron_pickaxe: 1,
        iron_sword: 1,
        food: 10,
        map: 1,
        compass: 1
      },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear',
      cave_entrance: { x: 10, y: 45, z: 5 },
      cave_depth: 30
    },
    
    goalConditions: [
      'enter_cave_system',
      'explore_3_branches',
      'map_cave_layout',
      'collect_rare_ores',
      'avoid_monster_damage',
      'return_to_surface'
    ],
    constraints: ['light_management', 'navigation_tracking', 'monster_encounters', 'resource_conservation'],
    resources: { time: 240, light: 20, health: 20, hunger: 20 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 0.8, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.6, weight: 0.2 },
      { metric: 'robustness', threshold: 0.8, weight: 0.3 },
      { metric: 'spatial_awareness', threshold: 0.7, weight: 0.2 }
    ],
    
    tags: ['minedojo', 'advanced', 'exploration', 'navigation', 'underground', 'mapping'],
    difficulty: 7,
    estimatedSteps: 18,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 240000,
    maxAttempts: 2,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_nether_expedition',
    name: 'Nether Expedition',
    description: 'Build a nether portal, explore the nether, and return with nether resources',
    domain: 'hybrid',
    complexity: 'expert',
    expectedDuration: 480000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: {
        diamond_pickaxe: 1,
        diamond_sword: 1,
        iron_armor_set: 1,
        obsidian: 14,
        flint_and_steel: 1,
        fire_resistance_potion: 2,
        food: 20,
        building_blocks: 50
      },
      health: 20,
      hunger: 20,
      time_of_day: 'day',
      weather: 'clear'
    },
    
    goalConditions: [
      'build_nether_portal',
      'enter_nether_dimension',
      'build_safe_base_in_nether',
      'collect_nether_wart',
      'collect_blaze_rods',
      'mine_nether_quartz',
      'return_to_overworld_safely'
    ],
    constraints: ['dimensional_travel', 'hostile_environment', 'lava_hazards', 'aggressive_mobs'],
    resources: { time: 600, health: 20, hunger: 20, fire_resistance: 2 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 0.9, weight: 0.4 },
      { metric: 'robustness', threshold: 0.9, weight: 0.3 },
      { metric: 'efficiency', threshold: 0.6, weight: 0.2 },
      { metric: 'adaptability', threshold: 0.8, weight: 0.1 }
    ],
    
    tags: ['minedojo', 'expert', 'nether', 'dimensional-travel', 'high-risk', 'advanced-exploration'],
    difficulty: 10,
    estimatedSteps: 35,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 600000,
    maxAttempts: 1,
    allowPartialCredit: false
  }
];

/**
 * Social and Multiplayer Scenarios
 */
export const multiplayerScenarios: Scenario[] = [
  {
    id: 'minedojo_collaborative_build',
    name: 'Collaborative Mega-Build',
    description: 'Coordinate with 3 other agents to build a large castle with specialized roles',
    domain: 'social',
    complexity: 'expert',
    expectedDuration: 600000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      team: {
        architect: 'agent_1', // Plans and oversees
        builder: 'agent_2',   // Constructs structures
        gatherer: 'agent_3',  // Collects resources
        decorator: 'self'     // Interior design and details
      },
      shared_inventory: {
        stone: 500,
        wood: 300,
        glass: 100,
        decorative_blocks: 50
      },
      individual_inventory: {
        tools: ['iron_pickaxe', 'iron_axe', 'iron_shovel'],
        materials: 50
      },
      build_area: { x: 50, z: 50, y: 30 },
      communication_channel: 'team_chat'
    },
    
    goalConditions: [
      'coordinate_team_roles',
      'design_castle_blueprint',
      'build_main_structure',
      'build_towers_4',
      'create_interior_rooms',
      'add_decorative_elements',
      'complete_within_timeline'
    ],
    constraints: ['role_specialization', 'resource_sharing', 'communication_efficiency', 'coordination_overhead'],
    resources: { time: 720, shared_materials: 1000, coordination_points: 100 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 0.9, weight: 0.3 },
      { metric: 'social_coordination', threshold: 0.8, weight: 0.3 },
      { metric: 'creativity', threshold: 0.7, weight: 0.2 },
      { metric: 'efficiency', threshold: 0.6, weight: 0.2 }
    ],
    
    tags: ['minedojo', 'expert', 'multiplayer', 'collaboration', 'mega-build', 'coordination'],
    difficulty: 9,
    estimatedSteps: 40,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 720000,
    maxAttempts: 1,
    allowPartialCredit: true
  }
];

/**
 * Creative and Open-Ended Challenges
 */
export const creativeScenarios: Scenario[] = [
  {
    id: 'minedojo_pixel_art',
    name: 'Large-Scale Pixel Art Creation',
    description: 'Create a recognizable pixel art image using colored blocks in a 32x32 grid',
    domain: 'creative',
    complexity: 'advanced',
    expectedDuration: 300000,
    
    initialState: {
      biome: 'plains',
      position: { x: 0, y: 64, z: 0 },
      inventory: {
        colored_wool: { white: 100, black: 100, red: 50, blue: 50, green: 50, yellow: 50 },
        concrete: { white: 50, black: 50, red: 25, blue: 25, green: 25, yellow: 25 },
        scaffolding: 200
      },
      canvas_area: { x: 32, z: 32, y: 1 },
      reference_image: 'minecraft_creeper', // Provided as goal
      artistic_freedom: true
    },
    
    goalConditions: [
      'create_32x32_canvas',
      'implement_reference_design',
      'use_appropriate_colors',
      'maintain_proportions',
      'add_creative_elements'
    ],
    constraints: ['color_palette_limited', 'grid_precision', 'artistic_interpretation'],
    resources: { time: 360, blocks: 500, creativity_points: 100 },
    
    successCriteria: [
      { metric: 'accuracy', threshold: 0.8, weight: 0.3 },
      { metric: 'creativity', threshold: 0.7, weight: 0.4 },
      { metric: 'completeness', threshold: 0.9, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'advanced', 'creative', 'pixel-art', 'artistic', 'precision'],
    difficulty: 6,
    estimatedSteps: 20,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 360000,
    maxAttempts: 2,
    allowPartialCredit: true
  },

  {
    id: 'minedojo_working_calculator',
    name: 'Redstone Calculator Construction',
    description: 'Build a functional calculator using redstone that can perform basic arithmetic',
    domain: 'logical',
    complexity: 'emergent',
    expectedDuration: 720000,
    
    initialState: {
      biome: 'flat_world',
      position: { x: 0, y: 4, z: 0 },
      inventory: {
        redstone: 200,
        redstone_repeater: 50,
        redstone_comparator: 30,
        redstone_torch: 100,
        lever: 20,
        button: 10,
        lamp: 20,
        building_blocks: 500
      },
      build_area: { x: 50, z: 50, y: 20 },
      calculator_requirements: {
        operations: ['addition', 'subtraction', 'multiplication'],
        input_bits: 4,
        output_display: 'binary_lamps'
      }
    },
    
    goalConditions: [
      'design_input_system',
      'implement_addition_circuit',
      'implement_subtraction_circuit',
      'implement_multiplication_circuit',
      'create_output_display',
      'test_all_operations',
      'demonstrate_complex_calculation'
    ],
    constraints: ['redstone_logic_gates', 'signal_timing', 'circuit_optimization', 'space_efficiency'],
    resources: { time: 900, redstone_components: 400, logic_complexity: 1000 },
    
    successCriteria: [
      { metric: 'completeness', threshold: 1.0, weight: 0.4 },
      { metric: 'complexity', threshold: 0.9, weight: 0.3 },
      { metric: 'accuracy', threshold: 1.0, weight: 0.3 }
    ],
    
    tags: ['minedojo', 'emergent', 'redstone', 'calculator', 'logic-circuits', 'engineering'],
    difficulty: 10,
    estimatedSteps: 50,
    requiresMemory: true,
    requiresPlanning: true,
    requiresLearning: true,
    
    timeLimit: 900000,
    maxAttempts: 1,
    allowPartialCredit: false
  }
];

/**
 * All MineDojo scenarios organized by category
 */
export const allMinedojoScenarios: Scenario[] = [
  ...basicSurvivalScenarios,
  ...toolCraftingScenarios,
  ...buildingScenarios,
  ...explorationScenarios,
  ...multiplayerScenarios,
  ...creativeScenarios
];

/**
 * MineDojo scenarios organized by complexity level
 */
export const minedojoScenariosByComplexity: Record<ComplexityLevel, Scenario[]> = {
  basic: allMinedojoScenarios.filter(s => s.complexity === 'basic'),
  intermediate: allMinedojoScenarios.filter(s => s.complexity === 'intermediate'),
  advanced: allMinedojoScenarios.filter(s => s.complexity === 'advanced'),
  expert: allMinedojoScenarios.filter(s => s.complexity === 'expert'),
  emergent: allMinedojoScenarios.filter(s => s.complexity === 'emergent')
};

/**
 * MineDojo scenarios organized by domain
 */
export const minedojoScenariosByDomain: Record<ReasoningDomain, Scenario[]> = {
  spatial: allMinedojoScenarios.filter(s => s.domain === 'spatial'),
  logical: allMinedojoScenarios.filter(s => s.domain === 'logical'),
  causal: allMinedojoScenarios.filter(s => s.domain === 'causal'),
  social: allMinedojoScenarios.filter(s => s.domain === 'social'),
  resource: allMinedojoScenarios.filter(s => s.domain === 'resource'),
  temporal: allMinedojoScenarios.filter(s => s.domain === 'temporal'),
  creative: allMinedojoScenarios.filter(s => s.domain === 'creative'),
  ethical: allMinedojoScenarios.filter(s => s.domain === 'ethical'),
  meta_cognitive: allMinedojoScenarios.filter(s => s.domain === 'meta_cognitive'),
  hybrid: allMinedojoScenarios.filter(s => s.domain === 'hybrid')
};

/**
 * MineDojo curriculum progression - ordered scenarios for skill development
 */
export const minedojoCurriculumProgression: Scenario[] = [
  // Foundation Skills
  allMinedojoScenarios.find(s => s.id === 'minedojo_wood_collection')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_first_shelter')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_food_procurement')!,
  
  // Tool Progression
  allMinedojoScenarios.find(s => s.id === 'minedojo_stone_age')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_iron_age')!,
  
  // Building Skills
  allMinedojoScenarios.find(s => s.id === 'minedojo_house_construction')!,
  
  // Exploration
  allMinedojoScenarios.find(s => s.id === 'minedojo_cave_exploration')!,
  
  // Advanced Skills
  allMinedojoScenarios.find(s => s.id === 'minedojo_redstone_automation')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_pixel_art')!,
  
  // Expert Challenges
  allMinedojoScenarios.find(s => s.id === 'minedojo_nether_expedition')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_collaborative_build')!,
  allMinedojoScenarios.find(s => s.id === 'minedojo_working_calculator')!
];

/**
 * Export metadata about MineDojo scenarios
 */
export const MINEDOJO_METADATA = {
  totalScenarios: allMinedojoScenarios.length,
  complexityDistribution: {
    basic: minedojoScenariosByComplexity.basic.length,
    intermediate: minedojoScenariosByComplexity.intermediate.length,
    advanced: minedojoScenariosByComplexity.advanced.length,
    expert: minedojoScenariosByComplexity.expert.length,
    emergent: minedojoScenariosByComplexity.emergent.length
  },
  domainDistribution: Object.fromEntries(
    Object.entries(minedojoScenariosByDomain).map(([domain, scenarios]) => [domain, scenarios.length])
  ),
  averageDifficulty: allMinedojoScenarios.reduce((sum, s) => sum + s.difficulty, 0) / allMinedojoScenarios.length,
  totalEstimatedDuration: allMinedojoScenarios.reduce((sum, s) => sum + s.expectedDuration, 0),
  curriculumLength: minedojoCurriculumProgression.length
};

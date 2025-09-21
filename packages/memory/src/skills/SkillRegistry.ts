/**
 * Voyager-Style Skill Registry - Manages reusable skills with metadata
 *
 * Implements a skill registry with pre/post conditions, metadata persistence,
 * skill composition and reuse tracking, and automatic curriculum generation.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  preconditions: Precondition[];
  postconditions: Postcondition[];
  argsSchema: any;
  implementation: string; // Path to BT implementation
  tests: string[]; // Paths to test files
  metadata: SkillMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface Precondition {
  id: string;
  condition: string;
  description: string;
  isSatisfied: (state: any) => boolean;
}

export interface Postcondition {
  id: string;
  condition: string;
  description: string;
  expectedOutcome: any;
}

export interface SkillMetadata {
  successRate: number;
  usageCount: number;
  averageExecutionTime: number;
  lastUsed: number;
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  dependencies: string[]; // Other skills this depends on
  transferable: boolean; // Can be used across worlds
}

export interface SkillComposition {
  id: string;
  name: string;
  skills: string[]; // Array of skill IDs
  composition: 'sequence' | 'parallel' | 'selector';
  metadata: SkillMetadata;
}

export interface CurriculumGoal {
  id: string;
  type: 'tech_progress' | 'exploration' | 'survival' | 'social';
  milestone: string;
  description: string;
  requiredSkills: string[];
  difficulty: number;
  completed: boolean;
}

// ============================================================================
// Skill Registry Implementation
// ============================================================================

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private compositions: Map<string, SkillComposition> = new Map();
  private curriculum: CurriculumGoal[] = [];
  private usageHistory: Array<{
    skillId: string;
    timestamp: number;
    success: boolean;
    duration: number;
  }> = [];

  constructor() {
    this.initializeDefaultSkills();
    this.initializeCurriculum();
  }

  /**
   * Register a new skill
   */
  registerSkill(
    skill: Omit<Skill, 'createdAt' | 'updatedAt' | 'metadata'>
  ): Skill {
    const now = Date.now();
    const fullSkill: Skill = {
      ...skill,
      createdAt: now,
      updatedAt: now,
      metadata: {
        successRate: 1.0,
        usageCount: 0,
        averageExecutionTime: 0,
        lastUsed: 0,
        tags: [],
        complexity: 'simple',
        dependencies: [],
        transferable: true,
      },
    };

    this.skills.set(skill.id, fullSkill);
    console.log(`✅ Skill registered: ${skill.id}`);
    return fullSkill;
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find skills that match given preconditions
   */
  findSkillsForPreconditions(state: any): Skill[] {
    return Array.from(this.skills.values()).filter((skill) =>
      skill.preconditions.every((precond) => precond.isSatisfied(state))
    );
  }

  /**
   * Record skill usage and update metadata
   */
  recordSkillUsage(skillId: string, success: boolean, duration: number): void {
    const skill = this.skills.get(skillId);
    if (!skill) {
      console.warn(
        `⚠️ Attempted to record usage for unknown skill: ${skillId}`
      );
      return;
    }

    // Update usage history
    this.usageHistory.push({
      skillId,
      timestamp: Date.now(),
      success,
      duration,
    });

    // Update skill metadata
    const recentUsage = this.usageHistory
      .filter((usage) => usage.skillId === skillId)
      .slice(-10); // Last 10 usages

    const successCount = recentUsage.filter((u) => u.success).length;
    const avgDuration =
      recentUsage.reduce((sum, u) => sum + u.duration, 0) / recentUsage.length;

    skill.metadata.successRate =
      recentUsage.length > 0 ? successCount / recentUsage.length : 1.0;
    skill.metadata.usageCount += 1;
    skill.metadata.averageExecutionTime = avgDuration;
    skill.metadata.lastUsed = Date.now();
    skill.updatedAt = Date.now();

    console.log(
      `📊 Skill usage recorded: ${skillId} (success: ${success}, duration: ${duration}ms)`
    );
  }

  /**
   * Create a skill composition
   */
  createComposition(
    composition: Omit<SkillComposition, 'metadata'>
  ): SkillComposition {
    const now = Date.now();
    const fullComposition: SkillComposition = {
      ...composition,
      metadata: {
        successRate: 1.0,
        usageCount: 0,
        averageExecutionTime: 0,
        lastUsed: 0,
        tags: ['composition'],
        complexity: 'moderate',
        dependencies: composition.skills,
        transferable: true,
      },
    };

    this.compositions.set(composition.id, fullComposition);
    console.log(`🔗 Skill composition created: ${composition.id}`);
    return fullComposition;
  }

  /**
   * Get skill reuse statistics
   */
  getSkillReuseStats(): {
    totalSkills: number;
    totalUsage: number;
    averageSuccessRate: number;
    mostUsedSkills: Array<{ skillId: string; usageCount: number }>;
    transferableSkills: number;
  } {
    const skills = Array.from(this.skills.values());
    const totalUsage = skills.reduce(
      (sum, skill) => sum + skill.metadata.usageCount,
      0
    );
    const averageSuccessRate =
      skills.length > 0
        ? skills.reduce((sum, skill) => sum + skill.metadata.successRate, 0) /
          skills.length
        : 0;

    const mostUsedSkills = skills
      .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount)
      .slice(0, 5)
      .map((skill) => ({
        skillId: skill.id,
        usageCount: skill.metadata.usageCount,
      }));

    const transferableSkills = skills.filter(
      (skill) => skill.metadata.transferable
    ).length;

    return {
      totalSkills: skills.length,
      totalUsage,
      averageSuccessRate,
      mostUsedSkills,
      transferableSkills,
    };
  }

  /**
   * Generate automatic curriculum goals
   */
  generateCurriculumGoals(): CurriculumGoal[] {
    const goals: CurriculumGoal[] = [
      {
        id: 'goal-1',
        type: 'tech_progress',
        milestone: 'stone_tools',
        description: 'Progress to stone tools for better mining efficiency',
        requiredSkills: ['opt.chop_tree_safe', 'opt.craft_tool_tiered'],
        difficulty: 1,
        completed: false,
      },
      {
        id: 'goal-2',
        type: 'survival',
        milestone: 'safe_shelter',
        description: 'Build a safe shelter for night survival',
        requiredSkills: ['opt.shelter_basic'],
        difficulty: 1,
        completed: false,
      },
      {
        id: 'goal-3',
        type: 'tech_progress',
        milestone: 'iron_tools',
        description: 'Acquire iron tools for advanced mining',
        requiredSkills: [
          'opt.ore_ladder_iron',
          'opt.smelt_iron_basic',
          'opt.craft_tool_tiered',
        ],
        difficulty: 2,
        completed: false,
      },
      {
        id: 'goal-4',
        type: 'exploration',
        milestone: 'biome_exploration',
        description: 'Explore different biomes and log waypoints',
        requiredSkills: ['opt.biome_probe'],
        difficulty: 1,
        completed: false,
      },
      {
        id: 'goal-5',
        type: 'survival',
        milestone: 'food_sustainability',
        description: 'Establish sustainable food sources',
        requiredSkills: ['opt.food_pipeline_starter'],
        difficulty: 2,
        completed: false,
      },
    ];

    this.curriculum = goals;
    return goals;
  }

  /**
   * Get next curriculum goal based on current progress
   */
  getNextCurriculumGoal(completedSkills: string[]): CurriculumGoal | null {
    const availableGoals = this.curriculum.filter((goal) => !goal.completed);

    // Sort by difficulty and required skills availability
    const sortedGoals = availableGoals.sort((a, b) => {
      const aSkillsAvailable = a.requiredSkills.every((skill) =>
        completedSkills.includes(skill)
      );
      const bSkillsAvailable = b.requiredSkills.every((skill) =>
        completedSkills.includes(skill)
      );

      if (aSkillsAvailable && !bSkillsAvailable) return -1;
      if (!aSkillsAvailable && bSkillsAvailable) return 1;

      return a.difficulty - b.difficulty;
    });

    return sortedGoals[0] || null;
  }

  /**
   * Mark a curriculum goal as completed
   */
  completeCurriculumGoal(goalId: string): void {
    const goal = this.curriculum.find((g) => g.id === goalId);
    if (goal) {
      goal.completed = true;
      console.log(`🎯 Curriculum goal completed: ${goal.milestone}`);
    }
  }

  /**
   * Export skill registry for persistence
   */
  export(): {
    skills: Skill[];
    compositions: SkillComposition[];
    curriculum: CurriculumGoal[];
    usageHistory: Array<{
      skillId: string;
      timestamp: number;
      success: boolean;
      duration: number;
    }>;
  } {
    return {
      skills: Array.from(this.skills.values()),
      compositions: Array.from(this.compositions.values()),
      curriculum: this.curriculum,
      usageHistory: this.usageHistory,
    };
  }

  /**
   * Import skill registry from persistence
   */
  import(data: ReturnType<typeof this.export>): void {
    this.skills.clear();
    this.compositions.clear();

    data.skills.forEach((skill) => this.skills.set(skill.id, skill));
    data.compositions.forEach((comp) => this.compositions.set(comp.id, comp));
    this.curriculum = data.curriculum;
    this.usageHistory = data.usageHistory;

    console.log(
      `📥 Skill registry imported: ${this.skills.size} skills, ${this.compositions.size} compositions`
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private initializeDefaultSkills(): void {
    // Register the first ten skills as specified in the working specs
    const defaultSkills = [
      {
        id: 'opt.shelter_basic',
        name: 'Basic Shelter',
        description:
          'Safe, lighted 3×3×2 shelter with door; used at dusk or danger',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'wood>=N || reachable_trees',
            description: 'Have wood or access to trees',
            isSatisfied: (state: any) => true, // TODO: Implement actual precondition condition checking
          },
          {
            id: 'pre-2',
            condition: 'time≈dusk || hostiles_detected',
            description: 'Time is dusk or hostiles are detected',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'shelter_built',
            description: 'Safe shelter is constructed',
            expectedOutcome: { shelter: true, lighted: true, door: true },
          },
        ],
        argsSchema: z.object({
          size: z
            .object({ x: z.number(), y: z.number(), z: z.number() })
            .default({ x: 3, y: 2, z: 3 }),
          includeDoor: z.boolean().default(true),
          includeLighting: z.boolean().default(true),
        }),
        implementation: 'bt/shelter_basic.json',
        tests: ['tests/shelter_basic.spec.ts'],
      },
      {
        id: 'opt.chop_tree_safe',
        name: 'Safe Tree Chopping',
        description: 'Gather N logs from target species with safety checks',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'axe>=wood',
            description: 'Have appropriate axe tool',
            isSatisfied: (state: any) => true,
          },
          {
            id: 'pre-2',
            condition: 'light≥7 || torch_in_inventory',
            description: 'Sufficient lighting',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'inventory.log>=N',
            description: 'Required number of logs obtained',
            expectedOutcome: { logs: '>=N' },
          },
        ],
        argsSchema: z.object({
          tree: z.enum([
            'oak',
            'birch',
            'spruce',
            'jungle',
            'acacia',
            'dark_oak',
          ]),
          N: z.number().min(1).default(8),
        }),
        implementation: 'bt/chop_tree_safe.json',
        tests: ['tests/chop_tree_safe.spec.ts'],
      },
      {
        id: 'opt.ore_ladder_iron',
        name: 'Iron Ore Mining',
        description:
          'Acquire iron: locate veins, mine with stone pick, ascend safely',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'stone_pick',
            description: 'Have stone pickaxe',
            isSatisfied: (state: any) => true,
          },
          {
            id: 'pre-2',
            condition: 'torches && food≥m',
            description: 'Have torches and sufficient food',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'iron_ore>=Y',
            description: 'Required iron ore obtained',
            expectedOutcome: { iron_ore: '>=Y' },
          },
        ],
        argsSchema: z.object({
          targetAmount: z.number().min(1).default(16),
          maxDepth: z.number().min(1).max(50).default(20),
        }),
        implementation: 'bt/ore_ladder_iron.json',
        tests: ['tests/ore_ladder_iron.spec.ts'],
      },
      {
        id: 'opt.smelt_iron_basic',
        name: 'Basic Iron Smelting',
        description: 'Smelt iron ore using coal/charcoal; craft ingots',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'furnace_present || craftable',
            description: 'Furnace available or can be crafted',
            isSatisfied: (state: any) => true,
          },
          {
            id: 'pre-2',
            condition: 'fuel≥X && iron_ore≥Y',
            description: 'Have sufficient fuel and iron ore',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'iron_ingot≥Y',
            description: 'Required iron ingots obtained',
            expectedOutcome: { iron_ingot: '>=Y' },
          },
        ],
        argsSchema: z.object({
          targetIngots: z.number().min(1).default(8),
          fuelType: z.enum(['coal', 'charcoal', 'wood']).default('coal'),
        }),
        implementation: 'bt/smelt_iron_basic.json',
        tests: ['tests/smelt_iron_basic.spec.ts'],
      },
      {
        id: 'opt.craft_tool_tiered',
        name: 'Tiered Tool Crafting',
        description:
          'Craft requested tool at the highest valid tier (wood→stone→iron)',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'recipe_dependencies_verified',
            description: 'Recipe dependencies are available',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'tool_crafted_at_highest_tier',
            description: 'Tool crafted at highest available tier',
            expectedOutcome: { tool: 'crafted', tier: 'highest_available' },
          },
        ],
        argsSchema: z.object({
          toolType: z.enum(['pickaxe', 'axe', 'shovel', 'hoe', 'sword']),
          preferredTier: z
            .enum(['wood', 'stone', 'iron', 'diamond'])
            .optional(),
        }),
        implementation: 'bt/craft_tool_tiered.json',
        tests: ['tests/craft_tool_tiered.spec.ts'],
      },
      {
        id: 'opt.food_pipeline_starter',
        name: 'Starter Food Pipeline',
        description:
          'Satisfy hunger via nearest viable path (cook meat, bread, berries)',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'biome_checked && food_sources_available',
            description: 'Biome checked and food sources available',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'saturation≥target',
            description: 'Hunger satisfied to target level',
            expectedOutcome: { saturation: '>=target' },
          },
        ],
        argsSchema: z.object({
          targetSaturation: z.number().min(1).max(20).default(10),
          preferredFood: z
            .enum(['meat', 'bread', 'berries', 'any'])
            .default('any'),
        }),
        implementation: 'bt/food_pipeline_starter.json',
        tests: ['tests/food_pipeline_starter.spec.ts'],
      },
      {
        id: 'opt.torch_corridor',
        name: 'Torch Corridor',
        description:
          'Torch a mining corridor every 6 blocks; place barricade every 30m',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'torches_available',
            description: 'Have sufficient torches',
            isSatisfied: (state: any) => true,
          },
          {
            id: 'pre-2',
            condition: 'mining_corridor_identified',
            description: 'Mining corridor is identified',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'corridor_lighted_and_barricaded',
            description: 'Corridor is properly lighted and barricaded',
            expectedOutcome: { lighted: true, barricaded: true },
          },
        ],
        argsSchema: z.object({
          corridorLength: z.number().min(1).default(30),
          torchSpacing: z.number().min(1).max(10).default(6),
          barricadeSpacing: z.number().min(10).max(50).default(30),
        }),
        implementation: 'bt/torch_corridor.json',
        tests: ['tests/torch_corridor.spec.ts'],
      },
      {
        id: 'opt.bridge_gap_safe',
        name: 'Safe Gap Bridging',
        description:
          'Traverse ravines safely with crouch-place; optional rails later',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'building_blocks_available',
            description: 'Have sufficient building blocks',
            isSatisfied: (state: any) => true,
          },
          {
            id: 'pre-2',
            condition: 'gap_analyzed',
            description: 'Gap has been analyzed for safety',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'gap_safely_crossed',
            description: 'Gap has been safely crossed',
            expectedOutcome: { crossed: true, safe: true },
          },
        ],
        argsSchema: z.object({
          includeRails: z.boolean().default(false),
          bridgeWidth: z.number().min(1).max(3).default(1),
          safetyChecks: z.boolean().default(true),
        }),
        implementation: 'bt/bridge_gap_safe.json',
        tests: ['tests/bridge_gap_safe.spec.ts'],
      },
      {
        id: 'opt.biome_probe',
        name: 'Biome Exploration',
        description:
          'Explore in a star pattern; log waypoints & semantic facts',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'exploration_ready',
            description: 'Ready for exploration (food, tools, safety)',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'semantic_facts_logged',
            description: 'Semantic facts and waypoints logged',
            expectedOutcome: { waypoints: 'logged', facts: 'recorded' },
          },
        ],
        argsSchema: z.object({
          explorationRadius: z.number().min(100).max(1000).default(500),
          starPatternArms: z.number().min(4).max(8).default(6),
          logStructures: z.boolean().default(true),
        }),
        implementation: 'bt/biome_probe.json',
        tests: ['tests/biome_probe.spec.ts'],
      },
      {
        id: 'opt.emergency_retreat_and_block',
        name: 'Emergency Retreat and Block',
        description:
          'Hard abort: path back along breadcrumbs; block behind; heal',
        preconditions: [
          {
            id: 'pre-1',
            condition: 'danger_detected',
            description: 'Danger has been detected',
            isSatisfied: (state: any) => true,
          },
        ],
        postconditions: [
          {
            id: 'post-1',
            condition: 'safely_retreated_and_healed',
            description: 'Successfully retreated and healed',
            expectedOutcome: { retreated: true, healed: true, blocked: true },
          },
        ],
        argsSchema: z.object({
          retreatDistance: z.number().min(10).max(100).default(50),
          blockBehind: z.boolean().default(true),
          healThreshold: z.number().min(1).max(20).default(10),
        }),
        implementation: 'bt/emergency_retreat_and_block.json',
        tests: ['tests/emergency_retreat_and_block.spec.ts'],
      },
    ];

    defaultSkills.forEach((skill) => this.registerSkill(skill));
  }

  private initializeCurriculum(): void {
    this.generateCurriculumGoals();
  }
}

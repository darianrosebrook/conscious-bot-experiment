/**
 * Curriculum Builder
 *
 * Designs and manages progressive learning curricula for agent development.
 * Handles learning objective definition, skill dependency mapping, and
 * adaptive pathway personalization.
 *
 * @author @darianrosebrook
 */

import {
  LearningObjective,
  LearningCurriculum,
  DependencyGraph,
  DependencyEdge,
  DifficultyProgression,
  DifficultyLevel,
  DifficultyTransition,
  TransitionCondition,
  AssessmentRequirement,
  AdaptiveRule,
  AdaptiveCondition,
  AdaptiveAction,
  Skill,
  SkillCategory,
  CurriculumConfig,
  DEFAULT_CURRICULUM_CONFIG,
} from './types';

/**
 * Result of curriculum design operation
 */
export interface CurriculumDesignResult {
  curriculum: LearningCurriculum;
  dependencyAnalysis: DependencyAnalysis;
  difficultyCalibration: DifficultyCalibration;
  adaptiveRules: AdaptiveRule[];
  warnings: string[];
}

/**
 * Analysis of skill dependencies
 */
export interface DependencyAnalysis {
  cycles: string[][];
  criticalPath: string[];
  parallelPaths: string[][];
  bottlenecks: string[];
  estimatedDuration: number;
}

/**
 * Calibration of difficulty progression
 */
export interface DifficultyCalibration {
  levels: DifficultyLevel[];
  transitions: DifficultyTransition[];
  estimatedTimePerLevel: number;
  successRates: Record<number, number>;
}

/**
 * Curriculum builder for progressive skill development
 */
export class CurriculumBuilder {
  private config: CurriculumConfig;
  private objectives: Map<string, LearningObjective> = new Map();
  private skills: Map<string, Skill> = new Map();
  private curricula: Map<string, LearningCurriculum> = new Map();

  constructor(config: Partial<CurriculumConfig> = {}) {
    this.config = { ...DEFAULT_CURRICULUM_CONFIG, ...config };
  }

  /**
   * Design comprehensive learning curriculum for domain
   */
  async designLearningCurriculum(
    domain: string,
    skillRequirements: string[],
    targetDifficulty: number = 5
  ): Promise<CurriculumDesignResult> {
    try {
      // Step 1: Define learning objectives
      const objectives = await this.defineLearningObjectives(
        domain,
        skillRequirements
      );

      // Step 2: Map skill dependencies
      const dependencyGraph = await this.mapSkillDependencies(objectives);

      // Step 3: Calibrate difficulty progression
      const difficultyProgression = await this.calibrateDifficultyProgression(
        objectives,
        targetDifficulty
      );

      // Step 4: Generate adaptive rules
      const adaptiveRules = await this.generateAdaptiveRules(objectives);

      // Step 5: Create curriculum
      const curriculum: LearningCurriculum = {
        id: `curriculum_${domain}_${Date.now()}`,
        name: `${domain} Learning Curriculum`,
        description: `Progressive learning curriculum for ${domain} skills`,
        domain,
        objectives,
        skillDependencies: dependencyGraph,
        difficultyProgression,
        estimatedDuration: this.calculateEstimatedDuration(
          objectives,
          dependencyGraph
        ),
        version: '1.0.0',
        metadata: {
          targetDifficulty,
          skillRequirements,
          createdAt: Date.now(),
        },
      };

      // Step 6: Analyze dependencies
      const dependencyAnalysis = this.analyzeDependencies(dependencyGraph);

      // Step 7: Calibrate difficulty
      const difficultyCalibration = this.calibrateDifficulty(
        difficultyProgression
      );

      // Store curriculum
      this.curricula.set(curriculum.id, curriculum);

      return {
        curriculum,
        dependencyAnalysis,
        difficultyCalibration,
        adaptiveRules,
        warnings: [],
      };
    } catch (error) {
      console.error('Error designing curriculum:', error);
      throw new Error(
        `Failed to design curriculum for domain ${domain}: ${error}`
      );
    }
  }

  /**
   * Define learning objectives for domain
   */
  private async defineLearningObjectives(
    domain: string,
    skillRequirements: string[]
  ): Promise<LearningObjective[]> {
    const objectives: LearningObjective[] = [];

    // Generate objectives based on domain and skill requirements
    for (const skillId of skillRequirements) {
      const skill = this.skills.get(skillId);
      if (!skill) {
        continue;
      }

      const objective: LearningObjective = {
        id: `objective_${skillId}`,
        title: `Master ${skill.name}`,
        description: `Develop proficiency in ${skill.description}`,
        domain,
        difficulty: skill.complexity,
        prerequisites: skill.dependencies,
        assessmentCriteria: this.generateAssessmentCriteria(skill),
        estimatedDuration: this.estimateObjectiveDuration(skill),
        tags: [skill.category, domain],
        metadata: {
          skillId,
          category: skill.category,
        },
      };

      objectives.push(objective);
      this.objectives.set(objective.id, objective);
    }

    return objectives;
  }

  /**
   * Map dependencies between skills and objectives
   */
  private async mapSkillDependencies(
    objectives: LearningObjective[]
  ): Promise<DependencyGraph> {
    const nodes: string[] = [];
    const edges: DependencyEdge[] = [];
    const cycles: string[][] = [];

    // Add all objective IDs as nodes
    for (const objective of objectives) {
      nodes.push(objective.id);
    }

    // Create dependency edges
    for (const objective of objectives) {
      for (const prerequisiteId of objective.prerequisites) {
        const edge: DependencyEdge = {
          from: prerequisiteId,
          to: objective.id,
          type: 'prerequisite',
          strength: 0.8, // Strong prerequisite dependency
        };
        edges.push(edge);
      }
    }

    // Detect cycles
    const detectedCycles = this.detectCycles(nodes, edges);
    cycles.push(...detectedCycles);

    // Generate topological order
    const topologicalOrder = this.generateTopologicalOrder(nodes, edges);

    return {
      nodes,
      edges,
      cycles,
      topologicalOrder,
    };
  }

  /**
   * Calibrate difficulty progression for optimal learning
   */
  private async calibrateDifficultyProgression(
    objectives: LearningObjective[],
    targetDifficulty: number
  ): Promise<DifficultyProgression> {
    const levels: DifficultyLevel[] = [];
    const transitions: DifficultyTransition[] = [];

    // Group objectives by difficulty
    const difficultyGroups = this.groupObjectivesByDifficulty(objectives);

    // Create difficulty levels
    for (let level = 1; level <= 10; level++) {
      const levelObjectives = difficultyGroups[level] || [];

      if (levelObjectives.length > 0) {
        const difficultyLevel: DifficultyLevel = {
          level,
          name: this.getDifficultyLevelName(level),
          description: `Level ${level} - ${this.getDifficultyLevelDescription(level)}`,
          skillRequirements: levelObjectives.map((obj) => obj.id),
          assessmentThreshold: this.calculateAssessmentThreshold(level),
          estimatedTime: this.estimateLevelDuration(levelObjectives),
        };
        levels.push(difficultyLevel);
      }
    }

    // Create transitions between levels
    for (let i = 0; i < levels.length - 1; i++) {
      const currentLevel = levels[i];
      const nextLevel = levels[i + 1];

      const transition: DifficultyTransition = {
        fromLevel: currentLevel.level,
        toLevel: nextLevel.level,
        conditions: this.generateTransitionConditions(currentLevel),
        assessment: this.generateAssessmentRequirement(currentLevel),
      };
      transitions.push(transition);
    }

    // Generate adaptive rules
    const adaptiveRules = await this.generateAdaptiveRules(objectives);

    return {
      levels,
      transitions,
      adaptiveRules,
    };
  }

  /**
   * Generate adaptive rules for personalized learning
   */
  private async generateAdaptiveRules(
    objectives: LearningObjective[]
  ): Promise<AdaptiveRule[]> {
    const rules: AdaptiveRule[] = [];

    // Rule 1: Adjust difficulty based on performance
    const performanceRule: AdaptiveRule = {
      id: 'performance_adjustment',
      condition: {
        metric: 'objective_success_rate',
        operator: 'lt',
        threshold: 0.7,
        timeWindow: 3600, // 1 hour
      },
      action: {
        type: 'adjust_difficulty',
        parameters: { adjustment: -1 },
      },
      priority: 1,
    };
    rules.push(performanceRule);

    // Rule 2: Repeat objectives for low performance
    const repeatRule: AdaptiveRule = {
      id: 'repeat_low_performance',
      condition: {
        metric: 'objective_score',
        operator: 'lt',
        threshold: 0.6,
        timeWindow: 1800, // 30 minutes
      },
      action: {
        type: 'repeat_objective',
        parameters: { maxAttempts: 3 },
      },
      priority: 2,
    };
    rules.push(repeatRule);

    // Rule 3: Skip objectives for high performance
    const skipRule: AdaptiveRule = {
      id: 'skip_high_performance',
      condition: {
        metric: 'objective_score',
        operator: 'gte',
        threshold: 0.9,
        timeWindow: 900, // 15 minutes
      },
      action: {
        type: 'skip_objective',
        parameters: { confidence: 0.8 },
      },
      priority: 3,
    };
    rules.push(skipRule);

    // Rule 4: Add support for struggling learners
    const supportRule: AdaptiveRule = {
      id: 'add_support',
      condition: {
        metric: 'time_spent_on_objective',
        operator: 'gt',
        threshold: 1800, // 30 minutes
        timeWindow: 3600, // 1 hour
      },
      action: {
        type: 'add_support',
        parameters: { supportType: 'hints', frequency: 'increased' },
      },
      priority: 4,
    };
    rules.push(supportRule);

    return rules;
  }

  /**
   * Add skill to curriculum builder
   */
  addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Add learning objective to curriculum builder
   */
  addObjective(objective: LearningObjective): void {
    this.objectives.set(objective.id, objective);
  }

  /**
   * Get curriculum by ID
   */
  getCurriculum(curriculumId: string): LearningCurriculum | undefined {
    return this.curricula.get(curriculumId);
  }

  /**
   * Get all curricula
   */
  getAllCurricula(): LearningCurriculum[] {
    return Array.from(this.curricula.values());
  }

  /**
   * Generate assessment criteria for skill
   */
  private generateAssessmentCriteria(skill: Skill): any[] {
    const criteria = [];

    // Functional assessment
    criteria.push({
      id: `functional_${skill.id}`,
      description: `Successfully perform ${skill.name} functions`,
      metric: 'functional_success_rate',
      threshold: 0.8,
      weight: 0.4,
      measurementMethod: 'automated',
    });

    // Performance assessment
    criteria.push({
      id: `performance_${skill.id}`,
      description: `Meet performance requirements for ${skill.name}`,
      metric: 'performance_score',
      threshold: 0.7,
      weight: 0.3,
      measurementMethod: 'automated',
    });

    // Integration assessment
    criteria.push({
      id: `integration_${skill.id}`,
      description: `Successfully integrate ${skill.name} with other skills`,
      metric: 'integration_success_rate',
      threshold: 0.6,
      weight: 0.3,
      measurementMethod: 'hybrid',
    });

    return criteria;
  }

  /**
   * Estimate duration for objective completion
   */
  private estimateObjectiveDuration(skill: Skill): number {
    // Base duration based on complexity
    let baseDuration = skill.complexity * 15; // 15 minutes per complexity level

    // Adjust based on category
    switch (skill.category) {
      case SkillCategory.PERCEPTION:
        baseDuration *= 0.8; // Perception skills are faster to learn
        break;
      case SkillCategory.COGNITION:
        baseDuration *= 1.2; // Cognitive skills take longer
        break;
      case SkillCategory.INTEGRATION:
        baseDuration *= 1.5; // Integration skills take longest
        break;
      default:
        // No adjustment for other categories
        break;
    }

    return Math.round(baseDuration);
  }

  /**
   * Detect cycles in dependency graph
   */
  private detectCycles(nodes: string[], edges: DependencyEdge[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart);
        cycles.push([...cycle]);
        return;
      }

      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      // Find all edges from this node
      const outgoingEdges = edges.filter((edge) => edge.from === node);
      for (const edge of outgoingEdges) {
        dfs(edge.to, [...path]);
      }

      recursionStack.delete(node);
    };

    for (const node of nodes) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  /**
   * Generate topological order for dependency graph
   */
  private generateTopologicalOrder(
    nodes: string[],
    edges: DependencyEdge[]
  ): string[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node, 0);
      graph.set(node, []);
    }

    // Build graph and calculate in-degrees
    for (const edge of edges) {
      const neighbors = graph.get(edge.from) || [];
      neighbors.push(edge.to);
      graph.set(edge.from, neighbors);

      const currentInDegree = inDegree.get(edge.to) || 0;
      inDegree.set(edge.to, currentInDegree + 1);
    }

    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    // Add nodes with no incoming edges
    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        const currentInDegree = inDegree.get(neighbor)!;
        inDegree.set(neighbor, currentInDegree - 1);

        if (currentInDegree - 1 === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Group objectives by difficulty level
   */
  private groupObjectivesByDifficulty(
    objectives: LearningObjective[]
  ): Record<number, LearningObjective[]> {
    const groups: Record<number, LearningObjective[]> = {};

    for (const objective of objectives) {
      const level = Math.ceil(objective.difficulty);
      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push(objective);
    }

    return groups;
  }

  /**
   * Get difficulty level name
   */
  private getDifficultyLevelName(level: number): string {
    const names = [
      'Beginner',
      'Elementary',
      'Intermediate',
      'Advanced Intermediate',
      'Advanced',
      'Expert',
      'Master',
      'Grandmaster',
      'Legendary',
      'Transcendent',
    ];
    return names[Math.min(level - 1, names.length - 1)];
  }

  /**
   * Get difficulty level description
   */
  private getDifficultyLevelDescription(level: number): string {
    const descriptions = [
      'Basic concepts and fundamental skills',
      'Building foundational knowledge',
      'Developing intermediate capabilities',
      'Advanced intermediate techniques',
      'Mastering complex skills',
      'Expert-level proficiency',
      'Master-level expertise',
      'Grandmaster-level mastery',
      'Legendary capabilities',
      'Transcendent understanding',
    ];
    return descriptions[Math.min(level - 1, descriptions.length - 1)];
  }

  /**
   * Calculate assessment threshold for difficulty level
   */
  private calculateAssessmentThreshold(level: number): number {
    // Higher levels require higher scores
    return Math.min(0.9, 0.6 + level * 0.03);
  }

  /**
   * Estimate duration for difficulty level
   */
  private estimateLevelDuration(objectives: LearningObjective[]): number {
    return objectives.reduce((total, obj) => total + obj.estimatedDuration, 0);
  }

  /**
   * Generate transition conditions for difficulty level
   */
  private generateTransitionConditions(
    level: DifficultyLevel
  ): TransitionCondition[] {
    return [
      {
        type: 'performance',
        metric: 'level_success_rate',
        threshold: 0.8,
        operator: 'gte',
      },
      {
        type: 'mastery',
        metric: 'skill_mastery_level',
        threshold: level.level * 0.1,
        operator: 'gte',
      },
      {
        type: 'time',
        metric: 'time_spent_at_level',
        threshold: level.estimatedTime * 60, // Convert to seconds
        operator: 'gte',
      },
    ];
  }

  /**
   * Generate assessment requirement for difficulty level
   */
  private generateAssessmentRequirement(
    level: DifficultyLevel
  ): AssessmentRequirement {
    return {
      objectives: level.skillRequirements,
      minimumScore: level.assessmentThreshold,
      timeLimit: level.estimatedTime * 60, // Convert to seconds
      retryAllowed: true,
    };
  }

  /**
   * Analyze dependencies for insights
   */
  private analyzeDependencies(graph: DependencyGraph): DependencyAnalysis {
    const criticalPath = this.findCriticalPath(graph);
    const parallelPaths = this.findParallelPaths(graph);
    const bottlenecks = this.findBottlenecks(graph);
    const estimatedDuration = this.calculateEstimatedDurationFromGraph(graph);

    return {
      cycles: graph.cycles,
      criticalPath,
      parallelPaths,
      bottlenecks,
      estimatedDuration,
    };
  }

  /**
   * Find critical path in dependency graph
   */
  private findCriticalPath(graph: DependencyGraph): string[] {
    // Simple implementation - longest path
    const pathLengths = new Map<string, number>();

    for (const node of graph.topologicalOrder) {
      let maxLength = 0;
      const incomingEdges = graph.edges.filter((edge) => edge.to === node);

      for (const edge of incomingEdges) {
        const sourceLength = pathLengths.get(edge.from) || 0;
        maxLength = Math.max(maxLength, sourceLength + 1);
      }

      pathLengths.set(node, maxLength);
    }

    // Find node with maximum path length
    let maxNode = graph.topologicalOrder[0];
    let maxLength = 0;

    for (const [node, length] of pathLengths) {
      if (length > maxLength) {
        maxLength = length;
        maxNode = node;
      }
    }

    // Reconstruct path (simplified)
    return [maxNode];
  }

  /**
   * Find parallel paths in dependency graph
   */
  private findParallelPaths(graph: DependencyGraph): string[][] {
    // Simple implementation - find nodes at same level
    const levels = new Map<string, number>();

    for (const node of graph.topologicalOrder) {
      const incomingEdges = graph.edges.filter((edge) => edge.to === node);
      const maxLevel =
        incomingEdges.length > 0
          ? Math.max(...incomingEdges.map((edge) => levels.get(edge.from) || 0))
          : 0;
      levels.set(node, maxLevel + 1);
    }

    // Group nodes by level
    const levelGroups: Record<number, string[]> = {};
    for (const [node, level] of levels) {
      if (!levelGroups[level]) {
        levelGroups[level] = [];
      }
      levelGroups[level].push(node);
    }

    return Object.values(levelGroups).filter((group) => group.length > 1);
  }

  /**
   * Find bottlenecks in dependency graph
   */
  private findBottlenecks(graph: DependencyGraph): string[] {
    const bottlenecks: string[] = [];

    for (const node of graph.nodes) {
      const outgoingEdges = graph.edges.filter((edge) => edge.from === node);
      const incomingEdges = graph.edges.filter((edge) => edge.to === node);

      // Node is a bottleneck if it has many incoming edges and few outgoing edges
      if (incomingEdges.length > 2 && outgoingEdges.length <= 1) {
        bottlenecks.push(node);
      }
    }

    return bottlenecks;
  }

  /**
   * Calculate estimated duration from dependency graph
   */
  private calculateEstimatedDurationFromGraph(graph: DependencyGraph): number {
    // Simple estimation based on number of nodes and average duration
    const averageDuration = 30; // minutes per objective
    return graph.nodes.length * averageDuration;
  }

  /**
   * Calculate estimated duration for curriculum
   */
  private calculateEstimatedDuration(
    objectives: LearningObjective[],
    graph: DependencyGraph
  ): number {
    return objectives.reduce((total, obj) => total + obj.estimatedDuration, 0);
  }

  /**
   * Calibrate difficulty progression
   */
  private calibrateDifficulty(
    progression: DifficultyProgression
  ): DifficultyCalibration {
    const estimatedTimePerLevel =
      progression.levels.reduce(
        (total, level) => total + level.estimatedTime,
        0
      ) / progression.levels.length;

    const successRates: Record<number, number> = {};
    for (const level of progression.levels) {
      // Estimate success rate based on difficulty
      successRates[level.level] = Math.max(0.5, 1 - level.level * 0.05);
    }

    return {
      levels: progression.levels,
      transitions: progression.transitions,
      estimatedTimePerLevel,
      successRates,
    };
  }

  /**
   * Clear all data
   */
  clearData(): void {
    this.objectives.clear();
    this.skills.clear();
    this.curricula.clear();
  }
}

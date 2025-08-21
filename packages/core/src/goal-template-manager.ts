/**
 * Goal Template Manager
 *
 * Implements feasibility checking, plan sketch hints, and advanced goal template integration
 * for sophisticated goal management in the conscious bot.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Core Types
// ============================================================================

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  category: GoalCategory;
  priority: number; // 0-1
  complexity: number; // 0-1
  timeEstimate: number; // minutes
  resourceRequirements: ResourceRequirement[];
  prerequisites: string[]; // goal template IDs
  successCriteria: SuccessCriterion[];
  failureConditions: FailureCondition[];
  feasibilityFactors: FeasibilityFactor[];
  planSketchHints: PlanSketchHint[];
  adaptabilityScore: number; // 0-1, how well it adapts to context
  learningValue: number; // 0-1, potential learning from pursuing
  socialImpact: number; // 0-1, impact on social relationships
  riskLevel: RiskLevel;
  tags: string[];
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  successRate: number; // 0-1
}

export interface ResourceRequirement {
  type: ResourceType;
  name: string;
  quantity: number;
  optional: boolean;
  alternatives: string[];
  criticality: number; // 0-1, how critical this resource is
}

export interface SuccessCriterion {
  type: 'boolean' | 'numeric' | 'state' | 'social';
  description: string;
  condition: string;
  weight: number; // 0-1, importance of this criterion
  measurable: boolean;
  threshold?: number;
}

export interface FailureCondition {
  type: 'timeout' | 'resource_lack' | 'environmental' | 'social' | 'safety';
  description: string;
  condition: string;
  severity: number; // 0-1, how severe the failure is
  recoverable: boolean;
  timeoutMinutes?: number;
}

export interface FeasibilityFactor {
  type: 'resource' | 'environmental' | 'social' | 'skill' | 'time' | 'risk';
  name: string;
  description: string;
  weight: number; // 0-1, importance of this factor
  currentValue: number; // 0-1, current feasibility
  requiredValue: number; // 0-1, required feasibility
  dynamic: boolean; // whether this factor changes over time
  updateFunction?: string; // function to update this factor
}

export interface PlanSketchHint {
  type: 'action' | 'sequence' | 'condition' | 'resource' | 'timing';
  description: string;
  priority: number; // 0-1, importance of this hint
  context: string; // when this hint applies
  alternatives: string[];
  estimatedTime: number; // minutes
  riskLevel: RiskLevel;
}

export interface GoalInstance {
  id: string;
  templateId: string;
  template: GoalTemplate;
  status: GoalStatus;
  priority: number; // 0-1, current priority
  progress: number; // 0-1, completion progress
  startTime: number;
  estimatedEndTime: number;
  actualEndTime?: number;
  context: GoalContext;
  feasibilityScore: number; // 0-1, current feasibility
  riskAssessment: RiskAssessment;
  adaptations: GoalAdaptation[];
  checkpoints: GoalCheckpoint[];
  resources: ResourceStatus[];
  blockers: Blocker[];
  successMetrics: SuccessMetric[];
}

export interface GoalContext {
  environment: string;
  socialContext: string;
  availableResources: string[];
  currentCapabilities: string[];
  recentEvents: string[];
  constraints: string[];
  opportunities: string[];
}

export interface RiskAssessment {
  overallRisk: number; // 0-1
  riskFactors: RiskFactor[];
  mitigationStrategies: MitigationStrategy[];
  contingencyPlans: ContingencyPlan[];
  acceptableRiskThreshold: number; // 0-1
}

export interface RiskFactor {
  type: RiskType;
  description: string;
  probability: number; // 0-1
  impact: number; // 0-1
  severity: number; // 0-1, probability * impact
  mitigatable: boolean;
  mitigationCost: number; // 0-1
}

export interface MitigationStrategy {
  description: string;
  effectiveness: number; // 0-1
  cost: number; // 0-1
  timeRequired: number; // minutes
  prerequisites: string[];
}

export interface ContingencyPlan {
  trigger: string;
  description: string;
  actions: string[];
  effectiveness: number; // 0-1
  fallbackPlan?: string;
}

export interface GoalAdaptation {
  type: 'resource' | 'timeline' | 'approach' | 'scope' | 'priority';
  description: string;
  reason: string;
  timestamp: number;
  impact: number; // -1 to 1, negative for setbacks, positive for improvements
  approved: boolean;
}

export interface GoalCheckpoint {
  id: string;
  name: string;
  description: string;
  criteria: string[];
  completed: boolean;
  completionTime?: number;
  notes: string;
  nextCheckpoint?: string;
}

export interface ResourceStatus {
  resource: ResourceRequirement;
  available: boolean;
  quantity: number;
  quality: number; // 0-1
  location: string;
  accessibility: number; // 0-1
  estimatedDepletion: number; // minutes until depleted
}

export interface Blocker {
  type: 'resource' | 'environmental' | 'social' | 'technical' | 'temporal';
  description: string;
  severity: number; // 0-1
  impact: number; // 0-1
  resolvable: boolean;
  resolutionTime?: number; // minutes
  resolutionCost?: number; // 0-1
  dependencies: string[];
}

export interface SuccessMetric {
  criterion: SuccessCriterion;
  currentValue: number;
  targetValue: number;
  achieved: boolean;
  progress: number; // 0-1
  lastUpdated: number;
}

export enum GoalCategory {
  SURVIVAL = 'survival',
  SOCIAL = 'social',
  EXPLORATION = 'exploration',
  BUILDING = 'building',
  CRAFTING = 'crafting',
  COMBAT = 'combat',
  LEARNING = 'learning',
  ACHIEVEMENT = 'achievement',
  MAINTENANCE = 'maintenance',
  EMERGENCY = 'emergency',
}

export enum ResourceType {
  MATERIAL = 'material',
  TOOL = 'tool',
  WEAPON = 'weapon',
  ARMOR = 'armor',
  FOOD = 'food',
  BLOCK = 'block',
  CRAFTING_TABLE = 'crafting_table',
  FURNACE = 'furnace',
  SKILL = 'skill',
  KNOWLEDGE = 'knowledge',
  TIME = 'time',
  ENERGY = 'energy',
}

export enum RiskLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RiskType {
  ENVIRONMENTAL = 'environmental',
  RESOURCE = 'resource',
  SOCIAL = 'social',
  TECHNICAL = 'technical',
  TEMPORAL = 'temporal',
  SAFETY = 'safety',
}

export enum GoalStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ADAPTING = 'adapting',
}

// ============================================================================
// Configuration
// ============================================================================

export interface GoalTemplateManagerConfig {
  maxActiveGoals: number;
  feasibilityThreshold: number; // 0-1, minimum feasibility to start goal
  riskThreshold: number; // 0-1, maximum acceptable risk
  adaptationThreshold: number; // 0-1, when to trigger adaptations
  checkpointInterval: number; // minutes between checkpoints
  resourceUpdateInterval: number; // minutes between resource updates
  enableAdvancedFeasibility: boolean;
  enablePlanSketchHints: boolean;
  enableRiskAssessment: boolean;
  enableAdaptivePlanning: boolean;
}

const DEFAULT_CONFIG: GoalTemplateManagerConfig = {
  maxActiveGoals: 5,
  feasibilityThreshold: 0.6,
  riskThreshold: 0.7,
  adaptationThreshold: 0.3,
  checkpointInterval: 5,
  resourceUpdateInterval: 2,
  enableAdvancedFeasibility: true,
  enablePlanSketchHints: true,
  enableRiskAssessment: true,
  enableAdaptivePlanning: true,
};

// ============================================================================
// Goal Template Manager Implementation
// ============================================================================

export class GoalTemplateManager extends EventEmitter {
  private config: GoalTemplateManagerConfig;
  private templates: Map<string, GoalTemplate> = new Map();
  private activeGoals: Map<string, GoalInstance> = new Map();
  private goalHistory: GoalInstance[] = [];
  private resourceMonitor: ResourceMonitor;
  private feasibilityAnalyzer: FeasibilityAnalyzer;
  private riskAssessor: RiskAssessor;

  constructor(config: Partial<GoalTemplateManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.resourceMonitor = new ResourceMonitor();
    this.feasibilityAnalyzer = new FeasibilityAnalyzer();
    this.riskAssessor = new RiskAssessor();
    this.initializeDefaultTemplates();
  }

  /**
   * Create a new goal instance from a template
   */
  async createGoalInstance(
    templateId: string,
    context: GoalContext,
    priority: number = 0.5
  ): Promise<GoalInstance | null> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Goal template not found: ${templateId}`);
    }

    // Check prerequisites
    const prerequisitesMet = await this.checkPrerequisites(template, context);
    if (!prerequisitesMet) {
      return null;
    }

    // Assess feasibility
    const feasibilityScore = await this.assessFeasibility(template, context);
    if (feasibilityScore < this.config.feasibilityThreshold) {
      return null;
    }

    // Assess risks
    const riskAssessment = await this.assessRisks(template, context);

    // Check if risk is acceptable
    if (riskAssessment.overallRisk > this.config.riskThreshold) {
      return null;
    }

    // Check resource availability
    const resourceStatus = await this.checkResourceAvailability(
      template,
      context
    );

    // Create goal instance
    const goalInstance: GoalInstance = {
      id: uuidv4(),
      templateId,
      template,
      status: GoalStatus.PLANNING,
      priority,
      progress: 0,
      startTime: Date.now(),
      estimatedEndTime: Date.now() + template.timeEstimate * 60000,
      context,
      feasibilityScore,
      riskAssessment,
      adaptations: [],
      checkpoints: this.createCheckpoints(template),
      resources: resourceStatus,
      blockers: [],
      successMetrics: this.initializeSuccessMetrics(template),
    };

    // Add to active goals
    this.activeGoals.set(goalInstance.id, goalInstance);

    // Emit event
    this.emit('goalCreated', goalInstance);

    return goalInstance;
  }

  /**
   * Start a goal instance
   */
  async startGoal(goalId: string): Promise<boolean> {
    const goal = this.activeGoals.get(goalId);
    if (!goal) {
      return false;
    }

    // Final feasibility check
    const currentFeasibility = await this.assessFeasibility(
      goal.template,
      goal.context
    );
    if (currentFeasibility < this.config.feasibilityThreshold) {
      goal.status = GoalStatus.FAILED;
      this.emit('goalFailed', goal, 'Insufficient feasibility');
      return false;
    }

    // Update status
    goal.status = GoalStatus.ACTIVE;
    goal.startTime = Date.now();

    // Update template usage
    goal.template.lastUsed = Date.now();
    goal.template.usageCount++;

    this.emit('goalStarted', goal);
    return true;
  }

  /**
   * Update goal progress and check for adaptations
   */
  async updateGoalProgress(
    goalId: string,
    progress: number,
    context: Partial<GoalContext>
  ): Promise<void> {
    const goal = this.activeGoals.get(goalId);
    if (!goal || goal.status !== GoalStatus.ACTIVE) {
      return;
    }

    // Update progress
    goal.progress = Math.min(1.0, Math.max(0, progress));

    // Update context
    goal.context = { ...goal.context, ...context };

    // Check for adaptations
    await this.checkForAdaptations(goal);

    // Update checkpoints
    this.updateCheckpoints(goal);

    // Update success metrics
    this.updateSuccessMetrics(goal);

    // Check for completion or failure
    await this.checkGoalStatus(goal);

    this.emit('goalProgressUpdated', goal);
  }

  /**
   * Get plan sketch hints for a goal
   */
  async getPlanSketchHints(goalId: string): Promise<PlanSketchHint[]> {
    const goal = this.activeGoals.get(goalId);
    if (!goal) {
      return [];
    }

    if (!this.config.enablePlanSketchHints) {
      return goal.template.planSketchHints;
    }

    // Filter hints based on current context
    const contextualHints = goal.template.planSketchHints.filter((hint) => {
      return this.evaluateHintContext(hint, goal.context);
    });

    // Sort by priority and estimated time
    contextualHints.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (Math.abs(priorityDiff) > 0.1) {
        return priorityDiff;
      }
      return a.estimatedTime - b.estimatedTime;
    });

    return contextualHints;
  }

  /**
   * Get feasibility analysis for a goal template
   */
  async getFeasibilityAnalysis(
    templateId: string,
    context: GoalContext
  ): Promise<FeasibilityAnalysis> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Goal template not found: ${templateId}`);
    }

    return this.feasibilityAnalyzer.analyze(template, context);
  }

  /**
   * Get risk assessment for a goal template
   */
  async getRiskAssessment(
    templateId: string,
    context: GoalContext
  ): Promise<RiskAssessment> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Goal template not found: ${templateId}`);
    }

    return this.riskAssessor.assess(template, context);
  }

  /**
   * Add a new goal template
   */
  addTemplate(template: GoalTemplate): void {
    this.templates.set(template.id, template);
    this.emit('templateAdded', template);
  }

  /**
   * Get all goal templates
   */
  getTemplates(): GoalTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get active goals
   */
  getActiveGoals(): GoalInstance[] {
    return Array.from(this.activeGoals.values());
  }

  /**
   * Get goal history
   */
  getGoalHistory(): GoalInstance[] {
    return [...this.goalHistory];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async checkPrerequisites(
    template: GoalTemplate,
    context: GoalContext
  ): Promise<boolean> {
    for (const prereqId of template.prerequisites) {
      const prereqTemplate = this.templates.get(prereqId);
      if (!prereqTemplate) {
        continue; // Skip if prerequisite template doesn't exist
      }

      // Check if prerequisite was recently completed
      const recentCompletion = this.goalHistory.find(
        (goal) =>
          goal.templateId === prereqId &&
          goal.status === GoalStatus.COMPLETED &&
          Date.now() - goal.actualEndTime! < 3600000 // Within last hour
      );

      if (!recentCompletion) {
        return false;
      }
    }

    return true;
  }

  private async assessFeasibility(
    template: GoalTemplate,
    context: GoalContext
  ): Promise<number> {
    if (!this.config.enableAdvancedFeasibility) {
      return 0.5; // Default feasibility
    }

    const analysis = await this.feasibilityAnalyzer.analyze(template, context);
    return analysis.overallFeasibility;
  }

  private async assessRisks(
    template: GoalTemplate,
    context: GoalContext
  ): Promise<RiskAssessment> {
    if (!this.config.enableRiskAssessment) {
      return {
        overallRisk: 0.3,
        riskFactors: [],
        mitigationStrategies: [],
        contingencyPlans: [],
        acceptableRiskThreshold: 0.7,
      };
    }

    return this.riskAssessor.assess(template, context);
  }

  private async checkResourceAvailability(
    template: GoalTemplate,
    context: GoalContext
  ): Promise<ResourceStatus[]> {
    return template.resourceRequirements.map((requirement) => {
      const available = context.availableResources.includes(requirement.name);
      return {
        resource: requirement,
        available,
        quantity: available ? 1 : 0,
        quality: 1.0,
        location: 'unknown',
        accessibility: available ? 1.0 : 0.0,
        estimatedDepletion: Infinity,
      };
    });
  }

  private createCheckpoints(template: GoalTemplate): GoalCheckpoint[] {
    const checkpoints: GoalCheckpoint[] = [];
    const totalTime = template.timeEstimate;
    const interval = this.config.checkpointInterval;

    for (let i = 1; i <= Math.floor(totalTime / interval); i++) {
      const checkpointTime = i * interval;
      checkpoints.push({
        id: uuidv4(),
        name: `Checkpoint ${i}`,
        description: `Progress check at ${checkpointTime} minutes`,
        criteria: [
          `Progress >= ${(i / Math.floor(totalTime / interval)) * 100}%`,
        ],
        completed: false,
        notes: '',
      });
    }

    return checkpoints;
  }

  private initializeSuccessMetrics(template: GoalTemplate): SuccessMetric[] {
    return template.successCriteria.map((criterion) => ({
      criterion,
      currentValue: 0,
      targetValue: criterion.threshold || 1,
      achieved: false,
      progress: 0,
      lastUpdated: Date.now(),
    }));
  }

  private async checkForAdaptations(goal: GoalInstance): Promise<void> {
    if (!this.config.enableAdaptivePlanning) {
      return;
    }

    // Check if feasibility has dropped significantly
    const currentFeasibility = await this.assessFeasibility(
      goal.template,
      goal.context
    );
    const feasibilityDrop = goal.feasibilityScore - currentFeasibility;

    if (feasibilityDrop > this.config.adaptationThreshold) {
      await this.triggerAdaptation(
        goal,
        'feasibility_drop',
        `Feasibility dropped by ${feasibilityDrop.toFixed(2)}`
      );
    }

    // Check for new blockers
    const newBlockers = this.identifyBlockers(goal);
    if (newBlockers.length > 0) {
      await this.triggerAdaptation(
        goal,
        'blocker_detected',
        `New blockers: ${newBlockers.map((b) => b.description).join(', ')}`
      );
    }

    // Check for resource depletion
    const depletedResources = goal.resources.filter(
      (r) => r.estimatedDepletion < 5
    ); // 5 minutes
    if (depletedResources.length > 0) {
      await this.triggerAdaptation(
        goal,
        'resource_depletion',
        `Resources depleting: ${depletedResources.map((r) => r.resource.name).join(', ')}`
      );
    }
  }

  private async triggerAdaptation(
    goal: GoalInstance,
    type: string,
    reason: string
  ): Promise<void> {
    const adaptation: GoalAdaptation = {
      type: 'approach',
      description: `Adaptation triggered: ${type}`,
      reason,
      timestamp: Date.now(),
      impact: 0, // Will be calculated based on adaptation success
      approved: true,
    };

    goal.adaptations.push(adaptation);
    goal.status = GoalStatus.ADAPTING;

    this.emit('goalAdapting', goal, adaptation);
  }

  private identifyBlockers(goal: GoalInstance): Blocker[] {
    const blockers: Blocker[] = [];

    // Check for resource blockers
    const missingResources = goal.resources.filter(
      (r) => !r.available && r.resource.criticality > 0.7
    );
    missingResources.forEach((resource) => {
      blockers.push({
        type: 'resource',
        description: `Missing critical resource: ${resource.resource.name}`,
        severity: resource.resource.criticality,
        impact: 0.8,
        resolvable: true,
        resolutionTime: 10, // 10 minutes to find alternative
        resolutionCost: 0.3,
        dependencies: resource.resource.alternatives,
      });
    });

    // Check for environmental blockers
    if (goal.context.constraints.length > 0) {
      blockers.push({
        type: 'environmental',
        description: `Environmental constraints: ${goal.context.constraints.join(', ')}`,
        severity: 0.6,
        impact: 0.5,
        resolvable: false,
        dependencies: [],
      });
    }

    return blockers;
  }

  private updateCheckpoints(goal: GoalInstance): void {
    const elapsedTime = (Date.now() - goal.startTime) / 60000; // minutes
    const expectedProgress = elapsedTime / goal.template.timeEstimate;

    goal.checkpoints.forEach((checkpoint) => {
      if (!checkpoint.completed && goal.progress >= expectedProgress) {
        checkpoint.completed = true;
        checkpoint.completionTime = Date.now();
        checkpoint.notes = `Completed at ${goal.progress.toFixed(2)} progress`;
      }
    });
  }

  private updateSuccessMetrics(goal: GoalInstance): void {
    goal.successMetrics.forEach((metric) => {
      // Simple progress-based metric update
      metric.currentValue = goal.progress;
      metric.progress = goal.progress / metric.targetValue;
      metric.achieved = goal.progress >= metric.targetValue;
      metric.lastUpdated = Date.now();
    });
  }

  private async checkGoalStatus(goal: GoalInstance): Promise<void> {
    // Check for completion
    if (goal.progress >= 1.0) {
      goal.status = GoalStatus.COMPLETED;
      goal.actualEndTime = Date.now();
      this.completeGoal(goal);
      return;
    }

    // Check for failure conditions
    const failureTriggered = goal.template.failureConditions.some(
      (condition) => {
        return this.evaluateFailureCondition(condition, goal);
      }
    );

    if (failureTriggered) {
      goal.status = GoalStatus.FAILED;
      goal.actualEndTime = Date.now();
      this.failGoal(goal);
      return;
    }

    // Check for timeout
    if (Date.now() > goal.estimatedEndTime) {
      goal.status = GoalStatus.FAILED;
      goal.actualEndTime = Date.now();
      this.failGoal(goal, 'Timeout');
      return;
    }
  }

  private evaluateFailureCondition(
    condition: FailureCondition,
    goal: GoalInstance
  ): boolean {
    switch (condition.type) {
      case 'timeout':
        return (
          Date.now() - goal.startTime >
          (condition.timeoutMinutes || goal.template.timeEstimate) * 60000
        );
      case 'resource_lack':
        return goal.resources.some(
          (r) => !r.available && r.resource.criticality > 0.8
        );
      case 'environmental':
        return goal.context.constraints.some((constraint) =>
          condition.condition.toLowerCase().includes(constraint.toLowerCase())
        );
      default:
        return false;
    }
  }

  private evaluateHintContext(
    hint: PlanSketchHint,
    context: GoalContext
  ): boolean {
    if (!hint.context || hint.context === 'always') {
      return true;
    }

    // Simple keyword matching for context evaluation
    const contextKeywords = hint.context.toLowerCase().split(' ');
    const environmentMatch = contextKeywords.some((keyword) =>
      context.environment.toLowerCase().includes(keyword)
    );
    const socialMatch = contextKeywords.some((keyword) =>
      context.socialContext.toLowerCase().includes(keyword)
    );

    return environmentMatch || socialMatch;
  }

  private completeGoal(goal: GoalInstance): void {
    // Update template success rate
    const totalUses = goal.template.usageCount;
    const currentSuccessRate = goal.template.successRate;
    goal.template.successRate =
      (currentSuccessRate * (totalUses - 1) + 1) / totalUses;

    // Move to history
    this.activeGoals.delete(goal.id);
    this.goalHistory.push(goal);

    this.emit('goalCompleted', goal);
  }

  private failGoal(goal: GoalInstance, reason: string = 'Unknown'): void {
    // Update template success rate
    const totalUses = goal.template.usageCount;
    const currentSuccessRate = goal.template.successRate;
    goal.template.successRate =
      (currentSuccessRate * (totalUses - 1)) / totalUses;

    // Move to history
    this.activeGoals.delete(goal.id);
    this.goalHistory.push(goal);

    this.emit('goalFailed', goal, reason);
  }

  private initializeDefaultTemplates(): void {
    // Add some default goal templates
    const defaultTemplates: GoalTemplate[] = [
      {
        id: 'build_shelter',
        name: 'Build Shelter',
        description: 'Construct a basic shelter for protection',
        category: GoalCategory.SURVIVAL,
        priority: 0.8,
        complexity: 0.4,
        timeEstimate: 30,
        resourceRequirements: [
          {
            type: ResourceType.BLOCK,
            name: 'wood',
            quantity: 20,
            optional: false,
            alternatives: ['stone'],
            criticality: 0.9,
          },
          {
            type: ResourceType.TOOL,
            name: 'axe',
            quantity: 1,
            optional: true,
            alternatives: [],
            criticality: 0.3,
          },
        ],
        prerequisites: [],
        successCriteria: [
          {
            type: 'boolean',
            description: 'Shelter constructed',
            condition: 'shelter_exists',
            weight: 1.0,
            measurable: true,
          },
        ],
        failureConditions: [
          {
            type: 'timeout',
            description: 'Construction timeout',
            condition: 'time_exceeded',
            severity: 0.5,
            recoverable: true,
            timeoutMinutes: 45,
          },
        ],
        feasibilityFactors: [
          {
            type: 'resource',
            name: 'material_availability',
            description: 'Building materials available',
            weight: 0.8,
            currentValue: 0.7,
            requiredValue: 0.5,
            dynamic: true,
          },
          {
            type: 'environmental',
            name: 'safe_location',
            description: 'Safe location for shelter',
            weight: 0.9,
            currentValue: 0.6,
            requiredValue: 0.7,
            dynamic: false,
          },
        ],
        planSketchHints: [
          {
            type: 'action',
            description: 'Find flat ground near trees',
            priority: 0.9,
            context: 'forest',
            alternatives: ['Find stone outcrop'],
            estimatedTime: 5,
            riskLevel: RiskLevel.LOW,
          },
          {
            type: 'sequence',
            description: 'Gather materials before building',
            priority: 0.8,
            context: 'always',
            alternatives: [],
            estimatedTime: 15,
            riskLevel: RiskLevel.LOW,
          },
        ],
        adaptabilityScore: 0.7,
        learningValue: 0.6,
        socialImpact: 0.3,
        riskLevel: RiskLevel.LOW,
        tags: ['survival', 'building', 'basic'],
        createdAt: Date.now(),
        lastUsed: 0,
        usageCount: 0,
        successRate: 0.8,
      },
    ];

    defaultTemplates.forEach((template) => this.addTemplate(template));
  }
}

// ============================================================================
// Helper Classes
// ============================================================================

class ResourceMonitor {
  private resources: Map<string, ResourceStatus> = new Map();

  updateResource(resourceId: string, status: Partial<ResourceStatus>): void {
    const current = this.resources.get(resourceId);
    if (current) {
      this.resources.set(resourceId, { ...current, ...status });
    }
  }

  getResourceStatus(resourceId: string): ResourceStatus | undefined {
    return this.resources.get(resourceId);
  }

  getAllResources(): ResourceStatus[] {
    return Array.from(this.resources.values());
  }
}

class FeasibilityAnalyzer {
  async analyze(
    template: GoalTemplate,
    context: GoalContext
  ): Promise<FeasibilityAnalysis> {
    let overallFeasibility = 0;
    const factorScores: Map<string, number> = new Map();

    for (const factor of template.feasibilityFactors) {
      let score = factor.currentValue;

      // Apply context-based adjustments
      switch (factor.type) {
        case 'resource':
          score = this.assessResourceFeasibility(factor, context);
          break;
        case 'environmental':
          score = this.assessEnvironmentalFeasibility(factor, context);
          break;
        case 'social':
          score = this.assessSocialFeasibility(factor, context);
          break;
        case 'skill':
          score = this.assessSkillFeasibility(factor, context);
          break;
        case 'time':
          score = this.assessTimeFeasibility(factor, context);
          break;
        case 'risk':
          score = this.assessRiskFeasibility(factor, context);
          break;
      }

      factorScores.set(factor.name, score);
      overallFeasibility += score * factor.weight;
    }

    return {
      overallFeasibility: Math.min(1.0, overallFeasibility),
      factorScores,
      recommendations: this.generateRecommendations(template, factorScores),
    };
  }

  private assessResourceFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    const availableResources = context.availableResources;
    const requiredResources = ['wood', 'stone', 'tools', 'food']; // Simplified

    const availableCount = requiredResources.filter((resource) =>
      availableResources.includes(resource)
    ).length;

    return availableCount / requiredResources.length;
  }

  private assessEnvironmentalFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    const constraints = context.constraints;
    const opportunities = context.opportunities;

    let score = 0.5; // Base score

    // Reduce score for constraints
    constraints.forEach((constraint) => {
      if (constraint.includes('danger') || constraint.includes('hostile')) {
        score -= 0.3;
      }
    });

    // Increase score for opportunities
    opportunities.forEach((opportunity) => {
      if (opportunity.includes('safe') || opportunity.includes('resource')) {
        score += 0.2;
      }
    });

    return Math.max(0, Math.min(1, score));
  }

  private assessSocialFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    if (context.socialContext.includes('alone')) {
      return 0.3; // Lower feasibility when alone
    }
    return 0.8; // Higher feasibility with others
  }

  private assessSkillFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    const capabilities = context.currentCapabilities;
    return capabilities.length > 0 ? 0.7 : 0.3;
  }

  private assessTimeFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    // Simple time assessment - could be enhanced with time-of-day analysis
    return 0.8;
  }

  private assessRiskFeasibility(
    factor: FeasibilityFactor,
    context: GoalContext
  ): number {
    const constraints = context.constraints;
    const riskFactors = constraints.filter(
      (c) => c.includes('danger') || c.includes('risk') || c.includes('hostile')
    );

    return Math.max(0.2, 1 - riskFactors.length * 0.2);
  }

  private generateRecommendations(
    template: GoalTemplate,
    factorScores: Map<string, number>
  ): string[] {
    const recommendations: string[] = [];

    factorScores.forEach((score, factorName) => {
      if (score < 0.5) {
        recommendations.push(
          `Improve ${factorName} feasibility (current: ${score.toFixed(2)})`
        );
      }
    });

    return recommendations;
  }
}

class RiskAssessor {
  assess(template: GoalTemplate, context: GoalContext): RiskAssessment {
    const riskFactors: RiskFactor[] = [];
    let overallRisk = 0;

    // Environmental risks
    if (context.constraints.some((c) => c.includes('danger'))) {
      riskFactors.push({
        type: RiskType.ENVIRONMENTAL,
        description: 'Dangerous environment',
        probability: 0.6,
        impact: 0.8,
        severity: 0.48,
        mitigatable: true,
        mitigationCost: 0.4,
      });
      overallRisk += 0.48;
    }

    // Resource risks
    if (context.availableResources.length < 3) {
      riskFactors.push({
        type: RiskType.RESOURCE,
        description: 'Limited resources',
        probability: 0.7,
        impact: 0.5,
        severity: 0.35,
        mitigatable: true,
        mitigationCost: 0.3,
      });
      overallRisk += 0.35;
    }

    // Social risks
    if (context.socialContext.includes('conflict')) {
      riskFactors.push({
        type: RiskType.SOCIAL,
        description: 'Social conflict',
        probability: 0.4,
        impact: 0.6,
        severity: 0.24,
        mitigatable: true,
        mitigationCost: 0.5,
      });
      overallRisk += 0.24;
    }

    return {
      overallRisk: Math.min(1.0, overallRisk),
      riskFactors,
      mitigationStrategies: this.generateMitigationStrategies(riskFactors),
      contingencyPlans: this.generateContingencyPlans(riskFactors),
      acceptableRiskThreshold: 0.7,
    };
  }

  private generateMitigationStrategies(
    riskFactors: RiskFactor[]
  ): MitigationStrategy[] {
    return riskFactors
      .filter((factor) => factor.mitigatable)
      .map((factor) => ({
        description: `Mitigate ${factor.description}`,
        effectiveness: 0.7,
        cost: factor.mitigationCost,
        timeRequired: 10,
        prerequisites: [],
      }));
  }

  private generateContingencyPlans(
    riskFactors: RiskFactor[]
  ): ContingencyPlan[] {
    return riskFactors.map((factor) => ({
      trigger: factor.description,
      description: `Handle ${factor.description}`,
      actions: [
        'Assess situation',
        'Implement backup plan',
        'Seek help if needed',
      ],
      effectiveness: 0.6,
    }));
  }
}

// ============================================================================
// Additional Types
// ============================================================================

export interface FeasibilityAnalysis {
  overallFeasibility: number;
  factorScores: Map<string, number>;
  recommendations: string[];
}

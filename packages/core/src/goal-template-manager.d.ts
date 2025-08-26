/**
 * Goal Template Manager
 *
 * Implements feasibility checking, plan sketch hints, and advanced goal template integration
 * for sophisticated goal management in the conscious bot.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
export interface GoalTemplate {
    id: string;
    name: string;
    description: string;
    category: GoalCategory;
    priority: number;
    complexity: number;
    timeEstimate: number;
    resourceRequirements: ResourceRequirement[];
    prerequisites: string[];
    successCriteria: SuccessCriterion[];
    failureConditions: FailureCondition[];
    feasibilityFactors: FeasibilityFactor[];
    planSketchHints: PlanSketchHint[];
    adaptabilityScore: number;
    learningValue: number;
    socialImpact: number;
    riskLevel: RiskLevel;
    tags: string[];
    createdAt: number;
    lastUsed: number;
    usageCount: number;
    successRate: number;
}
export interface ResourceRequirement {
    type: ResourceType;
    name: string;
    quantity: number;
    optional: boolean;
    alternatives: string[];
    criticality: number;
}
export interface SuccessCriterion {
    type: 'boolean' | 'numeric' | 'state' | 'social';
    description: string;
    condition: string;
    weight: number;
    measurable: boolean;
    threshold?: number;
}
export interface FailureCondition {
    type: 'timeout' | 'resource_lack' | 'environmental' | 'social' | 'safety';
    description: string;
    condition: string;
    severity: number;
    recoverable: boolean;
    timeoutMinutes?: number;
}
export interface FeasibilityFactor {
    type: 'resource' | 'environmental' | 'social' | 'skill' | 'time' | 'risk';
    name: string;
    description: string;
    weight: number;
    currentValue: number;
    requiredValue: number;
    dynamic: boolean;
    updateFunction?: string;
}
export interface PlanSketchHint {
    type: 'action' | 'sequence' | 'condition' | 'resource' | 'timing';
    description: string;
    priority: number;
    context: string;
    alternatives: string[];
    estimatedTime: number;
    riskLevel: RiskLevel;
}
export interface GoalInstance {
    id: string;
    templateId: string;
    template: GoalTemplate;
    status: GoalStatus;
    priority: number;
    progress: number;
    startTime: number;
    estimatedEndTime: number;
    actualEndTime?: number;
    context: GoalContext;
    feasibilityScore: number;
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
    overallRisk: number;
    riskFactors: RiskFactor[];
    mitigationStrategies: MitigationStrategy[];
    contingencyPlans: ContingencyPlan[];
    acceptableRiskThreshold: number;
}
export interface RiskFactor {
    type: RiskType;
    description: string;
    probability: number;
    impact: number;
    severity: number;
    mitigatable: boolean;
    mitigationCost: number;
}
export interface MitigationStrategy {
    description: string;
    effectiveness: number;
    cost: number;
    timeRequired: number;
    prerequisites: string[];
}
export interface ContingencyPlan {
    trigger: string;
    description: string;
    actions: string[];
    effectiveness: number;
    fallbackPlan?: string;
}
export interface GoalAdaptation {
    type: 'resource' | 'timeline' | 'approach' | 'scope' | 'priority';
    description: string;
    reason: string;
    timestamp: number;
    impact: number;
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
    quality: number;
    location: string;
    accessibility: number;
    estimatedDepletion: number;
}
export interface Blocker {
    type: 'resource' | 'environmental' | 'social' | 'technical' | 'temporal';
    description: string;
    severity: number;
    impact: number;
    resolvable: boolean;
    resolutionTime?: number;
    resolutionCost?: number;
    dependencies: string[];
}
export interface SuccessMetric {
    criterion: SuccessCriterion;
    currentValue: number;
    targetValue: number;
    achieved: boolean;
    progress: number;
    lastUpdated: number;
}
export declare enum GoalCategory {
    SURVIVAL = "survival",
    SOCIAL = "social",
    EXPLORATION = "exploration",
    BUILDING = "building",
    CRAFTING = "crafting",
    COMBAT = "combat",
    LEARNING = "learning",
    ACHIEVEMENT = "achievement",
    MAINTENANCE = "maintenance",
    EMERGENCY = "emergency"
}
export declare enum ResourceType {
    MATERIAL = "material",
    TOOL = "tool",
    WEAPON = "weapon",
    ARMOR = "armor",
    FOOD = "food",
    BLOCK = "block",
    CRAFTING_TABLE = "crafting_table",
    FURNACE = "furnace",
    SKILL = "skill",
    KNOWLEDGE = "knowledge",
    TIME = "time",
    ENERGY = "energy"
}
export declare enum RiskLevel {
    NONE = "none",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum RiskType {
    ENVIRONMENTAL = "environmental",
    RESOURCE = "resource",
    SOCIAL = "social",
    TECHNICAL = "technical",
    TEMPORAL = "temporal",
    SAFETY = "safety"
}
export declare enum GoalStatus {
    PLANNING = "planning",
    ACTIVE = "active",
    PAUSED = "paused",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
    ADAPTING = "adapting"
}
export interface GoalTemplateManagerConfig {
    maxActiveGoals: number;
    feasibilityThreshold: number;
    riskThreshold: number;
    adaptationThreshold: number;
    checkpointInterval: number;
    resourceUpdateInterval: number;
    enableAdvancedFeasibility: boolean;
    enablePlanSketchHints: boolean;
    enableRiskAssessment: boolean;
    enableAdaptivePlanning: boolean;
}
export declare class GoalTemplateManager extends EventEmitter {
    private config;
    private templates;
    private activeGoals;
    private goalHistory;
    private resourceMonitor;
    private feasibilityAnalyzer;
    private riskAssessor;
    constructor(config?: Partial<GoalTemplateManagerConfig>);
    /**
     * Create a new goal instance from a template
     */
    createGoalInstance(templateId: string, context: GoalContext, priority?: number): Promise<GoalInstance | null>;
    /**
     * Start a goal instance
     */
    startGoal(goalId: string): Promise<boolean>;
    /**
     * Update goal progress and check for adaptations
     */
    updateGoalProgress(goalId: string, progress: number, context: Partial<GoalContext>): Promise<void>;
    /**
     * Get plan sketch hints for a goal
     */
    getPlanSketchHints(goalId: string): Promise<PlanSketchHint[]>;
    /**
     * Get feasibility analysis for a goal template
     */
    getFeasibilityAnalysis(templateId: string, context: GoalContext): Promise<FeasibilityAnalysis>;
    /**
     * Get risk assessment for a goal template
     */
    getRiskAssessment(templateId: string, context: GoalContext): Promise<RiskAssessment>;
    /**
     * Add a new goal template
     */
    addTemplate(template: GoalTemplate): void;
    /**
     * Get all goal templates
     */
    getTemplates(): GoalTemplate[];
    /**
     * Get active goals
     */
    getActiveGoals(): GoalInstance[];
    /**
     * Get goal history
     */
    getGoalHistory(): GoalInstance[];
    private checkPrerequisites;
    private assessFeasibility;
    private assessRisks;
    private checkResourceAvailability;
    private createCheckpoints;
    private initializeSuccessMetrics;
    private checkForAdaptations;
    private triggerAdaptation;
    private identifyBlockers;
    private updateCheckpoints;
    private updateSuccessMetrics;
    private checkGoalStatus;
    private evaluateFailureCondition;
    private evaluateHintContext;
    private completeGoal;
    private failGoal;
    private initializeDefaultTemplates;
}
export interface FeasibilityAnalysis {
    overallFeasibility: number;
    factorScores: Map<string, number>;
    recommendations: string[];
}
//# sourceMappingURL=goal-template-manager.d.ts.map
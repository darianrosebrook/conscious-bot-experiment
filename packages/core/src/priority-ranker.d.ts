/**
 * Priority Ranker
 *
 * Implements commitment boosts, novelty boosts, opportunity cost boosts,
 * and advanced priority calculation for sophisticated task prioritization.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
export interface PriorityTask {
    id: string;
    name: string;
    description: string;
    type: TaskType;
    basePriority: number;
    urgency: number;
    importance: number;
    complexity: number;
    estimatedDuration: number;
    deadline?: number;
    dependencies: string[];
    resources: ResourceRequirement[];
    context: TaskContext;
    metadata: TaskMetadata;
    createdAt: number;
    lastUpdated: number;
}
export interface PrioritizedTask extends PriorityTask {
    calculatedPriority: number;
    commitmentBoost: number;
    noveltyBoost: number;
    opportunityCostBoost: number;
    deadlinePressure: number;
    resourceAvailability: number;
    socialImpact: number;
    learningValue: number;
    riskLevel: RiskLevel;
    feasibility: number;
    priorityFactors: PriorityFactor[];
    rankingReason: string;
}
export interface TaskContext {
    environment: string;
    socialContext: string;
    currentGoals: string[];
    recentEvents: string[];
    availableResources: string[];
    constraints: string[];
    opportunities: string[];
    timeOfDay: string;
    energyLevel: number;
    stressLevel: number;
}
export interface TaskMetadata {
    category: string;
    tags: string[];
    difficulty: number;
    skillRequirements: string[];
    emotionalImpact: number;
    satisfaction: number;
    novelty: number;
    socialValue: number;
}
export interface ResourceRequirement {
    type: ResourceType;
    name: string;
    quantity: number;
    criticality: number;
    alternatives: string[];
    availability: number;
}
export interface PriorityFactor {
    name: string;
    weight: number;
    value: number;
    contribution: number;
    description: string;
}
export interface Commitment {
    id: string;
    type: CommitmentType;
    description: string;
    targetTask: string;
    strength: number;
    deadline: number;
    socialContext: string;
    consequences: string[];
    createdAt: number;
    lastReinforced: number;
}
export interface Opportunity {
    id: string;
    type: OpportunityType;
    description: string;
    value: number;
    timeWindow: number;
    requirements: string[];
    risks: string[];
    createdAt: number;
    expiresAt: number;
}
export interface PriorityRanking {
    id: string;
    timestamp: number;
    tasks: PrioritizedTask[];
    rankingMethod: RankingMethod;
    confidence: number;
    factors: PriorityFactor[];
    metadata: RankingMetadata;
}
export interface RankingMetadata {
    totalTasks: number;
    averagePriority: number;
    priorityDistribution: PriorityDistribution;
    topFactors: string[];
    rankingQuality: number;
}
export interface PriorityDistribution {
    high: number;
    medium: number;
    low: number;
    distribution: number[];
}
export declare enum TaskType {
    SURVIVAL = "survival",
    SOCIAL = "social",
    EXPLORATION = "exploration",
    BUILDING = "building",
    CRAFTING = "crafting",
    COMBAT = "combat",
    LEARNING = "learning",
    ACHIEVEMENT = "achievement",
    MAINTENANCE = "maintenance",
    EMERGENCY = "emergency",
    CREATIVE = "creative",
    ADMINISTRATIVE = "administrative"
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
    ENERGY = "energy",
    SOCIAL = "social"
}
export declare enum RiskLevel {
    NONE = "none",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum CommitmentType {
    PROMISE = "promise",
    GOAL = "goal",
    OBLIGATION = "obligation",
    EXPECTATION = "expectation",
    AGREEMENT = "agreement",
    DEADLINE = "deadline"
}
export declare enum OpportunityType {
    RESOURCE = "resource",
    SOCIAL = "social",
    LEARNING = "learning",
    EXPLORATION = "exploration",
    ACHIEVEMENT = "achievement",
    CREATIVE = "creative"
}
export declare enum RankingMethod {
    WEIGHTED_SUM = "weighted_sum",
    MULTI_CRITERIA = "multi_criteria",
    ANALYTIC_HIERARCHY = "analytic_hierarchy",
    FUZZY_LOGIC = "fuzzy_logic",
    MACHINE_LEARNING = "machine_learning",
    HYBRID = "hybrid"
}
export interface PriorityRankerConfig {
    commitmentBoostWeight: number;
    noveltyBoostWeight: number;
    opportunityCostWeight: number;
    deadlinePressureWeight: number;
    resourceAvailabilityWeight: number;
    socialImpactWeight: number;
    learningValueWeight: number;
    riskPenaltyWeight: number;
    feasibilityWeight: number;
    enableAdvancedRanking: boolean;
    enableCommitmentTracking: boolean;
    enableOpportunityTracking: boolean;
    enableContextAwareness: boolean;
    enableAdaptiveWeights: boolean;
}
export declare class PriorityRanker extends EventEmitter {
    private config;
    private tasks;
    private commitments;
    private opportunities;
    private rankingHistory;
    private commitmentTracker;
    private opportunityTracker;
    private contextAnalyzer;
    constructor(config?: Partial<PriorityRankerConfig>);
    /**
     * Rank tasks by priority with advanced boosting
     */
    rankTasks(tasks: PriorityTask[], context: TaskContext): Promise<PriorityRanking>;
    /**
     * Calculate priority for a single task
     */
    private calculateTaskPriority;
    /**
     * Calculate commitment boost for a task
     */
    private calculateCommitmentBoost;
    /**
     * Calculate novelty boost for a task
     */
    private calculateNoveltyBoost;
    /**
     * Calculate opportunity cost boost for a task
     */
    private calculateOpportunityCostBoost;
    /**
     * Calculate deadline pressure for a task
     */
    private calculateDeadlinePressure;
    /**
     * Calculate resource availability for a task
     */
    private calculateResourceAvailability;
    /**
     * Calculate social impact of a task
     */
    private calculateSocialImpact;
    /**
     * Calculate learning value of a task
     */
    private calculateLearningValue;
    /**
     * Calculate risk level for a task
     */
    private calculateRiskLevel;
    /**
     * Calculate risk penalty for a risk level
     */
    private calculateRiskPenalty;
    /**
     * Calculate feasibility of a task
     */
    private calculateFeasibility;
    /**
     * Generate ranking reason for a task
     */
    private generateRankingReason;
    /**
     * Calculate ranking metadata
     */
    private calculateRankingMetadata;
    /**
     * Create priority histogram
     */
    private createPriorityHistogram;
    /**
     * Identify top priority factors
     */
    private identifyTopFactors;
    /**
     * Calculate ranking confidence
     */
    private calculateRankingConfidence;
    /**
     * Calculate variance of values
     */
    private calculateVariance;
    /**
     * Calculate ranking quality
     */
    private calculateRankingQuality;
    addTask(task: PriorityTask): void;
    addCommitment(commitment: Commitment): void;
    addOpportunity(opportunity: Opportunity): void;
    getTasks(): PriorityTask[];
    getCommitments(): Commitment[];
    getOpportunities(): Opportunity[];
    getRankingHistory(): PriorityRanking[];
    getStats(): {
        totalTasks: number;
        totalCommitments: number;
        totalOpportunities: number;
        rankingHistory: number;
        averageRankingConfidence: number;
    };
}
//# sourceMappingURL=priority-ranker.d.ts.map
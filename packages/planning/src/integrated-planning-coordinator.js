"use strict";
/**
 * Integrated Planning Coordinator
 *
 * Bridges HRM-inspired cognitive architecture with classical HTN/GOAP planning
 * Implements the full planning pipeline: Signals → Goals → Plans → Execution
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegratedPlanningCoordinator = void 0;
exports.createIntegratedPlanningCoordinator = createIntegratedPlanningCoordinator;
const events_1 = require("events");
const types_1 = require("./types");
// Import our HRM-inspired components
const cognitive_router_1 = require("./hierarchical-planner/cognitive-router");
const hrm_inspired_planner_1 = require("./hierarchical-planner/hrm-inspired-planner");
// Classical planning components
const hierarchical_planner_1 = require("./hierarchical-planner/hierarchical-planner");
const reactive_executor_1 = require("./reactive-executor/reactive-executor");
const goap_planner_1 = require("./reactive-executor/goap-planner");
// Goal formulation components
const homeostasis_monitor_1 = require("./goal-formulation/homeostasis-monitor");
const need_generator_1 = require("./goal-formulation/need-generator");
const goal_manager_1 = require("./goal-formulation/goal-manager");
const utility_calculator_1 = require("./goal-formulation/utility-calculator");
/**
 * Main coordinator that orchestrates the complete planning pipeline
 */
class IntegratedPlanningCoordinator extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        // Planning State
        this.activePlans = new Map();
        this.planningHistory = [];
        this.config = this.mergeWithDefaults(config);
        this.initializeComponents();
        this.performanceMetrics = new PlanningPerformanceMetrics();
    }
    /**
     * Main planning pipeline: Signals → Needs → Goals → Plans → Execution
     */
    async planAndExecute(signals, context) {
        const startTime = Date.now();
        try {
            // Step 1: Goal Formulation (Signals → Needs → Goals)
            const goalFormulation = await this.performGoalFormulation(signals, context);
            // Step 2: Cognitive Routing (Task Classification)
            const routingDecision = await this.performCognitiveRouting(goalFormulation.generatedGoals, context);
            // Step 3: Plan Generation (Goals → Plans)
            const planGeneration = await this.performPlanGeneration(goalFormulation.generatedGoals, routingDecision, context);
            // Step 4: Plan Quality Assessment
            const qualityAssessment = await this.assessPlanQuality(planGeneration.selectedPlan, context);
            // Step 5: Plan Execution Preparation
            await this.preparePlanExecution(planGeneration.selectedPlan, context);
            const result = {
                primaryPlan: planGeneration.selectedPlan,
                alternativePlans: this.generateAlternativePlans(planGeneration),
                routingDecision,
                planningApproach: this.determinePlanningApproach(routingDecision),
                confidence: qualityAssessment.feasibilityScore,
                estimatedSuccess: qualityAssessment.optimalityScore,
                planningLatency: Date.now() - startTime,
                goalFormulation,
                planGeneration,
                qualityAssessment,
            };
            // Record performance metrics
            this.performanceMetrics.recordPlanningSession(result);
            // Emit planning completion event
            this.emit('planningComplete', result);
            return result;
        }
        catch (error) {
            console.error('Planning pipeline error details:', error);
            console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            this.emit('planningError', error);
            throw new Error(`Planning pipeline failed: ${error}`);
        }
    }
    /**
     * Step 1: Goal Formulation - Transform signals into prioritized goals
     */
    async performGoalFormulation(signals, context) {
        // Process homeostatic signals into needs
        const homeostasisState = this.analyzeSignalsToHomeostasis(signals, context);
        const identifiedNeeds = (0, need_generator_1.generateNeeds)(homeostasisState);
        // Transform needs into candidate goals
        const candidateGoals = this.generateCandidateGoalsFromNeeds(identifiedNeeds, context);
        // Calculate utility scores and prioritize
        const utilityContext = {
            homeostasis: homeostasisState,
            goals: context.activeGoals,
            needs: identifiedNeeds,
            resources: context.availableResources,
            worldState: context.worldState,
            time: Date.now(),
        };
        // Create a utility calculator with balanced weights
        const utilityCalculator = (0, utility_calculator_1.createWeightedUtility)({
            needIntensity: 0.4,
            needUrgency: 0.3,
            healthRisk: 0.2,
            safetyRisk: 0.1,
        });
        const priorityRanking = candidateGoals
            .map((goal) => ({
            goalId: goal.id,
            score: utilityCalculator.calculate(utilityContext),
            reasoning: this.generatePriorityReasoning(goal, utilityContext),
        }))
            .sort((a, b) => b.score - a.score);
        // Select top goals for planning
        const generatedGoals = priorityRanking
            .slice(0, 5) // Top 5 goals
            .map((ranking) => candidateGoals.find((g) => g.id === ranking.goalId))
            .filter(Boolean);
        return {
            identifiedNeeds,
            generatedGoals,
            priorityRanking,
        };
    }
    /**
     * Step 2: Cognitive Routing - Determine planning approach
     */
    async performCognitiveRouting(goals, context) {
        if (!goals || goals.length === 0) {
            // Create a default exploration task for empty goals
            const defaultGoal = {
                id: 'default-exploration',
                type: types_1.GoalType.CURIOSITY,
                description: 'Explore environment and gather information',
                status: types_1.GoalStatus.PENDING,
                priority: 0.5,
                urgency: 0.3,
                utility: 0.4,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                preconditions: [],
                effects: [],
                subGoals: [],
            };
            goals = [defaultGoal];
        }
        // Use the primary goal for routing decision
        const primaryGoal = goals[0];
        const taskDescription = this.goalToTaskDescription(primaryGoal, context);
        const mappedDomain = this.mapGoalDomain(primaryGoal.type);
        const domain = ['minecraft', 'general', 'spatial', 'logical'].includes(mappedDomain)
            ? mappedDomain
            : 'general';
        const routingContext = {
            domain,
            urgency: context.timeConstraints.urgency,
            requiresStructured: this.requiresStructuredReasoning(primaryGoal),
            requiresCreativity: this.requiresCreativeReasoning(primaryGoal),
            requiresWorldKnowledge: this.requiresWorldKnowledge(primaryGoal),
        };
        return (0, cognitive_router_1.routeTask)(taskDescription, routingContext);
    }
    /**
     * Step 3: Plan Generation - Generate plans using selected approach
     */
    async performPlanGeneration(goals, routingDecision, context) {
        const primaryGoal = goals[0];
        let hrmPlan;
        let htnPlan;
        let goapPlan;
        let selectedPlan;
        let selectionReasoning;
        switch (routingDecision.router) {
            case 'hrm_structured':
                hrmPlan = await this.generateHRMPlan(primaryGoal, context);
                selectedPlan = this.convertHRMPlanToStandardPlan(hrmPlan, primaryGoal);
                selectionReasoning = `Selected HRM approach for structured reasoning: ${routingDecision.reasoning}`;
                break;
            case 'llm':
                // For LLM routing, we use HTN with creative/flexible methods
                htnPlan = await this.generateHTNPlan(primaryGoal, context, 'creative');
                selectedPlan = htnPlan;
                selectionReasoning = `Selected HTN approach with creative methods: ${routingDecision.reasoning}`;
                break;
            case 'collaborative':
                // Generate both HRM and HTN plans, then merge
                const [hrmResult, htnResult] = await Promise.all([
                    this.generateHRMPlan(primaryGoal, context),
                    this.generateHTNPlan(primaryGoal, context, 'balanced'),
                ]);
                hrmPlan = hrmResult;
                htnPlan = htnResult;
                selectedPlan = await this.mergeCollaborativePlans(hrmResult, htnResult, primaryGoal);
                selectionReasoning = `Selected collaborative approach merging HRM and HTN: ${routingDecision.reasoning}`;
                break;
            default:
                // Fallback to HTN
                htnPlan = await this.generateHTNPlan(primaryGoal, context, 'balanced');
                selectedPlan = htnPlan;
                selectionReasoning = `Fallback to HTN approach`;
        }
        // Generate GOAP plan as backup for reactive execution
        if (context.timeConstraints.urgency === 'emergency') {
            goapPlan = await this.generateGOAPPlan(primaryGoal, context);
        }
        return {
            hrmPlan,
            htnPlan,
            goapPlan,
            selectedPlan,
            selectionReasoning,
        };
    }
    /**
     * Generate HRM-style hierarchical plan
     */
    async generateHRMPlan(goal, context) {
        const planningContext = {
            goal: goal.description,
            currentState: context.worldState,
            constraints: this.extractConstraints(goal, context),
            resources: this.mapResources(context.availableResources),
            urgency: context.timeConstraints.urgency,
            domain: this.mapGoalDomain(goal.type),
        };
        const result = await this.hrmPlanner.planWithRefinement(planningContext);
        return result.finalPlan;
    }
    /**
     * Generate HTN hierarchical plan
     */
    async generateHTNPlan(goal, context, style) {
        // Use existing HTN planner with goal
        let plan = this.htnPlanner.decompose(goal);
        if (!plan) {
            throw new Error(`HTN planner failed to generate plan for goal: ${goal.id}`);
        }
        // Generate basic steps if plan is empty
        if (plan.steps.length === 0) {
            plan.steps = this.generateBasicPlanSteps(goal, context, style);
        }
        // Enhance with style-specific modifications
        return this.applyPlanningStyle(plan, style, context);
    }
    /**
     * Generate GOAP reactive plan
     */
    async generateGOAPPlan(goal, context) {
        // Convert goal to GOAP format and plan
        const goapGoal = this.convertToGOAPGoal(goal);
        const worldState = this.convertToGOAPState(context.worldState);
        return this.goapPlanner.plan(goapGoal, worldState);
    }
    /**
     * Merge HRM and HTN plans for collaborative approach
     */
    async mergeCollaborativePlans(hrmPlan, htnPlan, goal) {
        // Use HRM's high-level structure with HTN's detailed steps
        const mergedPlan = {
            id: `merged-${Date.now()}`,
            goalId: goal.id,
            steps: [],
            status: types_1.PlanStatus.PENDING,
            priority: Math.max(hrmPlan.confidence, htnPlan.priority),
            estimatedDuration: Math.min(hrmPlan.estimatedLatency || 0, htnPlan.estimatedDuration),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            successProbability: (hrmPlan.confidence + htnPlan.successProbability) / 2,
        };
        // Map HRM nodes to plan steps, augment with HTN details
        mergedPlan.steps = this.mergeHRMAndHTNSteps(hrmPlan.nodes, htnPlan.steps, goal);
        return mergedPlan;
    }
    /**
     * Convert HRM plan to standard Plan format
     */
    convertHRMPlanToStandardPlan(hrmPlan, goal) {
        return {
            id: hrmPlan.id,
            goalId: goal.id,
            steps: this.convertHRMNodesToSteps(hrmPlan.nodes, goal),
            status: types_1.PlanStatus.PENDING,
            priority: hrmPlan.confidence,
            estimatedDuration: hrmPlan.estimatedLatency || 0,
            createdAt: hrmPlan.createdAt,
            updatedAt: Date.now(),
            successProbability: hrmPlan.confidence,
        };
    }
    /**
     * Step 4: Assess plan quality across multiple dimensions
     */
    async assessPlanQuality(plan, context) {
        return {
            feasibilityScore: await this.assessFeasibility(plan, context),
            optimalityScore: await this.assessOptimality(plan, context),
            coherenceScore: await this.assessCoherence(plan, context),
            riskScore: await this.assessRisk(plan, context),
        };
    }
    /**
     * Step 5: Prepare plan for execution
     */
    async preparePlanExecution(plan, context) {
        // Register plan for execution tracking
        this.activePlans.set(plan.id, plan);
        // Set up monitoring and error recovery
        this.setupPlanMonitoring(plan);
        // Pre-validate first few steps
        await this.preValidatePlanSteps(plan, context);
        // Emit plan ready event
        this.emit('planReady', { plan, context });
    }
    /**
     * Execute a plan using the reactive executor
     */
    async executePlan(planId) {
        const plan = this.activePlans.get(planId);
        if (!plan) {
            throw new Error(`Plan ${planId} not found`);
        }
        try {
            const success = await this.reactiveExecutor.execute(plan);
            if (success) {
                plan.status = types_1.PlanStatus.COMPLETED;
                this.emit('planCompleted', plan);
            }
            else {
                plan.status = types_1.PlanStatus.FAILED;
                this.emit('planFailed', plan);
            }
            return success;
        }
        catch (error) {
            plan.status = types_1.PlanStatus.FAILED;
            this.emit('planError', { plan, error });
            return false;
        }
    }
    // Helper methods
    mergeWithDefaults(config) {
        return {
            hrmConfig: {
                maxRefinements: 3,
                qualityThreshold: 0.8,
                hrmLatencyTarget: 100,
                enableIterativeRefinement: true,
                ...config.hrmConfig,
            },
            htnConfig: {
                maxDecompositionDepth: 5,
                methodCacheSize: 100,
                preferenceWeights: { efficiency: 0.3, safety: 0.4, creativity: 0.3 },
                ...config.htnConfig,
            },
            goapConfig: {
                maxPlanLength: 10,
                planningBudgetMs: 20,
                repairThreshold: 0.8,
                ...config.goapConfig,
            },
            coordinatorConfig: {
                routingStrategy: 'hybrid',
                fallbackTimeout: 5000,
                enablePlanMerging: true,
                enableCrossValidation: true,
                ...config.coordinatorConfig,
            },
        };
    }
    initializeComponents() {
        // Initialize HRM components
        this.cognitiveRouter = (0, cognitive_router_1.createCognitiveRouter)({
            hrmLatencyTarget: this.config.hrmConfig.hrmLatencyTarget,
            llmLatencyTarget: 400,
            emergencyLatencyLimit: 50,
        });
        this.hrmPlanner = (0, hrm_inspired_planner_1.createHRMPlanner)({
            maxRefinements: this.config.hrmConfig.maxRefinements,
            qualityThreshold: this.config.hrmConfig.qualityThreshold,
        });
        // Initialize classical components
        this.htnPlanner = new hierarchical_planner_1.HierarchicalPlanner();
        this.goapPlanner = new goap_planner_1.GOAPPlanner();
        this.reactiveExecutor = new reactive_executor_1.ReactiveExecutor();
        // Initialize goal formulation components
        this.homeostasisMonitor = new homeostasis_monitor_1.HomeostasisMonitor();
        this.goalManager = new goal_manager_1.GoalManager();
    }
    // Utility methods for conversions and mappings
    goalToTaskDescription(goal, context) {
        const description = goal?.description || 'unknown task';
        const urgency = context?.timeConstraints?.urgency || 'medium';
        const threatLevel = context?.situationalFactors?.threatLevel || 0;
        return `${description} with urgency ${urgency} and threat level ${threatLevel}`;
    }
    /**
     * Convert raw signals into homeostasis state
     */
    analyzeSignalsToHomeostasis(signals, context) {
        // Start with current state from context
        const baseState = context.currentState || {};
        // Process signals to adjust homeostasis values
        const adjustments = {};
        signals.forEach((signal) => {
            switch (signal.type) {
                case 'hunger':
                    adjustments.hunger = this.normalizeSignalValue(signal.value);
                    break;
                case 'thirst':
                    // Map thirst to health impact
                    adjustments.health = Math.min(baseState.health || 1, 1 - this.normalizeSignalValue(signal.value) * 0.3);
                    break;
                case 'health_critical':
                    adjustments.health = Math.min(0.2, this.normalizeSignalValue(signal.value));
                    break;
                case 'threat_detected':
                case 'imminent_threat':
                    adjustments.safety = 1 - this.normalizeSignalValue(signal.value);
                    break;
                case 'curiosity':
                case 'exploration_drive':
                    adjustments.curiosity = this.normalizeSignalValue(signal.value);
                    break;
                case 'social_need':
                    adjustments.social = this.normalizeSignalValue(signal.value);
                    break;
                case 'achievement_drive':
                    adjustments.achievement = this.normalizeSignalValue(signal.value);
                    break;
                case 'energy':
                    adjustments.energy = this.normalizeSignalValue(signal.value);
                    break;
                default:
                    // Unknown signal type - contribute to general curiosity
                    adjustments.curiosity = Math.max(adjustments.curiosity || 0, 0.5);
            }
        });
        // Merge with context state and apply adjustments
        return this.homeostasisMonitor.sample({
            ...baseState,
            ...adjustments,
            timestamp: Date.now(),
        });
    }
    /**
     * Normalize signal values to 0-1 range
     */
    normalizeSignalValue(value) {
        if (value >= 0 && value <= 1)
            return value;
        if (value > 1 && value <= 100)
            return value / 100;
        return Math.max(0, Math.min(1, value));
    }
    /**
     * Generate candidate goals from identified needs
     */
    generateCandidateGoalsFromNeeds(needs, context) {
        const candidateGoals = [];
        const now = Date.now();
        needs.forEach((need, index) => {
            // Create a goal for each need
            const goalId = `goal-${now}-${need.type}-${index}`;
            // Map need types to goal types and descriptions
            const goalMapping = this.mapNeedToGoal(need, context);
            const goal = {
                id: goalId,
                type: goalMapping.type,
                description: goalMapping.description,
                status: types_1.GoalStatus.PENDING,
                priority: need.intensity * need.urgency, // Combined urgency and intensity
                urgency: need.urgency,
                utility: need.intensity,
                deadline: this.calculateGoalDeadline(need, context),
                createdAt: now,
                updatedAt: now,
                preconditions: [],
                effects: [],
                subGoals: [],
            };
            candidateGoals.push(goal);
        });
        return candidateGoals;
    }
    /**
     * Map a need to appropriate goal type and description
     */
    mapNeedToGoal(need, context) {
        switch (need.type) {
            case types_1.NeedType.SURVIVAL:
                return {
                    type: types_1.GoalType.SURVIVAL,
                    description: 'Ensure survival by maintaining health and resources',
                };
            case types_1.NeedType.SAFETY:
                return {
                    type: types_1.GoalType.SAFETY,
                    description: 'Establish safety and secure the immediate environment',
                };
            case types_1.NeedType.EXPLORATION:
                return {
                    type: types_1.GoalType.EXPLORATION,
                    description: 'Explore surroundings to gather information and resources',
                };
            case types_1.NeedType.SOCIAL:
                return {
                    type: types_1.GoalType.SOCIAL,
                    description: 'Engage with others and build social connections',
                };
            case types_1.NeedType.ACHIEVEMENT:
                return {
                    type: types_1.GoalType.ACHIEVEMENT,
                    description: 'Accomplish meaningful tasks and make progress',
                };
            case types_1.NeedType.CREATIVITY:
                return {
                    type: types_1.GoalType.CREATIVITY,
                    description: 'Express creativity and build innovative solutions',
                };
            case types_1.NeedType.CURIOSITY:
                return {
                    type: types_1.GoalType.CURIOSITY,
                    description: 'Satisfy curiosity and learn about the environment',
                };
            default:
                return {
                    type: types_1.GoalType.CURIOSITY,
                    description: `Address ${need.type} need through exploration`,
                };
        }
    }
    /**
     * Calculate appropriate deadline for a goal based on need urgency
     */
    calculateGoalDeadline(need, context) {
        const now = Date.now();
        const urgencyMultiplier = need.urgency;
        // Base deadline calculation
        let baseTimeMs = 60000; // 1 minute default
        switch (context.timeConstraints.urgency) {
            case 'emergency':
                baseTimeMs = 10000; // 10 seconds
                break;
            case 'high':
                baseTimeMs = 30000; // 30 seconds
                break;
            case 'medium':
                baseTimeMs = 120000; // 2 minutes
                break;
            case 'low':
                baseTimeMs = 300000; // 5 minutes
                break;
        }
        // Adjust by need urgency
        const adjustedTime = baseTimeMs / Math.max(0.1, urgencyMultiplier);
        return now + adjustedTime;
    }
    mapGoalDomain(goalType) {
        const mapping = {
            [types_1.GoalType.SURVIVAL]: 'survival',
            [types_1.GoalType.SAFETY]: 'safety',
            [types_1.GoalType.EXPLORATION]: 'spatial',
            [types_1.GoalType.SOCIAL]: 'social',
            [types_1.GoalType.ACHIEVEMENT]: 'logical',
            [types_1.GoalType.CREATIVITY]: 'creative',
            [types_1.GoalType.CURIOSITY]: 'exploration',
            [types_1.GoalType.REACH_LOCATION]: 'spatial',
            [types_1.GoalType.ACQUIRE_ITEM]: 'logical',
            [types_1.GoalType.SURVIVE_THREAT]: 'safety',
        };
        return mapping[goalType] || 'general';
    }
    requiresStructuredReasoning(goal) {
        return [types_1.GoalType.ACHIEVEMENT, types_1.GoalType.EXPLORATION].includes(goal.type);
    }
    requiresCreativeReasoning(goal) {
        return [types_1.GoalType.CREATIVITY, types_1.GoalType.SOCIAL].includes(goal.type);
    }
    requiresWorldKnowledge(goal) {
        return [types_1.GoalType.EXPLORATION, types_1.GoalType.SOCIAL, types_1.GoalType.CURIOSITY].includes(goal.type);
    }
    generatePriorityReasoning(goal, context) {
        return `Goal ${goal.description} prioritized due to ${goal.type} need with utility score based on current homeostasis`;
    }
    determinePlanningApproach(routingDecision) {
        switch (routingDecision.router) {
            case 'hrm_structured':
                return 'hrm';
            case 'llm':
                return 'htn';
            case 'collaborative':
                return 'hybrid';
            default:
                return 'htn';
        }
    }
    /**
     * Generate basic plan steps based on goal type
     */
    generateBasicPlanSteps(goal, context, style) {
        const steps = [];
        const now = Date.now();
        switch (goal.type) {
            case types_1.GoalType.SURVIVAL:
                steps.push(this.createPlanStep('assess-health', 'Assess current health status', [], 30), this.createPlanStep('secure-resources', 'Secure basic survival resources', ['assess-health'], 120), this.createPlanStep('establish-safety', 'Establish safe environment', ['secure-resources'], 90));
                break;
            case types_1.GoalType.SAFETY:
                steps.push(this.createPlanStep('scan-threats', 'Scan for immediate threats', [], 20), this.createPlanStep('secure-area', 'Secure immediate area', ['scan-threats'], 60), this.createPlanStep('establish-perimeter', 'Establish safety perimeter', ['secure-area'], 90));
                break;
            case types_1.GoalType.EXPLORATION:
                steps.push(this.createPlanStep('plan-route', 'Plan exploration route', [], 40), this.createPlanStep('gather-supplies', 'Gather exploration supplies', ['plan-route'], 80), this.createPlanStep('begin-exploration', 'Begin systematic exploration', ['gather-supplies'], 300));
                break;
            case types_1.GoalType.SOCIAL:
                steps.push(this.createPlanStep('locate-entities', 'Locate social entities', [], 50), this.createPlanStep('initiate-contact', 'Initiate social contact', ['locate-entities'], 120), this.createPlanStep('build-rapport', 'Build social rapport', ['initiate-contact'], 180));
                break;
            case types_1.GoalType.ACHIEVEMENT:
                steps.push(this.createPlanStep('define-objectives', 'Define specific objectives', [], 60), this.createPlanStep('gather-tools', 'Gather necessary tools', ['define-objectives'], 90), this.createPlanStep('execute-tasks', 'Execute planned tasks', ['gather-tools'], 240));
                break;
            case types_1.GoalType.CREATIVITY:
                steps.push(this.createPlanStep('brainstorm-ideas', 'Brainstorm creative ideas', [], 90), this.createPlanStep('select-concept', 'Select best concept', ['brainstorm-ideas'], 45), this.createPlanStep('implement-solution', 'Implement creative solution', ['select-concept'], 180));
                break;
            case types_1.GoalType.CURIOSITY:
                steps.push(this.createPlanStep('identify-questions', 'Identify key questions', [], 30), this.createPlanStep('investigate', 'Investigate phenomena', ['identify-questions'], 150), this.createPlanStep('synthesize-knowledge', 'Synthesize new knowledge', ['investigate'], 90));
                break;
            default:
                steps.push(this.createPlanStep('analyze-situation', 'Analyze current situation', [], 60), this.createPlanStep('take-action', 'Take appropriate action', ['analyze-situation'], 120));
        }
        // Adjust for urgency
        if (context.timeConstraints.urgency === 'emergency') {
            steps.forEach((step) => {
                step.estimatedDuration = Math.max(10, step.estimatedDuration * 0.3);
            });
        }
        return steps;
    }
    /**
     * Create a standardized plan step
     */
    createPlanStep(id, description, dependencies, duration) {
        return {
            id,
            action: {
                id,
                type: description,
                parameters: {},
                preconditions: {},
                effects: { [id.replace('-', '_')]: true },
                cost: duration / 60, // Convert to relative cost
                estimatedDuration: duration,
            },
            status: 'pending',
            dependencies,
            estimatedDuration: duration,
            resources: [
                { type: 'time', amount: duration, availability: 'available' },
                {
                    type: 'energy',
                    amount: Math.ceil(duration / 30),
                    availability: 'available',
                },
            ],
        };
    }
    // Placeholder implementations for missing methods
    generateAlternativePlans(planGeneration) {
        return [];
    }
    extractConstraints(goal, context) {
        return [];
    }
    mapResources(resources) {
        return {};
    }
    applyPlanningStyle(plan, style, context) {
        return plan;
    }
    convertToGOAPGoal(goal) {
        return {};
    }
    convertToGOAPState(worldState) {
        return {};
    }
    mergeHRMAndHTNSteps(hrmNodes, htnSteps, goal) {
        return [];
    }
    convertHRMNodesToSteps(nodes, goal) {
        return [];
    }
    convertHRMStatus(status) {
        return types_1.PlanStatus.PENDING;
    }
    async assessFeasibility(plan, context) {
        return 0.8;
    }
    async assessOptimality(plan, context) {
        return 0.7;
    }
    async assessCoherence(plan, context) {
        return 0.9;
    }
    async assessRisk(plan, context) {
        return 0.2;
    }
    setupPlanMonitoring(plan) { }
    async preValidatePlanSteps(plan, context) { }
    /**
     * Get current performance metrics
     */
    getPerformanceMetrics() {
        return this.performanceMetrics.getMetrics();
    }
    /**
     * Get planning history
     */
    getPlanningHistory() {
        return [...this.planningHistory];
    }
}
exports.IntegratedPlanningCoordinator = IntegratedPlanningCoordinator;
/**
 * Performance metrics tracking for the integrated planner
 */
class PlanningPerformanceMetrics {
    constructor() {
        this.sessions = [];
    }
    recordPlanningSession(result) {
        this.sessions.push(result);
    }
    getMetrics() {
        if (this.sessions.length === 0)
            return {};
        return {
            totalSessions: this.sessions.length,
            averageLatency: this.sessions.reduce((sum, s) => sum + s.planningLatency, 0) /
                this.sessions.length,
            averageConfidence: this.sessions.reduce((sum, s) => sum + s.confidence, 0) /
                this.sessions.length,
            approachDistribution: this.getApproachDistribution(),
            successRate: this.sessions.filter((s) => s.estimatedSuccess > 0.7).length /
                this.sessions.length,
        };
    }
    getApproachDistribution() {
        const distribution = {};
        this.sessions.forEach((session) => {
            distribution[session.planningApproach] =
                (distribution[session.planningApproach] || 0) + 1;
        });
        return distribution;
    }
}
/**
 * Factory function for creating the integrated planning coordinator
 */
function createIntegratedPlanningCoordinator(config) {
    return new IntegratedPlanningCoordinator(config);
}
//# sourceMappingURL=integrated-planning-coordinator.js.map
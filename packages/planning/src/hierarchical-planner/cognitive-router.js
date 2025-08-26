"use strict";
/**
 * Cognitive Task Router
 *
 * Implements HRM-inspired task routing between LLM and structured reasoning
 * Based on the integration plan: "Mixture-of-Experts Routing" (lines 67-68)
 *
 * Routes problems to:
 * - LLM: Natural language, open-ended queries, social reasoning
 * - HRM-Style: Structured puzzles, navigation, logic problems
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitiveTaskRouter = exports.TaskContextSchema = exports.RoutingDecisionSchema = exports.RouterTypeSchema = exports.TaskTypeSchema = void 0;
exports.createCognitiveRouter = createCognitiveRouter;
exports.routeTask = routeTask;
const zod_1 = require("zod");
// Core types for task routing
exports.TaskTypeSchema = zod_1.z.enum([
    'navigation',
    'logic_puzzle',
    'resource_optimization',
    'spatial_reasoning',
    'pattern_recognition',
    'natural_language',
    'social_interaction',
    'open_ended_query',
    'creative_task',
    'ethical_decision',
]);
exports.RouterTypeSchema = zod_1.z.enum([
    'llm',
    'hrm_structured',
    'collaborative',
]);
exports.RoutingDecisionSchema = zod_1.z.object({
    taskType: exports.TaskTypeSchema,
    confidence: zod_1.z.number().min(0).max(1),
    router: exports.RouterTypeSchema,
    reasoning: zod_1.z.string(),
    expectedLatency: zod_1.z.number(), // milliseconds
    complexity: zod_1.z.number().min(1).max(10),
});
exports.TaskContextSchema = zod_1.z.object({
    input: zod_1.z.string(),
    domain: zod_1.z.enum(['minecraft', 'general', 'spatial', 'logical']),
    urgency: zod_1.z.enum(['low', 'medium', 'high', 'emergency']),
    requiresStructured: zod_1.z.boolean(),
    requiresCreativity: zod_1.z.boolean(),
    requiresWorldKnowledge: zod_1.z.boolean(),
    previousResults: zod_1.z.array(zod_1.z.any()).optional(),
});
/**
 * HRM-Inspired Cognitive Router
 *
 * Implements the "gating function" described in the integration plan
 * to direct problems to appropriate reasoning systems.
 */
class CognitiveTaskRouter {
    constructor(config = {
        hrmLatencyTarget: 100,
        llmLatencyTarget: 400,
        emergencyLatencyLimit: 50,
    }) {
        this.config = config;
        this.routingHistory = [];
        this.performanceMetrics = new Map();
    }
    /**
     * Main routing decision logic
     * Based on integration plan task routing criteria
     */
    routeTask(context) {
        const taskType = this.classifyTask(context);
        const router = this.selectRouter(taskType, context);
        const complexity = this.estimateComplexity(context);
        const expectedLatency = this.estimateLatency(router, complexity);
        const decision = {
            taskType,
            confidence: this.calculateConfidence(taskType, context),
            router,
            reasoning: this.generateReasoning(taskType, context, router),
            expectedLatency,
            complexity,
        };
        this.routingHistory.push(decision);
        return decision;
    }
    /**
     * Classify the task type based on input analysis
     * Implements the detection logic from integration plan
     */
    classifyTask(context) {
        const { input, requiresStructured, requiresCreativity, requiresWorldKnowledge, } = context;
        const inputLower = input.toLowerCase();
        // Explicit creativity indicators take precedence
        if (this.isCreativeTask(inputLower) || requiresCreativity)
            return 'creative_task';
        // Ethical decisions (check early as they use specific keywords)
        if (this.isEthicalDecision(inputLower))
            return 'ethical_decision';
        // Structured reasoning tasks (HRM candidates)
        if (this.isNavigationTask(inputLower))
            return 'navigation';
        if (this.isLogicPuzzle(inputLower))
            return 'logic_puzzle';
        if (this.isSpatialReasoning(inputLower))
            return 'spatial_reasoning';
        if (this.isPatternRecognition(inputLower))
            return 'pattern_recognition';
        // Resource optimization (check after specific navigation/logic)
        if (this.isResourceOptimization(inputLower))
            return 'resource_optimization';
        // Language-heavy tasks (LLM candidates)
        if (this.isSocialInteraction(inputLower))
            return 'social_interaction';
        if (requiresWorldKnowledge && !requiresStructured)
            return 'natural_language';
        // Default to open-ended
        return 'open_ended_query';
    }
    /**
     * Select the appropriate router based on task classification
     * Implements the routing logic from the integration plan
     */
    selectRouter(taskType, context) {
        // Emergency constraint: use fastest available (HRM preferred)
        if (context.urgency === 'emergency') {
            return ['navigation', 'logic_puzzle', 'spatial_reasoning'].includes(taskType)
                ? 'hrm_structured'
                : 'llm';
        }
        // Structured reasoning -> HRM (as per integration plan)
        if ([
            'navigation',
            'logic_puzzle',
            'resource_optimization',
            'spatial_reasoning',
            'pattern_recognition',
        ].includes(taskType)) {
            return 'hrm_structured';
        }
        // Ethical decisions -> Collaborative (HRM logic + LLM narrative)
        if (taskType === 'ethical_decision') {
            return 'collaborative';
        }
        // Language and creative tasks -> LLM
        if ([
            'natural_language',
            'social_interaction',
            'creative_task',
            'open_ended_query',
        ].includes(taskType)) {
            return 'llm';
        }
        return 'llm'; // Default fallback
    }
    /**
     * Calculate routing confidence based on task characteristics
     */
    calculateConfidence(taskType, context) {
        let confidence = 0.7; // Base confidence
        // High confidence for clear structured tasks
        if (['navigation', 'logic_puzzle', 'spatial_reasoning'].includes(taskType)) {
            confidence += 0.2;
        }
        // High confidence for clear language tasks
        if (['social_interaction', 'natural_language'].includes(taskType)) {
            confidence += 0.15;
        }
        // Reduce confidence for mixed requirements
        if (context.requiresStructured && context.requiresCreativity) {
            confidence -= 0.1;
        }
        // Historical performance boost
        const historyKey = `${taskType}`;
        const metrics = this.performanceMetrics.get(historyKey);
        if (metrics && metrics.total > 5) {
            const successRate = metrics.success / metrics.total;
            confidence += (successRate - 0.5) * 0.2; // Boost based on historical success
        }
        return Math.max(0.1, Math.min(1.0, confidence));
    }
    /**
     * Estimate processing latency based on router and complexity
     */
    estimateLatency(router, complexity) {
        const baseLatency = {
            hrm_structured: this.config.hrmLatencyTarget,
            llm: this.config.llmLatencyTarget,
            collaborative: this.config.hrmLatencyTarget + this.config.llmLatencyTarget * 0.3,
        }[router] || this.config.llmLatencyTarget;
        // Scale by complexity (linear relationship)
        return Math.round(baseLatency * (0.5 + complexity * 0.1));
    }
    /**
     * Estimate task complexity (1-10 scale)
     */
    estimateComplexity(context) {
        let complexity = 3; // Base complexity
        // Input length factor
        const inputLength = context.input.length;
        if (inputLength > 500)
            complexity += 2;
        else if (inputLength > 200)
            complexity += 1;
        // Multiple requirements increase complexity
        let requirements = 0;
        if (context.requiresStructured)
            requirements++;
        if (context.requiresCreativity)
            requirements++;
        if (context.requiresWorldKnowledge)
            requirements++;
        complexity += requirements;
        // Domain-specific adjustments
        if (context.domain === 'logical')
            complexity += 1;
        if (context.domain === 'spatial')
            complexity += 1;
        return Math.max(1, Math.min(10, complexity));
    }
    /**
     * Generate human-readable reasoning for the routing decision
     */
    generateReasoning(taskType, context, router) {
        const routerMap = {
            hrm_structured: 'structured reasoning system',
            llm: 'language model',
            collaborative: 'hybrid reasoning (HRM + LLM)',
        };
        const urgencyNote = context.urgency === 'emergency' ? ' (emergency: prioritizing speed)' : '';
        const routerDescription = routerMap[router] || 'unknown router';
        return `Task classified as ${taskType}. Routing to ${routerDescription} due to ${this.getTaskCharacteristics(taskType, context)}${urgencyNote}.`;
    }
    /**
     * Get key characteristics that influenced routing
     */
    getTaskCharacteristics(taskType, context) {
        if (['navigation', 'logic_puzzle', 'spatial_reasoning'].includes(taskType)) {
            return 'structured problem requiring precise reasoning';
        }
        if (['social_interaction', 'natural_language'].includes(taskType)) {
            return 'language-heavy task requiring world knowledge';
        }
        if (taskType === 'ethical_decision') {
            return 'ethical complexity requiring both logic and narrative understanding';
        }
        return 'mixed characteristics requiring flexible reasoning';
    }
    /**
     * Record performance metrics for adaptive routing
     */
    recordTaskResult(decision, success, actualLatency) {
        const key = `${decision.taskType}`;
        const current = this.performanceMetrics.get(key) || {
            success: 0,
            total: 0,
            avgLatency: 0,
        };
        current.total++;
        if (success)
            current.success++;
        current.avgLatency =
            (current.avgLatency * (current.total - 1) + actualLatency) /
                current.total;
        this.performanceMetrics.set(key, current);
    }
    /**
     * Get routing performance statistics
     */
    getRoutingStats() {
        const totalDecisions = this.routingHistory.length;
        const accuracyByTaskType = {};
        const avgLatencyByRouter = {};
        // Calculate accuracy by task type
        for (const [key, metrics] of this.performanceMetrics.entries()) {
            accuracyByTaskType[key] =
                metrics.total > 0 ? metrics.success / metrics.total : 0;
        }
        // Calculate average latency by router type
        const routerLatencies = {};
        for (const decision of this.routingHistory) {
            if (!routerLatencies[decision.router])
                routerLatencies[decision.router] = [];
            routerLatencies[decision.router].push(decision.expectedLatency);
        }
        for (const [router, latencies] of Object.entries(routerLatencies)) {
            avgLatencyByRouter[router] =
                latencies.reduce((a, b) => a + b, 0) / latencies.length;
        }
        // Emergency response rate (decisions under emergency latency limit)
        const emergencyResponses = this.routingHistory.filter((d) => d.expectedLatency <= this.config.emergencyLatencyLimit).length;
        const emergencyResponseRate = totalDecisions > 0 ? emergencyResponses / totalDecisions : 0;
        return {
            totalDecisions,
            accuracyByTaskType,
            avgLatencyByRouter,
            emergencyResponseRate,
        };
    }
    // Task classification helper methods
    isNavigationTask(input) {
        const navKeywords = [
            'path',
            'route',
            'navigate',
            'find way',
            'shortest',
            'maze',
            'go to',
            'travel',
        ];
        return navKeywords.some((keyword) => input.includes(keyword));
    }
    isLogicPuzzle(input) {
        const puzzleKeywords = [
            'puzzle',
            'solve',
            'sudoku',
            'riddle',
            'if then',
            'logic',
            'deduce',
        ];
        return puzzleKeywords.some((keyword) => input.includes(keyword));
    }
    isResourceOptimization(input) {
        const resourceKeywords = [
            'optimize',
            'efficient',
            'minimize',
            'maximize',
            'resource',
            'cost',
            'best',
        ];
        return resourceKeywords.some((keyword) => input.includes(keyword));
    }
    isSpatialReasoning(input) {
        const spatialKeywords = [
            'spatial',
            'location',
            'position',
            'coordinates',
            'distance',
            'area',
            'volume',
        ];
        return spatialKeywords.some((keyword) => input.includes(keyword));
    }
    isPatternRecognition(input) {
        const patternKeywords = [
            'pattern',
            'sequence',
            'series',
            'repeat',
            'cycle',
            'trend',
        ];
        return patternKeywords.some((keyword) => input.includes(keyword));
    }
    isSocialInteraction(input) {
        const socialKeywords = [
            'say',
            'tell',
            'ask',
            'respond',
            'social',
            'conversation',
            'communicate',
        ];
        return socialKeywords.some((keyword) => input.includes(keyword));
    }
    isCreativeTask(input) {
        const creativeKeywords = [
            'create',
            'design',
            'imagine',
            'invent',
            'story',
            'creative',
            'art',
            'tell me a story',
        ];
        return creativeKeywords.some((keyword) => input.includes(keyword));
    }
    isEthicalDecision(input) {
        const ethicalKeywords = [
            'should i',
            'ethical',
            'moral',
            'right thing',
            'wrong to',
            'harm',
            'help person',
            'fair to',
            'ethics',
        ];
        return ethicalKeywords.some((keyword) => input.includes(keyword));
    }
}
exports.CognitiveTaskRouter = CognitiveTaskRouter;
/**
 * Factory function for creating configured cognitive router
 */
function createCognitiveRouter(config) {
    const defaultConfig = {
        hrmLatencyTarget: 100,
        llmLatencyTarget: 400,
        emergencyLatencyLimit: 50,
        ...config,
    };
    return new CognitiveTaskRouter(defaultConfig);
}
/**
 * Utility function for quick task routing
 */
function routeTask(input, options = {}) {
    const router = createCognitiveRouter();
    const context = {
        input,
        domain: options.domain || 'general',
        urgency: options.urgency || 'medium',
        requiresStructured: options.requiresStructured ?? false,
        requiresCreativity: options.requiresCreativity ?? false,
        requiresWorldKnowledge: options.requiresWorldKnowledge ?? false,
        ...options,
    };
    return router.routeTask(context);
}
//# sourceMappingURL=cognitive-router.js.map
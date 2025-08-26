"use strict";
/**
 * HRM-Inspired Hierarchical Planning System
 *
 * Integration layer combining cognitive routing and hierarchical planning
 * Based on the HRM integration plan for M3 implementation
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegratedPlanningSystem = exports.quickPlan = exports.createHRMPlanner = exports.HRMInspiredPlanner = exports.routeTask = exports.createCognitiveRouter = exports.CognitiveTaskRouter = void 0;
exports.createIntegratedPlanningSystem = createIntegratedPlanningSystem;
exports.plan = plan;
// Export cognitive router components
var cognitive_router_1 = require("./cognitive-router");
Object.defineProperty(exports, "CognitiveTaskRouter", { enumerable: true, get: function () { return cognitive_router_1.CognitiveTaskRouter; } });
Object.defineProperty(exports, "createCognitiveRouter", { enumerable: true, get: function () { return cognitive_router_1.createCognitiveRouter; } });
Object.defineProperty(exports, "routeTask", { enumerable: true, get: function () { return cognitive_router_1.routeTask; } });
// Export HRM planner components with aliases to avoid conflicts
var hrm_inspired_planner_1 = require("./hrm-inspired-planner");
Object.defineProperty(exports, "HRMInspiredPlanner", { enumerable: true, get: function () { return hrm_inspired_planner_1.HRMInspiredPlanner; } });
Object.defineProperty(exports, "createHRMPlanner", { enumerable: true, get: function () { return hrm_inspired_planner_1.createHRMPlanner; } });
// Export utility functions
var hrm_inspired_planner_2 = require("./hrm-inspired-planner");
Object.defineProperty(exports, "quickPlan", { enumerable: true, get: function () { return hrm_inspired_planner_2.quickPlan; } });
/**
 * Integrated Planning System
 *
 * Combines cognitive routing with HRM-inspired hierarchical planning
 * Implements the hybrid approach described in the integration plan
 */
const cognitive_router_2 = require("./cognitive-router");
const hrm_inspired_planner_3 = require("./hrm-inspired-planner");
class IntegratedPlanningSystem {
    constructor(config = {}) {
        this.performanceHistory = [];
        const routerConfig = {
            hrmLatencyTarget: 100,
            llmLatencyTarget: 400,
            emergencyLatencyLimit: 50,
            ...(config.routerConfig || {}),
        };
        this.cognitiveRouter = new cognitive_router_2.CognitiveTaskRouter(routerConfig);
        this.hrmPlanner = new hrm_inspired_planner_3.HRMInspiredPlanner(config.plannerConfig);
    }
    /**
     * Main planning interface - routes task and generates appropriate plan
     */
    async planTask(input, context = {}) {
        const startTime = Date.now();
        // Step 1: Route the task
        const taskContext = {
            input,
            domain: context.domain || 'general',
            urgency: context.urgency || 'medium',
            requiresStructured: context.requiresStructured ?? this.detectStructuredRequirement(input),
            requiresCreativity: context.requiresCreativity ?? this.detectCreativityRequirement(input),
            requiresWorldKnowledge: context.requiresWorldKnowledge ??
                this.detectWorldKnowledgeRequirement(input),
            previousResults: context.previousResults,
        };
        const routingDecision = this.cognitiveRouter.routeTask(taskContext);
        let plan;
        let llmResponse;
        let collaborative;
        let success = false;
        try {
            // Step 2: Execute based on routing decision
            switch (routingDecision.router) {
                case 'hrm_structured':
                    plan = await this.executeHRMPlanning(input, context);
                    success = plan.confidence > 0.7;
                    break;
                case 'llm':
                    llmResponse = await this.executeLLMReasoning(input, context);
                    success = llmResponse.length > 0;
                    break;
                case 'collaborative':
                    collaborative = await this.executeCollaborativeReasoning(input, context);
                    success =
                        collaborative.hrmPlan.confidence > 0.7 &&
                            collaborative.llmNarrative.length > 0;
                    break;
            }
        }
        catch (error) {
            console.error('Planning execution failed:', error);
            success = false;
        }
        const totalLatency = Date.now() - startTime;
        // Record performance for adaptive learning
        this.performanceHistory.push({
            task: input.substring(0, 100), // Truncate for storage
            router: routingDecision.router,
            success,
            latency: totalLatency,
            timestamp: Date.now(),
        });
        // Update cognitive router performance metrics
        this.cognitiveRouter.recordTaskResult(routingDecision, success, totalLatency);
        return {
            routingDecision,
            plan,
            llmResponse,
            collaborative,
            totalLatency,
            success,
        };
    }
    /**
     * Execute HRM-style structured planning
     */
    async executeHRMPlanning(input, context) {
        const planningContext = {
            goal: input,
            currentState: context.currentState || {},
            constraints: context.constraints || [],
            resources: context.resources || {},
            timeLimit: context.timeLimit,
            urgency: context.urgency || 'medium',
            domain: context.domain || 'general',
        };
        const result = await this.hrmPlanner.planWithRefinement(planningContext);
        return result.finalPlan;
    }
    /**
     * Execute LLM-based reasoning (placeholder for actual LLM integration)
     */
    async executeLLMReasoning(input, context) {
        // This would integrate with our cognitive core LLM interface
        // For now, return a simulated response
        await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate LLM latency
        return `LLM reasoning response for: ${input}. This would be processed by our DeepSeek-R1 model through the cognitive core interface.`;
    }
    /**
     * Execute collaborative reasoning (HRM + LLM)
     */
    async executeCollaborativeReasoning(input, context) {
        // Execute both HRM planning and LLM reasoning in parallel
        const [hrmPlan, llmNarrative] = await Promise.all([
            this.executeHRMPlanning(input, context),
            this.executeLLMReasoning(input, context),
        ]);
        // Synthesize the results
        const synthesis = this.synthesizeCollaborativeResults(hrmPlan, llmNarrative, input);
        return {
            hrmPlan,
            llmNarrative,
            synthesis,
        };
    }
    /**
     * Synthesize HRM and LLM results for collaborative reasoning
     */
    synthesizeCollaborativeResults(hrmPlan, llmNarrative, originalInput) {
        return (`Collaborative Analysis for: ${originalInput}\n\n` +
            `Structured Plan (HRM): ${hrmPlan.nodes.length} steps with ${hrmPlan.confidence.toFixed(2)} confidence\n` +
            `Narrative Analysis (LLM): ${llmNarrative.substring(0, 200)}...\n\n` +
            `Synthesis: The structured approach provides ${hrmPlan.nodes.length} concrete steps ` +
            `while the narrative analysis offers contextual understanding. ` +
            `Recommended approach: Execute structured plan with narrative guidance.`);
    }
    /**
     * Detect if task requires structured reasoning
     */
    detectStructuredRequirement(input) {
        const structuredKeywords = [
            'navigate',
            'path',
            'route',
            'optimize',
            'calculate',
            'solve',
            'plan',
            'sequence',
            'order',
            'step',
            'algorithm',
            'logic',
        ];
        return structuredKeywords.some((keyword) => input.toLowerCase().includes(keyword));
    }
    /**
     * Detect if task requires creativity
     */
    detectCreativityRequirement(input) {
        const creativeKeywords = [
            'create',
            'design',
            'imagine',
            'invent',
            'story',
            'art',
            'creative',
            'novel',
            'original',
            'brainstorm',
            'innovate',
        ];
        return creativeKeywords.some((keyword) => input.toLowerCase().includes(keyword));
    }
    /**
     * Detect if task requires world knowledge
     */
    detectWorldKnowledgeRequirement(input) {
        const knowledgeKeywords = [
            'what',
            'why',
            'how',
            'when',
            'where',
            'who',
            'explain',
            'describe',
            'tell',
            'know',
            'understand',
            'history',
            'science',
            'culture',
            'facts',
        ];
        return knowledgeKeywords.some((keyword) => input.toLowerCase().includes(keyword));
    }
    /**
     * Get system performance statistics
     */
    getPerformanceStats() {
        const totalTasks = this.performanceHistory.length;
        const successfulTasks = this.performanceHistory.filter((p) => p.success).length;
        const successRate = totalTasks > 0 ? successfulTasks / totalTasks : 0;
        const totalLatency = this.performanceHistory.reduce((sum, p) => sum + p.latency, 0);
        const averageLatency = totalTasks > 0 ? totalLatency / totalTasks : 0;
        const routerDistribution = {};
        this.performanceHistory.forEach((p) => {
            routerDistribution[p.router] = (routerDistribution[p.router] || 0) + 1;
        });
        const recentPerformance = this.performanceHistory.slice(-10).map((p) => ({
            router: p.router,
            success: p.success,
            latency: p.latency,
        }));
        return {
            totalTasks,
            successRate,
            averageLatency,
            routerDistribution,
            recentPerformance,
        };
    }
    /**
     * Reset performance history (useful for testing)
     */
    resetPerformanceHistory() {
        this.performanceHistory = [];
    }
}
exports.IntegratedPlanningSystem = IntegratedPlanningSystem;
/**
 * Create a configured integrated planning system
 */
function createIntegratedPlanningSystem(config) {
    return new IntegratedPlanningSystem(config);
}
/**
 * Quick planning utility function
 */
async function plan(input, options = {}) {
    const system = createIntegratedPlanningSystem();
    return await system.planTask(input, options);
}
//# sourceMappingURL=index.js.map
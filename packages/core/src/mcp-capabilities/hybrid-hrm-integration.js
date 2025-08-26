#!/usr/bin/env tsx
"use strict";
/**
 * Hybrid HRM Integration
 *
 * Implements the documented three-system architecture:
 * - LLM: Language/narrative/social reasoning
 * - Python HRM: Structured and quick logistical reasoning (27M parameters)
 * - GOAP: Quick reactive responses (combat, survival, emergencies)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridHRMRouter = void 0;
/**
 * Hybrid HRM Router
 *
 * Routes tasks to the most appropriate reasoning system according to our documented architecture:
 * - Python HRM: Structured and quick logistical reasoning (puzzles, optimization, pathfinding)
 * - LLM: Language/narrative/social reasoning (explanations, creative tasks, social interaction)
 * - GOAP: Quick reactive responses (combat, survival, emergency responses)
 */
class HybridHRMRouter {
    constructor(pythonHRMConfig, llmConfig, goapConfig) {
        this.isInitialized = false;
        this.pythonHRM = this.createPythonHRMInterface(pythonHRMConfig);
        this.llm = this.createLLMInterface(llmConfig);
        this.goap = this.createGOAPInterface(goapConfig);
    }
    /**
     * Initialize all three reasoning systems
     */
    async initialize() {
        console.log('🧠 Initializing Hybrid HRM System...');
        try {
            // Initialize Python HRM
            const pythonHRMAvailable = await this.pythonHRM.initialize();
            if (!pythonHRMAvailable) {
                console.warn('⚠️ Python HRM not available, falling back to LLM-only mode');
            }
            // Initialize LLM
            const llmAvailable = this.llm.isAvailable();
            if (!llmAvailable) {
                console.warn('⚠️ LLM not available, falling back to GOAP-only mode');
            }
            // Initialize GOAP
            const goapAvailable = this.goap.isAvailable();
            if (!goapAvailable) {
                console.warn('⚠️ GOAP not available, system may be limited');
            }
            this.isInitialized = true;
            console.log('✅ Hybrid HRM System initialized');
            return true;
        }
        catch (error) {
            console.error('❌ Failed to initialize Hybrid HRM System:', error);
            return false;
        }
    }
    /**
     * Route and execute reasoning task according to documented architecture
     */
    async reason(task, context, budget) {
        if (!this.isInitialized) {
            throw new Error('Hybrid HRM System not initialized');
        }
        const startTime = performance.now();
        const taskSignature = this.analyzeTaskSignature(task, context);
        // Debug logging
        console.log(`🔍 Task: "${task}"`);
        console.log(`📊 Signature:`, {
            structured: taskSignature.structuredReasoning.toFixed(2),
            narrative: taskSignature.narrativeReasoning.toFixed(2),
            reactive: taskSignature.reactiveResponse.toFixed(2),
            complexity: taskSignature.complexity.toFixed(2),
            timeCritical: taskSignature.timeCritical,
            safetyCritical: taskSignature.safetyCritical,
        });
        // Route to appropriate system based on documented architecture
        if (this.shouldUseGOAP(taskSignature)) {
            console.log(`⚡ Routing to GOAP (reactive response)`);
            return this.executeGOAP(task, context, budget);
        }
        else if (this.shouldUsePythonHRM(taskSignature)) {
            console.log(`🧠 Routing to Python HRM (structured reasoning)`);
            return this.executePythonHRM(task, context, budget);
        }
        else if (this.shouldUseLLM(taskSignature)) {
            console.log(`💬 Routing to LLM (language/narrative)`);
            return this.executeLLM(task, context);
        }
        console.log(`⚡ Routing to GOAP (fallback)`);
        return this.executeGOAP(task, context, budget);
    }
    /**
     * Analyze task to determine optimal routing
     */
    analyzeTaskSignature(task
    // context: LeafContext
    ) {
        const signature = {
            structuredReasoning: 0,
            narrativeReasoning: 0,
            reactiveResponse: 0,
            complexity: 0,
            timeCritical: false,
            safetyCritical: false,
        };
        const taskLower = task.toLowerCase();
        // Structured reasoning indicators (Python HRM domain)
        const structuredKeywords = [
            'puzzle',
            'solve',
            'optimize',
            'path',
            'route',
            'algorithm',
            'calculate',
            'compute',
            'find',
            'determine',
            'figure out',
            'sudoku',
            'maze',
            'logic',
            'constraint',
            'satisfaction',
            'planning',
            'strategy',
            'efficiency',
            'minimize',
            'maximize',
        ];
        const structuredMatches = structuredKeywords.filter((keyword) => taskLower.includes(keyword)).length;
        signature.structuredReasoning = Math.min(structuredMatches / 3, 1);
        // Narrative reasoning indicators (LLM domain)
        const narrativeKeywords = [
            'explain',
            'describe',
            'story',
            'narrative',
            'creative',
            'imagine',
            'social',
            'interaction',
            'conversation',
            'dialogue',
            'interpret',
            'meaning',
            'context',
            'relationship',
            'emotion',
            'feeling',
            'opinion',
            'perspective',
            'analysis',
            'reflection',
        ];
        const narrativeMatches = narrativeKeywords.filter((keyword) => taskLower.includes(keyword)).length;
        signature.narrativeReasoning = Math.min(narrativeMatches / 3, 1);
        // Reactive response indicators (GOAP domain)
        const reactiveKeywords = [
            'attack',
            'defend',
            'escape',
            'flee',
            'survive',
            'eat',
            'drink',
            'heal',
            'block',
            'dodge',
            'evade',
            'protect',
            'guard',
            'alert',
            'danger',
            'threat',
            'emergency',
            'urgent',
            'immediate',
            'quick',
            'fast',
            'reflex',
            'reaction',
        ];
        const reactiveMatches = reactiveKeywords.filter((keyword) => taskLower.includes(keyword)).length;
        signature.reactiveResponse = Math.min(reactiveMatches / 3, 1);
        // Complexity assessment
        const wordCount = task.split(' ').length;
        signature.complexity = Math.min(wordCount / 20, 1);
        // Time and safety criticality
        signature.timeCritical =
            taskLower.includes('urgent') ||
                taskLower.includes('emergency') ||
                taskLower.includes('immediate') ||
                taskLower.includes('quick') ||
                taskLower.includes('fast');
        signature.safetyCritical =
            taskLower.includes('danger') ||
                taskLower.includes('threat') ||
                taskLower.includes('attack') ||
                taskLower.includes('survive') ||
                taskLower.includes('protect');
        return signature;
    }
    /**
     * Determine if task should use GOAP (reactive responses)
     */
    shouldUseGOAP(signature) {
        return (signature.reactiveResponse > 0.4 ||
            signature.timeCritical ||
            signature.safetyCritical ||
            this.isSimpleSignal(signature));
    }
    /**
     * Determine if task should use Python HRM (structured reasoning)
     */
    shouldUsePythonHRM(signature) {
        return (signature.structuredReasoning > 0.3 &&
            signature.complexity > 0.1 &&
            !signature.timeCritical &&
            this.pythonHRM.isAvailable());
    }
    /**
     * Determine if task should use LLM (language/narrative)
     */
    shouldUseLLM(signature) {
        return (signature.narrativeReasoning > 0.3 ||
            (signature.structuredReasoning < 0.2 && signature.complexity > 0.1) ||
            this.llm.isAvailable());
    }
    /**
     * Check if task is a simple signal that should go to GOAP
     */
    isSimpleSignal(signature) {
        const simpleSignals = [
            'threatProximity',
            'health',
            'hunger',
            'fatigue',
            'playerNearby',
            'isolationTime',
            'toolDeficit',
            'questBacklog',
            'lightLevel',
            'weather',
            'timeOfDay',
            'biome',
            'position',
        ];
        return simpleSignals.some(() => 
        /* signal */
        signature.reactiveResponse > 0.2 || signature.timeCritical);
    }
    /**
     * Execute task using GOAP (reactive responses)
     */
    async executeGOAP(task, context
    // budget: { maxTimeMs: number; maxComplexity: number }
    ) {
        const startTime = performance.now();
        try {
            const result = await this.goap.plan({
                goal: task,
                context: {
                    position: context.bot.entity?.position,
                    health: context.bot.health,
                    hunger: context.bot.food,
                    inventory: await context.inventory(),
                },
                urgency: this.determineUrgency(task),
            });
            return {
                primarySystem: 'goap',
                result: result.actions,
                confidence: result.confidence,
                reasoningTrace: [`GOAP planned ${result.actions.length} actions`],
                executionTime: performance.now() - startTime,
                fallbackUsed: false,
            };
        }
        catch (error) {
            console.error('❌ GOAP execution failed:', error);
            return {
                primarySystem: 'goap',
                result: null,
                confidence: 0,
                reasoningTrace: [`GOAP failed: ${error}`],
                executionTime: performance.now() - startTime,
                fallbackUsed: true,
            };
        }
    }
    /**
     * Execute task using Python HRM (structured reasoning)
     */
    async executePythonHRM(task, context, budget) {
        const startTime = performance.now();
        try {
            const result = await this.pythonHRM.infer({
                task,
                context: {
                    position: context.bot.entity?.position,
                    inventory: context.bot.inventory?.items?.() || [],
                    worldState: {
                        health: context.bot.health || 20,
                        food: context.bot.food || 20,
                        timeOfDay: context.bot.time?.timeOfDay || 6000,
                        lightLevel: 15, // Default
                    },
                },
                constraints: {
                    maxTime: budget.maxTimeMs,
                    maxComplexity: budget.maxComplexity,
                },
            });
            return {
                primarySystem: 'python-hrm',
                result: result.solution,
                confidence: result.confidence,
                reasoningTrace: [
                    `Python HRM completed in ${result.reasoningSteps} steps`,
                ],
                executionTime: performance.now() - startTime,
                fallbackUsed: false,
            };
        }
        catch (error) {
            console.error('❌ Python HRM execution failed:', error);
            return {
                primarySystem: 'python-hrm',
                result: null,
                confidence: 0,
                reasoningTrace: [`Python HRM failed: ${error}`],
                executionTime: performance.now() - startTime,
                fallbackUsed: true,
            };
        }
    }
    /**
     * Execute LLM reasoning
     */
    async executeLLM(task, context) {
        const startTime = performance.now();
        try {
            // Safely extract context information with fallbacks
            const safeContext = {
                position: context.bot?.entity?.position || { x: 0, y: 64, z: 0 },
                inventory: context.bot?.inventory?.items?.() || [],
                worldState: {
                    health: context.bot?.health || 20,
                    food: context.bot?.food || 20,
                    timeOfDay: context.bot?.time?.timeOfDay || 6000,
                    lightLevel: 15, // Default
                },
            };
            const result = await this.llm.generate({
                prompt: task,
                context: safeContext,
                systemMessage: 'You are a helpful AI assistant in a Minecraft world. Provide clear, actionable advice.',
            });
            return {
                primarySystem: 'llm',
                result: result.response,
                confidence: result.confidence,
                reasoningTrace: [`LLM generated response in ${result.executionTime}ms`],
                executionTime: performance.now() - startTime,
                fallbackUsed: false,
            };
        }
        catch (error) {
            console.error('❌ LLM execution failed:', error);
            return {
                primarySystem: 'llm',
                result: null,
                confidence: 0,
                reasoningTrace: [`LLM failed: ${error}`],
                executionTime: performance.now() - startTime,
                fallbackUsed: true,
            };
        }
    }
    /**
     * Determine urgency level for GOAP
     */
    determineUrgency(task) {
        const taskLower = task.toLowerCase();
        if (taskLower.includes('emergency') || taskLower.includes('attack')) {
            return 'emergency';
        }
        if (taskLower.includes('urgent') || taskLower.includes('danger')) {
            return 'high';
        }
        if (taskLower.includes('quick') || taskLower.includes('fast')) {
            return 'medium';
        }
        return 'low';
    }
    /**
     * Create Python HRM interface
     */
    createPythonHRMInterface() {
        return {
            async initialize() {
                try {
                    // First check if the server is running
                    const healthResponse = await fetch('http://localhost:5001/health');
                    if (!healthResponse.ok) {
                        console.warn('Python HRM health check failed:', healthResponse.statusText);
                        return false;
                    }
                    const health = (await healthResponse.json());
                    // If the model is initialized, consider it available even if hrm_available is false
                    if (health.model_initialized) {
                        console.log('✅ Python HRM model is initialized and available');
                        return true;
                    }
                    // Fallback: try a simple inference to test if it works
                    try {
                        const testResponse = await fetch('http://localhost:5001/infer', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                task: 'test',
                                context: {},
                            }),
                        });
                        if (testResponse.ok) {
                            console.log('✅ Python HRM inference test successful');
                            return true;
                        }
                    }
                    catch (inferenceError) {
                        console.warn('Python HRM inference test failed:', inferenceError);
                    }
                    return false;
                }
                catch (error) {
                    console.warn('Python HRM bridge not available:', error);
                    return false;
                }
            },
            async infer(input) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
                try {
                    const response = await fetch('http://localhost:5001/infer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error(`Python HRM inference failed: ${response.statusText}`);
                    }
                    return (await response.json());
                }
                catch (error) {
                    clearTimeout(timeoutId);
                    if (error instanceof Error && error.name === 'AbortError') {
                        throw new Error('Python HRM request timed out');
                    }
                    throw error;
                }
            },
            isAvailable() {
                // This would need to be implemented with proper health checking
                return true;
            },
        };
    }
    /**
     * Create LLM interface
     */
    createLLMInterface(config) {
        // Use real Ollama API based on benchmark results
        return {
            async generate(input) {
                const startTime = performance.now();
                const timeout = config?.timeout || 5000; // 5 second timeout
                let timeoutId;
                try {
                    // Create AbortController for timeout
                    const controller = new AbortController();
                    timeoutId = setTimeout(() => controller.abort(), timeout);
                    const response = await fetch('http://localhost:11434/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: config?.model || 'qwen3:0.6b', // Use fastest model
                            prompt: `Minecraft: ${input.prompt}. Give a brief action plan in 1 sentence.`,
                            stream: false,
                            options: {
                                temperature: config?.temperature || 0.3, // Lower temperature for more focused responses
                                top_p: 0.9,
                                max_tokens: config?.maxTokens || 50, // Much shorter responses
                            },
                        }),
                        signal: controller.signal,
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    const result = await response.json();
                    const executionTime = performance.now() - startTime;
                    return {
                        response: result.response,
                        confidence: 0.8, // Based on benchmark success rate
                        executionTime,
                    };
                }
                catch (error) {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    const executionTime = performance.now() - startTime;
                    if (error instanceof Error && error.name === 'AbortError') {
                        return {
                            response: 'LLM request timed out',
                            confidence: 0.0,
                            executionTime,
                            error: 'timeout',
                        };
                    }
                    return {
                        response: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        confidence: 0.0,
                        executionTime,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            },
            isAvailable() {
                // Check if Ollama is running
                return true; // We'll handle errors in generate()
            },
        };
    }
    /**
     * Create GOAP interface
     */
    createGOAPInterface() {
        // This would integrate with our existing GOAP system
        return {
            async plan(input) {
                // Placeholder - would integrate with actual GOAP
                return {
                    actions: [`GOAP action for: ${input.goal}`],
                    confidence: 0.9,
                    executionTime: 10,
                };
            },
            isAvailable() {
                return true;
            },
        };
    }
}
exports.HybridHRMRouter = HybridHRMRouter;
//# sourceMappingURL=hybrid-hrm-integration.js.map
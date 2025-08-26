"use strict";
/**
 * Arbiter - Central control system for the conscious bot
 *
 * Orchestrates signal processing, task routing, and module coordination
 * while enforcing real-time performance constraints and safety measures.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModuleType = exports.Arbiter = exports.ReflexModule = exports.DEFAULT_ARBITER_CONFIG = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const signal_processor_1 = require("./signal-processor");
const performance_monitor_1 = require("./performance-monitor");
const advanced_need_generator_1 = require("./advanced-need-generator");
const goal_template_manager_1 = require("./goal-template-manager");
const advanced_signal_processor_1 = require("./advanced-signal-processor");
const priority_ranker_1 = require("./priority-ranker");
const types_1 = require("./types");
Object.defineProperty(exports, "ModuleType", { enumerable: true, get: function () { return types_1.ModuleType; } });
/**
 * Default arbiter configuration
 */
exports.DEFAULT_ARBITER_CONFIG = {
    performanceBudgets: {
        emergency: 50,
        routine: 200,
        deliberative: 1000,
    },
    preemptionEnabled: true,
    safeModeEnabled: true,
    monitoringEnabled: true,
    debugMode: false,
};
/**
 * Simple reflex module for emergency responses
 */
class ReflexModule {
    constructor() {
        this.type = types_1.ModuleType.REFLEX;
        this.name = 'reflex';
    }
    getName() {
        return this.name;
    }
    getPriority() {
        return 1.0; // High priority for reflex responses
    }
    canHandle(task, signature) {
        if (signature?.timeConstraint) {
            return task.priority > 0.8 || signature.timeConstraint < 100;
        }
        return task.priority > 0.8;
    }
    async process(task) {
        // Simulate immediate response
        await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms processing
        return `reflex_response_${task.type}`;
    }
    estimateProcessingTime(task) {
        // TODO: Implement actual estimation logic
        console.log('TODO: IMPLEMENT... estimateProcessingTime', task);
        return 15; // Very fast reflex responses
    }
}
exports.ReflexModule = ReflexModule;
/**
 * Central arbiter that coordinates all cognitive modules and enforces
 * real-time constraints while maintaining system coherence.
 */
class Arbiter extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.registeredModules = new Map();
        this.currentTask = null;
        this.running = false;
        this.totalSignalsProcessed = 0;
        this.lastSignalTime = 0;
        this.config = { ...exports.DEFAULT_ARBITER_CONFIG, ...options.config };
        (0, types_1.validateArbiterConfig)(this.config);
        // Initialize subsystems
        this.signalProcessor = new signal_processor_1.SignalProcessor(options.signalConfig);
        this.performanceMonitor = new performance_monitor_1.PerformanceMonitor(options.performanceConfig);
        this.advancedNeedGenerator = new advanced_need_generator_1.AdvancedNeedGenerator();
        this.goalTemplateManager = new goal_template_manager_1.GoalTemplateManager();
        this.advancedSignalProcessor = new advanced_signal_processor_1.AdvancedSignalProcessor();
        this.priorityRanker = new priority_ranker_1.PriorityRanker();
        // Set up event forwarding
        this.setupEventForwarding();
        // Register default reflex module
        this.registerModule(new ReflexModule());
        if (this.config.debugMode) {
            console.log('Arbiter initialized with config:', this.config);
        }
    }
    /**
     * Register a cognitive module for task processing
     *
     * @param module - Cognitive module to register
     */
    registerModule(module) {
        this.registeredModules.set(module.type, module);
        if (this.config.debugMode) {
            console.log(`Registered module: ${module.name} (${module.type})`);
        }
    }
    /**
     * Process incoming signal through the control pipeline
     *
     * @param signal - Signal to process
     */
    async processSignal(signal) {
        try {
            const validatedSignal = (0, types_1.validateSignal)(signal);
            // Process with basic signal processor
            this.signalProcessor.processSignal(validatedSignal);
            // Process with advanced signal processor
            const advancedSignal = {
                id: (0, uuid_1.v4)(),
                type: validatedSignal.type,
                source: 'internal',
                priority: validatedSignal.intensity,
                urgency: validatedSignal.intensity,
                confidence: 0.8,
                timestamp: validatedSignal.timestamp,
                data: {
                    content: validatedSignal.type,
                    intensity: validatedSignal.intensity,
                    direction: 'incoming',
                    duration: 0,
                    frequency: 1,
                    amplitude: validatedSignal.intensity,
                },
                metadata: {
                    location: 'unknown',
                    environment: 'unknown',
                    socialContext: 'unknown',
                    emotionalValence: 0,
                    novelty: 0.5,
                    relevance: 0.8,
                    reliability: 0.8,
                    tags: [],
                },
                processed: false,
                fused: false,
            };
            const processedSignals = await this.advancedSignalProcessor.processSignals([advancedSignal]);
            // Generate enhanced needs from processed signals
            if (processedSignals.processedSignals.length > 0) {
                // Convert signal processor needs to advanced need generator format
                const baseNeeds = this.signalProcessor
                    .getCurrentNeeds()
                    .map((need) => ({
                    id: (0, uuid_1.v4)(),
                    type: need.type, // NeedType enum
                    intensity: need.urgency,
                    urgency: need.urgency,
                    trend: 'stable', // TrendDirection enum
                    trendStrength: 0.5,
                    context: this.getCurrentContext(),
                    memoryInfluence: 0.5,
                    noveltyScore: 0.5,
                    commitmentBoost: 0.5,
                    timestamp: need.lastUpdated,
                    history: [],
                }));
                const enhancedNeeds = await this.advancedNeedGenerator.generateEnhancedNeeds(baseNeeds, this.getCurrentContext(), processedSignals.processedSignals.map((s) => ({
                    type: 'experience',
                    content: s.data.content,
                    relevance: s.metadata.relevance,
                    emotionalValence: s.metadata.emotionalValence,
                    urgency: s.urgency,
                    timestamp: s.timestamp,
                    decayRate: 0.95,
                })));
                // TODO: Enhanced needs generated - could be used for further processing
                // Note: Signal processor needs are managed internally
                console.log('TODO: IMPLEMENT... enhancedNeeds', enhancedNeeds);
            }
            // Track signal statistics
            this.totalSignalsProcessed++;
            this.lastSignalTime = Date.now();
            if (this.config.debugMode) {
                console.log('Signal processed:', validatedSignal.type, validatedSignal.intensity);
            }
        }
        catch (error) {
            console.error('Signal validation failed:', error);
        }
    }
    /**
     * Process cognitive task through the routing pipeline
     *
     * @param task - Task to process
     * @returns Promise resolving to task result
     */
    async processCognitiveTask(task) {
        try {
            const validatedTask = (0, types_1.validateCognitiveTask)(task);
            // Check for preemption
            if (this.config.preemptionEnabled && this.currentTask) {
                const preemptionDecision = this.evaluatePreemption(this.currentTask, validatedTask);
                if (preemptionDecision.shouldPreempt) {
                    await this.executePreemption(preemptionDecision);
                }
            }
            // Route task to appropriate module
            const routingDecision = this.routeTask(validatedTask);
            this.emit('task-routed', {
                task: validatedTask,
                decision: routingDecision,
            });
            // Process with selected module
            const result = await this.executeTask(validatedTask, routingDecision);
            return result;
        }
        catch (error) {
            console.error('Task processing failed:', error);
            throw error;
        }
    }
    /**
     * Route cognitive task to appropriate processing module
     *
     * @param task - Task to route
     * @returns Routing decision with selected module
     */
    routeTask(task) {
        const signature = this.analyzeTaskSignature(task);
        const candidates = [];
        // Evaluate each registered module
        for (const [moduleType, module] of this.registeredModules) {
            if (module.canHandle(task, signature)) {
                const score = this.calculateModuleScore(module, task, signature);
                candidates.push({
                    module: moduleType,
                    score,
                    reason: this.getRoutingReason(module, task, signature),
                });
            }
        }
        // Sort by score and select best
        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length === 0) {
            // Fallback to reflex module
            return {
                selectedModule: types_1.ModuleType.REFLEX,
                confidence: 0.5,
                reasoning: 'Fallback to reflex - no suitable modules found',
                alternatives: [],
                timestamp: Date.now(),
            };
        }
        const selected = candidates[0];
        const alternatives = candidates.slice(1);
        return {
            selectedModule: selected.module,
            confidence: Math.min(selected.score, 1.0),
            reasoning: selected.reason,
            alternatives,
            timestamp: Date.now(),
        };
    }
    /**
     * Analyze task characteristics for routing decisions
     *
     * @param task - Task to analyze
     * @returns Task signature for routing logic
     */
    analyzeTaskSignature(task) {
        // Simple heuristics - would be much more sophisticated in practice
        const hasSymbolic = task.type === 'planning' || task.type === 'reasoning';
        const isSocial = task.type === 'social' || task.metadata?.involves_communication;
        const isAmbiguous = task.complexity === 'complex' && !hasSymbolic;
        const needsPlanning = task.type === 'planning' || task.complexity === 'complex';
        // Determine time constraint based on priority and deadline
        let timeConstraint = this.config.performanceBudgets.routine;
        if (task.priority > 0.8) {
            timeConstraint = this.config.performanceBudgets.emergency;
        }
        else if (task.complexity === 'complex') {
            timeConstraint = this.config.performanceBudgets.deliberative;
        }
        return {
            symbolicPreconditions: hasSymbolic ? 0.8 : 0.2,
            socialContent: isSocial,
            ambiguousContext: isAmbiguous,
            requiresPlanning: needsPlanning,
            timeConstraint,
            riskLevel: task.priority > 0.7 ? 'high' : task.priority > 0.4 ? 'medium' : 'low',
        };
    }
    /**
     * Calculate score for module handling task
     */
    calculateModuleScore(module, task, signature) {
        let score = 0.5; // Base score
        // Module-specific scoring logic
        switch (module.type) {
            case types_1.ModuleType.REFLEX:
                score += task.priority * 0.5; // Higher score for urgent tasks
                score += signature.timeConstraint < 100 ? 0.4 : 0;
                break;
            case types_1.ModuleType.HRM:
                score += signature.symbolicPreconditions * 0.4;
                score += signature.requiresPlanning ? 0.3 : 0;
                score -= signature.socialContent ? 0.2 : 0; // HRM not great at social
                break;
            case types_1.ModuleType.LLM:
                score += signature.socialContent ? 0.4 : 0;
                score += signature.ambiguousContext ? 0.3 : 0;
                score -= signature.timeConstraint < 200 ? 0.3 : 0; // LLM is slower
                break;
            case types_1.ModuleType.GOAP:
                score += signature.requiresPlanning ? 0.3 : 0;
                score += task.priority > 0.5 ? 0.2 : 0;
                break;
        }
        // Adjust for estimated processing time vs available budget
        const estimatedTime = module.estimateProcessingTime(task);
        if (estimatedTime <= signature.timeConstraint) {
            score += 0.2;
        }
        else {
            score -= 0.3; // Penalize if likely to exceed budget
        }
        return Math.max(0, Math.min(1, score));
    }
    /**
     * Get human-readable routing reason
     */
    getRoutingReason(module, task, signature) {
        const reasons = [];
        if (signature.timeConstraint < 100) {
            reasons.push('urgent timing constraint');
        }
        if (signature.symbolicPreconditions > 0.7) {
            reasons.push('symbolic reasoning required');
        }
        if (signature.socialContent) {
            reasons.push('social interaction needed');
        }
        if (task.priority > 0.8) {
            reasons.push('high priority task');
        }
        const reasonText = reasons.length > 0 ? reasons.join(', ') : 'general suitability';
        return `${module.name} selected due to: ${reasonText}`;
    }
    /**
     * Execute task with selected module and performance monitoring
     */
    async executeTask(task, routing) {
        const module = this.registeredModules.get(routing.selectedModule);
        if (!module) {
            throw new Error(`Module not found: ${routing.selectedModule}`);
        }
        // Determine performance context
        const context = task.priority > 0.8
            ? 'emergency'
            : task.complexity === 'complex'
                ? 'deliberative'
                : 'routine';
        // Start performance tracking
        const session = this.performanceMonitor.startTracking(task, context);
        this.currentTask = task;
        try {
            session.checkpoint('execution_start');
            // Execute with budget
            const result = await module.process(task, session.budget.remaining);
            session.checkpoint('execution_complete');
            // Record successful completion
            this.performanceMonitor.recordCompletion(session, true);
            if (this.config.debugMode) {
                console.log(`Task completed by ${module.name}: ${session.getElapsed()}ms`);
            }
            return result;
        }
        catch (error) {
            session.checkpoint('execution_error');
            this.performanceMonitor.recordCompletion(session, false);
            console.error(`Task execution failed in ${module.name}:`, error);
            throw error;
        }
        finally {
            this.currentTask = null;
        }
    }
    /**
     * Evaluate if incoming task should preempt current processing
     */
    evaluatePreemption(currentTask, incomingTask) {
        // Simple priority-based preemption
        const shouldPreempt = incomingTask.priority > currentTask.priority + 0.2; // Threshold for preemption
        // Determine preemption priority level
        let priority = types_1.PreemptionPriority.IDLE_PROCESSING;
        if (incomingTask.priority > 0.9) {
            priority = types_1.PreemptionPriority.EMERGENCY_REFLEX;
        }
        else if (incomingTask.priority > 0.7) {
            priority = types_1.PreemptionPriority.SAFETY_INTERRUPT;
        }
        else if (incomingTask.priority > 0.5) {
            priority = types_1.PreemptionPriority.GOAL_COMPLETION;
        }
        return {
            shouldPreempt,
            priority,
            currentTask,
            incomingTask,
            preservationRequired: shouldPreempt && currentTask.priority > 0.3, // Preserve if somewhat important
            reasoning: shouldPreempt
                ? `Higher priority task (${incomingTask.priority} > ${currentTask.priority})`
                : 'Priority insufficient for preemption',
            estimatedCost: shouldPreempt ? 20 : 0, // 20ms estimated preemption cost
        };
    }
    /**
     * Execute task preemption with state preservation
     */
    async executePreemption(decision) {
        if (!this.currentTask)
            return;
        console.log(`Preempting task: ${decision.reasoning}`);
        // Attempt to preempt current module
        const currentModule = this.registeredModules.get(types_1.ModuleType.REFLEX); // Simplified
        if (currentModule?.preempt) {
            await currentModule.preempt();
        }
        // Emit preemption event
        this.emit('preemption-triggered', decision);
        // Reset current task
        this.currentTask = null;
    }
    /**
     * Start the main control loop
     */
    start() {
        if (this.running) {
            console.warn('Arbiter already running');
            return;
        }
        this.running = true;
        // Start processing loop with advanced needs assessment
        this.processLoopInterval = setInterval(async () => {
            await this.processControlLoop();
        }, 100); // 10 Hz control loop
        console.log('Arbiter started with advanced components');
    }
    /**
     * Main control loop iteration
     */
    async processControlLoop() {
        if (!this.running)
            return;
        try {
            // Check for high-priority needs that require immediate action
            const currentNeeds = this.signalProcessor.getCurrentNeeds();
            // TODO: const urgentNeeds = currentNeeds.filter((need) => need.urgency > 0.7);
            // Convert current needs to advanced need generator format
            const baseNeeds = currentNeeds.map((need) => ({
                id: (0, uuid_1.v4)(),
                type: need.type, // NeedType enum
                intensity: need.urgency,
                urgency: need.urgency,
                trend: 'stable', // TrendDirection enum
                trendStrength: 0.5,
                context: this.getCurrentContext(),
                memoryInfluence: 0.5,
                noveltyScore: 0.5,
                commitmentBoost: 0.5,
                timestamp: need.lastUpdated,
                history: [],
            }));
            // Generate enhanced needs with context awareness
            const enhancedNeeds = await this.advancedNeedGenerator.generateEnhancedNeeds(baseNeeds, this.getCurrentContext(), []);
            // Create priority tasks from enhanced needs
            const priorityTasks = enhancedNeeds.map((need) => ({
                id: (0, uuid_1.v4)(),
                name: `${need.type}_need`,
                description: `Address ${need.type} need with priority ${need.priorityScore}`,
                type: this.mapNeedTypeToTaskType(need.type),
                basePriority: need.priorityScore,
                urgency: need.urgency,
                importance: need.intensity,
                complexity: need.intensity,
                estimatedDuration: 30, // Default 30 minutes
                dependencies: [],
                resources: [],
                context: this.getCurrentContext(),
                metadata: {
                    category: 'need_satisfaction',
                    tags: [need.type, 'urgent'],
                    difficulty: need.intensity,
                    skillRequirements: [],
                    emotionalImpact: 0.5,
                    satisfaction: 0.8,
                    novelty: need.noveltyScore,
                    socialValue: need.socialImpact,
                },
                createdAt: Date.now(),
                lastUpdated: Date.now(),
            }));
            // Rank tasks by priority
            const ranking = await this.priorityRanker.rankTasks(priorityTasks, this.getCurrentContext());
            // Process top priority tasks
            const topTasks = ranking.tasks.slice(0, 3); // Process top 3 tasks
            for (const prioritizedTask of topTasks) {
                const task = {
                    id: prioritizedTask.id,
                    type: this.mapTaskTypeToCognitiveType(prioritizedTask.type),
                    priority: prioritizedTask.calculatedPriority,
                    complexity: prioritizedTask.complexity > 0.5 ? 'complex' : 'simple',
                    context: {
                        needType: prioritizedTask.name,
                        needScore: prioritizedTask.calculatedPriority,
                        rankingReason: prioritizedTask.rankingReason,
                    },
                };
                // Process task asynchronously
                this.processCognitiveTask(task).catch((error) => {
                    console.error('Failed to process priority task:', error);
                });
            }
            // Check system health
            if (this.config.safeModeEnabled) {
                const degradation = this.performanceMonitor.getDegradationLevel();
                if (degradation > types_1.DegradationLevel.MODERATE) {
                    console.warn(`System degraded to level ${degradation}`);
                }
            }
        }
        catch (error) {
            console.error('Control loop error:', error);
        }
    }
    /**
     * Stop the arbiter and cleanup resources
     */
    stop() {
        if (!this.running) {
            console.warn('Arbiter not running');
            return;
        }
        this.running = false;
        // Clear timers
        if (this.processLoopInterval) {
            clearInterval(this.processLoopInterval);
            this.processLoopInterval = undefined;
        }
        // Stop subsystems
        this.signalProcessor.stop();
        this.performanceMonitor.stop();
        // Clear listeners
        this.removeAllListeners();
        console.log('Arbiter stopped');
    }
    /**
     * Set up event forwarding from subsystems
     */
    setupEventForwarding() {
        // Forward signal processor events
        this.signalProcessor.on('signal-received', (signal) => {
            this.emit('signal-received', signal);
        });
        this.signalProcessor.on('needs-updated', (needs) => {
            this.emit('needs-updated', needs);
        });
        // Forward performance monitor events
        this.performanceMonitor.on('safety-violation', (violation) => {
            this.emit('safety-violation', violation);
        });
        this.performanceMonitor.on('degradation-changed', (level) => {
            this.emit('degradation-changed', level);
        });
        this.performanceMonitor.on('performance-update', (metrics) => {
            this.emit('performance-update', metrics);
        });
    }
    /**
     * Get current system status
     */
    getStatus() {
        return {
            running: this.running,
            currentTask: this.currentTask,
            degradationLevel: this.performanceMonitor.getDegradationLevel(),
            registeredModules: Array.from(this.registeredModules.keys()),
            performance: this.performanceMonitor.getCurrentMetrics(),
            lastSignalTime: this.lastSignalTime,
            totalSignalsProcessed: this.totalSignalsProcessed,
        };
    }
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const currentMetrics = this.performanceMonitor.getCurrentMetrics();
        return {
            lastCycleTime: Date.now() - this.lastSignalTime,
            averageResponseTime: currentMetrics.latency.mean,
            taskThroughput: currentMetrics.throughput.operationsPerSecond,
            memoryUsage: currentMetrics.resources.memoryUsage,
        };
    }
    /**
     * Update arbiter configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        (0, types_1.validateArbiterConfig)(this.config);
    }
    /**
     * Get signal processor for direct access
     */
    getSignalProcessor() {
        return this.signalProcessor;
    }
    /**
     * Get performance monitor for direct access
     */
    getPerformanceMonitor() {
        return this.performanceMonitor;
    }
    /**
     * Get current context for advanced components
     */
    getCurrentContext() {
        return {
            timeOfDay: 'morning', // TimeOfDay enum
            location: 'village', // LocationType enum
            socialContext: 'alone', // SocialContext enum
            environmentalFactors: [],
            recentEvents: [],
            currentGoals: [],
            availableResources: ['basic_tools', 'food'],
            environment: 'village',
            constraints: [],
            opportunities: [],
            energyLevel: 0.8,
            stressLevel: 0.2,
        };
    }
    /**
     * Map need type to task type
     */
    mapNeedTypeToTaskType(needType) {
        const mapping = {
            safety: 'survival',
            nutrition: 'survival',
            social: 'social',
            exploration: 'exploration',
            building: 'building',
            crafting: 'crafting',
            combat: 'combat',
            learning: 'learning',
            achievement: 'achievement',
            maintenance: 'maintenance',
            emergency: 'emergency',
            creative: 'creative',
            administrative: 'administrative',
        };
        return mapping[needType] || 'administrative';
    }
    /**
     * Map task type to cognitive type
     */
    mapTaskTypeToCognitiveType(taskType) {
        const mapping = {
            survival: 'reactive',
            social: 'social',
            exploration: 'planning',
            building: 'planning',
            crafting: 'planning',
            combat: 'reactive',
            learning: 'reasoning',
            achievement: 'planning',
            maintenance: 'planning',
            emergency: 'reactive',
            creative: 'reasoning',
            administrative: 'planning',
        };
        return mapping[taskType] || 'planning';
    }
    /**
     * Get advanced components for direct access
     */
    getAdvancedNeedGenerator() {
        return this.advancedNeedGenerator;
    }
    getGoalTemplateManager() {
        return this.goalTemplateManager;
    }
    getAdvancedSignalProcessor() {
        return this.advancedSignalProcessor;
    }
    getPriorityRanker() {
        return this.priorityRanker;
    }
}
exports.Arbiter = Arbiter;
//# sourceMappingURL=arbiter.js.map
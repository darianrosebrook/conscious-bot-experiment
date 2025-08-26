/**
 * Arbiter - Central control system for the conscious bot
 *
 * Orchestrates signal processing, task routing, and module coordination
 * while enforcing real-time performance constraints and safety measures.
 *
 * @author @darianrosebrook
 */
import { EventEmitter } from 'events';
import { SignalProcessor, DEFAULT_SIGNAL_CONFIG } from './signal-processor';
import { PerformanceMonitor, DEFAULT_PERFORMANCE_CONFIG } from './performance-monitor';
import { AdvancedNeedGenerator } from './advanced-need-generator';
import { GoalTemplateManager } from './goal-template-manager';
import { AdvancedSignalProcessor } from './advanced-signal-processor';
import { PriorityRanker } from './priority-ranker';
import { Signal, CognitiveTask, TaskSignature, ModuleType, ArbiterConfig, DegradationLevel, SystemEvents } from './types';
export interface ArbiterOptions {
    config?: Partial<ArbiterConfig>;
    signalConfig?: typeof DEFAULT_SIGNAL_CONFIG;
    performanceConfig?: typeof DEFAULT_PERFORMANCE_CONFIG;
    debugMode?: boolean;
}
/**
 * Default arbiter configuration
 */
export declare const DEFAULT_ARBITER_CONFIG: ArbiterConfig;
/**
 * Cognitive module interface that all processing modules must implement
 */
export interface CognitiveModule {
    readonly type: ModuleType;
    readonly name: string;
    /**
     * Check if this module can handle the given task
     */
    canHandle(task: CognitiveTask, signature: TaskSignature): boolean;
    /**
     * Process the cognitive task
     */
    process(task: CognitiveTask, budget: number): Promise<any>;
    /**
     * Get estimated processing time for task
     */
    estimateProcessingTime(task: CognitiveTask): number;
    /**
     * Handle preemption request
     */
    preempt?(): Promise<void>;
}
/**
 * Simple reflex module for emergency responses
 */
export declare class ReflexModule implements CognitiveModule {
    readonly type = ModuleType.REFLEX;
    readonly name = "reflex";
    getName(): string;
    getPriority(): number;
    canHandle(task: CognitiveTask, signature?: TaskSignature): boolean;
    process(task: CognitiveTask): Promise<string>;
    estimateProcessingTime(task: CognitiveTask): number;
}
/**
 * Central arbiter that coordinates all cognitive modules and enforces
 * real-time constraints while maintaining system coherence.
 */
export declare class Arbiter extends EventEmitter<SystemEvents> {
    private config;
    private signalProcessor;
    private performanceMonitor;
    private advancedNeedGenerator;
    private goalTemplateManager;
    private advancedSignalProcessor;
    private priorityRanker;
    private registeredModules;
    private currentTask;
    private running;
    private processLoopInterval?;
    private totalSignalsProcessed;
    private lastSignalTime;
    constructor(options?: ArbiterOptions);
    /**
     * Register a cognitive module for task processing
     *
     * @param module - Cognitive module to register
     */
    registerModule(module: CognitiveModule): void;
    /**
     * Process incoming signal through the control pipeline
     *
     * @param signal - Signal to process
     */
    processSignal(signal: Signal): Promise<void>;
    /**
     * Process cognitive task through the routing pipeline
     *
     * @param task - Task to process
     * @returns Promise resolving to task result
     */
    processCognitiveTask(task: CognitiveTask): Promise<any>;
    /**
     * Route cognitive task to appropriate processing module
     *
     * @param task - Task to route
     * @returns Routing decision with selected module
     */
    private routeTask;
    /**
     * Analyze task characteristics for routing decisions
     *
     * @param task - Task to analyze
     * @returns Task signature for routing logic
     */
    private analyzeTaskSignature;
    /**
     * Calculate score for module handling task
     */
    private calculateModuleScore;
    /**
     * Get human-readable routing reason
     */
    private getRoutingReason;
    /**
     * Execute task with selected module and performance monitoring
     */
    private executeTask;
    /**
     * Evaluate if incoming task should preempt current processing
     */
    private evaluatePreemption;
    /**
     * Execute task preemption with state preservation
     */
    private executePreemption;
    /**
     * Start the main control loop
     */
    start(): void;
    /**
     * Main control loop iteration
     */
    private processControlLoop;
    /**
     * Stop the arbiter and cleanup resources
     */
    stop(): void;
    /**
     * Set up event forwarding from subsystems
     */
    private setupEventForwarding;
    /**
     * Get current system status
     */
    getStatus(): {
        running: boolean;
        currentTask: CognitiveTask | null;
        degradationLevel: DegradationLevel;
        registeredModules: ModuleType[];
        performance: any;
        lastSignalTime: number;
        totalSignalsProcessed: number;
    };
    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): {
        lastCycleTime: number;
        averageResponseTime: number;
        taskThroughput: number;
        memoryUsage: number;
    };
    /**
     * Update arbiter configuration
     */
    updateConfig(newConfig: Partial<ArbiterConfig>): void;
    /**
     * Get signal processor for direct access
     */
    getSignalProcessor(): SignalProcessor;
    /**
     * Get performance monitor for direct access
     */
    getPerformanceMonitor(): PerformanceMonitor;
    /**
     * Get current context for advanced components
     */
    private getCurrentContext;
    /**
     * Map need type to task type
     */
    private mapNeedTypeToTaskType;
    /**
     * Map task type to cognitive type
     */
    private mapTaskTypeToCognitiveType;
    /**
     * Get advanced components for direct access
     */
    getAdvancedNeedGenerator(): AdvancedNeedGenerator;
    getGoalTemplateManager(): GoalTemplateManager;
    getAdvancedSignalProcessor(): AdvancedSignalProcessor;
    getPriorityRanker(): PriorityRanker;
}
export type { CognitiveTask, TaskSignature };
export { ModuleType };
//# sourceMappingURL=arbiter.d.ts.map
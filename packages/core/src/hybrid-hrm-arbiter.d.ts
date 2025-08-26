#!/usr/bin/env tsx
/**
 * Hybrid HRM Arbiter - Enhanced Arbiter with HRM Integration
 *
 * Implements the full signal→need→goal→plan→action pipeline with hybrid HRM reasoning.
 * Integrates Python HRM, LLM HRM, and GOAP into the main Arbiter architecture.
 * Includes optimizations: signal batching, caching, parallel processing, and smart routing.
 *
 * @author @darianrosebrook
 */
import { Arbiter } from './arbiter';
import { LeafContext } from './mcp-capabilities/leaf-contracts';
export interface HRMSignal {
    id: string;
    name: string;
    value: number;
    trend: number;
    confidence: number;
    ttlMs?: number;
    provenance: 'body' | 'env' | 'social' | 'intrusion' | 'memory';
    timestamp: number;
}
export interface NeedScore {
    name: 'Safety' | 'Nutrition' | 'Progress' | 'Social' | 'Curiosity' | 'Integrity';
    score: number;
    dScore: number;
    urgency: number;
    contextGates: {
        timeOfDay: number;
        location: number;
        social: number;
        environmental: number;
    };
}
export interface HRMGoalTemplate {
    name: string;
    needType: NeedScore['name'];
    preconditions: (context: LeafContext) => boolean | Promise<boolean>;
    feasibility: (context: LeafContext) => {
        ok: boolean;
        deficits?: string[];
    };
    utility: (need: NeedScore, context: LeafContext) => number;
    planSketch?: (context: LeafContext) => any;
    cooldownMs?: number;
    complexity: number;
    timeCritical: boolean;
    safetyCritical: boolean;
}
export interface HRMGoalCandidate {
    id: string;
    template: HRMGoalTemplate;
    priority: number;
    feasibility: {
        ok: boolean;
        deficits?: string[];
    };
    plan?: any;
    reasoningTrace: string[];
    createdAt: number;
    estimatedProcessingTime: number;
    executionResult?: {
        success: boolean;
        error?: string;
        actions?: string[];
    };
}
export interface CachedResult {
    task: string;
    system: string;
    result: any;
    timestamp: number;
    ttl: number;
}
export interface SignalBatch {
    signals: HRMSignal[];
    batchIndex: number;
    skipLLM: boolean;
}
export interface OptimizationStats {
    batchesCreated: number;
    cacheHits: number;
    llmSkips: number;
    parallelProcessing: boolean;
    totalTimeSaved: number;
}
export interface HRMPerformanceBudgets {
    emergency: {
        totalBudget: 50;
        signalProcessing: 10;
        needGeneration: 5;
        goalEnumeration: 10;
        priorityRanking: 5;
        hrmPlanning: 15;
        execution: 5;
    };
    routine: {
        totalBudget: 200;
        signalProcessing: 30;
        needGeneration: 20;
        goalEnumeration: 30;
        priorityRanking: 10;
        hrmPlanning: 80;
        execution: 30;
    };
    deliberative: {
        totalBudget: 1000;
        signalProcessing: 50;
        needGeneration: 30;
        goalEnumeration: 50;
        priorityRanking: 20;
        hrmPlanning: 600;
        execution: 250;
    };
}
/**
 * Enhanced Arbiter with HRM Integration
 *
 * Implements the full signal→need→goal→plan→action pipeline with hybrid HRM reasoning.
 * Includes four key optimizations:
 * 1. Signal batching - Process multiple signals together
 * 2. Caching - Avoid re-processing similar goals
 * 3. Parallel processing - Run goal planning in parallel
 * 4. Smart routing - Skip LLM calls for simple signals
 */
export declare class HybridHRMArbiter extends Arbiter {
    private hybridHRM;
    private performanceBudgets;
    private signalHistory;
    private needHistory;
    private goalTemplates;
    private currentContext;
    private leafFactory;
    private cache;
    private cacheTTL;
    private optimizationStats;
    constructor(hybridHRMConfig: any, performanceBudgets?: Partial<HRMPerformanceBudgets>);
    /**
     * OPTIMIZATION 1: Signal Batching
     * Group similar signals together to reduce redundant processing
     */
    private batchSignals;
    /**
     * OPTIMIZATION 2: Caching
     * Cache results to avoid re-processing similar goals
     */
    private getCachedResult;
    private setCachedResult;
    /**
     * OPTIMIZATION 3: Smart Routing
     * Skip LLM calls for simple signals that can be handled by GOAP
     */
    private shouldSkipLLM;
    /**
     * OPTIMIZATION 4: Parallel Processing
     * Process goal candidates in parallel where possible
     */
    private processGoalsParallel;
    /**
     * Initialize the hybrid HRM system
     */
    initialize(): Promise<boolean>;
    /**
     * Process signals through the full HRM pipeline (now uses optimizations by default)
     */
    processHRMSignal(signal: HRMSignal, context: LeafContext): Promise<HRMGoalCandidate[]>;
    /**
     * Process multiple signals with optimizations (public API)
     */
    processMultipleSignals(signals: HRMSignal[], context: LeafContext): Promise<HRMGoalCandidate[]>;
    /**
     * Process multiple signals with optimizations
     */
    processHRMSignalOptimized(signals: HRMSignal[], context: LeafContext): Promise<HRMGoalCandidate[]>;
    /**
     * Log optimization statistics
     */
    private logOptimizationStats;
    /**
     * Get optimization statistics
     */
    getOptimizationStats(): OptimizationStats;
    /**
     * Clear optimization statistics
     */
    clearOptimizationStats(): void;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Execute goals using the leaf system and action translator
     */
    private executeGoals;
    /**
     * Execute a plan using the leaf system
     */
    private executePlanWithLeaves;
    /**
     * Execute a single plan step using the leaf system
     */
    private executePlanStep;
    /**
     * Map action names to leaf operations
     */
    private mapActionToLeaf;
    /**
     * Execute a leaf operation using the leaf factory
     */
    private executeLeaf;
    /**
     * Compute needs from signals with context gates
     */
    private computeNeeds;
    /**
     * Compute safety need with context gates
     */
    private computeSafetyNeed;
    /**
     * Compute nutrition need
     */
    private computeNutritionNeed;
    /**
     * Compute progress need
     */
    private computeProgressNeed;
    /**
     * Compute social need
     */
    private computeSocialNeed;
    /**
     * Compute curiosity need
     */
    private computeCuriosityNeed;
    /**
     * Compute integrity need
     */
    private computeIntegrityNeed;
    /**
     * Enumerate goals from needs
     */
    private enumerateGoals;
    /**
     * Rank goals by priority and feasibility
     */
    private rankGoals;
    /**
     * Clean up expired signals
     */
    private cleanupExpiredSignals;
    /**
     * Plan with HRM for top candidates (now uses parallel processing)
     */
    private planWithHRM;
    /**
     * Initialize goal templates
     */
    private initializeGoalTemplates;
}
//# sourceMappingURL=hybrid-hrm-arbiter.d.ts.map
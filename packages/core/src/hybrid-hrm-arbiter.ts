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

import { v4 as uuidv4 } from 'uuid';

import {
  Arbiter,
  CognitiveModule,
  ModuleType,
  CognitiveTask,
  TaskSignature,
} from './arbiter';
import { HybridHRMRouter } from './mcp-capabilities/hybrid-hrm-integration';
import { LeafContext } from './mcp-capabilities/leaf-contracts';
import { LeafFactory } from './mcp-capabilities/leaf-factory';

// Enhanced signal types for HRM integration
export interface HRMSignal {
  id: string;
  name: string;
  value: number; // 0-1 (higher = more urgent unless inverted)
  trend: number; // d/dt over recent window
  confidence: number; // 0-1
  ttlMs?: number; // decay horizon
  provenance: 'body' | 'env' | 'social' | 'intrusion' | 'memory';
  timestamp: number;
}

// Need computation from signals
export interface NeedScore {
  name:
    | 'Safety'
    | 'Nutrition'
    | 'Progress'
    | 'Social'
    | 'Curiosity'
    | 'Integrity';
  score: number; // 0-1
  dScore: number; // rate of change
  urgency: number; // 0-1
  contextGates: {
    timeOfDay: number; // 0-1 boost factor
    location: number; // 0-1 boost factor
    social: number; // 0-1 boost factor
    environmental: number; // 0-1 boost factor
  };
}

// Goal template with HRM integration
export interface HRMGoalTemplate {
  name: string;
  needType: NeedScore['name'];
  preconditions: (context: LeafContext) => boolean | Promise<boolean>;
  feasibility: (context: LeafContext) => { ok: boolean; deficits?: string[] };
  utility: (need: NeedScore, context: LeafContext) => number;
  planSketch?: (context: LeafContext) => any; // bias for HRM
  cooldownMs?: number;
  complexity: number; // 0-1
  timeCritical: boolean;
  safetyCritical: boolean;
}

// Enhanced goal candidate with HRM planning
export interface HRMGoalCandidate {
  id: string;
  template: HRMGoalTemplate;
  priority: number;
  feasibility: { ok: boolean; deficits?: string[] };
  plan?: any; // HRM-generated plan
  reasoningTrace: string[];
  createdAt: number;
  estimatedProcessingTime: number;
  executionResult?: { success: boolean; error?: string; actions?: string[] };
}

// Optimization interfaces
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

// Performance budgets for HRM integration
export interface HRMPerformanceBudgets {
  emergency: {
    totalBudget: 50; // ms p95
    signalProcessing: 10; // ms
    needGeneration: 5; // ms
    goalEnumeration: 10; // ms
    priorityRanking: 5; // ms
    hrmPlanning: 15; // ms
    execution: 5; // ms
  };

  routine: {
    totalBudget: 200; // ms p95
    signalProcessing: 30; // ms
    needGeneration: 20; // ms
    goalEnumeration: 30; // ms
    priorityRanking: 10; // ms
    hrmPlanning: 80; // ms
    execution: 30; // ms
  };

  deliberative: {
    totalBudget: 1000; // ms p95
    signalProcessing: 50; // ms
    needGeneration: 30; // ms
    goalEnumeration: 50; // ms
    priorityRanking: 20; // ms
    hrmPlanning: 600; // ms
    execution: 250; // ms
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
export class HybridHRMArbiter extends Arbiter {
  private hybridHRM: HybridHRMRouter;
  private performanceBudgets: HRMPerformanceBudgets;
  private signalHistory: HRMSignal[] = [];
  private needHistory: NeedScore[] = [];
  private goalTemplates: HRMGoalTemplate[] = [];
  private currentContext: LeafContext | null = null;
  private leafFactory: LeafFactory; // Leaf factory for executing leaves

  // Optimization properties
  private cache = new Map<string, CachedResult>();
  private cacheTTL = 30000; // 30 seconds
  private optimizationStats: OptimizationStats = {
    batchesCreated: 0,
    cacheHits: 0,
    llmSkips: 0,
    parallelProcessing: true,
    totalTimeSaved: 0,
  };

  constructor(
    hybridHRMConfig: any,
    performanceBudgets?: Partial<HRMPerformanceBudgets>
  ) {
    super();

    // Initialize hybrid HRM system
    this.hybridHRM = new HybridHRMRouter(hybridHRMConfig);

    // Set performance budgets
    this.performanceBudgets = {
      emergency: {
        totalBudget: 50,
        signalProcessing: 10,
        needGeneration: 5,
        goalEnumeration: 10,
        priorityRanking: 5,
        hrmPlanning: 15,
        execution: 5,
      },
      routine: {
        totalBudget: 200,
        signalProcessing: 30,
        needGeneration: 20,
        goalEnumeration: 30,
        priorityRanking: 10,
        hrmPlanning: 80,
        execution: 30,
      },
      deliberative: {
        totalBudget: 1000,
        signalProcessing: 50,
        needGeneration: 30,
        goalEnumeration: 50,
        priorityRanking: 20,
        hrmPlanning: 600,
        execution: 250,
      },
      ...performanceBudgets,
    };

    // Initialize leaf factory
    this.leafFactory = new LeafFactory();

    // Register HRM cognitive module
    this.registerModule(new HRMCognitiveModule(this.hybridHRM));

    // Initialize goal templates
    this.initializeGoalTemplates();

    console.log('🧠 Hybrid HRM Arbiter initialized with optimizations');
  }

  /**
   * OPTIMIZATION 1: Signal Batching
   * Group similar signals together to reduce redundant processing
   */
  private batchSignals(signals: HRMSignal[]): SignalBatch[] {
    const batches: SignalBatch[] = [];
    const currentBatch: HRMSignal[] = [];
    let lastProvenance: string | null = null;
    let batchIndex = 0;

    for (const signal of signals) {
      // Start new batch if provenance changes or batch is getting large
      if (lastProvenance !== signal.provenance || currentBatch.length >= 3) {
        if (currentBatch.length > 0) {
          const skipLLM = this.shouldSkipLLM(currentBatch);
          batches.push({
            signals: [...currentBatch],
            batchIndex: batchIndex++,
            skipLLM,
          });
          currentBatch.length = 0;
        }
        lastProvenance = signal.provenance;
      }
      currentBatch.push(signal);
    }

    if (currentBatch.length > 0) {
      const skipLLM = this.shouldSkipLLM(currentBatch);
      batches.push({
        signals: currentBatch,
        batchIndex: batchIndex,
        skipLLM,
      });
    }

    this.optimizationStats.batchesCreated = batches.length;
    return batches;
  }

  /**
   * OPTIMIZATION 2: Caching
   * Cache results to avoid re-processing similar goals
   */
  private getCachedResult(task: string): any | null {
    const cached = this.cache.get(task);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      this.optimizationStats.cacheHits++;
      return cached.result;
    }
    if (cached) {
      this.cache.delete(task);
    }
    return null;
  }

  private setCachedResult(task: string, system: string, result: any): void {
    this.cache.set(task, {
      task,
      system,
      result,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
  }

  /**
   * OPTIMIZATION 3: Smart Routing
   * Skip LLM calls for simple signals that can be handled by GOAP
   */
  private shouldSkipLLM(signals: HRMSignal[]): boolean {
    // Skip LLM if all signals are simple (low complexity, high urgency)
    return signals.every((signal) => {
      const isSimple = signal.value > 0.7 || signal.provenance === 'body';
      const isUrgent =
        signal.name.includes('threat') || signal.name.includes('health');
      return isSimple || isUrgent;
    });
  }

  /**
   * OPTIMIZATION 4: Parallel Processing
   * Process goal candidates in parallel where possible
   */
  private async processGoalsParallel(
    candidates: HRMGoalCandidate[],
    skipLLM: boolean = false
  ): Promise<HRMGoalCandidate[]> {
    const promises = candidates.map(async (candidate) => {
      const taskDescription = `Execute goal: ${candidate.template.name} for ${candidate.template.needType} need`;

      // Check cache first
      const cached = this.getCachedResult(taskDescription);
      if (cached) {
        return {
          ...candidate,
          plan: cached.result,
          reasoningTrace: [
            ...candidate.reasoningTrace,
            `Cached result from ${cached.system}`,
          ],
        };
      }

      // Smart routing: skip LLM for simple goals
      if (skipLLM && candidate.template.complexity < 0.3) {
        return {
          ...candidate,
          plan: { actions: ['GOAP_FAST_RESPONSE'] },
          reasoningTrace: [
            ...candidate.reasoningTrace,
            'Simple goal - skipped LLM via smart routing',
          ],
        };
      }

      try {
        if (!this.currentContext) {
          console.warn('No current context available for HRM reasoning');
          return candidate;
        }

        const result = await this.hybridHRM.reason(
          taskDescription,
          this.currentContext,
          {
            maxTimeMs: this.performanceBudgets.routine.hrmPlanning,
            maxComplexity: candidate.template.complexity,
          }
        );

        // Cache the result
        this.setCachedResult(taskDescription, result.primarySystem, result);

        return {
          ...candidate,
          plan: result.result,
          reasoningTrace: [
            ...candidate.reasoningTrace,
            `HRM planning completed via ${result.primarySystem}`,
            `Confidence: ${result.confidence.toFixed(2)}`,
          ],
        };
      } catch (error) {
        console.warn(
          `HRM planning failed for ${candidate.template.name}:`,
          error
        );
        return candidate;
      }
    });

    return Promise.all(promises);
  }

  /**
   * Initialize the hybrid HRM system
   */
  async initialize(): Promise<boolean> {
    console.log('🧠 Initializing Hybrid HRM Arbiter...');

    try {
      const success = await this.hybridHRM.initialize();
      if (success) {
        console.log('✅ Hybrid HRM Arbiter initialized successfully');
        return true;
      }

      console.warn(
        '⚠️ Hybrid HRM initialization failed, falling back to basic mode'
      );
      return false;
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid HRM Arbiter:', error);
      return false;
    }
  }

  /**
   * Process signals through the full HRM pipeline (now uses optimizations by default)
   */
  async processHRMSignal(
    signal: HRMSignal,
    context: LeafContext
  ): Promise<HRMGoalCandidate[]> {
    // Use the optimized version by default
    return this.processHRMSignalOptimized([signal], context);
  }

  /**
   * Process multiple signals with optimizations (public API)
   */
  async processMultipleSignals(
    signals: HRMSignal[],
    context: LeafContext
  ): Promise<HRMGoalCandidate[]> {
    return this.processHRMSignalOptimized(signals, context);
  }

  /**
   * Process multiple signals with optimizations
   */
  async processHRMSignalOptimized(
    signals: HRMSignal[],
    context: LeafContext
  ): Promise<HRMGoalCandidate[]> {
    const startTime = performance.now();
    this.currentContext = context;

    try {
      // OPTIMIZATION 1: Signal batching
      const batches = this.batchSignals(signals);

      if (batches.length > 1) {
        console.log(
          `📦 Processing ${signals.length} signals in ${batches.length} optimized batches`
        );
      }

      const allResults: HRMGoalCandidate[] = [];

      // Process each batch
      for (const batch of batches) {
        const batchStartTime = performance.now();

        // Add signals to history
        this.signalHistory.push(...batch.signals);
        this.cleanupExpiredSignals();

        // 1. Signal Processing (now batched)
        const signalTime = performance.now();
        if (
          performance.now() - signalTime >
          this.performanceBudgets.routine.signalProcessing
        ) {
          console.warn('⚠️ Signal processing exceeded budget');
        }

        // 2. Need Generation (batched)
        const needTime = performance.now();
        const needs = await this.computeNeeds(batch.signals, context);
        this.needHistory.push(...needs);

        if (
          performance.now() - needTime >
          this.performanceBudgets.routine.needGeneration
        ) {
          console.warn('⚠️ Need generation exceeded budget');
        }

        // 3. Goal Enumeration (batched)
        const goalTime = performance.now();
        const goalCandidates = await this.enumerateGoals(needs, context);

        if (
          performance.now() - goalTime >
          this.performanceBudgets.routine.goalEnumeration
        ) {
          console.warn('⚠️ Goal enumeration exceeded budget');
        }

        // 4. Priority Ranking (batched)
        const priorityTime = performance.now();
        const rankedGoals = await this.rankGoals(goalCandidates);

        if (
          performance.now() - priorityTime >
          this.performanceBudgets.routine.priorityRanking
        ) {
          console.warn('⚠️ Priority ranking exceeded budget');
        }

        // 5. HRM Planning with optimizations
        const planningTime = performance.now();

        // OPTIMIZATION 3: Smart routing check
        if (batch.skipLLM) {
          this.optimizationStats.llmSkips++;
          console.log(
            `🚀 Smart routing: Skipping LLM for batch ${batch.batchIndex + 1}`
          );
        }

        // OPTIMIZATION 4: Parallel processing
        const plannedGoals = await this.processGoalsParallel(
          rankedGoals.slice(0, 3),
          batch.skipLLM
        );

        if (
          performance.now() - planningTime >
          this.performanceBudgets.routine.hrmPlanning
        ) {
          console.warn('⚠️ HRM planning exceeded budget');
        }

        const batchTime = performance.now() - batchStartTime;
        console.log(
          `📦 Batch ${batch.batchIndex + 1} completed in ${batchTime.toFixed(1)}ms`
        );

        allResults.push(...plannedGoals);
      }

      const totalTime = performance.now() - startTime;
      console.log(
        `🧠 Optimized HRM Pipeline completed in ${totalTime.toFixed(1)}ms`
      );

      // Log optimization stats
      this.logOptimizationStats();

      // 6. Goal Execution
      if (allResults.length > 0) {
        console.log(`🎯 Executing ${allResults.length} goals...`);
        const executionResults = await this.executeGoals(allResults, context);

        // Update goals with execution results
        allResults.forEach((goal, index) => {
          const result = executionResults[index];
          goal.executionResult = result;
        });
      }

      return allResults;
    } catch (error) {
      console.error('❌ Optimized HRM signal processing failed:', error);
      return [];
    }
  }

  /**
   * Log optimization statistics
   */
  private logOptimizationStats(): void {
    if (
      this.optimizationStats.batchesCreated > 1 ||
      this.optimizationStats.cacheHits > 0
    ) {
      console.log('🔧 Optimization Stats:', {
        batches: this.optimizationStats.batchesCreated,
        cacheHits: this.optimizationStats.cacheHits,
        llmSkips: this.optimizationStats.llmSkips,
        parallel: this.optimizationStats.parallelProcessing,
      });
    }
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): OptimizationStats {
    return { ...this.optimizationStats };
  }

  /**
   * Clear optimization statistics
   */
  clearOptimizationStats(): void {
    this.optimizationStats = {
      batchesCreated: 0,
      cacheHits: 0,
      llmSkips: 0,
      parallelProcessing: true,
      totalTimeSaved: 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.optimizationStats.cacheHits = 0;
  }

  /**
   * Execute goals using the leaf system and action translator
   */
  private async executeGoals(
    goals: HRMGoalCandidate[],
    context: LeafContext
  ): Promise<Array<{ success: boolean; error?: string; actions?: string[] }>> {
    const executionPromises = goals.map(async (goal) => {
      try {
        if (!goal.plan) {
          return { success: false, error: 'No plan available for goal' };
        }

        console.log(`🎯 Executing goal: ${goal.template.name}`);

        // Execute the plan using the leaf system
        const executionResult = await this.executePlanWithLeaves(
          goal.plan,
          context
        );

        if (executionResult.success) {
          console.log(`✅ Goal execution completed: ${goal.template.name}`);
          return {
            success: true,
            actions: executionResult.actions || ['goal_completed'],
          };
        } else {
          console.error(
            `❌ Goal execution failed: ${goal.template.name}`,
            executionResult.error
          );
          return {
            success: false,
            error: executionResult.error || 'Unknown execution error',
          };
        }
      } catch (error) {
        console.error(`❌ Goal execution failed: ${goal.template.name}`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    return Promise.all(executionPromises);
  }

  /**
   * Execute a plan using the leaf system
   */
  private async executePlanWithLeaves(
    plan: any,
    context: LeafContext
  ): Promise<{ success: boolean; error?: string; actions?: string[] }> {
    try {
      const actions: string[] = [];

      // If plan has steps, execute them sequentially
      if (plan.steps && Array.isArray(plan.steps)) {
        for (const step of plan.steps) {
          const stepResult = await this.executePlanStep(step, context);
          if (stepResult.success) {
            actions.push(stepResult.action || 'step_completed');
          } else {
            return { success: false, error: stepResult.error };
          }
        }
      }

      // If plan has a single action, execute it directly
      if (plan.action) {
        const actionResult = await this.executePlanStep(plan, context);
        if (actionResult.success) {
          actions.push(actionResult.action || 'action_completed');
        } else {
          return { success: false, error: actionResult.error };
        }
      }

      return { success: true, actions };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute a single plan step using the leaf system
   */
  private async executePlanStep(
    step: any,
    context: LeafContext
  ): Promise<{ success: boolean; error?: string; action?: string }> {
    try {
      // Extract action information from the step
      const actionName = step.action?.name || step.name || 'unknown_action';
      const parameters = step.action?.parameters || step.parameters || {};

      // Map common action types to leaf operations
      const leafName = this.mapActionToLeaf(actionName, parameters);

      if (!leafName) {
        return {
          success: false,
          error: `No leaf mapping found for action: ${actionName}`,
        };
      }

      // Execute the leaf using the leaf factory
      const leafResult = await this.executeLeaf(leafName, parameters, context);

      return {
        success: leafResult.success,
        error: leafResult.error,
        action: actionName,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Map action names to leaf operations
   */
  private mapActionToLeaf(actionName: string, parameters: any): string | null {
    const actionMap: Record<string, string> = {
      move_to: 'move_to',
      dig_block: 'dig_block',
      place_block: 'place_block',
      consume_food: 'consume_food',
      craft_item: 'craft_item',
      find_shelter: 'find_shelter',
      explore_area: 'explore_area',
      collect_resources: 'collect_resources',
      build_structure: 'build_structure',
      defend_position: 'defend_position',
      retreat: 'retreat_and_block',
      light_area: 'place_torch_if_needed',
      sense_environment: 'sense_hostiles',
      wait: 'wait',
      chat: 'chat',
    };

    return actionMap[actionName] || null;
  }

  /**
   * Execute a leaf operation using the leaf factory
   */
  private async executeLeaf(
    leafName: string,
    parameters: any,
    context: LeafContext
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.leafFactory) {
        return {
          success: false,
          error: 'Leaf factory not initialized',
        };
      }

      // Get the leaf implementation
      const leaf = this.leafFactory.get(leafName);
      if (!leaf) {
        return {
          success: false,
          error: `Leaf not found: ${leafName}`,
        };
      }

      // Execute the leaf
      const result = await leaf.run(context, parameters);

      return {
        success: result.status === 'success',
        error:
          result.error?.detail ||
          (result.status === 'failure' ? 'Leaf execution failed' : undefined),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compute needs from signals with context gates
   */
  private async computeNeeds(
    signals: HRMSignal[],
    context: LeafContext
  ): Promise<NeedScore[]> {
    const needs: NeedScore[] = [];

    // Safety need
    const safetySignals = signals.filter(
      (s) => s.provenance === 'env' && s.name.includes('threat')
    );
    const safetyScore = await this.computeSafetyNeed(safetySignals, context);
    needs.push(safetyScore);

    // Nutrition need
    const nutritionSignals = signals.filter(
      (s) => s.provenance === 'body' && s.name.includes('hunger')
    );
    const nutritionScore = this.computeNutritionNeed(nutritionSignals);
    needs.push(nutritionScore);

    // Progress need
    const progressSignals = signals.filter(
      (s) => s.name.includes('tool') || s.name.includes('armor')
    );
    const progressScore = await this.computeProgressNeed(progressSignals);
    needs.push(progressScore);

    // Social need
    const socialSignals = signals.filter((s) => s.provenance === 'social');
    const socialScore = await this.computeSocialNeed(socialSignals);
    needs.push(socialScore);

    // Curiosity need
    const curiositySignals = signals.filter(
      (s) => s.name.includes('novelty') || s.name.includes('unexplored')
    );
    const curiosityScore = this.computeCuriosityNeed(curiositySignals);
    needs.push(curiosityScore);

    // Integrity need
    const integritySignals = signals.filter(
      (s) => s.provenance === 'memory' && s.name.includes('promise')
    );
    const integrityScore = this.computeIntegrityNeed(integritySignals);
    needs.push(integrityScore);

    return needs;
  }

  /**
   * Compute safety need with context gates
   */
  private async computeSafetyNeed(
    signals: HRMSignal[],
    context: LeafContext
  ): Promise<NeedScore> {
    const threatProximity =
      signals.find((s) => s.name === 'threatProximity')?.value || 0;

    // Get data from bot directly instead of using snapshot
    const bot = context.bot;
    const lightLevel = 15; // Default light level
    const health = bot?.health || 20;
    const timeOfDay = bot?.time?.timeOfDay || 6000;

    // Base safety calculation
    const baseScore =
      threatProximity * 0.4 +
      (1 - lightLevel / 15) * 0.3 +
      (1 - health / 20) * 0.3;

    // Context gates
    const timeGate = timeOfDay < 12000 || timeOfDay > 24000 ? 1.5 : 1.0; // Night boost
    const locationGate = 1.0; // Default location gate
    const socialGate = 1.0; // Default social gate
    const environmentalGate = 1.0; // Default environmental gate

    return {
      name: 'Safety',
      score: Math.min(
        1.0,
        baseScore * timeGate * locationGate * socialGate * environmentalGate
      ),
      dScore: 0,
      urgency: baseScore > 0.7 ? 1.0 : baseScore,
      contextGates: {
        timeOfDay: timeGate,
        location: locationGate,
        social: socialGate,
        environmental: environmentalGate,
      },
    };
  }

  /**
   * Compute nutrition need
   */
  private computeNutritionNeed(signals: HRMSignal[]): NeedScore {
    const hunger = signals.find((s) => s.name === 'hunger')?.value || 0;
    const fatigue = signals.find((s) => s.name === 'fatigue')?.value || 0;

    const baseScore = (hunger + fatigue) / 2;
    const urgency = baseScore > 0.8 ? 1.0 : baseScore;

    return {
      name: 'Nutrition',
      score: baseScore,
      dScore: 0,
      urgency,
      contextGates: {
        timeOfDay: 1.0,
        location: 1.0,
        social: 1.0,
        environmental: 1.0,
      },
    };
  }

  /**
   * Compute progress need
   */
  private async computeProgressNeed(signals: HRMSignal[]): Promise<NeedScore> {
    const toolDeficit =
      signals.find((s) => s.name === 'toolDeficit')?.value || 0;
    const questBacklog =
      signals.find((s) => s.name === 'questBacklog')?.value || 0;

    const baseScore = (toolDeficit + questBacklog) / 2;
    const urgency = baseScore > 0.6 ? 0.8 : baseScore;

    return {
      name: 'Progress',
      score: baseScore,
      dScore: 0,
      urgency,
      contextGates: {
        timeOfDay: 1.0,
        location: 1.0,
        social: 1.0,
        environmental: 1.0,
      },
    };
  }

  /**
   * Compute social need
   */
  private async computeSocialNeed(signals: HRMSignal[]): Promise<NeedScore> {
    const playerNearby =
      signals.find((s) => s.name === 'playerNearby')?.value || 0;
    const isolationTime =
      signals.find((s) => s.name === 'isolationTime')?.value || 0;

    const baseScore = (playerNearby + isolationTime) / 2;
    const urgency = baseScore > 0.7 ? 0.6 : baseScore * 0.5;

    return {
      name: 'Social',
      score: baseScore,
      dScore: 0,
      urgency,
      contextGates: {
        timeOfDay: 1.0,
        location: 1.0,
        social: 1.0,
        environmental: 1.0,
      },
    };
  }

  /**
   * Compute curiosity need
   */
  private computeCuriosityNeed(signals: HRMSignal[]): NeedScore {
    const novelty = signals.find((s) => s.name === 'novelty')?.value || 0;
    const unexploredFrontier =
      signals.find((s) => s.name === 'unexploredFrontier')?.value || 0;

    const baseScore = (novelty + unexploredFrontier) / 2;
    const urgency = baseScore > 0.8 ? 0.4 : baseScore * 0.3;

    return {
      name: 'Curiosity',
      score: baseScore,
      dScore: 0,
      urgency,
      contextGates: {
        timeOfDay: 1.0,
        location: 1.0,
        social: 1.0,
        environmental: 1.0,
      },
    };
  }

  /**
   * Compute integrity need
   */
  private computeIntegrityNeed(signals: HRMSignal[]): NeedScore {
    const questBacklog =
      signals.find((s) => s.name === 'questBacklog')?.value || 0;

    const baseScore = questBacklog;
    const urgency = baseScore > 0.5 ? 0.3 : baseScore * 0.2;

    return {
      name: 'Integrity',
      score: baseScore,
      dScore: 0,
      urgency,
      contextGates: {
        timeOfDay: 1.0,
        location: 1.0,
        social: 1.0,
        environmental: 1.0,
      },
    };
  }

  /**
   * Enumerate goals from needs
   */
  private async enumerateGoals(
    needs: NeedScore[],
    context: LeafContext
  ): Promise<HRMGoalCandidate[]> {
    const candidates: HRMGoalCandidate[] = [];

    for (const template of this.goalTemplates) {
      const need = needs.find((n) => n.name === template.needType);
      if (!need) continue;

      const preconditionsMet = await template.preconditions(context);
      if (!preconditionsMet) continue;

      const feasibility = template.feasibility(context);
      if (!feasibility.ok) continue;

      const utility = template.utility(need, context);
      const priority = utility * need.urgency;

      candidates.push({
        id: uuidv4(),
        template,
        priority,
        feasibility,
        reasoningTrace: [
          `Goal ${template.name} generated for ${template.needType} need`,
          `Utility: ${utility.toFixed(2)}, Urgency: ${need.urgency.toFixed(2)}`,
          `Priority: ${priority.toFixed(2)}`,
        ],
        createdAt: Date.now(),
        estimatedProcessingTime: template.complexity * 1000,
      });
    }

    return candidates;
  }

  /**
   * Rank goals by priority and feasibility
   */
  private async rankGoals(
    candidates: HRMGoalCandidate[]
  ): Promise<HRMGoalCandidate[]> {
    // Sort by priority (highest first)
    return candidates.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Clean up expired signals
   */
  private cleanupExpiredSignals(): void {
    const now = Date.now();
    this.signalHistory = this.signalHistory.filter(
      (signal) => !signal.ttlMs || now - signal.timestamp < signal.ttlMs
    );
  }

  /**
   * Plan with HRM for top candidates (now uses parallel processing)
   */
  private async planWithHRM(
    candidates: HRMGoalCandidate[]
  ): Promise<HRMGoalCandidate[]> {
    // Use the optimized parallel processing method
    return this.processGoalsParallel(candidates, false);
  }

  /**
   * Initialize goal templates
   */
  private initializeGoalTemplates(): void {
    // Safety goals
    this.goalTemplates.push({
      name: 'ReachSafeLight',
      needType: 'Safety',
      preconditions: async (context) => {
        // Check light level from bot directly
        return true; // Always available for demo
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.9,
      complexity: 0.3,
      timeCritical: true,
      safetyCritical: true,
    });

    this.goalTemplates.push({
      name: 'ReturnToBase',
      needType: 'Safety',
      preconditions: async (context) => {
        // Check light level from bot directly
        return true; // Always available for demo
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.8,
      complexity: 0.5,
      timeCritical: true,
      safetyCritical: true,
    });

    // Nutrition goals
    this.goalTemplates.push({
      name: 'EatFromInventory',
      needType: 'Nutrition',
      preconditions: async (context) => {
        // Check inventory from bot directly
        const bot = context.bot;
        const inventory = bot?.inventory?.items?.() || [];
        const food = inventory.find((i: any) => i.name.includes('food'));
        return !!(food && food.count > 0);
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.7,
      complexity: 0.2,
      timeCritical: false,
      safetyCritical: false,
    });

    // Progress goals
    this.goalTemplates.push({
      name: 'UpgradePickaxe',
      needType: 'Progress',
      preconditions: async (context) => {
        // Check inventory from bot directly
        const bot = context.bot;
        const inventory = bot?.inventory?.items?.() || [];
        const pickaxe = inventory.find((i: any) => i.name.includes('pickaxe'));
        return !!(pickaxe && pickaxe.count > 0);
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.6,
      complexity: 0.6,
      timeCritical: false,
      safetyCritical: false,
    });

    // Social goals
    this.goalTemplates.push({
      name: 'VisitVillage',
      needType: 'Social',
      preconditions: async () => {
        // Always available for social interaction
        return true;
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.5,
      complexity: 0.4,
      timeCritical: false,
      safetyCritical: false,
    });

    // Curiosity goals
    this.goalTemplates.push({
      name: 'ScoutNewArea',
      needType: 'Curiosity',
      preconditions: async () => {
        // Always available for exploration
        return true;
      },
      feasibility: () => ({ ok: true }),
      utility: (need) => need.score * 0.4,
      complexity: 0.6,
      timeCritical: false,
      safetyCritical: false,
    });
  }
}

/**
 * HRM Cognitive Module for integration with main Arbiter
 */
class HRMCognitiveModule implements CognitiveModule {
  readonly type = ModuleType.HRM;
  readonly name = 'hrm-cognitive';

  constructor(private hybridHRM: HybridHRMRouter) {
    // hybridHRM is used in the process method
  }

  canHandle(task: CognitiveTask, signature?: TaskSignature): boolean {
    // Handle complex reasoning tasks
    return (
      task.complexity === 'complex' ||
      (signature?.symbolicPreconditions?.length || 0) > 0.6
    );
  }

  async process(task: CognitiveTask): Promise<any> {
    // This would be called by the main Arbiter for complex tasks
    // For now, return a simple response
    return {
      type: 'hrm-response',
      task: task.type,
      confidence: 0.8,
      reasoning: 'HRM cognitive module processed task',
    };
  }

  estimateProcessingTime(task: CognitiveTask): number {
    // Map complexity to processing time
    const complexityMap = {
      simple: 50,
      moderate: 150,
      complex: 300,
    };
    return complexityMap[task.complexity] || 150;
  }
}

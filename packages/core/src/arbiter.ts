/**
 * Arbiter - Central control system for the conscious bot
 *
 * Orchestrates signal processing, task routing, and module coordination
 * while enforcing real-time performance constraints and safety measures.
 * Implements redundant architecture to prevent single points of failure.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import { SignalProcessor, DEFAULT_SIGNAL_CONFIG } from './signal-processor';
import {
  PerformanceMonitor,
  DEFAULT_PERFORMANCE_CONFIG,
} from './performance-monitor';
import { AdvancedNeedGenerator } from './advanced-need-generator';
import type { EnhancedNeed } from './advanced-need-generator';
// import { GoalTemplateManager } from './goal-template-manager';
import {
  AdvancedSignalProcessor,
  Signal as AdvancedSignal,
  SignalType,
  SignalSource,
  SignalDirection,
} from './advanced-signal-processor';
import { PriorityRanker } from './priority-ranker';
import {
  Signal,
  CognitiveTask,
  TaskSignature,
  RoutingDecision,
  ModuleType,
  PreemptionPriority,
  PreemptionDecision,
  ArbiterConfig,
  DegradationLevel,
  SystemEvents,
  Need,
  PriorityTask,
  NeedContext,
  TaskContext,
  NeedType,
  TrendDirection,
  TimeOfDay,
  LocationType,
  SocialContext,
  EnvironmentalFactor,
  validateSignal,
  validateCognitiveTask,
  validateArbiterConfig,
} from './types';

export interface ArbiterOptions {
  config?: Partial<ArbiterConfig>;
  signalConfig?: typeof DEFAULT_SIGNAL_CONFIG;
  performanceConfig?: typeof DEFAULT_PERFORMANCE_CONFIG;
  debugMode?: boolean;
  id?: string;
  redundancyMode?: boolean;
}

/**
 * Default arbiter configuration
 */
export const DEFAULT_ARBITER_CONFIG: ArbiterConfig = {
  performanceBudgets: {
    emergency: 50,
    routine: 200,
    deliberative: 1000,
  },
  preemptionEnabled: true,
  safeModeEnabled: true,
  monitoringEnabled: true,
  debugMode: false,
  redundancy: {
    enabled: true,
    instanceCount: 3,
    heartbeatInterval: 1000,
    failoverTimeout: 5000,
    stateSyncInterval: 100,
    loadBalancingStrategy: 'least-loaded',
  },
};

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
export class ReflexModule implements CognitiveModule {
  readonly type = ModuleType.REFLEX;
  readonly name = 'reflex';

  getName(): string {
    return this.name;
  }

  getPriority(): number {
    return 1.0; // High priority for reflex responses
  }

  canHandle(task: CognitiveTask, signature?: TaskSignature): boolean {
    if (signature?.timeConstraint) {
      return task.priority > 0.8 || (signature.timeConstraint ?? 200) < 100;
    }
    return task.priority > 0.8;
  }

  async process(task: CognitiveTask): Promise<string> {
    // Simulate immediate response
    await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms processing
    return `reflex_response_${task.type}`;
  }

  estimateProcessingTime(task: CognitiveTask): number {
    // Implement actual processing time estimation based on task complexity
    const baseTime = 10; // Base processing time in milliseconds

    // Complexity factors based on task properties
    let complexityMultiplier = 1.0;

    // Task type complexity
    const taskComplexity: Record<string, number> = {
      reflex: 0.5, // Fastest - immediate reactions
      perception: 0.8, // Quick sensory processing
      decision: 1.0, // Standard decision making
      planning: 1.5, // More complex planning
      learning: 2.0, // Complex learning processes
      social: 1.8, // Social interaction processing
      creative: 2.5, // Most complex - creative thinking
      emotional: 1.3, // Emotional processing
      memory: 1.2, // Memory operations
      communication: 1.1, // Communication processing
    };

    complexityMultiplier *= taskComplexity[task.type] || 1.0;

    // Priority impact (higher priority = faster processing)
    const priorityMultiplier = Math.max(0.5, 1.0 - task.priority * 0.1);

    // Urgency impact (urgent tasks get faster processing)
    const urgencyMultiplier = task.urgency > 0.8 ? 0.7 : 1.0;

    // Context complexity (more context = more processing time)
    const contextMultiplier = Math.min(
      2.0,
      1.0 + Object.keys(task.context || {}).length * 0.1
    );

    // Calculate final processing time
    const estimatedTime =
      baseTime *
      complexityMultiplier *
      priorityMultiplier *
      urgencyMultiplier *
      contextMultiplier;

    console.log(
      `Processing time estimation for ${task.type}: ${Math.round(estimatedTime)}ms (complexity: ${complexityMultiplier.toFixed(2)})`
    );

    return Math.round(estimatedTime);
  }
}

/**
 * Central arbiter that coordinates all cognitive modules and enforces
 * real-time constraints while maintaining system coherence.
 */
export class Arbiter extends EventEmitter<SystemEvents> {
  private config: ArbiterConfig;
  private id: string;
  private signalProcessor: SignalProcessor;
  private performanceMonitor: PerformanceMonitor;
  private advancedNeedGenerator: AdvancedNeedGenerator;
  // private goalTemplateManager: GoalTemplateManager;
  private advancedSignalProcessor: AdvancedSignalProcessor;
  private priorityRanker: PriorityRanker;
  private registeredModules = new Map<ModuleType, CognitiveModule>();
  private currentTask: CognitiveTask | null = null;
  private running = false;
  private processLoopInterval?: NodeJS.Timeout;
  private totalSignalsProcessed = 0;
  private lastSignalTime = 0;
  private taskQueue: CognitiveTask[] = [];
  private isProcessing = false;
  private enhancedNeedTaskCount = 0;

  constructor(options: ArbiterOptions = {}) {
    super();

    this.config = { ...DEFAULT_ARBITER_CONFIG, ...options.config };
    validateArbiterConfig(this.config);

    // Set instance ID for redundancy support
    this.id = options.id || `arbiter-${Date.now()}`;

    // Initialize subsystems
    this.signalProcessor = new SignalProcessor(options.signalConfig);
    this.performanceMonitor = new PerformanceMonitor(options.performanceConfig);
    this.advancedNeedGenerator = new AdvancedNeedGenerator();
    // this.goalTemplateManager = new GoalTemplateManager();
    this.advancedSignalProcessor = new AdvancedSignalProcessor();
    this.priorityRanker = new PriorityRanker();

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
  registerModule(module: CognitiveModule): void {
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
  async processSignal(signal: Signal): Promise<void> {
    try {
      const validatedSignal = validateSignal(signal);

      // Process with basic signal processor
      this.signalProcessor.processSignal(validatedSignal);

      // Process with advanced signal processor
      const advancedSignal: AdvancedSignal = {
        id: uuidv4(),
        type: validatedSignal.type as SignalType,
        source: 'internal' as SignalSource,
        priority: validatedSignal.intensity,
        urgency: validatedSignal.intensity,
        confidence: 0.8,
        timestamp: validatedSignal.timestamp,
        data: {
          content: validatedSignal.type,
          intensity: validatedSignal.intensity,
          direction: 'incoming' as SignalDirection,
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

      const processedSignals =
        await this.advancedSignalProcessor.processSignals([advancedSignal]);

      // Generate enhanced needs from processed signals
      if (processedSignals.processedSignals.length > 0) {
        // Convert signal processor needs to advanced need generator format
        const baseNeeds = this.signalProcessor
          .getCurrentNeeds()
          .map((need) => ({
            id: uuidv4(),
            type: need.type as NeedType,
            intensity: need.urgency,
            urgency: need.urgency,
            trend: TrendDirection.STABLE,
            trendStrength: 0.5,
            context: this.getCurrentNeedContext(),
            memoryInfluence: 0.5,
            noveltyScore: 0.5,
            commitmentBoost: 0.5,
            timestamp: need.lastUpdated,
            history: [],
          }));

        const enhancedNeeds =
          await this.advancedNeedGenerator.generateEnhancedNeeds(
            baseNeeds,
            this.getCurrentNeedContext(),
            processedSignals.processedSignals.map((s) => ({
              type: 'experience' as const,
              content: s.data.content,
              relevance: s.metadata.relevance,
              emotionalValence: s.metadata.emotionalValence,
              urgency: s.urgency,
              timestamp: s.timestamp,
              decayRate: 0.95,
            }))
          );

        await this.integrateEnhancedNeeds(enhancedNeeds, 'signal');
      }

      // Track signal statistics
      this.totalSignalsProcessed++;
      this.lastSignalTime = Date.now();

      if (this.config.debugMode) {
        console.log(
          'Signal processed:',
          validatedSignal.type,
          validatedSignal.intensity
        );
      }
    } catch (error) {
      console.error('Signal validation failed:', error);
    }
  }

  /**
   * Process cognitive task through the routing pipeline
   *
   * @param task - Task to process
   * @returns Promise resolving to task result
   */
  async processCognitiveTask(task: CognitiveTask): Promise<any> {
    try {
      const validatedTask = validateCognitiveTask(task);

      // Check for preemption
      if (this.config.preemptionEnabled && this.currentTask) {
        const preemptionDecision = this.evaluatePreemption(
          this.currentTask,
          validatedTask
        );
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
    } catch (error) {
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
  routeTask(task: CognitiveTask): RoutingDecision {
    const signature = this.analyzeTaskSignature(task);
    const candidates: Array<{
      module: ModuleType;
      score: number;
      reason: string;
    }> = [];

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
        selectedModule: ModuleType.REFLEX,
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
  private analyzeTaskSignature(task: CognitiveTask): TaskSignature {
    // Simple heuristics - would be much more sophisticated in practice
    const hasSymbolic = task.type === 'planning' || task.type === 'reasoning';
    const isSocial =
      task.type === 'social' || task.metadata?.involves_communication;
    const isAmbiguous = task.complexity === 'complex' && !hasSymbolic;
    const needsPlanning =
      task.type === 'planning' || task.complexity === 'complex';

    // Determine time constraint based on priority and deadline
    let timeConstraint = this.config.performanceBudgets.routine;
    if (task.priority > 0.8) {
      timeConstraint = this.config.performanceBudgets.emergency;
    } else if (task.complexity === 'complex') {
      timeConstraint = this.config.performanceBudgets.deliberative;
    }

    return {
      type: task.type,
      complexity: task.complexity,
      requirements: [],
      symbolicPreconditions: hasSymbolic ? ['planning', 'reasoning'] : [],
      socialContent: isSocial,
      ambiguousContext: isAmbiguous,
      requiresPlanning: needsPlanning,
      timeConstraint,
      riskLevel:
        task.priority > 0.7 ? 'high' : task.priority > 0.4 ? 'medium' : 'low',
    };
  }

  /**
   * Calculate score for module handling task
   */
  private calculateModuleScore(
    module: CognitiveModule,
    task: CognitiveTask,
    signature: TaskSignature
  ): number {
    let score = 0.5; // Base score

    // Module-specific scoring logic
    switch (module.type) {
      case ModuleType.REFLEX:
        score += task.priority * 0.5; // Higher score for urgent tasks
        score += (signature.timeConstraint ?? 200) < 100 ? 0.4 : 0;
        break;

      case ModuleType.HRM:
        score += (signature.symbolicPreconditions?.length ?? 0) * 0.4;
        score += signature.requiresPlanning ? 0.3 : 0;
        score -= signature.socialContent ? 0.2 : 0; // HRM not great at social
        break;

      case ModuleType.LLM:
        score += signature.socialContent ? 0.4 : 0;
        score += signature.ambiguousContext ? 0.3 : 0;
        score -= (signature.timeConstraint ?? 200) < 200 ? 0.3 : 0; // LLM is slower
        break;

      case ModuleType.GOAP:
        score += signature.requiresPlanning ? 0.3 : 0;
        score += task.priority > 0.5 ? 0.2 : 0;
        break;
    }

    // Adjust for estimated processing time vs available budget
    const estimatedTime = module.estimateProcessingTime(task);
    if (estimatedTime <= (signature.timeConstraint ?? 200)) {
      score += 0.2;
    } else {
      score -= 0.3; // Penalize if likely to exceed budget
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get human-readable routing reason
   */
  private getRoutingReason(
    module: CognitiveModule,
    task: CognitiveTask,
    signature: TaskSignature
  ): string {
    const reasons: string[] = [];

    if ((signature.timeConstraint ?? 200) < 100) {
      reasons.push('urgent timing constraint');
    }
    if ((signature.symbolicPreconditions?.length ?? 0) > 0.7) {
      reasons.push('symbolic reasoning required');
    }
    if (signature.socialContent) {
      reasons.push('social interaction needed');
    }
    if (task.priority > 0.8) {
      reasons.push('high priority task');
    }

    const reasonText =
      reasons.length > 0 ? reasons.join(', ') : 'general suitability';
    return `${module.name} selected due to: ${reasonText}`;
  }

  /**
   * Execute task with selected module and performance monitoring
   */
  private async executeTask(
    task: CognitiveTask,
    routing: RoutingDecision
  ): Promise<any> {
    const module = this.registeredModules.get(routing.selectedModule);
    if (!module) {
      throw new Error(`Module not found: ${routing.selectedModule}`);
    }

    // Determine performance context
    const context =
      task.priority > 0.8
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
        console.log(
          `Task completed by ${module.name}: ${session.getElapsed()}ms`
        );
      }

      return result;
    } catch (error) {
      session.checkpoint('execution_error');
      this.performanceMonitor.recordCompletion(session, false);

      console.error(`Task execution failed in ${module.name}:`, error);
      throw error;
    } finally {
      this.currentTask = null;
    }
  }

  /**
   * Evaluate if incoming task should preempt current processing
   */
  private evaluatePreemption(
    currentTask: CognitiveTask,
    incomingTask: CognitiveTask
  ): PreemptionDecision {
    // Simple priority-based preemption
    const shouldPreempt = incomingTask.priority > currentTask.priority + 0.2; // Threshold for preemption

    // Determine preemption priority level
    let priority = PreemptionPriority.IDLE_PROCESSING;
    if (incomingTask.priority > 0.9) {
      priority = PreemptionPriority.EMERGENCY_REFLEX;
    } else if (incomingTask.priority > 0.7) {
      priority = PreemptionPriority.SAFETY_INTERRUPT;
    } else if (incomingTask.priority > 0.5) {
      priority = PreemptionPriority.GOAL_COMPLETION;
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
  private async executePreemption(decision: PreemptionDecision): Promise<void> {
    if (!this.currentTask) return;

    console.log(`Preempting task: ${decision.reasoning}`);

    // Attempt to preempt current module
    const currentModule = this.registeredModules.get(ModuleType.REFLEX); // Simplified
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
  start(): void {
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
  private async processControlLoop(): Promise<void> {
    if (!this.running) return;

    try {
      // Check for high-priority needs that require immediate action
      const currentNeeds = this.signalProcessor.getCurrentNeeds();

      // Implement urgent needs filtering for priority decision making
      const urgentNeeds = currentNeeds.filter((need) => need.urgency > 0.7);
      const highPriorityNeeds = currentNeeds.filter(
        (need) => need.urgency > 0.5 && need.urgency <= 0.7
      );
      const normalNeeds = currentNeeds.filter((need) => need.urgency <= 0.5);

      // Process urgent needs immediately (urgency > 0.7)
      if (urgentNeeds.length > 0) {
        console.log(
          `🚨 Processing ${urgentNeeds.length} urgent needs:`,
          urgentNeeds.map((n) => `${n.type}(${n.urgency.toFixed(2)})`)
        );

        for (const urgentNeed of urgentNeeds) {
          await this.processUrgentNeed(urgentNeed);
        }
      }

      // Process high-priority needs (urgency 0.5-0.7)
      if (highPriorityNeeds.length > 0) {
        console.log(
          `⚡ Processing ${highPriorityNeeds.length} high-priority needs:`,
          highPriorityNeeds.map((n) => `${n.type}(${n.urgency.toFixed(2)})`)
        );

        for (const highNeed of highPriorityNeeds) {
          await this.processHighPriorityNeed(highNeed);
        }
      }

      // Convert current needs to advanced need generator format
      const baseNeeds = currentNeeds.map((need) => ({
        id: uuidv4(),
        type: need.type as NeedType, // NeedType enum
        intensity: need.urgency,
        urgency: need.urgency,
        trend: TrendDirection.STABLE,
        trendStrength: 0.5,
        context: this.getCurrentNeedContext(),
        memoryInfluence: 0.5,
        noveltyScore: 0.5,
        commitmentBoost: 0.5,
        timestamp: need.lastUpdated,
        history: [],
      }));

      // Generate enhanced needs with context awareness
      const enhancedNeeds =
        await this.advancedNeedGenerator.generateEnhancedNeeds(
          baseNeeds,
          this.getCurrentNeedContext(),
          []
        );

      // Create priority tasks from enhanced needs
      const priorityTasks = enhancedNeeds.map((need) => ({
        id: uuidv4(),
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
        context: this.getCurrentTaskContext(),
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
      const ranking = await this.priorityRanker.rankTasks(
        priorityTasks,
        this.getCurrentTaskContext()
      );

      // Process top priority tasks
      const topTasks = ranking.tasks.slice(0, 3); // Process top 3 tasks
      for (const prioritizedTask of topTasks) {
        const task: CognitiveTask = {
          id: prioritizedTask.id,
          type: this.mapTaskTypeToCognitiveType(prioritizedTask.type) as
            | 'social'
            | 'planning'
            | 'reasoning'
            | 'reactive'
            | 'exploration',
          priority: prioritizedTask.calculatedPriority,
          urgency: prioritizedTask.urgency,
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
        if (degradation > DegradationLevel.MODERATE) {
          console.warn(`System degraded to level ${degradation}`);
        }
      }
    } catch (error) {
      console.error('Control loop error:', error);
    }
  }

  /**
   * Integrate enhanced needs into the decision-making system
   */
  private async integrateEnhancedNeeds(
    enhancedNeeds: EnhancedNeed[],
    source: 'signal' | 'loop'
  ): Promise<void> {
    if (enhancedNeeds.length === 0) {
      return;
    }

    const integrationStart = Date.now();
    const priorityThreshold = 0.5;

    const taskContext = this.getCurrentTaskContext();
    const now = Date.now();

    const priorityTasks = enhancedNeeds
      .filter((need) => need.priorityScore >= priorityThreshold)
      .map((need) => this.buildPriorityTaskFromNeed(need, taskContext, now));

    if (priorityTasks.length === 0) {
      console.log('arbiter.enhanced_need.integration', {
        source,
        considered: enhancedNeeds.length,
        scheduled: 0,
        reason: 'below_threshold',
      });
      return;
    }

    const ranking = await this.priorityRanker.rankTasks(
      priorityTasks,
      this.getCurrentTaskContext()
    );

    const scheduledTasks = ranking.tasks
      .slice(0, 3)
      .filter((task) => task.calculatedPriority >= priorityThreshold);

    if (scheduledTasks.length === 0) {
      console.log('arbiter.enhanced_need.integration', {
        source,
        considered: enhancedNeeds.length,
        scheduled: 0,
        reason: 'low_rank',
      });
      return;
    }

    const scheduledIds = new Set<string>();

    for (const prioritizedTask of scheduledTasks) {
      if (scheduledIds.has(prioritizedTask.id)) {
        continue;
      }
      scheduledIds.add(prioritizedTask.id);

      const cognitiveTask = this.buildCognitiveTaskFromPrioritizedTask(
        prioritizedTask,
        source
      );

      this.processCognitiveTask(cognitiveTask).catch((error) => {
        console.error('Failed to process enhanced need task:', error);
      });
    }

    this.enhancedNeedTaskCount += scheduledIds.size;

    console.log('arbiter.enhanced_need.integration', {
      source,
      considered: enhancedNeeds.length,
      scheduled: scheduledIds.size,
      elapsedMs: Date.now() - integrationStart,
      threshold: priorityThreshold,
    });
  }

  private buildPriorityTaskFromNeed(
    need: EnhancedNeed,
    context: TaskContext,
    timestamp: number
  ): PriorityTask {
    return {
      id: need.id ?? uuidv4(),
      name: `${need.type}_need`,
      description: `Address ${need.type} need with priority ${need.priorityScore.toFixed(2)}`,
      type: this.mapNeedTypeToTaskType(need.type),
      basePriority: need.priorityScore,
      urgency: need.urgency,
      importance: need.intensity,
      complexity: need.intensity,
      estimatedDuration: 30,
      dependencies: [],
      resources: [],
      context: { ...context },
      metadata: {
        category: 'need_satisfaction',
        tags: [need.type, 'enhanced_need'],
        difficulty: need.intensity,
        skillRequirements: [],
        emotionalImpact: need.socialImpact ?? 0,
        satisfaction: 0.8,
        novelty: need.noveltyScore,
        socialValue: need.socialImpact ?? 0,
      },
      createdAt: timestamp,
      lastUpdated: timestamp,
    };
  }

  private buildCognitiveTaskFromPrioritizedTask(
    prioritizedTask: PriorityTask & {
      calculatedPriority?: number;
      rankingReason?: string;
    },
    source: string
  ): CognitiveTask {
    const calculatedPriority =
      'calculatedPriority' in prioritizedTask &&
      typeof prioritizedTask.calculatedPriority === 'number'
        ? prioritizedTask.calculatedPriority
        : prioritizedTask.basePriority;

    const complexityLevel =
      prioritizedTask.complexity > 0.66
        ? 'complex'
        : prioritizedTask.complexity > 0.33
          ? 'moderate'
          : 'simple';

    return {
      id: prioritizedTask.id,
      type: this.mapTaskTypeToCognitiveType(prioritizedTask.type) as
        | 'social'
        | 'planning'
        | 'reasoning'
        | 'reactive'
        | 'exploration',
      priority: calculatedPriority,
      urgency: prioritizedTask.urgency,
      complexity: complexityLevel,
      context: {
        needType: prioritizedTask.name,
        needScore: calculatedPriority,
        rankingReason:
          (prioritizedTask as any).rankingReason ?? 'enhanced_need',
        source,
      },
    };
  }

  /**
   * Stop the arbiter and cleanup resources
   */
  stop(): void {
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
  private setupEventForwarding(): void {
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
  getStatus(): {
    running: boolean;
    currentTask: CognitiveTask | null;
    degradationLevel: DegradationLevel;
    registeredModules: ModuleType[];
    performance: any;
    lastSignalTime: number;
    totalSignalsProcessed: number;
    enhancedNeedTasksRouted: number;
  } {
    return {
      running: this.running,
      currentTask: this.currentTask,
      degradationLevel: this.performanceMonitor.getDegradationLevel(),
      registeredModules: Array.from(this.registeredModules.keys()),
      performance: this.performanceMonitor.getCurrentMetrics(),
      lastSignalTime: this.lastSignalTime,
      totalSignalsProcessed: this.totalSignalsProcessed,
      enhancedNeedTasksRouted: this.enhancedNeedTaskCount,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    lastCycleTime: number;
    averageResponseTime: number;
    taskThroughput: number;
    memoryUsage: number;
  } {
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
  updateConfig(newConfig: Partial<ArbiterConfig>): void {
    this.config = { ...this.config, ...newConfig };
    validateArbiterConfig(this.config);
  }

  /**
   * Get signal processor for direct access
   */
  getSignalProcessor(): SignalProcessor {
    return this.signalProcessor;
  }

  /**
   * Get performance monitor for direct access
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Map need type to task type
   */
  private mapNeedTypeToTaskType(needType: string): any {
    const mapping: Record<string, any> = {
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
  private mapTaskTypeToCognitiveType(taskType: any): string {
    const mapping: Record<string, string> = {
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
  getAdvancedNeedGenerator(): AdvancedNeedGenerator {
    return this.advancedNeedGenerator;
  }

  // getGoalTemplateManager(): GoalTemplateManager {
  //   return this.goalTemplateManager;
  // }

  getAdvancedSignalProcessor(): AdvancedSignalProcessor {
    return this.advancedSignalProcessor;
  }

  getPriorityRanker(): PriorityRanker {
    return this.priorityRanker;
  }

  /**
   * Process an urgent need that requires immediate attention
   */
  private async processUrgentNeed(need: any): Promise<void> {
    console.log(
      `🚨 Processing urgent need: ${need.type} (urgency: ${need.urgency})`
    );

    try {
      // For urgent needs, bypass normal processing and go straight to execution
      const urgentTask: CognitiveTask = {
        id: uuidv4(),
        type: need.type as
          | 'planning'
          | 'reasoning'
          | 'social'
          | 'reactive'
          | 'exploration',
        priority: 0.9, // Very high priority
        urgency: need.urgency,
        complexity: 'simple',
        deadline: Date.now() + 1000, // 1 second deadline
        context: this.getCurrentContext(),
      };

      // Execute immediately without queuing
      const routing: RoutingDecision = {
        selectedModule: urgentTask.type as ModuleType,
        confidence: 1.0,
        reasoning: 'urgent_task',
        alternatives: [],
        processingTime: 100,
        riskAssessment: 'low',
        timestamp: Date.now(),
      };
      const result = await this.executeTask(urgentTask, routing);
      console.log(`✅ Urgent need processed: ${need.type} -> ${result}`);

      // Emit event for monitoring
      this.emit('urgentNeedProcessed', {
        need: need.type,
        urgency: need.urgency,
        result,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`❌ Failed to process urgent need ${need.type}:`, error);
      this.emit('urgentNeedFailed', {
        need: need.type,
        urgency: need.urgency,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Process a high-priority need
   */
  private async processHighPriorityNeed(need: any): Promise<void> {
    console.log(
      `⚡ Processing high-priority need: ${need.type} (urgency: ${need.urgency})`
    );

    try {
      // Create high-priority task
      const highPriorityTask: CognitiveTask = {
        id: uuidv4(),
        type: need.type as
          | 'planning'
          | 'reasoning'
          | 'social'
          | 'reactive'
          | 'exploration',
        priority: 0.7, // High priority
        urgency: need.urgency,
        complexity: 'simple',
        deadline: Date.now() + 5000, // 5 second deadline
        context: this.getCurrentContext(),
      };

      // Add to front of processing queue
      this.taskQueue.unshift(highPriorityTask);

      // Process if not currently processing
      if (!this.isProcessing) {
        await this.processNextTask();
      }

      console.log(`✅ High-priority need queued: ${need.type}`);
    } catch (error) {
      console.error(
        `❌ Failed to process high-priority need ${need.type}:`,
        error
      );
    }
  }

  /**
   * Get current system context for need processing
   */
  private getCurrentNeedContext(): NeedContext {
    return {
      timeOfDay: this.getTimeOfDay(),
      location: this.getCurrentLocation(),
      socialContext: this.getCurrentSocialContext(),
      environmentalFactors: this.getEnvironmentalFactors(),
      recentEvents: this.getRecentEvents(),
      currentGoals: this.getCurrentGoals(),
      availableResources: this.getAvailableResources(),
    };
  }

  /**
   * Get current system context for task processing
   */
  private getCurrentTaskContext(): TaskContext {
    return {
      environment: this.getCurrentEnvironment(),
      socialContext: this.getCurrentSocialContext(),
      currentGoals: this.getCurrentGoals(),
      recentEvents: this.getRecentEvents(),
      availableResources: this.getAvailableResources(),
      constraints: this.getCurrentConstraints(),
      opportunities: this.getCurrentOpportunities(),
      timeOfDay: this.getTimeOfDay(),
      energyLevel: this.getCurrentEnergyLevel(),
      stressLevel: this.getCurrentStressLevel(),
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  private getCurrentContext(): Record<string, any> {
    return {
      systemLoad: this.getSystemLoad(),
      activeTasks: this.taskQueue.length,
      urgentNeeds: this.signalProcessor
        .getCurrentNeeds()
        .filter((n) => n.urgency > 0.7).length,
      timestamp: Date.now(),
    };
  }

  // Helper methods for context creation
  private getTimeOfDay(): TimeOfDay {
    const hour = new Date().getHours();
    if (hour < 6) return TimeOfDay.DAWN;
    if (hour < 12) return TimeOfDay.MORNING;
    if (hour < 15) return TimeOfDay.NOON;
    if (hour < 18) return TimeOfDay.AFTERNOON;
    if (hour < 20) return TimeOfDay.DUSK;
    return TimeOfDay.NIGHT;
  }

  private getCurrentLocation(): LocationType {
    return LocationType.VILLAGE; // Default for now
  }

  private getCurrentSocialContext(): SocialContext {
    return SocialContext.ALONE; // Default for now
  }

  private getEnvironmentalFactors(): EnvironmentalFactor[] {
    return []; // Default for now - would include weather, lighting, etc.
  }

  private getRecentEvents(): string[] {
    return []; // Default for now
  }

  private getCurrentGoals(): string[] {
    return []; // Default for now
  }

  private getAvailableResources(): string[] {
    return ['time', 'attention']; // Default for now
  }

  private getCurrentEnvironment(): string {
    return 'normal'; // Default for now
  }

  private getCurrentConstraints(): string[] {
    return []; // Default for now
  }

  private getCurrentOpportunities(): string[] {
    return []; // Default for now
  }

  private getCurrentEnergyLevel(): number {
    return 0.8; // Default for now
  }

  private getCurrentStressLevel(): number {
    return 0.3; // Default for now
  }

  /**
   * Get current system load for context
   */
  private getSystemLoad(): number {
    // Simple system load calculation based on active tasks and memory
    const activeTasks = this.taskQueue.length;
    const memoryUsage = process.memoryUsage();
    const memoryLoad = memoryUsage.heapUsed / memoryUsage.heapTotal;

    return Math.min(1.0, activeTasks * 0.1 + memoryLoad);
  }

  /**
   * Process the next task in the queue
   */
  private async processNextTask(): Promise<void> {
    if (this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    try {
      const task = this.taskQueue.shift();
      if (task) {
        await this.processTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single task
   */
  private async processTask(task: CognitiveTask): Promise<void> {
    try {
      // Find appropriate module for the task
      const module = this.registeredModules.get(task.type as ModuleType);
      if (module) {
        await module.process(task, 1000); // 1 second budget
      }
    } catch (error) {
      console.error('Error processing task:', error);
    }
  }

  /**
   * Get current arbiter state for redundancy synchronization
   */
  getState(): any {
    return {
      running: this.running,
      currentTask: this.currentTask,
      taskQueue: this.taskQueue,
      registeredModules: Array.from(this.registeredModules.keys()),
      totalSignalsProcessed: this.totalSignalsProcessed,
      lastSignalTime: this.lastSignalTime,
      enhancedNeedTaskCount: this.enhancedNeedTaskCount,
    };
  }

  /**
   * Sync state from primary arbiter for redundancy
   */
  syncState(state: any): void {
    // In a more advanced implementation, this would sync state from primary
    // For now, just log the sync operation
    console.log('🔄 Syncing state from primary arbiter');
  }

  /**
   * Shutdown the arbiter and clean up resources
   */
  async shutdown(): Promise<void> {
    if (this.processLoopInterval) {
      clearInterval(this.processLoopInterval);
      this.processLoopInterval = undefined;
    }

    this.running = false;
    this.emit('state-changed', 'stopped');

    // Shutdown subsystems
    try {
      await this.signalProcessor.shutdown();
    } catch (error) {
      console.error('Error shutting down signal processor:', error);
    }

    try {
      await this.performanceMonitor.shutdown();
    } catch (error) {
      console.error('Error shutting down performance monitor:', error);
    }
  }
}

// Export types for hybrid HRM integration
export type { CognitiveTask, TaskSignature };
export { ModuleType };

/**
 * Redundant Arbiter Manager
 *
 * Manages multiple Arbiter instances to prevent single points of failure
 * Implements automatic failover, load balancing, and state synchronization
 */
export class RedundantArbiterManager extends EventEmitter {
  private instances: Map<string, Arbiter> = new Map();
  private primaryInstanceId: string | null = null;
  private heartbeatInterval?: NodeJS.Timeout;
  private stateSyncInterval?: NodeJS.Timeout;
  private lastHeartbeatTimes = new Map<string, number>();
  private loadMetrics = new Map<string, number>();
  private taskCounter = 0;

  constructor(
    private config: ArbiterConfig,
    private redundancyConfig: ArbiterConfig['redundancy']
  ) {
    super();
    this.initializeRedundantSystem();
  }

  private async initializeRedundantSystem(): Promise<void> {
    if (!this.redundancyConfig.enabled) {
      console.log('🔄 Redundant arbiter system disabled');
      return;
    }

    console.log(
      `🔄 Initializing redundant arbiter system with ${this.redundancyConfig.instanceCount} instances`
    );

    // Create multiple arbiter instances
    for (let i = 0; i < this.redundancyConfig.instanceCount; i++) {
      const instanceId = `arbiter-${i}`;
      const arbiter = new Arbiter({
        ...this.config,
        id: instanceId,
        redundancyMode: true,
      });

      this.instances.set(instanceId, arbiter);
      this.lastHeartbeatTimes.set(instanceId, Date.now());
      this.loadMetrics.set(instanceId, 0);

      // Set up health monitoring for this instance
      this.setupInstanceHealthMonitoring(instanceId, arbiter);
    }

    // Select primary instance (least-loaded or first)
    this.selectPrimaryInstance();

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();

    // Start state synchronization
    this.startStateSynchronization();

    console.log(
      `✅ Redundant arbiter system initialized. Primary: ${this.primaryInstanceId}`
    );
  }

  private setupInstanceHealthMonitoring(
    instanceId: string,
    arbiter: Arbiter
  ): void {
    // Monitor arbiter health
    arbiter.on('performance-update', (metrics) => {
      this.updateLoadMetrics(instanceId, metrics);
    });

    // Monitor arbiter errors
    arbiter.on('error', (error: any) => {
      console.error(`🚨 Arbiter instance ${instanceId} error:`, error);
      this.handleInstanceFailure(instanceId);
    });

    // Monitor arbiter state changes
    arbiter.on('state-changed', (state: string) => {
      if (instanceId === this.primaryInstanceId && state !== 'running') {
        console.warn(
          `⚠️ Primary arbiter ${instanceId} state changed to: ${state}`
        );
        this.handlePrimaryFailure();
      }
    });
  }

  private updateLoadMetrics(instanceId: string, metrics: any): void {
    // Calculate load based on performance metrics
    const load = this.calculateInstanceLoad(metrics);
    this.loadMetrics.set(instanceId, load);
  }

  private calculateInstanceLoad(metrics: any): number {
    // Simple load calculation based on signal processing rate and latency
    const signalRate = metrics.signalsPerSecond || 0;
    const avgLatency = metrics.averageLatency || 0;
    return signalRate * 0.3 + avgLatency * 0.7;
  }

  private selectPrimaryInstance(): void {
    if (this.instances.size === 0) {
      throw new Error('No arbiter instances available for primary selection');
    }

    // Select primary based on load balancing strategy
    let primaryId: string;

    switch (this.redundancyConfig.loadBalancingStrategy) {
      case 'round-robin':
        primaryId = this.selectRoundRobinPrimary();
        break;
      case 'least-loaded':
        primaryId = this.selectLeastLoadedPrimary();
        break;
      case 'random':
        primaryId = this.selectRandomPrimary();
        break;
      default:
        const firstKey = this.instances.keys().next().value;
        if (!firstKey) throw new Error('No arbiter instances available');
        primaryId = firstKey;
    }

    this.primaryInstanceId = primaryId;
    console.log(`🎯 Selected primary arbiter: ${primaryId}`);
  }

  private selectRoundRobinPrimary(): string {
    const ids = Array.from(this.instances.keys());
    this.taskCounter = (this.taskCounter + 1) % ids.length;
    return ids[this.taskCounter];
  }

  private selectLeastLoadedPrimary(): string {
    let leastLoadedId = Array.from(this.instances.keys())[0];
    let minLoad = Infinity;

    for (const [id, load] of this.loadMetrics) {
      if (load < minLoad) {
        minLoad = load;
        leastLoadedId = id;
      }
    }

    return leastLoadedId;
  }

  private selectRandomPrimary(): string {
    const ids = Array.from(this.instances.keys());
    return ids[Math.floor(Math.random() * ids.length)];
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.redundancyConfig.heartbeatInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const now = Date.now();

    for (const [instanceId, arbiter] of this.instances) {
      const lastHeartbeat = this.lastHeartbeatTimes.get(instanceId) || 0;
      const timeSinceLastHeartbeat = now - lastHeartbeat;

      if (timeSinceLastHeartbeat > this.redundancyConfig.failoverTimeout) {
        console.warn(
          `🚨 Arbiter instance ${instanceId} missed heartbeat (${timeSinceLastHeartbeat}ms)`
        );
        this.handleInstanceFailure(instanceId);
      }
    }
  }

  private handleInstanceFailure(instanceId: string): void {
    console.error(`💀 Arbiter instance ${instanceId} failed`);

    // Remove failed instance
    this.instances.delete(instanceId);
    this.lastHeartbeatTimes.delete(instanceId);
    this.loadMetrics.delete(instanceId);

    // If primary failed, select new primary
    if (instanceId === this.primaryInstanceId) {
      this.handlePrimaryFailure();
    }

    // Emit failure event
    this.emit('instance-failed', { instanceId, timestamp: Date.now() });
  }

  private handlePrimaryFailure(): void {
    console.warn('🚨 Primary arbiter failed, selecting new primary');

    if (this.instances.size > 0) {
      this.selectPrimaryInstance();
      this.emit('primary-failed', {
        oldPrimary: this.primaryInstanceId,
        newPrimary: this.primaryInstanceId,
        timestamp: Date.now(),
      });
    } else {
      console.error('💥 All arbiter instances failed!');
      this.emit('system-failure', { timestamp: Date.now() });
    }
  }

  private startStateSynchronization(): void {
    this.stateSyncInterval = setInterval(() => {
      this.synchronizeState();
    }, this.redundancyConfig.stateSyncInterval);
  }

  private synchronizeState(): void {
    if (
      !this.primaryInstanceId ||
      !this.instances.has(this.primaryInstanceId)
    ) {
      return;
    }

    const primaryArbiter = this.instances.get(this.primaryInstanceId);
    if (!primaryArbiter) return;

    // Get state from primary
    const primaryState = primaryArbiter.getState();

    // Sync state to backup instances
    for (const [instanceId, arbiter] of this.instances) {
      if (instanceId !== this.primaryInstanceId) {
        try {
          arbiter.syncState(primaryState);
        } catch (error) {
          console.error(
            `Failed to sync state to backup arbiter ${instanceId}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Route task to appropriate arbiter instance
   */
  async routeTask(task: CognitiveTask): Promise<RoutingDecision> {
    if (!this.redundancyConfig.enabled) {
      const primaryArbiter = this.instances.get(this.primaryInstanceId || '');
      if (!primaryArbiter) throw new Error('No primary arbiter available');
      return primaryArbiter.routeTask(task);
    }

    // Select arbiter based on load balancing strategy
    const targetInstanceId = this.selectTargetInstance();
    const targetArbiter = this.instances.get(targetInstanceId);

    if (!targetArbiter) {
      throw new Error(`Target arbiter ${targetInstanceId} not found`);
    }

    return targetArbiter.routeTask(task);
  }

  private selectTargetInstance(): string {
    if (!this.primaryInstanceId) {
      this.selectPrimaryInstance();
    }

    // For now, always use primary for consistency
    // In a more advanced implementation, we could distribute based on load
    return this.primaryInstanceId!;
  }

  /**
   * Get current system status
   */
  getStatus(): {
    totalInstances: number;
    activeInstances: number;
    primaryInstanceId: string | null;
    instanceHealth: Record<string, boolean>;
    loadDistribution: Record<string, number>;
  } {
    const instanceHealth: Record<string, boolean> = {};
    const loadDistribution: Record<string, number> = {};

    for (const [instanceId, arbiter] of this.instances) {
      instanceHealth[instanceId] = arbiter.getState() === 'running';
      loadDistribution[instanceId] = this.loadMetrics.get(instanceId) || 0;
    }

    return {
      totalInstances: this.redundancyConfig.instanceCount,
      activeInstances: this.instances.size,
      primaryInstanceId: this.primaryInstanceId,
      instanceHealth,
      loadDistribution,
    };
  }

  /**
   * Shutdown the redundant system
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.stateSyncInterval) {
      clearInterval(this.stateSyncInterval);
    }

    // Shutdown all instances
    for (const [instanceId, arbiter] of this.instances) {
      try {
        await arbiter.shutdown();
      } catch (error) {
        console.error(`Error shutting down arbiter ${instanceId}:`, error);
      }
    }

    this.instances.clear();
    this.primaryInstanceId = null;
  }
}

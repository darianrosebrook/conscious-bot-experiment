/**
 * Arbiter - Central control system for the conscious bot
 *
 * Orchestrates signal processing, task routing, and module coordination
 * while enforcing real-time performance constraints and safety measures.
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
import {
  AdvancedNeedGenerator,
  NeedType,
  TrendDirection,
} from './advanced-need-generator';
import { GoalTemplateManager } from './goal-template-manager';
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
  validateSignal,
  validateCognitiveTask,
  validateArbiterConfig,
} from './types';

export interface ArbiterOptions {
  config?: Partial<ArbiterConfig>;
  signalConfig?: typeof DEFAULT_SIGNAL_CONFIG;
  performanceConfig?: typeof DEFAULT_PERFORMANCE_CONFIG;
  debugMode?: boolean;
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
      return task.priority > 0.8 || signature.timeConstraint < 100;
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
  private signalProcessor: SignalProcessor;
  private performanceMonitor: PerformanceMonitor;
  private advancedNeedGenerator: AdvancedNeedGenerator;
  private goalTemplateManager: GoalTemplateManager;
  private advancedSignalProcessor: AdvancedSignalProcessor;
  private priorityRanker: PriorityRanker;
  private registeredModules = new Map<ModuleType, CognitiveModule>();
  private currentTask: CognitiveTask | null = null;
  private running = false;
  private processLoopInterval?: NodeJS.Timeout;
  private totalSignalsProcessed = 0;
  private lastSignalTime = 0;

  constructor(options: ArbiterOptions = {}) {
    super();

    this.config = { ...DEFAULT_ARBITER_CONFIG, ...options.config };
    validateArbiterConfig(this.config);

    // Initialize subsystems
    this.signalProcessor = new SignalProcessor(options.signalConfig);
    this.performanceMonitor = new PerformanceMonitor(options.performanceConfig);
    this.advancedNeedGenerator = new AdvancedNeedGenerator();
    this.goalTemplateManager = new GoalTemplateManager();
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
            type: need.type as any, // NeedType enum
            intensity: need.urgency,
            urgency: need.urgency,
            trend: 'stable' as any, // TrendDirection enum
            trendStrength: 0.5,
            context: this.getCurrentContext(),
            memoryInfluence: 0.5,
            noveltyScore: 0.5,
            commitmentBoost: 0.5,
            timestamp: need.lastUpdated,
            history: [],
          }));

        const enhancedNeeds =
          await this.advancedNeedGenerator.generateEnhancedNeeds(
            baseNeeds,
            this.getCurrentContext(),
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

        // TODO: Enhanced needs generated - integrate with decision making system
        // Note: Signal processor needs are managed internally
        console.log('TODO: IMPLEMENT... enhancedNeeds', enhancedNeeds);
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
  private routeTask(task: CognitiveTask): RoutingDecision {
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
      symbolicPreconditions: hasSymbolic ? 0.8 : 0.2,
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
        score += signature.timeConstraint < 100 ? 0.4 : 0;
        break;

      case ModuleType.HRM:
        score += signature.symbolicPreconditions * 0.4;
        score += signature.requiresPlanning ? 0.3 : 0;
        score -= signature.socialContent ? 0.2 : 0; // HRM not great at social
        break;

      case ModuleType.LLM:
        score += signature.socialContent ? 0.4 : 0;
        score += signature.ambiguousContext ? 0.3 : 0;
        score -= signature.timeConstraint < 200 ? 0.3 : 0; // LLM is slower
        break;

      case ModuleType.GOAP:
        score += signature.requiresPlanning ? 0.3 : 0;
        score += task.priority > 0.5 ? 0.2 : 0;
        break;
    }

    // Adjust for estimated processing time vs available budget
    const estimatedTime = module.estimateProcessingTime(task);
    if (estimatedTime <= signature.timeConstraint) {
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
        trend: 'stable' as TrendDirection, // TrendDirection enum
        trendStrength: 0.5,
        context: this.getCurrentContext(),
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
          this.getCurrentContext(),
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
      const ranking = await this.priorityRanker.rankTasks(
        priorityTasks,
        this.getCurrentContext()
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
  } {
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
   * Get current context for advanced components
   */
  private getCurrentContext() {
    return {
      timeOfDay: 'morning' as any, // TimeOfDay enum
      location: 'village' as any, // LocationType enum
      socialContext: 'alone' as any, // SocialContext enum
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

  getGoalTemplateManager(): GoalTemplateManager {
    return this.goalTemplateManager;
  }

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
        type: need.type,
        priority: 0.9, // Very high priority
        urgency: need.urgency,
        deadline: Date.now() + 1000, // 1 second deadline
        context: this.getCurrentContext(),
        requirements: [],
        constraints: ['immediate_execution'],
      };

      // Execute immediately without queuing
      const result = await this.executeTask(urgentTask);
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
        type: need.type,
        priority: 0.7, // High priority
        urgency: need.urgency,
        deadline: Date.now() + 5000, // 5 second deadline
        context: this.getCurrentContext(),
        requirements: [],
        constraints: ['high_priority'],
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
   * Get current system context for task processing
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
}

// Export types for hybrid HRM integration
export type { CognitiveTask, TaskSignature };
export { ModuleType };

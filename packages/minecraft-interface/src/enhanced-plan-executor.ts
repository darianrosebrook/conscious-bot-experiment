/**
 * Enhanced Plan Executor: Integrates MCP Capabilities with Minecraft Execution
 *
 * Extends the existing plan executor to support MCP capabilities, providing
 * dynamic behavior creation and execution in Minecraft environments.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { Bot } from 'mineflayer';
import {
  HybridSkillPlanner,
  HybridPlanningContext,
  HybridPlan,
} from '@conscious-bot/planning';
import { EnhancedRegistry, ShadowRunResult } from '@conscious-bot/core';
import { DynamicCreationFlow } from '@conscious-bot/core';
import { BotAdapter } from './bot-adapter';
import { ObservationMapper } from './observation-mapper';
import { ActionTranslator } from './action-translator';
import {
  BotConfig,
  PlanExecutionResult,
  ActionResult,
  ScenarioTelemetry,
  PerformanceMetrics,
} from './types';

// ============================================================================
// Types
// ============================================================================

export interface MCPCapabilityExecutionResult extends ActionResult {
  capabilityId: string;
  shadowRunResult?: ShadowRunResult;
  worldStateChanges: Record<string, any>;
  telemetry: {
    executionType: 'shadow' | 'active';
    duration: number;
    success: boolean;
    error?: string;
  };
}

export interface EnhancedPlanExecutionResult extends PlanExecutionResult {
  mcpCapabilitiesUsed: string[];
  shadowRunResults: ShadowRunResult[];
  dynamicCapabilitiesCreated: string[];
  worldStateChanges: Record<string, any>;
}

// ============================================================================
// Enhanced Plan Executor Implementation
// ============================================================================

export class EnhancedPlanExecutor extends EventEmitter {
  private botAdapter: BotAdapter;
  private observationMapper: ObservationMapper;
  private actionTranslator: ActionTranslator | null = null;
  private hybridPlanner: HybridSkillPlanner;
  private mcpRegistry: EnhancedRegistry;
  private mcpDynamicFlow: DynamicCreationFlow;
  private config: BotConfig;

  private currentPlan: HybridPlan | null = null;
  private currentStepIndex = 0;
  private isExecuting = false;
  private executionStartTime = 0;
  private performanceMetrics: PerformanceMetrics;

  constructor(
    config: BotConfig,
    hybridPlanner: HybridSkillPlanner,
    mcpRegistry: EnhancedRegistry,
    mcpDynamicFlow: DynamicCreationFlow
  ) {
    super();

    this.config = config;
    this.hybridPlanner = hybridPlanner;
    this.mcpRegistry = mcpRegistry;
    this.mcpDynamicFlow = mcpDynamicFlow;
    this.botAdapter = new BotAdapter(config);
    this.observationMapper = new ObservationMapper(config);

    this.performanceMetrics = {
      startTime: Date.now(),
      operations: {},
    };

    // Handle error events to prevent unhandled errors
    this.on('error', (error) => {
      console.error('EnhancedPlanExecutor error:', error);
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize connection and setup action translator
   */
  async initialize(): Promise<void> {
    const bot = await this.botAdapter.connect();

    // Wait for bot to be fully spawned before creating ActionTranslator
    await new Promise<void>((resolve) => {
      if (bot.entity && bot.entity.position) {
        resolve();
      } else {
        bot.once('spawn', () => resolve());
      }
    });

    this.actionTranslator = new ActionTranslator(bot, this.config);

    this.emit('initialized', {
      bot: this.botAdapter.getStatus(),
      timestamp: Date.now(),
    });
  }

  /**
   * Execute a complete planning and execution cycle with MCP capabilities
   */
  async executePlanningCycle(
    goal: string,
    initialSignals: any[] = []
  ): Promise<EnhancedPlanExecutionResult> {
    if (!this.actionTranslator) {
      throw new Error(
        'EnhancedPlanExecutor not initialized. Call initialize() first.'
      );
    }

    this.isExecuting = true;
    this.executionStartTime = Date.now();

    const mcpCapabilitiesUsed: string[] = [];
    const shadowRunResults: ShadowRunResult[] = [];
    const dynamicCapabilitiesCreated: string[] = [];
    const worldStateChanges: Record<string, any> = {};

    try {
      const bot = this.botAdapter.getBot();

      // Step 1: Generate comprehensive signals from current world state
      const minecraftSignals = this.observationMapper.generateSignals(bot);
      const allSignals = [...initialSignals, ...minecraftSignals];

      this.emit('signalsGenerated', {
        initialSignals,
        minecraftSignals,
        totalSignals: allSignals.length,
        timestamp: Date.now(),
      });

      // Step 2: Create enhanced planning context with MCP capabilities
      const context = this.createEnhancedPlanningContext(bot, allSignals);

      // Step 3: Generate plan using hybrid planner with MCP capabilities
      const planningResult = await this.hybridPlanner.plan(goal, context);
      this.currentPlan = planningResult.plan;
      this.currentStepIndex = 0;

      this.emit('planGenerated', {
        plan: this.currentPlan,
        planningResult,
        signalsProcessed: allSignals.length,
        planningLatency: planningResult.latency,
        timestamp: Date.now(),
      });

      // Step 4: Execute plan with MCP capabilities support
      if (!this.currentPlan) {
        throw new Error('No plan available for execution');
      }

      const executionResult = await this.executeEnhancedPlan(
        this.currentPlan,
        context
      );

      // Step 5: Record comprehensive telemetry
      const telemetry = this.generateEnhancedTelemetry(
        planningResult,
        executionResult
      );

      this.emit('executionComplete', {
        result: executionResult,
        telemetry,
        signalsUsed: allSignals,
        mcpCapabilitiesUsed,
        shadowRunResults,
        dynamicCapabilitiesCreated,
        finalHomeostasis:
          this.observationMapper.getEnhancedHomeostasisState(bot),
        timestamp: Date.now(),
      });

      return {
        ...executionResult,
        mcpCapabilitiesUsed,
        shadowRunResults,
        dynamicCapabilitiesCreated,
        worldStateChanges,
      };
    } finally {
      this.isExecuting = false;
      this.currentPlan = null;
      this.currentStepIndex = 0;
    }
  }

  /**
   * Create enhanced planning context with MCP capabilities
   */
  private createEnhancedPlanningContext(
    bot: Bot,
    signals: any[]
  ): HybridPlanningContext {
    const baseContext =
      this.observationMapper.mapBotStateToPlanningContext(bot);

    return {
      ...baseContext,
      mcpRegistry: this.mcpRegistry,
      mcpDynamicFlow: this.mcpDynamicFlow,
      worldState: {
        botPosition: bot.entity?.position
          ? {
              x: Math.floor(bot.entity.position.x),
              y: Math.floor(bot.entity.position.y),
              z: Math.floor(bot.entity.position.z),
            }
          : { x: 0, y: 64, z: 0 },
        hasTorches: this.hasItem(bot, 'torch'),
        lightLevel: this.getLightLevel(bot),
        isUnderground: this.isUnderground(bot),
        health: bot.health || 20,
        food: bot.food || 20,
        inventory: this.getInventorySummary(bot),
      },
      availableResources: this.getAvailableResources(bot),
      timeConstraints: {
        urgency: this.determineUrgency(signals),
        maxPlanningTime: 10000,
      },
      planningPreferences: {
        preferSkills: false,
        preferMCP: true,
        preferHTN: true,
        preferGOAP: true,
        allowHybrid: true,
      },
    };
  }

  /**
   * Execute enhanced plan with MCP capabilities support
   */
  async executeEnhancedPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<EnhancedPlanExecutionResult> {
    const actionResults: ActionResult[] = [];
    const mcpCapabilitiesUsed: string[] = [];
    const shadowRunResults: ShadowRunResult[] = [];
    const dynamicCapabilitiesCreated: string[] = [];
    const worldStateChanges: Record<string, any> = {};

    this.recordOperation('enhancedPlanExecution', () => {});

    try {
      // Execute based on planning approach
      switch (plan.planningApproach) {
        case 'mcp-capabilities':
          const mcpResult = await this.executeMCPCapabilityPlan(plan, context);
          mcpCapabilitiesUsed.push(...mcpResult.completedSteps);
          shadowRunResults.push(...mcpResult.shadowRunResults);
          Object.assign(worldStateChanges, mcpResult.worldStateChanges);
          break;

        case 'skill-based':
          const skillResult = await this.executeSkillPlan(plan, context);
          actionResults.push(...skillResult);
          break;

        case 'htn':
          const htnResult = await this.executeHTNPlan(plan, context);
          actionResults.push(...htnResult);
          break;

        case 'goap':
          const goapResult = await this.executeGOAPPlan(plan, context);
          actionResults.push(...goapResult);
          break;

        case 'hybrid':
          const hybridResult = await this.executeHybridPlan(plan, context);
          actionResults.push(...hybridResult);
          break;

        default:
          throw new Error(
            `Unknown planning approach: ${plan.planningApproach}`
          );
      }

      const totalDuration = Date.now() - this.executionStartTime;

      return {
        success: actionResults.every((result) => result.success),
        actionResults,
        totalDuration,
        stepsCompleted: actionResults.length,
        stepsFailed: actionResults.filter((result) => !result.success).length,
        mcpCapabilitiesUsed,
        shadowRunResults,
        dynamicCapabilitiesCreated,
        worldStateChanges,
      };
    } catch (error) {
      console.error('Enhanced plan execution failed:', error);
      return {
        success: false,
        actionResults,
        totalDuration: Date.now() - this.executionStartTime,
        stepsCompleted: actionResults.length,
        stepsFailed: actionResults.length + 1,
        error: String(error),
        mcpCapabilitiesUsed,
        shadowRunResults,
        dynamicCapabilitiesCreated,
        worldStateChanges,
      };
    }
  }

  /**
   * Execute MCP capability plan
   */
  private async executeMCPCapabilityPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<{
    completedSteps: string[];
    shadowRunResults: ShadowRunResult[];
    worldStateChanges: Record<string, any>;
  }> {
    if (!plan.mcpCapabilityPlan) {
      throw new Error('No MCP capability plan available');
    }

    const completedSteps: string[] = [];
    const shadowRunResults: ShadowRunResult[] = [];
    const worldStateChanges: Record<string, any> = {};

    for (const nodeId of plan.mcpCapabilityPlan.executionOrder) {
      const node = plan.mcpCapabilityPlan.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'action') continue;

      const capabilityDecomp =
        plan.mcpCapabilityPlan.capabilityDecomposition.find(
          (cd) => cd.capabilityId === node.metadata?.capabilityId
        );
      if (!capabilityDecomp) continue;

      this.emit('mcpCapabilityStarted', {
        capabilityId: capabilityDecomp.capabilityId,
        name: capabilityDecomp.name,
        status: capabilityDecomp.status,
        timestamp: Date.now(),
      });

      try {
        if (capabilityDecomp.status === 'shadow') {
          // Execute shadow run
          const shadowResult = await this.mcpRegistry.executeShadowRun(
            capabilityDecomp.capabilityId,
            this.createLeafContext()
          );
          shadowRunResults.push(shadowResult);

          if (shadowResult.status === 'success') {
            completedSteps.push(capabilityDecomp.capabilityId);
            this.emit('mcpCapabilityCompleted', {
              capabilityId: capabilityDecomp.capabilityId,
              executionType: 'shadow',
              duration: shadowResult.durationMs,
              timestamp: Date.now(),
            });
          }
        } else if (capabilityDecomp.status === 'active') {
          // Execute active capability
          const executionResult = await this.executeActiveCapability(
            capabilityDecomp,
            context
          );

          if (executionResult.success) {
            completedSteps.push(capabilityDecomp.capabilityId);
            Object.assign(worldStateChanges, executionResult.worldStateChanges);

            this.emit('mcpCapabilityCompleted', {
              capabilityId: capabilityDecomp.capabilityId,
              executionType: 'active',
              duration: executionResult.duration,
              timestamp: Date.now(),
            });
          }
        }
      } catch (error) {
        console.error(
          `MCP capability execution failed: ${capabilityDecomp.capabilityId}`,
          error
        );
        this.emit('mcpCapabilityFailed', {
          capabilityId: capabilityDecomp.capabilityId,
          error: String(error),
          timestamp: Date.now(),
        });
      }
    }

    return {
      completedSteps,
      shadowRunResults,
      worldStateChanges,
    };
  }

  /**
   * Execute active capability in Minecraft
   */
  private async executeActiveCapability(
    capability: any,
    context: HybridPlanningContext
  ): Promise<{
    success: boolean;
    duration: number;
    worldStateChanges: Record<string, any>;
  }> {
    const startTime = Date.now();
    const bot = this.botAdapter.getBot();

    try {
      // This would integrate with the actual Minecraft execution system
      // For now, we'll simulate successful execution
      const success = true;
      const worldStateChanges = {
        position: bot.entity?.position
          ? {
              x: Math.floor(bot.entity.position.x),
              y: Math.floor(bot.entity.position.y),
              z: Math.floor(bot.entity.position.z),
            }
          : { x: 0, y: 64, z: 0 },
        lightLevel: this.getLightLevel(bot),
      };

      return {
        success,
        duration: Date.now() - startTime,
        worldStateChanges,
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        worldStateChanges: {},
      };
    }
  }

  /**
   * Create leaf context for MCP capabilities
   */
  private createLeafContext() {
    const bot = this.botAdapter.getBot();

    return {
      bot: {
        position: bot.entity?.position
          ? {
              x: Math.floor(bot.entity.position.x),
              y: Math.floor(bot.entity.position.y),
              z: Math.floor(bot.entity.position.z),
            }
          : { x: 0, y: 64, z: 0 },
        health: bot.health || 20,
        food: bot.food || 20,
        inventory: this.getInventorySummary(bot),
      },
      abortSignal: new AbortController().signal,
      now: () => performance.now(),
      snapshot: async () => ({
        position: bot.entity?.position
          ? {
              x: Math.floor(bot.entity.position.x),
              y: Math.floor(bot.entity.position.y),
              z: Math.floor(bot.entity.position.z),
            }
          : { x: 0, y: 64, z: 0 },
        lightLevel: this.getLightLevel(bot),
      }),
      inventory: async () => ({ items: this.getInventorySummary(bot) }),
      emitMetric: (name: string, value: number) => {
        this.emit('metric', { name, value, timestamp: Date.now() });
      },
      emitError: (error: any) => {
        this.emit('error', error);
      },
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private hasItem(bot: Bot, itemName: string): boolean {
    return bot.inventory.items().some((item) => item.name === itemName);
  }

  private getLightLevel(bot: Bot): number {
    // This would need to be implemented based on the actual Minecraft API
    return 8; // Default light level
  }

  private isUnderground(bot: Bot): boolean {
    const y = bot.entity?.position?.y || 64;
    return y < 64;
  }

  private getInventorySummary(bot: Bot): Record<string, number> {
    const summary: Record<string, number> = {};
    bot.inventory.items().forEach((item) => {
      summary[item.name] = (summary[item.name] || 0) + item.count;
    });
    return summary;
  }

  private getAvailableResources(bot: Bot): Record<string, number> {
    return {
      torches: this.getInventorySummary(bot).torch || 0,
      buildingBlocks: this.getInventorySummary(bot).cobblestone || 0,
      food: this.getInventorySummary(bot).bread || 0,
    };
  }

  private determineUrgency(
    signals: any[]
  ): 'low' | 'medium' | 'high' | 'emergency' {
    // Simple urgency determination based on signals
    if (
      signals.some(
        (signal) => signal.type === 'danger' || signal.type === 'hostile'
      )
    ) {
      return 'emergency';
    }
    if (signals.some((signal) => signal.type === 'warning')) {
      return 'high';
    }
    return 'medium';
  }

  private setupEventHandlers(): void {
    this.botAdapter.on('connected', (data) => {
      this.emit('botConnected', data);
    });

    this.botAdapter.on('spawned', (data) => {
      this.emit('botSpawned', data);
    });

    this.botAdapter.on('error', (data) => {
      this.emit('botError', data);
    });
  }

  private recordOperation(operation: string, fn: () => void): void {
    const startTime = Date.now();
    fn();
    const duration = Date.now() - startTime;

    if (!this.performanceMetrics.operations[operation]) {
      this.performanceMetrics.operations[operation] = [];
    }
    this.performanceMetrics.operations[operation].push(duration);
  }

  private generateEnhancedTelemetry(
    planningResult: any,
    executionResult: EnhancedPlanExecutionResult
  ): ScenarioTelemetry {
    return {
      planningLatency: planningResult.latency,
      executionLatency: executionResult.totalDuration,
      totalLatency: planningResult.latency + executionResult.totalDuration,
      stepsCompleted: executionResult.stepsCompleted,
      stepsFailed: executionResult.stepsFailed,
      successRate:
        executionResult.stepsCompleted /
        (executionResult.stepsCompleted + executionResult.stepsFailed),
      mcpCapabilitiesUsed: executionResult.mcpCapabilitiesUsed.length,
      shadowRunsExecuted: executionResult.shadowRunResults.length,
      dynamicCapabilitiesCreated:
        executionResult.dynamicCapabilitiesCreated.length,
      performanceMetrics: this.performanceMetrics,
    };
  }

  // Placeholder methods for other plan types
  private async executeSkillPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<ActionResult[]> {
    // Implementation would integrate with existing skill system
    return [];
  }

  private async executeHTNPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<ActionResult[]> {
    // Implementation would integrate with existing HTN system
    return [];
  }

  private async executeGOAPPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<ActionResult[]> {
    // Implementation would integrate with existing GOAP system
    return [];
  }

  private async executeHybridPlan(
    plan: HybridPlan,
    context: HybridPlanningContext
  ): Promise<ActionResult[]> {
    // Implementation would combine multiple planning approaches
    return [];
  }

  /**
   * Get bot status
   */
  getBotStatus() {
    return this.botAdapter.getStatus();
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    this.isExecuting = false;
    await this.botAdapter.disconnect();
  }
}

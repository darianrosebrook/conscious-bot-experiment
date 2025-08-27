/**
 * MCP Capabilities Adapter - Integrates MCP Capabilities with Planning System
 *
 * Bridges the gap between our MCP capabilities system and the existing
 * planning system. Provides capability-based planning that integrates
 * seamlessly with the current HTN/GOAP architecture.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  EnhancedRegistry,
  ShadowRunResult,
} from '../../../../core/src/mcp-capabilities/enhanced-registry';
import {
  DynamicCreationFlow,
  ImpasseResult,
} from '../../../../core/src/mcp-capabilities/dynamic-creation-flow';
import {
  LeafContext,
  ExecError,
} from '../../../../core/src/mcp-capabilities/leaf-contracts';
import {
  Plan,
  PlanNode,
  PlanningContext,
} from '../hierarchical-planner/hrm-inspired-planner';

// ============================================================================
// Types
// ============================================================================

export interface MCPCapabilityPlanningContext extends PlanningContext {
  leafContext: LeafContext;
  availableCapabilities: string[]; // List of capability IDs
  registry: EnhancedRegistry;
  dynamicFlow: DynamicCreationFlow;
  worldState: Record<string, any>;
  goalRequirements: Record<string, any>;
}

export interface MCPCapabilityPlan extends Plan {
  planningApproach: 'mcp-capabilities';
  capabilityDecomposition: CapabilityDecomposition[];
  estimatedCapabilitySuccess: number;
  fallbackCapabilities: string[];
  shadowRunResults?: ShadowRunResult[];
}

export interface CapabilityDecomposition {
  capabilityId: string;
  name: string;
  version: string;
  status: 'shadow' | 'active' | 'retired' | 'revoked';
  preconditions: Record<string, any>;
  postconditions: Record<string, any>;
  estimatedDuration: number;
  priority: number;
  dependencies: string[];
  args: Record<string, any>;
}

export interface CapabilityExecutionResult {
  capabilityId: string;
  success: boolean;
  duration: number;
  worldStateChanges: Record<string, any>;
  error?: ExecError;
  telemetry?: any;
  shadowRunResult?: ShadowRunResult;
}

// ============================================================================
// MCP Capabilities Adapter Implementation
// ============================================================================

export class MCPCapabilitiesAdapter extends EventEmitter {
  private registry: EnhancedRegistry;
  private dynamicFlow: DynamicCreationFlow;
  private executionHistory: CapabilityExecutionResult[] = [];

  constructor(registry: EnhancedRegistry, dynamicFlow: DynamicCreationFlow) {
    super();
    this.registry = registry;
    this.dynamicFlow = dynamicFlow;
  }

  /**
   * Generate a capability-based plan for a given goal
   */
  async generateCapabilityPlan(
    goal: string,
    context: MCPCapabilityPlanningContext
  ): Promise<MCPCapabilityPlan> {
    const planId = `mcp-plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Step 1: Find applicable capabilities for the goal
    const applicableCapabilities = await this.findApplicableCapabilities(
      goal,
      context
    );

    // Step 2: Check for impasse and propose new capabilities if needed
    const impasseResult = this.dynamicFlow.checkImpasse(goal, {
      code: 'unknown',
      detail: 'goal_analysis',
      retryable: false,
    });

    if (impasseResult.isImpasse) {
      console.log(`🔍 Impasse detected for goal: ${goal}`);
      const newCapability = await this.dynamicFlow.proposeNewCapability(
        goal,
        context.leafContext,
        goal,
        []
      );

      if (newCapability) {
        console.log(`✨ Proposed new capability: ${newCapability.name}`);
        applicableCapabilities.push(newCapability.name);
      }
    }

    // Step 3: Decompose goal into capability sequence
    const capabilityDecomposition = this.decomposeGoalIntoCapabilities(
      goal,
      applicableCapabilities,
      context
    );

    // Step 4: Create plan nodes from capabilities
    const planNodes = this.createPlanNodesFromCapabilities(
      capabilityDecomposition,
      planId
    );

    // Step 5: Calculate execution order and dependencies
    const executionOrder = this.calculateExecutionOrder(planNodes);

    // Step 6: Estimate overall success probability
    const estimatedSuccess = this.estimatePlanSuccess(capabilityDecomposition);

    // Step 7: Identify fallback capabilities
    const fallbackCapabilities = this.identifyFallbackCapabilities(
      applicableCapabilities,
      capabilityDecomposition
    );

    const plan: MCPCapabilityPlan = {
      id: planId,
      goalId: goal,
      nodes: planNodes,
      executionOrder,
      confidence: estimatedSuccess,
      estimatedLatency: this.calculateTotalDuration(capabilityDecomposition),
      refinementCount: 0,
      createdAt: Date.now(),
      lastRefinedAt: Date.now(),
      planningApproach: 'mcp-capabilities',
      capabilityDecomposition,
      estimatedCapabilitySuccess: estimatedSuccess,
      fallbackCapabilities,
    };

    return plan;
  }

  /**
   * Execute a capability-based plan
   */
  async executeCapabilityPlan(
    plan: MCPCapabilityPlan,
    context: MCPCapabilityPlanningContext
  ): Promise<{
    success: boolean;
    completedCapabilities: string[];
    failedCapabilities: string[];
    totalDuration: number;
    worldStateChanges: Record<string, any>;
    shadowRunResults: ShadowRunResult[];
  }> {
    const startTime = Date.now();
    const completedCapabilities: string[] = [];
    const failedCapabilities: string[] = [];
    const worldStateChanges: Record<string, any> = {};
    const shadowRunResults: ShadowRunResult[] = [];

    try {
      // Execute capabilities in order
      for (const nodeId of plan.executionOrder) {
        const node = plan.nodes.find((n) => n.id === nodeId);
        if (!node || node.type !== 'action') continue;

        const capabilityDecomp = plan.capabilityDecomposition.find(
          (cd) => cd.capabilityId === node.metadata?.capabilityId
        );
        if (!capabilityDecomp) continue;

        // Check preconditions
        if (
          !this.checkCapabilityPreconditions(
            capabilityDecomp,
            context.worldState
          )
        ) {
          console.warn(
            `⚠️ Preconditions not met for capability: ${capabilityDecomp.capabilityId}`
          );
          failedCapabilities.push(capabilityDecomp.capabilityId);
          continue;
        }

        // Execute capability
        const result = await this.executeCapability(capabilityDecomp, context);

        if (result.success) {
          completedCapabilities.push(capabilityDecomp.capabilityId);
          Object.assign(worldStateChanges, result.worldStateChanges);

          // Update world state for next capabilities
          Object.assign(context.worldState, result.worldStateChanges);

          // Record shadow run result if available
          if (result.shadowRunResult) {
            shadowRunResults.push(result.shadowRunResult);
          }

          // Emit success event
          this.emit('capability-executed', {
            capabilityId: capabilityDecomp.capabilityId,
            success: true,
            duration: result.duration,
          });
        } else {
          failedCapabilities.push(capabilityDecomp.capabilityId);

          // Try fallback capabilities if available
          const fallbackResult = await this.tryFallbackCapabilities(
            plan.fallbackCapabilities,
            capabilityDecomp,
            context
          );

          if (fallbackResult.success) {
            completedCapabilities.push(fallbackResult.capabilityId);
            Object.assign(worldStateChanges, fallbackResult.worldStateChanges);
          }

          // Emit failure event
          this.emit('capability-failed', {
            capabilityId: capabilityDecomp.capabilityId,
            error: result.error,
            duration: result.duration,
          });
        }
      }

      const totalDuration = Date.now() - startTime;

      // Record execution history
      this.executionHistory.push({
        capabilityId: plan.id,
        success: failedCapabilities.length === 0,
        duration: totalDuration,
        worldStateChanges,
        telemetry: {
          completedCapabilities,
          failedCapabilities,
          shadowRunResults,
        },
      });

      return {
        success: failedCapabilities.length === 0,
        completedCapabilities,
        failedCapabilities,
        totalDuration,
        worldStateChanges,
        shadowRunResults,
      };
    } catch (error) {
      console.error('❌ Error executing capability plan:', error);
      return {
        success: false,
        completedCapabilities,
        failedCapabilities,
        totalDuration: Date.now() - startTime,
        worldStateChanges,
        shadowRunResults,
      };
    }
  }

  /**
   * Find applicable capabilities for a goal
   */
  public async findApplicableCapabilities(
    goal: string,
    context: MCPCapabilityPlanningContext
  ): Promise<string[]> {
    const allCapabilities = await this.registry.listCapabilities();
    const applicable: string[] = [];

    for (const capability of allCapabilities) {
      if (capability.status === 'retired' || capability.status === 'revoked') {
        continue;
      }

      // Simple keyword matching for now
      const goalLower = goal.toLowerCase();
      const capabilityName = capability.name.toLowerCase();

      if (
        goalLower.includes(capabilityName) ||
        capabilityName.includes(goalLower) ||
        this.matchesGoalKeywords(goal, capability)
      ) {
        applicable.push(capability.id);
      }
    }

    return applicable;
  }

  /**
   * Decompose goal into capability sequence
   */
  private decomposeGoalIntoCapabilities(
    goal: string,
    applicableCapabilities: string[],
    context: MCPCapabilityPlanningContext
  ): CapabilityDecomposition[] {
    const decomposition: CapabilityDecomposition[] = [];

    // Simple decomposition for now - can be enhanced with more sophisticated logic
    for (const capabilityId of applicableCapabilities) {
      const capability = this.registry.getCapability(capabilityId);
      if (!capability) continue;

      decomposition.push({
        capabilityId,
        name: capability.name,
        version: capability.version,
        status: capability.status,
        preconditions: {}, // Extract from capability spec
        postconditions: {}, // Extract from capability spec
        estimatedDuration: 5000, // Default 5 seconds
        priority: 1,
        dependencies: [],
        args: {}, // Extract from goal requirements
      });
    }

    return decomposition;
  }

  /**
   * Create plan nodes from capabilities
   */
  private createPlanNodesFromCapabilities(
    decomposition: CapabilityDecomposition[],
    planId: string
  ): PlanNode[] {
    return decomposition.map((capability, index) => ({
      id: `${planId}-node-${index}`,
      type: 'action',
      name: capability.name,
      description: `Execute capability: ${capability.name}`,
      metadata: {
        capabilityId: capability.capabilityId,
        version: capability.version,
        status: capability.status,
        args: capability.args,
      },
      estimatedDuration: capability.estimatedDuration,
      priority: capability.priority,
      dependencies: capability.dependencies,
    }));
  }

  /**
   * Execute a single capability
   */
  private async executeCapability(
    capability: CapabilityDecomposition,
    context: MCPCapabilityPlanningContext
  ): Promise<CapabilityExecutionResult> {
    const startTime = Date.now();

    try {
      let shadowRunResult: ShadowRunResult | undefined;

      // If capability is in shadow status, execute shadow run
      if (capability.status === 'shadow') {
        shadowRunResult = await this.registry.executeShadowRun(
          capability.capabilityId,
          context.leafContext
        );

        return {
          capabilityId: capability.capabilityId,
          success: shadowRunResult.status === 'success',
          duration: Date.now() - startTime,
          worldStateChanges: {}, // Extract from shadow run result
          telemetry: {
            shadowRunId: shadowRunResult.id,
            status: shadowRunResult.status,
          },
          shadowRunResult,
        };
      }

      // For active capabilities, execute normally
      // This would integrate with the actual execution system
      const success = true; // Placeholder
      const worldStateChanges = {}; // Placeholder

      return {
        capabilityId: capability.capabilityId,
        success,
        duration: Date.now() - startTime,
        worldStateChanges,
        telemetry: {
          status: 'active_execution',
        },
      };
    } catch (error) {
      return {
        capabilityId: capability.capabilityId,
        success: false,
        duration: Date.now() - startTime,
        error: {
          code: 'execution_failed',
          detail: String(error),
          retryable: true,
        },
      };
    }
  }

  /**
   * Check capability preconditions
   */
  private checkCapabilityPreconditions(
    capability: CapabilityDecomposition,
    worldState: Record<string, any>
  ): boolean {
    // Simple precondition checking for now
    return true;
  }

  /**
   * Calculate execution order
   */
  private calculateExecutionOrder(nodes: PlanNode[]): string[] {
    // Simple topological sort for now
    return nodes.map((node) => node.id);
  }

  /**
   * Estimate plan success probability
   */
  private estimatePlanSuccess(
    decomposition: CapabilityDecomposition[]
  ): number {
    // Simple estimation based on capability status
    const activeCapabilities = decomposition.filter(
      (c) => c.status === 'active'
    ).length;
    const shadowCapabilities = decomposition.filter(
      (c) => c.status === 'shadow'
    ).length;

    const activeSuccessRate = 0.9; // 90% for active capabilities
    const shadowSuccessRate = 0.7; // 70% for shadow capabilities

    const totalCapabilities = decomposition.length;
    if (totalCapabilities === 0) return 0;

    const estimatedSuccess =
      (activeCapabilities * activeSuccessRate +
        shadowCapabilities * shadowSuccessRate) /
      totalCapabilities;

    return Math.min(estimatedSuccess, 1.0);
  }

  /**
   * Calculate total duration
   */
  private calculateTotalDuration(
    decomposition: CapabilityDecomposition[]
  ): number {
    return decomposition.reduce(
      (total, capability) => total + capability.estimatedDuration,
      0
    );
  }

  /**
   * Identify fallback capabilities
   */
  private identifyFallbackCapabilities(
    applicableCapabilities: string[],
    decomposition: CapabilityDecomposition[]
  ): string[] {
    // Simple fallback identification for now
    return [];
  }

  /**
   * Try fallback capabilities
   */
  private async tryFallbackCapabilities(
    fallbackCapabilities: string[],
    failedCapability: CapabilityDecomposition,
    context: MCPCapabilityPlanningContext
  ): Promise<CapabilityExecutionResult> {
    // Simple fallback execution for now
    return {
      capabilityId: 'fallback',
      success: false,
      duration: 0,
      worldStateChanges: {},
    };
  }

  /**
   * Match goal keywords to capability
   */
  private matchesGoalKeywords(goal: string, capability: any): boolean {
    // Simple keyword matching for now
    const keywords = goal.toLowerCase().split(' ');
    const capabilityName = capability.name.toLowerCase();

    return keywords.some((keyword) => capabilityName.includes(keyword));
  }

  /**
   * Get execution history
   */
  getExecutionHistory(): CapabilityExecutionResult[] {
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
  }
}

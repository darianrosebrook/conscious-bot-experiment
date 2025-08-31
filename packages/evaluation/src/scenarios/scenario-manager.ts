/**
 * Scenario Manager
 *
 * Orchestrates execution of complex multi-step reasoning scenarios
 * Integrates with HRM-inspired cognitive architecture for evaluation
 *
 * @author @darianrosebrook
 */

import {
  Scenario,
  EvaluationSession,
  AgentConfig,
  EvaluationEvent,
  StressTestConfig,
} from '../types';
import {
  IntegratedPlanningSystem,
  createIntegratedPlanningSystem,
} from '@conscious-bot/planning';
import { EventEmitter } from 'events';

// Use real integrated planning system

export interface ScenarioExecutionContext {
  scenario: Scenario;
  agentConfig: AgentConfig;
  planningSystem: IntegratedPlanningSystem;
  stressConfig?: StressTestConfig;
  enableRealTimeMonitoring: boolean;
}

export interface ScenarioStep {
  action: string;
  parameters: Record<string, any>;
  expectedOutcome?: any;
  constraints?: string[];
  timeLimit?: number;
}

/**
 * Manages execution and monitoring of evaluation scenarios
 */
export class ScenarioManager extends EventEmitter {
  private activeSessions: Map<string, EvaluationSession> = new Map();
  private scenarioLibrary: Map<string, Scenario> = new Map();
  private executionQueue: ScenarioExecutionContext[] = [];
  private isProcessing = false;

  constructor() {
    super();
  }

  /**
   * Register a scenario in the library
   */
  registerScenario(scenario: Scenario): void {
    this.scenarioLibrary.set(scenario.id, scenario);
  }

  /**
   * Register multiple scenarios
   */
  registerScenarios(scenarios: Scenario[]): void {
    scenarios.forEach((scenario) => this.registerScenario(scenario));
  }

  /**
   * Execute a single scenario
   */
  async executeScenario(
    scenarioId: string,
    agentConfig: AgentConfig,
    options: {
      stressConfig?: StressTestConfig;
      enableRealTimeMonitoring?: boolean;
      customInitialState?: Record<string, any>;
    } = {}
  ): Promise<EvaluationSession> {
    const scenario = this.scenarioLibrary.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found in library`);
    }

    // Create planning system with agent configuration
    const planningSystem: IntegratedPlanningSystem = createIntegratedPlanningSystem({
      routerConfig: {},
      plannerConfig: {},
    });

    // Initialize evaluation session
    const session: EvaluationSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      scenarioId,
      agentId: agentConfig.id,
      startTime: Date.now(),
      status: 'running',
      steps: [],
      metrics: {},
      errors: [],
    };

    this.activeSessions.set(session.id, session);

    try {
      // Apply custom initial state if provided
      const initialState = options.customInitialState
        ? { ...scenario.initialState, ...options.customInitialState }
        : scenario.initialState;

      // Execute the scenario
      await this.runScenarioExecution(
        session,
        scenario,
        planningSystem,
        initialState,
        options.stressConfig,
        options.enableRealTimeMonitoring || false
      );

      session.status = 'completed';
      session.endTime = Date.now();
    } catch (error) {
      session.status = 'error';
      session.endTime = Date.now();
      session.errors.push({
        timestamp: Date.now(),
        type: 'execution_error',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.activeSessions.delete(session.id);
    return session;
  }

  /**
   * Core scenario execution logic
   */
  private async runScenarioExecution(
    session: EvaluationSession,
    scenario: Scenario,
    planningSystem: IntegratedPlanningSystem,
    initialState: Record<string, any>,
    stressConfig?: StressTestConfig,
    enableMonitoring = false
  ): Promise<void> {
    const startTime = Date.now();
    let currentState = { ...initialState };
    let stepCount = 0;
    const maxSteps = scenario.estimatedSteps * 2; // Safety limit

    // Emit session start event
    this.emitEvent({
      timestamp: Date.now(),
      sessionId: session.id,
      eventType: 'session_start',
      data: {
        scenarioId: scenario.id,
        complexity: scenario.complexity,
        domain: scenario.domain,
      },
    });

    while (
      !this.isGoalAchieved(scenario, currentState) &&
      stepCount < maxSteps
    ) {
      // Check timeout
      if (scenario.timeLimit && Date.now() - startTime > scenario.timeLimit) {
        session.status = 'timeout';
        break;
      }

      // Apply stress testing if configured
      if (stressConfig) {
        await this.applyStressTest(stressConfig, currentState);
      }

      try {
        // Generate planning input based on current state
        const planningInput = this.generatePlanningInput(
          scenario,
          currentState
        );

        // Execute planning
        const planningStart = Date.now();
        const planningResult = await planningSystem.planTask(planningInput, {
          domain: this.mapDomainToPlanningDomain(scenario.domain),
          urgency: this.calculateUrgency(scenario, currentState, stepCount),
          currentState,
          resources: currentState.resources || {},
        });
        const planningLatency = Date.now() - planningStart;

        // Record planning step
        const step = {
          timestamp: Date.now(),
          action: 'planning',
          parameters: { input: planningInput },
          result: planningResult,
          reasoning: planningResult.routingDecision.reasoning,
          confidence: planningResult.plan?.confidence,
        };
        session.steps.push(step);

        // Execute plan if successful
        if (planningResult.success && planningResult.plan) {
          const executionResult = await this.executePlanStep(
            planningResult.plan,
            scenario,
            currentState
          );

          // Update state based on execution
          currentState = this.updateState(
            currentState,
            executionResult,
            scenario
          );

          // Record execution step
          session.steps.push({
            timestamp: Date.now(),
            action: 'execution',
            parameters: executionResult.parameters,
            result: executionResult.result,
          });
        }

        // Update metrics
        session.metrics.planningLatency =
          (session.metrics.planningLatency || 0) + planningLatency;
        session.metrics.stepCount = stepCount + 1;

        // Emit step completion event
        if (enableMonitoring) {
          this.emitEvent({
            timestamp: Date.now(),
            sessionId: session.id,
            eventType: 'step_complete',
            data: {
              stepCount,
              planningLatency,
              currentState: this.sanitizeState(currentState),
            },
          });
        }

        stepCount++;
      } catch (error) {
        session.errors.push({
          timestamp: Date.now(),
          type: 'step_execution_error',
          message: error instanceof Error ? error.message : String(error),
          context: {
            stepCount,
            currentState: this.sanitizeState(currentState),
          },
        });

        this.emitEvent({
          timestamp: Date.now(),
          sessionId: session.id,
          eventType: 'error_occurred',
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
          severity: 'error',
        });

        break;
      }
    }

    // Calculate final metrics
    session.totalLatency = Date.now() - startTime;
    session.success = this.isGoalAchieved(scenario, currentState);

    // Emit session end event
    this.emitEvent({
      timestamp: Date.now(),
      sessionId: session.id,
      eventType: 'session_end',
      data: {
        success: session.success,
        totalSteps: stepCount,
        totalLatency: session.totalLatency,
      },
    });
  }

  /**
   * Generate planning input based on scenario and current state
   */
  private generatePlanningInput(
    scenario: Scenario,
    currentState: Record<string, any>
  ): string {
    const unmetGoals = scenario.goalConditions.filter(
      (goal) => !this.isSpecificGoalMet(goal, currentState, scenario)
    );

    if (unmetGoals.length === 0) {
      return 'All goals achieved';
    }

    // Create contextual planning input
    const primaryGoal = unmetGoals[0];
    const contextInfo = this.extractRelevantContext(scenario, currentState);

    return `${primaryGoal} given current situation: ${JSON.stringify(contextInfo)}`;
  }

  /**
   * Map scenario domain to planning system domain
   */
  private mapDomainToPlanningDomain(
    domain: string
  ): 'minecraft' | 'general' | 'spatial' | 'logical' {
    const mapping: Record<
      string,
      'minecraft' | 'general' | 'spatial' | 'logical'
    > = {
      spatial: 'spatial',
      logical: 'logical',
      resource: 'minecraft',
      social: 'general',
      ethical: 'general',
      meta_cognitive: 'general',
      hybrid: 'general',
    };
    return mapping[domain] || 'general';
  }

  /**
   * Calculate urgency based on scenario progress
   */
  private calculateUrgency(
    scenario: Scenario,
    currentState: Record<string, any>,
    stepCount: number
  ): 'low' | 'medium' | 'high' | 'emergency' {
    const timeElapsed = Date.now() - (currentState._startTime || Date.now());
    const timeRemaining = (scenario.timeLimit || Infinity) - timeElapsed;
    const progressRatio = stepCount / scenario.estimatedSteps;

    if (timeRemaining < 10000) return 'emergency'; // Less than 10 seconds
    if (timeRemaining < 30000 || progressRatio > 0.8) return 'high';
    if (progressRatio > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Execute a planned step in the scenario context
   */
  private async executePlanStep(
    plan: any,
    scenario: Scenario,
    currentState: Record<string, any>
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    // Simulate plan execution based on scenario type
    switch (scenario.domain) {
      case 'spatial':
        return this.executeSpatialAction(plan, currentState, scenario);
      case 'logical':
        return this.executeLogicalAction(plan, currentState, scenario);
      case 'resource':
        return this.executeResourceAction(plan, currentState, scenario);
      case 'social':
        return this.executeSocialAction(plan, currentState, scenario);
      case 'ethical':
        return this.executeEthicalAction(plan, currentState, scenario);
      default:
        return this.executeGenericAction(plan, currentState, scenario);
    }
  }

  /**
   * Execute spatial reasoning actions (navigation, pathfinding)
   */
  private async executeSpatialAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    // Extract movement intent from plan
    const action = plan.nodes?.[0]?.description || 'move';

    if (action.includes('move') || action.includes('navigate')) {
      const currentPos = currentState.position || [0, 0];
      const targetPos = this.extractTargetPosition(
        plan,
        currentState,
        scenario
      );

      // Simulate movement with basic pathfinding
      const newPos = this.simulateMovement(currentPos, targetPos, currentState);

      return {
        parameters: {
          from: currentPos,
          to: targetPos,
          action: 'move',
        },
        result: {
          newPosition: newPos,
          success: true,
          energyCost: this.calculateMovementCost(currentPos, newPos),
        },
      };
    }

    return {
      parameters: { action },
      result: { success: false, reason: 'Unknown spatial action' },
    };
  }

  /**
   * Execute logical reasoning actions (puzzle solving, deduction)
   */
  private async executeLogicalAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    const action = plan.nodes?.[0]?.description || 'analyze';

    if (scenario.id === 'logic_tower_of_hanoi') {
      return this.executeHanoiMove(plan, currentState);
    }

    if (scenario.id === 'logic_sequence_prediction') {
      return this.executeSequenceAnalysis(plan, currentState);
    }

    return {
      parameters: { action },
      result: { success: true, reasoning: 'Generic logical action executed' },
    };
  }

  /**
   * Execute resource management actions
   */
  private async executeResourceAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    const action = plan.nodes?.[0]?.description || 'manage';

    // Resource allocation simulation
    if (action.includes('build') || action.includes('construct')) {
      const resourceCost = this.calculateBuildingCost(action, currentState);
      const canAfford = this.checkResourceAvailability(
        resourceCost,
        currentState
      );

      if (canAfford) {
        return {
          parameters: { action, cost: resourceCost },
          result: {
            success: true,
            resourcesUsed: resourceCost,
            itemBuilt: this.extractBuildTarget(action),
          },
        };
      }
    }

    return {
      parameters: { action },
      result: { success: false, reason: 'Insufficient resources' },
    };
  }

  /**
   * Execute social interaction actions
   */
  private async executeSocialAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    const action = plan.nodes?.[0]?.description || 'communicate';

    // Simulate social interaction outcomes
    return {
      parameters: { action },
      result: {
        success: true,
        relationshipImpact: this.calculateSocialImpact(action, currentState),
        response: 'Simulated agent response',
      },
    };
  }

  /**
   * Execute ethical reasoning actions
   */
  private async executeEthicalAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    const action = plan.nodes?.[0]?.description || 'decide';

    return {
      parameters: { action },
      result: {
        success: true,
        ethicalJustification: 'Simulated ethical reasoning',
        moralWeight: this.calculateMoralImpact(action, currentState),
      },
    };
  }

  /**
   * Execute generic actions for other domains
   */
  private async executeGenericAction(
    plan: any,
    currentState: Record<string, any>,
    scenario: Scenario
  ): Promise<{ parameters: Record<string, any>; result: any }> {
    const action = plan.nodes?.[0]?.description || 'act';

    return {
      parameters: { action },
      result: { success: true, outcome: 'Generic action completed' },
    };
  }

  /**
   * Check if scenario goals are achieved
   */
  private isGoalAchieved(
    scenario: Scenario,
    currentState: Record<string, any>
  ): boolean {
    return scenario.goalConditions.every((goal) =>
      this.isSpecificGoalMet(goal, currentState, scenario)
    );
  }

  /**
   * Check if a specific goal is met
   */
  private isSpecificGoalMet(
    goal: string,
    currentState: Record<string, any>,
    scenario: Scenario
  ): boolean {
    switch (goal) {
      case 'reach_exit':
        return (
          currentState.position &&
          JSON.stringify(currentState.position) ===
            JSON.stringify(this.findExit(scenario))
        );

      case 'collect_all_keys':
        const requiredKeys = this.countRequiredKeys(scenario);
        return (currentState.inventory?.keys || 0) >= requiredKeys;

      case 'all_disks_on_C':
        return currentState.towers?.C?.length === 4; // For Tower of Hanoi

      case 'survive_7_days':
        return (currentState.daysElapsed || 0) >= 7;

      default:
        // Generic goal checking based on state properties
        return (
          currentState[goal] === true || currentState[goal] === 'completed'
        );
    }
  }

  /**
   * Apply stress testing conditions
   */
  private async applyStressTest(
    config: StressTestConfig,
    currentState: Record<string, any>
  ): Promise<void> {
    switch (config.type) {
      case 'latency_injection':
        await new Promise((resolve) =>
          setTimeout(resolve, config.intensity * 1000)
        );
        break;

      case 'noise_injection':
        // Add random perturbations to state
        Object.keys(currentState).forEach((key) => {
          if (typeof currentState[key] === 'number') {
            currentState[key] += (Math.random() - 0.5) * config.intensity * 10;
          }
        });
        break;

      case 'memory_pressure':
        // Simulate memory limitations
        if (currentState.memory) {
          currentState.memory.available *= 1 - config.intensity;
        }
        break;

      // Add other stress test implementations as needed
    }
  }

  /**
   * Update state based on execution results
   */
  private updateState(
    currentState: Record<string, any>,
    executionResult: { parameters: Record<string, any>; result: any },
    scenario: Scenario
  ): Record<string, any> {
    const newState = { ...currentState };

    // Apply result-specific state changes
    if (executionResult.result.newPosition) {
      newState.position = executionResult.result.newPosition;
    }

    if (executionResult.result.energyCost) {
      newState.energy =
        (newState.energy || 100) - executionResult.result.energyCost;
    }

    if (executionResult.result.resourcesUsed) {
      Object.keys(executionResult.result.resourcesUsed).forEach((resource) => {
        if (newState.resources && newState.resources[resource] !== undefined) {
          newState.resources[resource] -=
            executionResult.result.resourcesUsed[resource];
        }
      });
    }

    return newState;
  }

  /**
   * Emit evaluation event
   */
  private emitEvent(event: EvaluationEvent): void {
    this.emit('evaluationEvent', event);
  }

  /**
   * Sanitize state for logging (remove sensitive/large data)
   */
  private sanitizeState(state: Record<string, any>): Record<string, any> {
    const sanitized = { ...state };
    // Remove large objects or sensitive data
    delete sanitized._internal;
    delete sanitized._cache;
    return sanitized;
  }

  // Helper methods for scenario-specific logic
  private extractTargetPosition(
    plan: any,
    state: Record<string, any>,
    scenario: Scenario
  ): [number, number] {
    // Simple target extraction logic
    if (scenario.id === 'spatial_maze_basic') {
      return this.findExit(scenario);
    }
    // Default: move towards center or exit
    return [5, 5];
  }

  private findExit(scenario: Scenario): [number, number] {
    const maze = scenario.initialState.maze;
    if (maze) {
      for (let y = 0; y < maze.length; y++) {
        for (let x = 0; x < maze[y].length; x++) {
          if (maze[y][x] === 2) return [x, y];
        }
      }
    }
    return [4, 4]; // Default exit position
  }

  private simulateMovement(
    from: [number, number],
    to: [number, number],
    state: Record<string, any>
  ): [number, number] {
    // Simple movement simulation - move one step towards target
    const [fx, fy] = from;
    const [tx, ty] = to;

    const dx = Math.sign(tx - fx);
    const dy = Math.sign(ty - fy);

    return [fx + dx, fy + dy];
  }

  private calculateMovementCost(
    from: [number, number],
    to: [number, number]
  ): number {
    const distance = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
    return distance * 2; // Energy cost per step
  }

  private countRequiredKeys(scenario: Scenario): number {
    return scenario.initialState.environment?.keys?.length || 0;
  }

  private executeHanoiMove(
    plan: any,
    state: Record<string, any>
  ): { parameters: Record<string, any>; result: any } {
    // Simplified Hanoi move execution
    return {
      parameters: { action: 'move_disk' },
      result: { success: true, validMove: true },
    };
  }

  private executeSequenceAnalysis(
    plan: any,
    state: Record<string, any>
  ): { parameters: Record<string, any>; result: any } {
    // Simplified sequence analysis
    return {
      parameters: { action: 'analyze_pattern' },
      result: { success: true, patternIdentified: 'fibonacci' },
    };
  }

  private calculateBuildingCost(
    action: string,
    state: Record<string, any>
  ): Record<string, number> {
    // Simple cost calculation
    return { wood: 10, stone: 5 };
  }

  private checkResourceAvailability(
    cost: Record<string, number>,
    state: Record<string, any>
  ): boolean {
    const resources = state.resources || {};
    return Object.keys(cost).every(
      (resource) => (resources[resource] || 0) >= cost[resource]
    );
  }

  private extractBuildTarget(action: string): string {
    if (action.includes('shelter')) return 'shelter';
    if (action.includes('defense')) return 'defense';
    return 'structure';
  }

  private calculateSocialImpact(
    action: string,
    state: Record<string, any>
  ): Record<string, number> {
    return { trust: 5, cooperation: 3 };
  }

  private calculateMoralImpact(
    action: string,
    state: Record<string, any>
  ): number {
    return 0.8; // Placeholder moral weight
  }

  private extractRelevantContext(
    scenario: Scenario,
    state: Record<string, any>
  ): Record<string, any> {
    // Extract only relevant state information for planning
    return {
      position: state.position,
      resources: state.resources,
      health: state.health,
      energy: state.energy,
    };
  }

  /**
   * Get active sessions for monitoring
   */
  getActiveSessions(): EvaluationSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Get scenario library
   */
  getScenarioLibrary(): Scenario[] {
    return Array.from(this.scenarioLibrary.values());
  }
}

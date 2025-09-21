/**
 * State Machine Wrapper - Integrates Mineflayer Statemachine with Planning System
 *
 * Provides structured state management for complex multi-step actions while
 * maintaining our planning system's control over decision-making. This wrapper
 * treats the state machine as a capability provider, not a behavior controller.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { EventEmitter } from 'events';
import { PlanStep, MinecraftAction } from '../types';

// Import the statemachine plugin
const { StateMachine } = require('mineflayer-statemachine');

export interface StateMachineConfig {
  enableDebugLogging?: boolean;
  maxStateDuration?: number;
  enableStatePersistence?: boolean;
  stateRecoveryTimeout?: number;
}

export interface StateTransition {
  from: string;
  to: string;
  condition: string;
  description: string;
}

export interface StateDefinition {
  name: string;
  description: string;
  entryActions: (() => Promise<void>)[];
  exitActions: (() => Promise<void>)[];
  transitions: StateTransition[];
  metadata?: Record<string, any>;
}

export interface StateMachineResult {
  success: boolean;
  finalState: string;
  stateHistory: string[];
  executionTime: number;
  error?: string;
  metadata?: Record<string, any>;
}

export class StateMachineWrapper extends EventEmitter {
  private bot: Bot;
  private config: StateMachineConfig;
  private stateMachine: any = null;
  private currentState: string = 'idle';
  private stateHistory: string[] = [];
  private stateStartTime: number = 0;
  private isExecuting: boolean = false;
  private stateDefinitions: Map<string, StateDefinition> = new Map();

  constructor(bot: Bot, config: Partial<StateMachineConfig> = {}) {
    super();

    this.bot = bot;
    this.config = {
      enableDebugLogging: false,
      maxStateDuration: 300000, // 5 minutes
      enableStatePersistence: true,
      stateRecoveryTimeout: 60000, // 1 minute
      ...config,
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the state machine with a set of state definitions or load defaults
   */
  async initialize(states?: StateDefinition[]): Promise<void> {
    try {
      // Load the statemachine plugin
      this.bot.loadPlugin(StateMachine);

      let finalStates = states;

      // If no states provided, initialize with default basic states
      if (!finalStates || finalStates.length === 0) {
        finalStates = this.createDefaultStates();
      }

      // Convert our state definitions to Mineflayer format
      const mineflayerStates = this.convertToMineflayerFormat(finalStates);

      // Create the state machine
      this.stateMachine = new StateMachine(mineflayerStates, 'idle');

      // Store our state definitions for reference
      finalStates.forEach((state) => {
        this.stateDefinitions.set(state.name, state);
      });

      // Set up state change listeners
      this.setupStateChangeListeners();

      this.emit('initialized', { states: finalStates.map((s) => s.name) });
      this.logDebug('State machine initialized successfully');
    } catch (error) {
      this.emit('error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create default state definitions for basic actions
   */
  private createDefaultStates(): StateDefinition[] {
    return [
      {
        name: 'crafting',
        description: 'Crafting items',
        entryActions: [
          async () => {
            this.logDebug('Entered crafting state');
          },
        ],
        exitActions: [
          async () => {
            this.logDebug('Exited crafting state');
          },
        ],
        transitions: [
          {
            from: 'crafting',
            to: 'done',
            condition: 'crafting_complete',
            description: 'Crafting completed successfully',
          },
          {
            from: 'crafting',
            to: 'error',
            condition: 'crafting_failed',
            description: 'Crafting failed',
          },
        ],
      },
      {
        name: 'building',
        description: 'Building structures',
        entryActions: [
          async () => {
            this.logDebug('Entered building state');
          },
        ],
        exitActions: [
          async () => {
            this.logDebug('Exited building state');
          },
        ],
        transitions: [
          {
            from: 'building',
            to: 'done',
            condition: 'building_complete',
            description: 'Building completed successfully',
          },
          {
            from: 'building',
            to: 'error',
            condition: 'building_failed',
            description: 'Building failed',
          },
        ],
      },
      {
        name: 'gathering',
        description: 'Gathering resources',
        entryActions: [
          async () => {
            this.logDebug('Entered gathering state');
          },
        ],
        exitActions: [
          async () => {
            this.logDebug('Exited gathering state');
          },
        ],
        transitions: [
          {
            from: 'gathering',
            to: 'done',
            condition: 'gathering_complete',
            description: 'Gathering completed successfully',
          },
          {
            from: 'gathering',
            to: 'error',
            condition: 'gathering_failed',
            description: 'Gathering failed',
          },
        ],
      },
      {
        name: 'exploration',
        description: 'Exploring environment',
        entryActions: [
          async () => {
            this.logDebug('Entered exploration state');
          },
        ],
        exitActions: [
          async () => {
            this.logDebug('Exited exploration state');
          },
        ],
        transitions: [
          {
            from: 'exploration',
            to: 'done',
            condition: 'exploration_complete',
            description: 'Exploration completed successfully',
          },
          {
            from: 'exploration',
            to: 'error',
            condition: 'exploration_failed',
            description: 'Exploration failed',
          },
        ],
      },
      {
        name: 'mining',
        description: 'Mining blocks',
        entryActions: [
          async () => {
            this.logDebug('Entered mining state');
          },
        ],
        exitActions: [
          async () => {
            this.logDebug('Exited mining state');
          },
        ],
        transitions: [
          {
            from: 'mining',
            to: 'done',
            condition: 'mining_complete',
            description: 'Mining completed successfully',
          },
          {
            from: 'mining',
            to: 'error',
            condition: 'mining_failed',
            description: 'Mining failed',
          },
        ],
      },
    ];
  }

  /**
   * Execute a plan step using the state machine
   * This maintains our planning system's control while leveraging structured state management
   */
  async executePlanStep(planStep: PlanStep): Promise<StateMachineResult> {
    if (!this.stateMachine) {
      throw new Error('State machine not initialized');
    }

    if (this.isExecuting) {
      throw new Error('State machine is already executing');
    }

    const startTime = Date.now();
    this.isExecuting = true;
    this.stateHistory = [];
    this.currentState = 'idle';

    try {
      // Determine which state machine to use based on the plan step
      const targetState = this.determineTargetState(planStep);

      if (!targetState) {
        throw new Error(
          `No suitable state machine found for plan step: ${planStep.action?.type}`
        );
      }

      // Execute the state machine
      await this.executeStateMachine(targetState, planStep);

      const result: StateMachineResult = {
        success: true,
        finalState: this.currentState,
        stateHistory: [...this.stateHistory],
        executionTime: Date.now() - startTime,
        metadata: {
          planStepId: planStep.id,
          actionType: planStep.action?.type,
          finalState: this.currentState,
        },
      };

      this.emit('executionComplete', result);
      return result;
    } catch (error) {
      const result: StateMachineResult = {
        success: false,
        finalState: this.currentState,
        stateHistory: [...this.stateHistory],
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          planStepId: planStep.id,
          actionType: planStep.action?.type,
          error: error instanceof Error ? error.message : String(error),
        },
      };

      this.emit('executionFailed', result);
      throw error;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Get current state information
   */
  getCurrentState(): { name: string; duration: number; history: string[] } {
    return {
      name: this.currentState,
      duration: Date.now() - this.stateStartTime,
      history: [...this.stateHistory],
    };
  }

  /**
   * Pause execution (useful for user intervention)
   */
  pause(): void {
    if (this.stateMachine && this.isExecuting) {
      this.stateMachine.pause();
      this.emit('paused', { state: this.currentState });
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.stateMachine && this.isExecuting) {
      this.stateMachine.resume();
      this.emit('resumed', { state: this.currentState });
    }
  }

  /**
   * Stop execution and reset to idle
   */
  stop(): void {
    if (this.stateMachine) {
      this.stateMachine.stop();
      this.currentState = 'idle';
      this.isExecuting = false;
      this.emit('stopped', { finalState: this.currentState });
    }
  }

  /**
   * Convert our state definitions to Mineflayer format
   */
  private convertToMineflayerFormat(states: StateDefinition[]): any {
    const mineflayerStates: any = {};

    states.forEach((state) => {
      mineflayerStates[state.name] = {
        on: this.convertTransitions(state.transitions),
        entry: async () => {
          await this.handleStateEntry(state);
        },
        exit: async () => {
          await this.handleStateExit(state);
        },
      };
    });

    return mineflayerStates;
  }

  /**
   * Convert our transition format to Mineflayer format
   */
  private convertTransitions(
    transitions: StateTransition[]
  ): Record<string, string> {
    const mineflayerTransitions: Record<string, string> = {};

    transitions.forEach((transition) => {
      mineflayerTransitions[transition.condition] = transition.to;
    });

    return mineflayerTransitions;
  }

  /**
   * Determine which state machine to use for a given plan step
   */
  private determineTargetState(planStep: PlanStep): string | null {
    const actionType = planStep.action?.type?.toLowerCase();

    // Map action types to state machines
    switch (actionType) {
      case 'craft':
        return 'crafting';
      case 'build':
        return 'building';
      case 'gather':
        return 'gathering';
      case 'explore':
        return 'exploration';
      case 'mine':
        return 'mining';
      default:
        return null; // No state machine for this action type
    }
  }

  /**
   * Execute a specific state machine with improved timeout handling
   */
  private async executeStateMachine(
    targetState: string,
    planStep: PlanStep
  ): Promise<void> {
    // Set the initial state
    this.stateMachine.setState(targetState);

    // Execute until completion or error, with a timeout mechanism
    const maxDuration = this.config.maxStateDuration ?? 300000; // 5 minutes
    const startTime = Date.now();

    while (
      this.stateMachine.state !== 'done' &&
      this.stateMachine.state !== 'error'
    ) {
      await this.bot.waitForTicks(1);

      // Check for timeout
      if (Date.now() - startTime > maxDuration) {
        console.warn(`State machine timeout in state: ${this.currentState}`);
        // Force completion for timeout cases
        this.stateMachine.setState('done');
        break;
      }

      // Check if we've been in the same state too long (stuck state detection)
      if (Date.now() - this.stateStartTime > 60000) {
        // 1 minute per state max
        console.warn(
          `State machine stuck in state: ${this.currentState}, forcing transition`
        );
        this.stateMachine.setState('done');
        break;
      }
    }

    if (this.stateMachine.state === 'error') {
      console.warn(
        `State machine execution failed in state: ${this.currentState}`
      );
      // Don't throw error, just log and continue
      this.stateMachine.setState('done');
    }
  }

  /**
   * Handle state entry
   */
  private async handleStateEntry(state: StateDefinition): Promise<void> {
    this.currentState = state.name;
    this.stateStartTime = Date.now();
    this.stateHistory.push(state.name);

    this.emit('stateEntered', {
      state: state.name,
      timestamp: Date.now(),
      metadata: state.metadata,
    });

    this.logDebug(`Entering state: ${state.name}`);

    // Execute entry actions
    for (const action of state.entryActions) {
      try {
        await action();
      } catch (error) {
        this.logDebug(`Entry action failed in state ${state.name}: ${error}`);
        // Continue with other entry actions
      }
    }
  }

  /**
   * Handle state exit
   */
  private async handleStateExit(state: StateDefinition): Promise<void> {
    this.emit('stateExited', {
      state: state.name,
      timestamp: Date.now(),
      duration: Date.now() - this.stateStartTime,
      metadata: state.metadata,
    });

    this.logDebug(`Exiting state: ${state.name}`);

    // Execute exit actions
    for (const action of state.exitActions) {
      try {
        await action();
      } catch (error) {
        this.logDebug(`Exit action failed in state ${state.name}: ${error}`);
        // Continue with other exit actions
      }
    }
  }

  /**
   * Set up state change listeners
   */
  private setupStateChangeListeners(): void {
    if (!this.stateMachine) return;

    // Listen for state changes
    this.stateMachine.on(
      'stateChanged',
      (oldState: string, newState: string) => {
        this.emit('stateChanged', {
          oldState,
          newState,
          timestamp: Date.now(),
        });
        this.logDebug(`State changed: ${oldState} → ${newState}`);
      }
    );

    // Listen for state machine completion
    this.stateMachine.on('done', () => {
      this.emit('completed', {
        finalState: this.currentState,
        timestamp: Date.now(),
      });
      this.logDebug('State machine execution completed');
    });

    // Listen for errors
    this.stateMachine.on('error', (error: any) => {
      this.emit('error', {
        error,
        state: this.currentState,
        timestamp: Date.now(),
      });
      this.logDebug(
        `State machine error in state ${this.currentState}: ${error}`
      );
    });
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    this.on('error', (data) => {
      console.error('StateMachineWrapper error:', data);
    });
  }

  /**
   * Debug logging
   */
  private logDebug(message: string): void {
    if (this.config.enableDebugLogging) {
      console.log(`[StateMachineWrapper] ${message}`);
    }
  }
}

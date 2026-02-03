/**
 * Keep-Alive Integration Module
 *
 * Integrates the keep-alive intention check loop with the planning system.
 * This module bridges the cognition keep-alive controller with the
 * autonomous executor's idle detection.
 *
 * @author @darianrosebrook
 */

import type {
  KeepAliveController,
  KeepAliveContext,
  KeepAliveTickResult,
  KeepAliveThought,
} from '@conscious-bot/cognition';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for keep-alive integration.
 */
export interface KeepAliveIntegrationConfig {
  /** Whether keep-alive is enabled */
  enabled: boolean;
  /** Base interval between ticks (ms) */
  baseIntervalMs: number;
  /** Minimum interval (with maximum acceleration) */
  minIntervalMs: number;
  /** Maximum perception refreshes per minute */
  maxRefreshesPerMinute: number;
  /** Cognition service URL */
  cognitionServiceUrl: string;
}

/**
 * Default configuration.
 */
export const DEFAULT_KEEPALIVE_INTEGRATION_CONFIG: KeepAliveIntegrationConfig = {
  enabled: true,
  baseIntervalMs: 120_000,
  minIntervalMs: 30_000,
  maxRefreshesPerMinute: 3,
  cognitionServiceUrl: 'http://localhost:3003',
};

/**
 * State passed from the executor to the keep-alive integration.
 */
export interface ExecutorState {
  /** Number of active tasks */
  activeTasks: number;
  /** Number of eligible tasks */
  eligibleTasks: number;
  /** Current idle reason (null if not idle) */
  idleReason: string | null;
  /** Circuit breaker status */
  circuitBreakerOpen: boolean;
  /** Last user command timestamp */
  lastUserCommand: number;
  /** Recent task conversion count */
  recentTaskConversions: number;
}

/**
 * Bot state from Minecraft interface.
 */
export interface BotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Array<{ name: string; count: number; displayName?: string }>;
  timeOfDay?: number;
  weather?: string;
  biome?: string;
  dimension?: string;
  nearbyHostiles?: number;
  nearbyPassives?: number;
}

// ============================================================================
// Keep-Alive Integration Class
// ============================================================================

/**
 * Integrates keep-alive with the planning system.
 *
 * This class:
 * 1. Receives idle signals from the autonomous executor
 * 2. Decides whether to trigger keep-alive based on idle state
 * 3. Forwards generated thoughts to the cognition service
 * 4. Handles rate limiting and circuit breaker coordination
 */
export class KeepAliveIntegration {
  private config: KeepAliveIntegrationConfig;
  private controller: KeepAliveController | null = null;
  private initialized = false;
  private lastTickTime = 0;

  // Track recent task conversions for idle detection
  private recentConversions: number[] = [];
  private recentConversionWindowMs = 30_000;

  constructor(config: Partial<KeepAliveIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_KEEPALIVE_INTEGRATION_CONFIG, ...config };
  }

  /**
   * Initialize the keep-alive integration.
   * Must be called before using other methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import the keep-alive controller
      const { KeepAliveController } = await import('@conscious-bot/cognition');

      // Create LLM generator function
      const llmGenerator = this.createLLMGenerator();

      // Create controller with config
      this.controller = new KeepAliveController(llmGenerator, {
        baseIntervalMs: this.config.baseIntervalMs,
        minIntervalMs: this.config.minIntervalMs,
        maxRefreshesPerMinute: this.config.maxRefreshesPerMinute,
      });

      // Set up event listeners
      this.controller.on('thought', this.onThought.bind(this));
      this.controller.on('skip', this.onSkip.bind(this));
      this.controller.on('violation', this.onViolation.bind(this));
      this.controller.on('error', this.onError.bind(this));

      this.initialized = true;
      console.log('[KeepAliveIntegration] Initialized successfully');
    } catch (error) {
      console.error('[KeepAliveIntegration] Failed to initialize:', error);
      // Don't throw — keep-alive is optional
    }
  }

  /**
   * Handle an idle event from the autonomous executor.
   *
   * This is the main integration point. When the executor detects
   * an idle state, it calls this method to potentially trigger
   * a keep-alive tick.
   *
   * @param executorState - Current executor state
   * @param botState - Current bot state
   * @returns Tick result (if ticked) or null
   */
  async onIdle(
    executorState: ExecutorState,
    botState: BotState
  ): Promise<KeepAliveTickResult | null> {
    if (!this.config.enabled || !this.controller || !this.initialized) {
      return null;
    }

    // Only tick on true idle (no_tasks), not other idle reasons
    // Other reasons (backoff, blocked, etc.) are transient
    if (executorState.idleReason !== 'no_tasks') {
      return null;
    }

    // Build keep-alive context from executor and bot state
    const context: KeepAliveContext = {
      currentState: {
        position: botState.position,
        health: botState.health,
        food: botState.food,
        inventory: botState.inventory,
        timeOfDay: botState.timeOfDay,
        weather: botState.weather,
        biome: botState.biome,
        dimension: botState.dimension,
        nearbyHostiles: botState.nearbyHostiles,
        nearbyPassives: botState.nearbyPassives,
      },
      activePlanSteps: executorState.eligibleTasks,
      recentTaskConversions: this.countRecentConversions(),
      lastUserCommand: executorState.lastUserCommand,
    };

    // Attempt a tick
    try {
      const result = await this.controller.tick(context);
      this.lastTickTime = Date.now();
      return result;
    } catch (error) {
      console.error('[KeepAliveIntegration] Tick failed:', error);
      return null;
    }
  }

  /**
   * Record a task conversion (for tracking recent conversions).
   */
  recordTaskConversion(): void {
    this.recentConversions.push(Date.now());
    this.pruneRecentConversions();
  }

  /**
   * Check if keep-alive is enabled and initialized.
   */
  isActive(): boolean {
    return this.config.enabled && this.initialized && this.controller !== null;
  }

  /**
   * Get controller state for diagnostics.
   */
  getState(): object | null {
    if (!this.controller) return null;
    return {
      ...this.controller.getState(),
      counters: this.controller.getCounters(),
      recentConversions: this.countRecentConversions(),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create the LLM generator function.
   */
  private createLLMGenerator(): (prompt: string) => Promise<string> {
    return async (prompt: string) => {
      // Call the cognition service's LLM endpoint
      try {
        const response = await fetch(
          `${this.config.cognitionServiceUrl}/api/llm/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
          }
        );

        if (!response.ok) {
          throw new Error(`LLM request failed: ${response.status}`);
        }

        const data = (await response.json()) as { text?: string; content?: string };
        return data.text || data.content || '';
      } catch (error) {
        console.error('[KeepAliveIntegration] LLM generation failed:', error);
        // Return a simple observation as fallback
        return 'I observe the current situation and remain alert to my surroundings.';
      }
    };
  }

  /**
   * Handle thought events from the controller.
   */
  private async onThought(event: any, thought: KeepAliveThought): Promise<void> {
    console.log(
      `[KeepAliveIntegration] Generated thought: ${thought.content.slice(0, 60)}...` +
      ` (eligible=${thought.eligibility.convertEligible})`
    );

    // Post thought to cognition service
    try {
      await fetch(
        `${this.config.cognitionServiceUrl}/thought-generated`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thought: {
              id: thought.id,
              type: 'observation',
              content: thought.content,
              timestamp: thought.timestamp,
              metadata: {
                source: 'keepalive',
                frameProfile: thought.frameProfile,
                extractedGoal: thought.extractedGoal,
                convertEligible: thought.eligibility.convertEligible,
              },
              convertEligible: thought.eligibility.convertEligible,
            },
          }),
        }
      );
    } catch (error) {
      console.error('[KeepAliveIntegration] Failed to post thought:', error);
    }
  }

  /**
   * Handle skip events from the controller.
   */
  private onSkip(event: any): void {
    // Log at debug level to avoid spam
    if (process.env.KEEPALIVE_DEBUG === 'true') {
      console.log(`[KeepAliveIntegration] Skip: ${event.payload.reason}`);
    }
  }

  /**
   * Handle violation events from the controller.
   */
  private onViolation(event: any): void {
    console.error('[KeepAliveIntegration] VIOLATION:', event.payload);
  }

  /**
   * Handle error events from the controller.
   */
  private onError(error: Error): void {
    console.error('[KeepAliveIntegration] Error:', error);
  }

  /**
   * Count recent task conversions.
   */
  private countRecentConversions(): number {
    this.pruneRecentConversions();
    return this.recentConversions.length;
  }

  /**
   * Prune old conversion timestamps.
   */
  private pruneRecentConversions(): void {
    const cutoff = Date.now() - this.recentConversionWindowMs;
    this.recentConversions = this.recentConversions.filter(t => t > cutoff);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a keep-alive integration instance.
 */
export async function createKeepAliveIntegration(
  config?: Partial<KeepAliveIntegrationConfig>
): Promise<KeepAliveIntegration> {
  const integration = new KeepAliveIntegration(config);
  await integration.initialize();
  return integration;
}

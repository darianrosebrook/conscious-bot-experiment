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
import { getDefaultLanguageIOClient } from '@conscious-bot/cognition';
import crypto, { createHash } from 'crypto';
import { getGoldenRunRecorder } from '../golden-run-recorder';

// ============================================================================
// Types
// ============================================================================

/**
 * Decision code from idle episode emission attempt.
 * Makes suppression reasons inspectable without log archaeology.
 */
export type IdleEpisodeDecision =
  | 'emitted_executable'
  | 'emitted_blocked'
  | 'emitted_error'
  | 'suppressed_in_flight'
  | 'suppressed_lease_cooldown'
  | 'suppressed_hourly_cap'
  | 'suppressed_pending_planning';

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
  /** Whether to emit Sterling idle episodes (source proof) */
  enableSterlingIdleEpisodes: boolean;
  /** Cooldown between idle episodes (ms) */
  idleEpisodeCooldownMs: number;
  /** Timeout for idle reduction requests (ms) */
  idleEpisodeTimeoutMs: number;
  /**
   * Test-only: inject a controller factory to avoid dynamic import and real LLM calls.
   * When provided, initialize() calls this instead of importing @conscious-bot/cognition.
   */
  _controllerFactory?: () => KeepAliveController;
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
  enableSterlingIdleEpisodes:
    process.env.STERLING_IDLE_EPISODES_ENABLED === 'true',
  idleEpisodeCooldownMs: 300_000,
  idleEpisodeTimeoutMs: 12_000,
};

/**
 * Summary of a blocked task, passed to Sterling so it can choose alternate goals.
 */
export interface BlockedTaskSummary {
  taskId: string;
  blockedReason: string;
  nextEligibleAt?: number;
}

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
  /** Count of pending_planning sterling_ir tasks */
  pendingPlanningSterlingIrCount?: number;
  /** Summaries of blocked tasks (when idleReason is 'blocked_on_prereq') */
  blockedTasks?: BlockedTaskSummary[];
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
  private idleEpisodeInFlight = false;
  private lastIdleEpisodeAt = 0;
  private lastBotState: BotState | null = null;
  private lastVitalsRerouteAt = 0;
  private static readonly HEALTH_URGENT_THRESHOLD = 8;
  private static readonly FOOD_URGENT_THRESHOLD = 6;
  /** Rate limit: at most one vitals reroute per window to prevent Sterling spam during sustained low vitals. */
  private static readonly VITALS_REROUTE_COOLDOWN_MS = 30_000;

  // Track recent task conversions for idle detection
  private recentConversions: number[] = [];
  private recentConversionWindowMs = 30_000;

  // ── Idle episode safeguards ──
  // Dedupe lease: suppress re-emission when world context unchanged
  private lastIdleLeaseKey: string = '';
  // Hard cap: sliding window of idle episode timestamps (max per hour)
  private idleEpisodeTimestamps: number[] = [];
  private readonly MAX_IDLE_EPISODES_PER_HOUR = 6;

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
      if (this.config._controllerFactory) {
        // Test injection path: use provided factory, no dynamic import or LLM calls.
        this.controller = this.config._controllerFactory();
      } else {
        // Production path: dynamically import the keep-alive controller
        const { KeepAliveController } = await import('@conscious-bot/cognition');

        // Create LLM generator function
        const llmGenerator = this.createLLMGenerator();

        // Create controller with config
        this.controller = new KeepAliveController(llmGenerator, {
          baseIntervalMs: this.config.baseIntervalMs,
          minIntervalMs: this.config.minIntervalMs,
          maxRefreshesPerMinute: this.config.maxRefreshesPerMinute,
        });
      }

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

    // Cache bot state for vitals re-routing in onThought()
    this.lastBotState = botState;

    // Idle episodes fire when:
    // - 'no_tasks': true cognitive idle (no work exists)
    // - 'blocked_on_prereq': all tasks are blocked — generate an alternate goal
    //   that can bypass the blocked prereqs (e.g. explore while craft is waiting)
    // Other reasons (backoff, circuit_breaker, manual_pause) are transient executor states.
    const IDLE_EPISODE_ELIGIBLE_REASONS = new Set(['no_tasks', 'blocked_on_prereq']);
    if (!IDLE_EPISODE_ELIGIBLE_REASONS.has(executorState.idleReason ?? '')) {
      return null;
    }

    if (this.config.enableSterlingIdleEpisodes) {
      // Suppress idle episodes when there are tasks actively being planned —
      // UNLESS all tasks are blocked (blocked_on_prereq). Blocked tasks are the
      // *reason* we're idle and need new goals; they shouldn't suppress autonomy.
      if (
        (executorState.pendingPlanningSterlingIrCount ?? 0) > 0 &&
        executorState.idleReason !== 'blocked_on_prereq'
      ) {
        if (process.env.KEEPALIVE_DEBUG === 'true') {
          console.log('[KeepAliveIntegration] Idle episode suppressed: suppressed_pending_planning');
        }
        return null;
      }
      const decision = await this.trySterlingIdleEpisode(executorState, botState);
      if (process.env.KEEPALIVE_DEBUG === 'true' && decision.startsWith('suppressed_')) {
        console.log(`[KeepAliveIntegration] Idle episode suppressed: ${decision}`);
      }
      if (decision.startsWith('emitted_')) {
        return null;
      }
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
   *
   * When Sterling metadata is available on the thought, wrap it in a
   * ReductionProvenance so the thought-to-task converter can evaluate it
   * through the standard 5-gate contract. Without this, keep-alive
   * thoughts are dropped with "no reduction provided" regardless of
   * whether Sterling processed them successfully.
   */
  private async onThought(event: any, thought: KeepAliveThought): Promise<void> {
    console.log(
      `[KeepAliveIntegration] Generated thought: ${thought.content.slice(0, 60)}...` +
      ` (eligible=${thought.eligibility.convertEligible}, sterlingUsed=${thought.sterlingUsed ?? false})`
    );

    // Build ReductionProvenance from Sterling metadata when available.
    // This mirrors the structure built in trySterlingIdleEpisode() so that
    // both code paths go through the same thought-to-task conversion gates.
    let reduction: Record<string, unknown> | undefined;
    if (thought.sterlingUsed && thought.committedIrDigest) {
      reduction = {
        sterlingProcessed: true,
        envelopeId: thought.envelopeId ?? null,
        reducerResult: {
          committed_goal_prop_id: thought.committedGoalPropId ?? null,
          committed_ir_digest: thought.committedIrDigest,
          source_envelope_id: thought.envelopeId ?? '',
          is_executable: thought.isExecutable ?? false,
          is_semantically_empty: false,
          advisory: null,
          grounding: thought.groundingResult ?? null,
          schema_version: '1.1.0', // match current reducer schema
          reducer_version: 'keepalive-bridge-v1',
        },
        isExecutable: thought.isExecutable ?? false,
        blockReason: thought.blockReason ?? null,
        durationMs: thought.processingDurationMs ?? 0,
        sterlingError: null,
      };
    }

    // If Sterling returned null goal-prop and vitals are urgent,
    // re-route through the structured idle-episode reducer path
    // where Sterling's _select_idle_goal() handles health/food/hostiles.
    if (
      thought.sterlingUsed &&
      (!reduction || !(reduction.reducerResult as any)?.committed_goal_prop_id)
    ) {
      const rerouted = await this.trySterlingVitalsReduce(thought);
      if (rerouted) {
        console.log(`[KeepAliveIntegration] vitals thought rerouted via Sterling reduce`);
        return; // Already posted to cognition with real goal-prop
      }
      // Fall through: post original thought (may be dropped, that's ok —
      // not treating as deterministic drop if botState is missing)
    }

    await this.postThoughtToCognition({
      id: thought.id,
      type: 'observation',
      content: thought.content,
      timestamp: thought.timestamp,
      metadata: {
        source: 'keepalive',
        frameProfile: thought.frameProfile,
        convertEligible: thought.eligibility.convertEligible,
        ...(reduction ? { reduction } : {}),
      },
      convertEligible: thought.eligibility.convertEligible,
    });
  }

  /**
   * Detect whether bot vitals are urgent (health/food below thresholds).
   * Returns vitals snapshot if urgent, null otherwise.
   */
  private detectUrgentVitals(): { health: number; food: number; nearbyHostiles: number } | null {
    if (!this.lastBotState) return null;
    const health = this.lastBotState.health ?? 20;
    const food = this.lastBotState.food ?? 20;
    if (health < KeepAliveIntegration.HEALTH_URGENT_THRESHOLD ||
        food < KeepAliveIntegration.FOOD_URGENT_THRESHOLD) {
      return {
        health,
        food,
        nearbyHostiles: this.lastBotState.nearbyHostiles ?? 0,
      };
    }
    return null;
  }

  /**
   * Re-route a vitals thought through Sterling's idle_episode_v1 reducer.
   * Sterling's _select_idle_goal() already handles food/health/hostiles,
   * so this produces a real committed_goal_prop_id instead of null.
   */
  private async trySterlingVitalsReduce(
    thought: KeepAliveThought,
  ): Promise<boolean> {
    const vitals = this.detectUrgentVitals();
    if (!vitals || !this.lastBotState) return false;

    // Rate limit: prevent Sterling spam during sustained low vitals
    const now = Date.now();
    if (now - this.lastVitalsRerouteAt < KeepAliveIntegration.VITALS_REROUTE_COOLDOWN_MS) {
      return false;
    }

    const client = getDefaultLanguageIOClient();
    try {
      await client.connect();
    } catch {
      return false;
    }

    // Deterministic run_id derived from thought identity — preserves replay verifiability.
    // crypto.randomUUID() would produce different IR digests for identical state.
    const runId = `keepalive-vitals:${thought.id}`;
    // Canonicalize payload: sort inventory names, quantize position to whole blocks.
    const pos = this.lastBotState.position;
    const botStatePayload = {
      health: vitals.health,
      food: vitals.food,
      nearby_hostiles: vitals.nearbyHostiles,
      inventory_summary: (this.lastBotState.inventory ?? []).map(i => i.name).sort(),
      position: pos ? { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) } : undefined,
    };

    const rawText = `[IDLE_EPISODE_V1]\n${JSON.stringify({
      kind: 'idle_episode_v1',
      run_id: runId,
      idle_reason: 'vitals_urgent',
      timestamp_ms: Date.now(),
      bot_state: botStatePayload,
    })}`;

    try {
      const result = await Promise.race([
        client.reduce(rawText, {
          modelId: 'idle-episode',
          promptDigest: 'idle_episode_v1',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('vitals_reduce_timeout')), this.config.idleEpisodeTimeoutMs)
        ),
      ]);

      if ('code' in result || !result.result.is_executable) {
        console.log(`[KeepAliveIntegration] vitals_reduce: not executable (${('code' in result) ? result.code : 'blocked'})`);
        return false;
      }

      const reducer = result.result;
      const reduction = {
        sterlingProcessed: true,
        envelopeId: result.envelope.envelope_id,
        reducerResult: reducer,
        isExecutable: true,
        blockReason: null,
        durationMs: result.durationMs,
        sterlingError: null,
      };

      this.lastVitalsRerouteAt = Date.now();

      console.log(
        `[KeepAliveIntegration] keepalive_vitals_bound: ` +
          `goalPropId=${reducer.committed_goal_prop_id} ` +
          `health=${vitals.health} food=${vitals.food} hostiles=${vitals.nearbyHostiles}`
      );

      await this.postThoughtToCognition({
        id: `vitals-${thought.id}`,
        type: 'observation',
        content: thought.content,
        timestamp: thought.timestamp,
        metadata: {
          source: 'keepalive',
          reduction,
          vitals_rerouted: true,
        },
        convertEligible: true,
      });
      return true;
    } catch (err) {
      console.error('[KeepAliveIntegration] vitals reduce failed:', err);
      return false;
    }
  }

  private async postThoughtToCognition(thought: Record<string, unknown>): Promise<void> {
    try {
      await fetch(`${this.config.cognitionServiceUrl}/thought-generated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thought }),
      });
    } catch (error) {
      console.error('[KeepAliveIntegration] Failed to post thought:', error);
    }
  }

  private buildIdleEpisodeText(
    executorState: ExecutorState,
    botState: BotState,
    runId: string
  ): string {
    const payload = {
      kind: 'idle_episode_v1',
      run_id: runId,
      idle_reason: executorState.idleReason,
      timestamp_ms: Date.now(),
      bot_state: {
        position: botState.position,
        health: botState.health,
        food: botState.food,
        time_of_day: botState.timeOfDay,
        weather: botState.weather,
        biome: botState.biome,
        dimension: botState.dimension,
        nearby_hostiles: botState.nearbyHostiles,
        nearby_passives: botState.nearbyPassives,
        inventory_summary: botState.inventory?.map((item) => ({
          name: item.name,
          count: item.count,
        })) ?? [],
      },
      // Include blocked task context so Sterling can choose goals that avoid
      // blocked prereqs (e.g. "explore" when "craft" is blocked on missing mcData)
      blocked_tasks: executorState.blockedTasks?.map((bt) => ({
        task_id: bt.taskId,
        blocked_reason: bt.blockedReason,
        next_eligible_at: bt.nextEligibleAt,
      })) ?? [],
      budgets: {
        max_steps: 8,
        max_ms: 2000,
      },
    };

    return `IDLE_EPISODE_V1\n${JSON.stringify(payload)}`;
  }

  /**
   * Compute a coarse lease key from world state + narrative context.
   * When the key is unchanged, the idle episode is suppressed (same context, same cooldown).
   * When the key changes (inventory changed, new task outcome), emit even within cooldown.
   */
  private computeIdleLease(botState: BotState, executorState: ExecutorState): string {
    const invSummary = (botState.inventory ?? [])
      .map((i) => `${i.name}:${i.count}`)
      .sort()
      .join(',');
    const invDigest = createHash('sha256').update(invSummary).digest('hex').slice(0, 12);
    // Coarse spatial bucket: 8-block grid + biome. Moving biomes or ~8 blocks
    // changes the opportunity landscape (new resources, new dangers).
    // Math.floor produces consistent cells [..., [-16,-9], [-8,-1], [0,7], [8,15], ...].
    // Boundary jitter (oscillating at x≈8.0) can cause extra emissions — acceptable
    // because the hourly cap bounds total volume regardless.
    const pos = botState.position;
    const bucketX = pos ? Math.floor(pos.x / 8) : 0;
    const bucketZ = pos ? Math.floor(pos.z / 8) : 0;
    const spatialBucket = pos
      ? `${bucketX}:${bucketZ}:${botState.biome ?? ''}`
      : 'unknown';
    // NOTE: recentTaskConversions was removed from the lease key because each
    // task creation incremented the counter, which changed the key, which bypassed
    // the cooldown, causing an infinite idle→task→fail→idle loop every ~30s.
    // The spatial bucket + inventory + idle reason provide sufficient context change
    // detection. The hourly cap (MAX_IDLE_EPISODES_PER_HOUR) bounds total volume.
    return `${executorState.idleReason}:${invDigest}:${spatialBucket}`;
  }

  private async trySterlingIdleEpisode(
    executorState: ExecutorState,
    botState: BotState
  ): Promise<IdleEpisodeDecision> {
    if (this.idleEpisodeInFlight) return 'suppressed_in_flight';
    const now = Date.now();

    // ── Safeguard 1: Dedupe lease ──
    // If world context hasn't changed, respect cooldown. If it changed, allow re-emission.
    const leaseKey = this.computeIdleLease(botState, executorState);
    if (leaseKey === this.lastIdleLeaseKey && now - this.lastIdleEpisodeAt < this.config.idleEpisodeCooldownMs) {
      return 'suppressed_lease_cooldown';
    }

    // ── Safeguard 3: Hourly hard cap ──
    const oneHourAgo = now - 3_600_000;
    this.idleEpisodeTimestamps = this.idleEpisodeTimestamps.filter((t) => t > oneHourAgo);
    if (this.idleEpisodeTimestamps.length >= this.MAX_IDLE_EPISODES_PER_HOUR) {
      return 'suppressed_hourly_cap';
    }

    this.lastIdleLeaseKey = leaseKey;
    this.idleEpisodeTimestamps.push(now);

    const runId = crypto.randomUUID();
    const requestId = `idle_${runId}`;
    const rawText = this.buildIdleEpisodeText(executorState, botState, runId);
    const recorder = getGoldenRunRecorder();

    this.idleEpisodeInFlight = true;
    this.lastIdleEpisodeAt = now;

    try {
      // Evidence hygiene: keep the report explicit about whether an executor loop was running.
      recorder.recordRuntime(runId, {
        executor: {
          enabled: process.env.ENABLE_PLANNING_EXECUTOR === '1',
          mode: (process.env.EXECUTOR_MODE || 'shadow').toLowerCase(),
          loop_started: true, // onIdle() is called from the autonomous executor scheduler
          enable_planning_executor_env: process.env.ENABLE_PLANNING_EXECUTOR,
          executor_live_confirm_env: process.env.EXECUTOR_LIVE_CONFIRM,
        },
      });

      const client = getDefaultLanguageIOClient();
      await client.connect();
      const reducePromise = client.reduce(rawText, {
        modelId: 'idle-episode',
        promptDigest: 'idle_episode_v1',
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('idle_episode_timeout')),
          this.config.idleEpisodeTimeoutMs
        )
      );
      const result = await Promise.race([reducePromise, timeoutPromise]);

      if ('code' in result) {
        const timeoutOrigin =
          result.code === 'CLIENT_TIMEOUT'
            ? 'client'
            : result.code === 'STERLING_TIMEOUT'
              ? 'server'
              : undefined;
        recorder.recordIdleEpisode(runId, {
          client_request_id: requestId,
          timeout_origin: timeoutOrigin,
          status: 'error',
          reason: result.code,
          duration_ms: result.durationMs,
        });
        return 'emitted_error';
      }

      const reducer = result.result;
      const executable = reducer.is_executable === true;
      const status = executable ? 'ok' : 'blocked';
      const reason = executable ? undefined : result.blockReason ?? 'blocked_no_action';

      recorder.recordIdleEpisode(runId, {
        client_request_id: requestId,
        status,
        reason,
        committed_ir_digest: reducer.committed_ir_digest,
        schema_version: reducer.schema_version,
        envelope_id: reducer.source_envelope_id ?? null,
        duration_ms: result.durationMs,
      });

      if (executable) {
        const reduction = {
          sterlingProcessed: true,
          envelopeId: result.envelope.envelope_id,
          reducerResult: reducer,
          isExecutable: reducer.is_executable,
          blockReason: result.blockReason ?? null,
          durationMs: result.durationMs,
          sterlingError: null,
        };

        await this.postThoughtToCognition({
          id: `idle-episode-${runId}`,
          type: 'observation',
          content: 'Idle episode (sterling executable)',
          timestamp: Date.now(),
          metadata: {
            thoughtType: 'idle-episode',
            source: 'keepalive',
            reduction,
            goldenRun: { runId, requestedAt: now, source: 'idle_episode' },
          },
          convertEligible: true,
        });
        return 'emitted_executable';
      }

      return 'emitted_blocked';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      recorder.recordIdleEpisode(runId, {
        client_request_id: requestId,
        timeout_origin: errorMessage.includes('idle_episode_timeout') ? 'client' : undefined,
        status: 'error',
        reason: errorMessage,
      });
      console.error('[KeepAliveIntegration] Idle episode failed:', error);
      return 'emitted_error';
    } finally {
      this.idleEpisodeInFlight = false;
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

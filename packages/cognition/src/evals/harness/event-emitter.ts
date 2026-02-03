/**
 * Structured Event Emitter for Eval Harness
 *
 * Writes structured events to events.jsonl file (LF-8).
 * The events.jsonl file is the AUTHORITATIVE source of eval run data.
 * Console logs are for convenience only.
 *
 * All events follow the event_line.schema.json schema.
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Event types that can be emitted.
 */
export type EvalEventType =
  // Suite lifecycle
  | 'eval_suite_loaded'
  | 'eval_suite_invalid'
  | 'eval_mode'
  | 'eval_production_surface'
  // Scenario lifecycle
  | 'eval_scenario_started'
  | 'eval_scenario_result'
  // Thought tracking (end-to-end mode)
  | 'eval_thought_enqueued'
  | 'eval_endpoint_response'
  | 'eval_ack_result'
  | 'eval_ack_mismatch'
  // Summary
  | 'eval_summary'
  | 'eval_error'
  // Keep-alive events
  | 'keepalive_tick'
  | 'keepalive_thought'
  | 'keepalive_steady_state'
  | 'keepalive_skip_cooldown'
  | 'keepalive_skip_not_idle'
  | 'keepalive_bypass'
  | 'keepalive_perception_refresh'
  | 'keepalive_circuit_open'
  | 'keepalive_violation';

/**
 * Run context included in events.
 */
export interface EvalRunContext {
  run_id: string;
  mode?: 'thought_only' | 'end_to_end';
  suite_id?: string;
  frame_profile?: string;
  sampler_profile?: string;
  model_id?: string;
  oracle_version?: string;
}

/**
 * A structured event line.
 */
export interface EvalEvent {
  type: EvalEventType;
  timestamp_ms: number;
  run?: EvalRunContext;
  payload: Record<string, unknown>;
}

// ============================================================================
// Event Emitter Class
// ============================================================================

/**
 * Event emitter that writes structured events to JSONL file.
 *
 * Usage:
 * ```
 * const emitter = new EvalEventEmitter(outputDir, runContext);
 * emitter.emit('eval_scenario_started', { scenario_id: 'test-1' });
 * await emitter.close();
 * ```
 */
export class EvalEventEmitter {
  private outputPath: string;
  private stream: fs.WriteStream | null = null;
  private runContext: EvalRunContext;
  private eventCount = 0;
  private closed = false;

  constructor(outputDir: string, runContext: EvalRunContext) {
    this.outputPath = path.join(outputDir, 'events.jsonl');
    this.runContext = runContext;

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Open write stream
    this.stream = fs.createWriteStream(this.outputPath, { flags: 'w' });
  }

  /**
   * Emit a structured event.
   *
   * @param type - Event type
   * @param payload - Event-specific data
   * @param includeRunContext - Whether to include run context (default: true)
   */
  emit(
    type: EvalEventType,
    payload: Record<string, unknown>,
    includeRunContext = true
  ): void {
    if (this.closed) {
      console.warn(`[EvalEventEmitter] Attempted to emit after close: ${type}`);
      return;
    }

    const event: EvalEvent = {
      type,
      timestamp_ms: Date.now(),
      payload,
    };

    if (includeRunContext) {
      event.run = this.runContext;
    }

    this.writeEvent(event);
  }

  /**
   * Emit an error event.
   */
  emitError(error: Error | string, context?: Record<string, unknown>): void {
    this.emit('eval_error', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
    });
  }

  /**
   * Update run context (e.g., when mode is determined).
   */
  updateRunContext(updates: Partial<EvalRunContext>): void {
    this.runContext = { ...this.runContext, ...updates };
  }

  /**
   * Get the current run context.
   */
  getRunContext(): EvalRunContext {
    return { ...this.runContext };
  }

  /**
   * Get the number of events emitted.
   */
  getEventCount(): number {
    return this.eventCount;
  }

  /**
   * Get the output file path.
   */
  getOutputPath(): string {
    return this.outputPath;
  }

  /**
   * Close the event emitter and flush writes.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.stream) {
      return new Promise((resolve, reject) => {
        this.stream!.end(() => {
          this.stream = null;
          resolve();
        });
        this.stream!.on('error', reject);
      });
    }
  }

  /**
   * Write an event to the stream.
   */
  private writeEvent(event: EvalEvent): void {
    if (!this.stream) return;

    const line = JSON.stringify(event) + '\n';
    this.stream.write(line);
    this.eventCount++;

    // Also log to console for convenience (but events.jsonl is authoritative)
    if (process.env.EVAL_VERBOSE === 'true') {
      console.log(`[Event] ${event.type}:`, JSON.stringify(event.payload).slice(0, 100));
    }
  }
}

// ============================================================================
// Event Builder Helpers
// ============================================================================

/**
 * Build payload for eval_suite_loaded event.
 */
export function buildSuiteLoadedPayload(
  suitePath: string,
  lineCount: number,
  sha256: string
): Record<string, unknown> {
  return {
    path: suitePath,
    line_count: lineCount,
    sha256,
  };
}

/**
 * Build payload for eval_suite_invalid event.
 */
export function buildSuiteInvalidPayload(
  suitePath: string,
  lineNumber: number,
  errors: Array<{ keyword?: string; instancePath?: string; message?: string }>
): Record<string, unknown> {
  return {
    path: suitePath,
    line: lineNumber,
    errors,
  };
}

/**
 * Build payload for eval_production_surface event.
 */
export function buildProductionSurfacePayload(
  version: string,
  digests: Record<string, string>
): Record<string, unknown> {
  return {
    version,
    digests: {
      frame_renderer: digests.frameRenderer,
      goal_extractor: digests.goalExtractor,
      grounder: digests.grounder,
      eligibility: digests.eligibility,
    },
  };
}

/**
 * Build payload for eval_scenario_started event.
 */
export function buildScenarioStartedPayload(
  scenarioId: string,
  frameProfile: { name: string; facts_budget: number; memory_budget: number },
  samplerProfile: { name: string; temperature: number; top_p: number; max_tokens: number }
): Record<string, unknown> {
  return {
    scenario_id: scenarioId,
    frame_profile: frameProfile,
    sampler_profile: samplerProfile,
  };
}

/**
 * Build payload for eval_scenario_result event.
 */
export function buildScenarioResultPayload(
  scenarioId: string,
  output: {
    text: string;
    extracted_goal: { present: boolean; action?: string; target?: string } | null;
    grounding: { pass: boolean; reason: string; referenced_facts: string[]; violations: unknown[] } | null;
    convert_eligible: boolean;
    derived: true;
  },
  checks: Array<{ check_id: string; pass: boolean; reason?: string }>,
  latencyMs: number
): Record<string, unknown> {
  return {
    scenario_id: scenarioId,
    output,
    checks,
    latency_ms: latencyMs,
  };
}

/**
 * Build payload for eval_mode event.
 */
export function buildModePayload(
  mode: 'thought_only' | 'end_to_end',
  planningAckEnabled: boolean,
  evalIsolation: boolean
): Record<string, unknown> {
  return {
    mode,
    planning_ack_enabled: planningAckEnabled,
    eval_isolation: evalIsolation,
  };
}

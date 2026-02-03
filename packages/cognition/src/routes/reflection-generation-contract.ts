/**
 * Reflection Generation Hook — Contract & Implementation Spec
 *
 * This file defines the request/response contract for the cognition service's
 * reflection generation endpoint. It is NOT yet wired as a route — it serves
 * as the specification that the implementation must satisfy.
 *
 * === Contract boundaries ===
 *
 * minecraft-interface (signal emitter):
 *   - Sends minimal trigger + context to cognition service
 *   - Owns: dedupeKey generation, trigger type, game-state snapshot
 *   - Does NOT own: reflection text, emotional analysis, lessons
 *
 * cognition service (reflection generator):
 *   - Owns: LLM prompt, text generation, insight/lesson extraction
 *   - Returns: structured reflection with provenance fields
 *   - Feature-flagged: ENABLE_REFLECTION_GENERATION env var
 *   - Fallback: returns isPlaceholder=true with static text on LLM failure
 *
 * memory service (persistence):
 *   - Owns: deduplication, storage, listing, consolidation policy
 *   - Receives the generated reflection via POST /enhanced/reflections
 *   - Does NOT call cognition — minecraft-interface orchestrates
 *
 * === Determinism invariants ===
 *
 * Deterministic (must be identical across retries/replays):
 *   - dedupeKey (derived from game state, not wall clock)
 *   - memorySubtype
 *   - trigger type
 *
 * Non-deterministic (allowed to vary, tracked via provenance):
 *   - reflection content text (LLM output)
 *   - insights[] and lessons[] (LLM-extracted)
 *   - emotionalValence (LLM-assessed)
 *   - confidence (LLM-derived)
 *
 * === Implementation order ===
 *
 * Step 1: Add POST /generate-reflection route to cognition service
 *         (this file defines the contract; route wiring is separate)
 *
 * Step 2: Update minecraft-interface sleep/death signals to call
 *         cognition first, then POST the result to memory service.
 *         Feature-flagged: skip cognition call if disabled, POST placeholder.
 *
 * Step 3: Add 'reflection_generation' to llm-token-config.ts
 *         (reuse react_reflection: 300 tokens, 0.7 temp as starting point)
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Request: what minecraft-interface sends to cognition
// ============================================================================

/**
 * The trigger context gathered by minecraft-interface before calling cognition.
 * This is the minimal game-state snapshot needed for reflection generation.
 */
export interface ReflectionGenerationRequest {
  /** What triggered this reflection */
  trigger: 'sleep-wake' | 'death-respawn';

  /** Replay-stable dedupe key (owned by minecraft-interface) */
  dedupeKey: string;

  /** Game-state context at trigger time */
  context: {
    /** Current emotional/stress state label */
    emotionalState: string;

    /** What happened recently (last ~5 events as short descriptions) */
    recentEvents: string[];

    /** Active goals from planning service, if available */
    currentGoals: string[];

    /** Bot position at trigger time */
    location: { x: number; y: number; z: number } | null;

    /** Game time of day description */
    timeOfDay: string;

    /** For death: how the bot died (damage source, mob type, etc.) */
    deathCause?: string;

    /** For death: items lost, if known */
    inventoryLost?: string[];

    /** For sleep: game day number */
    gameDay?: number;
  };

  /** Recent memory summaries from memory service (fetched by minecraft-interface) */
  recentMemories?: string[];
}

// ============================================================================
// Response: what cognition returns to minecraft-interface
// ============================================================================

/**
 * The generated reflection, ready to be POSTed to memory service.
 */
export interface ReflectionGenerationResponse {
  /** Whether generation succeeded or fell back to placeholder */
  generated: boolean;

  /** Reflection type for memory service */
  type: 'narrative' | 'failure';

  /** LLM-generated or placeholder reflection text */
  content: string;

  /** Whether this is placeholder content (LLM was unavailable or disabled) */
  isPlaceholder: boolean;

  /** LLM-extracted insights (empty array if placeholder) */
  insights: string[];

  /** LLM-extracted lessons (empty array if placeholder) */
  lessons: string[];

  /** LLM-assessed emotional valence (-1 to 1; 0 if placeholder) */
  emotionalValence: number;

  /** LLM confidence in the reflection quality (0-1; 0.5 if placeholder) */
  confidence: number;

  /** Provenance: which model generated this and how */
  provenance: {
    /** Model identifier (e.g. 'gemma3n:e2b' or 'placeholder') */
    model: string;

    /** Token count used (0 if placeholder) */
    tokensUsed: number;

    /** Generation latency in ms (0 if placeholder) */
    latencyMs: number;

    /** Schema version for forward compatibility */
    schemaVersion: 1;
  };

  /** Echo back the dedupeKey for downstream wiring */
  dedupeKey: string;
}

// ============================================================================
// Feature flag and fallback behavior
// ============================================================================

/**
 * When ENABLE_REFLECTION_GENERATION is falsy or the LLM call fails:
 * - generated: false
 * - isPlaceholder: true
 * - content: static placeholder text (same as current TODOs)
 * - provenance.model: 'placeholder'
 * - insights/lessons: empty arrays
 * - emotionalValence: 0, confidence: 0.5
 *
 * This ensures the pipeline always produces a valid reflection for memory
 * service to persist, even when cognition is down or disabled.
 */

// ============================================================================
// Prompt contract (for the LLM call)
// ============================================================================

/**
 * The system prompt structure for reflection generation.
 * Uses react_reflection token config (300 tokens, 0.7 temp).
 *
 * IMPORTANT: The prompt must NOT include the dedupeKey or any identity
 * metadata — those are deterministic fields that bypass the LLM entirely.
 * The LLM only generates: content text, insights[], lessons[], emotionalValence.
 *
 * Expected LLM output format (parsed, not returned raw to caller):
 *
 * REFLECTION: <1-3 sentences of first-person narrative>
 * INSIGHTS: <comma-separated list, or "none">
 * LESSONS: <comma-separated list, or "none">
 * MOOD: <number from -1.0 to 1.0>
 *
 * If parsing fails, treat the entire response as the reflection content
 * with empty insights/lessons and neutral mood.
 */
export const REFLECTION_PROMPT_TEMPLATE = {
  sleepWake: {
    system: `You are a Minecraft bot reflecting on your day before sleeping. Write a brief first-person reflection about what happened, what you learned, and how you feel. Be specific about game events.

Format your response EXACTLY like this:
REFLECTION: <your reflection>
INSIGHTS: <comma-separated insights, or "none">
LESSONS: <comma-separated lessons, or "none">
MOOD: <number from -1.0 to 1.0>`,
    userTemplate: (ctx: ReflectionGenerationRequest['context'], memories: string[]) =>
      `Day ${ctx.gameDay ?? '?'}: ${ctx.recentEvents.join(', ') || 'Quiet day'}.
Goals: ${ctx.currentGoals.join(', ') || 'None set'}.
Recent memories: ${memories.slice(0, 5).join('; ') || 'None available'}.
Current state: ${ctx.emotionalState}.`,
  },

  deathRespawn: {
    system: `You are a Minecraft bot who just died and respawned. Write a brief first-person reflection about what went wrong, what you should do differently, and how this affects your plans. Be tactical and specific.

Format your response EXACTLY like this:
REFLECTION: <your reflection>
INSIGHTS: <comma-separated insights, or "none">
LESSONS: <comma-separated lessons, or "none">
MOOD: <number from -1.0 to 1.0>`,
    userTemplate: (ctx: ReflectionGenerationRequest['context'], memories: string[]) =>
      `Died${ctx.deathCause ? ` from: ${ctx.deathCause}` : ''}.
Location: ${ctx.location ? `${Math.floor(ctx.location.x)}, ${Math.floor(ctx.location.y)}, ${Math.floor(ctx.location.z)}` : 'unknown'}.
Lost items: ${ctx.inventoryLost?.join(', ') || 'unknown'}.
Goals: ${ctx.currentGoals.join(', ') || 'None set'}.
Recent memories: ${memories.slice(0, 5).join('; ') || 'None available'}.`,
  },
} as const;

// ============================================================================
// Integration sequence (how minecraft-interface orchestrates)
// ============================================================================

/**
 * Orchestration flow for sleep signals (in minecraft-interface server.ts):
 *
 * 1. Sleep action succeeds → capture wakeDay, wakeTime → build dedupeKey
 * 2. (Optional, gated) Fetch recent memories from memory service:
 *      GET /enhanced/memories?limit=5&includeReflections=false
 * 3. (Optional, gated) Call cognition service:
 *      POST /generate-reflection { trigger: 'sleep-wake', dedupeKey, context, recentMemories }
 * 4. POST to memory service:
 *      POST /enhanced/reflections { type, content, context, lessons, insights, dedupeKey, isPlaceholder }
 *    - If step 3 succeeded: use generated content, isPlaceholder=false
 *    - If step 3 failed/disabled: use static placeholder, isPlaceholder=true
 * 5. POST /enhanced/consolidate { trigger: 'sleep-wake' }
 * 6. POST /stress/reset
 *
 * Steps 2-3 are gated behind ENABLE_REFLECTION_GENERATION.
 * Steps 4-6 always run (same as current behavior).
 * Steps 2-3 have a 10s combined timeout. On timeout, fall through to placeholder.
 *
 * Same pattern for death signals, with trigger: 'death-respawn'.
 */

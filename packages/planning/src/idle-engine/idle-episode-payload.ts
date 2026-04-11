/**
 * IdleEpisode payload builder — pure, side-effect-free.
 *
 * Builds the `IDLE_EPISODE_V1\n{json}` raw-text payload that Sterling's
 * intent_reducer_v1 parses in its `_reduce_idle_episode` branch. Sterling
 * then calls `_select_idle_goal(bot_state)` on the parsed bot_state dict
 * to deterministically pick an `(action, target)` pair using its priority
 * ladder (vitals → safety → tool progression → exploration).
 *
 * Wire contract (verified against
 * sterling/python/core/linguistics/reducers/intent_reducer_v1.py:423+):
 *
 * 1. First line MUST be exactly `IDLE_EPISODE_V1` (unbracketed). A prior
 *    version used `[IDLE_EPISODE_V1]` which caused Sterling to take a
 *    different parser path and return is_executable without committing
 *    a goal-prop. Fail-closed behavior catches this, but the test suite
 *    below fences the literal string.
 *
 * 2. Everything after the first `\n` is a JSON blob.
 *
 * 3. JSON must be an object with `kind: "idle_episode_v1"` (lowercase).
 *    Sterling fails closed on any other kind value.
 *
 * 4. JSON must have `bot_state` as a dict. Required fields inside
 *    bot_state (read by `_select_idle_goal`):
 *      - `food` (number): triggers "gather food" when ≤ 6
 *      - `health` (number): triggers "gather food" when ≤ 8 and no hostiles
 *      - `nearby_hostiles` (number | array): triggers "navigate safety"
 *      - `inventory_summary` (Array<{name, count}>): checked for pickaxe
 *        progression (wooden → stone → iron → diamond)
 *
 * 5. Other bot_state fields (position, time_of_day, biome, dimension,
 *    nearby_passives, weather) are tolerated but not required by
 *    `_select_idle_goal`. We include them for provenance/diagnostic
 *    richness — they surface in golden-run reports.
 *
 * 6. Top-level `run_id`, `idle_reason`, `timestamp_ms`, `blocked_tasks`,
 *    and `budgets` are included for provenance and for any future
 *    Sterling-side policies that want them. They do NOT affect the
 *    current `_select_idle_goal` output.
 *
 * Canonicalization: the JSON body is built with explicit field ordering
 * and floored integer positions so the same inputs produce the same
 * raw text across runs. This makes golden-run replays stable and
 * lets IR digests remain consistent when the bot state hasn't changed.
 *
 * @author @darianrosebrook
 */

/**
 * Executor-side state relevant to idle goal requests. A subset of
 * modular-server.ts's full ExecutorState — IdleEngine only needs what
 * Sterling's priority ladder will read plus the provenance fields.
 */
export interface ExecutorIdleState {
  /** Current idle reason from the executor's determineIdleReason(). */
  idleReason: string;
  /** Count of tasks in the active queue (for diagnostic fields). */
  activeTasks: number;
  /** Count of eligible-to-run tasks (should be 0 when idle). */
  eligibleTasks: number;
  /** Blocked task summaries, if idleReason === 'blocked_on_prereq'. */
  blockedTasks?: Array<{
    taskId: string;
    blockedReason: string;
    nextEligibleAt?: number;
  }>;
}

/**
 * Bot state snapshot matching Sterling's _select_idle_goal expectations.
 * All fields are optional at the caller boundary because bot-state fetches
 * can fail; the builder substitutes safe defaults that map to "fully
 * healthy, no threats, empty inventory" so Sterling falls through to the
 * exploration rule when state is unavailable.
 */
export interface BotStateSnapshot {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  timeOfDay?: number;
  weather?: string;
  biome?: string;
  dimension?: string;
  nearbyHostiles?: number;
  nearbyPassives?: number;
  inventory?: Array<{ name: string; count: number; displayName?: string }>;
}

/**
 * Output of the payload builder: the raw text to send to Sterling, plus
 * a deterministic run ID for golden-run provenance linkage.
 */
export interface IdleEpisodePayload {
  /** Raw text matching the IDLE_EPISODE_V1 wire format. */
  rawText: string;
  /** Deterministic run identifier derived from the payload hash. */
  runId: string;
  /** Canonicalized bot_state dict as it appears in the payload (for logging). */
  canonicalBotState: Record<string, unknown>;
}

/**
 * Deterministic run ID generator. Uses a simple hash of the stable fields
 * so identical inputs produce identical run IDs — useful for dedupe and
 * replay. Not cryptographic; just needs to be collision-resistant for
 * the small number of idle episodes per run.
 */
function deriveRunId(
  idleReason: string,
  flooredPosition: { x: number; y: number; z: number } | undefined,
  health: number,
  food: number,
  timestamp: number
): string {
  // We include timestamp so distinct idle episodes get distinct IDs even
  // when bot state is unchanged. Sterling uses the run ID as a correlation
  // key; collisions would confuse golden-run linkage.
  const posStr = flooredPosition
    ? `${flooredPosition.x},${flooredPosition.y},${flooredPosition.z}`
    : 'nopos';
  return `idle_engine_${idleReason}_${posStr}_h${health}_f${food}_${timestamp}`;
}

/**
 * Build a canonicalized bot_state dict that matches Sterling's expected
 * field names and is stable across runs.
 *
 * Field mapping:
 *   TS `timeOfDay` → Python `time_of_day`
 *   TS `nearbyHostiles` → Python `nearby_hostiles`
 *   TS `nearbyPassives` → Python `nearby_passives`
 *   TS `inventory` → Python `inventory_summary` (sorted by name for stability)
 *
 * Defaults: if a field is undefined, we substitute a value that Sterling's
 * priority ladder treats as "healthy, no threats" so missing state cannot
 * falsely trigger vitals or safety goals.
 */
function canonicalizeBotState(botState: BotStateSnapshot): Record<string, unknown> {
  const pos = botState.position;
  // Floor positions to integers — Sterling doesn't care about sub-block
  // precision and floored positions produce stable run IDs across ticks.
  const flooredPosition = pos
    ? {
        x: Math.floor(pos.x),
        y: Math.floor(pos.y),
        z: Math.floor(pos.z),
      }
    : undefined;

  // Sort inventory by name for canonicalization stability. Two snapshots
  // with the same items in different order should produce identical
  // canonical representations.
  const inventorySummary = (botState.inventory ?? [])
    .map((i) => ({ name: i.name, count: i.count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    position: flooredPosition,
    // Defaults: 20/20 = full health and food in Minecraft. Missing bot
    // state should not make Sterling think the bot is dying.
    health: botState.health ?? 20,
    food: botState.food ?? 20,
    time_of_day: botState.timeOfDay,
    weather: botState.weather,
    biome: botState.biome,
    dimension: botState.dimension,
    nearby_hostiles: botState.nearbyHostiles ?? 0,
    nearby_passives: botState.nearbyPassives ?? 0,
    inventory_summary: inventorySummary,
  };
}

/**
 * Build an IDLE_EPISODE_V1 payload for Sterling.
 *
 * The output's `rawText` is suitable to pass directly to
 * `languageIOClient.reduce(rawText, { modelId, promptDigest: 'idle_episode_v1' })`.
 *
 * @param executorState - Current executor idle context
 * @param botState - Bot state snapshot (may have missing fields)
 * @param timestamp - Optional timestamp override for deterministic testing
 */
export function buildIdleEpisodePayload(
  executorState: ExecutorIdleState,
  botState: BotStateSnapshot,
  timestamp: number = Date.now()
): IdleEpisodePayload {
  const canonicalBotState = canonicalizeBotState(botState);

  // Extract the floored position from the canonical state for the run ID.
  // (canonicalBotState.position is already floored.)
  const flooredPosition = canonicalBotState.position as
    | { x: number; y: number; z: number }
    | undefined;

  const runId = deriveRunId(
    executorState.idleReason,
    flooredPosition,
    canonicalBotState.health as number,
    canonicalBotState.food as number,
    timestamp
  );

  const payload = {
    kind: 'idle_episode_v1',
    run_id: runId,
    idle_reason: executorState.idleReason,
    timestamp_ms: timestamp,
    bot_state: canonicalBotState,
    blocked_tasks: (executorState.blockedTasks ?? []).map((bt) => ({
      task_id: bt.taskId,
      blocked_reason: bt.blockedReason,
      next_eligible_at: bt.nextEligibleAt,
    })),
    budgets: {
      // These budgets are passed to Sterling for any future policy that
      // wants to gate solver work against them. _select_idle_goal doesn't
      // currently use them but emitting them is cheap and keeps the
      // payload shape stable across Sterling-side policy evolution.
      max_steps: 8,
      max_ms: 2000,
    },
  };

  // Header line MUST be unbracketed. See the wire contract note at the
  // top of this file for why. Also: use JSON.stringify without indent so
  // the body is compact and the run-id hash stays stable.
  const rawText = `IDLE_EPISODE_V1\n${JSON.stringify(payload)}`;

  return {
    rawText,
    runId,
    canonicalBotState,
  };
}

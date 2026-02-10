/**
 * Hunger Driveshaft Controller — Autonomous Goal-Driven Food Consumption
 *
 * Routes through the REAL goal formulation pipeline:
 *   HomeostasisMonitor.sample() → generateNeeds() → GoalGenerator.generateCandidates()
 *   → PriorityScorer.rankGoals() → goal selection → task construction
 *
 * The only bypass is Sterling planning for the final step, because "eat food"
 * is locally decidable (no pathfinding or crafting needed).
 *
 * Hysteresis-based threshold control prevents oscillation:
 *   - Fires at T_low (triggerThreshold)
 *   - Disarms after firing
 *   - Re-arms only when food >= T_high (resetThreshold)
 *
 * @author @darianrosebrook
 */

import { randomUUID } from 'node:crypto';
import type { ContentHash } from '../sterling/solve-bundle-types';
import { canonicalize, contentHash } from '../sterling/solve-bundle';
import { HomeostasisMonitor } from './homeostasis-monitor';
import { generateNeeds } from './need-generator';
import { GoalGenerator, type CandidateGoal, type WorldState } from './goal-generator';
import { PriorityScorer, type PlanningContext, type PriorityScore } from './priority-scorer';
import { GoalType, NeedType, type Need } from '../types';
import {
  type AutonomyProofIdentity,
  type AutonomyProofBundleV1,
  createAutonomyProofBundle,
  deriveGoalId,
} from './autonomy-proof-bundle';
import type { ReflexLifecycleEmitter, EnqueueSkipReasonType } from './reflex-lifecycle-events';

// ============================================================================
// Configuration
// ============================================================================

export interface HungerDriveshaftConfig {
  /** T_low: trigger when food <= this (default: 12) */
  triggerThreshold: number;
  /** T_high: disable until food >= this (default: 16) */
  resetThreshold: number;
  /**
   * Preempt even with existing task backlog (default: 5).
   *
   * This must be strictly below the food level where eat_immediate
   * template fires. The template requires need.urgency > 0.7, which
   * maps to hunger > 0.7, which means food < 6. So criticalThreshold
   * must be <= 5 for preemption to actually produce an eat goal.
   */
  criticalThreshold: number;
  emitter?: ReflexLifecycleEmitter;
}

const DEFAULT_CONFIG: HungerDriveshaftConfig = {
  triggerThreshold: 12,
  resetThreshold: 16,
  criticalThreshold: 5,
};

// ============================================================================
// Bot State Input
// ============================================================================

export interface BotHungerState {
  /** Raw food level 0-20 */
  food: number;
  /** Inventory items with name and count */
  inventory: Array<{ name: string; count: number }>;
}

// ============================================================================
// Result Types
// ============================================================================

export interface HungerDriveshaftResult {
  goal: CandidateGoal;
  taskData: {
    title: string;
    description: string;
    type: string;
    priority: number;
    urgency: number;
    source: 'autonomous';
    steps: Array<{
      id: string;
      label: string;
      done: boolean;
      order: number;
      meta: {
        leaf: string;
        args: Record<string, unknown>;
        executable: boolean;
      };
    }>;
  };
  /** Content-addressed semantic identity (need + template). For dedup. */
  goalKey: string;
  /**
   * Unique per-emission join key (UUID). Used to correlate trigger → completion.
   * NOT content-addressed — each call to evaluate() produces a new one.
   * This is the key stored in task metadata and the accumulator map.
   */
  reflexInstanceId: string;
  proofAccumulator: ProofAccumulator;
}

/** Intermediate state for assembling the final proof bundle on task completion */
export interface ProofAccumulator {
  /** Content-addressed semantic identity (need + template). For bundle hash. */
  goalKey: string;
  /** Unique per-emission join key (UUID). For accumulator lookup. */
  reflexInstanceId: string;
  triggeredAt: number;
  goalFormulatedAt: number;
  taskCreatedAt: number;
  triggerState: BotHungerState;
  foodItem: string;
  foodCount: number;
  goalId: string;
  homeostasisDigest: ContentHash;
  candidatesDigest: ContentHash;
  templateName: string;
  goalDescription: string;
}

// ============================================================================
// Food Detection (conservative subset — leaf owns authoritative selection)
// ============================================================================

// TODO: The leaf's isFoodItem() in interaction-leaves.ts is the authority for
// food detection. This list is a conservative subset used ONLY for the
// "do we have food?" precondition gate. If this drifts from the leaf,
// the worst case is a false negative (reflex doesn't fire when it could).
const KNOWN_FOODS = new Set([
  'bread',
  'cooked_beef',
  'cooked_porkchop',
  'apple',
  'carrot',
  'baked_potato',
  'cooked_chicken',
  'cooked_mutton',
  'cooked_rabbit',
  'cooked_cod',
  'cooked_salmon',
  'golden_apple',
  'golden_carrot',
  'melon_slice',
  'sweet_berries',
  'pumpkin_pie',
  'cookie',
  'mushroom_stew',
  'beetroot_soup',
  'rabbit_stew',
  'beetroot',
  'dried_kelp',
]);

export function isFood(name: string): boolean {
  return KNOWN_FOODS.has(name);
}

// ============================================================================
// WorldState Adapter
// ============================================================================

/**
 * Thin wrapper adapting BotHungerState to the WorldState interface
 * required by the goal-formulation pipeline.
 */
function createWorldStateFromBotState(state: BotHungerState): WorldState {
  return {
    getHunger: () => 1 - state.food / 20,
    getHealth: () => 1,
    getEnergy: () => 0.8,
    getSafety: () => 0.9,
    hasItem: (item: string, qty = 1) => {
      if (item === 'food') {
        return state.inventory.some((i) => isFood(i.name) && i.count >= qty);
      }
      return state.inventory.some((i) => i.name === item && i.count >= qty);
    },
    nearbyFood: () => false,
    getTimeOfDay: () => 'day',
    getThreatLevel: () => 0,
    getNearbyPlayers: () => 0,
    getLightLevel: () => 15,
    getArmorLevel: () => 0,
    getWeapons: () => [],
    getLastMealTime: () => Date.now() - 600000,
    getLastSafeTime: () => Date.now(),
    hasContainer: () => false,
    hasFarmSupplies: () => false,
    hasRedstoneComponents: () => false,
    hasBuildingMaterials: () => false,
    hasCombatEquipment: () => false,
    getEnvironmentalComfort: () => 0.6,
    getStructuralIntegrity: () => 0.5,
    getMechanicalComplexity: () => 0,
    getAgriculturalPotential: () => 0,
    getDefensiveStrength: () => 0,
  };
}

// ============================================================================
// Proof Verification (stricter than executor verification)
// ============================================================================

/**
 * Closed enum of verification failure/success reasons.
 *
 * Each test case must assert the exact reason — no freeform strings.
 * Operators can query/filter by reason to diagnose proof failures.
 */
export const VerificationReason = {
  /** Leaf receipt explicitly confirmed items were consumed */
  RECEIPT_CONFIRMS_CONSUMPTION: 'receipt_confirms_consumption',
  /** Food level increased AND inventory shows food item count decreased */
  FOOD_INCREASED_AND_CONSUMED: 'food_increased_and_consumed',
  /** Food level increased but no food items were tracked in before-state inventory */
  FOOD_INCREASED_BUT_INVENTORY_UNAVAILABLE: 'food_increased_but_inventory_unavailable',
  /** Food level increased but inventory shows no food decrease and no receipt */
  FOOD_INCREASED_BUT_NO_CONSUMPTION_EVIDENCE: 'food_increased_but_no_consumption_evidence',
  /** No food increase and no receipt — no evidence of eating at all */
  NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE: 'no_food_increase_or_consumption_evidence',
  /** After-state could not be fetched (getBotState failure at completion time) */
  AFTER_STATE_UNAVAILABLE: 'after_state_unavailable',
} as const;

export type VerificationReasonType = typeof VerificationReason[keyof typeof VerificationReason];

/** All valid reason values, for exhaustiveness assertions in tests */
export const ALL_VERIFICATION_REASONS = Object.values(VerificationReason);

export interface VerificationResult {
  verified: boolean;
  reason: VerificationReasonType;
}

/**
 * Verify that the reflex actually caused food consumption.
 *
 * Stricter than the executor's verifyConsumeFood() — requires corroborating
 * evidence that food was actually consumed, not just that food level changed.
 *
 * Rules (ALL verified paths require at least one corroboration):
 *   1. Receipt confirms consumption (itemsConsumed > 0) → verified
 *   2. Food increased AND edible inventory decreased → verified
 *   3. Food increased but no inventory/receipt evidence → FAILS
 *   4. No food increase and no receipt → FAILS
 *   5. Inventory unavailable (empty before AND after) → treated as
 *      "inventory_unavailable", passes only if receipt confirms
 *
 * If proof verification fails, the bundle records execution.result: 'error'
 * even if the executor step completed.
 */
export function verifyProof(
  before: { food: number; inventory: Record<string, number> },
  after: { food: number; inventory: Record<string, number> } | null,
  leafReceipt: {
    foodConsumed?: string;
    hungerRestored?: number;
    itemsConsumed?: number;
  },
): VerificationResult {
  // Path 0: After-state unavailable (getBotState failed at completion time)
  if (after === null) {
    return { verified: false, reason: VerificationReason.AFTER_STATE_UNAVAILABLE };
  }

  const receiptConfirmsEating = (leafReceipt.itemsConsumed ?? 0) > 0;

  // Path 1: Receipt is authoritative if present
  if (receiptConfirmsEating) {
    return { verified: true, reason: VerificationReason.RECEIPT_CONFIRMS_CONSUMPTION };
  }

  const foodIncreased = after.food > before.food;

  const anyFoodDecreased = Object.entries(before.inventory).some(
    ([item, count]) => {
      const afterCount = after.inventory[item] ?? 0;
      return isFood(item) && afterCount < count;
    },
  );

  // Path 2: Food increased AND inventory shows food was consumed
  if (foodIncreased && anyFoodDecreased) {
    return { verified: true, reason: VerificationReason.FOOD_INCREASED_AND_CONSUMED };
  }

  // Path 3: Food increased but no corroborating evidence → FAIL
  // This is the key strictness difference from the executor verifier.
  // The executor allows food increase alone; the proof verifier does not.
  if (foodIncreased && !anyFoodDecreased) {
    // Check if inventory data was available at all
    const beforeHasFood = Object.keys(before.inventory).some((k) => isFood(k));
    if (!beforeHasFood) {
      return { verified: false, reason: VerificationReason.FOOD_INCREASED_BUT_INVENTORY_UNAVAILABLE };
    }
    return { verified: false, reason: VerificationReason.FOOD_INCREASED_BUT_NO_CONSUMPTION_EVIDENCE };
  }

  // Path 4: No food increase and no receipt
  return { verified: false, reason: VerificationReason.NO_FOOD_INCREASE_OR_CONSUMPTION_EVIDENCE };
}

// ============================================================================
// Controller
// ============================================================================

export type IdleReason = 'no_tasks' | 'all_in_backoff' | 'circuit_breaker_open' | 'blocked_on_prereq' | 'manual_pause';

export class HungerDriveshaftController {
  private config: HungerDriveshaftConfig;
  private armed = true;
  private emitter?: ReflexLifecycleEmitter;

  // Pipeline instances — real, not mocked
  private homeostasisMonitor: HomeostasisMonitor;
  private goalGenerator: GoalGenerator;
  private priorityScorer: PriorityScorer;

  // Proof accumulators keyed by goalKey for event-driven join.
  // Evicted after ACCUMULATOR_TTL_MS to prevent memory leaks from
  // tasks that never complete (crash, cancel, dedupe).
  private accumulators = new Map<string, ProofAccumulator>();

  /** Max age for accumulators before eviction (30 minutes) */
  private static readonly ACCUMULATOR_TTL_MS = 30 * 60 * 1000;
  /** Max number of accumulators to prevent unbounded growth */
  private static readonly ACCUMULATOR_MAX_SIZE = 50;

  constructor(config?: Partial<HungerDriveshaftConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.emitter = this.config.emitter;
    this.homeostasisMonitor = new HomeostasisMonitor();
    this.goalGenerator = new GoalGenerator();
    this.priorityScorer = new PriorityScorer();
  }

  /** Check if current food level is at critical threshold */
  isCritical(state: BotHungerState): boolean {
    return state.food <= this.config.criticalThreshold;
  }

  /** Get hysteresis armed state (for testing) */
  isArmed(): boolean {
    return this.armed;
  }

  /** Get a stored proof accumulator by reflexInstanceId (per-emission join key) */
  getAccumulator(reflexInstanceId: string): ProofAccumulator | undefined {
    return this.accumulators.get(reflexInstanceId);
  }

  /**
   * Emit task_enqueued event after addTask() returns a real task ID.
   * Called by the integration layer (modular-server.ts), NOT by the controller.
   * This bridges the gap between task_planned (pending ID) and real enqueue.
   */
  emitTaskEnqueued(reflexInstanceId: string, realTaskId: string, goalId: string): void {
    this.emitter?.emit({
      type: 'task_enqueued',
      reflexInstanceId,
      task_id: realTaskId,
      goal_id: goalId,
      ts: Date.now(),
    });
  }

  /**
   * Emit task_enqueue_skipped event when addTask() does NOT yield a new task.
   * Called by the integration layer when enqueue fails, deduplicates, or returns null.
   *
   * Also evicts the accumulator for this reflexInstanceId, since no completion
   * event will ever arrive to clean it up.
   */
  emitTaskEnqueueSkipped(
    reflexInstanceId: string,
    goalId: string,
    reason: EnqueueSkipReasonType,
    existingTaskId?: string,
  ): void {
    this.emitter?.emit({
      type: 'task_enqueue_skipped',
      reflexInstanceId,
      goal_id: goalId,
      reason,
      existing_task_id: existingTaskId,
      ts: Date.now(),
    });
    // Evict accumulator — no completion event will arrive to clean it up
    this.accumulators.delete(reflexInstanceId);
  }

  /**
   * Remove an accumulator by reflexInstanceId.
   * Used by the integration layer when it knows no completion will arrive.
   */
  evictAccumulator(reflexInstanceId: string): void {
    this.accumulators.delete(reflexInstanceId);
  }

  /**
   * Evict stale accumulators (older than TTL) and enforce max size.
   * Called opportunistically on evaluate() and buildProofBundle().
   */
  private evictStaleAccumulators(): void {
    const now = Date.now();
    for (const [key, acc] of this.accumulators) {
      if (now - acc.triggeredAt > HungerDriveshaftController.ACCUMULATOR_TTL_MS) {
        this.accumulators.delete(key);
      }
    }
    // Enforce max size: evict oldest first
    if (this.accumulators.size > HungerDriveshaftController.ACCUMULATOR_MAX_SIZE) {
      const entries = [...this.accumulators.entries()]
        .sort((a, b) => a[1].triggeredAt - b[1].triggeredAt);
      const toEvict = entries.length - HungerDriveshaftController.ACCUMULATOR_MAX_SIZE;
      for (let i = 0; i < toEvict; i++) {
        this.accumulators.delete(entries[i][0]);
      }
    }
  }

  /**
   * Evaluate whether the hunger reflex should fire.
   *
   * Routes through the REAL goal-formulation pipeline:
   * homeostasis → needs → goal candidates → priority scoring → selection
   *
   * Returns null if the reflex should not fire (thresholds, hysteresis, etc.)
   *
   * @param opts.dryRun — if true, runs the full pipeline but does NOT disarm
   *   hysteresis or store an accumulator. Use this in shadow mode to get
   *   accurate "would fire" results without consuming the reflex.
   */
  async evaluate(
    botState: BotHungerState,
    idleReason: IdleReason | string,
    opts?: { dryRun?: boolean },
  ): Promise<HungerDriveshaftResult | null> {
    this.evictStaleAccumulators();
    const triggeredAt = Date.now();
    const dryRun = opts?.dryRun ?? false;

    // 1. Hysteresis gate
    // In dryRun mode, check armed state but don't re-arm — we're just observing.
    if (!this.armed) {
      if (botState.food >= this.config.resetThreshold) {
        if (!dryRun) this.armed = true;
        // In dryRun, treat as armed for this evaluation so we can report what would happen
      } else {
        return null;
      }
    }

    // 2. Threshold check
    if (botState.food > this.config.triggerThreshold) {
      return null;
    }

    // 3. Preemption check
    const isCritical = botState.food <= this.config.criticalThreshold;
    if (!isCritical && idleReason !== 'no_tasks') {
      return null;
    }

    // 4. Food availability gate
    const firstFood = botState.inventory.find((i) => isFood(i.name) && i.count > 0);
    if (!firstFood) {
      return null;
    }

    // 5. REAL PIPELINE — not a shortcut
    // 5a. Homeostasis sample
    const hungerNormalized = Math.round((1 - botState.food / 20) * 100) / 100;
    const homeostasisState = this.homeostasisMonitor.sample({
      hunger: hungerNormalized,
    });
    const homeostasisDigest = contentHash(canonicalize(homeostasisState));

    // 5b. Generate needs
    const needs = generateNeeds(homeostasisState);

    // 5c. Find the SURVIVAL need with hunger/nutrition description
    const hungerNeed = needs.find(
      (n) => n.type === NeedType.SURVIVAL && n.description.toLowerCase().includes('hunger'),
    );
    if (!hungerNeed) {
      return null;
    }

    // 5d. Build WorldState adapter
    const worldState = createWorldStateFromBotState(botState);

    // 5e. Generate candidates from hunger need
    const candidates = await this.goalGenerator.generateCandidates(
      [hungerNeed],
      worldState,
    );
    const candidatesDigest = contentHash(canonicalize(candidates.map((c) => ({
      id: c.id,
      type: c.type,
      description: c.description,
      priority: c.priority,
    }))));

    // 5f. Find the eat_immediate candidate (GoalType.SURVIVAL with 'Eat food' description)
    const eatGoal = candidates.find(
      (c) => c.type === GoalType.SURVIVAL && c.description.toLowerCase().includes('eat food'),
    );
    if (!eatGoal) {
      // Template didn't match — hunger urgency wasn't high enough or no food via hasItem
      return null;
    }

    // 5g. Priority scoring (build minimal context)
    const context: PlanningContext = {
      activePromises: [],
      candidateGoals: candidates,
      recentGoalHistory: [],
      timeSinceLastSimilar: () => Infinity,
    };
    const ranked = this.priorityScorer.rankGoals(candidates, worldState, context);
    const topRanked = ranked[0];
    if (!topRanked || topRanked.goal !== eatGoal) {
      // Something else ranked higher — respect the pipeline's judgment
      return null;
    }

    // 5h. Disarm hysteresis (skip in dryRun — shadow mode shouldn't consume the reflex)
    if (!dryRun) this.armed = false;

    // Per-emission join key — unique to this specific reflex firing.
    // NOT content-addressed: each evaluate() call gets a new UUID.
    // This is used to correlate trigger → task → completion in the accumulator map.
    // Generated early so all lifecycle events can carry it.
    const reflexInstanceId = randomUUID();

    // Content-derived stable IDs
    // food_item is excluded: the leaf chooses which food to consume,
    // so the goal's semantic identity is "eat food" not "eat bread."
    const goalId = deriveGoalId('survival', 'eat_immediate');
    const goalKey = contentHash(
      canonicalize({
        need_type: 'survival',
        template: 'eat_immediate',
      }),
    );

    const goalFormulatedAt = Date.now();

    // Emit goal_formulated event (always — even in dryRun for shadow observability)
    this.emitter?.emit({
      type: 'goal_formulated',
      reflexInstanceId,
      goal_id: goalId,
      need_type: 'survival',
      trigger_digest: homeostasisDigest,
      candidates_digest: candidatesDigest,
      ts: goalFormulatedAt,
    });

    // 6. Task construction (bypasses Sterling — locally decidable)
    //
    // Args match the leaf contract in leaf-arg-contracts.ts:
    //   consume_food: { ?food_type:string, ?amount:number }
    // We pass explicit defaults rather than relying on the leaf's
    // internal defaults, so the proof identity is unambiguous.
    const CONSUME_FOOD_ARGS = { food_type: 'any', amount: 1 } as const;

    const taskCreatedAt = Date.now();
    const taskData = {
      title: `Eat food (reflex)`,
      description: `Autonomous hunger reflex: consume food to restore food level`,
      type: 'survival',
      priority: eatGoal.priority,
      urgency: hungerNeed.urgency,
      source: 'autonomous' as const,
      steps: [
        {
          id: `step-consume-${goalKey.slice(0, 8)}`,
          label: `Consume food`,
          done: false,
          order: 0,
          meta: {
            leaf: 'consume_food',
            args: { ...CONSUME_FOOD_ARGS },
            executable: true,
          },
        },
      ],
    };

    // Emit task_planned only in live mode — in dryRun/shadow, no task will be
    // enqueued, so emitting task_planned would be misleading. The corresponding
    // task_enqueued event is emitted by the integration layer after addTask().
    if (!dryRun) {
      this.emitter?.emit({
        type: 'task_planned',
        reflexInstanceId,
        task_id: `pending-${reflexInstanceId.slice(0, 8)}`,
        goal_id: goalId,
        ts: taskCreatedAt,
      });
    }

    // Build proof accumulator for event-driven join on completion
    const accumulator: ProofAccumulator = {
      goalKey,
      reflexInstanceId,
      triggeredAt,
      goalFormulatedAt,
      taskCreatedAt,
      triggerState: { ...botState, inventory: [...botState.inventory] },
      foodItem: firstFood.name,
      foodCount: firstFood.count,
      goalId,
      homeostasisDigest,
      candidatesDigest,
      templateName: 'eat_immediate',
      goalDescription: eatGoal.description,
    };

    // In dryRun mode, don't store accumulators — no task will be injected
    // so no completion event will ever clean them up.
    if (!dryRun) {
      this.accumulators.set(reflexInstanceId, accumulator);
    }

    return {
      goal: eatGoal,
      taskData,
      goalKey,
      reflexInstanceId,
      proofAccumulator: accumulator,
    };
  }

  /**
   * Build the final proof bundle when the task completes.
   * This is the event-driven join: controller owns the goalKey, task carries it,
   * and completion joins everything into the final bundle.
   */
  buildProofBundle(
    accumulator: ProofAccumulator,
    execution: {
      result: 'ok' | 'error' | 'skipped';
      receipt: Record<string, unknown>;
      taskId: string;
    },
    afterState: {
      food_after: number;
      inventory_after: Array<{ name: string; count: number }>;
    } | null,
  ): AutonomyProofBundleV1 {
    this.evictStaleAccumulators();
    const completedAt = Date.now();

    // Build inventory maps for verification
    const beforeInventory: Record<string, number> = {};
    for (const item of accumulator.triggerState.inventory) {
      beforeInventory[item.name] = (beforeInventory[item.name] ?? 0) + item.count;
    }
    const afterInventory: Record<string, number> = {};
    if (afterState) {
      for (const item of afterState.inventory_after) {
        afterInventory[item.name] = (afterInventory[item.name] ?? 0) + item.count;
      }
    }

    // Run proof verification (stricter than executor)
    const verification = verifyProof(
      { food: accumulator.triggerState.food, inventory: beforeInventory },
      afterState ? { food: afterState.food_after, inventory: afterInventory } : null,
      execution.receipt as { foodConsumed?: string; hungerRestored?: number; itemsConsumed?: number },
    );

    // Determine items consumed from inventory delta.
    // Sorted for deterministic hashing — canonicalize() preserves array order,
    // so we must ensure the order is stable regardless of Object.entries iteration.
    const itemsConsumed: string[] = [];
    if (afterState) {
      for (const [item, count] of Object.entries(beforeInventory)) {
        if (isFood(item) && (afterInventory[item] ?? 0) < count) {
          itemsConsumed.push(item);
        }
      }
    }
    itemsConsumed.sort();

    const foodAfter = afterState?.food_after ?? null;
    const foodDelta = foodAfter !== null ? foodAfter - accumulator.triggerState.food : null;

    // Override execution result if proof verification fails
    const proofResult = verification.verified ? execution.result : 'error';

    const identity: AutonomyProofIdentity = {
      trigger: {
        hunger_value: Math.round((1 - accumulator.triggerState.food / 20) * 100) / 100,
        threshold: this.config.triggerThreshold,
        food_level: accumulator.triggerState.food,
      },
      preconditions: {
        food_available: true,
      },
      goal: {
        need_type: 'survival',
        template_name: accumulator.templateName,
        description: accumulator.goalDescription,
      },
      task: {
        steps: [{ leaf: 'consume_food', args: { food_type: 'any', amount: 1 } }],
      },
      execution: {
        result: proofResult,
      },
      verification: {
        food_before: accumulator.triggerState.food,
        food_after: foodAfter,
        delta: foodDelta,
        items_consumed: itemsConsumed,
      },
    };

    const bundle = createAutonomyProofBundle(identity, {
      proof_id: randomUUID(),
      goal_id: accumulator.goalId,
      task_id: execution.taskId,
      homeostasis_sample_digest: accumulator.homeostasisDigest,
      candidates_digest: accumulator.candidatesDigest,
      execution_receipt: execution.receipt,
      candidate_food_item: accumulator.foodItem,
      candidate_food_count: accumulator.foodCount,
      timing: {
        trigger_to_goal_ms: accumulator.goalFormulatedAt - accumulator.triggeredAt,
        goal_to_task_ms: accumulator.taskCreatedAt - accumulator.goalFormulatedAt,
        task_to_execution_ms: completedAt - accumulator.taskCreatedAt,
        total_ms: completedAt - accumulator.triggeredAt,
      },
      triggered_at: accumulator.triggeredAt,
    });

    // Emit completion-time lifecycle events.
    // NOTE: task_planned is emitted during evaluate(), not here.
    // Event ordering: goal_formulated → task_planned → task_enqueued → ... → goal_verified → goal_closed
    this.emitter?.emit({
      type: 'goal_verified',
      reflexInstanceId: accumulator.reflexInstanceId,
      goal_id: accumulator.goalId,
      verification_digest: contentHash(canonicalize(verification)),
      ts: completedAt,
    });

    this.emitter?.emit({
      type: 'goal_closed',
      reflexInstanceId: accumulator.reflexInstanceId,
      goal_id: accumulator.goalId,
      success: verification.verified,
      reason: verification.reason,
      bundle_hash: bundle.bundle_hash,
      ts: completedAt,
    });

    // Clean up accumulator using the per-emission join key
    this.accumulators.delete(accumulator.reflexInstanceId);

    return bundle;
  }
}

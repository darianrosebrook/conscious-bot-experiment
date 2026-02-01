/**
 * Temporal Enrichment — Single Orchestration Entrypoint
 *
 * Answers: given goal + rules + observed context + mode, what temporal
 * enrichments apply and is it deadlocked?
 *
 * Three modes:
 *   'off'                — No temporal processing. Returns inert enrichment.
 *   'local_only'         — Deadlock check + batch hints + rule annotation,
 *                          but temporal fields are NOT sent to Sterling.
 *   'sterling_temporal'  — Full enrichment. Temporal fields will be sent
 *                          to Sterling (requires Phase 4 Python support).
 *
 * Takes an injected P03TemporalAdapter — the exact semantics exercised
 * by conformance tests are the same semantics used here.
 */

import type {
  P03TemporalAdapter,
  P03TemporalStateV1,
  P03DeadlockCheckV1,
  P03BatchOperatorV1,
} from '../sterling/primitives/p03/p03-capsule-types';
import type { MinecraftCraftingRule } from '../sterling/minecraft-crafting-types';
import { makeTemporalState, type MakeTemporalStateInput } from './time-state';
import { annotateRuleWithDuration } from './duration-model';
import { deriveSlotNeeds } from './deadlock-prevention';
import { getBatchHint, MINECRAFT_BATCH_OPERATORS, type BatchHint } from './batch-operators';

// ── Types ──────────────────────────────────────────────────────────

export type TemporalMode = 'off' | 'local_only' | 'sterling_temporal';

export interface TemporalEnrichment {
  /** Active temporal mode. */
  readonly mode: TemporalMode;

  /** Constructed temporal state (absent when mode='off'). */
  readonly temporalState?: P03TemporalStateV1;

  /** Deadlock check result (absent when mode='off'). */
  readonly deadlock?: P03DeadlockCheckV1;

  /**
   * Enrich a crafting rule with duration and slot annotations.
   * Returns a new rule object with added fields when mode is active.
   * The original rule is never mutated.
   *
   * When mode='off', returns the same rule reference (no copy).
   * Callers must treat the returned rule as readonly.
   */
  readonly enrichRule: (rule: Readonly<MinecraftCraftingRule>, goalCount?: number) => EnrichedCraftingRule;

  /**
   * Get batch preference hint for a given item type and count.
   * When mode='off', always returns { useBatch: false }.
   */
  readonly batchHint: (itemType: string, goalCount: number) => BatchHint;
}

/**
 * A MinecraftCraftingRule with optional temporal annotations.
 * The base rule fields are always present; temporal fields are
 * added when the enrichment mode is active.
 */
export interface EnrichedCraftingRule extends MinecraftCraftingRule {
  /** Duration in ticks (added by temporal enrichment). */
  readonly durationTicks?: number;
  /** Slot type required (added by temporal enrichment). */
  readonly requiresSlotType?: string;
}

// ── Inert Enrichment (mode='off') ──────────────────────────────────

/** Frozen singleton — returned by batchHint when mode='off'. */
const NO_BATCH: Readonly<BatchHint> = Object.freeze({ useBatch: false });

/**
 * Static inert enrichment for mode='off'.
 *
 * enrichRule returns the same rule reference (no copy). This is safe
 * because the solver path treats rules as readonly after construction.
 * If a future caller mutates rules, this becomes a footgun — enforce
 * readonly at the type level in any such path.
 *
 * batchHint returns a frozen singleton to avoid per-call allocation
 * and eliminate reference-equality noise in traces/tests.
 */
const INERT_ENRICHMENT: TemporalEnrichment = Object.freeze({
  mode: 'off' as const,
  enrichRule: (rule: Readonly<MinecraftCraftingRule>) => rule,
  batchHint: () => NO_BATCH,
});

// ── Enrichment Construction ────────────────────────────────────────

export interface ComputeEnrichmentInput {
  /** Temporal mode. */
  mode: TemporalMode;
  /** The injected adapter instance. */
  adapter: P03TemporalAdapter;
  /** Domain observation for state construction. */
  stateInput: MakeTemporalStateInput;
  /** Rules that will be sent to the solver (for deadlock derivation). */
  rules: readonly MinecraftCraftingRule[];
  /** Batch operators available (defaults to MINECRAFT_BATCH_OPERATORS). */
  batchOperators?: readonly P03BatchOperatorV1[];
}

/**
 * Compute temporal enrichment for a solve attempt.
 *
 * This is the single entrypoint that the solver (Phase 3) will call.
 * All temporal logic flows through the injected adapter — no
 * reimplementation of conformance-proven semantics.
 */
export function computeTemporalEnrichment(input: ComputeEnrichmentInput): TemporalEnrichment {
  if (input.mode === 'off') {
    return INERT_ENRICHMENT;
  }

  const { adapter, stateInput, rules, batchOperators = MINECRAFT_BATCH_OPERATORS } = input;

  // 1. Construct and canonicalize temporal state
  const temporalState = makeTemporalState(stateInput, adapter);

  // 2. Derive slot needs and check for deadlock
  const needs = deriveSlotNeeds(rules);
  const deadlock = adapter.checkDeadlock(needs, temporalState);

  // 3. Build enrichRule closure
  const enrichRule = (rule: Readonly<MinecraftCraftingRule>, goalCount?: number): EnrichedCraftingRule => {
    const annotation = annotateRuleWithDuration(rule.action, rule.actionType, goalCount);
    return {
      ...rule,
      durationTicks: annotation.durationTicks,
      requiresSlotType: annotation.requiresSlotType,
    };
  };

  // 4. Build batchHint closure
  const batchHintFn = (itemType: string, goalCount: number): BatchHint => {
    return getBatchHint(adapter, itemType, goalCount, batchOperators);
  };

  return {
    mode: input.mode,
    temporalState,
    deadlock,
    enrichRule,
    batchHint: batchHintFn,
  };
}

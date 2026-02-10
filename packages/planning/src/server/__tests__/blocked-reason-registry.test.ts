/**
 * Blocked reason registry alignment test.
 *
 * Prevents taxonomy drift: ensures every statically-known blocked reason
 * emitted by materializeSterlingIrSteps / retryExpansion / addTask is:
 * (a) present in BLOCKED_REASON_REGISTRY
 * (b) classified correctly as transient (exempt) or contract-broken (number TTL)
 *
 * Also validates that DERIVED sets (TRANSIENT_EXPANSION_REASONS, CONTRACT_BROKEN_REASONS)
 * are consistent with the registry — proving the registry is the single source of truth.
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCKED_REASON_REGISTRY,
  BLOCKED_REASON_TTL_POLICY,
  TRANSIENT_EXPANSION_REASONS,
  CONTRACT_BROKEN_REASONS,
  normalizeBlockedReason,
  type BlockedReasonClassification,
} from '../../task-lifecycle/task-block-evaluator';

// ── Statically known blocked reasons emitted by TS code ──
// These are all the reasons that appear as string literals in task-integration.ts.
// If you add a new blocked reason, add it here AND in the registry.
const STATIC_BLOCKED_REASONS: Record<string, BlockedReasonClassification> = {
  // Emitted by materializeSterlingIrSteps
  blocked_routing_disabled: 'contract_broken',
  blocked_missing_digest: 'contract_broken',
  blocked_missing_schema_version: 'contract_broken',
  blocked_executor_unavailable: 'transient',
  blocked_invalid_steps_bundle: 'contract_broken',

  // Emitted by retryExpansion classification
  blocked_executor_error: 'transient',

  // Emitted by addTask / retryExpansion for unresolved intents
  unresolved_intents: 'transient',

  // P0-6: Intent resolution
  blocked_intent_resolution_unavailable: 'transient',
  blocked_unresolved_intents: 'transient',
  blocked_intent_resolution_disabled: 'contract_broken',
  blocked_undispatchable_steps: 'contract_broken',
  no_mapped_action: 'executor',

  // P0-6 refinement: intent-type-specific context
  blocked_navigation_context_unavailable: 'transient',
  blocked_resource_context_unavailable: 'transient',
  blocked_crafting_context_unavailable: 'transient',
  blocked_crafting_no_goal_item: 'contract_broken',
  blocked_intent_resolution_failed: 'transient',
  blocked_intent_resolution_error: 'transient',

  // Terminal
  expansion_retries_exhausted: 'terminal',
};

describe('blocked reason registry alignment', () => {
  it('every statically-known reason is in BLOCKED_REASON_REGISTRY', () => {
    for (const reason of Object.keys(STATIC_BLOCKED_REASONS)) {
      expect(
        BLOCKED_REASON_REGISTRY[reason],
        `Missing registry entry for blocked reason: ${reason}`
      ).toBeDefined();
    }
  });

  it('every statically-known reason classification matches registry', () => {
    for (const [reason, expectedClassification] of Object.entries(STATIC_BLOCKED_REASONS)) {
      const entry = BLOCKED_REASON_REGISTRY[reason];
      if (!entry) continue; // Caught by the test above
      expect(
        entry.classification,
        `Reason "${reason}" should be '${expectedClassification}' but registry says '${entry.classification}'`
      ).toBe(expectedClassification);
    }
  });

  it('contract-broken reasons have numeric TTL (fast-fail)', () => {
    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'contract_broken') {
        expect(
          typeof entry.ttlPolicy === 'number',
          `Contract-broken reason "${reason}" should have numeric TTL, got: ${entry.ttlPolicy}`
        ).toBe(true);
      }
    }
  });

  it('transient reasons are TTL-exempt (managed by retry/backoff)', () => {
    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'transient') {
        expect(
          entry.ttlPolicy,
          `Transient reason "${reason}" should be 'exempt', got: ${entry.ttlPolicy}`
        ).toBe('exempt');
      }
    }
  });

  it('terminal reasons are TTL-exempt (no double-fail)', () => {
    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      if (entry.classification === 'terminal') {
        expect(
          entry.ttlPolicy,
          `Terminal reason "${reason}" should be 'exempt', got: ${entry.ttlPolicy}`
        ).toBe('exempt');
      }
    }
  });

  // ── Derived set consistency ──

  it('TRANSIENT_EXPANSION_REASONS exactly matches transient entries in registry', () => {
    const expectedTransient = new Set(
      Object.entries(BLOCKED_REASON_REGISTRY)
        .filter(([, entry]) => entry.classification === 'transient')
        .map(([reason]) => reason)
    );
    expect(TRANSIENT_EXPANSION_REASONS).toEqual(expectedTransient);
  });

  it('CONTRACT_BROKEN_REASONS exactly matches contract_broken entries in registry', () => {
    const expectedBroken = new Set(
      Object.entries(BLOCKED_REASON_REGISTRY)
        .filter(([, entry]) => entry.classification === 'contract_broken')
        .map(([reason]) => reason)
    );
    expect(CONTRACT_BROKEN_REASONS).toEqual(expectedBroken);
  });

  it('BLOCKED_REASON_TTL_POLICY is consistent with registry', () => {
    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      expect(
        BLOCKED_REASON_TTL_POLICY[reason],
        `TTL policy mismatch for "${reason}": registry=${entry.ttlPolicy}, derived=${BLOCKED_REASON_TTL_POLICY[reason]}`
      ).toBe(entry.ttlPolicy);
    }
    // No extra entries in TTL policy that aren't in registry
    for (const reason of Object.keys(BLOCKED_REASON_TTL_POLICY)) {
      expect(
        BLOCKED_REASON_REGISTRY[reason],
        `TTL policy has orphan entry "${reason}" not in registry`
      ).toBeDefined();
    }
  });

  it('TRANSIENT_EXPANSION_REASONS does not contain contract-broken reasons', () => {
    for (const reason of CONTRACT_BROKEN_REASONS) {
      expect(
        TRANSIENT_EXPANSION_REASONS.has(reason),
        `Contract-broken reason "${reason}" must NOT be in TRANSIENT_EXPANSION_REASONS`
      ).toBe(false);
    }
  });

  it('unknown reasons fall through to default TTL policy (conservative)', () => {
    const unknownReason = 'some_new_reason_nobody_added_to_the_table';
    const policy = BLOCKED_REASON_TTL_POLICY[unknownReason];
    expect(policy).toBeUndefined(); // Falls through to ?? 'default' in evaluateTaskBlockState
  });

  it('dynamic Sterling blocked reasons (blocked_digest_unknown, rig_e_solver_unimplemented) are in registry', () => {
    const dynamicReasons = [
      'blocked_digest_unknown',
      'rig_e_solver_unimplemented',
    ];
    for (const reason of dynamicReasons) {
      expect(
        BLOCKED_REASON_REGISTRY[reason],
        `Dynamic Sterling reason "${reason}" should be in registry`
      ).toBeDefined();
      expect(
        BLOCKED_REASON_REGISTRY[reason].classification,
        `Dynamic Sterling reason "${reason}" should be transient`
      ).toBe('transient');
    }
  });

  it('every registry entry has a non-empty description', () => {
    for (const [reason, entry] of Object.entries(BLOCKED_REASON_REGISTRY)) {
      expect(
        entry.description.length > 0,
        `Registry entry "${reason}" has empty description`
      ).toBe(true);
    }
  });
});

describe('normalizeBlockedReason', () => {
  it('returns known reasons as-is without originalReason', () => {
    const known = normalizeBlockedReason('blocked_executor_unavailable');
    expect(known.reason).toBe('blocked_executor_unavailable');
    expect(known.originalReason).toBeUndefined();
  });

  it('normalizes unknown reasons to blocked_executor_error', () => {
    const unknown = normalizeBlockedReason('some_weird_sterling_reason_v3');
    expect(unknown.reason).toBe('blocked_executor_error');
    expect(unknown.originalReason).toBe('some_weird_sterling_reason_v3');
  });

  it('normalized reason is always transient (retryable)', () => {
    const { reason } = normalizeBlockedReason('totally_unknown_reason');
    expect(TRANSIENT_EXPANSION_REASONS.has(reason)).toBe(true);
  });

  it('every known registry reason passes through unchanged', () => {
    for (const reason of Object.keys(BLOCKED_REASON_REGISTRY)) {
      const result = normalizeBlockedReason(reason);
      expect(result.reason).toBe(reason);
      expect(result.originalReason).toBeUndefined();
    }
  });

  it('contract-broken reasons are NOT normalized away', () => {
    // A known contract-broken reason should stay contract-broken
    const result = normalizeBlockedReason('blocked_missing_digest');
    expect(result.reason).toBe('blocked_missing_digest');
    expect(CONTRACT_BROKEN_REASONS.has(result.reason)).toBe(true);
  });

  it('unknown blocked_* reasons are classified as contract_broken (fail-fast)', () => {
    // New Sterling-side blocked reasons shouldn't be retried as transient
    const result = normalizeBlockedReason('blocked_some_new_sterling_reason');
    expect(result.reason).toBe('blocked_invalid_steps_bundle');
    expect(result.originalReason).toBe('blocked_some_new_sterling_reason');
    expect(CONTRACT_BROKEN_REASONS.has(result.reason)).toBe(true);
    expect(TRANSIENT_EXPANSION_REASONS.has(result.reason)).toBe(false);
  });

  it('unknown non-blocked reasons remain transient (retryable)', () => {
    // Non-blocked unknown reasons are likely transient infrastructure issues
    const result = normalizeBlockedReason('some_infra_error');
    expect(result.reason).toBe('blocked_executor_error');
    expect(TRANSIENT_EXPANSION_REASONS.has(result.reason)).toBe(true);
  });
});

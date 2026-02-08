/**
 * Debt tripwire: intent leaves (task_type_*) must not be in the executor
 * allowlist unless ENABLE_TASK_TYPE_BRIDGE=1. Prevents intent-level labels
 * from masquerading as executable leaves in the ABI.
 *
 * See docs/planning/PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md Section 11.
 */

import { describe, it, expect } from 'vitest';
import { buildLeafAllowlist } from '../modular-server';
import { INTENT_LEAVES, KNOWN_LEAVES } from '../modules/leaf-arg-contracts';

describe('task-type-bridge tripwire', () => {
  const knownLeaves = new Set(['craft_recipe', 'move_to']);

  it('excludes ALL intent leaves from allowlist when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, INTENT_LEAVES, false);
    for (const leaf of INTENT_LEAVES) {
      expect(allowlist.has(`minecraft.${leaf}`)).toBe(false);
    }
  });

  it('includes intent leaves in allowlist when bridge enabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, INTENT_LEAVES, true);
    expect(allowlist.has('minecraft.task_type_craft')).toBe(true);
    expect(allowlist.has('minecraft.task_type_mine')).toBe(true);
  });

  it('includes only known leaves when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, INTENT_LEAVES, false);
    expect(allowlist.has('minecraft.craft_recipe')).toBe(true);
    expect(allowlist.has('minecraft.move_to')).toBe(true);
    expect(allowlist.size).toBe(2);
  });

  it('KNOWN_LEAVES and INTENT_LEAVES have zero overlap (structural invariant)', () => {
    for (const leaf of INTENT_LEAVES) {
      expect(
        KNOWN_LEAVES.has(leaf),
        `intent leaf '${leaf}' found in KNOWN_LEAVES — intent/executable boundary violated`
      ).toBe(false);
    }
  });
});

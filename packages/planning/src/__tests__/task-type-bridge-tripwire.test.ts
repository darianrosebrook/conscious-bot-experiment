/**
 * Debt tripwire: task_type_* leaves must not be in the executor allowlist unless
 * ENABLE_TASK_TYPE_BRIDGE=1. Prevents Option B bridge from normalizing into the ABI.
 * See docs/planning/PATTERN_A_GOLDEN_RUN_SESSION_OVERVIEW.md Section 11.
 */

import { describe, it, expect } from 'vitest';
import { buildLeafAllowlist } from '../modular-server';

describe('task-type-bridge tripwire', () => {
  const knownLeaves = new Set(['craft_recipe', 'move_to']);
  const bridgeLeaves = new Set(['task_type_craft']);

  it('excludes task_type_* from allowlist when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, bridgeLeaves, false);
    expect(allowlist.has('minecraft.task_type_craft')).toBe(false);
    for (const leaf of bridgeLeaves) {
      expect(allowlist.has(`minecraft.${leaf}`)).toBe(false);
    }
  });

  it('includes task_type_* in allowlist when bridge enabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, bridgeLeaves, true);
    expect(allowlist.has('minecraft.task_type_craft')).toBe(true);
  });

  it('includes only known leaves when bridge disabled', () => {
    const allowlist = buildLeafAllowlist(knownLeaves, bridgeLeaves, false);
    expect(allowlist.has('minecraft.craft_recipe')).toBe(true);
    expect(allowlist.has('minecraft.move_to')).toBe(true);
    expect(allowlist.size).toBe(2);
  });
});

/**
 * Rig B Certification Tests — Capability Gating and Legality (P2)
 *
 * Proves the following Rig B invariants:
 *   1. Cap: token invariant-pattern is correctly formed (consume+produce pairs)
 *   2. Tier-gated mine rules require matching cap: invariant pairs
 *   3. Unknown cap: atoms are rejected by the validation gate
 *   4. Tier detection is deterministic (same inventory → same tier)
 *   5. Cap: tokens are hygienically filtered from output artifacts
 *   6. Validation gate blocks invalid cap: rules before Sterling
 *
 * These tests exercise the embedded capability gating without a live Sterling
 * backend. Integration tests against live Sterling are in solver-class-e2e.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { validateRules } from '../../validation/rule-validator';
import type { MinecraftCraftingRule } from '../minecraft-crafting-types';
import {
  buildToolProgressionRules,
  detectCurrentTier,
  validateInventoryInput,
  filterCapTokens,
  filterCapTokenItems,
} from '../minecraft-tool-progression-rules';
import { CAP_PREFIX, TIER_GATE_MATRIX, TOOL_TIERS } from '../minecraft-tool-progression-types';
import type { ToolProgressionRule } from '../minecraft-tool-progression-types';

// ── Helper: all nearby blocks needed for a given tier progression ──────────

function allNearbyBlocks(): string[] {
  const blocks: string[] = [];
  for (const tier of TOOL_TIERS) {
    blocks.push(...TIER_GATE_MATRIX[tier]);
  }
  // Add wood blocks needed for wooden tier
  blocks.push('oak_log', 'crafting_table');
  return [...new Set(blocks)];
}

// ── Helper: cast ToolProgressionRule[] to MinecraftCraftingRule[] for validateRules
function asValidatableRules(rules: ToolProgressionRule[]): MinecraftCraftingRule[] {
  return rules as unknown as MinecraftCraftingRule[];
}

// ============================================================================
// Test 1: Cap: token invariant-pattern correctness
// ============================================================================

describe('Rig B - Cap token invariant-pattern', () => {
  it('mine rules for tier-gated blocks have cap: consume+produce pairs', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', allNearbyBlocks()
    );

    const mineRules = rules.filter(r => r.actionType === 'mine');

    for (const rule of mineRules) {
      // Find all cap: tokens in consumes
      const capConsumes = rule.consumes.filter(c => c.name.startsWith(CAP_PREFIX));

      for (const capConsume of capConsumes) {
        // Each consumed cap: token must have a matching produce (invariant pair)
        const matchingProduce = rule.produces.find(
          p => p.name === capConsume.name && p.count === capConsume.count
        );
        expect(matchingProduce).toBeDefined();
      }
    }
  });

  it('upgrade rules produce cap: tokens for new capabilities', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', allNearbyBlocks()
    );

    // Find the upgrade rule that produces stone_pickaxe
    const upgradeRule = rules.find(
      r => r.produces.some(p => p.name === 'stone_pickaxe')
    );
    expect(upgradeRule).toBeDefined();

    // Should produce cap:has_stone_pickaxe
    const capProduce = upgradeRule!.produces.find(
      p => p.name === `${CAP_PREFIX}has_stone_pickaxe`
    );
    expect(capProduce).toBeDefined();
    expect(capProduce!.count).toBe(1);

    // Should also produce cap:can_mine_* tokens for stone tier gates
    const canMineTokens = upgradeRule!.produces.filter(
      p => p.name.startsWith(`${CAP_PREFIX}can_mine_`)
    );
    expect(canMineTokens.length).toBeGreaterThan(0);
  });

  it('cap: tokens in consumes are net-zero (invariant, not consumed)', () => {
    const { rules } = buildToolProgressionRules(
      'iron_pickaxe', 'pickaxe', 'stone', 'iron', allNearbyBlocks()
    );

    for (const rule of rules) {
      const capConsumes = rule.consumes.filter(c => c.name.startsWith(CAP_PREFIX));
      for (const capConsume of capConsumes) {
        const matchingProduce = rule.produces.find(
          p => p.name === capConsume.name
        );
        if (matchingProduce) {
          // Net-zero: consume and produce the same count
          expect(matchingProduce.count).toBe(capConsume.count);
        }
      }
    }
  });
});

// ============================================================================
// Test 2: Tier-gated mine rules require cap: invariants (MINE_TIERGATED_NO_CAP)
// ============================================================================

describe('Rig B - MINE_TIERGATED_NO_CAP validation', () => {
  it('rejects mine rule for tier-gated resource without cap: invariant', () => {
    const adversarialRule: MinecraftCraftingRule = {
      action: 'tp:mine:iron_ore',
      actionType: 'mine',
      produces: [{ name: 'raw_iron', count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
      // No cap: invariant pair — should be rejected
    };

    const validation = validateRules([adversarialRule], { checkCapabilityConsistency: true });

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      const tiergateError = validation.details.find(d => d.code === 'MINE_TIERGATED_NO_CAP');
      expect(tiergateError).toBeDefined();
      expect(tiergateError!.ruleAction).toBe('tp:mine:iron_ore');
    }
  });

  it('accepts mine rule for tier-gated resource WITH cap: invariant', () => {
    const validMineRule: MinecraftCraftingRule = {
      action: 'tp:mine:iron_ore',
      actionType: 'mine',
      produces: [
        { name: 'raw_iron', count: 1 },
        { name: 'cap:can_mine_iron_ore', count: 1 },  // Invariant: produce back
      ],
      consumes: [
        { name: 'cap:can_mine_iron_ore', count: 1 },  // Invariant: consume
      ],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    };

    const validation = validateRules([validMineRule], { checkCapabilityConsistency: true });

    // Should not have MINE_TIERGATED_NO_CAP errors
    if (!validation.valid) {
      const tiergateErrors = validation.details.filter(d => d.code === 'MINE_TIERGATED_NO_CAP');
      expect(tiergateErrors).toHaveLength(0);
    }
  });

  it('accepts mine rule for non-tier-gated resource without cap:', () => {
    const nonGatedRule: MinecraftCraftingRule = {
      action: 'tp:mine:dirt',
      actionType: 'mine',
      produces: [{ name: 'dirt', count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 2.0,
    };

    const validation = validateRules([nonGatedRule], { checkCapabilityConsistency: true });

    expect(validation.valid).toBe(true);
  });
});

// ============================================================================
// Test 3: Unknown cap: atom rejection (UNKNOWN_CAP_ATOM)
// ============================================================================

describe('Rig B - UNKNOWN_CAP_ATOM validation', () => {
  it('rejects unknown cap: prefix', () => {
    const badCapRule: MinecraftCraftingRule = {
      action: 'tp:mine:stone',
      actionType: 'mine',
      produces: [
        { name: 'cobblestone', count: 1 },
        { name: 'cap:requires_stone_tier', count: 1 },  // Unknown prefix!
      ],
      consumes: [
        { name: 'cap:requires_stone_tier', count: 1 },
      ],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    };

    const validation = validateRules([badCapRule], { checkCapabilityConsistency: true });

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      const atomError = validation.details.find(d => d.code === 'UNKNOWN_CAP_ATOM');
      expect(atomError).toBeDefined();
      expect(atomError!.message).toContain('cap:requires_stone_tier');
    }
  });

  it('accepts known cap: prefixes (cap:has_ and cap:can_mine_)', () => {
    const validCapRule: MinecraftCraftingRule = {
      action: 'tp:mine:coal_ore',
      actionType: 'mine',
      produces: [
        { name: 'coal', count: 1 },
        { name: 'cap:can_mine_coal_ore', count: 1 },
      ],
      consumes: [
        { name: 'cap:can_mine_coal_ore', count: 1 },
      ],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    };

    const validation = validateRules([validCapRule], { checkCapabilityConsistency: true });

    // No UNKNOWN_CAP_ATOM errors
    if (!validation.valid) {
      const atomErrors = validation.details.filter(d => d.code === 'UNKNOWN_CAP_ATOM');
      expect(atomErrors).toHaveLength(0);
    }
  });

  it('rejects typo in cap: atom (cap:hsa_ instead of cap:has_)', () => {
    const typoRule: MinecraftCraftingRule = {
      action: 'tp:upgrade:stone_pickaxe',
      actionType: 'craft',
      produces: [
        { name: 'stone_pickaxe', count: 1 },
        { name: 'cap:hsa_stone_pickaxe', count: 1 },  // Typo!
      ],
      consumes: [
        { name: 'cobblestone', count: 3 },
        { name: 'stick', count: 2 },
      ],
      requires: [],
      needsTable: true,
      needsFurnace: false,
      baseCost: 3.0,
    };

    const validation = validateRules([typoRule], { checkCapabilityConsistency: true });

    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.details.some(d => d.code === 'UNKNOWN_CAP_ATOM')).toBe(true);
    }
  });
});

// ============================================================================
// Test 4: Tier detection determinism
// ============================================================================

describe('Rig B - Tier detection determinism', () => {
  it('same inventory always produces same tier', () => {
    const inventory = { stone_pickaxe: 1, wooden_pickaxe: 1 };

    const tiers: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      tiers.push(detectCurrentTier(inventory));
    }

    expect(new Set(tiers).size).toBe(1);
    expect(tiers[0]).toBe('stone');
  });

  it('detects highest available tier', () => {
    expect(detectCurrentTier({})).toBeNull();
    expect(detectCurrentTier({ wooden_pickaxe: 1 })).toBe('wooden');
    expect(detectCurrentTier({ stone_pickaxe: 1 })).toBe('stone');
    expect(detectCurrentTier({ iron_pickaxe: 1, stone_pickaxe: 1 })).toBe('iron');
    expect(detectCurrentTier({ diamond_pickaxe: 1 })).toBe('diamond');
  });

  it('is independent of inventory insertion order', () => {
    const inv1 = { iron_pickaxe: 1, wooden_pickaxe: 1, coal: 64 };
    const inv2 = { coal: 64, wooden_pickaxe: 1, iron_pickaxe: 1 };

    expect(detectCurrentTier(inv1)).toBe(detectCurrentTier(inv2));
  });
});

// ============================================================================
// Test 5: Cap: token hygiene
// ============================================================================

describe('Rig B - Cap token hygiene', () => {
  it('validateInventoryInput rejects cap: tokens in input', () => {
    const poisonedInventory = {
      oak_log: 10,
      'cap:has_diamond_pickaxe': 1,  // Injected cap: token
    };

    expect(() => validateInventoryInput(poisonedInventory)).toThrow();
  });

  it('filterCapTokens strips cap: entries from inventory', () => {
    const inventory: Record<string, number> = {
      oak_log: 10,
      'cap:has_stone_pickaxe': 1,
      cobblestone: 64,
      'cap:can_mine_iron_ore': 1,
    };

    const cleaned = filterCapTokens(inventory);

    expect(cleaned).not.toHaveProperty('cap:has_stone_pickaxe');
    expect(cleaned).not.toHaveProperty('cap:can_mine_iron_ore');
    expect(cleaned).toHaveProperty('oak_log', 10);
    expect(cleaned).toHaveProperty('cobblestone', 64);
  });

  it('filterCapTokenItems strips cap: items from item arrays', () => {
    const items = [
      { name: 'oak_log', count: 1 },
      { name: 'cap:has_wooden_pickaxe', count: 1 },
      { name: 'cobblestone', count: 3 },
    ];

    const cleaned = filterCapTokenItems(items);

    expect(cleaned).toHaveLength(2);
    expect(cleaned.every(i => !i.name.startsWith(CAP_PREFIX))).toBe(true);
  });
});

// ============================================================================
// Test 6: Validation gate integration (tool-progression rules)
// ============================================================================

describe('Rig B - Validation gate for tool-progression rules', () => {
  it('generated tool-progression rules pass validation with cap checks', () => {
    const { rules } = buildToolProgressionRules(
      'stone_pickaxe', 'pickaxe', 'wooden', 'stone', allNearbyBlocks()
    );

    const validation = validateRules(
      asValidatableRules(rules),
      { checkCapabilityConsistency: true }
    );

    // Generated rules should always pass both schema and capability checks
    expect(validation.valid).toBe(true);
    if (validation.valid) {
      expect(validation.report.rulesAccepted).toBe(rules.length);
      expect(validation.report.warnings.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('generated rules for each tier pass validation', () => {
    const nearby = allNearbyBlocks();

    // Validate wood→stone, stone→iron, iron→diamond
    const progressions: Array<[string, string, string | null, string]> = [
      ['wooden_pickaxe', 'pickaxe', null, 'wooden'],
      ['stone_pickaxe', 'pickaxe', 'wooden', 'stone'],
      ['iron_pickaxe', 'pickaxe', 'stone', 'iron'],
      ['diamond_pickaxe', 'pickaxe', 'iron', 'diamond'],
    ];

    for (const [tool, type, current, target] of progressions) {
      const { rules } = buildToolProgressionRules(
        tool, type as 'pickaxe', current as any, target as any, nearby
      );

      const validation = validateRules(
        asValidatableRules(rules),
        { checkCapabilityConsistency: true }
      );

      expect(validation.valid).toBe(true);
    }
  });

  it('capability checks are opt-in (default off)', () => {
    // A mine rule without cap: invariant should pass without the opt-in
    const adversarialRule: MinecraftCraftingRule = {
      action: 'tp:mine:iron_ore',
      actionType: 'mine',
      produces: [{ name: 'raw_iron', count: 1 }],
      consumes: [],
      requires: [],
      needsTable: false,
      needsFurnace: false,
      baseCost: 5.0,
    };

    // Without opt-in: passes (only schema + basic semantic checks)
    const defaultValidation = validateRules([adversarialRule]);
    expect(defaultValidation.valid).toBe(true);

    // With opt-in: fails (MINE_TIERGATED_NO_CAP)
    const strictValidation = validateRules([adversarialRule], { checkCapabilityConsistency: true });
    expect(strictValidation.valid).toBe(false);
  });
});

// ============================================================================
// Test 7: TIER_GATE_MATRIX frozen integrity
// ============================================================================

describe('Rig B - TIER_GATE_MATRIX integrity', () => {
  it('matrix covers all four tiers', () => {
    expect(Object.keys(TIER_GATE_MATRIX)).toEqual(
      expect.arrayContaining(['wooden', 'stone', 'iron', 'diamond'])
    );
  });

  it('each tier has at least one gated block', () => {
    for (const tier of TOOL_TIERS) {
      expect(TIER_GATE_MATRIX[tier].length).toBeGreaterThan(0);
    }
  });

  it('no block appears in multiple tiers', () => {
    const allBlocks: string[] = [];
    for (const tier of TOOL_TIERS) {
      allBlocks.push(...TIER_GATE_MATRIX[tier]);
    }
    // All blocks should be unique across tiers
    expect(new Set(allBlocks).size).toBe(allBlocks.length);
  });

  it('stone tier gates iron and copper ores', () => {
    expect(TIER_GATE_MATRIX.stone).toContain('iron_ore');
    expect(TIER_GATE_MATRIX.stone).toContain('copper_ore');
  });

  it('iron tier gates diamond and gold ores', () => {
    expect(TIER_GATE_MATRIX.iron).toContain('diamond_ore');
    expect(TIER_GATE_MATRIX.iron).toContain('gold_ore');
  });

  it('diamond tier gates obsidian and ancient debris', () => {
    expect(TIER_GATE_MATRIX.diamond).toContain('obsidian');
    expect(TIER_GATE_MATRIX.diamond).toContain('ancient_debris');
  });
});

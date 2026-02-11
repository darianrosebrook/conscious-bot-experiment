/**
 * Tests for ReActArbiter prompt rendering — inventory & block summaries.
 *
 * Uses a thin testable subclass to access private helpers without mocking the LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  ReActArbiter,
  type ReActContext,
  type InventoryState,
  type WorldSnapshot,
} from '../ReActArbiter';

// ---------------------------------------------------------------------------
// Testable subclass — exposes private helpers via (this as any)
// ---------------------------------------------------------------------------

class TestableReActArbiter extends ReActArbiter {
  public testSummarizeInventory(inv: InventoryState): string {
    return (this as any).summarizeInventory(inv);
  }

  public testSummarizeNearbyBlocks(
    blocks: { id: string; type: string; position: { x: number; y: number; z: number } }[]
  ): string {
    return (this as any).summarizeNearbyBlocks(blocks);
  }

  public testBuildPrompt(context: ReActContext): string {
    return (this as any).buildReActPrompt(context);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig = {
  provider: 'test',
  model: 'test-model',
  temperature: 0.3,
  maxTokens: 500,
  timeout: 5000,
  retries: 0,
};

function makeInventory(
  items: Array<{ type: string; count: number }> = [],
  tools: Array<{ type: string; durability: number }> = [],
): InventoryState {
  return {
    stateId: 'inv-1',
    items: items.map((i, idx) => ({ id: `item-${idx}`, type: i.type, count: i.count })),
    armor: [],
    tools: tools.map((t, idx) => ({ id: `tool-${idx}`, type: t.type, durability: t.durability })),
  };
}

function makeBlock(type: string, x = 0, y = 0, z = 0) {
  return { id: `block-${type}-${x}-${y}-${z}`, type, position: { x, y, z } };
}

function makeContext(overrides: Partial<ReActContext> = {}): ReActContext {
  return {
    snapshot: {
      stateId: 'snap-1',
      position: { x: 100, y: 64, z: -200 },
      biome: 'plains',
      time: 6000,
      light: 15,
      hazards: [],
      nearbyEntities: [],
      nearbyBlocks: [],
      weather: 'clear',
    },
    inventory: makeInventory(),
    goalStack: [],
    memorySummaries: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReActArbiter prompt rendering', () => {
  const arbiter = new TestableReActArbiter(defaultConfig);

  // ── summarizeInventory ────────────────────────────────────────────────

  describe('summarizeInventory', () => {
    it('returns "empty" for null/undefined inventory', () => {
      expect(arbiter.testSummarizeInventory(undefined as any)).toBe('empty');
      expect(arbiter.testSummarizeInventory(null as any)).toBe('empty');
    });

    it('returns "empty" for inventory with no items and no tools', () => {
      expect(arbiter.testSummarizeInventory(makeInventory())).toBe('empty');
    });

    it('returns single item correctly', () => {
      const inv = makeInventory([{ type: 'oak_log', count: 5 }]);
      expect(arbiter.testSummarizeInventory(inv)).toBe('oak_log: 5');
    });

    it('sorts items by count descending', () => {
      const inv = makeInventory([
        { type: 'dirt', count: 3 },
        { type: 'cobblestone', count: 64 },
        { type: 'oak_log', count: 12 },
      ]);
      const result = arbiter.testSummarizeInventory(inv);
      const parts = result.split(', ');
      expect(parts[0]).toBe('cobblestone: 64');
      expect(parts[1]).toBe('oak_log: 12');
      expect(parts[2]).toBe('dirt: 3');
    });

    it('aggregates duplicate types across slots', () => {
      const inv = makeInventory([
        { type: 'cobblestone', count: 64 },
        { type: 'cobblestone', count: 64 },
        { type: 'cobblestone', count: 32 },
      ]);
      expect(arbiter.testSummarizeInventory(inv)).toBe('cobblestone: 160');
    });

    it('shows top 8 items with (+N more) for larger inventories', () => {
      const items = Array.from({ length: 12 }, (_, i) => ({
        type: `item_${String(i).padStart(2, '0')}`,
        count: 100 - i * 5,
      }));
      const inv = makeInventory(items);
      const result = arbiter.testSummarizeInventory(inv);
      expect(result).toContain('(+4 more)');
      // Should have exactly 8 items before the suffix
      const mainPart = result.replace(/ \(\+\d+ more\)$/, '');
      expect(mainPart.split(', ')).toHaveLength(8);
    });

    it('merges tools into the summary', () => {
      const inv = makeInventory(
        [{ type: 'cobblestone', count: 64 }],
        [{ type: 'iron_pickaxe', durability: 250 }],
      );
      const result = arbiter.testSummarizeInventory(inv);
      expect(result).toContain('cobblestone: 64');
      expect(result).toContain('iron_pickaxe: 1');
    });

    it('returns tools-only inventory correctly', () => {
      const inv = makeInventory(
        [],
        [
          { type: 'diamond_sword', durability: 1561 },
          { type: 'iron_pickaxe', durability: 250 },
        ],
      );
      const result = arbiter.testSummarizeInventory(inv);
      expect(result).toContain('diamond_sword: 1');
      expect(result).toContain('iron_pickaxe: 1');
    });

    it('does not show (+N more) when exactly 8 unique types', () => {
      const items = Array.from({ length: 8 }, (_, i) => ({
        type: `item_${i}`,
        count: 10,
      }));
      const inv = makeInventory(items);
      const result = arbiter.testSummarizeInventory(inv);
      expect(result).not.toContain('more');
      expect(result.split(', ')).toHaveLength(8);
    });
  });

  // ── summarizeNearbyBlocks ─────────────────────────────────────────────

  describe('summarizeNearbyBlocks', () => {
    it('returns "none" for null/undefined/empty blocks', () => {
      expect(arbiter.testSummarizeNearbyBlocks(undefined as any)).toBe('none');
      expect(arbiter.testSummarizeNearbyBlocks(null as any)).toBe('none');
      expect(arbiter.testSummarizeNearbyBlocks([])).toBe('none');
    });

    it('aggregates blocks by type', () => {
      const blocks = [
        makeBlock('stone'),
        makeBlock('stone'),
        makeBlock('stone'),
        makeBlock('dirt'),
      ];
      const result = arbiter.testSummarizeNearbyBlocks(blocks);
      expect(result).toBe('stone: 3, dirt: 1');
    });

    it('sorts by count descending', () => {
      const blocks = [
        makeBlock('dirt'),
        makeBlock('stone'),
        makeBlock('stone'),
        makeBlock('stone'),
        makeBlock('oak_log'),
        makeBlock('oak_log'),
      ];
      const result = arbiter.testSummarizeNearbyBlocks(blocks);
      const parts = result.split(', ');
      expect(parts[0]).toBe('stone: 3');
      expect(parts[1]).toBe('oak_log: 2');
      expect(parts[2]).toBe('dirt: 1');
    });

    it('shows top 5 types with (+N more types) for larger lists', () => {
      const types = ['stone', 'dirt', 'oak_log', 'iron_ore', 'coal_ore', 'gravel', 'sand'];
      const blocks = types.flatMap((t, i) => Array.from({ length: 10 - i }, () => makeBlock(t)));
      const result = arbiter.testSummarizeNearbyBlocks(blocks);
      expect(result).toContain('(+2 more types)');
      const mainPart = result.replace(/ \(\+\d+ more types\)$/, '');
      expect(mainPart.split(', ')).toHaveLength(5);
    });

    it('does not show (+N more types) when exactly 5 unique types', () => {
      const types = ['stone', 'dirt', 'oak_log', 'iron_ore', 'coal_ore'];
      const blocks = types.map((t) => makeBlock(t));
      const result = arbiter.testSummarizeNearbyBlocks(blocks);
      expect(result).not.toContain('more');
      expect(result.split(', ')).toHaveLength(5);
    });
  });

  // ── buildReActPrompt integration ──────────────────────────────────────

  describe('buildReActPrompt', () => {
    it('includes item names instead of just counts', () => {
      const ctx = makeContext({
        inventory: makeInventory([
          { type: 'oak_log', count: 12 },
          { type: 'iron_ingot', count: 4 },
        ]),
      });
      const prompt = arbiter.testBuildPrompt(ctx);
      expect(prompt).toContain('oak_log: 12');
      expect(prompt).toContain('iron_ingot: 4');
      expect(prompt).not.toContain('2 items');
    });

    it('includes block type names instead of just counts', () => {
      const ctx = makeContext({
        snapshot: {
          ...makeContext().snapshot,
          nearbyBlocks: [
            makeBlock('crafting_table'),
            makeBlock('stone'),
            makeBlock('stone'),
          ],
        },
      });
      const prompt = arbiter.testBuildPrompt(ctx);
      expect(prompt).toContain('stone: 2');
      expect(prompt).toContain('crafting_table: 1');
      expect(prompt).not.toContain('3 blocks');
    });

    it('renders "empty" for empty inventory', () => {
      const ctx = makeContext({ inventory: makeInventory() });
      const prompt = arbiter.testBuildPrompt(ctx);
      expect(prompt).toContain('Inventory: empty');
    });

    it('renders "none" for no nearby blocks', () => {
      const ctx = makeContext();
      const prompt = arbiter.testBuildPrompt(ctx);
      expect(prompt).toContain('Nearby Blocks: none');
    });

    it('includes task title, description, and position', () => {
      const ctx = makeContext({
        task: { title: 'Mine diamonds', description: 'Go to Y=11 and mine', type: 'mining' },
      });
      const prompt = arbiter.testBuildPrompt(ctx);
      expect(prompt).toContain('Mine diamonds');
      expect(prompt).toContain('Go to Y=11 and mine');
      expect(prompt).toContain('100');
    });
  });
});

/**
 * EquipToolLeaf Postcondition Verification Tests
 *
 * Tests that verify the equip_tool leaf correctly detects when the equip action
 * claims success but the bot's held item doesn't match the expected tool.
 *
 * This is critical for preventing false-positive success reports that can
 * corrupt downstream task completion tracking.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { EquipToolLeaf } from '../combat-leaves';

/**
 * Create a mock bot with configurable held item state
 */
const createMockBot = (config: {
  inventoryItems?: Array<{ name: string; slot: number; metadata?: any }>;
  heldItem?: { name: string; slot: number } | null;
}): Bot => {
  const {
    inventoryItems = [
      { name: 'iron_pickaxe', slot: 0, metadata: {} },
      { name: 'wooden_pickaxe', slot: 1, metadata: {} },
      { name: 'stone_axe', slot: 2, metadata: {} },
    ],
    heldItem = null,
  } = config;

  return {
    entity: {
      position: new Vec3(0, 64, 0),
    },
    inventory: {
      items: vi.fn().mockReturnValue(inventoryItems),
    },
    heldItem,
    equip: vi.fn().mockResolvedValue(undefined),
    getEquipmentDestSlot: vi.fn().mockReturnValue(0),
  } as any;
};

/**
 * Create a test context for leaf execution
 */
const createTestContext = (bot: Bot) => ({
  bot,
  abortSignal: new AbortController().signal,
  now: vi.fn().mockReturnValue(1000),
  snapshot: vi.fn(),
  inventory: vi.fn(),
  emitMetric: vi.fn(),
  emitError: vi.fn(),
});

describe('EquipToolLeaf Postcondition Verification', () => {
  let leaf: EquipToolLeaf;

  beforeEach(() => {
    leaf = new EquipToolLeaf();
    vi.clearAllMocks();
  });

  describe('successful postcondition verification', () => {
    it('should succeed when held item matches equipped tool', async () => {
      // Arrange: bot.equip succeeds AND bot.heldItem matches
      const mockBot = createMockBot({
        heldItem: { name: 'iron_pickaxe', slot: 0 },
      });

      const ctx = createTestContext(mockBot);

      // Act
      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert
      expect(result.status).toBe('success');
      expect((result.result as any)?.toolEquipped).toBe('iron_pickaxe');
      expect(mockBot.equip).toHaveBeenCalledTimes(1);
    });

    it('should succeed with lower tier tool when higher tier not available', async () => {
      // Arrange: only wooden pickaxe available
      const mockBot = createMockBot({
        inventoryItems: [{ name: 'wooden_pickaxe', slot: 0, metadata: {} }],
        heldItem: { name: 'wooden_pickaxe', slot: 0 },
      });

      const ctx = createTestContext(mockBot);

      // Act
      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert
      expect(result.status).toBe('success');
      expect((result.result as any)?.toolEquipped).toBe('wooden_pickaxe');
      expect((result.result as any)?.tier).toBe('wooden');
    });
  });

  describe('postcondition failures', () => {
    it('should fail with postcondition_failed:equip_tool when held item is null after equip', async () => {
      // Arrange: equip() returns without error, but heldItem is null
      // This simulates inventory desync or lag
      const mockBot = createMockBot({
        heldItem: null, // Nothing held after equip!
      });

      const ctx = createTestContext(mockBot);

      // Act
      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('postcondition_failed:equip_tool');
      expect(result.error?.retryable).toBe(false); // Deterministic failure
      expect(result.error?.detail).toContain('nothing');
      expect(result.error?.detail).toContain('iron_pickaxe');
    });

    it('should fail with postcondition_failed:equip_tool when held item is wrong tool', async () => {
      // Arrange: equip() returns without error, but wrong item is held
      // This simulates a race condition or stale inventory state
      const mockBot = createMockBot({
        heldItem: { name: 'diamond_sword', slot: 5 }, // Wrong item!
      });

      const ctx = createTestContext(mockBot);

      // Act
      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('postcondition_failed:equip_tool');
      expect(result.error?.retryable).toBe(false);
      expect(result.error?.detail).toContain('diamond_sword');
      expect(result.error?.detail).toContain('iron_pickaxe');
    });

    it('should fail with postcondition_failed:equip_tool when held item is different pickaxe', async () => {
      // Arrange: equip iron_pickaxe but wooden_pickaxe ends up held
      // Edge case: same tool type but wrong specific item
      const mockBot = createMockBot({
        heldItem: { name: 'wooden_pickaxe', slot: 1 }, // Lower tier held instead
      });

      const ctx = createTestContext(mockBot);

      // Act
      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert: Should fail because we tried to equip iron, but wooden is held
      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('postcondition_failed:equip_tool');
      expect(result.error?.detail).toContain('wooden_pickaxe');
      expect(result.error?.detail).toContain('iron_pickaxe');
    });
  });

  describe('postcondition failure is non-retryable', () => {
    it('should mark postcondition failures as non-retryable (deterministic)', async () => {
      // This is critical: postcondition failures indicate a logic/state issue,
      // not a transient condition. Retrying won't help.
      const mockBot = createMockBot({
        heldItem: null,
      });

      const ctx = createTestContext(mockBot);

      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      // Assert the failure is marked as deterministic (non-retryable)
      expect(result.error?.retryable).toBe(false);
    });

    it('should include useful diagnostic information in error detail', async () => {
      const mockBot = createMockBot({
        heldItem: { name: 'cobblestone', slot: 3 }, // Completely wrong item
      });

      const ctx = createTestContext(mockBot);

      const result = await leaf.run(ctx as any, { toolType: 'axe' });

      // Assert the error detail is actionable
      expect(result.error?.detail).toBeDefined();
      expect(result.error?.detail).toMatch(/held item is/i);
      expect(result.error?.detail).toMatch(/expected/i);
    });
  });

  describe('inventory.missingItem errors remain retryable', () => {
    it('should fail with inventory.missingItem when no tool of type exists (fallback disabled)', async () => {
      // This is a different failure mode - no tool available
      // This IS retryable (tool might be acquired later)
      // Note: must disable fallbackToHand to get failure instead of "hand" success
      const mockBot = createMockBot({
        inventoryItems: [{ name: 'dirt', slot: 0, metadata: {} }],
        heldItem: null,
      });

      const ctx = createTestContext(mockBot);

      const result = await leaf.run(ctx as any, {
        toolType: 'pickaxe',
        fallbackToHand: false,
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.retryable).toBe(true); // Retryable - tool might appear
    });

    it('should succeed with hand fallback when no tool exists and fallback enabled', async () => {
      // When fallbackToHand is true (default), missing tool returns success with "hand"
      const mockBot = createMockBot({
        inventoryItems: [{ name: 'dirt', slot: 0, metadata: {} }],
        heldItem: null,
      });

      const ctx = createTestContext(mockBot);

      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      expect(result.status).toBe('success');
      expect((result.result as any)?.toolEquipped).toBe('hand');
    });
  });

  describe('metrics emission', () => {
    it('should emit duration metrics on postcondition failure', async () => {
      const mockBot = createMockBot({
        heldItem: null,
      });

      const ctx = createTestContext(mockBot);
      const t0 = 1000;
      const t1 = 1050;
      ctx.now.mockReturnValueOnce(t0).mockReturnValueOnce(t1);

      const result = await leaf.run(ctx as any, { toolType: 'pickaxe' });

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

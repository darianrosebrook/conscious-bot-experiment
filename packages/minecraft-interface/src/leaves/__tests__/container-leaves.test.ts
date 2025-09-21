/**
 * Container Leaves Tests
 *
 * Tests for container interaction leaves including chest opening, item transfer,
 * and inventory management.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  OpenContainerLeaf,
  TransferItemsLeaf,
  CloseContainerLeaf,
  InventoryManagementLeaf,
} from '../container-leaves';

// Mock mineflayer bot
const createMockBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
    },
    blockAt: vi.fn(),
    openFurnace: vi.fn(),
    openChest: vi.fn(),
    inventory: {
      items: vi.fn().mockReturnValue([]),
    },
  }) as any;

describe('Container Leaves', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockBot();
    vi.clearAllMocks();
  });

  describe('OpenContainerLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new OpenContainerLeaf();
      expect(leaf.spec.name).toBe('open_container');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.timeoutMs).toBe(10000);
    });

    it('should reject unsupported container types', async () => {
      const leaf = new OpenContainerLeaf();
      const mockBlock = { name: 'unknown_block' };

      // Mock bot.blockAt to return the unknown block
      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 0, y: 64, z: 0 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('container.unsupported');
    });
  });

  describe('TransferItemsLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new TransferItemsLeaf();
      expect(leaf.spec.name).toBe('transfer_items');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.permissions).toContain('container.write');
      expect(leaf.spec.timeoutMs).toBe(15000);
    });

    it('should return not implemented error', async () => {
      const leaf = new TransferItemsLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        source: { containerId: 'test' },
        destination: { type: 'inventory' },
      });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('container.notImplemented');
    });
  });

  describe('CloseContainerLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new CloseContainerLeaf();
      expect(leaf.spec.name).toBe('close_container');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.timeoutMs).toBe(5000);
    });

    it('should return not implemented error', async () => {
      const leaf = new CloseContainerLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {});

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('container.notImplemented');
    });
  });

  describe('InventoryManagementLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new InventoryManagementLeaf();
      expect(leaf.spec.name).toBe('manage_inventory');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.permissions).toContain('container.write');
      expect(leaf.spec.timeoutMs).toBe(30000);
    });

    it('should return not implemented error', async () => {
      const leaf = new InventoryManagementLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: () => Date.now(),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { action: 'sort' });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
    });
  });
});

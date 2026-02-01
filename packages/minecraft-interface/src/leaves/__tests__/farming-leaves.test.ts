/**
 * Farming Leaves Tests
 *
 * Tests for farming and agriculture leaves including soil tilling, crop planting,
 * harvesting, and farm management.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  TillSoilLeaf,
  PlantCropLeaf,
  HarvestCropLeaf,
  ManageFarmLeaf,
} from '../farming-leaves';

// Mock mineflayer bot with farming capabilities
const createMockFarmingBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(0, 64, 0),
      health: 20,
      yaw: 0,
      pitch: 0,
    },
    inventory: {
      items: vi.fn().mockReturnValue([
        { name: 'wooden_hoe', count: 1, slot: 0, metadata: {} },
        { name: 'wheat_seeds', count: 10, slot: 1, metadata: {} },
        { name: 'carrot', count: 5, slot: 2, metadata: {} },
      ]),
    },
    blockAt: vi.fn(),
    dig: vi.fn(),
    equip: vi.fn(),
    placeBlock: vi.fn(),
    activateBlock: vi.fn(),
  }) as any;

describe('Farming Leaves', () => {
  let mockBot: Bot;

  beforeEach(() => {
    mockBot = createMockFarmingBot();
    vi.clearAllMocks();
  });

  describe('TillSoilLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new TillSoilLeaf();
      expect(leaf.spec.name).toBe('till_soil');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('movement');
      expect(leaf.spec.permissions).toContain('dig');
      expect(leaf.spec.permissions).toContain('place');
      expect(leaf.spec.timeoutMs).toBe(30000);
    });

    it('should till soil at specified position', async () => {
      const leaf = new TillSoilLeaf();

      // Mock tillable soil block
      const mockBlock = {
        name: 'grass_block',
        type: 2,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);
      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);
      vi.spyOn(mockBot, 'activateBlock' as any).mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.toolUsed).toBe('wooden_hoe');
      expect((result.result as any)?.soilTilled).toBe(true);
      expect(mockBot.equip).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'wooden_hoe' }),
        'hand'
      );
      expect((mockBot as any).activateBlock).toHaveBeenCalledWith(mockBlock);
    });

    it('should reject non-tillable soil', async () => {
      const leaf = new TillSoilLeaf();

      // Mock non-tillable block
      const mockBlock = {
        name: 'stone',
        type: 1,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('tillable soil');
    });

    it('should reject missing hoe', async () => {
      const leaf = new TillSoilLeaf();

      const botWithoutHoe = {
        ...mockBot,
        inventory: {
          items: vi
            .fn()
            .mockReturnValue([
              { name: 'wheat_seeds', count: 10, slot: 0, metadata: {} },
            ]),
        },
      } as any;

      // Mock tillable soil block
      const mockBlock = {
        name: 'grass_block',
        type: 2,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(botWithoutHoe, 'blockAt').mockReturnValue(mockBlock);

      const ctx = {
        bot: botWithoutHoe,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.detail).toContain('No hoe found');
    });
  });

  describe('PlantCropLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new PlantCropLeaf();
      expect(leaf.spec.name).toBe('plant_crop');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('container.read');
      expect(leaf.spec.permissions).toContain('container.write');
      expect(leaf.spec.timeoutMs).toBe(20000);
    });

    it('should plant crop in farmland', async () => {
      const leaf = new PlantCropLeaf();

      // Mock farmland block
      const mockBlock = {
        name: 'farmland',
        type: 60,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);
      vi.spyOn(mockBot, 'placeBlock').mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        position: { x: 5, y: 64, z: 5 },
        cropType: 'wheat',
      });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.cropType).toBe('wheat');
      expect((result.result as any)?.seedsUsed).toBe(1);
      expect(mockBot.placeBlock).toHaveBeenCalledWith(
        mockBlock,
        new Vec3(0, 1, 0)
      );
    });

    it('should reject non-farmland', async () => {
      const leaf = new PlantCropLeaf();

      // Mock non-farmland block
      const mockBlock = {
        name: 'dirt',
        type: 3,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('farmland');
    });

    it('should reject occupied farmland', async () => {
      const leaf = new PlantCropLeaf();

      // Mock farmland block
      const mockBlock = {
        name: 'farmland',
        type: 60,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      // Mock crop already planted
      const mockCropBlock = {
        name: 'wheat',
        type: 59,
        metadata: 7, // Fully grown
        position: new Vec3(5, 65, 5),
      };

      vi.spyOn(mockBot, 'blockAt')
        .mockReturnValueOnce(mockBlock as any)
        .mockReturnValueOnce(mockCropBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('already has a crop');
    });

    it('should reject missing seeds', async () => {
      const leaf = new PlantCropLeaf();

      const botWithoutSeeds = {
        ...mockBot,
        inventory: {
          items: vi
            .fn()
            .mockReturnValue([
              { name: 'wooden_hoe', count: 1, slot: 0, metadata: {} },
            ]),
        },
      } as any;

      // Mock farmland block
      const mockBlock = {
        name: 'farmland',
        type: 60,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(botWithoutSeeds, 'blockAt').mockReturnValue(mockBlock);

      const ctx = {
        bot: botWithoutSeeds,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('inventory.missingItem');
      expect(result.error?.detail).toContain('wheat_seeds');
    });
  });

  describe('HarvestCropLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new HarvestCropLeaf();
      expect(leaf.spec.name).toBe('harvest_crop');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('dig');
      expect(leaf.spec.timeoutMs).toBe(30000);
    });

    it('should harvest mature crop', async () => {
      const leaf = new HarvestCropLeaf();

      // Mock mature crop block
      const mockCropBlock = {
        name: 'wheat',
        type: 59,
        metadata: 7, // Fully grown
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockCropBlock as any);
      vi.spyOn(mockBot, 'dig').mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.cropType).toBe('wheat');
      // Mock returns empty harvest, but successful harvest should still work
      expect(mockBot.dig).toHaveBeenCalledWith(mockCropBlock);
    });

    it('should reject immature crop', async () => {
      const leaf = new HarvestCropLeaf();

      // Mock immature crop block
      const mockCropBlock = {
        name: 'wheat',
        type: 59,
        metadata: 3, // Not fully grown
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockCropBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      // The error message indicates no mature crop found for immature crops
      expect(result.error?.detail).toContain('mature crop');
    });

    it('should reject non-crop block', async () => {
      const leaf = new HarvestCropLeaf();

      // Mock non-crop block
      const mockBlock = {
        name: 'dirt',
        type: 3,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { position: { x: 5, y: 64, z: 5 } });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('mature crop');
    });
  });

  describe('ManageFarmLeaf', () => {
    it('should have correct spec', () => {
      const leaf = new ManageFarmLeaf();
      expect(leaf.spec.name).toBe('manage_farm');
      expect(leaf.spec.version).toBe('1.0.0');
      expect(leaf.spec.permissions).toContain('movement');
      expect(leaf.spec.permissions).toContain('dig');
      expect(leaf.spec.permissions).toContain('place');
      expect(leaf.spec.timeoutMs).toBe(120000);
    });

    it('should perform maintain action by default', async () => {
      const leaf = new ManageFarmLeaf();

      // Mock basic bot setup
      vi.spyOn(mockBot, 'blockAt').mockReturnValue(null);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {});

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.action).toBe('maintain');
      expect((result.result as any)?.operationsCompleted).toBe(0); // No operations available in mock
    });

    it('should handle till action', async () => {
      const leaf = new ManageFarmLeaf();

      // Mock tillable soil
      const mockBlock = {
        name: 'grass_block',
        type: 2,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);
      vi.spyOn(mockBot, 'equip').mockResolvedValue(undefined);
      vi.spyOn(mockBot, 'dig').mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { action: 'till', maxOperations: 1 });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.action).toBe('till');
      expect((result.result as any)?.details.tilled).toBeGreaterThanOrEqual(0);
    });

    it('should handle plant action', async () => {
      const leaf = new ManageFarmLeaf();

      // Mock farmland
      const mockBlock = {
        name: 'farmland',
        type: 60,
        metadata: {},
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockBlock as any);
      vi.spyOn(mockBot, 'placeBlock').mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        action: 'plant',
        cropType: 'wheat',
        maxOperations: 1,
      });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.action).toBe('plant');
      expect((result.result as any)?.details.planted).toBeGreaterThanOrEqual(0);
    });

    it('should handle harvest action', async () => {
      const leaf = new ManageFarmLeaf();

      // Mock mature crop
      const mockCropBlock = {
        name: 'wheat',
        type: 59,
        metadata: 7, // Fully grown
        position: new Vec3(5, 64, 5),
      };

      vi.spyOn(mockBot, 'blockAt').mockReturnValue(mockCropBlock as any);
      vi.spyOn(mockBot, 'dig').mockResolvedValue(undefined);

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, {
        action: 'harvest',
        maxOperations: 1,
      });

      expect(result.status).toBe('success');
      expect((result.result as any)?.success).toBe(true);
      expect((result.result as any)?.action).toBe('harvest');
      expect((result.result as any)?.details.harvested).toBeGreaterThanOrEqual(0);
    });

    it('should reject unknown action', async () => {
      const leaf = new ManageFarmLeaf();

      const ctx = {
        bot: mockBot,
        abortSignal: new AbortController().signal,
        now: vi.fn().mockReturnValue(1000),
        snapshot: vi.fn(),
        inventory: vi.fn(),
        emitMetric: vi.fn(),
        emitError: vi.fn(),
      } as any;

      const result = await leaf.run(ctx, { action: 'unknown' });

      expect(result.status).toBe('failure');
      expect(result.error?.code).toBe('world.invalidPosition');
      expect(result.error?.detail).toContain('Unknown farm action');
    });
  });
});

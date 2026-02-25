import { describe, it, expect, beforeEach } from 'vitest';
import { WorkstationRegistry } from '../workstation-registry';

describe('WorkstationRegistry', () => {
  let registry: WorkstationRegistry;

  beforeEach(() => {
    registry = new WorkstationRegistry();
  });

  it('registers and retrieves a workstation', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    const all = registry.getAll('crafting_table');
    expect(all).toHaveLength(1);
    expect(all[0].position).toEqual({ x: 10, y: 64, z: 20 });
    expect(all[0].type).toBe('crafting_table');
  });

  it('deduplicates entries within 1 block Manhattan distance', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    registry.register('crafting_table', { x: 11, y: 64, z: 20 }); // 1 block away
    expect(registry.getAll('crafting_table')).toHaveLength(1);
  });

  it('does NOT deduplicate entries beyond 1 block Manhattan distance', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    registry.register('crafting_table', { x: 13, y: 64, z: 20 }); // 3 blocks away
    expect(registry.getAll('crafting_table')).toHaveLength(2);
  });

  it('updates position and timestamp on deduplicate re-register', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    const before = registry.getAll()[0].placedAt;
    // Small delay to ensure different timestamp
    registry.register('crafting_table', { x: 10, y: 65, z: 20 }); // 1 block away → update
    const after = registry.getAll()[0];
    expect(after.position).toEqual({ x: 10, y: 65, z: 20 });
    expect(after.placedAt).toBeGreaterThanOrEqual(before);
  });

  it('findNearest returns closest within maxDistance', () => {
    registry.register('crafting_table', { x: 100, y: 64, z: 0 }); // 100 blocks
    registry.register('crafting_table', { x: 10, y: 64, z: 0 });  // 10 blocks
    registry.register('furnace', { x: 5, y: 64, z: 0 });           // wrong type

    const nearest = registry.findNearest('crafting_table', { x: 0, y: 64, z: 0 }, 64);
    expect(nearest).not.toBeNull();
    expect(nearest!.position.x).toBe(10);
  });

  it('findNearest returns null when nothing within maxDistance', () => {
    registry.register('crafting_table', { x: 100, y: 64, z: 0 });
    const nearest = registry.findNearest('crafting_table', { x: 0, y: 64, z: 0 }, 20);
    expect(nearest).toBeNull();
  });

  it('findNearest returns null for wrong type', () => {
    registry.register('furnace', { x: 5, y: 64, z: 0 });
    const nearest = registry.findNearest('crafting_table', { x: 0, y: 64, z: 0 });
    expect(nearest).toBeNull();
  });

  it('removes an entry within 1 block', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    expect(registry.remove('crafting_table', { x: 10, y: 64, z: 20 })).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('remove returns false when no match', () => {
    expect(registry.remove('crafting_table', { x: 999, y: 0, z: 0 })).toBe(false);
  });

  it('clear removes all entries', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    registry.register('furnace', { x: 20, y: 64, z: 30 });
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
  });

  it('getAll without type returns all entries', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    registry.register('furnace', { x: 20, y: 64, z: 30 });
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getAll with type filters correctly', () => {
    registry.register('crafting_table', { x: 10, y: 64, z: 20 });
    registry.register('furnace', { x: 20, y: 64, z: 30 });
    expect(registry.getAll('furnace')).toHaveLength(1);
    expect(registry.getAll('furnace')[0].type).toBe('furnace');
  });

  it('same inputs produce deterministic results (content-addressed)', () => {
    const r1 = new WorkstationRegistry();
    const r2 = new WorkstationRegistry();
    r1.register('crafting_table', { x: 10, y: 64, z: 20 });
    r2.register('crafting_table', { x: 10, y: 64, z: 20 });
    expect(r1.getAll()[0].position).toEqual(r2.getAll()[0].position);
  });
});

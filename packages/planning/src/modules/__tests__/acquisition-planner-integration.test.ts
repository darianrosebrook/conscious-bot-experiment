/**
 * Acquisition Planner Integration Tests
 *
 * Verifies SterlingPlanner dispatches to acquisition solver for Rig D routes.
 */

import { describe, it, expect, vi } from 'vitest';
import { validateLeafArgs, KNOWN_LEAVES } from '../leaf-arg-contracts';

describe('interact_with_entity leaf contract', () => {
  it('registered in KNOWN_LEAVES', () => {
    expect(KNOWN_LEAVES.has('interact_with_entity')).toBe(true);
  });

  it('valid with entityType + entityId', () => {
    const err = validateLeafArgs('interact_with_entity', {
      entityType: 'villager',
      entityId: 'villager-123',
    });
    expect(err).toBeNull();
  });

  it('valid with entityType + entityPosition', () => {
    const err = validateLeafArgs('interact_with_entity', {
      entityType: 'villager',
      entityPosition: { x: 10, y: 64, z: 20 },
    });
    expect(err).toBeNull();
  });

  it('invalid without entityType', () => {
    const err = validateLeafArgs('interact_with_entity', {
      entityId: 'villager-123',
    });
    expect(err).toContain('entityType');
  });

  it('invalid without entityId or entityPosition', () => {
    const err = validateLeafArgs('interact_with_entity', {
      entityType: 'villager',
    });
    expect(err).toContain('entityId');
  });
});

describe('open_container leaf contract', () => {
  it('registered in KNOWN_LEAVES', () => {
    expect(KNOWN_LEAVES.has('open_container')).toBe(true);
  });

  it('valid with containerType', () => {
    const err = validateLeafArgs('open_container', {
      containerType: 'chest',
    });
    expect(err).toBeNull();
  });

  it('valid with position', () => {
    const err = validateLeafArgs('open_container', {
      position: { x: 10, y: 64, z: 20 },
    });
    expect(err).toBeNull();
  });

  it('invalid without containerType or position', () => {
    const err = validateLeafArgs('open_container', {});
    expect(err).toContain('containerType');
  });
});

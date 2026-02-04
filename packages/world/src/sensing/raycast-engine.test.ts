import { describe, it, expect, vi } from 'vitest';
import { RaycastEngine } from './raycast-engine';
import { validateSensingConfig } from '../types';

const baseConfig = validateSensingConfig({
  maxDistance: 32,
  fovDegrees: 90,
  angularResolution: 15,
  panoramicSweep: false,
  maxRaysPerTick: 10,
  tickBudgetMs: 5,
});

describe('RaycastEngine line-of-sight', () => {
  it('returns false when target is outside FoV', () => {
    const engine = new RaycastEngine(baseConfig);
    const observer = { x: 0, y: 0, z: 0 };
    const target = { x: 0, y: 0, z: -10 };

    const hasLos = engine.hasLineOfSight(observer, target, {
      orientation: { yaw: 0, pitch: 0 },
      fovDegrees: 60,
      requireFov: true,
      assumeBlockedOnError: true,
    });

    expect(hasLos).toBe(false);
  });

  it('returns false when a closer hit occludes target', () => {
    const worldRaycast = vi.fn().mockReturnValue({
      position: { x: 0, y: 0, z: 5 },
      intersect: { x: 0, y: 0, z: 5 },
      faceVector: { x: 0, y: 1, z: 0 },
    }) as unknown as typeof baseConfig extends any ? any : never;

    const engine = new RaycastEngine(baseConfig, {
      entity: { position: { x: 0, y: 0, z: 0 }, height: 1.62, yaw: 0, pitch: 0 },
      world: { raycast: worldRaycast },
      blockAt: () => ({ name: 'stone', type: 1 }),
    });

    const hasLos = engine.hasLineOfSight(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 10 },
      { assumeBlockedOnError: true }
    );

    expect(worldRaycast).toHaveBeenCalled();
    expect(hasLos).toBe(false);
  });
});

describe('RaycastEngine sweepOccluders', () => {
  it('deduplicates hits at the same position', () => {
    const worldRaycast = vi.fn().mockReturnValue({
      position: { x: 1.2, y: 0, z: 3.4 },
      intersect: { x: 1.2, y: 0, z: 3.4 },
      faceVector: { x: 0, y: 1, z: 0 },
    }) as any;

    const engine = new RaycastEngine(
      validateSensingConfig({
        maxDistance: 10,
        fovDegrees: 60,
        angularResolution: 30,
        panoramicSweep: false,
        maxRaysPerTick: 10,
        tickBudgetMs: 5,
      }),
      {
        entity: { position: { x: 0, y: 0, z: 0 }, height: 1.62, yaw: 0, pitch: 0 },
        world: { raycast: worldRaycast },
        blockAt: () => ({ name: 'stone', type: 1 }),
      }
    );

    const hits = engine.sweepOccluders(
      { x: 0, y: 0, z: 0 },
      { yaw: 0, pitch: 0 },
      validateSensingConfig({
        maxDistance: 10,
        fovDegrees: 60,
        angularResolution: 30,
        panoramicSweep: false,
        maxRaysPerTick: 10,
        tickBudgetMs: 5,
      })
    );

    expect(hits.length).toBe(1);
  });
});

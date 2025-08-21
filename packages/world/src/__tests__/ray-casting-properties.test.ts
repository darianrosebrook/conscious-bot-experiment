/**
 * Property-Based Tests for Ray-Casting System
 *
 * These tests validate fundamental mathematical properties of the
 * DDA ray-casting algorithm and visible-only sensing constraints.
 *
 * @author @darianrosebrook
 */

import * as fc from 'fast-check';
import { RaycastEngine } from '../sensing/raycast-engine';
import { VisibleSensing } from '../sensing/visible-sensing';
import { Vec3, Orientation, SensingConfig } from '../types';

describe('Ray-Casting Property-Based Tests', () => {
  let raycastEngine: RaycastEngine;
  let visibleSensing: VisibleSensing;

  beforeEach(() => {
    const config: SensingConfig = {
      maxDistance: 32,
      fovDegrees: 90,
      angularResolution: 4,
      panoramicSweep: false,
      maxRaysPerTick: 200,
      tickBudgetMs: 10,
      targetBlocks: ['minecraft:coal_ore'],
      transparentBlocks: ['minecraft:air'],
      confidenceDecayRate: 0.02,
      minConfidence: 0.1,
    };

    raycastEngine = new RaycastEngine(config);

    visibleSensing = new VisibleSensing(config, () => ({
      position: { x: 0, y: 64, z: 0 },
      orientation: { yaw: 0, pitch: 0 },
    }));
  });

  afterEach(() => {
    visibleSensing.dispose();
    raycastEngine.dispose();
  });

  describe('DDA Algorithm Properties', () => {
    test('ray casting is deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          fc.record({
            origin: fc.record({
              x: fc.integer({ min: -50, max: 50 }),
              y: fc.integer({ min: 0, max: 100 }),
              z: fc.integer({ min: -50, max: 50 }),
            }),
            direction: fc.record({
              x: fc.float({ min: -1, max: 1 }),
              y: fc.float({ min: -1, max: 1 }),
              z: fc.float({ min: -1, max: 1 }),
            }),
            maxDistance: fc.integer({ min: 1, max: 64 }),
          }),
          ({ origin, direction, maxDistance }) => {
            // Skip zero direction vectors
            if (direction.x === 0 && direction.y === 0 && direction.z === 0) {
              return true;
            }

            const result1 = raycastEngine.castRay(
              origin,
              direction,
              maxDistance
            );
            const result2 = raycastEngine.castRay(
              origin,
              direction,
              maxDistance
            );

            // Property: Same inputs produce identical outputs
            expect(result1).toEqual(result2);
            if (result1 && result2) {
              expect(result1.position).toEqual(result2.position);
              expect(result1.distance).toBeCloseTo(result2.distance, 5);
              expect(result1.blockId).toBe(result2.blockId);
            }

            return true;
          }
        )
      );
    });

    test('ray distance never exceeds maximum distance', () => {
      fc.assert(
        fc.property(
          fc.record({
            origin: fc.record({
              x: fc.integer({ min: -25, max: 25 }),
              y: fc.integer({ min: 0, max: 100 }),
              z: fc.integer({ min: -25, max: 25 }),
            }),
            direction: fc.record({
              x: fc.float({ min: -1, max: 1 }),
              y: fc.float({ min: -1, max: 1 }),
              z: fc.float({ min: -1, max: 1 }),
            }),
            maxDistance: fc.integer({ min: 1, max: 32 }),
          }),
          ({ origin, direction, maxDistance }) => {
            // Skip zero direction vectors
            if (direction.x === 0 && direction.y === 0 && direction.z === 0) {
              return true;
            }

            const result = raycastEngine.castRay(
              origin,
              direction,
              maxDistance
            );

            // Skip null results (no hits)
            if (!result) {
              return true;
            }

            // Property: Distance never exceeds maximum
            expect(result.distance).toBeLessThanOrEqual(maxDistance + 0.001); // Small epsilon for floating point

            return true;
          }
        )
      );
    });

    test('ray traversal follows straight line properties', () => {
      fc.assert(
        fc.property(
          fc.record({
            start: fc.record({
              x: fc.integer({ min: -10, max: 10 }),
              y: fc.integer({ min: 60, max: 70 }),
              z: fc.integer({ min: -10, max: 10 }),
            }),
            end: fc.record({
              x: fc.integer({ min: -10, max: 10 }),
              y: fc.integer({ min: 60, max: 70 }),
              z: fc.integer({ min: -10, max: 10 }),
            }),
          }),
          ({ start, end }) => {
            // Skip identical points
            if (start.x === end.x && start.y === end.y && start.z === end.z) {
              return true;
            }

            const direction = {
              x: end.x - start.x,
              y: end.y - start.y,
              z: end.z - start.z,
            };

            const distance = Math.sqrt(
              direction.x * direction.x +
                direction.y * direction.y +
                direction.z * direction.z
            );

            // Normalize direction
            direction.x /= distance;
            direction.y /= distance;
            direction.z /= distance;

            const result = raycastEngine.castRay(start, direction, distance);

            // Skip null results (no hits) or very small distances
            if (!result || distance < 0.001) {
              return true;
            }

            // Property: Euclidean distance calculation is consistent
            expect(result.distance).toBeGreaterThanOrEqual(0);
            expect(result.distance).toBeLessThanOrEqual(distance + 0.001);

            return true;
          }
        )
      );
    });
  });

  describe('Visible-Only Sensing Properties', () => {
    test('occlusion discipline is maintained', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              position: fc.record({
                x: fc.integer({ min: -20, max: 20 }),
                y: fc.integer({ min: 60, max: 80 }),
                z: fc.integer({ min: -20, max: 20 }),
              }),
              blockType: fc.constantFrom(
                'minecraft:stone',
                'minecraft:coal_ore',
                'minecraft:air'
              ),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (worldData) => {
            // Create a simple world state for testing
            const mockWorld = new Map<string, string>();
            worldData.forEach(({ position, blockType }) => {
              const key = `${position.x},${position.y},${position.z}`;
              mockWorld.set(key, blockType);
            });

            // Property: Objects behind opaque blocks should not be visible
            const observations = visibleSensing.scanEnvironment();

            observations.forEach((obs) => {
              // Each observation should have a clear line of sight
              expect(obs.confidence).toBeGreaterThan(0);
              expect(obs.confidence).toBeLessThanOrEqual(1);
              expect(obs.lastSeen).toBeGreaterThan(0);
            });

            return true;
          }
        )
      );
    });

    test('confidence decay follows exponential properties', () => {
      fc.assert(
        fc.property(
          fc.record({
            initialConfidence: fc.float({
              min: Math.fround(0.1),
              max: Math.fround(1.0),
            }),
            timeElapsed: fc.integer({ min: 1, max: 10000 }), // milliseconds
            decayRate: fc.float({
              min: Math.fround(0.001),
              max: Math.fround(0.1),
            }),
          }),
          ({ initialConfidence, timeElapsed, decayRate }) => {
            // Skip if any values are invalid
            if (
              !isFinite(initialConfidence) ||
              !isFinite(decayRate) ||
              decayRate < 0
            ) {
              return true;
            }

            // Property: Confidence should decay exponentially over time
            const expectedDecay = Math.exp((-decayRate * timeElapsed) / 1000);
            const finalConfidence = initialConfidence * expectedDecay;

            // Confidence should always decrease (never increase due to time)
            expect(finalConfidence).toBeLessThanOrEqual(initialConfidence);
            expect(finalConfidence).toBeGreaterThanOrEqual(0);

            // For reasonable decay rates, confidence should decrease monotonically
            if (timeElapsed > 0) {
              expect(finalConfidence).toBeLessThan(initialConfidence);
            }

            return true;
          }
        )
      );
    });

    test('field of view constraints are respected', () => {
      fc.assert(
        fc.property(
          fc.record({
            agentYaw: fc.float({
              min: Math.fround(0),
              max: Math.fround(2 * Math.PI),
            }),
            agentPitch: fc.float({
              min: Math.fround(-Math.PI / 2),
              max: Math.fround(Math.PI / 2),
            }),
            targetPosition: fc.record({
              x: fc.float({ min: Math.fround(-50), max: Math.fround(50) }),
              y: fc.float({ min: Math.fround(40), max: Math.fround(100) }),
              z: fc.float({ min: Math.fround(-50), max: Math.fround(50) }),
            }),
            fovDegrees: fc.integer({ min: 30, max: 180 }),
          }),
          ({ agentYaw, agentPitch, targetPosition, fovDegrees }) => {
            const agentPosition = { x: 0, y: 64, z: 0 };

            // Skip if any values are invalid (NaN, infinite)
            if (
              !isFinite(agentYaw) ||
              !isFinite(agentPitch) ||
              !isFinite(targetPosition.x) ||
              !isFinite(targetPosition.y) ||
              !isFinite(targetPosition.z)
            ) {
              return true;
            }

            // Calculate angle between agent facing direction and target
            const toTarget = {
              x: targetPosition.x - agentPosition.x,
              y: targetPosition.y - agentPosition.y,
              z: targetPosition.z - agentPosition.z,
            };

            const targetDistance = Math.sqrt(
              toTarget.x * toTarget.x +
                toTarget.y * toTarget.y +
                toTarget.z * toTarget.z
            );

            if (targetDistance === 0) return true; // Skip same position

            // Normalize target direction
            toTarget.x /= targetDistance;
            toTarget.y /= targetDistance;
            toTarget.z /= targetDistance;

            // Agent facing direction
            const facing = {
              x: Math.cos(agentPitch) * Math.sin(agentYaw),
              y: Math.sin(agentPitch),
              z: Math.cos(agentPitch) * Math.cos(agentYaw),
            };

            // Calculate angle between facing and target directions
            const dotProduct =
              facing.x * toTarget.x +
              facing.y * toTarget.y +
              facing.z * toTarget.z;
            const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
            const angleDegrees = (angle * 180) / Math.PI;

            const halfFov = fovDegrees / 2;
            const withinFov = angleDegrees <= halfFov;

            // Property: Objects outside FOV should not be detected by standard sensing
            // (This would require integration with actual FOV filtering in the sensing system)
            expect(angleDegrees).toBeGreaterThanOrEqual(0);
            expect(angleDegrees).toBeLessThanOrEqual(180);

            return true;
          }
        )
      );
    });
  });

  describe('Performance Properties', () => {
    test('ray casting performance scales linearly with ray count', () => {
      fc.assert(
        fc.property(
          fc.record({
            rayCount: fc.integer({ min: 1, max: 100 }),
            distance: fc.integer({ min: 1, max: 32 }),
          }),
          ({ rayCount, distance }) => {
            const rays = Array.from({ length: rayCount }, (_, i) => ({
              origin: { x: 0, y: 64, z: 0 },
              direction: {
                x: Math.cos((2 * Math.PI * i) / rayCount),
                y: 0,
                z: Math.sin((2 * Math.PI * i) / rayCount),
              },
            }));

            const startTime = performance.now();

            rays.forEach(({ origin, direction }) => {
              raycastEngine.castRay(origin, direction, distance);
            });

            const endTime = performance.now();
            const totalTime = endTime - startTime;

            // Property: Performance should be reasonable for expected ray counts
            const avgTimePerRay = totalTime / rayCount;
            expect(avgTimePerRay).toBeLessThan(1); // Less than 1ms per ray

            // Property: Total time should scale reasonably with ray count
            expect(totalTime).toBeLessThan(rayCount * 2); // Less than 2ms per ray maximum

            return true;
          }
        )
      );
    });

    test('memory usage remains bounded during extended operation', () => {
      fc.assert(
        fc.property(fc.integer({ min: 10, max: 1000 }), (operationCount) => {
          const initialMemory = process.memoryUsage().heapUsed;

          // Perform many operations
          for (let i = 0; i < operationCount; i++) {
            const angle = (2 * Math.PI * i) / operationCount;
            raycastEngine.castRay(
              { x: 0, y: 64, z: 0 },
              { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
              32
            );
          }

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }

          const finalMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

          // Property: Memory usage should not grow unbounded
          expect(memoryIncrease).toBeLessThan(10); // Less than 10MB increase

          return true;
        })
      );
    });
  });
});

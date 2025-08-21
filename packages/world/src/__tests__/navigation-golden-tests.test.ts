/**
 * Golden Tests for Navigation System
 * 
 * These tests validate that specific navigation scenarios produce
 * expected pathfinding results, ensuring behavioral consistency.
 * 
 * @author @darianrosebrook
 */

import { NavigationSystem } from '../navigation/navigation-system';
import { DStarLiteCore } from '../navigation/dstar-lite-core';
import { 
  NavigationConfig, 
  PathPlanningRequest, 
  WorldPosition, 
  WorldChange,
  EnvironmentalHazard
} from '../navigation/types';

describe('Navigation Golden Tests', () => {
  let navigationSystem: NavigationSystem;

  beforeEach(() => {
    const config: NavigationConfig = {
      dstarLite: {
        searchRadius: 50,
        replanThreshold: 3,
        maxComputationTime: 100,
        heuristicWeight: 1.0,
      },
      costCalculation: {
        baseMoveCost: 1.0,
        diagonalMultiplier: 1.414,
        verticalMultiplier: 2.0,
        jumpCost: 3.0,
        swimCost: 4.0,
      },
      hazardCosts: {
        lavaProximity: 1000,
        voidFall: 10000,
        mobProximity: 200,
        darknessPenalty: 50,
        waterPenalty: 20,
      },
      optimization: {
        pathSmoothing: true,
        lookaheadDistance: 10,
        safetyMargin: 1.5,
        simplificationEnabled: true,
        maxOptimizationTime: 20,
      },
      caching: {
        maxCachedPaths: 100,
        cacheTtl: 60000,
        invalidateOnBlockChange: true,
        spatialIndexEnabled: true,
      },
      movement: {
        baseSpeed: 4.3,
        jumpHeight: 1.25,
        stepHeight: 0.6,
        collisionRadius: 0.3,
        lookaheadTime: 1.0,
      },
    };

    navigationSystem = new NavigationSystem(config);
  });

  afterEach(() => {
    navigationSystem.dispose();
  });

  describe('Basic Pathfinding Scenarios', () => {
    const basicScenarios = [
      {
        name: 'simple_straight_line',
        description: 'Direct path on flat terrain',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 10, y: 64, z: 0 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0
          }
        },
        expectedPath: {
          length: 10,
          maxDeviation: 1.0,
          nodes: [
            { x: 0, y: 64, z: 0 },
            { x: 10, y: 64, z: 0 }
          ],
          totalCost: 10.0,
          planningTime: '<50ms'
        }
      },
      {
        name: 'diagonal_movement',
        description: 'Diagonal path across flat terrain',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 10, y: 64, z: 10 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0
          }
        },
        expectedPath: {
          length: 14.14, // sqrt(10^2 + 10^2)
          maxDeviation: 1.5,
          approximateNodes: 2,
          totalCost: 14.14,
          planningTime: '<50ms'
        }
      },
      {
        name: 'vertical_navigation',
        description: 'Path requiring height changes',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 0, y: 70, z: 0 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 3.0
          }
        },
        expectedPath: {
          length: 6, // 6 blocks up
          maxDeviation: 2.0,
          approximateNodes: 3,
          totalCost: 12.0, // 6 * 2.0 vertical multiplier
          planningTime: '<75ms'
        }
      }
    ];

    basicScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, async () => {
        const startTime = Date.now();
        
        const result = await navigationSystem.planPath(scenario.request);
        
        const planningTime = Date.now() - startTime;
        
        // Validate path exists
        expect(result.success).toBe(true);
        expect(result.path).toBeDefined();
        expect(result.path!.waypoints.length).toBeGreaterThan(0);

        // Check planning time constraint
        const maxTime = parseInt(scenario.expectedPath.planningTime.replace(/[<>ms]/g, ''));
        expect(planningTime).toBeLessThan(maxTime);

        // Validate path properties
        const path = result.path!;
        expect(path.totalLength).toBeCloseTo(scenario.expectedPath.length, 1);
        expect(path.estimatedCost).toBeCloseTo(scenario.expectedPath.totalCost, 1);

        // Ensure path connects start to goal
        expect(path.waypoints[0]).toEqual(scenario.request.start);
        const lastWaypoint = path.waypoints[path.waypoints.length - 1];
        expect(lastWaypoint.x).toBeCloseTo(scenario.request.goal.x, 1);
        expect(lastWaypoint.y).toBeCloseTo(scenario.request.goal.y, 1);
        expect(lastWaypoint.z).toBeCloseTo(scenario.request.goal.z, 1);
      });
    });
  });

  describe('Hazard Avoidance Scenarios', () => {
    const hazardScenarios = [
      {
        name: 'lava_avoidance',
        description: 'Path avoiding lava hazards',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 20, y: 64, z: 0 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: true,
            maxDetour: 5.0
          }
        },
        hazards: [
          {
            type: 'lava',
            center: { x: 10, y: 64, z: 0 },
            radius: 3,
            severity: 1.0
          }
        ],
        expectedPath: {
          minLength: 22, // Detour around lava
          maxLength: 30,
          avoidanceMargin: 3.0,
          planningTime: '<100ms'
        }
      },
      {
        name: 'mob_avoidance_night',
        description: 'Path avoiding mob-dense areas at night',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 15, y: 64, z: 15 },
          urgency: 'careful',
          preferences: {
            avoidWater: false,
            avoidMobs: true,
            preferLighting: true,
            maxDetour: 10.0
          }
        },
        hazards: [
          {
            type: 'mob_density',
            center: { x: 7, y: 64, z: 7 },
            radius: 5,
            severity: 0.8,
            timeOfDay: 'night'
          }
        ],
        expectedPath: {
          minLength: 18, // sqrt(15^2 + 15^2) ≈ 21, but with some avoidance
          maxLength: 35,
          avoidanceMargin: 2.0,
          planningTime: '<150ms'
        }
      },
      {
        name: 'water_crossing',
        description: 'Efficient water crossing when necessary',
        request: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 20, y: 64, z: 0 },
          urgency: 'urgent',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0
          }
        },
        hazards: [
          {
            type: 'water',
            center: { x: 10, y: 64, z: 0 },
            radius: 4,
            severity: 0.5
          }
        ],
        expectedPath: {
          minLength: 20, // Direct crossing
          maxLength: 24,
          waterCrossing: true,
          planningTime: '<75ms'
        }
      }
    ];

    hazardScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, async () => {
        // Add hazards to navigation system
        scenario.hazards.forEach(hazard => {
          navigationSystem.addTemporaryHazard(hazard);
        });

        const startTime = Date.now();
        const result = await navigationSystem.planPath(scenario.request);
        const planningTime = Date.now() - startTime;

        // Validate successful pathfinding
        expect(result.success).toBe(true);
        expect(result.path).toBeDefined();

        const path = result.path!;
        
        // Check planning time
        const maxTime = parseInt(scenario.expectedPath.planningTime.replace(/[<>ms]/g, ''));
        expect(planningTime).toBeLessThan(maxTime);

        // Validate path length is within expected bounds
        expect(path.totalLength).toBeGreaterThanOrEqual(scenario.expectedPath.minLength);
        expect(path.totalLength).toBeLessThanOrEqual(scenario.expectedPath.maxLength);

        // Check hazard avoidance
        if (scenario.expectedPath.avoidanceMargin) {
          scenario.hazards.forEach(hazard => {
            if (hazard.type !== 'water' || !scenario.expectedPath.waterCrossing) {
              path.waypoints.forEach(waypoint => {
                const distance = Math.sqrt(
                  Math.pow(waypoint.x - hazard.center.x, 2) +
                  Math.pow(waypoint.z - hazard.center.z, 2)
                );
                expect(distance).toBeGreaterThan(hazard.radius + scenario.expectedPath.avoidanceMargin! - 1);
              });
            }
          });
        }
      });
    });
  });

  describe('Dynamic Replanning Scenarios', () => {
    const replanningScenarios = [
      {
        name: 'blocked_path_replan',
        description: 'Replan when path becomes blocked',
        initialRequest: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 20, y: 64, z: 0 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 3.0
          }
        },
        blockage: {
          position: { x: 10, y: 64, z: 0 },
          addedAt: 1000, // 1 second after initial plan
          type: 'wall'
        },
        expectedReplanning: {
          triggersReplan: true,
          newPathLength: 25, // Approximate detour
          replanTime: '<50ms',
          pathDeviation: '>5 blocks'
        }
      },
      {
        name: 'hazard_appears',
        description: 'Replan when new hazard detected',
        initialRequest: {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: 15, y: 64, z: 15 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: true,
            preferLighting: true,
            maxDetour: 8.0
          }
        },
        emergentHazard: {
          type: 'mob_group',
          center: { x: 7, y: 64, z: 7 },
          radius: 4,
          severity: 0.9,
          detectedAt: 1500
        },
        expectedReplanning: {
          triggersReplan: true,
          increasedCost: true,
          avoidanceMargin: 3.0,
          replanTime: '<75ms'
        }
      }
    ];

    replanningScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, async () => {
        // Initial path planning
        let result = await navigationSystem.planPath(scenario.initialRequest);
        expect(result.success).toBe(true);
        
        const initialPath = result.path!;
        const initialLength = initialPath.totalLength;
        
        // Simulate world change
        let worldChange: WorldChange;
        
        if ('blockage' in scenario) {
          worldChange = {
            type: 'block_placed',
            position: scenario.blockage.position,
            newBlockType: 'minecraft:stone',
            timestamp: scenario.blockage.addedAt
          };
        } else {
          worldChange = {
            type: 'hazard_detected',
            position: scenario.emergentHazard.center,
            hazardType: scenario.emergentHazard.type,
            severity: scenario.emergentHazard.severity,
            timestamp: scenario.emergentHazard.detectedAt
          };
        }

        // Apply world change and check for replanning
        const replanStartTime = Date.now();
        const replanResult = await navigationSystem.updateForWorldChange(worldChange, scenario.initialRequest);
        const replanTime = Date.now() - replanStartTime;

        if (scenario.expectedReplanning.triggersReplan) {
          expect(replanResult.replanned).toBe(true);
          expect(replanResult.newPath).toBeDefined();
          
          const newPath = replanResult.newPath!;
          
          // Check replanning time
          const maxReplanTime = parseInt(scenario.expectedReplanning.replanTime.replace(/[<>ms]/g, ''));
          expect(replanTime).toBeLessThan(maxReplanTime);

          // Validate new path properties
          if ('newPathLength' in scenario.expectedReplanning) {
            expect(newPath.totalLength).toBeCloseTo(scenario.expectedReplanning.newPathLength, 3);
          }

          if (scenario.expectedReplanning.increasedCost) {
            expect(newPath.estimatedCost).toBeGreaterThan(initialPath.estimatedCost);
          }

          if (scenario.expectedReplanning.pathDeviation) {
            const deviation = scenario.expectedReplanning.pathDeviation;
            const threshold = parseFloat(deviation.replace(/[><]/g, '').split(' ')[0]);
            
            // Calculate maximum deviation between old and new paths
            let maxDeviation = 0;
            newPath.waypoints.forEach(newPoint => {
              const minDistanceToOldPath = Math.min(...initialPath.waypoints.map(oldPoint => 
                Math.sqrt(
                  Math.pow(newPoint.x - oldPoint.x, 2) +
                  Math.pow(newPoint.z - oldPoint.z, 2)
                )
              ));
              maxDeviation = Math.max(maxDeviation, minDistanceToOldPath);
            });

            if (deviation.startsWith('>')) {
              expect(maxDeviation).toBeGreaterThan(threshold);
            }
          }
        }
      });
    });
  });

  describe('Performance Consistency', () => {
    test('repeated identical requests produce consistent results', () => {
      const testRequest: PathPlanningRequest = {
        start: { x: 0, y: 64, z: 0 },
        goal: { x: 12, y: 64, z: 12 },
        urgency: 'normal',
        preferences: {
          avoidWater: false,
          avoidMobs: false,
          preferLighting: false,
          maxDetour: 2.0
        }
      };

      const results: any[] = [];
      const timings: number[] = [];

      // Run same request multiple times
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        const result = navigationSystem.planPath(testRequest);
        const timing = Date.now() - startTime;

        results.push(result);
        timings.push(timing);
      }

      // Validate consistency
      results.forEach((result, index) => {
        expect(result.success).toBe(results[0].success);
        if (result.success && results[0].success) {
          expect(result.path!.totalLength).toBeCloseTo(results[0].path!.totalLength, 1);
          expect(result.path!.waypoints.length).toBe(results[0].path!.waypoints.length);
        }
      });

      // Validate timing consistency
      const avgTiming = timings.reduce((sum, t) => sum + t, 0) / timings.length;
      timings.forEach(timing => {
        expect(Math.abs(timing - avgTiming)).toBeLessThan(avgTiming * 0.5); // Within 50% of average
      });
    });

    test('pathfinding scales appropriately with distance', () => {
      const distances = [5, 10, 20, 40];
      const timings: { distance: number; time: number }[] = [];

      distances.forEach(distance => {
        const request: PathPlanningRequest = {
          start: { x: 0, y: 64, z: 0 },
          goal: { x: distance, y: 64, z: 0 },
          urgency: 'normal',
          preferences: {
            avoidWater: false,
            avoidMobs: false,
            preferLighting: false,
            maxDetour: 2.0
          }
        };

        const startTime = Date.now();
        navigationSystem.planPath(request);
        const endTime = Date.now();

        timings.push({ distance, time: endTime - startTime });
      });

      // Validate that time doesn't grow exponentially with distance
      timings.forEach(({ distance, time }, index) => {
        if (index > 0) {
          const prevTiming = timings[index - 1];
          const timeRatio = time / prevTiming.time;
          const distanceRatio = distance / prevTiming.distance;
          
          // Time should not grow faster than distance squared
          expect(timeRatio).toBeLessThan(Math.pow(distanceRatio, 2.5));
        }
      });
    });
  });
});

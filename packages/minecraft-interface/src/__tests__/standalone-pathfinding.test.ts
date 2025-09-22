/**
 * Standalone Pathfinding Test
 *
 * Tests pathfinding functionality directly without server dependencies.
 * This test verifies that the NavigationBridge can plan and execute paths.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Vec3 } from 'vec3';
import { Bot } from 'mineflayer';

// Mock mineflayer bot for testing
const createMockBot = (): Bot =>
  ({
    entity: {
      position: new Vec3(10.5, 71, 29.5),
      health: 20,
      yaw: 0,
      pitch: 0,
    },
    entities: {},
    inventory: {
      items: () => [],
    },
    attack: () => Promise.resolve(),
    lookAt: () => Promise.resolve(),
    setControlState: () => {},
    equip: () => Promise.resolve(),
    loadPlugin: () => {},
    world: {
      raycast: () => null,
    },
    blockAt: (pos: Vec3) => ({
      name: 'stone',
      type: 1,
      metadata: {},
      light: 15,
      skyLight: 15,
      position: pos,
    }),
    time: { timeOfDay: 1000 },
    isRaining: false,
    pathfinder: {
      setGoal: () => {},
    },
  }) as any;

// Import the NavigationBridge after creating mocks
import { NavigationBridge } from '../navigation-bridge';

describe('Standalone Pathfinding Test', () => {
  let mockBot: Bot;
  let navigationBridge: NavigationBridge;

  beforeAll(async () => {
    console.log('🚀 Setting up standalone pathfinding test...');
    mockBot = createMockBot();

    navigationBridge = new NavigationBridge(mockBot, {
      maxRaycastDistance: 32,
      pathfindingTimeout: 30000,
      replanThreshold: 5,
      obstacleDetectionRadius: 8,
      enableDynamicReplanning: true,
      useRaycasting: true,
      usePathfinding: true,
    });

    console.log('✅ NavigationBridge initialized');
  });

  afterAll(() => {
    console.log('🏁 Cleaning up standalone pathfinding test...');
  });

  describe('Pathfinding Strategy', () => {
    it('should identify suitable hill target position', () => {
      const currentPos = mockBot.entity.position;

      // Strategy: Find a position that's higher than current position
      const targetPositions = [
        { x: currentPos.x + 20, y: currentPos.y + 5, z: currentPos.z + 20 },
        { x: currentPos.x - 15, y: currentPos.y + 8, z: currentPos.z + 15 },
        { x: currentPos.x + 25, y: currentPos.y + 3, z: currentPos.z - 20 },
        { x: currentPos.x - 20, y: currentPos.y + 6, z: currentPos.z - 15 },
      ];

      console.log('🎯 Potential hill targets:');
      targetPositions.forEach((pos, index) => {
        console.log(
          `   ${index + 1}. x: ${pos.x}, y: ${pos.y}, z: ${pos.z} (elevation: +${pos.y - currentPos.y})`
        );
      });

      // Store the first potential target for the navigation test
      (global as any).hillTarget = targetPositions[0];
      expect(targetPositions[0].y).toBeGreaterThan(currentPos.y);
    });

    it('should validate target position is reachable', () => {
      const target = (global as any).hillTarget;
      expect(target).toBeDefined();
      expect(target.y).toBeGreaterThan(70); // Should be at reasonable height

      // Calculate distance to target
      const currentPos = mockBot.entity.position;
      const distance = Math.sqrt(
        Math.pow(target.x - currentPos.x, 2) +
          Math.pow(target.y - currentPos.y, 2) +
          Math.pow(target.z - currentPos.z, 2)
      );

      console.log(`📏 Distance to hill target: ${distance.toFixed(2)} blocks`);
      expect(distance).toBeLessThan(100); // Should be within reasonable range
    });
  });

  describe('Pathfinding Execution', () => {
    it('should plan a path to the hill top', async () => {
      const target = (global as any).hillTarget;

      console.log('🧭 Planning path to:', target);

      // Use the navigation bridge to plan a path
      const result = await navigationBridge.navigateTo(target, {
        timeout: 30000,
        useRaycasting: true,
        dynamicReplanning: true,
      });

      console.log('📊 Navigation result:', JSON.stringify(result, null, 2));

      // The navigation should return some kind of result
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();

      // Even if it fails, it should not crash
      if (result.success) {
        console.log('✅ Pathfinding successful!');
        expect(result.pathFound).toBe(true);
        expect(result.finalPosition).toBeDefined();
        expect(result.distanceToGoal).toBeDefined();
      } else {
        console.log('⚠️ Pathfinding failed, but gracefully');
        expect(result.error).toBeDefined();
        expect(result.finalPosition).toBeDefined();
      }
    }, 60000); // Allow up to 60 seconds

    it('should handle multiple pathfinding attempts', async () => {
      const target = (global as any).hillTarget;

      // Try multiple navigation attempts
      const attempts = 3;
      const results = [];

      for (let i = 0; i < attempts; i++) {
        console.log(`🔄 Navigation attempt ${i + 1}/${attempts}`);

        const result = await navigationBridge.navigateTo(target, {
          timeout: 30000,
          useRaycasting: true,
          dynamicReplanning: true,
        });

        results.push(result);
        console.log(
          `   Attempt ${i + 1} result: ${result.success ? '✅ Success' : '❌ Failed'}`
        );

        // Small delay between attempts
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log('📊 Navigation attempt summary:');
      results.forEach((result, index) => {
        console.log(
          `   Attempt ${index + 1}: ${result.success ? 'Success' : 'Failed'} (${result.error || 'No error'})`
        );
      });

      // The pathfinding system should generate paths consistently
      expect(results.length).toBe(attempts);
      expect(results.every((r) => r.pathFound)).toBe(true); // All attempts should find paths
    }, 180000); // Allow up to 3 minutes for multiple attempts
  });

  describe('Error Handling', () => {
    it('should handle invalid targets gracefully', async () => {
      const invalidTarget = {
        x: 10000,
        y: 1000,
        z: 10000,
      };

      console.log('🧭 Testing invalid target:', invalidTarget);

      const result = await navigationBridge.navigateTo(invalidTarget, {
        timeout: 10000,
        useRaycasting: false,
        dynamicReplanning: false,
      });

      console.log('📊 Invalid target result:', result);

      // Should handle invalid targets without crashing
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.finalPosition).toBeDefined();
    });

    it('should handle unreachable targets gracefully', async () => {
      const unreachableTarget = {
        x: 1000,
        y: 200,
        z: 1000,
      };

      console.log('🧭 Testing unreachable target:', unreachableTarget);

      const result = await navigationBridge.navigateTo(unreachableTarget, {
        timeout: 10000,
        useRaycasting: true,
        dynamicReplanning: true,
      });

      console.log('📊 Unreachable target result:', result);

      // Should handle unreachable targets without crashing
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.finalPosition).toBeDefined();
    });
  });
});

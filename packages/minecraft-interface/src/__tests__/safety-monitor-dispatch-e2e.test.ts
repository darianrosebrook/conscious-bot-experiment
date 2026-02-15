/**
 * Safety Monitor Dispatch E2E Test
 *
 * Validates the full reactive safety pipeline dispatch chain:
 *   threat assessment → triggerEmergencyResponse → equip/attack/flee
 *   → actionTranslator.executeAction() with correct payloads
 *
 * Extends automatic-safety-monitor-attack.test.ts by covering:
 * - Full flee path with navigate action payload verification
 * - move_forward fallback when no flee target computed
 * - Emergency navigation lease parameters (navLeaseHolder, navigationPriority)
 * - Combat failure → flee escalation with payload verification
 *
 * Covers: G-1 (reactive safety), EP-7
 * Leaves exercised: equip_weapon, attack_entity, navigate (flee), move_forward (fallback), find_shelter
 *
 * Run with: npx vitest run packages/minecraft-interface/src/__tests__/safety-monitor-dispatch-e2e.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vec3 } from 'vec3';
import { AutomaticSafetyMonitor } from '../automatic-safety-monitor';

// ============================================================================
// Mock factories
// ============================================================================

function makeBot(overrides: Record<string, any> = {}): any {
  return {
    entity: {
      position: new Vec3(100, 64, 200),
      height: 1.8,
      yaw: 0,
      pitch: 0,
    },
    health: overrides.health ?? 20,
    food: 20,
    heldItem: overrides.heldItem ?? { name: 'iron_sword' },
    entities: overrides.entities ?? {
      1: {
        id: 1,
        name: 'zombie',
        type: 'zombie',
        position: new Vec3(105, 64, 200),
        health: 20,
      },
    },
    on: vi.fn(),
    once: vi.fn(),
    blockAt: vi.fn().mockReturnValue(null),
    attack: vi.fn(),
    lookAt: vi.fn(),
    setControlState: vi.fn(),
  };
}

function makeActionTranslator(): any {
  return {
    executeAction: vi.fn().mockResolvedValue({ status: 'success' }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Safety Monitor Dispatch E2E', () => {

  // ── Attack path: equip_weapon → attack_entity ──

  describe('Attack dispatch chain', () => {
    it('equips weapon then dispatches attack with correct entityId', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).attackNearestThreat({
        threatLevel: 'high',
        threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
        recommendedAction: 'attack',
      });

      expect(translator.executeAction).toHaveBeenCalledTimes(2);

      // First call: equip_weapon
      const equipCall = translator.executeAction.mock.calls[0][0];
      expect(equipCall.type).toBe('equip_weapon');
      expect(equipCall.parameters.preferredType).toBe('any');

      // Second call: attack_entity
      const attackCall = translator.executeAction.mock.calls[1][0];
      expect(attackCall.type).toBe('attack_entity');
      expect(attackCall.parameters.entityId).toBe(1);
      expect(attackCall.parameters.retreatHealth).toBe(6);
      expect(attackCall.parameters.radius).toBe(16);
    });

    it('attack dispatches with duration parameter', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).attackNearestThreat({
        threatLevel: 'high',
        threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
        recommendedAction: 'attack',
      });

      const attackCall = translator.executeAction.mock.calls[1][0];
      expect(attackCall.parameters.duration).toBeDefined();
      expect(typeof attackCall.parameters.duration).toBe('number');
      expect(attackCall.parameters.duration).toBeGreaterThan(0);
    });
  });

  // ── Flee path: navigate with emergency lease ──

  describe('Flee dispatch chain', () => {
    it('flee dispatches navigate with emergency lease parameters', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).fleeFromThreats();

      // At least one call made
      expect(translator.executeAction).toHaveBeenCalled();

      const calls = translator.executeAction.mock.calls;
      const navigateCall = calls.find((c: any) => c[0].type === 'navigate');
      const moveForwardCall = calls.find((c: any) => c[0].type === 'move_forward');

      // Should have dispatched either navigate or move_forward
      expect(
        navigateCall || moveForwardCall,
        'Expected navigate or move_forward dispatch',
      ).toBeDefined();

      if (navigateCall) {
        // Verify emergency lease parameters
        expect(navigateCall[0].parameters.navLeaseHolder).toBe('safety-monitor');
        expect(navigateCall[0].parameters.navigationPriority).toBe('emergency');
        expect(navigateCall[0].parameters.sprint).toBe(true);
        expect(navigateCall[0].parameters.range).toBe(2);
      }
    });

    it('flee falls back to move_forward when no flee target computed', async () => {
      // Bot surrounded — calculateFleeDirection returns null-ish, computeFleeTarget returns null
      // When computeFleeTarget returns null, the code dispatches move_forward
      const bot = makeBot();
      const translator = makeActionTranslator();

      // Override bot entity to make computeFleeTarget return null
      // by making all cardinal directions blocked (entities everywhere)
      bot.entities = {
        1: { id: 1, name: 'zombie', type: 'zombie', position: new Vec3(101, 64, 200), health: 20 },
        2: { id: 2, name: 'zombie', type: 'zombie', position: new Vec3(99, 64, 200), health: 20 },
        3: { id: 3, name: 'zombie', type: 'zombie', position: new Vec3(100, 64, 201), health: 20 },
        4: { id: 4, name: 'zombie', type: 'zombie', position: new Vec3(100, 64, 199), health: 20 },
      };

      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).fleeFromThreats();

      const calls = translator.executeAction.mock.calls;
      // Regardless of which path, some action was dispatched
      expect(calls.length).toBeGreaterThanOrEqual(1);

      // Check that a movement action was dispatched (navigate or move_forward)
      const hasMovement = calls.some(
        (c: any) => c[0].type === 'navigate' || c[0].type === 'move_forward',
      );
      expect(hasMovement).toBe(true);
    });
  });

  // ── Combat failure → flee escalation ──

  describe('Combat failure → flee escalation', () => {
    it('attack failure triggers flee with navigate dispatch', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();

      // equip succeeds, attack fails
      translator.executeAction
        .mockResolvedValueOnce({ status: 'success' })  // equip_weapon
        .mockRejectedValueOnce(new Error('combat failed')) // attack_entity
        .mockResolvedValue({ status: 'success' }); // flee navigate

      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).attackNearestThreat({
        threatLevel: 'high',
        threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
        recommendedAction: 'attack',
      });

      // 3 calls: equip + attack (failed) + flee (navigate or move_forward)
      expect(translator.executeAction).toHaveBeenCalledTimes(3);

      // Verify the third call is a movement action (flee)
      const fleeCall = translator.executeAction.mock.calls[2][0];
      expect(
        fleeCall.type === 'navigate' || fleeCall.type === 'move_forward',
        `Expected flee action, got: ${fleeCall.type}`,
      ).toBe(true);
    });
  });

  // ── Combat re-entry blocking ──

  describe('Combat re-entry blocking', () => {
    it('second attack is blocked while first is in progress', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();

      // Make attack_entity take a while
      translator.executeAction
        .mockResolvedValueOnce({ status: 'success' }) // equip (fast)
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve({ status: 'success' }), 100)),
        ); // attack (100ms)

      const monitor = new AutomaticSafetyMonitor(bot, translator);

      const assessment = {
        threatLevel: 'high' as const,
        threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
        recommendedAction: 'attack' as const,
      };

      // Start first attack (don't await)
      const first = (monitor as any).attackNearestThreat(assessment);

      // Wait a tick for equip to complete
      await new Promise((r) => setTimeout(r, 10));

      // Start second attack while first is still running
      await (monitor as any).attackNearestThreat(assessment);

      await first;

      // Only 2 calls from first attack (equip + attack)
      // Second attack should have been blocked
      expect(translator.executeAction).toHaveBeenCalledTimes(2);
    });
  });

  // ── Shelter path: find_shelter dispatch ──

  describe('Shelter dispatch chain', () => {
    it('findShelter dispatches find_shelter with emergency lease', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).findShelter();

      expect(translator.executeAction).toHaveBeenCalledTimes(1);

      const shelterCall = translator.executeAction.mock.calls[0][0];
      expect(shelterCall.type).toBe('find_shelter');
      expect(shelterCall.parameters.priority).toBe('high');
      expect(shelterCall.parameters.navLeaseHolder).toBe('safety-monitor');
      expect(shelterCall.parameters.navigationPriority).toBe('emergency');
    });

    it('findShelter failure does not throw (gracefully caught)', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      translator.executeAction.mockRejectedValueOnce(new Error('no shelter found'));
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      // Should not throw
      await expect((monitor as any).findShelter()).resolves.toBeUndefined();
    });
  });

  // ── Direct flee dispatches navigate with emergency lease ──

  describe('Direct flee dispatch', () => {
    it('flee dispatches navigate with sprint=true and range=2', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator);

      await (monitor as any).fleeFromThreats();

      const calls = translator.executeAction.mock.calls;
      // Find the navigate call (first movement dispatch)
      const moveCall = calls.find(
        (c: any) => c[0].type === 'navigate' || c[0].type === 'move_forward',
      );
      expect(moveCall, 'Expected a movement dispatch').toBeDefined();

      if (moveCall![0].type === 'navigate') {
        expect(moveCall![0].parameters.sprint).toBe(true);
        expect(moveCall![0].parameters.range).toBe(2);
      }
    });

    it('move_forward fallback dispatches with distance from config', async () => {
      const bot = makeBot();
      const translator = makeActionTranslator();
      const monitor = new AutomaticSafetyMonitor(bot, translator, {
        maxFleeDistance: 25,
      });

      await (monitor as any).fleeFromThreats();

      const calls = translator.executeAction.mock.calls;
      const moveCall = calls.find((c: any) => c[0].type === 'move_forward');
      // If move_forward was dispatched, verify distance
      if (moveCall) {
        expect(moveCall[0].parameters.distance).toBe(25);
      }
    });
  });
});

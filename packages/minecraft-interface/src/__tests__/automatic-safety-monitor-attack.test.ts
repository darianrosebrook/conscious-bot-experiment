/**
 * FF-A: AutomaticSafetyMonitor Attack Path Tests
 *
 * Tests that triggerEmergencyResponse correctly handles the 'attack'
 * recommended action — equipping a weapon and engaging the nearest threat.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vec3 } from 'vec3';
import { AutomaticSafetyMonitor } from '../automatic-safety-monitor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBot(overrides: Record<string, any> = {}): any {
  return {
    entity: {
      position: new Vec3(0, 64, 0),
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
        position: new Vec3(5, 64, 0),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FF-A: AutomaticSafetyMonitor attack path', () => {
  it('includes autoAttackEnabled in default config', () => {
    const bot = makeBot();
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator);
    const status = monitor.getStatus();
    expect(status.config.autoAttackEnabled).toBe(true);
  });

  it('autoAttackEnabled can be set to false', () => {
    const bot = makeBot();
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator, {
      autoAttackEnabled: false,
    });
    const status = monitor.getStatus();
    expect(status.config.autoAttackEnabled).toBe(false);
  });

  it('attackNearestThreat equips weapon then attacks entity', async () => {
    const bot = makeBot();
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator);

    // Call the private method directly
    await (monitor as any).attackNearestThreat({
      threatLevel: 'high',
      threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
      recommendedAction: 'attack',
    });

    // Should have called executeAction twice: equip_weapon then attack_entity
    expect(translator.executeAction).toHaveBeenCalledTimes(2);

    const firstCall = translator.executeAction.mock.calls[0][0];
    expect(firstCall.type).toBe('equip_weapon');
    expect(firstCall.parameters.preferredType).toBe('any');

    const secondCall = translator.executeAction.mock.calls[1][0];
    expect(secondCall.type).toBe('attack_entity');
    expect(secondCall.parameters.entityId).toBe(1);
    expect(secondCall.parameters.retreatHealth).toBe(6);
  });

  it('attackNearestThreat falls back to flee when no target found', async () => {
    const bot = makeBot({ entities: {} }); // No entities
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator);

    await (monitor as any).attackNearestThreat({
      threatLevel: 'high',
      threats: [],
      recommendedAction: 'attack',
    });

    // Should not have called equip or attack
    // But should have attempted to flee (which calls executeAction with navigate)
    const calls = translator.executeAction.mock.calls;
    const hasAttack = calls.some((c: any) => c[0].type === 'attack_entity');
    expect(hasAttack).toBe(false);
  });

  it('attackNearestThreat falls back to flee on combat failure', async () => {
    const bot = makeBot();
    const translator = makeActionTranslator();

    // Make attack_entity fail
    translator.executeAction
      .mockResolvedValueOnce({ status: 'success' }) // equip succeeds
      .mockRejectedValueOnce(new Error('combat failed')); // attack fails

    const monitor = new AutomaticSafetyMonitor(bot, translator);

    // Should not throw
    await (monitor as any).attackNearestThreat({
      threatLevel: 'high',
      threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
      recommendedAction: 'attack',
    });

    // Should have tried equip + attack (2 calls), then flee attempt
    expect(translator.executeAction).toHaveBeenCalledTimes(3);
  });

  it('attackNearestThreat picks closest hostile within 16 blocks', async () => {
    const bot = makeBot({
      entities: {
        1: {
          id: 1,
          name: 'zombie',
          type: 'zombie',
          position: new Vec3(15, 64, 0),
          health: 20,
        },
        2: {
          id: 2,
          name: 'skeleton',
          type: 'skeleton',
          position: new Vec3(3, 64, 0),
          health: 20,
        },
        3: {
          id: 3,
          name: 'cow',
          type: 'cow',
          position: new Vec3(1, 64, 0),
          health: 10,
        },
      },
    });
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator);

    await (monitor as any).attackNearestThreat({
      threatLevel: 'high',
      threats: [],
      recommendedAction: 'attack',
    });

    // Should target skeleton (id=2) as nearest hostile, not cow (non-hostile)
    const attackCall = translator.executeAction.mock.calls.find(
      (c: any) => c[0].type === 'attack_entity',
    );
    expect(attackCall).toBeDefined();
    expect(attackCall![0].parameters.entityId).toBe(2);
  });

  it('attackNearestThreat blocks re-entry while combat in progress', async () => {
    const bot = makeBot();
    const translator = makeActionTranslator();

    // Make attack_entity take a while (simulate ongoing combat)
    translator.executeAction
      .mockResolvedValueOnce({ status: 'success' }) // equip succeeds quickly
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ status: 'success' }), 100)),
      ); // attack takes 100ms

    const monitor = new AutomaticSafetyMonitor(bot, translator);
    const assessment = {
      threatLevel: 'high' as const,
      threats: [{ type: 'zombie', distance: 5, threatLevel: 70 }],
      recommendedAction: 'attack' as const,
    };

    // Start first attack (don't await yet)
    const firstAttack = (monitor as any).attackNearestThreat(assessment);

    // Yield to let the first attack start (equip phase)
    await new Promise((r) => setTimeout(r, 10));

    // Second call should be blocked by combatInProgress guard
    await (monitor as any).attackNearestThreat(assessment);

    await firstAttack;

    // Only 2 executeAction calls (equip + attack from first call)
    // The second call was blocked entirely
    expect(translator.executeAction).toHaveBeenCalledTimes(2);
  });

  it('attackNearestThreat ignores entities beyond 16 blocks', async () => {
    const bot = makeBot({
      entities: {
        1: {
          id: 1,
          name: 'zombie',
          type: 'zombie',
          position: new Vec3(20, 64, 0), // Beyond 16 blocks
          health: 20,
        },
      },
    });
    const translator = makeActionTranslator();
    const monitor = new AutomaticSafetyMonitor(bot, translator);

    await (monitor as any).attackNearestThreat({
      threatLevel: 'high',
      threats: [],
      recommendedAction: 'attack',
    });

    // No attack_entity call — target too far
    const hasAttack = translator.executeAction.mock.calls.some(
      (c: any) => c[0].type === 'attack_entity',
    );
    expect(hasAttack).toBe(false);
  });
});

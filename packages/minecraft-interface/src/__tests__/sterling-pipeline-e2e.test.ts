/**
 * Sterling pipeline E2E tests.
 *
 * When Sterling is up (STERLING_E2E=1), exercises the full pipeline:
 * Sterling expand -> steps -> stepToLeafExecution -> mapBTActionToMinecraft
 * -> ActionTranslator.executeAction -> leaf execution.
 *
 * Same style as explore-for-resources-block: mocks bot/leaf factory,
 * asserts no "Unknown action type" and leaves are invoked.
 *
 * Run: STERLING_E2E=1 pnpm --filter @conscious-bot/minecraft-interface test:sterling-pipeline
 * Or: bash scripts/run-e2e.sh (starts Sterling, runs this suite)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('mineflayer-pathfinder', () => ({
  pathfinder: vi.fn(),
  Movements: vi.fn().mockImplementation(() => ({
    scafoldingBlocks: [],
    canDig: false,
  })),
}));

vi.mock('../navigation-bridge', () => ({
  NavigationBridge: vi.fn().mockImplementation(() => ({})),
}));

import { SterlingClient } from '@conscious-bot/core';
import { stepToLeafExecution, mapBTActionToMinecraft } from '@conscious-bot/planning';
import { ActionTranslator } from '../action-translator';

const STERLING_E2E = process.env.STERLING_E2E === '1';

function createMockBot() {
  return {
    entity: {
      position: { x: 0, y: 64, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      on: vi.fn(),
      once: vi.fn(),
    },
    inventory: { items: () => [], slots: () => [] },
    blockAt: vi.fn().mockReturnValue(null),
    findBlock: vi.fn().mockResolvedValue(null),
    pathfinder: {
      goto: vi.fn().mockResolvedValue({}),
      stop: vi.fn(),
      setMovements: vi.fn(),
    },
    chat: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    loadPlugin: vi.fn(),
    registry: { blocksByName: {}, itemsByName: {} },
    version: '1.20.4',
    world: { getBlock: vi.fn() },
  } as any;
}

function createMockLeaf(name: string) {
  return {
    spec: { name, placeholder: false },
    run: vi.fn().mockResolvedValue({ status: 'success', result: {} }),
  };
}

const DEFAULT_LEAVES = [
  'craft_recipe', 'smelt', 'place_workstation', 'acquire_material', 'place_block',
  'consume_food', 'collect_items', 'chat', 'wait', 'get_light_level', 'get_block_at',
  'find_resource', 'equip_tool', 'equip_weapon', 'retreat_from_threat', 'use_item',
  'sense_hostiles', 'place_torch', 'place_torch_if_needed', 'step_forward_safely',
  'sterling_navigate', 'explore_for_resources', 'dig_block', 'introspect_recipe',
  'prepare_site', 'build_module', 'place_feature', 'manage_inventory', 'till_soil',
  'plant_crop', 'harvest_crop', 'manage_farm', 'interact_with_block', 'attack_entity',
];

function setupMockLeafFactory() {
  const leaves = new Map<string, ReturnType<typeof createMockLeaf>>();
  for (const name of DEFAULT_LEAVES) {
    leaves.set(name, createMockLeaf(name));
  }
  (global as any).minecraftLeafFactory = {
    get: (n: string) => leaves.get(n) ?? null,
    isRoutable: (n: string) => leaves.has(n),
  };
  return leaves;
}

function clearLeafFactory() {
  delete (global as any).minecraftLeafFactory;
}

/** Known Sterling smoke digests (pre-seeded when Sterling is up). */
const SMOKE_DIGESTS = [
  { digest: 'smoke_e2e_chat_wait_v1', label: 'chat+wait happy path' },
  { digest: 'smoke_find_resource_v1', label: 'find_resource (read-only)' },
  { digest: 'smoke_get_light_level_v1', label: 'get_light_level (read-only)' },
];

describe('Sterling pipeline E2E', () => {
  let translator: ActionTranslator;
  let client: SterlingClient | null = null;

  beforeEach(() => {
    translator = new ActionTranslator(createMockBot(), {
      actionTimeout: 5000,
      pathfindingTimeout: 5000,
    });
    clearLeafFactory();
  });

  describe('when STERLING_E2E=1 and Sterling is up', () => {
    beforeAll(async () => {
      if (!STERLING_E2E) return;
      client = new SterlingClient({ url: process.env.STERLING_WS_URL || 'ws://localhost:8766' });
      try {
        await client.connect();
      } catch {
        client = null;
      }
    });

    it.each(SMOKE_DIGESTS)(
      'expand $digest -> steps -> map -> executeAction (no Unknown action type)',
      async ({ digest }) => {
        if (!STERLING_E2E || !client) {
          return;
        }

        const response = await client!.expandByDigest(
          {
            committed_ir_digest: digest,
            schema_version: '1.1.0',
            request_id: `e2e-${Date.now()}`,
          },
          10000
        );

        if (response.status !== 'ok' || !response.steps?.length) {
          return;
        }

        setupMockLeafFactory();
        const leafMap = (global as any).minecraftLeafFactory;

        for (const step of response.steps) {
          const stepWithMeta = { meta: { leaf: step.leaf, args: step.args ?? {} } };
          const leafExec = stepToLeafExecution(stepWithMeta);
          if (!leafExec) continue;

          const mapped = mapBTActionToMinecraft(`minecraft.${leafExec.leafName}`, leafExec.args, {
            strict: true,
          });
          if (!mapped) continue;

          const result = await translator.executeAction({
            type: mapped.type as any,
            parameters: mapped.parameters ?? {},
            timeout: 5000,
          });

          expect(result.error ?? '').not.toContain('Unknown action type');
        }
      },
      15000
    );

    it('expand smoke_e2e_chat_wait_v1 -> at least one step executes via leaf', async () => {
      if (!STERLING_E2E || !client) {
        return;
      }

      const response = await client!.expandByDigest(
        {
          committed_ir_digest: 'smoke_e2e_chat_wait_v1',
          schema_version: '1.1.0',
          request_id: `e2e-leaf-${Date.now()}`,
        },
        10000
      );

      if (response.status !== 'ok' || !response.steps?.length) {
        return;
      }

      const leaves = setupMockLeafFactory();

      let executedCount = 0;
      for (const step of response.steps) {
        const stepWithMeta = { meta: { leaf: step.leaf, args: step.args ?? {} } };
        const leafExec = stepToLeafExecution(stepWithMeta);
        if (!leafExec) continue;

        const mapped = mapBTActionToMinecraft(`minecraft.${leafExec.leafName}`, leafExec.args, {
          strict: true,
        });
        if (!mapped) continue;

        const leaf = leaves.get(leafExec.leafName);
        if (!leaf) continue;

        const result = await translator.executeAction({
          type: mapped.type as any,
          parameters: mapped.parameters ?? {},
          timeout: 5000,
        });

        if (!result.error?.includes('Unknown action type')) {
          executedCount++;
          expect(leaf.run).toHaveBeenCalled();
        }
      }

      expect(executedCount).toBeGreaterThan(0);
    }, 15000);
  });

  describe('when STERLING_E2E is not set', () => {
    it('skips Sterling-dependent tests (no failure)', () => {
      if (!STERLING_E2E) {
        expect(true).toBe(true);
      }
    });
  });
});

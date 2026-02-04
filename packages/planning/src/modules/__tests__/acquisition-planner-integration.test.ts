/**
 * Acquisition Planner Integration Tests
 *
 * Verifies:
 * - SterlingPlanner dispatches collect/mine tasks to acquisition solver (Rig D upgrade)
 * - Steps are tagged with source: 'rig-d-acquisition'
 * - Falls through to compiler when acquisition solver not registered
 * - Falls through to compiler when acquisition solver returns no steps
 * - Leaf arg contracts for interact_with_entity and open_container
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLeafArgs, KNOWN_LEAVES } from '../leaf-arg-contracts';
import { SterlingPlanner } from '../../task-integration/sterling-planner';
import type { Task } from '../../types/task';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCollectTask(item: string, quantity = 1): Partial<Task> {
  return {
    id: 'test-collect-1',
    title: `Collect ${item}`,
    parameters: {
      requirementCandidate: {
        kind: 'collect',
        outputPattern: item,
        quantity,
      },
    },
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'collect',
      currentState: {
        inventory: [{ name: 'wooden_pickaxe', count: 1 }],
        nearbyBlocks: ['oak_log', 'stone'],
        nearbyEntities: [],
      },
    } as Task['metadata'],
  };
}

function makeMineTask(item: string, quantity = 1): Partial<Task> {
  return {
    id: 'test-mine-1',
    title: `Mine ${item}`,
    parameters: {
      requirementCandidate: {
        kind: 'mine',
        outputPattern: item,
        quantity,
      },
    },
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'mine',
      currentState: {
        inventory: [{ name: 'wooden_pickaxe', count: 1 }],
        nearbyBlocks: ['stone', 'iron_ore'],
        nearbyEntities: [],
      },
    } as Task['metadata'],
  };
}

/** Build a mock acquisition solver that returns solved result with steps. */
function makeMockAcquisitionSolver(steps: Array<{ action: string; actionType: string }> = [
  { action: 'mine:iron_ore', actionType: 'mine' },
]) {
  const solvedResult = {
    solved: true,
    planId: 'acq-plan-001',
    selectedStrategy: 'mine',
    candidateSetDigest: 'digest-abc123',
    steps: steps.map(s => ({
      ...s,
      produces: [{ name: 'iron_ore', count: 1 }],
      consumes: [],
    })),
    solveMeta: { bundles: [{ bundleId: 'bundle-001' }] },
  };

  return {
    solverId: 'minecraft.acquisition',
    isAvailable: () => true,
    solveAcquisition: vi.fn().mockResolvedValue(solvedResult),
    toTaskSteps: vi.fn().mockReturnValue(
      steps.map((s, i) => ({
        id: `step-acq-${i + 1}`,
        label: `Acquire: ${s.action}`,
        done: false,
        order: i + 1,
        meta: {
          domain: 'acquisition',
          leaf: 'acquire_material',
          action: s.action,
          actionType: s.actionType,
        },
      })),
    ),
  };
}

/** Build a mock minecraftGet that returns bot context. */
function makeMockMinecraftGet() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      data: {
        data: { inventory: { items: [{ name: 'wooden_pickaxe', count: 1 }] } },
        worldState: { nearbyBlocks: ['oak_log', 'stone'] },
      },
    }),
  });
}

// ── SterlingPlanner dispatch tests ─────────────────────────────────────────

describe('SterlingPlanner Rig D dispatch', () => {
  let planner: SterlingPlanner;
  let mockGet: ReturnType<typeof makeMockMinecraftGet>;

  beforeEach(() => {
    mockGet = makeMockMinecraftGet();
    planner = new SterlingPlanner({ minecraftGet: mockGet });
  });

  it('collect task dispatches to acquisition solver when registered', async () => {
    const solver = makeMockAcquisitionSolver();
    planner.registerSolver(solver as any);

    const result = await planner.generateDynamicSteps(makeCollectTask('oak_log', 3));

    expect(solver.solveAcquisition).toHaveBeenCalledOnce();
    expect(solver.toTaskSteps).toHaveBeenCalledOnce();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.route?.requiredRig).toBe('D');
    expect(result.route?.reason).toContain('rig-d-upgrade');
  });

  it('mine task dispatches to acquisition solver when registered', async () => {
    const solver = makeMockAcquisitionSolver();
    planner.registerSolver(solver as any);

    const result = await planner.generateDynamicSteps(makeMineTask('iron_ore', 2));

    expect(solver.solveAcquisition).toHaveBeenCalledOnce();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.route?.requiredRig).toBe('D');
  });

  it('steps tagged with source: rig-d-acquisition', async () => {
    const solver = makeMockAcquisitionSolver();
    planner.registerSolver(solver as any);

    const result = await planner.generateDynamicSteps(makeCollectTask('oak_log'));

    for (const step of result.steps) {
      expect(step.meta?.source).toBe('rig-d-acquisition');
      expect(step.meta?.strategySelected).toBe('mine');
      expect(step.meta?.candidateSetDigest).toBe('digest-abc123');
    }
  });

  it('falls through to compiler when acquisition solver not registered', async () => {
    // No solver registered — should go through compiler path
    const result = await planner.generateDynamicSteps(makeCollectTask('oak_log', 3));

    // Compiler produces fallback steps (acquire_material)
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.route?.requiredRig).toBeNull();
    expect(result.route?.reason).toBe('collect-requirement');
  });

  it('falls through to compiler when acquisition solver returns no steps', async () => {
    const solver = makeMockAcquisitionSolver();
    solver.solveAcquisition.mockResolvedValue({ solved: false, steps: [] });
    solver.toTaskSteps.mockReturnValue([]);
    planner.registerSolver(solver as any);

    const result = await planner.generateDynamicSteps(makeCollectTask('oak_log', 3));

    // Should fall through to compiler
    expect(solver.solveAcquisition).toHaveBeenCalledOnce();
    expect(result.steps.length).toBeGreaterThan(0);
    // Route stays as compiler since Rig D didn't produce steps
    expect(result.route?.requiredRig).toBeNull();
  });

  it('falls through to compiler when acquisition solver throws', async () => {
    const solver = makeMockAcquisitionSolver();
    solver.solveAcquisition.mockRejectedValue(new Error('solver crashed'));
    planner.registerSolver(solver as any);

    const result = await planner.generateDynamicSteps(makeCollectTask('oak_log', 3));

    // Should fall through to compiler
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.route?.requiredRig).toBeNull();
  });

  it('craft tasks do NOT trigger Rig D upgrade (stay on Rig A path)', async () => {
    const solver = makeMockAcquisitionSolver();
    planner.registerSolver(solver as any);

    const craftTask = {
      id: 'test-craft-1',
      title: 'Craft wooden_pickaxe',
      parameters: {
        requirementCandidate: {
          kind: 'craft',
          outputPattern: 'wooden_pickaxe',
          quantity: 1,
        },
      },
    };

    const result = await planner.generateDynamicSteps(craftTask as any);

    // Craft goes to Rig A, not Rig D — acquisition solver should NOT be called
    expect(solver.solveAcquisition).not.toHaveBeenCalled();
  });
});

// ── Leaf contract tests ────────────────────────────────────────────────────

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

/**
 * Tool Progression Integration E2E Tests
 *
 * Verifies the needsBlocks -> explore_for_resources epistemic loop:
 * - When tool progression solver returns needsBlocks (no required blocks nearby),
 *   SterlingPlanner emits one explore_for_resources step with resource_tags.
 * - Step shape and args are correct for step-to-leaf-execution.
 *
 * Uses real MinecraftToolProgressionSolver; needsBlocks is an early-exit before
 * Sterling, so Sterling availability is not required for these tests.
 *
 * Run with: pnpm --filter @conscious-bot/planning test -- tool-progression-integration
 * Or via: bash scripts/run-e2e.sh (Suite 3)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SterlingPlanner } from '../../task-integration/sterling-planner';
import { MinecraftToolProgressionSolver } from '../minecraft-tool-progression-solver';
import type { SterlingReasoningService } from '../sterling-reasoning-service';
import type { Task } from '../../types/task';

function makeMockMinecraftGet() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: {
          data: { inventory: { items: [{ name: 'wooden_pickaxe', count: 1 }] } },
          worldState: { nearbyBlocks: ['oak_log', 'stone'] },
        },
      }),
  });
}

function makeToolProgressionTask(
  targetTool: string,
  inventory: Array<{ name: string; count: number }>,
  nearbyBlocks: string[]
): Partial<Task> {
  const m = targetTool.match(/^(wooden|stone|iron|diamond)_(pickaxe|axe|shovel|hoe|sword)$/);
  const { toolType, targetTier } = m
    ? { toolType: m[2], targetTier: m[1] }
    : { toolType: 'pickaxe', targetTier: 'stone' };
  return {
    id: 'test-tp-1',
    title: `Get ${targetTool}`,
    parameters: {
      requirementCandidate: {
        kind: 'tool_progression',
        targetTool,
        toolType,
        targetTier,
        quantity: 1,
      },
    },
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'tool_progression',
      currentState: {
        inventory,
        nearbyBlocks,
        nearbyEntities: [],
      },
    } as Task['metadata'],
  };
}

describe('tool progression integration', () => {
  let planner: SterlingPlanner;
  let mockGet: ReturnType<typeof makeMockMinecraftGet>;

  beforeEach(() => {
    mockGet = makeMockMinecraftGet();
    planner = new SterlingPlanner({ minecraftGet: mockGet });
  });

  describe('needsBlocks -> explore_for_resources', () => {
    it('emits explore_for_resources step with resource_tags when stone missing', async () => {
      const mockSterling: SterlingReasoningService = {
        isAvailable: vi.fn().mockReturnValue(true),
        solve: vi.fn(),
        getConnectionNonce: vi.fn().mockReturnValue(1),
        registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
        verifyReachability: vi.fn(),
        queryKnowledgeGraph: vi.fn(),
        withFallback: vi.fn(),
      } as unknown as SterlingReasoningService;
      const solver = new MinecraftToolProgressionSolver(mockSterling);
      planner.registerSolver(solver);

      const task = makeToolProgressionTask(
        'stone_pickaxe',
        [{ name: 'wooden_pickaxe', count: 1 }],
        [] // no stone nearby — triggers needsBlocks
      );

      const result = await planner.generateDynamicSteps(task);

      expect(result.steps).toHaveLength(1);
      const step = result.steps[0];
      expect(step.meta?.leaf).toBe('explore_for_resources');
      expect(step.meta?.args).toBeDefined();
      const args = step.meta?.args as Record<string, unknown>;
      expect(args.resource_tags).toEqual(['stone']);
      expect(args.goal_item).toBe('stone_pickaxe');
      expect(args.reason).toBe('needs_blocks');
      expect(result.route?.requiredRig).toBe('B');
    });

    it('emits explore_for_resources for iron_ore when missing', async () => {
      const mockSterling: SterlingReasoningService = {
        isAvailable: vi.fn().mockReturnValue(true),
        solve: vi.fn(),
        getConnectionNonce: vi.fn().mockReturnValue(1),
        registerDomainDeclaration: vi.fn().mockResolvedValue({ success: true }),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        getHealthStatus: vi.fn().mockReturnValue({ enabled: true }),
        verifyReachability: vi.fn(),
        queryKnowledgeGraph: vi.fn(),
        withFallback: vi.fn(),
      } as unknown as SterlingReasoningService;
      const solver = new MinecraftToolProgressionSolver(mockSterling);
      planner.registerSolver(solver);

      const task = makeToolProgressionTask(
        'iron_pickaxe',
        [
          { name: 'wooden_pickaxe', count: 1 },
          { name: 'stone_pickaxe', count: 1 },
        ],
        ['stone', 'cobblestone'] // has stone, no iron_ore
      );

      const result = await planner.generateDynamicSteps(task);

      expect(result.steps).toHaveLength(1);
      const step = result.steps[0];
      expect(step.meta?.leaf).toBe('explore_for_resources');
      const args = step.meta?.args as Record<string, unknown>;
      expect(args.resource_tags).toContain('iron_ore');
      expect(args.goal_item).toBe('iron_pickaxe');
    });

  });
});

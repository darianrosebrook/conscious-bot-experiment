/**
 * Thought-to-task converter tests.
 *
 * Covers:
 * - Management intercept happens before routable checks
 * - targetId present → authoritative mutation path
 * - Slug path: single candidate → applied; multiple → needs_disambiguation
 * - navigate/explore/find produce correct requirement kind payloads
 * - Inventory-band dedup: same goal re-proposed after band change is NOT suppressed
 * - Pre-existing actions (mine, craft, collect, build) still route correctly
 * - Keyword fallback path when no extractedGoal
 * - Guard filters (status text, already-processed, seen thought)
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  convertThoughtToTask,
  type ConvertThoughtToTaskDeps,
  type TaskDecision,
} from '../thought-to-task-converter';
import { TaskManagementHandler } from '../task-management-handler';
import { TaskStore } from '../task-store';
import type { CognitiveStreamThought } from '../../modules/cognitive-stream-client';
import type { Task } from '../../types/task';
import type { GoalTagV1 } from '@conscious-bot/cognition';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeThought(overrides: Partial<CognitiveStreamThought> = {}): CognitiveStreamThought {
  idCounter++;
  return {
    id: `thought_${idCounter}`,
    type: 'planning',
    content: 'I should mine some iron ore.',
    attribution: 'llm',
    timestamp: Date.now(),
    processed: false,
    context: {
      emotionalState: 'focused',
      confidence: 0.7,
      cognitiveSystem: 'generator',
    },
    metadata: {
      thoughtType: 'planning',
      llmConfidence: 0.8,
      model: 'gemma3n',
    },
    ...overrides,
  };
}

function makeGoalTag(overrides: Partial<GoalTagV1> = {}): GoalTagV1 {
  return {
    version: 1,
    action: 'mine',
    target: 'iron ore',
    targetId: null,
    amount: 3,
    raw: '[GOAL: mine iron ore 3]',
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: 'test task',
    description: 'a test task',
    type: 'mining',
    priority: 0.5,
    urgency: 0.5,
    progress: 0,
    status: 'active',
    source: 'goal',
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'resource_gathering',
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ConvertThoughtToTaskDeps> = {}): ConvertThoughtToTaskDeps {
  return {
    addTask: vi.fn(async (taskData: Partial<Task>) => taskData as Task),
    markThoughtAsProcessed: vi.fn(async () => {}),
    seenThoughtIds: new Set<string>(),
    trimSeenThoughtIds: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Clear the module-level dedup map between test files by importing fresh each time
// The converter uses a module-scoped recentGoalHashes map, so we use unique targets per test.

describe('convertThoughtToTask', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  // =========================================================================
  // Management action intercept (before ROUTABLE_ACTIONS check)
  // =========================================================================

  describe('Management intercept — before routable checks', () => {
    it('dispatches cancel action to management handler, not task creation', async () => {
      const store = new TaskStore();
      const activeTask = makeTask({ id: 'task_abc', title: 'mine iron', status: 'active' });
      store.setTask(activeTask);
      const handler = new TaskManagementHandler(store);

      const deps = makeDeps({ managementHandler: handler });
      const thought = makeThought({
        content: 'I should cancel that iron mining task. [GOAL: cancel id=task_abc]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'cancel',
            target: '',
            targetId: 'task_abc',
            amount: null,
            raw: '[GOAL: cancel id=task_abc]',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);

      expect(result.decision).toBe('management_applied');
      expect(result.task).toBeNull();
      expect(result.managementResult).toBeDefined();
      expect(result.managementResult!.affectedTaskId).toBe('task_abc');
      expect(store.getTask('task_abc')!.status).toBe('failed');
    });

    it('management actions are checked before ROUTABLE_ACTIONS — cancel is not routable but still works', async () => {
      // 'cancel' is NOT in ROUTABLE_ACTIONS, but IS in MANAGEMENT_ACTIONS
      // This test proves management dispatch happens first
      const store = new TaskStore();
      store.setTask(makeTask({ id: 't1', status: 'pending' }));
      const handler = new TaskManagementHandler(store);

      const deps = makeDeps({ managementHandler: handler });
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'cancel',
            target: '',
            targetId: 't1',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);

      // If management wasn't intercepted first, this would be 'blocked_unroutable'
      expect(result.decision).toBe('management_applied');
      expect(result.decision).not.toBe('blocked_unroutable');
    });

    it('returns management_failed when management handler is not available', async () => {
      const deps = makeDeps({ managementHandler: undefined });
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({ action: 'pause', target: '', targetId: 'x' }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('management_failed');
      expect(result.reason).toContain('not available');
    });
  });

  // =========================================================================
  // targetId → authoritative mutation
  // =========================================================================

  describe('targetId → authoritative mutation path', () => {
    it('explicit targetId resolves directly without slug matching', async () => {
      const store = new TaskStore();
      // Two tasks with similar titles — ID-based resolution ignores slug ambiguity
      store.setTask(makeTask({ id: 'task_a', title: 'mine iron ore', status: 'active' }));
      store.setTask(makeTask({ id: 'task_b', title: 'mine iron blocks', status: 'active' }));
      const handler = new TaskManagementHandler(store);

      const deps = makeDeps({ managementHandler: handler });
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'pause',
            target: '',
            targetId: 'task_a',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('management_applied');
      expect(result.managementResult!.affectedTaskId).toBe('task_a');
      expect(store.getTask('task_a')!.status).toBe('paused');
      expect(store.getTask('task_b')!.status).toBe('active'); // untouched
    });
  });

  // =========================================================================
  // Slug path: single vs. multiple candidates
  // =========================================================================

  describe('Slug-based resolution through converter', () => {
    it('single slug match → management_applied', async () => {
      const store = new TaskStore();
      store.setTask(makeTask({ id: 'task_1', title: 'gather oak logs', status: 'active' }));
      const handler = new TaskManagementHandler(store);

      const deps = makeDeps({ managementHandler: handler });
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'prioritize',
            target: 'gather oak logs',
            targetId: null,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('management_applied');
    });

    it('multiple slug matches → management_needs_disambiguation', async () => {
      const store = new TaskStore();
      store.setTask(makeTask({ id: 'task_1', title: 'mine iron ore', status: 'active' }));
      store.setTask(makeTask({ id: 'task_2', title: 'mine iron blocks', status: 'pending' }));
      const handler = new TaskManagementHandler(store);

      const deps = makeDeps({ managementHandler: handler });
      const thought = makeThought({
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'cancel',
            target: 'mine iron',
            targetId: null,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('management_needs_disambiguation');
      expect(result.managementResult!.candidates).toBeDefined();
      expect(result.managementResult!.candidates!.length).toBe(2);

      // Neither task mutated
      expect(store.getTask('task_1')!.status).toBe('active');
      expect(store.getTask('task_2')!.status).toBe('pending');
    });
  });

  // =========================================================================
  // navigate/explore/find → correct requirement kind payloads
  // =========================================================================

  describe('Rig E actions — navigate/explore/find', () => {
    it('navigate produces navigation task with navigate requirement candidate', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'nav_thought_1',
        content: 'I need to navigate to the village. [GOAL: navigate village]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'navigate',
            target: 'village',
            amount: null,
            raw: '[GOAL: navigate village]',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task).toBeDefined();
      expect(result.task!.type).toBe('navigation');

      const reqCandidate = result.task!.parameters.requirementCandidate;
      expect(reqCandidate).toBeDefined();
      expect(reqCandidate.kind).toBe('navigate');
      expect(reqCandidate.outputPattern).toBe('village');
      expect(reqCandidate.extractionMethod).toBe('goal-tag');
    });

    it('explore produces exploration task with explore requirement candidate', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'explore_thought_1',
        content: 'I should explore the cave system. [GOAL: explore cave system]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'explore',
            target: 'cave system',
            amount: null,
            raw: '[GOAL: explore cave system]',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('exploration');

      const reqCandidate = result.task!.parameters.requirementCandidate;
      expect(reqCandidate.kind).toBe('explore');
      expect(reqCandidate.outputPattern).toBe('cave_system');
    });

    it('find produces exploration task with find requirement candidate', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'find_thought_1',
        content: 'I need to find diamonds. [GOAL: find diamonds]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'find',
            target: 'diamonds',
            amount: 1,
            raw: '[GOAL: find diamonds]',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('exploration');

      const reqCandidate = result.task!.parameters.requirementCandidate;
      expect(reqCandidate.kind).toBe('find');
      expect(reqCandidate.outputPattern).toBe('diamonds');
      expect(reqCandidate.quantity).toBe(1);
    });
  });

  // =========================================================================
  // Pre-existing actions still route correctly
  // =========================================================================

  describe('Pre-existing routable actions', () => {
    it('mine → mining task with mine requirement candidate', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'mine_pre_1',
        content: 'I should mine cobblestone for building. [GOAL: mine cobblestone 5]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'cobblestone',
            amount: 5,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('mining');

      const req = result.task!.parameters.requirementCandidate;
      expect(req.kind).toBe('mine');
      expect(req.outputPattern).toBe('cobblestone');
      expect(req.quantity).toBe(5);
    });

    it('craft → crafting task with craft requirement candidate', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'craft_pre_1',
        content: 'I need to craft a wooden pickaxe. [GOAL: craft wooden pickaxe]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'craft',
            target: 'wooden pickaxe',
            amount: 1,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('crafting');
      expect(result.task!.parameters.requirementCandidate.kind).toBe('craft');
    });

    it('collect → gathering task', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'collect_pre_1',
        content: 'I should collect oak logs. [GOAL: collect oak logs 8]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'collect',
            target: 'oak logs',
            amount: 8,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('gathering');
    });

    it('build → building task', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'build_pre_1',
        content: 'I need to build a shelter. [GOAL: build shelter]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'build',
            target: 'shelter',
            amount: 1,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('building');
    });

    it('unroutable action (check) → blocked_unroutable', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'check_pre_1',
        content: 'Let me check inventory. [GOAL: check inventory]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'check',
            target: 'inventory',
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('blocked_unroutable');
      expect(result.reason).toContain('check');
    });

    it('convertEligible=false → blocked_not_eligible', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'not_eligible_1',
        content: 'I should mine stone.',
        convertEligible: false,
        metadata: {
          thoughtType: 'idle-reflection',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'stone',
            amount: 3,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('blocked_not_eligible');
      expect(result.task).toBeNull();
    });

    it('convertEligible=undefined (missing) defaults to eligible', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'eligible_undef_1',
        content: 'Mine some eligible_undef_ore. [GOAL: mine eligible_undef_ore 3]',
        // convertEligible is NOT set — should pass through
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'eligible_undef_ore',
            amount: 3,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
    });
  });

  // =========================================================================
  // Inventory-band dedup
  // =========================================================================

  describe('Inventory-band dedup', () => {
    it('same goal with same inventory band → suppressed_dedup', async () => {
      const deps = makeDeps({
        getInventoryBand: () => 'band_0_10',
      });

      const thought1 = makeThought({
        id: 'dedup_t1',
        content: 'Mine some unique_dup_ore_alpha. [GOAL: mine unique_dup_ore_alpha 3]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_dup_ore_alpha',
            amount: 3,
          }),
        },
      });

      const result1 = await convertThoughtToTask(thought1, deps);
      expect(result1.decision).toBe('created');

      // Same goal, same band
      const thought2 = makeThought({
        id: 'dedup_t2',
        content: 'Mine some unique_dup_ore_alpha. [GOAL: mine unique_dup_ore_alpha 3]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_dup_ore_alpha',
            amount: 3,
          }),
        },
      });

      const result2 = await convertThoughtToTask(thought2, deps);
      expect(result2.decision).toBe('suppressed_dedup');
    });

    it('same goal with different inventory band → NOT suppressed (re-proposal allowed)', async () => {
      let currentBand = 'band_0_10';
      const deps = makeDeps({
        getInventoryBand: () => currentBand,
      });

      const thought1 = makeThought({
        id: 'dedup_band_t1',
        content: 'Mine some unique_band_ore_beta. [GOAL: mine unique_band_ore_beta 3]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_band_ore_beta',
            amount: 3,
          }),
        },
      });

      const result1 = await convertThoughtToTask(thought1, deps);
      expect(result1.decision).toBe('created');

      // Same goal but inventory band changed (items consumed/lost)
      currentBand = 'band_10_20';
      const thought2 = makeThought({
        id: 'dedup_band_t2',
        content: 'Mine some unique_band_ore_beta. [GOAL: mine unique_band_ore_beta 3]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_band_ore_beta',
            amount: 3,
          }),
        },
      });

      const result2 = await convertThoughtToTask(thought2, deps);
      expect(result2.decision).toBe('created');
    });
  });

  // =========================================================================
  // Keyword fallback (no extractedGoal)
  // =========================================================================

  describe('Keyword fallback path', () => {
    it('content with "gather" + "wood" → gathering task', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'keyword_gather_1',
        content: 'I need to gather some wood for crafting.',
        metadata: { thoughtType: 'planning' },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('gathering');
    });

    it('content with "craft" → crafting task', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'keyword_craft_1',
        content: 'I should craft a pickaxe from cobblestone.',
        metadata: { thoughtType: 'planning' },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('crafting');
    });

    it('content with "mine" → mining task', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'keyword_mine_1',
        content: 'Time to mine some ore from the cave.',
        metadata: { thoughtType: 'planning' },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.type).toBe('mining');
    });

    it('general content with no keywords → dropped_sanitizer', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'keyword_general_1',
        content: 'The sky is very blue today and I feel calm.',
        metadata: { thoughtType: 'reflection' },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_sanitizer');
    });
  });

  // =========================================================================
  // Guard filters
  // =========================================================================

  describe('Guard filters', () => {
    it('already-processed thought → blocked_guard', async () => {
      const deps = makeDeps();
      const thought = makeThought({ processed: true });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('blocked_guard');
    });

    it('status text (health:) → blocked_guard', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'guard_health_1',
        content: 'Health: 20/20, Hunger: 18/20',
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('blocked_guard');
    });

    it('seen thought ID → dropped_seen', async () => {
      const seenIds = new Set<string>(['already_seen']);
      const deps = makeDeps({ seenThoughtIds: seenIds });
      const thought = makeThought({ id: 'already_seen' });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('dropped_seen');
    });

    it('new thought ID is tracked in seenThoughtIds', async () => {
      const seenIds = new Set<string>();
      const deps = makeDeps({ seenThoughtIds: seenIds });
      const thought = makeThought({
        id: 'track_me_1',
        content: 'I should mine some unique_track_ore_gamma.',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_track_ore_gamma',
          }),
        },
      });

      await convertThoughtToTask(thought, deps);
      expect(seenIds.has('track_me_1')).toBe(true);
    });
  });

  // =========================================================================
  // GOAL tag stripping from task title
  // =========================================================================

  describe('GOAL tag stripping', () => {
    it('strips [GOAL:...] from task title', async () => {
      const deps = makeDeps();
      const thought = makeThought({
        id: 'strip_goal_1',
        content: 'I should mine some unique_strip_ore_delta. [GOAL: mine unique_strip_ore_delta 3]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_strip_ore_delta',
            amount: 3,
          }),
        },
      });

      const result = await convertThoughtToTask(thought, deps);
      expect(result.decision).toBe('created');
      expect(result.task!.title).not.toContain('[GOAL:');
      expect(result.task!.title).not.toContain('GOAL');
    });
  });

  // =========================================================================
  // markThoughtAsProcessed called on management actions
  // =========================================================================

  describe('Lifecycle hooks', () => {
    it('markThoughtAsProcessed is called for management actions', async () => {
      const store = new TaskStore();
      store.setTask(makeTask({ id: 'task_hook', status: 'active' }));
      const handler = new TaskManagementHandler(store);
      const markFn = vi.fn(async () => {});

      const deps = makeDeps({
        managementHandler: handler,
        markThoughtAsProcessed: markFn,
      });
      const thought = makeThought({
        id: 'hook_thought_1',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'cancel',
            target: '',
            targetId: 'task_hook',
          }),
        },
      });

      await convertThoughtToTask(thought, deps);
      expect(markFn).toHaveBeenCalledWith('hook_thought_1');
    });

    it('markThoughtAsProcessed is called for created tasks', async () => {
      const markFn = vi.fn(async () => {});
      const deps = makeDeps({ markThoughtAsProcessed: markFn });
      const thought = makeThought({
        id: 'hook_thought_2',
        content: 'Mine some unique_hook_ore_epsilon. [GOAL: mine unique_hook_ore_epsilon]',
        metadata: {
          thoughtType: 'planning',
          extractedGoal: makeGoalTag({
            action: 'mine',
            target: 'unique_hook_ore_epsilon',
          }),
        },
      });

      await convertThoughtToTask(thought, deps);
      expect(markFn).toHaveBeenCalledWith('hook_thought_2');
    });
  });
});

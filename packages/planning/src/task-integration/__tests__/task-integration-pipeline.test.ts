/**
 * Task Integration pipeline tests.
 *
 * Verifies end-to-end behavior that the unit-level tests don't cover:
 *
 * A. Rig E sentinel → addTask transitions to pending_planning, emits solver_unavailable
 * B. Rig G metadata propagation → addTask preserves rigG on task.metadata
 * C. Rig G feasibility gate → startTaskStep blocks infeasible plans
 * D. Blocked sentinel reason is never overwritten by hasExecutableStep heuristic
 * E. Lifecycle events emitted from addTask are receivable
 *
 * These tests mock the external dependencies (service clients, cognitive stream)
 * so they run without network.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies before importing TaskIntegration
vi.mock('@conscious-bot/core', () => ({
  createServiceClients: () => ({
    minecraft: {
      get: vi.fn().mockRejectedValue(new Error('mock: no minecraft')),
    },
    cognition: {
      get: vi.fn().mockRejectedValue(new Error('mock: no cognition')),
    },
    planning: {
      get: vi.fn().mockRejectedValue(new Error('mock: no planning')),
    },
    memory: {
      get: vi.fn().mockRejectedValue(new Error('mock: no memory')),
    },
    dashboard: {
      get: vi.fn().mockRejectedValue(new Error('mock: no dashboard')),
    },
  }),
}));

// Mock CognitiveStreamClient to prevent network calls
vi.mock('../../modules/cognitive-stream-client', () => ({
  CognitiveStreamClient: class {
    getRecentThoughts() { return Promise.resolve([]); }
    getActionableThoughts() { return Promise.resolve([]); }
  },
}));

// Mock CognitionOutbox to prevent timers
vi.mock('../../modules/cognition-outbox', () => ({
  CognitionOutbox: class {
    start() {}
    stop() {}
    enqueue() {}
  },
}));

// Suppress global fetch calls (dashboard notify, etc.)
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

import { TaskIntegration } from '../../task-integration';
import type { Task } from '../../types/task';
import type { RigGMetadata } from '../../constraints/execution-advisor';
import type { RigGSignals } from '../../constraints/partial-order-plan';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskData(overrides: Partial<Task> = {}): Partial<Task> {
  return {
    title: 'test task',
    description: 'a test task',
    type: 'general',
    priority: 0.5,
    steps: [],
    parameters: {},
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
      childTaskIds: [],
      tags: [],
      category: 'general',
    },
    ...overrides,
  };
}

function makeFeasibleRigGMeta(): RigGMetadata {
  return {
    version: 1,
    signals: {
      dag_node_count: 3,
      dag_edge_count: 2,
      ready_set_size_mean: 1.5,
      ready_set_size_p95: 2,
      commuting_pair_count: 1,
      feasibility_passed: true,
      feasibility_rejections: {},
      linearization_digest: 'abc123',
    },
    commutingPairs: [],
    computedAt: Date.now(),
  };
}

function makeInfeasibleRigGMeta(): RigGMetadata {
  return {
    version: 1,
    signals: {
      dag_node_count: 3,
      dag_edge_count: 2,
      ready_set_size_mean: 1,
      ready_set_size_p95: 1,
      commuting_pair_count: 0,
      feasibility_passed: false,
      feasibility_rejections: { missing_foundation: 1 },
      linearization_digest: 'def456',
    },
    commutingPairs: [],
    computedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// A. Rig E sentinel → blocked task state
// ---------------------------------------------------------------------------

describe('Rig E sentinel handling in addTask', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigate task → pending_planning with rig_e_solver_unimplemented reason', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Navigate to the cave',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'cave',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    expect(task.status).toBe('pending_planning');
    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
    expect(task.steps).toHaveLength(0);
  });

  it('explore task → pending_planning with rig_e_solver_unimplemented reason', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Explore the cave',
      type: 'exploration',
      parameters: {
        requirementCandidate: {
          kind: 'explore',
          outputPattern: 'cave',
          maxSteps: 50,
          quantity: 1,
        },
      },
    }));

    expect(task.status).toBe('pending_planning');
    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
    expect(task.steps).toHaveLength(0);
  });

  it('emits solver_unavailable lifecycle event for Rig E tasks', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Find iron ore',
      type: 'exploration',
      parameters: {
        requirementCandidate: {
          kind: 'find',
          outputPattern: 'iron_ore',
          quantity: 1,
        },
      },
    }));

    const solverEvent = events.find((e) => e.type === 'solver_unavailable');
    expect(solverEvent).toBeDefined();
    expect(solverEvent.reason).toBe('rig_e_solver_unimplemented');
  });

  it('blockedReason is NOT overwritten by no-executable-plan heuristic', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Navigate to base',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'base',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    // The blocked sentinel sets reason='rig_e_solver_unimplemented'.
    // The hasExecutableStep heuristic should NOT overwrite it.
    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
    expect(task.metadata.blockedReason).not.toBe('no-executable-plan');
  });
});

// ---------------------------------------------------------------------------
// A2. Rig E with hierarchical planner configured
// ---------------------------------------------------------------------------

describe('Rig E with hierarchical planner configured', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
    ti.configureHierarchicalPlanner();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isHierarchicalPlannerConfigured returns true after configuration', () => {
    expect(ti.isHierarchicalPlannerConfigured).toBe(true);
  });

  it('navigate task produces steps with rig-e-macro source (or falls back gracefully)', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Navigate to the cave',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'cave',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    // With hierarchical planner configured, the planner attempts to resolve
    // the requirement. If context mapping succeeds, steps will have rig-e-macro source.
    // If context mapping fails (no matching context for 'cave'), it falls back
    // to the sentinel with rig_e_no_plan_found instead of rig_e_solver_unimplemented.
    if (task.steps.length > 0 && !task.steps[0].meta?.blocked) {
      // Hierarchical planner produced steps
      expect(task.steps[0].meta?.source).toBe('rig-e-macro');
      expect(task.status).not.toBe('pending_planning');
    } else {
      // Fallback: blocked — either ontology_gap (no context for 'cave')
      // or no_plan_found (context exists but path search failed)
      expect(task.metadata.blockedReason).toMatch(/^rig_e_(no_plan_found|ontology_gap)$/);
    }
  });

  it('unconfigured planner returns rig_e_solver_unimplemented', async () => {
    const ti2 = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
    // Do NOT call configureHierarchicalPlanner
    expect(ti2.isHierarchicalPlannerConfigured).toBe(false);

    const task = await ti2.addTask(makeTaskData({
      title: 'Navigate to the cave',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'cave',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    expect(task.status).toBe('pending_planning');
    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
  });

  it('gathering task type is unaffected by hierarchical planner', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Mine some stone',
      type: 'gathering',
    }));

    // Gathering tasks don't go through Rig E, hierarchical planner should not interfere
    expect(task.metadata.blockedReason).not.toBe('rig_e_solver_unimplemented');
    expect(task.metadata.blockedReason).not.toBe('rig_e_no_plan_found');
  });
});

// ---------------------------------------------------------------------------
// B. Rig G metadata propagation
// ---------------------------------------------------------------------------

describe('Rig G metadata propagation through addTask', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('solver namespace on taskData.metadata survives addTask rebuild', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = {
      rigG,
      buildingPlanId: 'plan_abc',
      buildingTemplateId: 'basic_shelter',
    };

    const task = await ti.addTask(taskData);

    // Verify solver namespace propagated generically
    expect(task.metadata.solver).toBeDefined();
    expect(task.metadata.solver!.rigG).toBeDefined();
    expect(task.metadata.solver!.rigG!.version).toBe(1);
    expect(task.metadata.solver!.rigG!.signals.feasibility_passed).toBe(true);
    expect(task.metadata.solver!.buildingPlanId).toBe('plan_abc');
    expect(task.metadata.solver!.buildingTemplateId).toBe('basic_shelter');
  });

  it('addTask without solver namespace stores only solve observability (noStepsReason)', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Mine some stone',
      type: 'gathering',
      // No requirementCandidate → strict mode produces no-requirement
    }));

    // Solve observability is now stored even when no solver ran
    expect(task.metadata.solver).toBeDefined();
    expect(task.metadata.solver!.noStepsReason).toBe('no-requirement');
    // No solver-specific fields like planId, rigG, etc.
    expect(task.metadata.solver!.rigG).toBeUndefined();
    expect(task.metadata.solver!.craftingPlanId).toBeUndefined();
    expect(task.metadata.solver!.buildingPlanId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C. Rig G feasibility gate in startTaskStep
// ---------------------------------------------------------------------------

describe('Rig G feasibility gate in startTaskStep', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
      enableActionVerification: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('infeasible rigG → task transitions to unplannable and emits replan event', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    expect(task.status).toBe('pending'); // Not yet checked

    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    const started = await ti.startTaskStep(task.id, 'step-1');

    expect(started).toBe(false);
    expect(task.status).toBe('unplannable');
    expect(task.metadata.blockedReason).toContain('Feasibility failed');

    const replanEvent = events.find((e) => e.type === 'rig_g_replan_needed');
    expect(replanEvent).toBeDefined();
    expect(replanEvent.reason).toContain('missing_foundation');
  });

  it('feasible rigG → startTaskStep proceeds (returns true with mocked bot)', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);

    // startTaskStep will try to fetch bot state for snapshot — will fail (mocked)
    // but the Rig G gate should pass
    const started = await ti.startTaskStep(task.id, 'step-1');

    // Gate passed (true), even though snapshot capture failed
    expect(started).toBe(true);
    expect(task.status).not.toBe('unplannable');
    expect(task.metadata.solver?.rigGChecked).toBe(true);
    expect(task.metadata.solver?.suggestedParallelism).toBeGreaterThanOrEqual(1);
  });

  it('rigG gate fires exactly once per task (checked flag)', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Step 1', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
        { id: 'step-2', label: 'Step 2', done: false, order: 2, meta: { leaf: 'build_module', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);

    await ti.startTaskStep(task.id, 'step-1');
    expect(task.metadata.solver?.rigGChecked).toBe(true);

    // Second step start should not re-check
    await ti.startTaskStep(task.id, 'step-2');
    expect(task.metadata.solver?.rigGChecked).toBe(true);
    expect(task.status).not.toBe('unplannable');
  });
});

// ---------------------------------------------------------------------------
// C2. dryRun mode for startTaskStep (shadow-safe)
// ---------------------------------------------------------------------------

describe('startTaskStep dryRun mode (shadow-safe)', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
      enableActionVerification: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dryRun: Rig G gate evaluates but does not mutate rigGChecked or task.status', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    expect(task.status).toBe('pending');

    const result = await ti.startTaskStep(task.id, 'step-1', { dryRun: true });

    // Gate evaluated — infeasible should return false
    expect(result).toBe(false);
    // But no mutations
    expect(task.metadata.solver?.rigGChecked).toBeUndefined();
    expect(task.status).toBe('pending'); // NOT 'unplannable'
    expect(task.metadata.blockedReason).toBeUndefined();
  });

  it('dryRun: returns true when Rig G passes', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    const result = await ti.startTaskStep(task.id, 'step-1', { dryRun: true });

    expect(result).toBe(true);
    // Still no mutations
    expect(task.metadata.solver?.rigGChecked).toBeUndefined();
    expect(task.status).toBe('pending');
  });

  it('dryRun: emits shadow_rig_g_evaluation event', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.startTaskStep(task.id, 'step-1', { dryRun: true });

    const shadowEvent = events.find((e) => e.type === 'shadow_rig_g_evaluation');
    expect(shadowEvent).toBeDefined();
    expect(shadowEvent.taskId).toBe(task.id);
    expect(shadowEvent.advice.shouldProceed).toBe(true);
    expect(shadowEvent.advice.suggestedParallelism).toBeGreaterThanOrEqual(1);
  });

  it('dryRun: no snapshot stored', async () => {
    const taskData = makeTaskData({
      title: 'Mine stone',
      type: 'gathering',
      steps: [
        { id: 'step-1', label: 'Dig block', done: false, order: 1, meta: { leaf: 'dig_block', executable: true } },
      ],
    });

    const task = await ti.addTask(taskData);

    // Access the private _stepStartSnapshots via any cast
    const snapsBefore = (ti as any)._stepStartSnapshots.size;
    await ti.startTaskStep(task.id, 'step-1', { dryRun: true });
    const snapsAfter = (ti as any)._stepStartSnapshots.size;

    expect(snapsAfter).toBe(snapsBefore);
  });

  it('dryRun: step.startedAt not set', async () => {
    const taskData = makeTaskData({
      title: 'Mine stone',
      type: 'gathering',
      steps: [
        { id: 'step-1', label: 'Dig block', done: false, order: 1, meta: { leaf: 'dig_block', executable: true } },
      ],
    });

    const task = await ti.addTask(taskData);
    await ti.startTaskStep(task.id, 'step-1', { dryRun: true });

    expect(task.steps[0].startedAt).toBeUndefined();
  });

  it('dryRun: returns true when no Rig G gate exists', async () => {
    const taskData = makeTaskData({
      title: 'Mine stone',
      type: 'gathering',
      steps: [
        { id: 'step-1', label: 'Dig block', done: false, order: 1, meta: { leaf: 'dig_block', executable: true } },
      ],
    });

    const task = await ti.addTask(taskData);
    const result = await ti.startTaskStep(task.id, 'step-1', { dryRun: true });

    // No gate to evaluate, shadow returns true
    expect(result).toBe(true);
  });

  it('non-dryRun: existing behavior unchanged (feasible gate still mutates)', async () => {
    const rigG = makeFeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    const result = await ti.startTaskStep(task.id, 'step-1');

    expect(result).toBe(true);
    expect(task.metadata.solver?.rigGChecked).toBe(true);
    expect(task.metadata.solver?.suggestedParallelism).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// D. Lifecycle event emission
// ---------------------------------------------------------------------------

describe('Lifecycle event emission from addTask', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('high-priority task emits high_priority_added event', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Urgent: flee from creeper',
      priority: 0.9,
    }));

    const hpEvent = events.find((e) => e.type === 'high_priority_added');
    expect(hpEvent).toBeDefined();
  });

  it('normal-priority task does NOT emit high_priority_added event', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Mine some stone',
      priority: 0.5,
    }));

    const hpEvent = events.find((e) => e.type === 'high_priority_added');
    expect(hpEvent).toBeUndefined();
  });

  it('completed task emits completed lifecycle event', async () => {
    const events: any[] = [];

    const task = await ti.addTask(makeTaskData({
      title: 'Simple task',
      steps: [
        { id: 'step-1', label: 'Do thing', done: false, order: 1, meta: { leaf: 'wait', executable: true } },
      ],
    }));

    ti.on('taskLifecycleEvent', (e) => events.push(e));
    ti.updateTaskProgress(task.id, 1.0, 'completed');

    const completedEvent = events.find((e) => e.type === 'completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent.taskId).toBe(task.id);
  });

  it('failed task emits failed lifecycle event', async () => {
    const events: any[] = [];

    const task = await ti.addTask(makeTaskData({
      title: 'Failing task',
      steps: [
        { id: 'step-1', label: 'Do thing', done: false, order: 1, meta: { leaf: 'wait', executable: true } },
      ],
    }));

    ti.on('taskLifecycleEvent', (e) => events.push(e));
    ti.updateTaskProgress(task.id, 0, 'failed');

    const failedEvent = events.find((e) => e.type === 'failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.taskId).toBe(task.id);
  });
});

// ---------------------------------------------------------------------------
// E. Rig G replan consumer (idempotent scheduling)
// ---------------------------------------------------------------------------

describe('Rig G replan consumer', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
      enableActionVerification: false,
    });
  });

  afterEach(() => {
    // Clear any pending timers
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('replan schedules on infeasible Rig G', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.startTaskStep(task.id, 'step-1');

    // Task should be unplannable
    expect(task.status).toBe('unplannable');

    // Replan event emitted
    const replanEvent = events.find((e) => e.type === 'rig_g_replan_needed');
    expect(replanEvent).toBeDefined();

    // In-flight marker set
    const freshTask = ti.getTasks({ status: 'unplannable' as any }).find((t) => t.id === task.id);
    expect(freshTask?.metadata.solver?.rigGReplan?.inFlight).toBe(true);
    expect(freshTask?.metadata.solver?.rigGReplan?.attempt).toBe(1);
  });

  it('replan is idempotent (two calls → one timer)', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);

    // First call triggers replan
    await ti.startTaskStep(task.id, 'step-1');

    // Access private timers map
    const timers = (ti as any)._rigGReplanTimers as Map<string, any>;
    expect(timers.size).toBe(1);

    // Reset rigGChecked to allow gate to fire again
    task.metadata.solver!.rigGChecked = false;

    // Second call should NOT create a second timer (idempotent)
    const logSpy = vi.spyOn(console, 'log');
    await ti.startTaskStep(task.id, 'step-1');

    // Timer count unchanged
    expect(timers.size).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Replan already scheduled')
    );
    logSpy.mockRestore();
  });

  it('replan skips if task no longer unplannable', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    await ti.startTaskStep(task.id, 'step-1');
    expect(task.status).toBe('unplannable');

    // Change task status externally before timer fires
    task.status = 'active';

    const logSpy = vi.spyOn(console, 'log');

    // Advance timers to fire the replan callback (5s backoff)
    await vi.advanceTimersByTimeAsync(6000);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('no longer unplannable; skipping replan')
    );

    // In-flight marker should be cleared
    expect(task.metadata.solver?.rigGReplan).toBeUndefined();
    logSpy.mockRestore();
  });

  it('replan exhaustion after 3 attempts', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG, replanAttempts: 3 };

    const task = await ti.addTask(taskData);
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.startTaskStep(task.id, 'step-1');

    // Should emit exhaustion event
    const exhaustedEvent = events.find((e) => e.type === 'rig_g_replan_exhausted');
    expect(exhaustedEvent).toBeDefined();
    expect(exhaustedEvent.reason).toContain('Exhausted 3 replan attempts');

    // Blocked reason should contain 'exhausted'
    expect(task.metadata.blockedReason).toContain('rig_g_replan_exhausted');
  });

  it('in-flight marker cleared after timer fires', async () => {
    const rigG = makeInfeasibleRigGMeta();
    const taskData = makeTaskData({
      title: 'Build a shelter',
      type: 'building',
      steps: [
        { id: 'step-1', label: 'Prepare site', done: false, order: 1, meta: { leaf: 'prepare_site', executable: true } },
      ],
    });
    taskData.metadata!.solver = { rigG };

    const task = await ti.addTask(taskData);
    await ti.startTaskStep(task.id, 'step-1');

    // In-flight marker should be set
    expect(task.metadata.solver?.rigGReplan?.inFlight).toBe(true);

    // Advance timers — regenerateSteps will fail (no bot context) which is fine
    await vi.advanceTimersByTimeAsync(6000);

    // After timer fires, in-flight marker should be cleared
    // (replan might fail due to mocked bot, but marker cleanup still happens)
    expect(task.metadata.solver?.rigGReplan).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// F. configureHierarchicalPlanner idempotency and overrides
// ---------------------------------------------------------------------------

describe('configureHierarchicalPlanner idempotency and overrides', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('configureHierarchicalPlanner is idempotent', () => {
    expect(ti.isHierarchicalPlannerConfigured).toBe(false);

    ti.configureHierarchicalPlanner();
    expect(ti.isHierarchicalPlannerConfigured).toBe(true);

    const logSpy = vi.spyOn(console, 'log');
    ti.configureHierarchicalPlanner(); // second call
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('already configured; no-op')
    );
    logSpy.mockRestore();
  });

  it('configureHierarchicalPlanner with overrides uses injected planner', () => {
    const fakePlanner = {
      contextFromRequirement: vi.fn(),
      planMacroPath: vi.fn(),
      getGraph: vi.fn(),
    };
    const fakeStore = {
      recordOutcome: vi.fn(),
    };

    ti.configureHierarchicalPlanner({
      macroPlanner: fakePlanner,
      feedbackStore: fakeStore,
    });

    expect(ti.isHierarchicalPlannerConfigured).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G. Rig E blocked reason refinement (ontology gap vs no plan found)
// ---------------------------------------------------------------------------

describe('Rig E blocked reason refinement', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('navigate task with unresolvable context → rig_e_ontology_gap', async () => {
    ti.configureHierarchicalPlanner();

    // 'cave' has no context mapping in the macro planner → ontology_gap
    const task = await ti.addTask(makeTaskData({
      title: 'Navigate to the cave',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'cave',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    expect(task.status).toBe('pending_planning');
    expect(task.metadata.blockedReason).toBe('rig_e_ontology_gap');
  });

  it('unconfigured planner still returns rig_e_solver_unimplemented', async () => {
    // Do NOT configure hierarchical planner
    const task = await ti.addTask(makeTaskData({
      title: 'Navigate to the cave',
      type: 'navigation',
      parameters: {
        requirementCandidate: {
          kind: 'navigate',
          outputPattern: 'cave',
          tolerance: 3,
          quantity: 1,
        },
      },
    }));

    expect(task.status).toBe('pending_planning');
    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
  });
});

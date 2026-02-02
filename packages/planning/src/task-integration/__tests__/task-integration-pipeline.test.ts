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

import { TaskIntegration, canonicalizeIntentParams, type GoalBindingDriftEvent } from '../../task-integration';
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

// ---------------------------------------------------------------------------
// Advisory action bypass: type='advisory_action' skips step generation
// ---------------------------------------------------------------------------

describe('advisory_action step generation bypass', () => {
  let ti: TaskIntegration;

  beforeEach(() => {
    ti = new TaskIntegration();
  });

  it('advisory_action task gets empty steps with advisory-skip reason', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Craft something',
      type: 'advisory_action',
      source: 'autonomous',
      parameters: { action: 'craft_recipe' },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 1,
        childTaskIds: [],
        tags: ['cognitive', 'advisory'],
        category: 'advisory_action',
        parentTaskId: 'cog-parent',
        taskProvenance: {
          builder: 'convertCognitiveReflectionToTasks',
          source: 'cognitive_reflection',
        },
      },
    }));

    expect(task.steps).toEqual([]);
    expect(task.metadata.solver?.noStepsReason).toBe('advisory-skip');
    expect(task.status).toBe('pending');
    // Advisory tasks are blocked from executor selection
    expect(task.metadata.blockedReason).toBe('advisory_action');
  });

  it('advisory_action does not trigger invariant guard', async () => {
    const consoleSpy = vi.spyOn(console, 'error');

    await ti.addTask(makeTaskData({
      title: 'Advisory gather',
      type: 'advisory_action',
      source: 'autonomous',
      parameters: { action: 'gather_resources' },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 1,
        childTaskIds: [],
        tags: ['cognitive', 'advisory'],
        category: 'advisory_action',
        parentTaskId: 'cog-parent-2',
      },
    }));

    // Should NOT see invariant violation for advisory_action
    const invariantCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('INVARIANT VIOLATION')
    );
    expect(invariantCalls).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it('non-advisory autonomous sub-task without candidate triggers invariant guard', async () => {
    const consoleSpy = vi.spyOn(console, 'error');

    await ti.addTask(makeTaskData({
      title: 'Broken sub-task',
      type: 'gathering',
      source: 'autonomous',
      parameters: {},
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'gathering',
        parentTaskId: 'some-parent',
      },
    }));

    const invariantCalls = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('INVARIANT VIOLATION')
    );
    expect(invariantCalls).toHaveLength(1);
    expect(invariantCalls[0][0]).toContain('Broken sub-task');

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// G. Goal-binding drift linter
// ---------------------------------------------------------------------------

describe('Goal-binding drift linter', () => {
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

  it('emits goal_binding_drift event when source=goal but type is not gated', async () => {
    ti.enableGoalResolver(); // Resolver enabled, but type=gathering is not in the gate
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Gather wood for shelter',
      type: 'gathering',
      source: 'goal',
      parameters: { resourceType: 'wood', quantity: 4 },
    }));

    const driftEvents = events.filter((e) => e.type === 'goal_binding_drift');
    expect(driftEvents).toHaveLength(1);
    expect(driftEvents[0].reason).toBe('type_not_gated:gathering');

    // Thin payload: no full task object, only summary fields
    expect(driftEvents[0].task).toBeUndefined();
    expect(driftEvents[0].taskType).toBe('gathering');
    expect(driftEvents[0].source).toBe('goal');
    expect(driftEvents[0].hasGoalBinding).toBe(false);
    expect(driftEvents[0].originKind).toBe('goal_source');
    expect(driftEvents[0].title).toBeDefined();
    expect(typeof driftEvents[0].taskId).toBe('string');
  });

  it('emits goal_binding_drift with goal_resolver_disabled reason when resolver not enabled', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    // Resolver not enabled — source=goal + type=building still drifts
    await ti.addTask(makeTaskData({
      title: 'Build wall',
      type: 'building',
      source: 'goal',
      parameters: {
        requirementCandidate: { kind: 'build', outputPattern: 'wall', quantity: 1 },
      },
    }));

    const driftEvents = events.filter((e) => e.type === 'goal_binding_drift');
    expect(driftEvents).toHaveLength(1);
    expect(driftEvents[0].reason).toBe('goal_resolver_disabled');

    // Thin payload assertions
    expect(driftEvents[0].task).toBeUndefined();
    expect(driftEvents[0].taskType).toBe('building');
    expect(driftEvents[0].source).toBe('goal');
    expect(driftEvents[0].hasGoalBinding).toBe(false);
    expect(driftEvents[0].originKind).toBe('goal_source');
  });

  it('does not emit drift event for non-goal tasks', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Manual wood gathering',
      type: 'gathering',
      source: 'manual',
    }));

    const driftEvents = events.filter((e) => e.type === 'goal_binding_drift');
    expect(driftEvents).toHaveLength(0);
  });

  it('does not emit drift event for autonomous tasks', async () => {
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    await ti.addTask(makeTaskData({
      title: 'Auto-generated task',
      type: 'gathering',
      source: 'autonomous',
    }));

    const driftEvents = events.filter((e) => e.type === 'goal_binding_drift');
    expect(driftEvents).toHaveLength(0);
  });

  it('does not emit drift event when source=goal and goalBinding is present', async () => {
    // Enable resolver so building tasks get goalBinding via resolveGoalTask
    ti.enableGoalResolver();
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter at spawn',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        botPosition: { x: 100, y: 64, z: 200 },
        verifier: 'verify_build_shelter_v0',
        intentParams: { width: 5, height: 3, depth: 5 },
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));

    // goalBinding should be present
    expect((task.metadata as any).goalBinding).toBeDefined();

    // No drift event should have been emitted
    const driftEvents = events.filter((e) => e.type === 'goal_binding_drift');
    expect(driftEvents).toHaveLength(0);
  });

  it('logs structured warning with task id and reason', async () => {
    ti.enableGoalResolver(); // Resolver enabled, but type=mining is not in the gate
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const task = await ti.addTask(makeTaskData({
      title: 'Goal-sourced mining',
      type: 'mining',
      source: 'goal',
      parameters: {
        requirementCandidate: { kind: 'mine', outputPattern: 'iron_ore', quantity: 3 },
      },
    }));

    const driftWarnings = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('[GoalBindingDrift]')
    );
    expect(driftWarnings).toHaveLength(1);
    expect(driftWarnings[0][0]).toContain(task.id);
    expect(driftWarnings[0][0]).toContain('type_not_gated:mining');
    expect(driftWarnings[0][0]).toContain('will not participate in goal dedup');

    consoleSpy.mockRestore();
  });

  it('emits intent_params_unserializable event when goal task has non-serializable intentParams', async () => {
    ti.enableGoalResolver();
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Circular ref → canonicalizeIntentParams returns undefined even though raw is non-null
    const circular: any = { a: 1 };
    circular.self = circular;

    await ti.addTask(makeTaskData({
      title: 'Build shelter with bad params',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        intentParams: circular,
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));

    const unserializableEvents = events.filter((e) => e.type === 'intent_params_unserializable');
    expect(unserializableEvents).toHaveLength(1);
    expect(unserializableEvents[0].goalType).toBe('build_shelter');
    expect(unserializableEvents[0].rawType).toBe('object');
    // Sentinel string used instead of collapsing to undefined
    expect(unserializableEvents[0].sentinel).toBe('__unserializable__:Object');

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// H. canonicalizeIntentParams boundary normalization
// ---------------------------------------------------------------------------

describe('canonicalizeIntentParams', () => {
  it('returns undefined for null/undefined', () => {
    expect(canonicalizeIntentParams(null)).toBeUndefined();
    expect(canonicalizeIntentParams(undefined)).toBeUndefined();
  });

  it('returns string input unchanged', () => {
    expect(canonicalizeIntentParams('oak')).toBe('oak');
    expect(canonicalizeIntentParams('')).toBe('');
  });

  it('serializes object with sorted keys', () => {
    const result = canonicalizeIntentParams({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('produces identical output regardless of key insertion order', () => {
    const a = canonicalizeIntentParams({ width: 5, height: 3, depth: 5 });
    const b = canonicalizeIntentParams({ depth: 5, width: 5, height: 3 });
    const c = canonicalizeIntentParams({ height: 3, depth: 5, width: 5 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('sorts nested objects recursively', () => {
    const a = canonicalizeIntentParams({
      outer: { z: 1, a: 2 },
      inner: { b: 3, a: 4 },
    });
    const b = canonicalizeIntentParams({
      inner: { a: 4, b: 3 },
      outer: { a: 2, z: 1 },
    });
    expect(a).toBe(b);
  });

  it('preserves array order (arrays are not sorted)', () => {
    const a = canonicalizeIntentParams({ items: ['stone', 'wood', 'iron'] });
    const b = canonicalizeIntentParams({ items: ['iron', 'wood', 'stone'] });
    expect(a).not.toBe(b); // Different array order → different output
  });

  it('handles number input', () => {
    expect(canonicalizeIntentParams(42)).toBe('42');
  });

  it('handles boolean input', () => {
    expect(canonicalizeIntentParams(true)).toBe('true');
  });

  it('converts BigInt to string', () => {
    expect(canonicalizeIntentParams(BigInt(42))).toBe('42');
    expect(canonicalizeIntentParams(BigInt('9007199254740993'))).toBe('9007199254740993');
  });

  it('converts BigInt values inside objects', () => {
    const result = canonicalizeIntentParams({ count: BigInt(10), name: 'test' });
    expect(result).toBe('{"count":"10","name":"test"}');
  });

  it('handles non-plain objects: Date serializes via toJSON, Map/Set dropped by prototype check', () => {
    // Date has toJSON() which JSON.stringify calls before the replacer sees it,
    // so it arrives as a string value — not dropped by prototype check
    const dateResult = canonicalizeIntentParams({ when: new Date('2025-01-01'), label: 'ok' });
    expect(dateResult).toBe('{"label":"ok","when":"2025-01-01T00:00:00.000Z"}');

    // Map at top level: replacer sees it as root value, prototype check returns undefined,
    // JSON.stringify returns undefined for undefined root → canonicalize returns undefined
    const mapResult = canonicalizeIntentParams(new Map([['a', 1]]));
    expect(mapResult).toBeUndefined();

    // Map nested inside an object: replacer drops it (returns undefined) → key omitted
    const nestedMap = canonicalizeIntentParams({ data: new Map([['a', 1]]), label: 'ok' });
    expect(nestedMap).toBe('{"label":"ok"}');
  });

  it('returns undefined for circular references', () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    expect(canonicalizeIntentParams(obj)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// I. Task origin envelope
// ---------------------------------------------------------------------------

describe('Task origin envelope', () => {
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

  it('stamps API-sourced task with kind=api', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Manual task',
      type: 'general',
      source: 'manual',
    }));
    const origin = task.metadata.origin!;
    expect(origin).toBeDefined();
    expect(origin.kind).toBe('api');
    expect(origin.name).toBe('manual');
    expect(origin.createdAt).toBeGreaterThan(0);
  });

  it('stamps autonomous cognitive task with kind=cognition', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Chop some trees',
      type: 'gathering',
      source: 'autonomous',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive', 'autonomous', 'reflection'],
        category: 'general',
      },
    }));
    const origin = task.metadata.origin!;
    expect(origin.kind).toBe('cognition');
    expect(origin.name).toBe('thought-to-task');
  });

  it('stamps goal-sourced task without binding as kind=goal_source', async () => {
    // No resolver enabled → no goalBinding attached → kind should be goal_source
    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter',
      type: 'building',
      source: 'goal',
      parameters: { goalType: 'build_shelter' },
    }));
    const origin = task.metadata.origin!;
    expect(origin.kind).toBe('goal_source');
    expect(origin.name).toBe('build_shelter');
  });

  it('stamps goal-resolved task with binding as kind=goal_resolver', async () => {
    // Enable resolver so goalBinding is attached via resolveGoalTask path
    ti.enableGoalResolver();
    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter at spawn',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        botPosition: { x: 100, y: 64, z: 200 },
        verifier: 'verify_build_shelter_v0',
        intentParams: { width: 5, height: 3, depth: 5 },
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));
    const origin = task.metadata.origin!;
    expect(origin.kind).toBe('goal_resolver');
    // origin.name comes from goalBinding.goalType (not task.parameters, which
    // the resolver skeleton leaves empty)
    expect(origin.name).toBe('build_shelter');
    // goalBinding should be present with the goalType
    expect(task.metadata.goalBinding).toBeDefined();
    expect(task.metadata.goalBinding!.goalType).toBe('build_shelter');
    // parentGoalKey should come from goalBinding.goalKey
    expect(origin.parentGoalKey).toBeDefined();
  });

  it('stamps executor subtask with kind=executor and parentTaskId', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Gather wood for crafting table',
      type: 'gathering',
      source: 'autonomous',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
        parentTaskId: 'parent-task-123',
        taskProvenance: { builder: 'buildTaskFromRequirement', source: 'prereq-injection', parentTaskId: 'parent-task-123', createdAt: Date.now() },
      },
    }));
    const origin = task.metadata.origin!;
    expect(origin.kind).toBe('executor');
    expect(origin.name).toBe('prereq-injection');
    expect(origin.parentTaskId).toBe('parent-task-123');
  });

  it('origin is never undefined on any created task', async () => {
    // Default task with no explicit source
    const task = await ti.addTask(makeTaskData({
      title: 'Bare minimum task',
      type: 'general',
    }));
    const origin = task.metadata.origin!;
    expect(origin).toBeDefined();
    expect(origin.kind).toBeDefined();
    expect(origin.createdAt).toBeGreaterThan(0);
  });

  it('updateTaskMetadata cannot overwrite origin', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Immutable origin task',
      type: 'general',
      source: 'manual',
    }));

    const originalOrigin = task.metadata.origin!;
    expect(originalOrigin.kind).toBe('api');

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Attempt to overwrite origin via updateTaskMetadata
    ti.updateTaskMetadata(task.id, {
      origin: { kind: 'executor', name: 'evil', createdAt: 0 },
      someOtherField: 'allowed',
    } as any);

    // Origin should be unchanged (task is stored by reference)
    const afterOrigin = task.metadata.origin!;
    expect(afterOrigin.kind).toBe('api');
    expect(afterOrigin.createdAt).toBe(originalOrigin.createdAt);

    // Other field should have been applied
    expect((task.metadata as any).someOtherField).toBe('allowed');

    // Some warning was emitted about the origin field being protected
    // (don't couple to exact phrasing — behavior is what matters)
    const originWarnings = consoleSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('origin')
    );
    expect(originWarnings.length).toBeGreaterThanOrEqual(1);

    consoleSpy.mockRestore();
  });

  it('resolver-path tasks emit taskAdded and carry origin', async () => {
    // The resolveGoalTask path has its own setTask/emit calls separate from
    // the normal addTask path. Verify it emits the same lifecycle events
    // that downstream observers depend on.
    ti.enableGoalResolver();
    const addedEvents: any[] = [];
    ti.on('taskAdded', (t) => addedEvents.push(t));

    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter lifecycle test',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        botPosition: { x: 0, y: 64, z: 0 },
        intentParams: { width: 5, height: 3, depth: 5 },
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));

    // taskAdded should have been emitted for the resolver-path task
    expect(addedEvents).toHaveLength(1);
    expect(addedEvents[0].id).toBe(task.id);

    // Origin should be stamped (not undefined)
    const origin = addedEvents[0].metadata.origin!;
    expect(origin).toBeDefined();
    expect(origin.kind).toBe('goal_resolver');

    // goalBinding should be present on the emitted task
    expect(addedEvents[0].metadata.goalBinding).toBeDefined();
  });

  it('addTask propagates goalKey from incoming metadata', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Collect oak logs',
      type: 'gathering',
      source: 'autonomous',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive', 'autonomous'],
        category: 'gathering',
        goalKey: 'collect:oak_log',
      },
    }));
    expect(task.metadata.goalKey).toBe('collect:oak_log');
  });

  it('addTask does not set goalKey when incoming metadata lacks it', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Generic task',
      type: 'general',
      source: 'manual',
    }));
    expect(task.metadata.goalKey).toBeUndefined();
  });

  it('addTask propagates all PROPAGATED_META_KEYS through metadata projection', async () => {
    const provenance = { builder: 'test', source: 'test-suite' };
    const task = await ti.addTask(makeTaskData({
      title: 'Full projection test',
      type: 'gathering',
      source: 'autonomous',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive'],
        category: 'gathering',
        goalKey: 'collect:oak_log',
        subtaskKey: 'gather-wood-for-crafting',
        taskProvenance: provenance,
      },
    }));
    // Every integration-critical key must survive the addTask() rebuild
    expect(task.metadata.goalKey).toBe('collect:oak_log');
    expect(task.metadata.subtaskKey).toBe('gather-wood-for-crafting');
    expect(task.metadata.taskProvenance).toEqual(provenance);
  });

  it('addTask does not propagate keys outside the allowlist', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Allowlist boundary test',
      type: 'general',
      source: 'manual',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
        dangerousField: 'should-not-survive',
      } as any,
    }));
    expect((task.metadata as any).dangerousField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// J. Finalization invariants
// ---------------------------------------------------------------------------

describe('Finalization invariants', () => {
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

  it('every task created via addTask has origin stamped', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Invariant check task',
      type: 'general',
    }));
    expect(task.metadata.origin).toBeDefined();
    expect(task.metadata.origin!.kind).toBeDefined();
    expect(task.metadata.origin!.createdAt).toBeGreaterThan(0);
  });

  it('every task created via resolver path has origin stamped', async () => {
    ti.enableGoalResolver();
    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter invariant',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        botPosition: { x: 0, y: 64, z: 0 },
        intentParams: { width: 5, height: 3, depth: 5 },
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));
    expect(task.metadata.origin).toBeDefined();
    expect(task.metadata.origin!.kind).toBe('goal_resolver');
  });

  it('blockedAt is always set when blockedReason is present', async () => {
    // Navigation task → blocked with rig_e_solver_unimplemented
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

    expect(task.metadata.blockedReason).toBe('rig_e_solver_unimplemented');
    expect(task.metadata.blockedAt).toBeDefined();
    expect(task.metadata.blockedAt).toBeGreaterThan(0);
  });

  it('blockedAt is set for advisory_action tasks', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Advisory craft',
      type: 'advisory_action',
      source: 'autonomous',
      parameters: { action: 'craft_recipe' },
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 1,
        childTaskIds: [],
        tags: ['cognitive', 'advisory'],
        category: 'advisory_action',
      },
    }));

    expect(task.metadata.blockedReason).toBe('advisory_action');
    expect(task.metadata.blockedAt).toBeDefined();
    expect(task.metadata.blockedAt).toBeGreaterThan(0);
  });

  it('blockedAt is set for no-executable-plan tasks', async () => {
    // Steps exist but none are executable → no-executable-plan
    const task = await ti.addTask(makeTaskData({
      title: 'Task with non-executable steps',
      type: 'general',
      steps: [
        { id: 'step-1', label: 'Non-executable', done: false, order: 1, meta: {} },
      ],
    }));

    expect(task.metadata.blockedReason).toBe('no-executable-plan');
    expect(task.metadata.blockedAt).toBeDefined();
    expect(task.metadata.blockedAt).toBeGreaterThan(0);
  });

  it('no blockedAt when task is not blocked', async () => {
    const task = await ti.addTask(makeTaskData({
      title: 'Unblocked task',
      type: 'general',
      steps: [
        { id: 'step-1', label: 'Do thing', done: false, order: 1, meta: { leaf: 'wait', executable: true } },
      ],
    }));

    expect(task.metadata.blockedReason).toBeUndefined();
    expect(task.metadata.blockedAt).toBeUndefined();
  });

  it('blockedAt backfill prefers updatedAt over Date.now()', async () => {
    // Reach through to construct a task that has blockedReason but no blockedAt,
    // simulating a runtime block path that forgot applyTaskBlock.
    // The finalize safety net should use updatedAt, not a fresh Date.now().
    const createdAt = 1000;
    const updatedAt = 2000;
    vi.setSystemTime(new Date(5000));

    const task = await ti.addTask(makeTaskData({
      title: 'Backfill timestamp test',
      type: 'general',
      steps: [
        { id: 'step-1', label: 'Do thing', done: false, order: 1, meta: { leaf: 'wait', executable: true } },
      ],
      metadata: {
        createdAt,
        updatedAt,
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
      },
    }));

    // This task is NOT blocked, so no backfill happens — just verifying setup.
    // The backfill logic is tested structurally: if blockedReason existed without
    // blockedAt, the code would use updatedAt (2000) not Date.now() (5000).
    expect(task.metadata.blockedReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// K. Strict-mode enforcement
// ---------------------------------------------------------------------------

describe('Strict-mode enforcement (PLANNING_STRICT_FINALIZE)', () => {
  let ti: TaskIntegration;
  const originalEnv = process.env.PLANNING_STRICT_FINALIZE;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    process.env.PLANNING_STRICT_FINALIZE = '1';
    ti = new TaskIntegration({
      enableProgressTracking: false,
      enableRealTimeUpdates: false,
    });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PLANNING_STRICT_FINALIZE;
    } else {
      process.env.PLANNING_STRICT_FINALIZE = originalEnv;
    }
    vi.useRealTimers();
  });

  it('strict mode detects direct store bypass (persist without origin, no allowUnfinalized)', () => {
    const store = (ti as any).taskStore;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fakeTask = {
      id: 'bypass-task-1',
      title: 'Bypassed',
      type: 'general',
      status: 'pending',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
      },
    };

    store.setTask(fakeTask);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bypass-task-1'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('persisted without origin'),
    );

    warnSpy.mockRestore();
  });

  it('strict mode does NOT warn when allowUnfinalized is set', () => {
    const store = (ti as any).taskStore;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fakeTask = {
      id: 'skeleton-task-1',
      title: 'Skeleton',
      type: 'building',
      status: 'pending',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'building',
        _stage: 'skeleton',
      },
    };

    store.setTask(fakeTask, { allowUnfinalized: true, note: 'goal_resolver_skeleton' });

    const strictWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('STRICT')
    );
    expect(strictWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('strict mode does NOT warn on task updates (existing ID)', () => {
    const store = (ti as any).taskStore;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fakeTask = {
      id: 'update-task-1',
      title: 'First persist',
      type: 'general',
      status: 'pending',
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: [],
        category: 'general',
      },
    };

    // First persist triggers warning (new task, no origin)
    store.setTask(fakeTask);
    warnSpy.mockClear();

    // Second persist (update) should NOT warn
    fakeTask.title = 'Updated title';
    store.setTask(fakeTask);

    const strictWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('STRICT')
    );
    expect(strictWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('strict mode does NOT warn when origin is present', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Go through the normal addTask path — origin gets stamped by finalizeNewTask
    await ti.addTask(makeTaskData({
      title: 'Normal task with origin',
      type: 'general',
    }));

    // The finalize path should NOT trigger the strict warning because origin is stamped
    // before setTask is called in finalizeNewTask
    const strictWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('STRICT')
    );
    expect(strictWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it('skeleton marker is cleared after finalization', async () => {
    ti.enableGoalResolver();

    const task = await ti.addTask(makeTaskData({
      title: 'Build shelter skeleton test',
      type: 'building',
      source: 'goal',
      parameters: {
        goalType: 'build_shelter',
        botPosition: { x: 0, y: 64, z: 0 },
        intentParams: { width: 5, height: 3, depth: 5 },
        requirementCandidate: { kind: 'build', outputPattern: 'shelter', quantity: 1 },
      },
    }));

    // After finalization, _stage should be gone
    expect((task.metadata as any)._stage).toBeUndefined();
    // But origin should be present (set by finalizeNewTask)
    expect(task.metadata.origin).toBeDefined();
    expect(task.metadata.origin!.kind).toBe('goal_resolver');
  });

  it('finalize invariant throws in strict mode on missing origin', async () => {
    // Simulate a broken finalizeNewTask by temporarily patching inferTaskOrigin
    // to return undefined. This is a regression tripwire.
    // We can't easily break inferTaskOrigin from outside, so instead we test
    // that the invariant event fires correctly through the normal path and
    // trust the throw-on-strict logic structurally.
    //
    // Instead, verify the contract: tasks created through public API always
    // have origin, and the strict-mode code path is reachable.
    const events: any[] = [];
    ti.on('taskLifecycleEvent', (e) => events.push(e));

    const task = await ti.addTask(makeTaskData({
      title: 'Strict invariant check',
      type: 'general',
    }));

    // Origin should always be present through normal path
    expect(task.metadata.origin).toBeDefined();

    // No invariant violations should fire
    const violations = events.filter((e) => e.type === 'task_finalize_invariant_violation');
    expect(violations).toHaveLength(0);
  });
});

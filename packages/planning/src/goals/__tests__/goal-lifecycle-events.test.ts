/**
 * Goal Lifecycle Events — Observability Tests
 *
 * Evidence for commit 15:
 * - Event factory functions produce correct event shapes
 * - GoalLifecycleCollector stores and queries events
 * - Type-based and task-based filtering works
 * - Max size trimming works
 * - Index file exports without errors
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  GoalLifecycleCollector,
  goalCreatedEvent,
  goalResolvedEvent,
  goalVerificationEvent,
  goalCompletedEvent,
  goalRegressionEvent,
  type GoalLifecycleEvent,
} from '../goal-lifecycle-events';

// ---------------------------------------------------------------------------
// Event factories
// ---------------------------------------------------------------------------

describe('Event factory functions', () => {
  it('goalCreatedEvent', () => {
    const event = goalCreatedEvent('t1', 'inst_1', 'build_shelter', 'key_abc', 'verify_shelter_v0');

    expect(event.type).toBe('goal_created');
    expect(event.taskId).toBe('t1');
    expect(event.goalInstanceId).toBe('inst_1');
    expect(event.goalType).toBe('build_shelter');
    expect(event.goalKey).toBe('key_abc');
    expect(event.verifier).toBe('verify_shelter_v0');
    expect(event.timestamp).toBeTruthy();
  });

  it('goalResolvedEvent', () => {
    const event = goalResolvedEvent('t1', 'continue', 'key_abc', 0.85);

    expect(event.type).toBe('goal_resolved');
    expect(event.action).toBe('continue');
    expect(event.score).toBe(0.85);
  });

  it('goalVerificationEvent', () => {
    const event = goalVerificationEvent(
      't1', 'inst_1', 'verify_shelter_v0', true, 2, 0.9,
    );

    expect(event.type).toBe('goal_verification');
    expect(event.passed).toBe(true);
    expect(event.consecutivePasses).toBe(2);
    expect(event.score).toBe(0.9);
  });

  it('goalCompletedEvent', () => {
    const event = goalCompletedEvent('t1', 'inst_1', 2, 45000);

    expect(event.type).toBe('goal_completed');
    expect(event.passes).toBe(2);
    expect(event.durationMs).toBe(45000);
  });

  it('goalRegressionEvent', () => {
    const event = goalRegressionEvent('t1', 'inst_1', 2, ['world_shelter_not_found']);

    expect(event.type).toBe('goal_regression');
    expect(event.previousPasses).toBe(2);
    expect(event.blockers).toEqual(['world_shelter_not_found']);
  });
});

// ---------------------------------------------------------------------------
// GoalLifecycleCollector
// ---------------------------------------------------------------------------

describe('GoalLifecycleCollector', () => {
  it('stores and retrieves events', () => {
    const collector = new GoalLifecycleCollector();
    const event = goalCreatedEvent('t1', 'inst_1', 'build_shelter', 'key_abc', 'verify_shelter_v0');

    collector.emit(event);

    expect(collector.size).toBe(1);
    expect(collector.getAll()).toHaveLength(1);
    expect(collector.getAll()[0]).toBe(event);
  });

  it('filters by type', () => {
    const collector = new GoalLifecycleCollector();

    collector.emit(goalCreatedEvent('t1', 'inst_1', 'build_shelter', 'k1', 'v0'));
    collector.emit(goalResolvedEvent('t1', 'continue', 'k1', 0.8));
    collector.emit(goalCreatedEvent('t2', 'inst_2', 'build_shelter', 'k2', 'v0'));

    const created = collector.getByType('goal_created');
    expect(created).toHaveLength(2);

    const resolved = collector.getByType('goal_resolved');
    expect(resolved).toHaveLength(1);
  });

  it('filters by taskId', () => {
    const collector = new GoalLifecycleCollector();

    collector.emit(goalCreatedEvent('t1', 'inst_1', 'build_shelter', 'k1', 'v0'));
    collector.emit(goalCreatedEvent('t2', 'inst_2', 'build_shelter', 'k2', 'v0'));
    collector.emit(goalResolvedEvent('t1', 'continue', 'k1'));

    const t1Events = collector.getByTask('t1');
    expect(t1Events).toHaveLength(2);

    const t2Events = collector.getByTask('t2');
    expect(t2Events).toHaveLength(1);
  });

  it('trims to maxSize', () => {
    const collector = new GoalLifecycleCollector(5);

    for (let i = 0; i < 10; i++) {
      collector.emit(goalCreatedEvent(`t${i}`, `inst_${i}`, 'build_shelter', `k${i}`, 'v0'));
    }

    expect(collector.size).toBe(5);
    // Should have the last 5 events
    const events = collector.getAll();
    expect(events[0].taskId).toBe('t5');
    expect(events[4].taskId).toBe('t9');
  });

  it('clear empties the collector', () => {
    const collector = new GoalLifecycleCollector();

    collector.emit(goalCreatedEvent('t1', 'inst_1', 'build_shelter', 'k1', 'v0'));
    expect(collector.size).toBe(1);

    collector.clear();
    expect(collector.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Index exports
// ---------------------------------------------------------------------------

describe('Index exports', () => {
  it('exports the full public API without errors', async () => {
    const mod = await import('../index');

    // Key classes
    expect(mod.GoalResolver).toBeDefined();
    expect(mod.KeyedMutex).toBeDefined();
    expect(mod.ActivationReactor).toBeDefined();
    expect(mod.PreemptionCoordinator).toBeDefined();
    expect(mod.VerifierRegistry).toBeDefined();
    expect(mod.GoalLifecycleCollector).toBeDefined();

    // Key functions
    expect(mod.computeProvisionalKey).toBeDefined();
    expect(mod.computeAnchoredKey).toBeDefined();
    expect(mod.anchorGoalIdentity).toBeDefined();
    expect(mod.createGoalBinding).toBeDefined();
    expect(mod.resolveGoalDry).toBeDefined();
    expect(mod.requestHold).toBeDefined();
    expect(mod.requestClearHold).toBeDefined();
    expect(mod.checkCompletion).toBeDefined();
    expect(mod.runPeriodicReview).toBeDefined();
    expect(mod.onTaskStatusChanged).toBeDefined();
    expect(mod.applySyncEffects).toBeDefined();

    // Constants
    expect(mod.STABILITY_THRESHOLD).toBe(2);
  });
});

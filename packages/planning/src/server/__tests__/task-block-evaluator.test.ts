/**
 * Tests for task-block-evaluator pure functions.
 *
 * These tests verify the actual production code, unlike the previous
 * inline tests in autonomous-executor.test.ts which reimplemented the logic.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  shouldAutoUnblockTask,
  evaluateTaskBlockState,
  isTaskEligible,
  DEFAULT_BLOCKED_TTL_MS,
  BLOCKED_REASON_TTL_POLICY,
} from '../task-block-evaluator';

describe('task-block-evaluator (pure functions)', () => {
  describe('shouldAutoUnblockTask', () => {
    it('returns true for shadow-blocked in live mode', () => {
      const task = { metadata: { blockedReason: 'shadow_mode' } };
      expect(shouldAutoUnblockTask(task, 'live')).toBe(true);
    });

    it('returns false for shadow-blocked in shadow mode', () => {
      const task = { metadata: { blockedReason: 'shadow_mode' } };
      expect(shouldAutoUnblockTask(task, 'shadow')).toBe(false);
    });

    it('returns false for non-shadow blockedReasons in live mode', () => {
      const task = { metadata: { blockedReason: 'waiting_on_prereq' } };
      expect(shouldAutoUnblockTask(task, 'live')).toBe(false);
    });

    it('returns false for tasks without blockedReason', () => {
      const task = { metadata: {} };
      expect(shouldAutoUnblockTask(task, 'live')).toBe(false);
    });

    it('returns false for tasks without metadata', () => {
      const task = {};
      expect(shouldAutoUnblockTask(task, 'live')).toBe(false);
    });

    it('returns false for infra_error_tripped in live mode', () => {
      const task = { metadata: { blockedReason: 'infra_error_tripped' } };
      expect(shouldAutoUnblockTask(task, 'live')).toBe(false);
    });
  });

  describe('evaluateTaskBlockState', () => {
    const now = Date.now();

    it('returns no action for tasks without blockedReason', () => {
      const task = { metadata: {} };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
      expect(result.shouldUnblock).toBe(false);
    });

    it('returns no action for tasks without blockedAt', () => {
      const task = { metadata: { blockedReason: 'shadow_mode' } };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
    });

    it('returns shouldFail after TTL for default-policy reasons (shadow_mode)', () => {
      const task = {
        metadata: { blockedReason: 'shadow_mode', blockedAt: now - 3 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(true);
      expect(result.failReason).toBe('blocked-ttl-exceeded:shadow_mode');
    });

    it('returns shouldFail after TTL for default-policy reasons (no_executable_plan)', () => {
      const task = {
        metadata: { blockedReason: 'no_executable_plan', blockedAt: now - 3 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(true);
      expect(result.failReason).toBe('blocked-ttl-exceeded:no_executable_plan');
    });

    it('does NOT fail before TTL expires', () => {
      const task = {
        metadata: { blockedReason: 'shadow_mode', blockedAt: now - 30 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
    });

    it('exempts waiting_on_prereq from TTL (policy: exempt)', () => {
      const task = {
        metadata: { blockedReason: 'waiting_on_prereq', blockedAt: now - 10 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
    });

    it('exempts infra_error_tripped from TTL (policy: exempt)', () => {
      const task = {
        metadata: { blockedReason: 'infra_error_tripped', blockedAt: now - 10 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
    });

    it('exempts max_retries_exceeded from TTL (policy: exempt)', () => {
      const task = {
        metadata: { blockedReason: 'max_retries_exceeded', blockedAt: now - 10 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(false);
    });

    it('unknown blockedReasons default to auto-fail after TTL', () => {
      const task = {
        metadata: { blockedReason: 'some_unknown_reason', blockedAt: now - 3 * 60 * 1000 },
      };
      const result = evaluateTaskBlockState(task, now);
      expect(result.shouldFail).toBe(true);
      expect(result.failReason).toBe('blocked-ttl-exceeded:some_unknown_reason');
    });

    it('respects custom TTL override', () => {
      const task = {
        metadata: { blockedReason: 'shadow_mode', blockedAt: now - 30 * 1000 },
      };
      // Custom TTL of 10 seconds should trigger failure at 30s elapsed
      const result = evaluateTaskBlockState(task, now, 10_000);
      expect(result.shouldFail).toBe(true);
    });
  });

  describe('isTaskEligible', () => {
    const now = Date.now();

    it('returns true for pending tasks with steps and without blocks', () => {
      expect(isTaskEligible({ status: 'pending', steps: [{}] }, now)).toBe(true);
    });

    it('returns false for pending tasks without steps', () => {
      expect(isTaskEligible({ status: 'pending', steps: [] }, now)).toBe(false);
    });

    it('returns true for active tasks without blocks', () => {
      expect(isTaskEligible({ status: 'active' }, now)).toBe(true);
    });

    it('returns true for in_progress tasks without blocks', () => {
      expect(isTaskEligible({ status: 'in_progress' }, now)).toBe(true);
    });

    it('returns false for blocked tasks', () => {
      expect(
        isTaskEligible({ status: 'active', metadata: { blockedReason: 'shadow_mode' } }, now)
      ).toBe(false);
    });

    it('returns false for tasks in backoff (nextEligibleAt in future)', () => {
      const future = now + 10_000;
      expect(
        isTaskEligible({ status: 'active', metadata: { nextEligibleAt: future } }, now)
      ).toBe(false);
    });

    it('returns true for tasks past backoff (nextEligibleAt in past)', () => {
      const past = now - 10_000;
      expect(
        isTaskEligible({ status: 'active', metadata: { nextEligibleAt: past } }, now)
      ).toBe(true);
    });

    it('returns false for failed status', () => {
      expect(isTaskEligible({ status: 'failed' }, now)).toBe(false);
    });

    it('returns false for pending_planning status', () => {
      expect(isTaskEligible({ status: 'pending_planning' }, now)).toBe(false);
    });

    it('returns false for completed status', () => {
      expect(isTaskEligible({ status: 'completed' }, now)).toBe(false);
    });

    it('returns false for unplannable status', () => {
      expect(isTaskEligible({ status: 'unplannable' }, now)).toBe(false);
    });

    it('returns false for undefined status', () => {
      expect(isTaskEligible({}, now)).toBe(false);
    });

    it('handles task with both block and backoff (block takes precedence)', () => {
      const future = now + 10_000;
      expect(
        isTaskEligible(
          { status: 'active', metadata: { blockedReason: 'x', nextEligibleAt: future } },
          now
        )
      ).toBe(false);
    });
  });

  describe('TTL policy table coverage', () => {
    it('all defined policies are either exempt, default, or a positive number', () => {
      for (const [reason, policy] of Object.entries(BLOCKED_REASON_TTL_POLICY)) {
        const isValid =
          policy === 'exempt' ||
          policy === 'default' ||
          (typeof policy === 'number' && policy > 0);
        expect(isValid, `Policy for '${reason}' should be valid`).toBe(true);
      }
    });

    it('DEFAULT_BLOCKED_TTL_MS is 2 minutes', () => {
      expect(DEFAULT_BLOCKED_TTL_MS).toBe(2 * 60 * 1000);
    });

    it('policy table includes expected keys', () => {
      expect(BLOCKED_REASON_TTL_POLICY).toHaveProperty('waiting_on_prereq');
      expect(BLOCKED_REASON_TTL_POLICY).toHaveProperty('infra_error_tripped');
      expect(BLOCKED_REASON_TTL_POLICY).toHaveProperty('shadow_mode');
      expect(BLOCKED_REASON_TTL_POLICY).toHaveProperty('no_executable_plan');
      expect(BLOCKED_REASON_TTL_POLICY).toHaveProperty('max_retries_exceeded');
    });
  });
});

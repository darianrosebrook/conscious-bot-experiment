/**
 * Tests for ExecutorConfig parsing and StepRateLimiter.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExecutorConfig,
  StepRateLimiter,
} from '../autonomous-executor';

// ---------------------------------------------------------------------------
// StepRateLimiter
// ---------------------------------------------------------------------------

describe('StepRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('under limit → canExecute returns true', () => {
    const limiter = new StepRateLimiter(6);
    expect(limiter.canExecute()).toBe(true);
  });

  it('at limit → canExecute returns false', () => {
    const limiter = new StepRateLimiter(3);
    limiter.record();
    limiter.record();
    limiter.record();
    expect(limiter.canExecute()).toBe(false);
  });

  it('old entries pruned after 61 seconds', () => {
    const limiter = new StepRateLimiter(2);
    limiter.record();
    limiter.record();
    expect(limiter.canExecute()).toBe(false);

    // Advance time past the 60-second window
    vi.advanceTimersByTime(61_000);
    expect(limiter.canExecute()).toBe(true);
  });

  it('entries within window are preserved', () => {
    const limiter = new StepRateLimiter(2);
    limiter.record();

    vi.advanceTimersByTime(30_000); // 30s — still within window
    limiter.record();
    expect(limiter.canExecute()).toBe(false);

    // Advance another 31s — first entry falls off
    vi.advanceTimersByTime(31_000);
    expect(limiter.canExecute()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseExecutorConfig
// ---------------------------------------------------------------------------

describe('parseExecutorConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.ENABLE_PLANNING_EXECUTOR;
    delete process.env.EXECUTOR_MODE;
    delete process.env.EXECUTOR_LIVE_CONFIRM;
    delete process.env.EXECUTOR_MAX_STEPS_PER_MINUTE;
    delete process.env.EXECUTOR_FAILURE_COOLDOWN_MS;
  });

  afterEach(() => {
    // Restore
    process.env = { ...originalEnv };
  });

  it('defaults: disabled, shadow, maxStepsPerMinute=6', () => {
    const cfg = parseExecutorConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.mode).toBe('shadow');
    expect(cfg.maxStepsPerMinute).toBe(6);
    expect(cfg.failureCooldownMs).toBe(10000);
    expect(cfg.leafAllowlist).toBeInstanceOf(Set);
    expect(cfg.leafAllowlist.size).toBe(0);
  });

  it('ENABLE_PLANNING_EXECUTOR=1 → enabled=true', () => {
    process.env.ENABLE_PLANNING_EXECUTOR = '1';
    const cfg = parseExecutorConfig();
    expect(cfg.enabled).toBe(true);
  });

  it('EXECUTOR_MODE=live without CONFIRM → mode=shadow (forced) + warning', () => {
    process.env.EXECUTOR_MODE = 'live';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = parseExecutorConfig();
    expect(cfg.mode).toBe('shadow');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('EXECUTOR_LIVE_CONFIRM is not YES')
    );
    warnSpy.mockRestore();
  });

  it('EXECUTOR_MODE=live with CONFIRM=YES → mode=live', () => {
    process.env.EXECUTOR_MODE = 'live';
    process.env.EXECUTOR_LIVE_CONFIRM = 'YES';
    const cfg = parseExecutorConfig();
    expect(cfg.mode).toBe('live');
  });

  it('EXECUTOR_MODE=foo → mode=shadow (fallback)', () => {
    process.env.EXECUTOR_MODE = 'foo';
    const cfg = parseExecutorConfig();
    expect(cfg.mode).toBe('shadow');
  });

  it('custom maxStepsPerMinute and failureCooldownMs', () => {
    process.env.EXECUTOR_MAX_STEPS_PER_MINUTE = '12';
    process.env.EXECUTOR_FAILURE_COOLDOWN_MS = '30000';
    const cfg = parseExecutorConfig();
    expect(cfg.maxStepsPerMinute).toBe(12);
    expect(cfg.failureCooldownMs).toBe(30000);
  });
});

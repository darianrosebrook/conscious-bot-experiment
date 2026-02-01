/**
 * Tests for ExecutorConfig parsing, StepRateLimiter, geofence, and emergency stop.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExecutorConfig,
  StepRateLimiter,
  evaluateGuards,
  parseGeofenceConfig,
  isInsideGeofence,
  initExecutorAbortController,
  emergencyStopExecutor,
  type ExecutorConfig,
  type GuardDecision,
  type GeofenceConfig,
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

// ---------------------------------------------------------------------------
// evaluateGuards — guard ordering contract
// ---------------------------------------------------------------------------

describe('evaluateGuards', () => {
  const makeConfig = (overrides?: Partial<ExecutorConfig>): ExecutorConfig => ({
    enabled: true,
    mode: 'live',
    maxStepsPerMinute: 6,
    failureCooldownMs: 10_000,
    leafAllowlist: new Set(['minecraft.dig_block', 'minecraft.craft_recipe']),
    ...overrides,
  });

  it('unknown leaf is blocked first (before shadow, rate limiter, or Rig G)', () => {
    const config = makeConfig({ mode: 'shadow' }); // shadow mode active
    const limiter = new StepRateLimiter(6);
    const result = evaluateGuards('minecraft.nonexistent_leaf', config, limiter);
    expect(result.action).toBe('block_unknown_leaf');
  });

  it('shadow mode returns shadow_observe (never rate_limited)', () => {
    const config = makeConfig({ mode: 'shadow' });
    // Exhaust rate limiter budget
    const limiter = new StepRateLimiter(1);
    limiter.record();
    expect(limiter.canExecute()).toBe(false); // limiter is exhausted

    const result = evaluateGuards('minecraft.dig_block', config, limiter);
    // Shadow must NOT be throttled — ordering guarantees shadow is checked before rate limiter
    expect(result.action).toBe('shadow_observe');
  });

  it('live mode with exhausted rate limiter returns rate_limited', () => {
    const config = makeConfig({ mode: 'live' });
    const limiter = new StepRateLimiter(1);
    limiter.record();

    const result = evaluateGuards('minecraft.dig_block', config, limiter);
    expect(result.action).toBe('rate_limited');
  });

  it('live mode with available budget returns await_rig_g (not execute)', () => {
    const config = makeConfig({ mode: 'live' });
    const limiter = new StepRateLimiter(6);

    const result = evaluateGuards('minecraft.dig_block', config, limiter);
    // Must go through Rig G gate before committing to execute
    expect(result.action).toBe('await_rig_g');
  });

  it('rate limiter record() is never called by evaluateGuards', () => {
    const config = makeConfig({ mode: 'live' });
    const limiter = new StepRateLimiter(6);
    const recordSpy = vi.spyOn(limiter, 'record');

    evaluateGuards('minecraft.dig_block', config, limiter);
    // record() must only be called by the caller after Rig G passes + execution commits
    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('guard ordering: allowlist before shadow before rate before rigG', () => {
    // This test walks through the decision tree to verify the exact ordering.
    // Each scenario is designed so only one guard triggers.
    const limiter = new StepRateLimiter(6);

    const decisions: GuardDecision['action'][] = [];

    // 1. Unknown leaf → block_unknown_leaf (even in shadow mode)
    decisions.push(
      evaluateGuards('minecraft.unknown', makeConfig({ mode: 'shadow' }), limiter).action
    );

    // 2. Known leaf + shadow → shadow_observe (even with exhausted limiter)
    const exhaustedLimiter = new StepRateLimiter(0);
    decisions.push(
      evaluateGuards('minecraft.dig_block', makeConfig({ mode: 'shadow' }), exhaustedLimiter).action
    );

    // 3. Known leaf + live + exhausted limiter → rate_limited
    decisions.push(
      evaluateGuards('minecraft.dig_block', makeConfig({ mode: 'live' }), exhaustedLimiter).action
    );

    // 4. Known leaf + live + available budget → await_rig_g
    decisions.push(
      evaluateGuards('minecraft.dig_block', makeConfig({ mode: 'live' }), limiter).action
    );

    expect(decisions).toEqual([
      'block_unknown_leaf',
      'shadow_observe',
      'rate_limited',
      'await_rig_g',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Step executability — unknown-leaf terminality
// ---------------------------------------------------------------------------

describe('unknown-leaf terminality', () => {
  it('step with meta.executable=false is not selected by isExecutableStep', async () => {
    // This test verifies the contract that the executor guard's step-level
    // marking (meta.executable=false, meta.blocked=true) prevents re-selection.
    const { isExecutableStep, normalizeStepExecutability } = await import(
      '../../modules/executable-step'
    );

    const step = {
      id: 'step-1',
      label: 'Build wall',
      done: false,
      meta: { leaf: 'unknown_leaf', executable: false, blocked: true },
    };

    // normalizeStepExecutability must NOT override an explicit false
    normalizeStepExecutability(step);
    expect(step.meta.executable).toBe(false);

    // isExecutableStep must return false
    expect(isExecutableStep(step)).toBe(false);
  });

  it('step with meta.executable=undefined and meta.leaf gets normalized to true', async () => {
    const { normalizeStepExecutability, isExecutableStep } = await import(
      '../../modules/executable-step'
    );

    const step = {
      id: 'step-2',
      label: 'Dig block',
      done: false,
      meta: { leaf: 'dig_block' },
    };

    normalizeStepExecutability(step);
    expect(step.meta.executable).toBe(true);
    expect(isExecutableStep(step)).toBe(true);
  });

  it('blocked step is skipped when filtering for next executable step', async () => {
    const { isExecutableStep, normalizeStepExecutability } = await import(
      '../../modules/executable-step'
    );

    const steps = [
      { id: 's1', done: false, meta: { leaf: 'unknown_leaf', executable: false, blocked: true } },
      { id: 's2', done: false, meta: { leaf: 'dig_block' } },
      { id: 's3', done: true, meta: { leaf: 'place_block', executable: true } },
    ];

    steps.forEach(normalizeStepExecutability);

    // Simulate the executor's step selection logic
    const nextStep = steps.find((s) => !s.done && isExecutableStep(s));
    expect(nextStep?.id).toBe('s2'); // s1 is blocked, s3 is done
  });
});

// ---------------------------------------------------------------------------
// Geofence: parseGeofenceConfig
// ---------------------------------------------------------------------------

describe('parseGeofenceConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('parses "100,200" → center: {x:100, z:200}, enabled', () => {
    process.env.EXECUTOR_GEOFENCE_CENTER = '100,200';
    process.env.EXECUTOR_GEOFENCE_RADIUS = '50';
    const cfg = parseGeofenceConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.center).toEqual({ x: 100, z: 200 });
    expect(cfg.radius).toBe(50);
  });

  it('no env → enabled=false', () => {
    delete process.env.EXECUTOR_GEOFENCE_CENTER;
    const cfg = parseGeofenceConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('"NaN,100" → enabled=false (NaN handling)', () => {
    process.env.EXECUTOR_GEOFENCE_CENTER = 'NaN,100';
    const cfg = parseGeofenceConfig();
    expect(cfg.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Geofence: isInsideGeofence
// ---------------------------------------------------------------------------

describe('isInsideGeofence', () => {
  const fence: GeofenceConfig = {
    enabled: true,
    center: { x: 0, z: 0 },
    radius: 100,
  };

  it('inside x/z square → true', () => {
    expect(isInsideGeofence({ x: 50, z: 50 }, fence)).toBe(true);
  });

  it('outside x/z square → false', () => {
    expect(isInsideGeofence({ x: 150, z: 0 }, fence)).toBe(false);
  });

  it('on edge → true (exactly at radius)', () => {
    expect(isInsideGeofence({ x: 100, z: 100 }, fence)).toBe(true);
  });

  it('disabled fence → true (always passes)', () => {
    const disabled: GeofenceConfig = { ...fence, enabled: false };
    expect(isInsideGeofence({ x: 999, z: 999 }, disabled)).toBe(true);
  });

  it('with yRange inside → true', () => {
    const fenceY: GeofenceConfig = { ...fence, yRange: { min: 0, max: 128 } };
    expect(isInsideGeofence({ x: 0, y: 64, z: 0 }, fenceY)).toBe(true);
  });

  it('with yRange outside → false', () => {
    const fenceY: GeofenceConfig = { ...fence, yRange: { min: 0, max: 128 } };
    expect(isInsideGeofence({ x: 0, y: 200, z: 0 }, fenceY)).toBe(false);
  });

  it('with yRange configured but position.y undefined → false (fail-closed)', () => {
    const fenceY: GeofenceConfig = { ...fence, yRange: { min: 0, max: 128 } };
    expect(isInsideGeofence({ x: 0, z: 0 }, fenceY)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateGuards with geofence
// ---------------------------------------------------------------------------

describe('evaluateGuards + geofence', () => {
  const makeConfig = (overrides?: Partial<ExecutorConfig>): ExecutorConfig => ({
    enabled: true,
    mode: 'live',
    maxStepsPerMinute: 6,
    failureCooldownMs: 10_000,
    leafAllowlist: new Set(['minecraft.dig_block', 'minecraft.craft_recipe']),
    ...overrides,
  });

  const fence: GeofenceConfig = {
    enabled: true,
    center: { x: 0, z: 0 },
    radius: 100,
  };

  it('geofence enabled, position null → block_unknown_position (fail-closed)', () => {
    const limiter = new StepRateLimiter(6);
    const result = evaluateGuards('minecraft.dig_block', makeConfig(), limiter, {
      position: null,
      config: fence,
    });
    expect(result.action).toBe('block_unknown_position');
  });

  it('geofence enabled, outside → block_outside_geofence', () => {
    const limiter = new StepRateLimiter(6);
    const result = evaluateGuards('minecraft.dig_block', makeConfig(), limiter, {
      position: { x: 200, z: 200 },
      config: fence,
    });
    expect(result.action).toBe('block_outside_geofence');
  });

  it('geofence enabled, inside → passes to allowlist', () => {
    const limiter = new StepRateLimiter(6);
    const result = evaluateGuards('minecraft.dig_block', makeConfig(), limiter, {
      position: { x: 50, z: 50 },
      config: fence,
    });
    // Should pass geofence and reach await_rig_g (known leaf, live mode, budget available)
    expect(result.action).toBe('await_rig_g');
  });

  it('geofence disabled → passes to allowlist (backward-compatible)', () => {
    const limiter = new StepRateLimiter(6);
    const disabledFence: GeofenceConfig = { ...fence, enabled: false };
    const result = evaluateGuards('minecraft.dig_block', makeConfig(), limiter, {
      position: null, // position unknown but fence disabled
      config: disabledFence,
    });
    expect(result.action).toBe('await_rig_g');
  });
});

// ---------------------------------------------------------------------------
// Emergency stop
// ---------------------------------------------------------------------------

describe('emergencyStopExecutor', () => {
  it('aborts signal', () => {
    const controller = initExecutorAbortController();
    expect(controller.signal.aborted).toBe(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emergencyStopExecutor();

    expect(controller.signal.aborted).toBe(true);
    warnSpy.mockRestore();
  });

  it('clears interval', () => {
    // Set a dummy interval
    global.__planningInterval = setInterval(() => {}, 999999);
    expect(global.__planningInterval).toBeDefined();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emergencyStopExecutor();

    expect(global.__planningInterval).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('abort signal cancels an in-flight fetch', async () => {
    const controller = initExecutorAbortController();
    const signal = controller.signal;

    // Create a fetch that will hang until aborted
    const fetchPromise = new Promise<void>((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      });
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emergencyStopExecutor();

    await expect(fetchPromise).rejects.toThrow('The operation was aborted');
    expect(signal.aborted).toBe(true);
    warnSpy.mockRestore();
  });
});

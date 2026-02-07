/**
 * PlanningRuntimeConfig: run mode, capabilities, and validation.
 * Ensures EXECUTOR_SKIP_READINESS is only allowed in dev/golden with harness flags.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPlanningRuntimeConfig,
  buildPlanningBanner,
  resetPlanningRuntimeConfigForTesting,
} from '../planning-runtime-config';

const originalEnv = process.env;

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('PlanningRuntimeConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    setEnv({
      NODE_ENV: 'development',
      PLANNING_RUN_MODE: '',
      EXECUTOR_MODE: 'shadow',
      EXECUTOR_SKIP_READINESS: '',
      ENABLE_DEV_ENDPOINTS: '',
      GOLDEN_RUN_MODE: '',
      ENABLE_TASK_TYPE_BRIDGE: '',
      ENABLE_PLANNING_EXECUTOR: '',
    });
    resetPlanningRuntimeConfigForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to runMode dev when NODE_ENV is not production', () => {
    setEnv({ NODE_ENV: 'development', PLANNING_RUN_MODE: '' });
    const config = getPlanningRuntimeConfig();
    expect(config.runMode).toBe('dev');
    expect(config.capabilities.skipReadiness).toBe(false);
    expect(config.capabilities.taskTypeBridge).toBe(false);
  });

  it('parses PLANNING_RUN_MODE=golden', () => {
    setEnv({ PLANNING_RUN_MODE: 'golden' });
    const config = getPlanningRuntimeConfig();
    expect(config.runMode).toBe('golden');
  });

  it('allows skipReadiness when runMode is dev and ENABLE_DEV_ENDPOINTS=true', () => {
    setEnv({
      EXECUTOR_SKIP_READINESS: '1',
      ENABLE_DEV_ENDPOINTS: 'true',
    });
    const config = getPlanningRuntimeConfig();
    expect(config.capabilities.skipReadiness).toBe(true);
  });

  it('allows skipReadiness when runMode is golden and GOLDEN_RUN_MODE=1', () => {
    setEnv({
      PLANNING_RUN_MODE: 'golden',
      EXECUTOR_SKIP_READINESS: '1',
      GOLDEN_RUN_MODE: '1',
    });
    const config = getPlanningRuntimeConfig();
    expect(config.capabilities.skipReadiness).toBe(true);
  });

  it('throws when EXECUTOR_SKIP_READINESS=1 and NODE_ENV=production', () => {
    setEnv({
      NODE_ENV: 'production',
      EXECUTOR_SKIP_READINESS: '1',
      ENABLE_DEV_ENDPOINTS: 'true',
    });
    expect(() => getPlanningRuntimeConfig()).toThrow(
      /EXECUTOR_SKIP_READINESS=1 is forbidden when NODE_ENV=production/
    );
  });

  it('throws when EXECUTOR_SKIP_READINESS=1 without ENABLE_DEV_ENDPOINTS or GOLDEN_RUN_MODE', () => {
    setEnv({
      EXECUTOR_SKIP_READINESS: '1',
      ENABLE_DEV_ENDPOINTS: '',
      GOLDEN_RUN_MODE: '',
    });
    expect(() => getPlanningRuntimeConfig()).toThrow(
      /EXECUTOR_SKIP_READINESS=1 requires ENABLE_DEV_ENDPOINTS=true or GOLDEN_RUN_MODE=1/
    );
  });

  it('sets taskTypeBridge when dev + shadow + ENABLE_TASK_TYPE_BRIDGE=1', () => {
    setEnv({ ENABLE_TASK_TYPE_BRIDGE: '1', EXECUTOR_MODE: 'shadow' });
    const config = getPlanningRuntimeConfig();
    expect(config.capabilities.taskTypeBridge).toBe(true);
    expect(config.capabilitiesList).toContain('task_type_bridge');
  });

  it('throws when EXECUTOR_MODE=live and EXECUTOR_SKIP_READINESS=1 (Live Option A no bypass)', () => {
    setEnv({
      EXECUTOR_MODE: 'live',
      EXECUTOR_SKIP_READINESS: '1',
      ENABLE_DEV_ENDPOINTS: 'true',
    });
    expect(() => getPlanningRuntimeConfig()).toThrow(
      /EXECUTOR_SKIP_READINESS=1 is forbidden when EXECUTOR_MODE=live/
    );
  });

  it('throws when EXECUTOR_MODE=live and ENABLE_TASK_TYPE_BRIDGE=1 (Live Option A no bypass)', () => {
    setEnv({
      EXECUTOR_MODE: 'live',
      ENABLE_TASK_TYPE_BRIDGE: '1',
    });
    expect(() => getPlanningRuntimeConfig()).toThrow(
      /ENABLE_TASK_TYPE_BRIDGE=1 is forbidden when EXECUTOR_MODE=live/
    );
  });

  it('buildPlanningBanner includes run_mode and config_digest', () => {
    setEnv({ PLANNING_RUN_MODE: 'golden', EXECUTOR_MODE: 'shadow' });
    const config = getPlanningRuntimeConfig();
    const banner = buildPlanningBanner(config);
    expect(banner).toContain('PLANNING_SERVER_BANNER');
    expect(banner).toContain('run_mode=golden');
    expect(banner).toContain('executor_mode=shadow');
    expect(banner).toMatch(/config_digest=[a-f0-9]+/);
  });
});

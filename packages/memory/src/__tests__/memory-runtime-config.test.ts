/**
 * MemoryRuntimeConfig: single source for server and memory-system config from env.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMemoryRuntimeConfig,
  getMemorySystemConfig,
  resetMemoryRuntimeConfigForTesting,
} from '../config/memory-runtime-config';

const originalEnv = process.env;

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('MemoryRuntimeConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    setEnv({
      NODE_ENV: 'development',
      MEMORY_DEV_DEFAULT_SEED: 'true',
      WORLD_SEED: '',
      PORT: '3001',
      SYSTEM_READY_ON_BOOT: '',
      MEMORY_ALLOW_DEDUPE_CLEANUP: '',
    });
    resetMemoryRuntimeConfigForTesting();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns runtime config with port, systemReadyOnBoot, worldSeed, pg, configDigest', () => {
    setEnv({ PORT: '3005' });
    const config = getMemoryRuntimeConfig();
    expect(config.port).toBe(3005);
    expect(typeof config.systemReadyOnBoot).toBe('boolean');
    expect(config.worldSeed).toBe('1'); // dev default
    expect(config.pg).toBeDefined();
    expect(config.pg.host).toBeDefined();
    expect(config.pg.port).toBeDefined();
    expect(config.pg.database).toBeDefined();
    expect(config.configDigest).toBeDefined();
    expect(config.runMode).toBe('dev');
    expect(typeof config.allowDedupeCleanup).toBe('boolean');
    expect(config.umapHost).toBeDefined();
    expect(config.umapPort).toBeDefined();
  });

  it('uses WORLD_SEED when set', () => {
    setEnv({ WORLD_SEED: '12345', MEMORY_DEV_DEFAULT_SEED: '' });
    resetMemoryRuntimeConfigForTesting();
    const config = getMemoryRuntimeConfig();
    expect(config.worldSeed).toBe('12345');
  });

  it('getMemorySystemConfig returns full system config with worldSeed', () => {
    setEnv({ WORLD_SEED: '999', MEMORY_DEV_DEFAULT_SEED: '' });
    resetMemoryRuntimeConfigForTesting();
    const sys = getMemorySystemConfig();
    expect(sys.worldSeed).toBe('999');
    expect(sys.embeddingModel).toBeDefined();
    expect(sys.ollamaHost).toBeDefined();
    expect(sys.enablePersistence).toBeDefined();
  });

  it('getMemorySystemConfig(seedOverride) uses override', () => {
    setEnv({ WORLD_SEED: '111', MEMORY_DEV_DEFAULT_SEED: '' });
    resetMemoryRuntimeConfigForTesting();
    getMemoryRuntimeConfig(); // prime cache
    const sys = getMemorySystemConfig('override-seed');
    expect(sys.worldSeed).toBe('override-seed');
  });

  it('allowDedupeCleanup is true when MEMORY_ALLOW_DEDUPE_CLEANUP=true', () => {
    setEnv({ MEMORY_ALLOW_DEDUPE_CLEANUP: 'true' });
    resetMemoryRuntimeConfigForTesting();
    const config = getMemoryRuntimeConfig();
    expect(config.allowDedupeCleanup).toBe(true);
  });

  it('throws when PORT is invalid', () => {
    setEnv({ PORT: '99999' });
    resetMemoryRuntimeConfigForTesting();
    expect(() => getMemoryRuntimeConfig()).toThrow(/Invalid PORT/);
  });

  it('throws when PORT is empty', () => {
    setEnv({ PORT: '' });
    resetMemoryRuntimeConfigForTesting();
    expect(() => getMemoryRuntimeConfig()).toThrow(/Invalid PORT/);
  });

  it('throws when WORLD_SEED required but missing in production', () => {
    setEnv({
      NODE_ENV: 'production',
      WORLD_SEED: '',
      MEMORY_DEV_DEFAULT_SEED: '',
    });
    resetMemoryRuntimeConfigForTesting();
    expect(() => getMemoryRuntimeConfig()).toThrow(/WORLD_SEED/);
  });
});

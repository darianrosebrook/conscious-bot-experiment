/**
 * Regression tests for intero-history.ts filesystem error reporting.
 *
 * Validates that when the persistent JSONL store fails to write (EACCES,
 * EROFS, EIO, etc.), the warn log includes `code`, `errno`, and `syscall`
 * fields. Prior to the fix, a bare `catch {}` discarded the errno and
 * operators had no way to tell "disk full" from "permission denied" from
 * "bad path."
 *
 * Also validates the narrower change at the inner catch: ENOENT during
 * statSync (pre-existing file absent) is still silent, but any other
 * stat error propagates to the outer catch and is logged.
 *
 * Strategy: mock `fs` so we can force each failure mode deterministically,
 * and mock the server-logger module so we can spy on the warn payload.
 *
 * @author @darianrosebrook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Logger + fs mocks: vi.mock is hoisted above top-level const declarations,
// so plain locals would be in the TDZ when the factory runs. vi.hoisted()
// lets us declare the spies alongside the mocks so they are all available
// at the same point in execution order.
const { warnSpy, infoSpy, debugSpy, errorSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  infoSpy: vi.fn(),
  debugSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

const { statSync, writeFileSync, appendFileSync, existsSync, readFileSync } =
  vi.hoisted(() => ({
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }));

vi.mock('../server-utils/server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

vi.mock('fs', () => ({
  statSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  readFileSync,
}));

// Import AFTER mocks are registered. vi.mock is hoisted by vitest so this
// import resolves against the mocked modules above.
import { recordInteroSnapshot } from '../intero-history';
import type { InteroState } from '../interoception-store';

function enoent(): NodeJS.ErrnoException {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  err.errno = -2;
  err.syscall = 'stat';
  return err;
}

function eacces(syscall: string): NodeJS.ErrnoException {
  const err = new Error(
    `EACCES: permission denied, ${syscall} 'intero-history.jsonl'`
  ) as NodeJS.ErrnoException;
  err.code = 'EACCES';
  err.errno = -13;
  err.syscall = syscall;
  err.path = 'intero-history.jsonl';
  return err;
}

function enospc(): NodeJS.ErrnoException {
  const err = new Error(
    'ENOSPC: no space left on device, write'
  ) as NodeJS.ErrnoException;
  err.code = 'ENOSPC';
  err.errno = -28;
  err.syscall = 'write';
  return err;
}

const sampleInteroState: InteroState = {
  stress: 42,
  focus: 0.6,
  curiosity: 0.4,
  stressAxes: {
    hunger: 0.1,
    damage: 0.0,
    threat: 0.2,
    fatigue: 0.1,
    confinement: 0.0,
    timePressure: 0.0,
    socialLoad: 0.0,
    novelty: 0.0,
  } as any,
};

describe('intero-history.appendLine — filesystem error context', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    infoSpy.mockClear();
    debugSpy.mockClear();
    errorSpy.mockClear();
    statSync.mockReset();
    writeFileSync.mockReset();
    appendFileSync.mockReset();
    existsSync.mockReset();
    readFileSync.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs a warn with EACCES code/errno/syscall when appendFileSync fails', () => {
    // File doesn't exist yet → inner stat throws ENOENT (expected, silenced)
    statSync.mockImplementation(() => {
      throw enoent();
    });
    // The actual write fails with EACCES
    appendFileSync.mockImplementation(() => {
      throw eacces('open');
    });

    // Act: recording a snapshot triggers appendLine internally.
    recordInteroSnapshot(sampleInteroState, 'neutral');

    // Assert: the outer catch logged with full errno context.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message, context] = warnSpy.mock.calls[0];
    expect(message).toBe('Failed to append intero history line');
    expect(context).toMatchObject({
      event: 'intero_history_append_failed',
      tags: ['intero-history', 'warn'],
    });
    expect(context.fields.code).toBe('EACCES');
    expect(context.fields.errno).toBe(-13);
    expect(context.fields.syscall).toBe('open');
    expect(context.fields.path).toBe('intero-history.jsonl');
    expect(context.fields.message).toContain('permission denied');
    // The serialized line is still reported for forensic use.
    expect(typeof context.fields.line).toBe('string');
    expect(context.fields.line).toContain('"stress":42');
  });

  it('logs a warn with ENOSPC code/errno/syscall when the disk is full', () => {
    statSync.mockImplementation(() => {
      throw enoent();
    });
    appendFileSync.mockImplementation(() => {
      throw enospc();
    });

    recordInteroSnapshot(sampleInteroState, 'uneasy');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context.fields.code).toBe('ENOSPC');
    expect(context.fields.errno).toBe(-28);
    expect(context.fields.syscall).toBe('write');
  });

  it('propagates non-ENOENT stat errors to the outer catch (EACCES on stat)', () => {
    // The inner catch should ONLY swallow ENOENT. An EACCES on stat (e.g.
    // file exists but current user lost read permission) must reach the
    // outer catch and be logged with filesystem context.
    statSync.mockImplementation(() => {
      throw eacces('stat');
    });
    // If the fix is correct, appendFileSync is never reached because the
    // outer catch fires first. We still set a reasonable default so a
    // regression (swallowing all stat errors) would fall through here.
    appendFileSync.mockImplementation(() => {});

    recordInteroSnapshot(sampleInteroState, 'attentive');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [, context] = warnSpy.mock.calls[0];
    expect(context.fields.code).toBe('EACCES');
    expect(context.fields.syscall).toBe('stat');
    // And the append should have been short-circuited.
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  it('stays silent on the happy path (stat=ENOENT, append succeeds)', () => {
    statSync.mockImplementation(() => {
      throw enoent();
    });
    appendFileSync.mockImplementation(() => {
      /* success */
    });

    recordInteroSnapshot(sampleInteroState, 'neutral');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(appendFileSync).toHaveBeenCalledTimes(1);
  });
});

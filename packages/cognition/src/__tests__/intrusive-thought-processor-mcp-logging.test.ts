/**
 * Regression tests for IntrusiveThoughtProcessor MCP fallback logging.
 *
 * Validates that when optional MCP calls fail, the processor logs a warn
 * with the correct `event` / `tags` / `fields` shape before falling back to
 * default behavior — so operators can tell the difference between "MCP
 * unavailable" and "MCP rejected this option."
 *
 * Prior to the fix at `intrusive-thought-processor.ts:404` and `:560`,
 * both code paths swallowed errors silently via `.catch(() => null)`.
 *
 * Strategy: `vi.mock` the shared `server-logger` module so the
 * module-scoped `intrusiveLogger` captured at import time is backed by a
 * spy-able object, then exercise each fallback path with an injected MCP
 * client that rejects deterministically.
 *
 * @author @darianrosebrook
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// IMPORTANT: vi.mock is hoisted above the top of the file, so plain `const`
// declarations are still in the TDZ when the factory runs. vi.hoisted() is
// the documented escape hatch — it lets us declare spies that are themselves
// hoisted alongside the mock, so the factory can close over them safely.
const { warnSpy, debugSpy, infoSpy, errorSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../server-utils/server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

import { IntrusiveThoughtProcessor } from '../intrusive-thought-processor';

interface MockMCPClient {
  callTool: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  readResource: ReturnType<typeof vi.fn>;
}

function makeMCPClient(overrides: Partial<MockMCPClient> = {}): MockMCPClient {
  return {
    callTool: vi.fn().mockResolvedValue({ options: [] }),
    listTools: vi.fn().mockResolvedValue([]),
    readResource: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('IntrusiveThoughtProcessor — MCP fallback logging', () => {
  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
  });

  describe('selectBucket() — policy://buckets read failure', () => {
    it('logs a warn with `mcp_policy_read_failed` when readResource rejects, then returns a default bucket', async () => {
      const mcp = makeMCPClient({
        readResource: vi
          .fn()
          .mockRejectedValue(new Error('ECONNREFUSED: MCP down')),
      });

      const processor = new IntrusiveThoughtProcessor({
        planningEndpoint: 'http://localhost:3002',
        enablePlanningIntegration: false,
        mcp: mcp as any,
      });

      // Drive the private selectBucket() directly — it's the narrowest
      // seam to the code path we fixed. Any option-kind plan yields a
      // Short bucket by default.
      const plan = { kind: 'option', id: 'noop' } as const;
      const bucket = await (processor as any).selectBucket(plan);

      // 1. The fallback still works.
      expect(bucket).toEqual({ name: 'Short', maxMs: 240_000 });
      // 2. The MCP call was actually attempted.
      expect(mcp.readResource).toHaveBeenCalledWith('policy://buckets');
      // 3. The warn log fired with the exact observability contract.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('MCP policy://buckets read failed');
      expect(context).toMatchObject({
        event: 'mcp_policy_read_failed',
        tags: ['mcp', 'policy', 'warn'],
      });
      expect(context.fields.error).toContain('ECONNREFUSED: MCP down');
    });

    it('does NOT log a warn on the happy path (MCP returns a valid policy)', async () => {
      const mcp = makeMCPClient({
        readResource: vi.fn().mockResolvedValue({
          Tactical: { maxMs: 60_000 },
          Short: { maxMs: 240_000 },
          Standard: { maxMs: 600_000 },
          Long: { maxMs: 1_500_000 },
        }),
      });

      const processor = new IntrusiveThoughtProcessor({
        planningEndpoint: 'http://localhost:3002',
        enablePlanningIntegration: false,
        mcp: mcp as any,
      });

      const plan = { kind: 'option', id: 'noop' } as const;
      await (processor as any).selectBucket(plan);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('choosePlan() — register_option failure', () => {
    it('logs a warn with `mcp_register_option_failed` when register_option rejects, then returns a shadow proposal', async () => {
      // We need `list_options` to return no match (so the processor falls
      // through to proposal), `listTools` to return a harmless leaf set
      // (so the sequence path is also skipped), and `register_option` to
      // reject with the error we want to see in logs.
      const mcp = makeMCPClient({
        callTool: vi.fn().mockImplementation((name: string) => {
          if (name === 'list_options') return Promise.resolve({ options: [] });
          if (name === 'register_option')
            return Promise.reject(new Error('policy violation: budget'));
          return Promise.resolve({});
        }),
        listTools: vi.fn().mockResolvedValue([]),
      });

      const processor = new IntrusiveThoughtProcessor({
        planningEndpoint: 'http://localhost:3002',
        enablePlanningIntegration: false,
        mcp: mcp as any,
      });

      // Stub proposeBTOption so choosePlan reaches the register_option call
      // with a known spec rather than depending on whatever the default
      // proposal logic produces.
      (processor as any).proposeBTOption = vi.fn().mockResolvedValue({
        id: 'bt-opt-test',
        version: '1.0.0',
      });

      const action = {
        type: 'explore',
        target: 'cave',
        priority: 'low' as const,
        category: 'exploration',
      };

      const plan = await (processor as any).choosePlan(action, {});

      // 1. Falls back to a shadow proposal ticket (original behavior).
      expect(plan).toEqual({
        kind: 'proposal',
        ticket: 'bt-opt-test@1.0.0',
        status: 'shadow',
      });
      // 2. register_option was attempted with the stubbed spec.
      expect(mcp.callTool).toHaveBeenCalledWith('register_option', {
        id: 'bt-opt-test',
        version: '1.0.0',
      });
      // 3. The warn log fired with the correct observability contract.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('MCP register_option failed');
      expect(context).toMatchObject({
        event: 'mcp_register_option_failed',
        tags: ['mcp', 'register-option', 'warn'],
      });
      expect(context.fields.error).toContain('policy violation: budget');
      expect(context.fields.specId).toBe('bt-opt-test');
      expect(context.fields.specVersion).toBe('1.0.0');
    });
  });
});

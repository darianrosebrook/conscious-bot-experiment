/**
 * Regression tests for ReActArbiter.reason() error-path logging.
 *
 * Complements react-arbiter-parse-logging.test.ts — that file drives
 * the private `parseReActResponse` directly via `(arbiter as any)`.
 * THIS file drives the public `reason()` method with a stubbed LLM
 * instance, exercising the four error/fallback branches inside
 * `reason()` that were migrated from `console.warn` / `console.error`
 * to structured `reactLogger` calls as part of item 4 of the cognition
 * error-handling audit:
 *
 *   1. `react_arbiter_no_tool_selected` — parser succeeded but produced
 *      an empty `selectedTool`. Happens when the LLM returns prose with
 *      no Tool/Action label and no fuzzy-matchable tool name.
 *
 *   2. `react_arbiter_unknown_tool` — parser produced a tool name that
 *      is NOT in the registry, but a fuzzy match is attempted.
 *
 *   3. `react_arbiter_no_fuzzy_match` — unknown tool AND no fuzzy match
 *      in the registry. Falls through to chat fallback.
 *
 *   4. `react_arbiter_reason_failed` — `callLLM` rethrew (LLM rejected),
 *      caught by the outer try/catch in `reason()`. NOTE: this branch
 *      ALSO causes `react_arbiter_llm_call_failed` to fire from the
 *      inner `callLLM` wrapper, so a single LLM rejection produces two
 *      structured logs. This dual-log behavior is pre-existing (the old
 *      `console.error` code also double-logged) and intentional for
 *      now — the test fences it rather than papering over it.
 *
 * Plus two more exercised via public methods:
 *
 *   5. `react_arbiter_reflection_failed` — `reflect()` rethrow path.
 *      ALSO dual-logs because `reflect()` goes through the same
 *      `callLLM` wrapper as `reason()`. Fenced by the same
 *      "expect both logs" assertion pattern.
 *   6. `react_arbiter_task_steps_failed` — `generateTaskSteps()` rethrow.
 *      SINGLE-log because `generateTaskSteps()` calls
 *      `this.llm.generateResponse(...)` directly, bypassing `callLLM`.
 *      This asymmetry is pre-existing and the test documents it.
 *
 * Strategy: `vi.hoisted + vi.mock('../../server-utils/server-logger')`
 * captures the module-scoped `reactLogger` spy at import time. Each
 * test then instantiates a fresh `ReActArbiter` and replaces
 * `(arbiter as any).llm` with a one-method fake
 * `{ generateResponse: vi.fn() }` so the test can deterministically
 * drive the LLM's return value or rejection.
 *
 * @author @darianrosebrook
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { warnSpy, debugSpy, infoSpy, errorSpy } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  debugSpy: vi.fn(),
  infoSpy: vi.fn(),
  errorSpy: vi.fn(),
}));

vi.mock('../../server-utils/server-logger', () => ({
  createServerLogger: () => ({
    debug: debugSpy,
    info: infoSpy,
    warn: warnSpy,
    error: errorSpy,
  }),
}));

import { ReActArbiter, type ReActContext } from '../ReActArbiter';

const defaultConfig = {
  provider: 'test',
  model: 'test-model',
  temperature: 0.3,
  maxTokens: 500,
  timeout: 5000,
  retries: 0,
};

/**
 * Build a minimal ReActContext that satisfies the reason() signature
 * without needing a real world snapshot or inventory. The real reason()
 * method passes context.task into the audit logger and into some of
 * the log fields, so we include a task title to fence that.
 */
function makeContext(overrides: Partial<ReActContext> = {}): ReActContext {
  return {
    snapshot: {
      stateId: 'test-snapshot',
      position: { x: 0, y: 64, z: 0 },
      biome: 'plains',
      time: 6000,
      light: 15,
      hazards: [],
      nearbyEntities: [],
      nearbyBlocks: [],
      weather: 'clear',
    },
    inventory: {
      stateId: 'test-inventory',
      items: [],
      armor: [],
      tools: [],
    },
    goalStack: [],
    memorySummaries: [],
    task: {
      title: 'test task',
      description: 'a task for testing',
      type: 'test',
    },
    ...overrides,
  } as ReActContext;
}

/**
 * Build a fake LLMResponse that matches the shape returned by the
 * real `generateResponse`. The helper takes the text and fills in
 * opaque metadata so `reason()` can parse it.
 */
function makeLlmResponse(text: string) {
  return {
    id: 'test-response',
    text,
    model: 'test-model',
    tokensUsed: 10,
    latency: 100,
    confidence: 0.8,
    metadata: {
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    },
  };
}

describe('ReActArbiter.reason() — error-path logging', () => {
  let arbiter: ReActArbiter;

  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
    arbiter = new ReActArbiter(defaultConfig as any);
  });

  describe('react_arbiter_no_tool_selected (empty tool branch)', () => {
    it('fires warn with event + tags + fields when parser yields empty selectedTool', async () => {
      // LLM returns text that the parser cannot extract a tool from.
      // Strategy 1 (JSON) finds no `{...}` block, strategy 2 finds no
      // `Tool:` label, strategy 3 finds no registered tool name in the
      // text. Result: selectedTool === '' → the no-tool-selected branch
      // fires.
      const llm = {
        generateResponse: vi
          .fn()
          .mockResolvedValue(makeLlmResponse('just some thinking out loud')),
      };
      (arbiter as any).llm = llm;

      const step = await arbiter.reason(makeContext());

      // Fallback shape: chat tool, channel: 'system'.
      expect(step.selectedTool).toBe('chat');
      expect(step.args.channel).toBe('system');

      // Exactly one warn, with the no-tool-selected event.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('No tool selected');
      expect(context).toMatchObject({
        event: 'react_arbiter_no_tool_selected',
        tags: ['react-arbiter', 'fallback', 'warn'],
      });
      // Task title is included in the field for operational debugging.
      expect(context.fields.taskTitle).toBe('test task');

      // No error or unknown-tool logs in this branch.
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('react_arbiter_unknown_tool + react_arbiter_no_fuzzy_match', () => {
    it('fires both warns when parser produces an unknown tool with no fuzzy match', async () => {
      // "xyzzy_unknown" is chosen specifically because it does NOT
      // substring-match ANY registered tool name. Registered tools:
      // find_blocks, pathfind, dig, place, craft, smelt,
      // query_inventory, waypoint, sense_hostiles, chat. None of those
      // contain "xyzzy" or "unknown", and "xyzzy_unknown" doesn't
      // contain any of them (dig is 3 letters but 'dig' not a substring
      // of 'xyzzy_unknown'). Fuzzy match will fail, both warns fire.
      const llm = {
        generateResponse: vi
          .fn()
          .mockResolvedValue(
            makeLlmResponse('Tool: xyzzy_unknown\nArgs: {}')
          ),
      };
      (arbiter as any).llm = llm;

      const step = await arbiter.reason(makeContext());

      // Fuzzy fallback lands on chat (the registry fallback).
      expect(step.selectedTool).toBe('chat');

      // Two warns: unknown_tool first, then no_fuzzy_match.
      expect(warnSpy).toHaveBeenCalledTimes(2);

      const [unknownMsg, unknownCtx] = warnSpy.mock.calls[0];
      expect(unknownMsg).toContain('Unknown tool');
      expect(unknownCtx).toMatchObject({
        event: 'react_arbiter_unknown_tool',
        tags: ['react-arbiter', 'fuzzy-match', 'warn'],
      });
      expect(unknownCtx.fields.requestedTool).toBe('xyzzy_unknown');

      const [noMatchMsg, noMatchCtx] = warnSpy.mock.calls[1];
      expect(noMatchMsg).toContain('No fuzzy match');
      expect(noMatchCtx).toMatchObject({
        event: 'react_arbiter_no_fuzzy_match',
        tags: ['react-arbiter', 'fallback', 'warn'],
      });
      expect(noMatchCtx.fields.requestedTool).toBe('xyzzy_unknown');
      // The registry has 10 tools; the field reflects that.
      expect(noMatchCtx.fields.availableToolCount).toBeGreaterThanOrEqual(5);
    });

    it('fires ONLY react_arbiter_unknown_tool when fuzzy match succeeds', async () => {
      // "di" is a substring of "dig" (registered), so fuzzy match
      // succeeds and the no_fuzzy_match branch is NOT taken.
      const llm = {
        generateResponse: vi
          .fn()
          .mockResolvedValue(makeLlmResponse('Tool: di\nArgs: {}')),
      };
      (arbiter as any).llm = llm;

      const step = await arbiter.reason(makeContext());

      // Fuzzy match succeeded — should land on dig.
      expect(step.selectedTool).toBe('dig');

      // Only ONE warn this time: react_arbiter_unknown_tool.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [, context] = warnSpy.mock.calls[0];
      expect(context).toMatchObject({
        event: 'react_arbiter_unknown_tool',
      });
      // Critical: no_fuzzy_match did NOT fire because fuzzy succeeded.
      const events = warnSpy.mock.calls.map((call) => call[1]?.event);
      expect(events).not.toContain('react_arbiter_no_fuzzy_match');
    });
  });

  describe('react_arbiter_reason_failed + react_arbiter_llm_call_failed (dual-log)', () => {
    it('fires BOTH error logs when the LLM rejects inside reason()', async () => {
      // Intentionally documents the pre-existing dual-log behavior:
      // callLLM's inner try/catch logs `react_arbiter_llm_call_failed`
      // and rethrows; reason's outer try/catch logs
      // `react_arbiter_reason_failed` and falls back to chat. This
      // test fences BOTH logs — if a future refactor consolidates to
      // one, update this test and the helper comments at the top of
      // ReActArbiter.ts.
      const boom = new Error('LLM backend 503');
      const llm = {
        generateResponse: vi.fn().mockRejectedValue(boom),
      };
      (arbiter as any).llm = llm;

      // reason() should NOT throw — it catches and returns a chat fallback.
      const step = await arbiter.reason(makeContext());
      expect(step.selectedTool).toBe('chat');
      expect(step.thoughts).toContain('Error during reasoning');

      // Two errors: llm_call_failed first (inner), reason_failed second (outer).
      expect(errorSpy).toHaveBeenCalledTimes(2);

      const [innerMsg, innerCtx] = errorSpy.mock.calls[0];
      expect(innerMsg).toContain('LLM call failed');
      expect(innerCtx).toMatchObject({
        event: 'react_arbiter_llm_call_failed',
        tags: ['react-arbiter', 'llm', 'error'],
      });
      expect(innerCtx.fields.error).toBe('LLM backend 503');
      expect(innerCtx.fields.errorName).toBe('Error');

      const [outerMsg, outerCtx] = errorSpy.mock.calls[1];
      expect(outerMsg).toContain('ReAct reasoning failed');
      expect(outerCtx).toMatchObject({
        event: 'react_arbiter_reason_failed',
        tags: ['react-arbiter', 'reason', 'error'],
      });
      expect(outerCtx.fields.error).toBe('LLM backend 503');
      expect(outerCtx.fields.taskTitle).toBe('test task');

      // No warns in this pure-error path.
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('happy path — no logs', () => {
    it('does not emit any warn or error when reason() succeeds with a valid tool', async () => {
      const llm = {
        generateResponse: vi.fn().mockResolvedValue(
          makeLlmResponse('Tool: chat\nArgs: {"message": "hello"}')
        ),
      };
      (arbiter as any).llm = llm;

      const step = await arbiter.reason(makeContext());

      expect(step.selectedTool).toBe('chat');
      expect(step.args).toEqual({ message: 'hello' });

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});

describe('ReActArbiter.reflect() — error-path logging', () => {
  let arbiter: ReActArbiter;

  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
    arbiter = new ReActArbiter(defaultConfig as any);
  });

  it('fires BOTH react_arbiter_llm_call_failed and react_arbiter_reflection_failed when the LLM rejects', async () => {
    // reflect() calls the private `this.callLLM(...)` wrapper (not
    // `this.llm.generateResponse` directly), so a rejection produces
    // the same dual-log pattern as reason():
    //
    //   1. callLLM's inner catch logs `react_arbiter_llm_call_failed`
    //      and rethrows
    //   2. reflect's outer catch logs `react_arbiter_reflection_failed`
    //      and rethrows to the caller
    //
    // This is pre-existing behavior (the old console.error code also
    // double-logged via callLLM + the rethrow path) and is documented
    // here so any future consolidation is a conscious decision that
    // requires updating this test.
    const boom = new Error('reflection LLM timeout');
    const llm = {
      generateResponse: vi.fn().mockRejectedValue(boom),
    };
    (arbiter as any).llm = llm;

    // reflect() rethrows (unlike reason(), which returns a fallback).
    await expect(
      arbiter.reflect([], 'failure', ['something went wrong'])
    ).rejects.toThrow('reflection LLM timeout');

    // Two error logs: inner llm_call_failed, outer reflection_failed.
    expect(errorSpy).toHaveBeenCalledTimes(2);

    const [innerMsg, innerCtx] = errorSpy.mock.calls[0];
    expect(innerMsg).toContain('LLM call failed');
    expect(innerCtx).toMatchObject({
      event: 'react_arbiter_llm_call_failed',
      tags: ['react-arbiter', 'llm', 'error'],
    });
    expect(innerCtx.fields.error).toBe('reflection LLM timeout');
    expect(innerCtx.fields.errorName).toBe('Error');

    const [outerMsg, outerCtx] = errorSpy.mock.calls[1];
    expect(outerMsg).toContain('Reflection generation failed');
    expect(outerCtx).toMatchObject({
      event: 'react_arbiter_reflection_failed',
      tags: ['react-arbiter', 'reflection', 'error'],
    });
    expect(outerCtx.fields.error).toBe('reflection LLM timeout');
    expect(outerCtx.fields.errorName).toBe('Error');
    expect(outerCtx.fields.outcome).toBe('failure');
  });
});

describe('ReActArbiter.generateTaskSteps() — error-path logging', () => {
  let arbiter: ReActArbiter;

  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
    arbiter = new ReActArbiter(defaultConfig as any);
  });

  it('fires react_arbiter_task_steps_failed and rethrows when the LLM rejects', async () => {
    const boom = new Error('task step LLM error');
    const llm = {
      generateResponse: vi.fn().mockRejectedValue(boom),
    };
    (arbiter as any).llm = llm;

    await expect(
      arbiter.generateTaskSteps({ title: 'build a house' })
    ).rejects.toThrow('task step LLM error');

    // Single error log — same direct-llm pattern as reflect().
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, context] = errorSpy.mock.calls[0];
    expect(message).toContain('Task step generation failed');
    expect(context).toMatchObject({
      event: 'react_arbiter_task_steps_failed',
      tags: ['react-arbiter', 'task-steps', 'error'],
    });
    expect(context.fields.error).toBe('task step LLM error');
    expect(context.fields.taskTitle).toBe('build a house');
  });
});

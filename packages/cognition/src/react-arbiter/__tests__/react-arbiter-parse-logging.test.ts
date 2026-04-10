/**
 * Regression tests for ReActArbiter.parseReActResponse error-path logging.
 *
 * Validates that when LLM-returned text contains malformed JSON (or
 * malformed args inside a key=value line), the structured logger fires
 * with the correct `event` / `tags` / `fields` shape. Prior to the fix
 * at ReActArbiter.ts:398 and :424, both parse failures were logged via
 * `console.warn` with unstructured strings that bypassed the
 * observability pipeline.
 *
 * Strategy: `vi.hoisted + vi.mock('../../server-utils/server-logger')`
 * captures a spy for the module-scoped `reactLogger` at import time,
 * then exercise `parseReActResponse` (private, reached via `as any`)
 * with hand-crafted LLM text that deterministically drives each catch.
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

import { ReActArbiter } from '../ReActArbiter';

const defaultConfig = {
  provider: 'test',
  model: 'test-model',
  temperature: 0.3,
  maxTokens: 500,
  timeout: 5000,
  retries: 0,
};

describe('ReActArbiter — parseReActResponse error-path logging', () => {
  let arbiter: ReActArbiter;

  beforeEach(() => {
    warnSpy.mockClear();
    debugSpy.mockClear();
    infoSpy.mockClear();
    errorSpy.mockClear();
    arbiter = new ReActArbiter(defaultConfig as any);
  });

  describe('Strategy 1 — JSON extraction failure', () => {
    it('logs `react_arbiter_json_parse_failed` when the {…} block is malformed', () => {
      // This response passes the outer `/\{[\s\S]*\}/` regex match but
      // contains invalid JSON inside the braces. parseReActResponse
      // will enter the try block, hit SyntaxError on JSON.parse, and
      // fall through to strategy 2 (line-by-line parsing).
      const malformed =
        'Some reasoning here. { not valid json: missing quotes }\nTool: chat\nArgs: {}';

      const result = (arbiter as any).parseReActResponse(malformed);

      // 1. The fallback still works — strategy 2 extracts the tool name.
      expect(result.selectedTool).toBe('chat');
      // 2. The warn log fired exactly once with the correct contract.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('ReAct JSON parsing failed');
      expect(context).toMatchObject({
        event: 'react_arbiter_json_parse_failed',
        tags: ['react-arbiter', 'parse', 'warn'],
      });
      // 3. The response snippet is truncated for forensic use.
      expect(typeof context.fields.error).toBe('string');
      expect(typeof context.fields.responseSnippet).toBe('string');
      expect(context.fields.responseSnippet.length).toBeLessThanOrEqual(200);
      expect(context.fields.responseSnippet).toContain('not valid json');
    });

    it('does NOT log when the JSON block is valid', () => {
      // A well-formed JSON with a `tool` field — strategy 1 should
      // succeed and return without reaching any catch.
      const wellFormed = '{"tool": "chat", "args": {"message": "hello"}}';

      const result = (arbiter as any).parseReActResponse(wellFormed);

      expect(result.selectedTool).toBe('chat');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Strategy 2 — args parse failure', () => {
    it('logs `react_arbiter_args_parse_failed` when an args line contains malformed JSON', () => {
      // No top-level JSON block, so strategy 1 is skipped entirely.
      // Strategy 2 walks lines; the "Args:" line here has invalid JSON
      // after the colon, which hits the inner catch at line 424.
      const responseWithBadArgs = [
        'Tool: dig_block',
        'Args: {not-valid-json',
        'Thinking about it...',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(responseWithBadArgs);

      // Tool is still extracted from the Tool: line.
      expect(result.selectedTool).toBe('dig_block');
      // Args remains the default empty object because the parse failed.
      expect(result.args).toEqual({});
      // The warn log fired with the correct contract.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [message, context] = warnSpy.mock.calls[0];
      expect(message).toContain('ReAct failed to parse args from line');
      expect(context).toMatchObject({
        event: 'react_arbiter_args_parse_failed',
        tags: ['react-arbiter', 'parse', 'warn'],
      });
      expect(typeof context.fields.error).toBe('string');
      expect(typeof context.fields.line).toBe('string');
      expect(context.fields.line.length).toBeLessThanOrEqual(200);
      expect(context.fields.line).toContain('not-valid-json');
    });

    it('does NOT log when the args line is valid JSON (regression guard for line-parser colon-split bug)', () => {
      // Historical bug: `trimmed.split(':')[1]` split on every colon,
      // so an args line like `Args: {"x": 1}` was truncated at the
      // inner colon and became unparseable — every valid args line
      // spuriously triggered react_arbiter_args_parse_failed. The fix
      // at ReActArbiter.ts:427 uses indexOf(':') + slice to take
      // everything after the FIRST colon, which is the correct
      // boundary between the `Args:` label and its JSON value. This
      // test would have failed (warnSpy called 1 time) before the
      // fix — keep it as a regression fence.
      const responseWithGoodArgs = [
        'Tool: dig_block',
        'Args: {"x": 1, "y": 2, "z": 3}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(responseWithGoodArgs);

      expect(result.selectedTool).toBe('dig_block');
      // The args should round-trip exactly, proving the full JSON
      // payload reached JSON.parse instead of being truncated.
      expect(result.args).toEqual({ x: 1, y: 2, z: 3 });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

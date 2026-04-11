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

  describe('Strategy 2 — tool name colon-split regression', () => {
    it('extracts colon-containing tool names without truncation', () => {
      // Historical bug (sibling of the args-line bug): the Tool: label
      // used `trimmed.split(':')[1]?.trim()`, which splits on EVERY
      // colon. A legitimately colon-containing tool name like
      // `mcp:filesystem:write` (namespaced MCP tool names are legal)
      // would be silently truncated to `mcp` before the registry
      // lookup, causing every colon-named tool to fall through to
      // fuzzy-match. The fix at ReActArbiter.ts:427 uses
      // indexOf(':') + slice to take everything after the FIRST colon.
      //
      // This test drives parseReActResponse with a colon-containing
      // tool name in the Tool: line and asserts the full name
      // reaches `selectedTool` instead of being truncated at the
      // first inner colon.
      const responseWithColonTool = [
        'Tool: mcp:filesystem:write',
        'Args: {"path": "/tmp/test.txt", "content": "hello"}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithColonTool
      );

      // Before the fix: selectedTool === 'mcp' (truncated).
      // After the fix: selectedTool === 'mcp:filesystem:write' (full).
      expect(result.selectedTool).toBe('mcp:filesystem:write');
      // And args should also round-trip correctly — verifies the two
      // colon-split fixes work together on the same response.
      expect(result.args).toEqual({
        path: '/tmp/test.txt',
        content: 'hello',
      });
      // Neither of the two parse paths should have logged.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still handles simple (no-colon) tool names correctly', () => {
      // Negative regression check — make sure the indexOf(':') + slice
      // change didn't break the common case of a tool name with no
      // internal colons.
      const responseWithSimpleTool = [
        'Tool: chat',
        'Args: {"message": "hello world"}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithSimpleTool
      );

      expect(result.selectedTool).toBe('chat');
      expect(result.args).toEqual({ message: 'hello world' });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Strategy 2 — prose-substring false match regression', () => {
    // Historical bug: `trimmed.toLowerCase().includes('tool:')` matched
    // any prose line containing the substring "tool:" — e.g.,
    //
    //   "I think the right tool: for this is the axe"
    //
    // would be treated as a Tool: label line, indexOf(':') would point
    // at the colon after "tool", and `slice(colonIdx + 1).trim()` would
    // extract "for this is the axe" as selectedTool. That's a false
    // positive that sends prose into the tool-registry path and silently
    // selects a garbage tool (or falls through to chat fallback) even
    // when the LLM never intended to emit a tool label.
    //
    // Fix: anchor the label match to the start of the line with
    // `/^(tool|action):/i`. Similar fix for args/parameters.
    //
    // These tests would have failed before the fix — every one either
    // selects the wrong tool, selects an empty string, or emits a
    // spurious warn.

    it('ignores prose containing "tool:" as a substring mid-sentence', () => {
      // Prose line that has "tool:" somewhere after whitespace. The old
      // .includes() match would split at the first colon and extract
      // "for this is the axe" as selectedTool.
      const responseWithProse = [
        'Reasoning: I think the right tool: for this is the axe.',
        'Tool: chat',
        'Args: {"message": "hi"}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(responseWithProse);

      // The ONLY valid Tool: label is the second line. The first line
      // starts with "Reasoning:" (not "tool:" or "action:") and should
      // be treated as prose — contributing to thoughts, not overriding
      // selectedTool.
      expect(result.selectedTool).toBe('chat');
      expect(result.args).toEqual({ message: 'hi' });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('ignores prose containing "action:" as a substring mid-sentence', () => {
      // Same regression guard for the `action:` alternation branch.
      const responseWithActionProse = [
        'My next action: depends on what I see.',
        'Tool: chat',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithActionProse
      );

      expect(result.selectedTool).toBe('chat');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still matches a line starting with "Action:" (the alternation branch)', () => {
      // Positive control for the `/^(tool|action):/i` alternation —
      // a line that starts with "Action: <name>" should still select
      // that tool, because the original code supported Action: as an
      // alias for Tool:. If my regex dropped the alternation, this
      // test would fail with selectedTool === '' (empty).
      const responseWithActionLabel = ['Action: chat'].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithActionLabel
      );

      expect(result.selectedTool).toBe('chat');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('is case-insensitive on the label (matches "tool:" and "TOOL:")', () => {
      // The regex uses /i so it should match any case. Fence against a
      // refactor that drops the /i flag.
      const lowerResponse = ['tool: chat'].join('\n');
      const upperResponse = ['TOOL: chat'].join('\n');

      const lowerResult = (arbiter as any).parseReActResponse(lowerResponse);
      const upperResult = (arbiter as any).parseReActResponse(upperResponse);

      expect(lowerResult.selectedTool).toBe('chat');
      expect(upperResult.selectedTool).toBe('chat');
    });

    it('ignores prose containing "args:" as a substring mid-sentence', () => {
      // The same prose-substring bug applied to the args/parameters
      // branch. Before the fix, a prose line like
      //   "Here are my args: I want to dig"
      // would be treated as an Args: line, JSON.parse would throw on
      // "I want to dig", and a spurious react_arbiter_args_parse_failed
      // warn would fire. The new ARGS_LABEL_RE anchors to line start
      // and rejects prose.
      const responseWithArgsProse = [
        'Tool: chat',
        'Some reasoning here. The args: I want to send are simple.',
        'Args: {"message": "hi"}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithArgsProse
      );

      // Only the third line is a real Args: label. It parses fine.
      expect(result.selectedTool).toBe('chat');
      expect(result.args).toEqual({ message: 'hi' });
      // Critical: the prose line must NOT have triggered a parse error.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still matches a line starting with "Parameters:" (the args alternation branch)', () => {
      // Positive control for the `/^(args|parameters):/i` alternation.
      // If my regex dropped the `parameters` branch (e.g., became
      // `/^args:/i`), this test would fail with args === {} because
      // the line would fall through as prose.
      const responseWithParamsLabel = [
        'Tool: chat',
        'Parameters: {"message": "hi"}',
      ].join('\n');

      const result = (arbiter as any).parseReActResponse(
        responseWithParamsLabel
      );

      expect(result.selectedTool).toBe('chat');
      expect(result.args).toEqual({ message: 'hi' });
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

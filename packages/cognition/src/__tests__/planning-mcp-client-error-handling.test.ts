/**
 * Regression tests for PlanningMCPClient error handling.
 *
 * Validates that when the MCP HTTP endpoint returns a 200 OK with a malformed
 * JSON body, the client rethrows a descriptive error with the original
 * SyntaxError attached as `cause`. Prior to the fix at
 * `intrusive-thought-processor.ts:109/124/140`, a parse failure on
 * `response.json()` would bubble up as a bare `SyntaxError` with no endpoint
 * context, making post-mortems difficult.
 *
 * @author @darianrosebrook
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanningMCPClient } from '../intrusive-thought-processor';

function makeMalformedResponse(): Response {
  // Response.ok === true, but .json() rejects with SyntaxError —
  // the exact shape of a proxy returning a truncated JSON body.
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
  } as unknown as Response;
}

function makeSuccessResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('PlanningMCPClient — response.json() error handling', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset between tests
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('callTool()', () => {
    it('throws a descriptive Error (with cause) when response body is malformed JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeMalformedResponse()
      );

      const client = new PlanningMCPClient('http://test-mcp');

      let caught: unknown;
      try {
        await client.callTool('register_option', { foo: 'bar' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        'MCP tool register_option returned invalid JSON'
      );
      // The original SyntaxError must be preserved as `cause` so operators
      // can see "Unexpected end of JSON input" in logs alongside the
      // endpoint context.
      expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
      expect(((caught as Error).cause as Error).message).toBe(
        'Unexpected end of JSON input'
      );
    });

    it('still resolves normally when the body is valid JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSuccessResponse({ data: { ok: true, optionId: 'abc' } })
      );

      const client = new PlanningMCPClient('http://test-mcp');
      const result = await client.callTool<{ ok: boolean; optionId: string }>(
        'register_option',
        {}
      );

      expect(result).toEqual({ ok: true, optionId: 'abc' });
    });
  });

  describe('listTools()', () => {
    it('throws a descriptive Error (with cause) when response body is malformed JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeMalformedResponse()
      );

      const client = new PlanningMCPClient('http://test-mcp');

      let caught: unknown;
      try {
        await client.listTools();
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        'MCP listTools returned invalid JSON'
      );
      expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
    });

    it('returns tool names when the body is valid JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSuccessResponse({
          tools: [{ name: 'dig_block' }, { name: 'move_to' }],
        })
      );

      const client = new PlanningMCPClient('http://test-mcp');
      const names = await client.listTools();

      expect(names).toEqual(['dig_block', 'move_to']);
    });
  });

  describe('readResource()', () => {
    it('throws a descriptive Error (with cause) when response body is malformed JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeMalformedResponse()
      );

      const client = new PlanningMCPClient('http://test-mcp');

      let caught: unknown;
      try {
        await client.readResource('policy://buckets');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        'MCP resource policy://buckets returned invalid JSON'
      );
      expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
    });

    it('returns the resource body when the body is valid JSON', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeSuccessResponse({ data: { Tactical: { maxMs: 60_000 } } })
      );

      const client = new PlanningMCPClient('http://test-mcp');
      const result = await client.readResource<{
        Tactical: { maxMs: number };
      }>('policy://buckets');

      expect(result).toEqual({ Tactical: { maxMs: 60_000 } });
    });
  });

  describe('non-OK response path (unchanged behavior regression guard)', () => {
    it('still throws the HTTP-status error on !response.ok without touching .json()', async () => {
      const jsonSpy = vi.fn();
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 502,
        json: jsonSpy,
      } as unknown as Response);

      const client = new PlanningMCPClient('http://test-mcp');

      await expect(client.callTool('foo', {})).rejects.toThrow(
        'MCP tool call failed: 502'
      );
      // Confirms the JSON-parse try/catch is ordered after the ok-check and
      // does not eagerly consume the body on error responses.
      expect(jsonSpy).not.toHaveBeenCalled();
    });
  });
});

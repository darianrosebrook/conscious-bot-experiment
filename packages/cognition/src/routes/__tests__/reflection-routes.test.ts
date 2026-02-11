/**
 * Tests for reflection-routes.ts
 *
 * Validates:
 * - parseReflectionOutput: structured LLM output parsing
 * - parseReflectionOutput: fallback when parsing fails
 * - POST /generate-reflection: LLM success path
 * - POST /generate-reflection: LLM timeout → placeholder fallback
 * - POST /generate-reflection: feature flag disabled → placeholder
 * - POST /generate-reflection: missing required fields → 400
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createReflectionRoutes, parseReflectionOutput } from '../reflection-routes';
import type { LLMInterface } from '../../cognitive-core/llm-interface';

// ── parseReflectionOutput ──────────────────────────────────────────────

describe('parseReflectionOutput', () => {
  it('parses well-formed structured output', () => {
    const raw = [
      'REFLECTION: I died from a creeper explosion near the cave.',
      'INSIGHTS: Creepers are silent, Need better awareness',
      'LESSONS: Always keep shield ready, Light up cave entrances',
      'MOOD: -0.6',
    ].join('\n');

    const result = parseReflectionOutput(raw);

    expect(result.reflection).toBe(
      'I died from a creeper explosion near the cave.'
    );
    expect(result.insights).toEqual([
      'Creepers are silent',
      'Need better awareness',
    ]);
    expect(result.lessons).toEqual([
      'Always keep shield ready',
      'Light up cave entrances',
    ]);
    expect(result.mood).toBeCloseTo(-0.6);
  });

  it('treats "none" as empty list', () => {
    const raw = [
      'REFLECTION: Slept through the night peacefully.',
      'INSIGHTS: none',
      'LESSONS: none',
      'MOOD: 0.3',
    ].join('\n');

    const result = parseReflectionOutput(raw);

    expect(result.reflection).toBe('Slept through the night peacefully.');
    expect(result.insights).toEqual([]);
    expect(result.lessons).toEqual([]);
    expect(result.mood).toBeCloseTo(0.3);
  });

  it('falls back to raw text when no markers found', () => {
    const raw = 'Just some unstructured LLM rambling about death.';

    const result = parseReflectionOutput(raw);

    expect(result.reflection).toBe(raw);
    expect(result.insights).toEqual([]);
    expect(result.lessons).toEqual([]);
    expect(result.mood).toBe(0);
  });

  it('clamps mood to [-1, 1] range', () => {
    const rawHigh = 'REFLECTION: test\nMOOD: 5.0';
    expect(parseReflectionOutput(rawHigh).mood).toBe(1);

    const rawLow = 'REFLECTION: test\nMOOD: -3.0';
    expect(parseReflectionOutput(rawLow).mood).toBe(-1);
  });
});

// ── Route integration ──────────────────────────────────────────────────

function createMockLLM(
  overrides?: Partial<LLMInterface>
): LLMInterface {
  return {
    generateResponse: vi.fn().mockResolvedValue({
      id: 'test-id',
      text: [
        'REFLECTION: I was overwhelmed by zombies.',
        'INSIGHTS: Night is dangerous',
        'LESSONS: Build shelter before dusk',
        'MOOD: -0.4',
      ].join('\n'),
      model: 'test-model',
      tokensUsed: 42,
      confidence: 0.8,
    }),
    ...overrides,
  } as unknown as LLMInterface;
}

/** Helper: POST JSON to a running express server */
async function postJSON(
  server: http.Server,
  path: string,
  body: any
): Promise<{ status: number; body: any }> {
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

function createTestServer(llm: LLMInterface): http.Server {
  const app = express();
  app.use(express.json());
  app.use(createReflectionRoutes({ llmInterface: llm }));
  return app.listen(0); // random port
}

const VALID_REQUEST = {
  trigger: 'death-respawn',
  dedupeKey: 'death-10-64-20-5',
  context: {
    emotionalState: 'cautious',
    recentEvents: ['death'],
    currentGoals: [],
    location: { x: 10, y: 64, z: 20 },
    timeOfDay: 'night',
    deathCause: 'zombie',
  },
};

describe('POST /generate-reflection', () => {
  const origEnv = process.env.ENABLE_REFLECTION_GENERATION;
  let server: http.Server;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.ENABLE_REFLECTION_GENERATION;
    else process.env.ENABLE_REFLECTION_GENERATION = origEnv;
    if (server) server.close();
  });

  it('returns 400 when required fields are missing', async () => {
    server = createTestServer(createMockLLM());
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/generate-reflection', {
      trigger: 'death-respawn',
    }); // missing dedupeKey

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/);
  });

  it('generates LLM reflection on success', async () => {
    const mockLLM = createMockLLM();
    server = createTestServer(mockLLM);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/generate-reflection', VALID_REQUEST);

    expect(res.status).toBe(200);
    expect(res.body.generated).toBe(true);
    expect(res.body.isPlaceholder).toBe(false);
    expect(res.body.content).toBe('I was overwhelmed by zombies.');
    expect(res.body.insights).toEqual(['Night is dangerous']);
    expect(res.body.lessons).toEqual(['Build shelter before dusk']);
    expect(res.body.emotionalValence).toBeCloseTo(-0.4);
    expect(res.body.dedupeKey).toBe('death-10-64-20-5');
    expect(res.body.provenance.model).toBe('test-model');
    expect(res.body.provenance.tokensUsed).toBe(42);
  });

  it('returns placeholder when feature flag is disabled', async () => {
    process.env.ENABLE_REFLECTION_GENERATION = 'false';
    server = createTestServer(createMockLLM());
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/generate-reflection', VALID_REQUEST);

    expect(res.status).toBe(200);
    expect(res.body.generated).toBe(false);
    expect(res.body.isPlaceholder).toBe(true);
    expect(res.body.provenance.model).toBe('placeholder');
  });

  it('returns placeholder on LLM failure', async () => {
    const failLLM = createMockLLM({
      generateResponse: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    } as any);
    server = createTestServer(failLLM);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/generate-reflection', VALID_REQUEST);

    expect(res.status).toBe(200);
    expect(res.body.generated).toBe(false);
    expect(res.body.isPlaceholder).toBe(true);
    expect(res.body.content).toContain('zombie');
    expect(res.body.dedupeKey).toBe('death-10-64-20-5');
  });
});

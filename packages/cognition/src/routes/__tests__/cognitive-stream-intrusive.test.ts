/**
 * Tests for cognitive stream POST /api/cognitive-stream intrusive thought processing.
 *
 * Validates that dashboard-injected intrusive thoughts are forwarded to
 * IntrusiveThoughtProcessor so they become actionable tasks.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createCognitiveStreamRoutes } from '../cognitive-stream-routes';
import { createInitialState } from '../../cognition-state';
import type { EnhancedThoughtGenerator } from '../../thought-generator';

async function postJSON(
  server: http.Server,
  path: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const addr = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/cognitive-stream intrusive thought processing', () => {
  const mockProcessIntrusiveThought = vi.fn().mockImplementation(async () => ({
    accepted: true,
    response: 'Task created',
    task: { id: 'task-1', title: 'Craft wooden pickaxe', type: 'craft' },
  }));

  const mockProcessor = {
    processIntrusiveThought: mockProcessIntrusiveThought,
  };

  const mockEnhancedThoughtGenerator = {} as EnhancedThoughtGenerator;

  let server: http.Server;

  beforeEach(() => {
    mockProcessIntrusiveThought.mockClear();
  });

  afterEach(() => {
    if (server) server.close();
  });

  it('invokes IntrusiveThoughtProcessor when type is intrusive', async () => {
    const state = createInitialState();
    const app = express();
    app.use(express.json());
    app.use(
      createCognitiveStreamRoutes({
        state,
        enhancedThoughtGenerator: mockEnhancedThoughtGenerator,
        intrusiveThoughtProcessor: mockProcessor as any,
      })
    );
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/api/cognitive-stream', {
      type: 'intrusive',
      content: 'craft a wooden pickaxe',
      attribution: 'intrusive',
    });

    expect(res.status).toBe(200);
    expect((res.body as { success: boolean }).success).toBe(true);
    expect((res.body as { thoughtId: string }).thoughtId).toBeDefined();
    expect(mockProcessIntrusiveThought).toHaveBeenCalledTimes(1);
    expect(mockProcessIntrusiveThought).toHaveBeenCalledWith('craft a wooden pickaxe');
  });

  it('invokes IntrusiveThoughtProcessor when attribution is intrusive', async () => {
    const state = createInitialState();
    const app = express();
    app.use(express.json());
    app.use(
      createCognitiveStreamRoutes({
        state,
        enhancedThoughtGenerator: mockEnhancedThoughtGenerator,
        intrusiveThoughtProcessor: mockProcessor as any,
      })
    );
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/api/cognitive-stream', {
      content: 'mine some stone',
      attribution: 'intrusive',
    });

    expect(res.status).toBe(200);
    expect(mockProcessIntrusiveThought).toHaveBeenCalledWith('mine some stone');
  });

  it('does not invoke processor when content is empty', async () => {
    const state = createInitialState();
    const app = express();
    app.use(express.json());
    app.use(
      createCognitiveStreamRoutes({
        state,
        enhancedThoughtGenerator: mockEnhancedThoughtGenerator,
        intrusiveThoughtProcessor: mockProcessor as any,
      })
    );
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/api/cognitive-stream', {
      type: 'intrusive',
      content: '   ',
      attribution: 'intrusive',
    });

    expect(res.status).toBe(200);
    expect(mockProcessIntrusiveThought).not.toHaveBeenCalled();
  });

  it('stores and broadcasts thought even when not intrusive', async () => {
    const state = createInitialState();
    const app = express();
    app.use(express.json());
    app.use(
      createCognitiveStreamRoutes({
        state,
        enhancedThoughtGenerator: mockEnhancedThoughtGenerator,
        intrusiveThoughtProcessor: mockProcessor as any,
      })
    );
    server = app.listen(0);
    await new Promise<void>((r) => server.once('listening', r));

    const res = await postJSON(server, '/api/cognitive-stream', {
      type: 'reflection',
      content: 'I am reflecting on my day',
      attribution: 'self',
    });

    expect(res.status).toBe(200);
    expect(state.cognitiveThoughts).toHaveLength(1);
    expect(state.cognitiveThoughts[0].content).toBe('I am reflecting on my day');
    expect(mockProcessIntrusiveThought).not.toHaveBeenCalled();
  });
});

/**
 * Vitest setup for the planning package.
 *
 * Enforces test hermeticity by blocking outbound network requests by default.
 * Tests that explicitly need network access should mock fetch/WebSocket
 * before making calls.
 *
 * This prevents "my laptop happened to have services running" from becoming
 * an implicit test dependency.
 */

import { beforeAll, afterAll } from 'vitest';

const originalFetch = globalThis.fetch;

beforeAll(() => {
  // Block outbound fetch by default. Tests that need it should mock fetch
  // explicitly via vi.spyOn(globalThis, 'fetch').
  globalThis.fetch = (async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as { url: string }).url;
    throw new Error(
      `[HermeticityViolation] Unguarded fetch to "${url}" — ` +
      `tests must not make real network requests. ` +
      `Mock fetch via vi.spyOn(globalThis, 'fetch') or inject a stub.`
    );
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

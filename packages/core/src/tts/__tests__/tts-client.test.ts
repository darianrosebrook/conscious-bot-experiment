/**
 * TTSClient Unit Tests
 *
 * Tests fire-and-forget TTS behavior, circuit breaker, latest-wins,
 * sox detection, and graceful degradation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTSClient } from '../tts-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Track clients for cleanup. */
const activeClients: TTSClient[] = [];

/** Build a client with sox stubbed as available and fetch mocked globally. */
function createTestClient(
  overrides: ConstructorParameters<typeof TTSClient>[0] = {},
) {
  // Always pretend sox is available in tests (we don't want to spawn real sox)
  vi.spyOn(TTSClient, 'checkSoxAvailable').mockReturnValue(true);
  const client = new TTSClient({
    apiUrl: 'http://localhost:9999',
    enabled: true,
    ...overrides,
  });
  activeClients.push(client);
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TTSClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Destroy all clients to remove process listeners
    while (activeClients.length > 0) {
      activeClients.pop()!.destroy();
    }
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Config defaults
  // -------------------------------------------------------------------------

  describe('config', () => {
    it('applies env-var defaults', () => {
      process.env.TTS_API_URL = 'http://test:1234';
      process.env.TTS_VOICE = 'bf_emma';
      process.env.TTS_SPEED = '1.5';
      process.env.TTS_TIMEOUT_MS = '5000';

      vi.spyOn(TTSClient, 'checkSoxAvailable').mockReturnValue(true);
      const client = new TTSClient();
      activeClients.push(client);

      // Verify via isEnabled (proves enabled + sox available)
      expect(client.isEnabled).toBe(true);

      delete process.env.TTS_API_URL;
      delete process.env.TTS_VOICE;
      delete process.env.TTS_SPEED;
      delete process.env.TTS_TIMEOUT_MS;
    });

    it('disables when TTS_ENABLED=false', () => {
      process.env.TTS_ENABLED = 'false';
      vi.spyOn(TTSClient, 'checkSoxAvailable').mockReturnValue(true);
      const client = new TTSClient();
      activeClients.push(client);
      expect(client.isEnabled).toBe(false);
      delete process.env.TTS_ENABLED;
    });

    it('config overrides take priority over env vars', () => {
      process.env.TTS_ENABLED = 'false';
      const client = createTestClient({ enabled: true });
      expect(client.isEnabled).toBe(true);
      delete process.env.TTS_ENABLED;
    });
  });

  // -------------------------------------------------------------------------
  // Sox detection
  // -------------------------------------------------------------------------

  describe('sox detection', () => {
    it('disables gracefully when sox is not found', () => {
      vi.spyOn(TTSClient, 'checkSoxAvailable').mockReturnValue(false);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = new TTSClient({ enabled: true });
      activeClients.push(client);
      expect(client.isEnabled).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('sox not found'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // speak() fire-and-forget
  // -------------------------------------------------------------------------

  describe('speak()', () => {
    it('returns immediately (fire-and-forget)', () => {
      const client = createTestClient();
      // speak() is synchronous — returns void
      const result = client.speak('hello world');
      expect(result).toBeUndefined();
    });

    it('does nothing when disabled', () => {
      const client = createTestClient({ enabled: false });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      client.speak('hello');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing for empty text', () => {
      const client = createTestClient();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      client.speak('');
      client.speak('   ');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs to the correct endpoint with correct payload', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 }),
      );

      const client = createTestClient({
        apiUrl: 'http://kokoro:8080',
        voice: 'af_heart',
        speed: 1.25,
      });

      client.speak('test message');

      // Allow the async doSpeak to fire
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://kokoro:8080/v1/audio/speech');
      const body = JSON.parse(opts!.body as string);
      expect(body).toEqual({
        input: 'test message',
        voice: 'af_heart',
        speed: 1.25,
        response_format: 'pcm',
        stream: true,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Circuit breaker
  // -------------------------------------------------------------------------

  describe('circuit breaker', () => {
    it('opens after N consecutive failures', async () => {
      const client = createTestClient({ circuitBreakerThreshold: 3 });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        client.speak(`attempt ${i}`);
        // Let the internal async resolve
        await new Promise((r) => setTimeout(r, 10));
      }

      // After 3 failures, circuit should be open — fetch should NOT be called again
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      fetchSpy.mockClear();
      client.speak('should be blocked');
      // Give a tick for async
      await new Promise((r) => setTimeout(r, 10));
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker open'),
      );
    });

    it('resets after timeout expires', async () => {
      const client = createTestClient({
        circuitBreakerThreshold: 1,
        circuitBreakerTimeoutMs: 50, // 50ms for testing
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      // Trigger 1 failure to open circuit
      client.speak('fail');
      await new Promise((r) => setTimeout(r, 20));

      expect(client.isEnabled).toBe(false); // circuit open

      // Wait for circuit timeout
      await new Promise((r) => setTimeout(r, 60));

      expect(client.isEnabled).toBe(true); // circuit closed again
    });
  });

  // -------------------------------------------------------------------------
  // Latest-wins
  // -------------------------------------------------------------------------

  describe('latest-wins', () => {
    it('aborts previous request when new speak() is called', async () => {
      let abortCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url, opts) => {
          const signal = (opts as any)?.signal as AbortSignal;
          return new Promise((resolve, reject) => {
            // Simulate a long response
            const timer = setTimeout(() => {
              resolve(new Response(null, { status: 200 }));
            }, 5000);

            if (signal) {
              signal.addEventListener('abort', () => {
                clearTimeout(timer);
                abortCount++;
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          });
        },
      );

      const client = createTestClient();

      client.speak('first');
      await new Promise((r) => setTimeout(r, 5));
      client.speak('second'); // should abort "first"

      await new Promise((r) => setTimeout(r, 20));
      expect(abortCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // isAvailable()
  // -------------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('returns true when health endpoint responds OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );
      const client = createTestClient();
      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false when health endpoint is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('ECONNREFUSED'),
      );
      const client = createTestClient();
      expect(await client.isAvailable()).toBe(false);
    });

    it('returns false when client is disabled', async () => {
      const client = createTestClient({ enabled: false });
      expect(await client.isAvailable()).toBe(false);
    });
  });
});

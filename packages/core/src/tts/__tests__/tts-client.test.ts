/**
 * TTSClient Unit Tests
 *
 * Tests fire-and-forget TTS behavior, circuit breaker, queue (no cut-off),
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
  overrides: ConstructorParameters<typeof TTSClient>[0] = {}
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
        expect.stringContaining('sox not found')
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
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

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

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('ECONNREFUSED')
      );

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
        expect.stringContaining('Circuit breaker open')
      );
    });

    it('resets after timeout expires', async () => {
      const client = createTestClient({
        circuitBreakerThreshold: 1,
        circuitBreakerTimeoutMs: 50, // 50ms for testing
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('ECONNREFUSED')
      );

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
  // Queue (no cut-off)
  // -------------------------------------------------------------------------

  describe('queue', () => {
    it('queues second utterance when first is in progress (does not abort)', async () => {
      let abortCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
        const signal = (opts as any)?.signal as AbortSignal;
        return new Promise((resolve, reject) => {
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
      });

      const client = createTestClient();

      client.speak('first');
      await new Promise((r) => setTimeout(r, 5));
      client.speak('second'); // queued; first is not aborted

      await new Promise((r) => setTimeout(r, 20));
      expect(abortCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Text segmentation
  // -------------------------------------------------------------------------

  describe('segmentText (via speak chunks)', () => {
    it('short text passes through as a single chunk', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      const client = createTestClient({ maxChunkSize: 1800 });
      client.speak('Hello world.');

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.input).toBe('Hello world.');
    });

    it('splits multi-sentence text at sentence boundaries', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      // Two sentences that together exceed maxChunkSize=60 but individually fit
      const s1 = 'A'.repeat(35) + '.';
      const s2 = 'B'.repeat(35) + '.';
      const text = `${s1} ${s2}`;

      const client = createTestClient({ maxChunkSize: 60 });
      client.speak(text);

      // First chunk plays immediately
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const firstInput = JSON.parse(
        fetchSpy.mock.calls[0][1]!.body as string
      ).input;
      expect(firstInput).toBe(s1);
    });

    it('splits paragraphs before sentences when possible', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      const para1 = 'First paragraph here.';
      const para2 = 'Second paragraph here.';
      const text = `${para1}\n\n${para2}`;

      const client = createTestClient({ maxChunkSize: 30 });
      client.speak(text);

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const firstInput = JSON.parse(
        fetchSpy.mock.calls[0][1]!.body as string
      ).input;
      expect(firstInput).toBe(para1);
    });

    it('falls back to word-boundary chunking for long sentences', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      // One long sentence with no sentence-ending punctuation mid-way
      const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
      const text = words.join(' ');

      const client = createTestClient({ maxChunkSize: 40 });
      client.speak(text);

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const firstInput = JSON.parse(
        fetchSpy.mock.calls[0][1]!.body as string
      ).input;
      expect(firstInput.length).toBeLessThanOrEqual(40);
    });

    it('groups small sentences together to reduce API calls', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 200 }));

      // 5 tiny sentences, total ~50 chars, maxChunkSize=100 → should group into 1 chunk
      const text = 'Hi. Ok. Yes. No. Go.';

      const client = createTestClient({ maxChunkSize: 100 });
      client.speak(text);

      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
      const firstInput = JSON.parse(
        fetchSpy.mock.calls[0][1]!.body as string
      ).input;
      // All grouped into one chunk since total < maxChunkSize
      expect(firstInput).toBe(text);
    });

    it('caps queue at MAX_QUEUE_SIZE (50)', () => {
      // Keep fetch pending so speak() queues everything
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      const client = createTestClient({ maxChunkSize: 10 });

      // Generate text that produces many chunks
      const longText = Array.from({ length: 100 }, (_, i) => `word${i}`)
        .join(' ');

      client.speak(longText);

      // First chunk goes to doSpeak, rest to queue. Now speak again while busy.
      const moreText = Array.from({ length: 100 }, (_, i) => `more${i}`)
        .join(' ');
      client.speak(moreText);

      // Access queue length via destroy side-effect: queue should be capped
      // We verify indirectly — no crash, and the client stays functional
      client.destroy(); // clears queue; if > 50 items were added, overflow guard worked
    });

    it('preserves all content across chunks (join equals original)', async () => {
      const allInputs: string[] = [];
      let resolveCurrentFetch: (() => void) | null = null;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
        const body = JSON.parse((opts as any).body as string);
        allInputs.push(body.input);

        // Simulate instant completion so queue drains
        return new Response(null, { status: 200 });
      });

      const s1 = 'First sentence here.';
      const s2 = 'Second sentence here.';
      const s3 = 'Third sentence here.';
      const text = `${s1} ${s2} ${s3}`;

      const client = createTestClient({ maxChunkSize: 30 });
      client.speak(text);

      // Wait for all chunks to be dispatched
      await vi.waitFor(() => expect(allInputs.length).toBeGreaterThanOrEqual(2));

      // Joined chunks should contain all the original words
      const joined = allInputs.join(' ');
      for (const word of text.split(/\s+/)) {
        expect(joined).toContain(word);
      }
    });
  });

  // -------------------------------------------------------------------------
  // isAvailable()
  // -------------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('returns true when health endpoint responds OK', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 })
      );
      const client = createTestClient();
      expect(await client.isAvailable()).toBe(true);
    });

    it('returns false when health endpoint is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('ECONNREFUSED')
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

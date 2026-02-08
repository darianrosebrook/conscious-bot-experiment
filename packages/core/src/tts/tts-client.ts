/**
 * Kokoro-ONNX TTS Client
 *
 * Fire-and-forget text-to-speech via a local Kokoro-ONNX OpenAI-compatible API.
 * Streams PCM audio to sox for playback through system speakers.
 *
 * Uses double-buffering: while chunk N plays through sox, chunk N+1 is already
 * being fetched from Kokoro. This eliminates the ~3-7s silent gap between
 * sentences that occurs when generation is sequential with playback.
 *
 * Treated like Sterling — an optional sibling service.
 * Degrades gracefully when Kokoro or sox is unavailable.
 *
 * @author @darianrosebrook
 */

import { Readable } from 'stream';
import { spawn, execSync, type ChildProcess } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface TTSClientConfig {
  apiUrl?: string;
  enabled?: boolean;
  voice?: string;
  speed?: number;
  timeoutMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeoutMs?: number;
  /** Max characters per TTS chunk. Longer texts are split at natural boundaries. */
  maxChunkSize?: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

/** A prefetched response ready to pipe to sox without waiting for generation. */
interface PrefetchedChunk {
  response: Response;
  abort: AbortController;
}

// ============================================================================
// Client Implementation
// ============================================================================

export class TTSClient {
  private readonly apiUrl: string;
  private readonly voice: string;
  private readonly speed: number;
  private readonly timeoutMs: number;
  private readonly cbThreshold: number;
  private readonly cbTimeoutMs: number;
  private readonly maxChunkSize: number;
  private readonly MAX_QUEUE_SIZE = 50;
  private enabled: boolean;
  private soxAvailable: boolean;
  private activeSox: ChildProcess | null = null;
  private activeAbort: AbortController | null = null;
  /** Queued utterances; played in order after current playback finishes. */
  private queue: string[] = [];
  /** Pre-fetched audio for the next chunk (generated while current chunk plays). */
  private prefetched: PrefetchedChunk | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
  };
  private cleanupHandler: (() => void) | null = null;

  constructor(config: TTSClientConfig = {}) {
    this.apiUrl =
      config.apiUrl || process.env.TTS_API_URL || 'http://localhost:8080';
    this.enabled = config.enabled ?? process.env.TTS_ENABLED !== 'false';
    this.voice = config.voice || process.env.TTS_VOICE || 'af_heart';
    this.speed = config.speed ?? parseFloat(process.env.TTS_SPEED || '1.25');
    this.timeoutMs =
      config.timeoutMs ?? parseInt(process.env.TTS_TIMEOUT_MS || '30000', 10);
    this.maxChunkSize = config.maxChunkSize ?? 1800;
    this.cbThreshold = config.circuitBreakerThreshold ?? 3;
    this.cbTimeoutMs = config.circuitBreakerTimeoutMs ?? 60_000;

    // Probe for sox on PATH
    this.soxAvailable = TTSClient.checkSoxAvailable();
    if (!this.soxAvailable) {
      console.warn(
        '[TTS] sox not found on PATH — TTS playback disabled. Install: brew install sox'
      );
      this.enabled = false;
    }

    // Cleanup on process exit (store handler for destroy())
    this.cleanupHandler = () => this.killActive();
    process.once('exit', this.cleanupHandler);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Fire-and-forget: POST text to Kokoro API, pipe streaming PCM to sox.
   * Returns immediately. Errors are silently absorbed (circuit breaker handles backoff).
   * Queued: if playback is in progress, this utterance is queued and played after
   * the current one finishes, so playback is not cut off.
   */
  speak(text: string): void {
    if (!this.enabled) return;
    if (this.isCircuitOpen()) return;
    const trimmed = text?.trim();
    if (!trimmed || trimmed.length === 0) return;

    const chunks = this.segmentText(trimmed);
    const isBusy = this.activeSox !== null || this.activeAbort !== null;

    if (isBusy) {
      // Queue all chunks, respecting the safety cap
      const available = this.MAX_QUEUE_SIZE - this.queue.length;
      this.queue.push(...chunks.slice(0, available));
      return;
    }

    // Play the first chunk immediately, queue the rest
    const [first, ...rest] = chunks;
    if (rest.length > 0) {
      this.queue.push(...rest.slice(0, this.MAX_QUEUE_SIZE - this.queue.length));
    }
    this.doSpeak(first).catch(() => {
      // Swallow — circuit breaker already incremented inside doSpeak
    });
  }

  /** Ping Kokoro /health endpoint to check reachability. */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.apiUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Whether the client is enabled and the circuit breaker is closed. */
  get isEnabled(): boolean {
    return this.enabled && this.soxAvailable && !this.isCircuitOpen();
  }

  /** Kill active playback, clear queue, and remove process listeners. */
  destroy(): void {
    this.killActive();
    this.queue = [];
    if (this.cleanupHandler) {
      process.removeListener('exit', this.cleanupHandler);
      this.cleanupHandler = null;
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /**
   * Fetch audio from Kokoro without playing it. Returns the Response for
   * later piping to sox. Used to pre-generate the next chunk while the
   * current chunk is still playing.
   */
  private async fetchAudio(text: string): Promise<PrefetchedChunk | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.apiUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: this.voice,
          speed: this.speed,
          response_format: 'pcm',
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok || !res.body) {
        this.recordFailure();
        return null;
      }

      this.recordSuccess();
      return { response: res, abort: controller };
    } catch {
      clearTimeout(timer);
      this.recordFailure();
      return null;
    }
  }

  /**
   * Play a fetched response through sox. Returns a Promise that resolves
   * when sox finishes playing.
   */
  private playResponse(res: Response, abort: AbortController): Promise<void> {
    return new Promise<void>((resolve) => {
      this.activeAbort = abort;

      const sox = spawn(
        'sox',
        [
          '-t', 'raw',
          '-e', 'signed-integer',
          '-b', '16',
          '-c', '1',
          '-r', '24000',
          '-',
          '-d',
        ],
        { stdio: ['pipe', 'ignore', 'ignore'] }
      );
      this.activeSox = sox;

      sox.on('error', () => {
        this.recordFailure();
      });

      sox.on('close', () => {
        if (this.activeSox === sox) {
          this.activeSox = null;
          if (this.activeAbort === abort) {
            this.activeAbort = null;
          }
        }
        resolve();
      });

      const readable = Readable.fromWeb(res.body as any);
      readable.pipe(sox.stdin);

      readable.on('error', () => {
        this.killSoxProcess(sox);
        this.recordFailure();
        resolve();
      });
    });
  }

  private async doSpeak(text: string): Promise<void> {
    // Fetch audio for this chunk
    const chunk = await this.fetchAudio(text);
    if (!chunk) {
      this.playNextFromQueue();
      return;
    }

    // Start prefetching the NEXT chunk while this one plays
    this.startPrefetch();

    // Play the current chunk — blocks until sox finishes
    await this.playResponse(chunk.response, chunk.abort);

    // When playback ends, the prefetched chunk may already be ready
    this.playNextFromQueue();
  }

  /**
   * If there's a next chunk in the queue, start fetching its audio now
   * (while the current chunk plays through sox). The result is stored in
   * this.prefetched and consumed by playNextFromQueue().
   */
  private startPrefetch(): void {
    if (this.prefetched) return; // already prefetching
    if (this.queue.length === 0) return;

    const nextText = this.queue[0]; // peek, don't remove yet
    // Fire-and-forget the fetch; store the promise result
    this.fetchAudio(nextText).then((result) => {
      if (result) {
        this.prefetched = result;
      }
    }).catch(() => {
      // Prefetch failed — will fall back to normal fetch in playNextFromQueue
    });
  }

  private playNextFromQueue(): void {
    if (this.queue.length === 0) {
      this.prefetched = null;
      return;
    }

    const next = this.queue.shift()!;

    if (this.prefetched) {
      // Use the pre-fetched audio — no generation wait!
      const chunk = this.prefetched;
      this.prefetched = null;

      // Start prefetching the chunk after this one
      this.startPrefetch();

      this.playResponse(chunk.response, chunk.abort).then(() => {
        this.playNextFromQueue();
      }).catch(() => {});
    } else {
      // No prefetch available — fall back to fetch-then-play
      this.doSpeak(next).catch(() => {});
    }
  }

  // --------------------------------------------------------------------------
  // Text Segmentation (adapted from Raycast's TextProcessor)
  // --------------------------------------------------------------------------

  /**
   * Split text into chunks that fit within maxChunkSize.
   * Uses a 3-tier strategy: paragraphs → sentences → word-boundary chunks.
   * Small adjacent segments are grouped together to reduce API calls.
   */
  private segmentText(text: string): string[] {
    if (text.length <= this.maxChunkSize) return [text];

    // Tier 1: Paragraphs — split on blank lines
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.every((p) => p.length <= this.maxChunkSize)) {
      return this.groupSegments(paragraphs);
    }

    // Tier 2: Sentences — split on sentence-ending punctuation.
    // Use a boundary-aware regex that avoids splitting on:
    //   - Decimal numbers (3.5, 123.45)
    //   - Common abbreviations (Dr., Mr., Mrs., e.g., i.e., etc.)
    //   - Ellipses (...)
    // A sentence boundary is: punctuation (.!?) followed by optional quotes,
    // then whitespace, then an uppercase letter or end of string.
    const sentenceBoundary =
      /(?<![A-Z][a-z])(?<!\b(?:Dr|Mr|Mrs|Ms|Jr|Sr|St|vs|etc|e\.g|i\.e|approx|dept|govt|avg))(?<!\d)(?<!\.\.)([.!?]+["']?)\s+(?=[A-Z"])/g;
    const sentences = text.split(sentenceBoundary).reduce<string[]>((acc, part, i) => {
      // split with capture group interleaves: [text, punct, text, punct, ...]
      // Reattach punctuation to the preceding segment
      if (i % 2 === 1) {
        if (acc.length > 0) acc[acc.length - 1] += part;
      } else {
        const trimmed = part.trim();
        if (trimmed) acc.push(trimmed);
      }
      return acc;
    }, []);
    const trimmedSentences = sentences.filter((s) => s.length > 0);

    if (trimmedSentences.every((s) => s.length <= this.maxChunkSize)) {
      return this.groupSegments(trimmedSentences);
    }

    // Tier 3: Word-boundary chunks — accumulate words up to limit
    return this.segmentByWords(text);
  }

  /** Accumulate words into chunks up to maxChunkSize. */
  private segmentByWords(text: string): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/)) {
      const test = current ? `${current} ${word}` : word;
      if (test.length <= this.maxChunkSize) {
        current = test;
      } else {
        if (current) chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /** Group small adjacent segments together to avoid excessive API calls. */
  private groupSegments(segments: string[]): string[] {
    const grouped: string[] = [];
    let current = '';
    for (const seg of segments) {
      const test = current ? `${current} ${seg}` : seg;
      if (test.length <= this.maxChunkSize) {
        current = test;
      } else {
        if (current) grouped.push(current);
        current = seg;
      }
    }
    if (current) grouped.push(current);
    return grouped;
  }

  // --------------------------------------------------------------------------
  // Circuit Breaker
  // --------------------------------------------------------------------------

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) return false;

    const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
    if (elapsed > this.cbTimeoutMs) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      return false;
    }
    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failures >= this.cbThreshold) {
      if (!this.circuitBreaker.isOpen) {
        console.warn(
          `[TTS] Circuit breaker open after ${this.circuitBreaker.failures} failures. ` +
            `Will retry in ${this.cbTimeoutMs / 1000}s.`
        );
      }
      this.circuitBreaker.isOpen = true;
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }

  // --------------------------------------------------------------------------
  // Process Management
  // --------------------------------------------------------------------------

  private killActive(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeSox) {
      this.killSoxProcess(this.activeSox);
      this.activeSox = null;
    }
    if (this.prefetched) {
      this.prefetched.abort.abort();
      this.prefetched = null;
    }
  }

  private killSoxProcess(proc: ChildProcess): void {
    try {
      if (!proc.killed) {
        proc.stdin?.destroy();
        proc.kill('SIGTERM');
      }
    } catch {
      // Already dead — ignore
    }
  }

  /** Check if sox is on PATH. Exported for testing. */
  static checkSoxAvailable(): boolean {
    try {
      execSync('which sox', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

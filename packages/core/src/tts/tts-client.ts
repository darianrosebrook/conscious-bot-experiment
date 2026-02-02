/**
 * Kokoro-ONNX TTS Client
 *
 * Fire-and-forget text-to-speech via a local Kokoro-ONNX OpenAI-compatible API.
 * Streams PCM audio to sox for playback through system speakers.
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
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
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
  private enabled: boolean;
  private soxAvailable: boolean;
  private activeSox: ChildProcess | null = null;
  private activeAbort: AbortController | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    isOpen: false,
  };
  private cleanupHandler: (() => void) | null = null;

  constructor(config: TTSClientConfig = {}) {
    this.apiUrl =
      config.apiUrl ||
      process.env.TTS_API_URL ||
      'http://localhost:8080';
    this.enabled =
      config.enabled ??
      process.env.TTS_ENABLED !== 'false';
    this.voice =
      config.voice ||
      process.env.TTS_VOICE ||
      'af_heart';
    this.speed =
      config.speed ??
      parseFloat(process.env.TTS_SPEED || '1.25');
    this.timeoutMs =
      config.timeoutMs ??
      parseInt(process.env.TTS_TIMEOUT_MS || '15000', 10);
    this.cbThreshold =
      config.circuitBreakerThreshold ?? 3;
    this.cbTimeoutMs =
      config.circuitBreakerTimeoutMs ?? 60_000;

    // Probe for sox on PATH
    this.soxAvailable = TTSClient.checkSoxAvailable();
    if (!this.soxAvailable) {
      console.warn('[TTS] sox not found on PATH — TTS playback disabled. Install: brew install sox');
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
   * Latest-wins: if a previous utterance is still playing, it is killed.
   */
  speak(text: string): void {
    if (!this.enabled) return;
    if (this.isCircuitOpen()) return;
    if (!text || text.trim().length === 0) return;

    // Latest-wins — kill any in-flight utterance
    this.killActive();

    // Fire-and-forget — errors handled internally
    this.doSpeak(text).catch(() => {
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

  /** Kill active playback and remove process listeners. */
  destroy(): void {
    this.killActive();
    if (this.cleanupHandler) {
      process.removeListener('exit', this.cleanupHandler);
      this.cleanupHandler = null;
    }
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async doSpeak(text: string): Promise<void> {
    const controller = new AbortController();
    this.activeAbort = controller;
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
        return;
      }

      // Spawn sox to play raw PCM (24kHz, 16-bit signed, mono)
      const sox = spawn('sox', [
        '-t', 'raw',
        '-e', 'signed-integer',
        '-b', '16',
        '-c', '1',
        '-r', '24000',
        '-', '-d',
      ], {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      this.activeSox = sox;

      sox.on('error', () => {
        this.recordFailure();
      });

      sox.on('close', () => {
        if (this.activeSox === sox) {
          this.activeSox = null;
        }
      });

      // Pipe streaming response body to sox stdin
      const readable = Readable.fromWeb(res.body as any);
      readable.pipe(sox.stdin);

      readable.on('error', () => {
        this.killSoxProcess(sox);
        this.recordFailure();
      });

      // Success — reset circuit breaker on first data
      this.recordSuccess();
    } catch (err) {
      clearTimeout(timer);
      this.recordFailure();
    }
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

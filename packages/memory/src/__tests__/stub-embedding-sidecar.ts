import express from 'express';
import type { Server } from 'http';

type SidecarState = 'healthy' | 'down' | 'loading';

type RequestLogEntry = {
  timestamp: number;
  path: string;
  model?: string;
  prompt?: string;
};

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicEmbedding768(model: string, prompt: string): number[] {
  const seed = djb2Hash(`${model}\n${prompt}`);
  const rnd = mulberry32(seed);
  const out: number[] = new Array(768);

  for (let i = 0; i < 768; i++) {
    // Stable float in [-1, 1]
    out[i] = Math.fround(rnd() * 2 - 1);
  }

  return out;
}

export class StubEmbeddingSidecar {
  private app = express();
  private server: Server | null = null;
  private state: SidecarState = 'healthy';
  private requestLog: RequestLogEntry[] = [];

  constructor(private port: number) {
    this.app.use(express.json({ limit: '2mb' }));

    this.app.get('/health', (_req, res) => {
      this.requestLog.push({ timestamp: Date.now(), path: '/health' });
      if (this.state === 'healthy')
        return res.status(200).json({ ok: true, state: this.state });
      if (this.state === 'loading')
        return res.status(503).json({ ok: false, state: this.state });
      return res.status(503).json({ ok: false, state: this.state });
    });

    this.app.post('/api/embeddings', (req, res) => {
      const model = String(req.body?.model ?? '');
      const prompt = String(req.body?.prompt ?? '');

      this.requestLog.push({
        timestamp: Date.now(),
        path: '/api/embeddings',
        model,
        prompt,
      });

      if (this.state !== 'healthy') {
        return res.status(500).json({ error: `sidecar_${this.state}` });
      }

      if (!model || !prompt) {
        return res.status(400).json({ error: 'missing_model_or_prompt' });
      }

      const embedding = deterministicEmbedding768(model, prompt);
      return res.status(200).json({ embedding });
    });
  }

  setHealthy(): void {
    this.state = 'healthy';
  }

  setDown(): void {
    this.state = 'down';
  }

  setLoading(): void {
    this.state = 'loading';
  }

  getRequestLog(): RequestLogEntry[] {
    return [...this.requestLog];
  }

  clearRequestLog(): void {
    this.requestLog = [];
  }

  async start(): Promise<void> {
    if (this.server) return;
    await new Promise<void>((resolve, reject) => {
      const s = this.app.listen(this.port, () => resolve());
      s.on('error', reject);
      this.server = s;
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  baseUrl(): string {
    return `http://localhost:${this.port}`;
  }
}

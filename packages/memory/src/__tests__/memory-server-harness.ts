import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { httpGet, waitForEndpoint } from './e2e-helpers';

export type MemoryHarnessConfig = {
  port: number;
  sidecarUrl: string;
  worldSeed: string;

  // Postgres env (expected to be supplied by test runner environment)
  pgHost: string;
  pgPort: string;
  pgUser: string;
  pgPassword: string;
  pgDatabase: string;

  // Optional knobs
  logPrefix?: string;
};

export class MemoryServerHarness {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdout: string[] = [];
  private stderr: string[] = [];

  constructor(private cfg: MemoryHarnessConfig) {}

  baseUrl(): string {
    return `http://localhost:${this.cfg.port}`;
  }

  getLogs(): { stdout: string; stderr: string } {
    return {
      stdout: this.stdout.join(''),
      stderr: this.stderr.join(''),
    };
  }

  async start(): Promise<void> {
    if (this.proc) return;

    const env = {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(this.cfg.port),
      LLM_SIDECAR_URL: this.cfg.sidecarUrl,
      OLLAMA_HOST: this.cfg.sidecarUrl, // deprecated fallback
      WORLD_SEED: this.cfg.worldSeed,
      MEMORY_DEV_DEFAULT_SEED: 'true',

      PG_HOST: this.cfg.pgHost,
      PG_PORT: this.cfg.pgPort,
      PG_USER: this.cfg.pgUser,
      PG_PASSWORD: this.cfg.pgPassword,
      PG_DATABASE: this.cfg.pgDatabase,
    };

    // This matches your spec. If dev:server is a watcher, you may want a non-watch script.
    const proc = spawn(
      'pnpm',
      ['--filter', '@conscious-bot/memory', 'run', 'dev:server'],
      {
        env,
        stdio: 'pipe',
        shell: false,
      }
    );

    this.proc = proc;

    proc.stdout.on('data', (d) => this.stdout.push(d.toString('utf8')));
    proc.stderr.on('data', (d) => this.stderr.push(d.toString('utf8')));

    // Liveness gate
    await waitForEndpoint(`${this.baseUrl()}/live`, 200, {
      timeoutMs: 20_000,
      intervalMs: 250,
    });

    // Optional: if memory uses a POST /system/ready orchestration gate in some modes,
    // you can add it here. Leaving off by default to avoid assuming semantics.
    // await httpPost(`${this.baseUrl()}/system/ready`, {});

    // Readiness gate (best-effort)
    await waitForEndpoint(`${this.baseUrl()}/ready`, 200, {
      timeoutMs: 20_000,
      intervalMs: 250,
    });
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;

    this.proc = null;

    // SIGTERM → grace → SIGKILL
    proc.kill('SIGTERM');

    const exited = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 2000);
      proc.once('exit', () => {
        clearTimeout(t);
        resolve(true);
      });
    });

    if (!exited) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }

  async snapshotHealth(): Promise<any> {
    const r = await httpGet(`${this.baseUrl()}/health`, 1500);
    return { status: r.status, body: r.body };
  }
}

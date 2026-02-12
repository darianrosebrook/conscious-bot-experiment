import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';

import { StubEmbeddingSidecar } from './stub-embedding-sidecar';
import { MemoryServerHarness } from './memory-server-harness';
import {
  getFreePort,
  httpGet,
  httpPost,
  waitForEndpoint,
  writeE2EArtifact,
} from './e2e-helpers';

const execFileAsync = promisify(execFile);

const MEMORY_E2E = !!process.env.MEMORY_E2E;
const MEMORY_E2E_DOCKER = !!process.env.MEMORY_E2E_DOCKER;
const MEMORY_LIVE_E2E = !!process.env.MEMORY_LIVE_E2E;

// Adjust these if your repo uses different env names.
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

type ScenarioStep = {
  action: string;
  endpoint?: string;
  statusCode?: number;
  assertion?: string;
  passed?: boolean;
  detail?: any;
  durationMs?: number;
};

type ScenarioResult = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  steps: ScenarioStep[];
  gap?: string;
};

function nowMs(): number {
  return Date.now();
}

async function withTimer<T>(
  fn: () => Promise<T>
): Promise<{ value: T; durationMs: number }> {
  const start = nowMs();
  const value = await fn();
  return { value, durationMs: nowMs() - start };
}

// Basic helpers — keep request shape assumptions here.
async function postThought(
  baseUrl: string,
  content: string
): Promise<{ status: number; body: any }> {
  // If /thought is not the correct endpoint in your server, change it here only.
  const r = await httpPost(`${baseUrl}/thought`, { content }, 5000);
  return { status: r.status, body: r.body };
}

async function postSearch(
  baseUrl: string,
  query: string
): Promise<{ status: number; body: any }> {
  // If /search expects different keys, change it here only.
  const r = await httpPost(`${baseUrl}/search`, { query, limit: 10 }, 5000);
  return { status: r.status, body: r.body };
}

function seedDbName(baseDb: string, seed: string): string {
  // Match your current server sanitization rule. Avoid hyphens in E2E seeds.
  const sanitized = seed.replace('-', 'n');
  return `${baseDb}_seed_${sanitized}`;
}

async function pgPoolForSeed(seed: string): Promise<Pool> {
  const host = requireEnv('PG_HOST');
  const port = requireEnv('PG_PORT');
  const user = requireEnv('PG_USER');
  const password = requireEnv('PG_PASSWORD');
  const database = requireEnv('PG_DATABASE');

  const seedDb = seedDbName(database, seed);
  return new Pool({
    connectionString: `postgresql://${user}:${password}@${host}:${port}/${seedDb}`,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 1500,
  });
}

async function dockerPausePostgres(): Promise<() => Promise<void>> {
  const { stdout } = await execFileAsync('docker', [
    'compose',
    'ps',
    '-q',
    'postgres',
  ]);
  const id = stdout.trim();
  if (!id)
    throw new Error(
      'Could not find postgres container via `docker compose ps -q postgres`'
    );

  await execFileAsync('docker', ['pause', id]);
  return async () => {
    await execFileAsync('docker', ['unpause', id]).catch(() => {});
  };
}

// Planning integration import (relative to avoid workspace dependency coupling).
// The cross-package relative path resolves at runtime but tsc can't follow it.
async function loadMemoryIntegration(): Promise<any> {
  // @ts-expect-error — cross-workspace relative import; resolves at runtime when both packages are built
  return await import('../../../../planning/src/memory-integration');
}

describe.skipIf(!MEMORY_E2E)('Memory E2E: Lane A (deterministic)', () => {
  const artifactDir = path.join(__dirname, '__artifacts__');
  const runId = `memory-e2e-${Date.now()}`;

  let sidecar: StubEmbeddingSidecar;
  let harness: MemoryServerHarness;

  let baseUrl = '';
  let worldSeed = '';

  const scenarios: ScenarioResult[] = [];

  beforeAll(async () => {
    const sidecarPort = await getFreePort();
    const memoryPort = await getFreePort();
    worldSeed = `e2e_seed_${Date.now()}`; // no hyphens

    sidecar = new StubEmbeddingSidecar(sidecarPort);
    await sidecar.start();

    harness = new MemoryServerHarness({
      port: memoryPort,
      sidecarUrl: sidecar.baseUrl(),
      worldSeed,

      pgHost: requireEnv('PG_HOST'),
      pgPort: requireEnv('PG_PORT'),
      pgUser: requireEnv('PG_USER'),
      pgPassword: requireEnv('PG_PASSWORD'),
      pgDatabase: requireEnv('PG_DATABASE'),
    });

    await harness.start();
    baseUrl = harness.baseUrl();
  }, 60_000);

  afterAll(async () => {
    try {
      await harness?.stop();
    } finally {
      await sidecar?.stop();
    }

    const payload = {
      meta: {
        runId,
        timestamp: Date.now(),
        lane: 'deterministic',
        ports: {
          memory: baseUrl,
          sidecar: sidecar?.baseUrl(),
        },
        seed: worldSeed,
      },
      scenarios,
      summary: {
        total: scenarios.length,
        passed: scenarios.filter((s) => s.status === 'pass').length,
        failed: scenarios.filter((s) => s.status === 'fail').length,
        skipped: scenarios.filter((s) => s.status === 'skip').length,
      },
    };

    writeE2EArtifact(artifactDir, runId, payload);
  });

  it('Scenario 0: Cold boot truthiness', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 0: Cold boot truthiness';

    try {
      const live = await withTimer(() => httpGet(`${baseUrl}/live`, 1500));
      steps.push({
        action: 'GET /live',
        endpoint: '/live',
        statusCode: live.value.status,
        durationMs: live.durationMs,
      });
      expect(live.value.status).toBe(200);

      const ready = await withTimer(() => httpGet(`${baseUrl}/ready`, 1500));
      steps.push({
        action: 'GET /ready',
        endpoint: '/ready',
        statusCode: ready.value.status,
        durationMs: ready.durationMs,
      });
      expect(ready.value.status).toBe(200);
      expect(ready.value.body?.checks?.database?.ok).toBe(true);
      expect(ready.value.body?.checks?.embeddings?.ok).toBe(true);

      const health = await withTimer(() => httpGet(`${baseUrl}/health`, 1500));
      steps.push({
        action: 'GET /health',
        endpoint: '/health',
        statusCode: health.value.status,
        durationMs: health.durationMs,
      });
      expect(health.value.status).toBe(200);
      expect(['healthy', 'degraded']).toContain(health.value.body?.status);

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  });

  it('Scenario 1: Embedding backend down → recovery', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 1: Embedding backend down → recovery';

    try {
      // Baseline write succeeds
      const marker = `E2E_MARKER_${Date.now()}`;
      const write1 = await withTimer(() =>
        postThought(baseUrl, `hello ${marker}`)
      );
      steps.push({
        action: 'POST /thought',
        endpoint: '/thought',
        statusCode: write1.value.status,
        durationMs: write1.durationMs,
      });
      expect(write1.value.status).toBeGreaterThanOrEqual(200);
      expect(write1.value.status).toBeLessThan(300);

      // Sidecar down
      sidecar.setDown();
      steps.push({ action: 'sidecar.setDown()' });

      // /ready should degrade
      await waitForEndpoint(`${baseUrl}/ready`, 503, {
        timeoutMs: 10_000,
        intervalMs: 250,
      });
      const readyDown = await httpGet(`${baseUrl}/ready`, 1500);
      steps.push({
        action: 'GET /ready',
        endpoint: '/ready',
        statusCode: readyDown.status,
      });
      expect(readyDown.status).toBe(503);
      expect(readyDown.body?.checks?.embeddings?.ok).toBe(false);

      // Write should fail (embedding required)
      const write2 = await withTimer(() =>
        postThought(baseUrl, `should_fail ${marker}`)
      );
      steps.push({
        action: 'POST /thought (expect non-2xx)',
        endpoint: '/thought',
        statusCode: write2.value.status,
        durationMs: write2.durationMs,
      });
      expect(write2.value.status).toBeGreaterThanOrEqual(400);

      // Recover sidecar
      sidecar.setHealthy();
      steps.push({ action: 'sidecar.setHealthy()' });

      await waitForEndpoint(`${baseUrl}/ready`, 200, {
        timeoutMs: 20_000,
        intervalMs: 250,
      });

      const write3 = await withTimer(() =>
        postThought(baseUrl, `recovered ${marker}`)
      );
      steps.push({
        action: 'POST /thought (recovered)',
        endpoint: '/thought',
        statusCode: write3.value.status,
        durationMs: write3.durationMs,
      });
      expect(write3.value.status).toBeGreaterThanOrEqual(200);
      expect(write3.value.status).toBeLessThan(300);

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    } finally {
      sidecar.setHealthy();
    }
  });

  it.skipIf(!MEMORY_E2E_DOCKER)(
    'Scenario 2: Postgres down → recovery',
    async () => {
      const start = nowMs();
      const steps: ScenarioStep[] = [];
      const name = 'Scenario 2: Postgres down → recovery';

      let unpause: (() => Promise<void>) | null = null;

      try {
        // baseline ready
        await waitForEndpoint(`${baseUrl}/ready`, 200, {
          timeoutMs: 10_000,
          intervalMs: 250,
        });
        steps.push({ action: 'wait /ready=200' });

        unpause = await dockerPausePostgres();
        steps.push({ action: 'docker pause postgres' });

        await waitForEndpoint(`${baseUrl}/ready`, 503, {
          timeoutMs: 15_000,
          intervalMs: 250,
        });
        const ready = await httpGet(`${baseUrl}/ready`, 1500);
        steps.push({
          action: 'GET /ready',
          endpoint: '/ready',
          statusCode: ready.status,
        });
        expect(ready.status).toBe(503);
        expect(ready.body?.checks?.database?.ok).toBe(false);

        await unpause();
        steps.push({ action: 'docker unpause postgres' });

        await waitForEndpoint(`${baseUrl}/ready`, 200, {
          timeoutMs: 20_000,
          intervalMs: 250,
        });
        steps.push({ action: 'wait /ready=200 after recovery' });

        const write = await postThought(baseUrl, `pg_recovery_${Date.now()}`);
        steps.push({
          action: 'POST /thought (post-recovery)',
          endpoint: '/thought',
          statusCode: write.status,
        });
        expect(write.status).toBeGreaterThanOrEqual(200);
        expect(write.status).toBeLessThan(300);

        scenarios.push({
          name,
          status: 'pass',
          durationMs: nowMs() - start,
          steps,
        });
      } catch (e) {
        steps.push({
          action: 'assert',
          passed: false,
          detail: (e as Error).message,
        });
        scenarios.push({
          name,
          status: 'fail',
          durationMs: nowMs() - start,
          steps,
        });
        throw e;
      } finally {
        if (unpause) await unpause().catch(() => {});
      }
    }
  );

  it('Scenario 3: Write → Search contains marker', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 3: Write → Search contains marker';

    try {
      const marker = `SEARCH_MARKER_${Date.now()}`;
      const content = `hello world ${marker}`;
      const write = await postThought(baseUrl, content);
      steps.push({
        action: 'POST /thought',
        endpoint: '/thought',
        statusCode: write.status,
      });
      expect(write.status).toBeGreaterThanOrEqual(200);
      expect(write.status).toBeLessThan(300);

      const search = await postSearch(baseUrl, marker);
      steps.push({
        action: 'POST /search',
        endpoint: '/search',
        statusCode: search.status,
      });
      expect(search.status).toBe(200);

      const results = search.body?.results ?? [];
      expect(Array.isArray(results)).toBe(true);

      const found = results.some((r: any) =>
        JSON.stringify(r).includes(marker)
      );
      expect(found).toBe(true);

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  });

  it('Scenario 4: Model filter excludes rogue embedding_model_id', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 4: Model filter excludes rogue embedding_model_id';

    let pool: Pool | null = null;
    try {
      const marker = `MODEL_FILTER_${Date.now()}`;
      const legitContent = `legit ${marker}`;

      const write = await postThought(baseUrl, legitContent);
      steps.push({
        action: 'POST /thought (legit)',
        endpoint: '/thought',
        statusCode: write.status,
      });
      expect(write.status).toBeGreaterThanOrEqual(200);
      expect(write.status).toBeLessThan(300);

      // Insert rogue row directly into DB to ensure filter blocks it.
      pool = await pgPoolForSeed(worldSeed);

      const rogueId = `rogue_${Date.now()}`;
      const rogueContent = `rogue ${marker}`;
      // Minimal columns; adjust if your table requires more NOT NULL fields.
      await pool.query(
        `
        INSERT INTO enhanced_memory_chunks
          (id, content, metadata, decay_profile, provenance, embedding, embedding_model_id, embedding_dim)
        VALUES
          ($1, $2, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $3::vector, $4, 768)
        `,
        [
          rogueId,
          rogueContent,
          `[${new Array(768).fill(0).join(',')}]`,
          'rogue_model',
        ]
      );

      steps.push({ action: 'SQL insert rogue row', detail: { rogueId } });

      const search = await postSearch(baseUrl, marker);
      steps.push({
        action: 'POST /search',
        endpoint: '/search',
        statusCode: search.status,
      });
      expect(search.status).toBe(200);

      const results = search.body?.results ?? [];
      const hasRogue = results.some(
        (r: any) =>
          JSON.stringify(r).includes(rogueId) ||
          JSON.stringify(r).includes('rogue_model')
      );
      expect(hasRogue).toBe(false);

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    } finally {
      if (pool) await pool.end().catch(() => {});
    }
  });

  it('Scenario 5: Degradation envelope + planning memoryDegraded event', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 5: Degradation envelope + planning event';

    try {
      sidecar.setDown();
      steps.push({ action: 'sidecar.setDown()' });

      // Wait for readiness probe to detect sidecar failure
      await waitForEndpoint(`${baseUrl}/ready`, 503, {
        timeoutMs: 10_000,
        intervalMs: 250,
      });

      // /memories should degrade
      const mem = await httpGet(`${baseUrl}/memories`, 5000);
      steps.push({
        action: 'GET /memories',
        endpoint: '/memories',
        statusCode: mem.status,
      });
      expect(mem.status).toBe(200);
      expect(mem.body?._degraded).toBe(true);

      // /search should degrade (requires production fix)
      const s = await postSearch(baseUrl, 'test');
      steps.push({
        action: 'POST /search',
        endpoint: '/search',
        statusCode: s.status,
      });
      expect(s.status).toBe(200);
      expect(s.body?._degraded).toBe(true);

      // Planning event path
      const mod = await loadMemoryIntegration();
      const MemoryIntegration = mod.MemoryIntegration ?? mod.default ?? mod;

      const mi = new MemoryIntegration({
        enableMemoryDiscovery: false,
        memorySystemEndpoint: baseUrl,
      });

      const degradedEvents: any[] = [];
      mi.on('memoryDegraded', (evt: any) => degradedEvents.push(evt));

      // Trigger a call that hits /search and runs checkDegradation()
      if (typeof mi.getMemoryContext === 'function') {
        await mi.getMemoryContext({ query: 'test' });
      } else if (typeof mi.search === 'function') {
        await mi.search('test');
      } else {
        throw new Error(
          'MemoryIntegration does not expose getMemoryContext/search in expected shape'
        );
      }

      steps.push({ action: 'planning MemoryIntegration invoked' });
      expect(degradedEvents.length).toBeGreaterThan(0);
      expect(degradedEvents[0]?.reasons ?? []).toContain(
        'enhanced_search_failed'
      );

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    } finally {
      sidecar.setHealthy();
      await waitForEndpoint(`${baseUrl}/ready`, 200, {
        timeoutMs: 20_000,
        intervalMs: 250,
      });
    }
  });

  it('Scenario 6: Seed flip isolates namespaces', async () => {
    const start = nowMs();
    const steps: ScenarioStep[] = [];
    const name = 'Scenario 6: Seed flip isolates namespaces';

    try {
      const markerA = `SEED_A_${Date.now()}`;
      await postThought(baseUrl, `seedA ${markerA}`);
      steps.push({ action: 'POST /thought seedA' });

      const searchA1 = await postSearch(baseUrl, markerA);
      expect(searchA1.status).toBe(200);
      expect(JSON.stringify(searchA1.body)).toContain(markerA);

      const seedB = `e2e_seedB_${Date.now()}`;
      const seedResp = await httpPost(
        `${baseUrl}/enhanced/seed`,
        { worldSeed: seedB },
        5000
      );
      steps.push({
        action: 'POST /enhanced/seed',
        endpoint: '/enhanced/seed',
        statusCode: seedResp.status,
      });
      expect(seedResp.status).toBe(200);

      await waitForEndpoint(`${baseUrl}/ready`, 200, {
        timeoutMs: 20_000,
        intervalMs: 250,
      });

      const searchA2 = await postSearch(baseUrl, markerA);
      expect(searchA2.status).toBe(200);
      expect(JSON.stringify(searchA2.body)).not.toContain(markerA);

      const markerB = `SEED_B_${Date.now()}`;
      await postThought(baseUrl, `seedB ${markerB}`);
      const searchB1 = await postSearch(baseUrl, markerB);
      expect(searchB1.status).toBe(200);
      expect(JSON.stringify(searchB1.body)).toContain(markerB);

      // flip back to original seed
      const seedBack = await httpPost(
        `${baseUrl}/enhanced/seed`,
        { worldSeed },
        5000
      );
      expect(seedBack.status).toBe(200);
      await waitForEndpoint(`${baseUrl}/ready`, 200, {
        timeoutMs: 20_000,
        intervalMs: 250,
      });

      const searchA3 = await postSearch(baseUrl, markerA);
      expect(searchA3.status).toBe(200);
      expect(JSON.stringify(searchA3.body)).toContain(markerA);

      const searchB2 = await postSearch(baseUrl, markerB);
      expect(searchB2.status).toBe(200);
      expect(JSON.stringify(searchB2.body)).not.toContain(markerB);

      scenarios.push({
        name,
        status: 'pass',
        durationMs: nowMs() - start,
        steps,
      });
    } catch (e) {
      steps.push({
        action: 'assert',
        passed: false,
        detail: (e as Error).message,
      });
      scenarios.push({
        name,
        status: 'fail',
        durationMs: nowMs() - start,
        steps,
      });
      throw e;
    }
  });
});

describe.skipIf(!MEMORY_LIVE_E2E)('Memory E2E: Lane B (live MLX)', () => {
  it('placeholder', () => {
    // Intentionally minimal: reuse same scenarios but relax ranking expectations.
    // I’d keep Lane B to: Scenario 0 + Scenario 3 (contains marker) + Scenario 6 (seed flip)
    expect(true).toBe(true);
  });
});

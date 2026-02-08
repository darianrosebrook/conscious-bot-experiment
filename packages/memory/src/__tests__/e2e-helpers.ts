import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

export async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string')
        return reject(new Error('Failed to allocate port'));
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

export async function httpGet(
  url: string,
  timeoutMs = 2000
): Promise<{ status: number; body: any; raw: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const raw = await res.text();
    let body: any = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    return { status: res.status, body, raw };
  } finally {
    clearTimeout(t);
  }
}

export async function httpPost(
  url: string,
  json: any,
  timeoutMs = 2000
): Promise<{ status: number; body: any; raw: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
      signal: controller.signal,
    });
    const raw = await res.text();
    let body: any = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    return { status: res.status, body, raw };
  } finally {
    clearTimeout(t);
  }
}

export async function waitForEndpoint(
  url: string,
  expectedStatus: number,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const intervalMs = opts.intervalMs ?? 200;

  const start = Date.now();
  let last: any = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const r = await httpGet(url, Math.min(1500, timeoutMs));
      last = r;
      if (r.status === expectedStatus) return;
    } catch (e) {
      last = { error: (e as Error).message };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `waitForEndpoint timeout: expected ${expectedStatus} for ${url}. last=${JSON.stringify(last)}`
  );
}

export function writeE2EArtifact(
  artifactDir: string,
  runId: string,
  payload: any
): string {
  fs.mkdirSync(artifactDir, { recursive: true });
  const file = path.join(artifactDir, `${runId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

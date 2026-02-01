#!/usr/bin/env node
/**
 * MLX-LM sidecar benchmark: latency vs prompt length and max_tokens.
 *
 * Self-contained: starts the MLX sidecar if not already running, runs benchmarks,
 * then stops the sidecar if this script started it (unless --leave-running).
 *
 * Usage:
 *   pnpm run benchmark:mlx              # Start sidecar if needed, benchmark, stop if we started it
 *   pnpm run benchmark:mlx -- --leave-running   # Leave sidecar running after benchmark
 *
 * Optional env: COGNITION_LLM_HOST=localhost COGNITION_LLM_PORT=5002
 *
 * @author @darianrosebrook
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const mlxDir = path.join(projectRoot, 'mlx-lm-sidecar');
const mlxPort = parseInt(process.env.COGNITION_LLM_PORT || '5002', 10);
const host = process.env.COGNITION_LLM_HOST || 'localhost';
const port = process.env.COGNITION_LLM_PORT || '5002';
const baseUrl = `http://${host}:${port}`;
const healthUrl = `http://localhost:${mlxPort}/health`;

const MODEL = 'gemma3n:e2b';
const DEFAULT_TEMP = 0.35;

function checkPort(port) {
  try {
    execSync(`lsof -Pi :${port} -sTCP:LISTEN -t`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function killProcessesByPort(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForService(url, maxAttempts = 60) {
  console.time(`waitForService ${url}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt === 1 || attempt % 30 === 0 || attempt > maxAttempts - 5) {
      process.stderr.write(`  MLX health check ${attempt}/${maxAttempts}...\n`);
    }
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.status >= 200 && res.status < 500) return;
    } catch (_) {}
    await wait(2000);
  }
  console.timeEnd(`waitForService ${url}`);
  throw new Error(`Service at ${url} not ready after ${maxAttempts} attempts`);
}

/**
 * Start MLX sidecar if port is free. Ensures venv exists; does not install deps.
 * Returns { child, started: true } or { child: null, started: false } if already running.
 */
function startMLXSidecar() {
  if (checkPort(mlxPort)) {
    return { child: null, started: false };
  }
  if (!fs.existsSync(mlxDir)) {
    throw new Error(`mlx-lm-sidecar not found at ${mlxDir}`);
  }
  const venvPath = path.join(mlxDir, 'venv-mlx');
  if (!fs.existsSync(path.join(venvPath, 'bin', 'python'))) {
    throw new Error(
      'MLX venv not found. Run from project root: cd mlx-lm-sidecar && python3 -m venv venv-mlx && ./venv-mlx/bin/pip install -r requirements.txt'
    );
  }
  const child = spawn(
    'bash',
    [
      '-c',
      `cd mlx-lm-sidecar && ./venv-mlx/bin/python mlx_server.py --port ${mlxPort}`,
    ],
    {
      stdio: 'pipe',
      shell: true,
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '1' },
    }
  );
  return { child, started: true };
}

function stopMLXSidecar(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch (_) {}
}

async function generate(prompt, numPredict = 256, temperature = DEFAULT_TEMP) {
  const start = performance.now();
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { temperature, num_predict: numPredict },
    }),
  });
  const clientMs = performance.now() - start;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MLX ${res.status}: ${text}`);
  }
  const data = await res.json();
  const serverNs = data.total_duration;
  const serverMs = serverNs != null ? serverNs / 1e6 : null;
  return {
    clientMs,
    serverMs,
    promptTokens: data.prompt_eval_count ?? 0,
    completionTokens: data.eval_count ?? 0,
    responseLength: (data.response || '').length,
  };
}

function makePrompt(charCount, template = 'observation') {
  const observationLike = `
Take the observation and decide what stands out most.
Return ONLY valid JSON: { "thought": { "text": "<one short sentence>", "confidence": 0.8 }, "actions": { "shouldRespond": false, "shouldCreateTask": false } }
Observation: Entity trader_llama at distance 12.2 blocks
Details: { "bot": { "position": { "x": 70, "y": 65, "z": -105 }, "health": 20, "food": 20 }, "entity": { "name": "trader_llama", "distance": 12.2 }, "timestamp": 1769910172166 }
Generate your JSON response:`;
  const short = `What do you notice? Reply in one short sentence.`;
  const pad = (s, n) => {
    if (s.length >= n) return s.slice(0, n);
    return s + ' ' + 'x'.repeat(n - s.length - 1);
  };
  if (template === 'observation') {
    return pad(observationLike.trim(), charCount);
  }
  return pad(short, charCount);
}

const leaveRunning = process.argv.includes('--leave-running');
const mlxState = { child: null, started: false };

async function cleanup() {
  if (!mlxState.started || !mlxState.child || leaveRunning) return;
  process.stderr.write('Stopping MLX sidecar... ');
  stopMLXSidecar(mlxState.child);
  await wait(2000);
  if (!mlxState.child.killed) {
    try {
      mlxState.child.kill('SIGKILL');
    } catch (_) {}
  }
  killProcessesByPort(mlxPort);
  process.stderr.write('done.\n');
}

async function main() {
  if (checkPort(mlxPort)) {
    console.log(`MLX sidecar already running on port ${mlxPort}; using it.\n`);
  } else {
    console.log('Starting MLX-LM sidecar...');
    const { child, started } = startMLXSidecar();
    mlxState.child = child;
    mlxState.started = started;
    if (mlxState.started) {
      await wait(5000);
      await waitForService(healthUrl, 450);
      console.log(`MLX sidecar ready at ${healthUrl}\n`);
    }
  }

  process.on('SIGINT', () => {
    cleanup().then(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    cleanup().then(() => process.exit(143));
  });

  console.log(`MLX benchmark: ${baseUrl} (model: ${MODEL})\n`);

  const scenarios = [
    {
      name: 'observation-like 400c / 128 tok',
      promptLen: 400,
      numPredict: 128,
    },
    {
      name: 'observation-like 400c / 256 tok',
      promptLen: 400,
      numPredict: 256,
    },
    {
      name: 'observation-like 400c / 512 tok',
      promptLen: 400,
      numPredict: 512,
    },
    {
      name: 'observation-like 800c / 256 tok',
      promptLen: 800,
      numPredict: 256,
    },
    {
      name: 'observation-like 800c / 128 tok',
      promptLen: 800,
      numPredict: 128,
    },
    { name: 'short 80c / 64 tok', promptLen: 80, numPredict: 64 },
    { name: 'short 80c / 128 tok', promptLen: 80, numPredict: 128 },
  ];

  const results = [];
  for (const s of scenarios) {
    const prompt = makePrompt(s.promptLen);
    process.stderr.write(`  ${s.name} ... `);
    try {
      const r = await generate(prompt, s.numPredict);
      results.push({
        name: s.name,
        promptChars: s.promptLen,
        numPredict: s.numPredict,
        ...r,
      });
      process.stderr.write(`${Math.round(r.clientMs)}ms\n`);
    } catch (e) {
      process.stderr.write(`FAIL: ${e.message}\n`);
      results.push({
        name: s.name,
        promptChars: s.promptLen,
        numPredict: s.numPredict,
        error: e.message,
      });
    }
  }

  console.log('\n--- Results ---');
  console.log(
    'Scenario                          | promptCh | maxTok | clientMs | serverMs | promptTok | complTok | respLen'
  );
  console.log(
    '----------------------------------|----------|--------|----------|----------|-----------|----------|--------'
  );
  for (const r of results) {
    if (r.error) {
      console.log(
        `${r.name.padEnd(34)} | ${String(r.promptChars).padStart(8)} | ${String(r.numPredict).padStart(6)} | ${r.error}`
      );
      continue;
    }
    const serverMsStr =
      r.serverMs != null ? String(Math.round(r.serverMs)) : 'n/a';
    console.log(
      [
        r.name.padEnd(34),
        String(r.promptChars).padStart(8),
        String(r.numPredict).padStart(6),
        String(Math.round(r.clientMs)).padStart(8),
        serverMsStr.padStart(8),
        String(r.promptTokens).padStart(9),
        String(r.completionTokens).padStart(8),
        String(r.responseLength).padStart(6),
      ].join(' | ')
    );
  }

  const ok = results.filter((r) => !r.error);
  if (ok.length > 0) {
    const avgClient = ok.reduce((a, r) => a + r.clientMs, 0) / ok.length;
    const avgServer = ok
      .filter((r) => r.serverMs != null)
      .reduce((a, r) => a + r.serverMs, 0);
    const nServer = ok.filter((r) => r.serverMs != null).length;
    console.log('\nAverage client latency (ms):', Math.round(avgClient));
    if (nServer) {
      console.log(
        'Average server duration (ms):',
        Math.round(avgServer / nServer)
      );
    }
  }

  await cleanup();
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});

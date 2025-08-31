// Planning server smoke test using compiled JS to avoid tsx restrictions (ESM)
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // Dynamically import compiled server module
  const modPath = pathToFileURL(path.join(__dirname, '..', 'dist', 'src', 'modular-server.js')).href;
  const mod = await import(modPath);

  const { startServer, serverConfig, cognitiveThoughtProcessor } = mod;

  try {
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    console.log('[smoke-js] starting planning server...');
    await startServer();

    await sleep(1000);

    const base = 'http://localhost:3002';
    const healthRes = await fetch(base + '/health');
    const health = await healthRes.json();
    console.log('[smoke-js] /health:', health.status, 'uptime', health.uptime);

    const stateRes = await fetch(base + '/state');
    const state = await stateRes.json();
    console.log('[smoke-js] /state success:', state.success);
    console.log('[smoke-js] current tasks:', state?.state?.tasks?.current?.length ?? 0);

    console.log('[smoke-js] shutting down...');
    try { cognitiveThoughtProcessor.stopProcessing(); } catch {}
    try {
      if (globalThis.__planningInterval) clearInterval(globalThis.__planningInterval);
      if (globalThis.__planningInitialKick) clearTimeout(globalThis.__planningInitialKick);
    } catch {}
    await serverConfig.stop();
    console.log('[smoke-js] done');
  } catch (err) {
    console.error('[smoke-js] failed:', err);
    process.exitCode = 1;
    try { await serverConfig.stop(); } catch {}
  }
}

main();


/*
 * Planning server smoke test: start server, hit endpoints, and shutdown.
 */

// Keep imports relative to TS sources to avoid pulling the CLI entry
import {
  startServer,
  serverConfig,
  cognitiveThoughtProcessor,
} from '../src/modular-server';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  try {
    // Reduce log noise for smoke
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';

    console.log('[smoke] starting planning server...');
    await startServer();

    // Allow server to initialize routers
    await sleep(1000);

    const base = 'http://localhost:3002';

    const healthRes = await fetch(base + '/health');
    const health = await healthRes.json();
    console.log('[smoke] /health:', health.status, 'uptime', health.uptime);

    const stateRes = await fetch(base + '/state');
    const state = await stateRes.json();
    console.log('[smoke] /state success:', state.success);
    console.log('[smoke] current tasks:', state?.state?.tasks?.current?.length ?? 0);

    console.log('[smoke] shutting down...');
    try {
      cognitiveThoughtProcessor.stopProcessing();
    } catch {}
    try {
      // @ts-ignore
      if (globalThis.__planningInterval) clearInterval(globalThis.__planningInterval);
      // @ts-ignore
      if (globalThis.__planningInitialKick) clearTimeout(globalThis.__planningInitialKick);
    } catch {}
    await serverConfig.stop();
    console.log('[smoke] done');
  } catch (err) {
    console.error('[smoke] failed:', err);
    process.exitCode = 1;
  }
}

main();


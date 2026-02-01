#!/usr/bin/env node
/**
 * Clear cognitive state: thought stores (cognitive-thoughts.json) and optionally
 * memory database tables. Use for a clean slate on the dashboard stream.
 *
 * Usage:
 *   node scripts/clear-cognitive-state.js              # Clear thoughts only
 *   node scripts/clear-cognitive-state.js --db         # Clear thoughts + reset DB
 *
 * DB reset requires WORLD_SEED in env (or defaults to '0'). Confirmation is sent
 * automatically when --db is used.
 *
 * @author @darianrosebrook
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function clearThoughtFiles() {
  const dataDir = path.join(ROOT, 'packages', 'dashboard', 'data');
  const defaultPath = path.join(dataDir, 'cognitive-thoughts.json');
  const thoughtsDir = path.join(dataDir, 'thoughts');
  const cleared = [];

  try {
    await fs.mkdir(path.dirname(defaultPath), { recursive: true });
    await fs.writeFile(defaultPath, JSON.stringify([], null, 2), 'utf-8');
    cleared.push(defaultPath);
  } catch (err) {
    console.warn('Could not clear default thoughts file:', err.message);
  }

  try {
    const entries = await fs.readdir(thoughtsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const filePath = path.join(thoughtsDir, ent.name, 'cognitive-thoughts.json');
        try {
          await fs.writeFile(filePath, JSON.stringify([], null, 2), 'utf-8');
          cleared.push(filePath);
        } catch (err) {
          console.warn(`Could not clear ${filePath}:`, err.message);
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Could not read thoughts directory:', err.message);
    }
  }

  return cleared;
}

async function resetDatabase() {
  const memoryUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:3001';
  const worldSeed = process.env.WORLD_SEED || '0';

  const res = await fetch(`${memoryUrl}/enhanced/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: worldSeed }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}

async function main() {
  const doDb = process.argv.includes('--db');

  console.log('Clearing cognitive thought stores...');
  const cleared = await clearThoughtFiles();
  console.log(`Cleared ${cleared.length} thought store(s):`);
  cleared.forEach((p) => console.log(`  - ${path.relative(ROOT, p)}`));

  if (doDb) {
    console.log('\nResetting memory database...');
    try {
      const result = await resetDatabase();
      console.log(`Database reset: ${result.message}`);
    } catch (err) {
      console.error('Database reset failed:', err.message);
      console.error('Ensure memory service is running (port 3001) and WORLD_SEED matches.');
      process.exit(1);
    }
  } else {
    console.log('\nTo also reset memory tables, run: node scripts/clear-cognitive-state.js --db');
  }

  console.log('\nDone. Restart or refresh the dashboard for a clean stream.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

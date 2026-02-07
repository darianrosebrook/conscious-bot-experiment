/**
 * Tripwire: no new process.env reads outside allowlisted paths.
 *
 * Policy:
 * - Use this test as the guard against new env scatter. CI fails if any
 *   non-allowlisted file contains process.env.
 * - Migrate allowlisted modules to config over time: move their env reads
 *   into planning-runtime-config.ts (or a dedicated config module), then
 *   remove the path from the allowlist so the tripwire continues to enforce.
 * - Do not add new allowlist entries without a migration plan; prefer adding
 *   new flags to planning-runtime-config and consuming them from there.
 *
 * Canonical: planning-runtime-config.ts only.
 * Legacy allowlist (migrate to config over time): modular-server, planning-endpoints,
 * server-config, task-integration, and the exact paths listed below.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(__dirname, '..');

const ALLOWLIST_PATTERNS: Array<(p: string) => boolean> = [
  (p) => p === 'planning-runtime-config.ts',
  (p) => p === 'modular-server.ts',
  (p) => p.startsWith('modules/planning-endpoints'),
  (p) => p.startsWith('modules/server-config'),
  (p) => p === 'task-integration.ts',
  (p) => p.startsWith('interfaces/task-integration'),
  (p) => p.includes('__tests__'),
  (p) => p.startsWith('task-integration/'),
  // Legacy allowlist: exact paths only. Do not add new paths; migrate to config instead.
  (p) => p === 'behavior-trees/BehaviorTreeRunner.ts',
  (p) => p === 'cognitive-thought-processor.ts',
  (p) => p === 'goal-formulation/task-bootstrapper.ts',
  (p) => p === 'memory-integration.ts',
  (p) => p === 'modules/action-plan-backend.ts',
  (p) => p === 'modules/cognitive-stream-client.ts',
  (p) => p === 'modules/keep-alive-integration.ts',
  (p) => p === 'modules/mc-client.ts',
  (p) => p === 'modules/mcp-integration.ts',
  (p) => p === 'modules/requirements.ts',
  (p) => p === 'reactive-executor/reactive-executor.ts',
  (p) => p === 'server/autonomous-executor.ts',
  (p) => p === 'server/execution-gateway.ts',
  (p) => p === 'server/execution-readiness.ts',
  (p) => p === 'skill-integration/llm-skill-composer.ts',
  (p) => p === 'skill-integration/mcp-integration.ts',
  (p) => p === 'startup-barrier.ts',
  (p) => p === 'sterling/base-domain-solver.ts',
  (p) => p === 'sterling/search-health.ts',
  (p) => p === 'sterling/sterling-reasoning-service.ts',
  (p) => p === 'world-state/world-knowledge-integrator.ts',
  (p) => p === 'world-state/world-state-manager.ts',
];

function isAllowlisted(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return ALLOWLIST_PATTERNS.some((fn) => fn(normalized));
}

function* walkTsFiles(dir: string, base = ''): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      yield* walkTsFiles(path.join(dir, e.name), rel);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      yield rel;
    }
  }
}

describe('env-scatter tripwire', () => {
  it('no process.env reads outside allowlisted paths', () => {
    const violations: string[] = [];
    for (const rel of walkTsFiles(SRC_DIR)) {
      if (isAllowlisted(rel)) continue;
      const full = path.join(SRC_DIR, rel);
      const content = fs.readFileSync(full, 'utf8');
      if (/process\.env\b/.test(content)) {
        violations.push(rel);
      }
    }
    expect(
      violations,
      `process.env may only appear in allowlisted files. Add new control-plane flags to planning-runtime-config.ts. Violations: ${violations.join(', ')}`
    ).toEqual([]);
  });
});

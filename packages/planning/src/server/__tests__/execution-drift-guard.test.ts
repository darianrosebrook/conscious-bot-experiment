/**
 * Execution Drift Guard
 *
 * CI-level test that fails if banned execution patterns are introduced.
 * Ensures Invariant E0: all world-mutating actions must flow through
 * the ExecutionGateway (execution-gateway.ts).
 *
 * This test uses rg/grep-style file scanning — no runtime behavior.
 * If it fails, someone introduced a direct /action caller outside
 * the gateway or constructed an ActionTranslator outside allowed modules.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PLANNING_SRC = path.resolve(__dirname, '../../..');
const PACKAGES_ROOT = path.resolve(PLANNING_SRC, '..');
const MC_INTERFACE_SRC = path.resolve(PACKAGES_ROOT, 'minecraft-interface/src');

function scanFiles(
  dir: string,
  ext: string,
  pattern: RegExp,
  excludePatterns: string[] = [],
): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];

  function walk(d: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        const rel = path.relative(PLANNING_SRC, full);
        if (excludePatterns.some((p) => rel.includes(p))) continue;
        const content = fs.readFileSync(full, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            hits.push({ file: rel, line: i + 1, text: lines[i].trim() });
          }
        }
      }
    }
  }

  walk(dir);
  return hits;
}

describe('Execution Drift Guard', () => {
  it('no direct fetch(/action) calls outside gateway in planning/src', () => {
    // Pattern: fetch(.../action...) — direct HTTP calls to MC interface /action
    const pattern = /fetch\s*\(\s*[`'"].*\/action|fetch\s*\(\s*\$\{.*\/action/;
    const hits = scanFiles(PLANNING_SRC, '.ts', pattern, [
      'execution-gateway.ts', // The gateway itself is allowed
    ]);

    if (hits.length > 0) {
      const msg = hits
        .map((h) => `  ${h.file}:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found direct fetch(/action) calls outside the ExecutionGateway.\n` +
        `All /action calls must go through executeViaGateway().\n` +
        `Violations:\n${msg}`
      );
    }
  });

  it('no direct mcPostJson(/action) calls outside gateway in planning/src', () => {
    const pattern = /mcPostJson\s*\(\s*['"`]\/action/;
    const hits = scanFiles(PLANNING_SRC, '.ts', pattern, [
      'execution-gateway.ts',
    ]);

    if (hits.length > 0) {
      const msg = hits
        .map((h) => `  ${h.file}:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found direct mcPostJson('/action') calls outside the ExecutionGateway.\n` +
        `All /action calls must go through executeViaGateway().\n` +
        `Violations:\n${msg}`
      );
    }
  });

  it('no new ActionTranslator() outside allowed modules', () => {
    // Pattern: new ActionTranslator( — only allowed in:
    // - action-translator-singleton.ts (type reference)
    // - plan-executor.ts (canonical construction)
    // - standalone*.ts (non-prod)
    // - test files (__tests__/)
    const pattern = /new\s+ActionTranslator\s*\(/;
    const hits = scanFiles(MC_INTERFACE_SRC, '.ts', pattern, [
      'action-translator-singleton.ts',
      'plan-executor.ts',
      'standalone',
      'action-translator.ts', // The class definition file itself
      'server.ts', // /action endpoint fallback constructor (P3: make fail-closed)
    ]);

    if (hits.length > 0) {
      const msg = hits
        .map((h) => `  ${path.relative(MC_INTERFACE_SRC, '')}/${h.file}:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found new ActionTranslator() outside allowed modules.\n` +
        `ActionTranslator must be obtained via getActionTranslator() singleton.\n` +
        `Violations:\n${msg}`
      );
    }
  });

  it('no fetch(/action) in cognition package (all routes through planning)', () => {
    const cognitionSrc = path.resolve(PLANNING_SRC, '../../cognition/src');
    const pattern = /fetch\s*\(\s*[`'"].*\/action|fetch\s*\(\s*\$\{.*\/action/;
    const hits = scanFiles(cognitionSrc, '.ts', pattern, []);

    if (hits.length > 0) {
      const msg = hits
        .map((h) => `  ${h.file}:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found direct fetch(/action) calls in cognition package.\n` +
        `Cognition must route actions through the planning service, not MC interface.\n` +
        `Violations:\n${msg}`
      );
    }
  });

  it('no bare pathfinder.goto() outside allowed files in minecraft-interface', () => {
    // pathfinder.goto() must only appear in:
    // - action-translator.ts (inside withNavLease closures or executeNavigate)
    // - interaction-leaves.ts (leaf implementations, called via dispatchToLeaf)
    // - navigation-bridge.ts (the bridge that owns pathfinder)
    // - standalone*.ts (non-prod testing)
    // - __tests__/ (excluded by scanFiles)
    const pattern = /pathfinder\.goto\s*\(/;
    const hits = scanFiles(MC_INTERFACE_SRC, '.ts', pattern, [
      'action-translator.ts',
      'interaction-leaves.ts',
      'navigation-bridge.ts',
      'standalone',
    ]);

    if (hits.length > 0) {
      const msg = hits
        .map((h) => `  ${h.file}:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found pathfinder.goto() outside allowed files.\n` +
        `Navigation must go through ActionTranslator.withNavLease() or executeNavigate().\n` +
        `Violations:\n${msg}`
      );
    }
  });

  it('every pathfinder.goto() in action-translator.ts is inside withNavLease()', () => {
    // Heuristic: for each pathfinder.goto( line, one of the preceding 10 lines
    // must contain 'withNavLease(' (the closure pattern).
    // executeNavigate uses NavigationBridge.navigateTo(), not direct goto,
    // so there should be no goto calls outside withNavLease closures.
    const filePath = path.join(MC_INTERFACE_SRC, 'action-translator.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const gotoPattern = /pathfinder\.goto\s*\(/;
    const leasePattern = /withNavLease\s*\(/;
    const bareGotoHits: { line: number; text: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (!gotoPattern.test(lines[i])) continue;

      // Check preceding 10 lines for withNavLease(
      let foundLease = false;
      for (let j = Math.max(0, i - 10); j < i; j++) {
        if (leasePattern.test(lines[j])) {
          foundLease = true;
          break;
        }
      }
      if (!foundLease) {
        bareGotoHits.push({ line: i + 1, text: lines[i].trim() });
      }
    }

    if (bareGotoHits.length > 0) {
      const msg = bareGotoHits
        .map((h) => `  action-translator.ts:${h.line}: ${h.text}`)
        .join('\n');
      expect.fail(
        `Found bare pathfinder.goto() in action-translator.ts not inside withNavLease().\n` +
        `All pathfinder.goto() calls must be wrapped in withNavLease() to enforce the navigation lease.\n` +
        `Violations:\n${msg}`
      );
    }
  });
});

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
const COGNITION_SRC = path.resolve(PACKAGES_ROOT, 'cognition/src');

/** Returns true if `p` is an existing directory. */
function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Scans files in `dir` matching `ext` for lines matching `pattern`.
 *
 * FAIL-CLOSED: throws if `dir` does not exist or is not a directory.
 * This prevents guards from silently passing when a path refactor moves
 * the scanned directory or when a constant accidentally points at a file.
 */
function scanFiles(
  dir: string,
  ext: string,
  pattern: RegExp,
  excludePatterns: string[] = []
): { file: string; line: number; text: string }[] {
  if (!isDirectory(dir)) {
    throw new Error(
      `scanFiles: not a directory (or does not exist): ${dir}\n` +
        `This drift guard is fail-closed — if the directory moved, update the path constant.`
    );
  }

  const hits: { file: string; line: number; text: string }[] = [];

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__')
          continue;
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
  // --- Scan-root existence assertions (fail-closed) ---
  // If any of these fail, a path refactor broke the guard and all downstream
  // scans would silently pass against nothing. Fix the path constants above.
  it('scan roots are directories on disk', () => {
    expect(
      isDirectory(PLANNING_SRC),
      `PLANNING_SRC not a directory: ${PLANNING_SRC}`
    ).toBe(true);
    expect(
      isDirectory(MC_INTERFACE_SRC),
      `MC_INTERFACE_SRC not a directory: ${MC_INTERFACE_SRC}`
    ).toBe(true);
    expect(
      isDirectory(COGNITION_SRC),
      `COGNITION_SRC not a directory: ${COGNITION_SRC}`
    ).toBe(true);
  });

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
    // - server.ts (boot fallback — ratcheted to exactly 1 in separate test)
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
        .map(
          (h) =>
            `  ${path.relative(MC_INTERFACE_SRC, '')}/${h.file}:${h.line}: ${h.text}`
        )
        .join('\n');
      expect.fail(
        `Found new ActionTranslator() outside allowed modules.\n` +
          `ActionTranslator must be obtained via getActionTranslator() singleton.\n` +
          `Violations:\n${msg}`
      );
    }
  });

  it('server.ts has exactly 1 new ActionTranslator() (ratchet — P3: make fail-closed)', () => {
    // server.ts is allow-listed above because it has a boot fallback constructor.
    // This ratchet ensures the debt doesn't grow: if someone adds another constructor
    // call in server.ts, CI fails.
    //
    // EXIT CRITERIA (P3): When server.ts returns 503 during boot instead of
    // constructing a fallback translator, EXPECTED_COUNT drops to 0 and the
    // 'server.ts' entry in the allow-list above can be removed.
    const EXPECTED_COUNT = 1;
    const serverPath = path.join(MC_INTERFACE_SRC, 'server.ts');
    const lines = fs.readFileSync(serverPath, 'utf-8').split('\n');
    const pattern = /new\s+ActionTranslator\s*\(/;
    // Only count non-comment code lines to avoid false matches on documentation.
    const codeMatches = lines.filter(
      (line) => pattern.test(line) && !line.trimStart().startsWith('//')
    );

    expect(codeMatches.length).toBe(EXPECTED_COUNT);
  });

  it('no fetch(/action) in cognition package (all routes through planning)', () => {
    const pattern = /fetch\s*\(\s*[`'"].*\/action|fetch\s*\(\s*\$\{.*\/action/;
    const hits = scanFiles(COGNITION_SRC, '.ts', pattern, []);

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

  it('action-translator.ts has exactly 7 pathfinder.goto() calls (count ratchet)', () => {
    // Complements the proximity heuristic: the heuristic catches ungated gotos,
    // this count lock catches "new goto added at all." If you legitimately add a
    // new goto, update this count AND ensure the proximity test passes (i.e. it's
    // inside withNavLease).
    // 5 original + 2 for explore-for-resources block pathing (perception + spiral)
    const EXPECTED_GOTO_COUNT = 7;
    const filePath = path.join(MC_INTERFACE_SRC, 'action-translator.ts');
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    // Match the full call-site pattern (this.bot.pathfinder.goto) on non-comment lines
    // to avoid false matches on documentation, logs, or string literals.
    const pattern = /this\.bot\.pathfinder\.goto\s*\(/;
    const codeMatches = lines.filter(
      (line) => pattern.test(line) && !line.trimStart().startsWith('//')
    );

    expect(codeMatches.length).toBe(EXPECTED_GOTO_COUNT);
  });

  // ---------------------------------------------------------------------------
  // Typed Gateway Wrapper Drift Guards
  // ---------------------------------------------------------------------------

  it('modular-server.ts uses executeTaskViaGateway or executeActionWithBotCheck (not raw executeViaGateway with origin: executor)', () => {
    // The modular-server should use the typed wrapper (executeTaskViaGateway)
    // or the wrapper function (executeActionWithBotCheck) which internally uses it.
    // Raw executeViaGateway calls with origin: 'executor' should not exist outside
    // the executeActionWithBotCheck wrapper.
    const filePath = path.join(PLANNING_SRC, 'src/modular-server.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Pattern: raw executeViaGateway({ origin: 'executor' ... }) calls
    // These should only exist inside executeActionWithBotCheck
    const pattern =
      /executeViaGateway\s*\(\s*\{[^}]*origin:\s*['"]executor['"]/;

    // Count matches that are NOT inside the executeActionWithBotCheck function
    let outsideWrapperCount = 0;
    let insideWrapper = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Track when we enter/exit the executeActionWithBotCheck function
      if (line.includes('async function executeActionWithBotCheck')) {
        insideWrapper = true;
      }
      // Simple heuristic: function ends at first non-indented closing brace after start
      // This is approximate but catches obvious violations
      if (insideWrapper && /^}/.test(line.trim()) && i > 0) {
        insideWrapper = false;
      }

      if (
        pattern.test(line) &&
        !insideWrapper &&
        !line.trimStart().startsWith('//')
      ) {
        outsideWrapperCount++;
      }
    }

    // Allow 0 raw calls outside the wrapper (all calls should go through wrapper or typed function)
    // Note: executeActionWithBotCheck itself contains 1 raw call for the fallback path
    expect(outsideWrapperCount).toBe(0);
  });

  it('reactive-executor uses executeReactiveViaGateway (not raw executeViaGateway with origin: reactive)', () => {
    const files = [
      path.join(PLANNING_SRC, 'src/reactive-executor/reactive-executor.ts'),
    ];

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      // Pattern: raw executeViaGateway({ origin: 'reactive' ... }) calls
      const pattern =
        /executeViaGateway\s*\(\s*\{[^}]*origin:\s*['"]reactive['"]/g;
      const matches = content.match(pattern) || [];

      expect(matches.length).toBe(0);
    }
  });
});

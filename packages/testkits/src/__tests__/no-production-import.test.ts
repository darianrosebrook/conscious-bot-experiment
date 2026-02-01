/**
 * Anti-footgun tripwires:
 * 1. No production import of @conscious-bot/testkits
 * 2. No bare "p21" claim without sub-primitive suffix in closeout docs
 * 3. No domain vocabulary in capsule/contract definitions
 * 4. No domain package imports in contract/suite files
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('testkits import guard', () => {
  it('no production code imports @conscious-bot/testkits', () => {
    // Find .ts files with actual import statements (not comments)
    // Step 1: get all files mentioning @conscious-bot/testkits
    // Step 2: filter to only those with actual import/from statements on non-comment lines
    let output: string;
    try {
      output = execSync(
        `grep -rn "@conscious-bot/testkits" packages/ --include="*.ts" --include="*.d.ts"`,
        { cwd: REPO_ROOT, encoding: 'utf-8' },
      ).trim();
    } catch {
      // grep returns exit code 1 when no matches — that's perfectly fine
      output = '';
    }

    if (!output) return; // No mentions at all = pass

    const lines = output.split('\n').filter(Boolean);

    // Filter to actual import lines (not comments)
    const importLines = lines.filter((line) => {
      // Extract the content after "filename:linenum:"
      const contentMatch = line.match(/^[^:]+:\d+:(.*)$/);
      if (!contentMatch) return false;
      const content = contentMatch[1].trim();

      // Skip comments
      if (content.startsWith('//') || content.startsWith('*') || content.startsWith('/*')) {
        return false;
      }

      // Must be an actual import/require statement
      return /(?:^import\s|from\s+['"]@conscious-bot\/testkits|require\(['"]@conscious-bot\/testkits)/.test(content);
    });

    // Extract unique file paths
    const files = [...new Set(importLines.map((line) => line.split(':')[0]))];

    // Allowed patterns: test files, vitest configs, testkits package itself
    const allowedPatterns = [
      /__tests__\//,
      /\.test\./,
      /\.spec\./,
      /vitest\.config/,
      /^packages\/testkits\//,
    ];

    const violations = files.filter(
      (f) => !allowedPatterns.some((pattern) => pattern.test(f)),
    );

    expect(violations).toEqual([]);
  });
});

describe('bare p21 claim guard', () => {
  it('closeout packet never claims bare "p21" without sub-primitive suffix', () => {
    const closeoutPath = path.join(REPO_ROOT, 'docs/planning/p21-closeout-packet.md');

    let content: string;
    try {
      content = readFileSync(closeoutPath, 'utf-8');
    } catch {
      // File doesn't exist yet — vacuously passes
      return;
    }

    const lines = content.split('\n');
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match bare "p21" used as a claim identifier (in backticks or as a standalone word
      // before "compliant"/"certified"/"claim"), but not when followed by .a/.b or a/b suffix
      // Skip lines that are defining the naming convention or discussing "bare p21"
      if (line.includes('never bare') || line.includes('not bare') || line.includes('bare `p21`')) {
        continue;
      }
      // Match backtick-quoted bare p21 that isn't followed by .a/.b
      const matches = line.matchAll(/`p21`(?!\.)/g);
      for (const match of matches) {
        violations.push(`Line ${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('domain boundary guards', () => {
  // Contract/capsule files that must not contain domain vocabulary
  const CONTRACT_FILES = [
    'packages/planning/src/sterling/primitives/p21/p21-capsule-types.ts',
    'packages/planning/src/sterling/primitives/p21/index.ts',
    'packages/testkits/src/p21/p21a-conformance-suite.ts',
    'packages/testkits/src/p21/p21b-conformance-suite.ts',
    'packages/testkits/src/capability-proof-manifest.ts',
  ];

  it('no domain vocabulary in capsule/contract code (comments excluded)', () => {
    const domainTerms = /minecraft|zombie|skeleton|creeper|spider|enderman/i;
    const violations: string[] = [];

    for (const relPath of CONTRACT_FILES) {
      const absPath = path.join(REPO_ROOT, relPath);
      let content: string;
      try {
        content = readFileSync(absPath, 'utf-8');
      } catch {
        continue; // File doesn't exist — skip
      }

      const lines = content.split('\n');
      let inBlockComment = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        // Track block comment state
        if (trimmed.startsWith('/*') || trimmed.startsWith('/**')) {
          inBlockComment = true;
        }
        if (inBlockComment) {
          if (trimmed.includes('*/')) {
            inBlockComment = false;
          }
          continue;
        }

        // Skip single-line comments
        if (trimmed.startsWith('//')) continue;

        // Strip inline comments before checking
        const codeOnly = trimmed.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (domainTerms.test(codeOnly)) {
          violations.push(`${relPath}:${i + 1}: ${trimmed.slice(0, 80)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no domain package imports in contract/suite files', () => {
    const domainImport = /from\s+['"]@conscious-bot\/minecraft|require\(\s*['"]@conscious-bot\/minecraft/;
    const violations: string[] = [];

    for (const relPath of CONTRACT_FILES) {
      const absPath = path.join(REPO_ROOT, relPath);
      let content: string;
      try {
        content = readFileSync(absPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip comments
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) {
          continue;
        }
        if (domainImport.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${line.slice(0, 80)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

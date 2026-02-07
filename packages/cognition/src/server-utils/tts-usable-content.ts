/**
 * TTS Usable Content Check (Temporary Copy During PR4 Migration)
 *
 * This file contains an exact copy of isUsableContent and its dependencies from
 * llm-output-sanitizer.ts to avoid importing from the deprecated module.
 *
 * OPERATIONAL REQUIREMENT:
 * If you change isUsableContent, hasCodeLikeDensity, or GENERIC_FILLER_PATTERNS
 * in llm-output-sanitizer.ts, update this copy to match, OR preferably migrate
 * this call site to language-io and delete this file entirely.
 *
 * This is a temporary fork to maintain semantic equivalence during the PR4
 * migration. Once thought-stream-helpers is migrated to language-io, delete
 * this entire file.
 *
 * @see packages/cognition/src/llm-output-sanitizer.ts (canonical source)
 * @author @darianrosebrook
 */

// ============================================================================
// Generic filler patterns (copied from llm-output-sanitizer)
// ============================================================================

const GENERIC_FILLER_PATTERNS = [
  /^maintaining awareness of surroundings\.?$/i,
  /^observing surroundings\.?$/i,
  /^monitoring the environment\.?$/i,
  /^staying alert\.?$/i,
  /^keeping watch\.?$/i,
  /^looking around\.?$/i,
  /^nothing to report\.?$/i,
];

/**
 * Detect code-like content using line density (copied from llm-output-sanitizer).
 *
 * Two checks:
 * 1. Multi-line: >40% of lines have code-like patterns (3+ lines required)
 * 2. Single-line/short: high symbol density (brackets, semicolons, operators)
 */
function hasCodeLikeDensity(text: string): boolean {
  const lines = text.split('\n');

  // Single-line / short text: check symbol density
  if (lines.length < 3) {
    const stripped = text.replace(/\s/g, '');
    if (stripped.length < 10) return false;
    const symbolChars = (stripped.match(/[(){}[\];=<>|&!^~+\-*/\\@#$%]/g) || [])
      .length;
    return symbolChars / stripped.length > 0.25;
  }

  // Multi-line: line-by-line density scoring
  let codeIndicators = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Code indicators: brackets, braces, semicolons, keywords
    if (/[(){}[\];]/.test(trimmed)) codeIndicators++;
    if (
      /\b(const|let|var|function|import|export|class|interface|type)\b/.test(
        trimmed
      )
    )
      codeIndicators++;
  }

  return codeIndicators / lines.length > 0.4;
}

/**
 * Check if content is usable (not empty, not too short, not generic filler, not code).
 *
 * Copied from llm-output-sanitizer.isUsableContent to maintain semantic equivalence
 * without importing from the deprecated module.
 *
 * @param text - Text to check for usability
 * @returns true if text is usable, false otherwise
 */
export function isUsableForTTS(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0) return false;
  if (trimmed.length < 5) return false;

  if (hasCodeLikeDensity(trimmed)) return false;

  for (const pattern of GENERIC_FILLER_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
}

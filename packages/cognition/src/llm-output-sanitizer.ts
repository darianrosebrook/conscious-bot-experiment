/**
 * LLM Output Sanitizer
 *
 * Standardizes and sanitizes MLX/Ollama LLM output at the generation boundary
 * so all downstream consumers receive clean text.
 *
 * Pipeline: stripCodeFences -> stripSystemPromptLeaks -> extractGoalTag ->
 *           truncateDegeneration -> stripTrailingGarbage -> normalizeWhitespace
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Types
// ============================================================================

export interface SanitizedOutput {
  text: string;
  goalTag: GoalTag | null;
  goalTagV1: GoalTagV1 | null;
  flags: SanitizationFlags;
}

export interface GoalTag {
  action: string;
  target: string;
  amount: number | null;
}

/**
 * Structured goal tag with version, canonical action, and raw text for debugging.
 * This is the single source of truth for goal extraction — downstream code reads
 * this instead of re-parsing text.
 */
export interface GoalTagV1 {
  version: 1;
  action: string;         // canonical, from CANONICAL_ACTIONS allowlist
  target: string;         // normalized lowercase
  targetId: string | null; // explicit task ID from id= token
  amount: number | null;
  raw: string;            // original tag text for debugging
}

/**
 * Reason why goal tag extraction failed.
 * 'none' means extraction succeeded or no tag was present at all.
 */
export type GoalTagFailReason =
  | 'none'               // extraction succeeded or no tag in input
  | 'no_tag'             // no [GOAL: opener found
  | 'tag_too_long'       // inner content exceeded 100-char scan limit
  | 'malformed'          // closing bracket missing or unparseable structure
  | 'unknown_action'     // action not in CANONICAL_ACTIONS after normalization
  | 'no_target'          // action present but no target tokens inside brackets
  | 'empty_inner';       // [GOAL:] with nothing inside

export interface SanitizationFlags {
  hadCodeFences: boolean;
  hadSystemPromptLeak: boolean;
  hadDegeneration: boolean;
  hadTrailingGarbage: boolean;
  hadCodeContent: boolean;
  rawGoalTag: string | null; // original tag text when parsing fails, for debugging
  goalTagFailReason: GoalTagFailReason;
  /** Number of [GOAL: openers found (for multi-tag observability) */
  goalTagCount: number;
  originalLength: number;
  cleanedLength: number;
}

// ============================================================================
// Known system prompt prefixes (from llm-interface.ts generateInternalThought)
// ============================================================================

const SYSTEM_PROMPT_PREFIXES = [
  'You are my private inner thought',
  'You are an agent',
  'Write exactly one or two short sentences',
  'Say what I notice',
  'Use names that appear in the situation',
  'Only if I\'m committing to a concrete action',
];

// ============================================================================
// Generic filler patterns that indicate non-useful content
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

// ============================================================================
// Action normalization — maps synonyms to canonical goal actions
// Versioned: changes to this map change meaning, not just parsing.
// Bump NORMALIZE_MAP_VERSION when adding/removing/changing entries.
// ============================================================================

export const NORMALIZE_MAP_VERSION = 2;

const ACTION_NORMALIZE_MAP: Record<string, string> = {
  dig: 'mine',
  break: 'mine',
  harvest: 'mine',
  get: 'collect',
  obtain: 'collect',
  pickup: 'collect',
  make: 'craft',
  create: 'craft',
  construct: 'build',
  assemble: 'build',
  reinforce: 'build',
  fortify: 'build',
  locate: 'find',
  search: 'find',
  look: 'find',
  identify: 'find',
  move: 'navigate',
  go: 'navigate',
  reach: 'navigate',
  walk: 'navigate',
  travel: 'navigate',
  run: 'navigate',
  observe: 'check',
  assess: 'check',
  inspect: 'check',
  acknowledge: 'check',
  acquire: 'gather',
  increase: 'gather',
  fix: 'repair',
  mend: 'repair',
  restore: 'repair',
  cook: 'smelt',
  hear: 'check',
  listen: 'check',
  // Management action synonyms (v2)
  remove: 'cancel',
  drop: 'cancel',
  abort: 'cancel',
  stop: 'cancel',
  boost: 'prioritize',
  promote: 'prioritize',
  hold: 'pause',
  defer: 'pause',
  suspend: 'pause',
  unpause: 'resume',
  restart: 'resume',
};

/**
 * Normalize a raw goal action to its canonical form.
 * Unknown actions pass through unchanged.
 */
export function normalizeGoalAction(raw: string): string {
  const lower = raw.toLowerCase().replace(/^_+|_+$/g, '');
  return ACTION_NORMALIZE_MAP[lower] ?? lower;
}

// ============================================================================
// Canonical actions allowlist (strict, versioned)
// ============================================================================

export const CANONICAL_ACTIONS = new Set([
  'collect', 'mine', 'craft', 'build', 'find', 'explore',
  'navigate', 'gather', 'check', 'smelt', 'repair', 'continue',
  // Management actions (v2)
  'cancel', 'prioritize', 'pause', 'resume',
]);

// ============================================================================
// Pipeline Steps
// ============================================================================

/**
 * Step 0.5: Strip wrapping quotation marks the model sometimes adds.
 * Handles unbalanced pairs (e.g. `"Hey! How's it going?` with only an opener).
 */
export function stripWrappingQuotes(text: string): string {
  let result = text.trim();
  // Balanced pair: starts and ends with the same quote character
  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'")) ||
    (result.startsWith('\u201c') && result.endsWith('\u201d'))
  ) {
    result = result.slice(1, -1).trim();
  } else if (result.startsWith('"') || result.startsWith("'") || result.startsWith('\u201c')) {
    // Unbalanced: leading quote with no closer
    result = result.slice(1).trim();
  } else if (result.endsWith('"') || result.endsWith("'") || result.endsWith('\u201d')) {
    // Unbalanced: trailing quote with no opener
    result = result.slice(0, -1).trim();
  }
  return result;
}

/**
 * Step 1: Remove code fences while preserving single/double backticks
 * used for item names like `oak_log`.
 */
export function stripCodeFences(text: string): string {
  // Remove ```lang openers (with optional language tag) and ``` closers
  // Handle both inline and multiline fences
  let result = text;

  // Remove opening fences with optional language tag: ```text, ```json, etc.
  result = result.replace(/```[a-zA-Z]*\s*/g, '');

  // Remove closing/standalone triple backticks
  result = result.replace(/```/g, '');

  return result;
}

/**
 * Step 2: Strip leaked system prompt fragments.
 * If text starts with a known system prompt prefix, remove everything
 * up to the first sentence boundary after the prefix.
 */
export function stripSystemPromptLeaks(text: string): string {
  let result = text;

  for (const prefix of SYSTEM_PROMPT_PREFIXES) {
    const lowerResult = result.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();

    if (lowerResult.startsWith(lowerPrefix)) {
      // Remove the prefix and everything up to the first sentence that
      // looks like actual bot content (starts with "I " or a capital
      // after a sentence boundary).
      let rest = result.slice(prefix.length);

      // If there's a sentence boundary (. or ... or ;) followed by
      // content starting with a capital letter, skip to that content.
      const sentenceBoundary = rest.match(/[.…;!?]+\s+([A-Z])/);
      if (sentenceBoundary && sentenceBoundary.index !== undefined) {
        // Jump to the capital letter after the boundary
        rest = rest.slice(sentenceBoundary.index + sentenceBoundary[0].length - 1);
      } else {
        // No sentence boundary found — just strip connectors
        rest = rest.replace(/^[\s.,;:…]+/, '');
        rest = rest.replace(/^(and\s+|that\s+|so\s+|but\s+)/i, '');
      }

      result = rest;
    }
  }

  return result;
}

/**
 * Step 3: Extract [GOAL: action target amount?] tag from text.
 *
 * Bounded-scan parser (no regex backtracking):
 * 1. Locate `[GOAL:` via indexOf
 * 2. Find matching `]` via bounded scan (max 100 chars)
 * 3. Tokenize inner text, validate against CANONICAL_ACTIONS allowlist
 * 4. Also handle trailing amount after `]` (e.g. `[GOAL: craft wood] 20`)
 *
 * Fail-closed: unknown actions → goal: null (raw tag preserved in flags for debugging).
 */
export function extractGoalTag(text: string): {
  text: string;
  goal: GoalTag | null;
  goalV1: GoalTagV1 | null;
  rawGoalTag: string | null;
  failReason: GoalTagFailReason;
  tagCount: number;
} {
  // Count total [GOAL: openers for multi-tag observability
  const upperText = text.toUpperCase();
  let tagCount = 0;
  let searchFrom = 0;
  while (true) {
    const idx = upperText.indexOf('[GOAL:', searchFrom);
    if (idx === -1) break;
    tagCount++;
    searchFrom = idx + 6;
  }

  const openerIdx = upperText.indexOf('[GOAL:');
  if (openerIdx === -1) {
    return { text, goal: null, goalV1: null, rawGoalTag: null, failReason: 'no_tag', tagCount: 0 };
  }

  // Find closing bracket within 100 chars of opener
  const scanLimit = openerIdx + 106; // [GOAL: = 6 chars + 100
  const searchEnd = Math.min(scanLimit, text.length);
  let closerIdx = -1;
  for (let i = openerIdx + 6; i < searchEnd; i++) {
    if (text[i] === ']') {
      closerIdx = i;
      break;
    }
  }

  // Check if tag exceeded scan limit (closing bracket exists beyond 100 chars)
  let tagTooLong = false;
  if (closerIdx === -1 && scanLimit < text.length) {
    // Check if there's a ] beyond the scan window
    const laterCloser = text.indexOf(']', scanLimit);
    if (laterCloser !== -1) {
      tagTooLong = true;
    }
  }

  // Handle malformed (no closing bracket): scan to end of line or end of text
  const tagStart = openerIdx;
  let tagEnd: number;
  let inner: string;

  if (closerIdx !== -1) {
    tagEnd = closerIdx + 1;
    inner = text.slice(openerIdx + 6, closerIdx).trim();
  } else {
    // No closing bracket — scan to end of line
    const eolIdx = text.indexOf('\n', openerIdx);
    tagEnd = eolIdx !== -1 ? eolIdx : text.length;
    inner = text.slice(openerIdx + 6, tagEnd).trim();
  }

  const rawTag = text.slice(tagStart, tagEnd);

  if (tagTooLong) {
    return { text, goal: null, goalV1: null, rawGoalTag: rawTag, failReason: 'tag_too_long', tagCount };
  }

  // Check for trailing amount after `]` (e.g., `[GOAL: craft wood] 20`)
  let trailingAmount: number | null = null;
  let trailingEnd = tagEnd;
  if (closerIdx !== -1) {
    const afterCloser = text.slice(tagEnd);
    const trailingMatch = afterCloser.match(/^\s*(\d+)/);
    if (trailingMatch) {
      trailingAmount = parseInt(trailingMatch[1], 10);
      trailingEnd = tagEnd + trailingMatch[0].length;
      // Skip optional unit suffix (e.g., "20x", "20 units")
      const unitMatch = text.slice(trailingEnd).match(/^\w*/);
      if (unitMatch) trailingEnd += unitMatch[0].length;
    }
  }

  // Tokenize inner text
  const tokens = inner.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) {
    return { text, goal: null, goalV1: null, rawGoalTag: rawTag, failReason: 'empty_inner', tagCount };
  }

  // Token 1: action — normalize then check allowlist
  const rawAction = tokens[0].toLowerCase().replace(/[^a-z_]/g, '');
  const action = normalizeGoalAction(rawAction);
  if (!CANONICAL_ACTIONS.has(action)) {
    // Fail-closed: unknown action → no goal, but preserve raw tag for debugging
    return { text, goal: null, goalV1: null, rawGoalTag: rawTag, failReason: 'unknown_action', tagCount };
  }

  // Remaining tokens: target words, optional id=, amount=, and trailing bare amount
  let innerAmount: number | null = null;
  let targetId: string | null = null;
  const targetTokens: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const tokenLower = token.toLowerCase();

    // Parse id=<value> key-value token
    if (tokenLower.startsWith('id=') && token.length > 3) {
      targetId = token.slice(3);
      continue;
    }

    // Parse amount=<N> key-value token
    if (tokenLower.startsWith('amount=') && token.length > 7) {
      const amtVal = parseInt(token.slice(7), 10);
      if (!isNaN(amtVal)) {
        innerAmount = amtVal;
        continue;
      }
    }

    // If last token is numeric, treat as amount (bare trailing number)
    if (i === tokens.length - 1 && /^\d+$/.test(tokenLower)) {
      innerAmount = parseInt(tokenLower, 10);
    } else {
      // Validate target token: a-z and underscore only
      const cleaned = tokenLower.replace(/[^a-z_]/g, '');
      if (cleaned.length > 0) {
        targetTokens.push(cleaned);
      }
    }
  }

  // Inner amount takes priority over trailing amount
  const amount = innerAmount ?? trailingAmount;

  const target = targetTokens.join(' ');
  // Management actions (cancel, pause, resume, prioritize) may have only id= and no target tokens
  const isManagementAction = action === 'cancel' || action === 'pause' || action === 'resume' || action === 'prioritize';
  if (target.length === 0 && !targetId && !isManagementAction) {
    return { text, goal: null, goalV1: null, rawGoalTag: rawTag, failReason: 'no_target', tagCount };
  }

  // Strip the tag (and trailing amount) from text
  const cleanedText = (text.slice(0, tagStart) + text.slice(trailingEnd)).trim();

  const goal: GoalTag = { action, target, amount };
  const goalV1: GoalTagV1 = {
    version: 1,
    action,
    target,
    targetId,
    amount,
    raw: rawTag,
  };

  return { text: cleanedText, goal, goalV1, rawGoalTag: null, failReason: 'none', tagCount };
}

/**
 * Step 4: Truncate degenerate repetitive text.
 * Detects trigram repetition (3+ occurrences) and 4+ consecutive identical words.
 */
export function truncateDegeneration(text: string): { text: string; hadDegeneration: boolean } {
  const words = text.split(/\s+/);

  // Check for 4+ consecutive identical words
  for (let i = 0; i < words.length - 3; i++) {
    if (
      words[i].toLowerCase() === words[i + 1].toLowerCase() &&
      words[i].toLowerCase() === words[i + 2].toLowerCase() &&
      words[i].toLowerCase() === words[i + 3].toLowerCase()
    ) {
      // Keep up to the 2nd occurrence
      const truncated = words.slice(0, i + 2).join(' ') + '...';
      return { text: truncated, hadDegeneration: true };
    }
  }

  // Check for trigram repetition (3-word sequences appearing 3+ times)
  if (words.length >= 9) {
    const trigramPositions = new Map<string, number[]>();

    for (let i = 0; i <= words.length - 3; i++) {
      const trigram = words.slice(i, i + 3).map(w => w.toLowerCase()).join(' ');
      const positions = trigramPositions.get(trigram) || [];
      positions.push(i);
      trigramPositions.set(trigram, positions);
    }

    for (const [, positions] of trigramPositions) {
      if (positions.length >= 3) {
        // Truncate at the start of the 3rd occurrence
        const truncateAt = positions[2];
        const truncated = words.slice(0, truncateAt).join(' ') + '...';
        return { text: truncated, hadDegeneration: true };
      }
    }
  }

  return { text, hadDegeneration: false };
}

/**
 * Step 5: Remove trailing garbage.
 * - Standalone trailing numbers
 * - Incomplete fragments after the last sentence-ending punctuation
 */
export function stripTrailingGarbage(text: string): { text: string; hadTrailingGarbage: boolean } {
  let result = text;
  let hadGarbage = false;

  // Remove trailing standalone numbers (e.g., "I should explore. 42")
  const trailingNumber = /\s+\d+\s*$/;
  if (trailingNumber.test(result)) {
    result = result.replace(trailingNumber, '');
    hadGarbage = true;
  }

  // Remove trailing incomplete fragments:
  // If there's a sentence ender (.!?) and text continues with < 3 words
  // that don't end with a sentence ender, strip the fragment.
  const lastSentenceEnd = result.search(/[.!?][^.!?]*$/);
  if (lastSentenceEnd >= 0) {
    const afterSentence = result.slice(lastSentenceEnd + 1).trim();
    if (afterSentence.length > 0) {
      const fragmentWords = afterSentence.split(/\s+/).filter(w => w.length > 0);
      const endsWithPunctuation = /[.!?]$/.test(afterSentence);

      if (fragmentWords.length < 5 && !endsWithPunctuation) {
        result = result.slice(0, lastSentenceEnd + 1);
        hadGarbage = true;
      }
    }
  }

  return { text: result, hadTrailingGarbage: hadGarbage };
}

/**
 * Step 6: Normalize whitespace — collapse runs to single space, trim.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Detect code-like content using line density (not keyword-only).
 * Avoids false positives on English prose containing "import" etc.
 *
 * Two checks:
 * 1. Multi-line: >40% of lines have code-like patterns (3+ lines required)
 * 2. Single-line/short: high symbol density (brackets, semicolons, operators)
 *    even in 1-2 lines — catches embedded code snippets in short thoughts.
 */
export function hasCodeLikeDensity(text: string): boolean {
  const lines = text.split('\n');

  // Single-line / short text: check symbol density
  // This catches things like `const x = foo({ bar: [1,2,3] });` in a 1-line thought
  if (lines.length < 3) {
    const stripped = text.replace(/\s/g, '');
    if (stripped.length < 10) return false;
    const symbolChars = (stripped.match(/[(){}\[\];=<>|&!^~+\-*/\\@#$%]/g) || []).length;
    return symbolChars / stripped.length > 0.25;
  }

  // Multi-line: line-by-line density scoring
  let codeIndicators = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(def |class |import |from |if |for |while |return |print\(|const |let |var |function )/.test(trimmed)) codeIndicators++;
    if (/[(){}\[\];=]/.test(trimmed) && trimmed.length > 5) codeIndicators++;
    if (/^\s{2,}/.test(line) && /\w/.test(trimmed)) codeIndicators++; // indented code
  }

  return codeIndicators / lines.length > 0.4;
}

/**
 * Check if content is usable (not empty, not too short, not generic filler, not code).
 *
 * Future consideration: This function and the sanitization pipeline could be
 * replaced or augmented by a distilled classifier model (similar to the 8-Ball
 * architecture in github.com/darianrosebrook/distill — 0.62M params, ~0.4ms
 * inference on Apple Silicon). A custom-trained sub-1M param model could
 * classify output type (observation, goal, degenerate, prompt leak, filler) in
 * a single forward pass with semantic understanding that regex cannot express.
 * The regex pipeline is the right first step: deterministic, 0ms, zero
 * dependencies. If artifact patterns become more diverse or isUsableContent
 * needs semantic quality scoring, a distilled CoreML classifier is a viable
 * Phase 2 upgrade.
 */
export function isUsableContent(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0) return false;
  if (trimmed.length < 5) return false;

  if (hasCodeLikeDensity(trimmed)) return false;

  for (const pattern of GENERIC_FILLER_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return true;
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Sanitize raw LLM output through the full pipeline.
 *
 * Steps (in order):
 * 1. Strip code fences
 * 2. Strip system prompt leaks
 * 3. Extract goal tag
 * 4. Truncate degeneration
 * 5. Strip trailing garbage
 * 6. Normalize whitespace
 */
export function sanitizeLLMOutput(raw: string): SanitizedOutput {
  const originalLength = raw.length;

  const flags: SanitizationFlags = {
    hadCodeFences: false,
    hadSystemPromptLeak: false,
    hadDegeneration: false,
    hadTrailingGarbage: false,
    hadCodeContent: false,
    rawGoalTag: null,
    goalTagFailReason: 'no_tag',
    goalTagCount: 0,
    originalLength,
    cleanedLength: 0,
  };

  // Step 0: Check for code-like content before stripping fences
  if (hasCodeLikeDensity(raw)) {
    flags.hadCodeContent = true;
  }

  // Step 1: Strip code fences
  let text = stripCodeFences(raw);
  if (text !== raw) {
    flags.hadCodeFences = true;
  }

  // Step 1.5: Strip wrapping quotes (apply twice for double-wrapped outputs)
  text = stripWrappingQuotes(text);
  text = stripWrappingQuotes(text);

  // Step 2: Strip system prompt leaks
  const beforeLeak = text;
  text = stripSystemPromptLeaks(text);
  if (text !== beforeLeak) {
    flags.hadSystemPromptLeak = true;
  }

  // Step 3: Extract goal tag (bounded-scan parser)
  const goalResult = extractGoalTag(text);
  text = goalResult.text;
  flags.rawGoalTag = goalResult.rawGoalTag;
  flags.goalTagFailReason = goalResult.failReason;
  flags.goalTagCount = goalResult.tagCount;

  // Step 4: Truncate degeneration
  const degenResult = truncateDegeneration(text);
  text = degenResult.text;
  flags.hadDegeneration = degenResult.hadDegeneration;

  // Step 5: Strip trailing garbage
  const garbageResult = stripTrailingGarbage(text);
  text = garbageResult.text;
  flags.hadTrailingGarbage = garbageResult.hadTrailingGarbage;

  // Step 6: Normalize whitespace
  text = normalizeWhitespace(text);

  flags.cleanedLength = text.length;

  return {
    text,
    goalTag: goalResult.goal,
    goalTagV1: goalResult.goalV1,
    flags,
  };
}

/**
 * Sanitize text for outbound Minecraft chat.
 * Runs through the full sanitization pipeline, then collapses newlines,
 * normalizes whitespace, and caps length at 256 characters.
 */
export function sanitizeForChat(raw: string): string {
  const sanitized = sanitizeLLMOutput(raw);
  let text = sanitized.text.replace(/\n/g, ' ');
  text = normalizeWhitespace(text);
  if (text.length > 256) {
    const lastSpace = text.slice(0, 256).lastIndexOf(' ');
    text = lastSpace > 180 ? text.slice(0, lastSpace) + '...' : text.slice(0, 253) + '...';
  }
  return text;
}

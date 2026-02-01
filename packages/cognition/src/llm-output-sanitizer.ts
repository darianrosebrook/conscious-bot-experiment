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
  flags: SanitizationFlags;
}

export interface GoalTag {
  action: string;
  target: string;
  amount: number | null;
}

export interface SanitizationFlags {
  hadCodeFences: boolean;
  hadSystemPromptLeak: boolean;
  hadDegeneration: boolean;
  hadTrailingGarbage: boolean;
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
// Pipeline Steps
// ============================================================================

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
 * Returns the cleaned text (tag removed) and the parsed goal.
 */
export function extractGoalTag(text: string): { text: string; goal: GoalTag | null } {
  // Match well-formed: [GOAL: action target amount?]
  const wellFormed = /\[GOAL:\s*([a-z_]+)\s+([a-z_\s]+?)(?:\s+(\d+))?\s*\]/i;
  const match = text.match(wellFormed);

  if (match) {
    const cleanedText = text.replace(wellFormed, '').trim();
    return {
      text: cleanedText,
      goal: {
        action: match[1].toLowerCase(),
        target: match[2].trim().toLowerCase(),
        amount: match[3] ? parseInt(match[3], 10) : null,
      },
    };
  }

  // Try malformed: missing closing bracket
  const malformed = /\[GOAL:\s*([a-z_]+)\s+([a-z_\s]+?)(?:\s+(\d+))?\s*$/i;
  const malformedMatch = text.match(malformed);

  if (malformedMatch) {
    const cleanedText = text.replace(malformed, '').trim();
    return {
      text: cleanedText,
      goal: {
        action: malformedMatch[1].toLowerCase(),
        target: malformedMatch[2].trim().toLowerCase(),
        amount: malformedMatch[3] ? parseInt(malformedMatch[3], 10) : null,
      },
    };
  }

  // Try split goal: [GOAL: action] target — best effort
  const splitGoal = /\[GOAL:\s*([a-z_]+)\s*\]\s*(.+)/i;
  const splitMatch = text.match(splitGoal);

  if (splitMatch) {
    const cleanedText = text.replace(splitGoal, '').trim();
    return {
      text: cleanedText,
      goal: {
        action: splitMatch[1].toLowerCase(),
        target: splitMatch[2].trim().toLowerCase().replace(/[^a-z_\s]/g, '').trim(),
        amount: null,
      },
    };
  }

  return { text, goal: null };
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
 * Check if content is usable (not empty, not too short, not generic filler).
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
    originalLength,
    cleanedLength: 0,
  };

  // Step 1: Strip code fences
  let text = stripCodeFences(raw);
  if (text !== raw) {
    flags.hadCodeFences = true;
  }

  // Step 2: Strip system prompt leaks
  const beforeLeak = text;
  text = stripSystemPromptLeaks(text);
  if (text !== beforeLeak) {
    flags.hadSystemPromptLeak = true;
  }

  // Step 3: Extract goal tag
  const goalResult = extractGoalTag(text);
  text = goalResult.text;

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
    flags,
  };
}

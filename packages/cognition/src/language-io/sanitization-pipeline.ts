/**
 * Versioned sanitization pipeline for Language IO envelopes.
 *
 * This is a DETERMINISTIC, VERSIONED evidence transform - it produces
 * another observational surface, not canonical meaning.
 *
 * The sanitization pipeline removes LLM artifacts (code fences, degeneration,
 * etc.) while preserving the semantic content for Sterling to interpret.
 *
 * Key principle: Sanitization is evidence transformation, NOT semantic
 * interpretation. Sterling is the only semantic authority.
 *
 * @author @darianrosebrook
 */

import type { SanitizationFlags } from './envelope-types';
import { SANITIZATION_VERSION, createDefaultSanitizationFlags } from './envelope-types';

export interface SanitizationResult {
  /** Sanitized text with artifacts removed */
  sanitizedText: string;
  /** Flags indicating what was detected/modified */
  flags: SanitizationFlags;
  /** Version of sanitization pipeline used */
  version: string;
}

/**
 * Run the versioned sanitization pipeline on raw text.
 *
 * This pipeline:
 * 1. Strips code fences (```)
 * 2. Removes thinking blocks (<think>...</think>)
 * 3. Truncates degeneration (repetitive patterns)
 * 4. Normalizes whitespace
 * 5. Strips goal tags from output text (they're captured as markers)
 *
 * @param rawText - Raw LLM output
 * @returns Sanitization result with cleaned text and flags
 */
export function sanitize(rawText: string): SanitizationResult {
  const flags: SanitizationFlags = { ...createDefaultSanitizationFlags() };
  let text = rawText;

  // Step 1: Strip code fences
  const afterFences = stripCodeFences(text);
  if (afterFences !== text) {
    (flags as { had_code_fences: boolean }).had_code_fences = true;
    text = afterFences;
  }

  // Step 2: Strip thinking blocks
  const afterThinking = stripThinkingBlocks(text);
  if (afterThinking !== text) {
    (flags as { stripped_thinking_blocks: boolean }).stripped_thinking_blocks = true;
    text = afterThinking;
  }

  // Step 3: Truncate degeneration
  const afterDegen = truncateDegeneration(text);
  if (afterDegen !== text) {
    (flags as { had_degeneration: boolean }).had_degeneration = true;
    text = afterDegen;
  }

  // Step 4: Strip goal tags from text (they're preserved as markers)
  const goalTagPattern = /\[GOAL:\s*[^\]]+\]/gi;
  const goalMatches = text.match(goalTagPattern);
  if (goalMatches && goalMatches.length > 1) {
    (flags as { had_multiple_goal_tags: boolean }).had_multiple_goal_tags = true;
  }
  text = text.replace(goalTagPattern, '');

  // Step 5: Normalize whitespace
  const afterWhitespace = normalizeWhitespace(text);
  if (afterWhitespace !== text) {
    (flags as { normalized_whitespace: boolean }).normalized_whitespace = true;
    text = afterWhitespace;
  }

  return {
    sanitizedText: text,
    flags,
    version: SANITIZATION_VERSION,
  };
}

/**
 * Strip code fences while preserving single/double backticks.
 */
function stripCodeFences(text: string): string {
  let result = text;

  // Remove opening fences with optional language tag: ```text, ```json, etc.
  result = result.replace(/```[a-zA-Z]*\s*/g, '');

  // Remove closing/standalone triple backticks
  result = result.replace(/```/g, '');

  return result;
}

/**
 * Strip thinking blocks (<think>...</think>).
 *
 * Some LLMs emit thinking in XML-style tags.
 */
function stripThinkingBlocks(text: string): string {
  // Match <think>...</think> blocks, including multiline
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

/**
 * Truncate degenerate repetitive text.
 *
 * Detects:
 * - 4+ consecutive identical words
 * - Trigram repetition (3+ occurrences)
 */
function truncateDegeneration(text: string): string {
  const words = text.split(/\s+/);

  // Check for 4+ consecutive identical words
  for (let i = 0; i < words.length - 3; i++) {
    if (
      words[i].toLowerCase() === words[i + 1].toLowerCase() &&
      words[i].toLowerCase() === words[i + 2].toLowerCase() &&
      words[i].toLowerCase() === words[i + 3].toLowerCase()
    ) {
      // Keep up to the 2nd occurrence
      return words.slice(0, i + 2).join(' ') + '...';
    }
  }

  // Check for trigram repetition (3-word sequences appearing 3+ times)
  if (words.length >= 9) {
    const trigramPositions = new Map<string, number[]>();

    for (let i = 0; i <= words.length - 3; i++) {
      const trigram = words
        .slice(i, i + 3)
        .map((w) => w.toLowerCase())
        .join(' ');
      const positions = trigramPositions.get(trigram) || [];
      positions.push(i);
      trigramPositions.set(trigram, positions);
    }

    for (const [, positions] of trigramPositions) {
      if (positions.length >= 3) {
        // Truncate at the start of the 3rd occurrence
        const truncateAt = positions[2];
        return words.slice(0, truncateAt).join(' ') + '...';
      }
    }
  }

  return text;
}

/**
 * Normalize whitespace: collapse runs to single space, trim.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * LLM Output Sanitizer Tests (Evidence Extraction Only)
 *
 * Tests verbatim marker extraction and evidence transforms.
 * Semantic validation tests deleted in PR2 - Sterling validates semantics.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  extractGoalTag,
  extractIntent,
  sanitizeLLMOutput,
  isUsableContent,
} from '../llm-output-sanitizer';

// ============================================================================
// extractGoalTag (verbatim extraction, no validation)
// ============================================================================

describe('extractGoalTag (verbatim extraction)', () => {
  it('extracts goal tag verbatim without validating action', () => {
    const result = extractGoalTag('[GOAL: teleport diamond] I should try this.');
    // Should extract even "invalid" actions - Sterling validates
    expect(result.goal).toEqual({
      action: 'teleport',
      target: 'diamond',
      amount: null,
    });
    expect(result.text).toBe('I should try this.');
  });

  it('extracts action and target verbatim', () => {
    const result = extractGoalTag('[GOAL: craft oak_planks]');
    expect(result.goal).toEqual({
      action: 'craft',
      target: 'oak_planks',
      amount: null,
    });
  });

  it('extracts amount from inner text', () => {
    const result = extractGoalTag('[GOAL: collect oak_log amount=20]');
    expect(result.goal?.amount).toBe(20);
  });

  it('extracts trailing amount after tag', () => {
    const result = extractGoalTag('[GOAL: collect oak_log] 20');
    expect(result.goal?.amount).toBe(20);
  });

  it('strips the goal tag from text', () => {
    const result = extractGoalTag('I will craft. [GOAL: craft stick] Soon.');
    expect(result.text).toBe('I will craft.  Soon.');
    expect(result.goal?.action).toBe('craft');
  });

  it('returns null for malformed tags', () => {
    const result = extractGoalTag('[GOAL: ]');
    expect(result.goal).toBeNull();
    expect(result.failReason).toBe('empty_inner');
  });

  it('returns null when no tag present', () => {
    const result = extractGoalTag('Just a thought.');
    expect(result.goal).toBeNull();
    expect(result.failReason).toBe('no_tag');
  });

  it('counts multiple tags', () => {
    const result = extractGoalTag('[GOAL: craft wood] [GOAL: collect stone]');
    expect(result.tagCount).toBe(2);
    // First tag is extracted
    expect(result.goal?.action).toBe('craft');
  });
});

// ============================================================================
// extractIntent (verbatim extraction, no validation)
// ============================================================================

describe('extractIntent (verbatim extraction)', () => {
  it('extracts intent label verbatim from final line', () => {
    const result = extractIntent('I should explore.\nINTENT: explore');
    expect(result.intent).toBe('explore');
    expect(result.intentParse).toBe('final_line');
    expect(result.text).toBe('I should explore.');
  });

  it('extracts ANY intent label verbatim (no validation)', () => {
    const result = extractIntent('Teleporting.\nINTENT: teleport');
    // Should extract even "invalid" labels - Sterling validates
    expect(result.intent).toBe('teleport');
    expect(result.intentParse).toBe('final_line');
  });

  it('strips inline INTENT markers', () => {
    const result = extractIntent('I will INTENT: explore look around.');
    expect(result.intent).toBe('explore');
    expect(result.intentParse).toBe('inline_noncompliant');
    expect(result.text).toBe('I will look around.');
  });

  it('returns null when no INTENT marker present', () => {
    const result = extractIntent('Just a thought.');
    expect(result.intent).toBeNull();
    expect(result.intentParse).toBeNull();
  });

  it('handles INTENT line with trailing space (extracts null)', () => {
    const result = extractIntent('Thought.\nINTENT: ');
    // Regex matches but extracted label is null after filtering
    expect(result.intent).toBeNull();
    expect(result.intentParse).toBe('inline_noncompliant');
  });
});

// ============================================================================
// sanitizeLLMOutput (integration)
// ============================================================================

describe('sanitizeLLMOutput', () => {
  it('integrates goal tag extraction', () => {
    const result = sanitizeLLMOutput('[GOAL: craft stick] I will craft sticks.');
    expect(result.goalTag?.action).toBe('craft');
    expect(result.goalTag?.target).toBe('stick');
    expect(result.text).toBe('I will craft sticks.');
  });

  it('integrates intent extraction', () => {
    const result = sanitizeLLMOutput('I will explore the area.\nINTENT: explore');
    expect(result.intent).toBe('explore');
    expect(result.text).toBe('I will explore the area.');
  });

  it('strips code fences', () => {
    const result = sanitizeLLMOutput('```\ncode\n```\nReal thought.');
    // Code fence content is removed, just check flag
    expect(result.flags.hadCodeFences).toBe(true);
    expect(result.text).toContain('Real thought');
  });

  it('detects degeneration', () => {
    const result = sanitizeLLMOutput('word word word word word');
    expect(result.flags.hadDegeneration).toBe(true);
  });
});

// ============================================================================
// isUsableContent (heuristic for empty/garbage text)
// ============================================================================

describe('isUsableContent', () => {
  it('accepts normal text', () => {
    expect(isUsableContent('I should gather wood.')).toBe(true);
  });

  it('rejects empty text', () => {
    expect(isUsableContent('')).toBe(false);
    expect(isUsableContent('   ')).toBe(false);
  });

  it('rejects pure symbols', () => {
    expect(isUsableContent('...')).toBe(false);
    expect(isUsableContent('---')).toBe(false);
  });

  it('accepts text with some symbols', () => {
    expect(isUsableContent('I notice... trees.')).toBe(true);
  });
});

// ============================================================================
// canonicalGoalKey (error stub)
// ============================================================================

describe('canonicalGoalKey (deleted)', () => {
  it('throws error when called', async () => {
    const { canonicalGoalKey } = await import('../llm-output-sanitizer');
    expect(() => canonicalGoalKey('craft', 'stick')).toThrow(
      /canonicalGoalKey\(\) deleted.*Sterling committed_goal_prop_id/
    );
  });
});

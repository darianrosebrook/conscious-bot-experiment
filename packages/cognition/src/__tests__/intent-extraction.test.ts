import { describe, it, expect } from 'vitest';
import { extractIntent, sanitizeLLMOutput } from '../llm-output-sanitizer';

/**
 * Tests for INTENT extraction: parsing, validation, stripping,
 * and integration through the sanitize pipeline.
 *
 * @author @darianrosebrook
 */

describe('extractIntent', () => {
  it('extracts valid intent label from final line', () => {
    const result = extractIntent('I should gather wood.\nINTENT: gather');
    expect(result.intent).toBe('gather');
    expect(result.intentParse).toBe('final_line');
    expect(result.text).toBe('I should gather wood.');
  });

  it('extracts all valid intent labels', () => {
    const labels = ['none', 'explore', 'gather', 'craft', 'shelter', 'food', 'mine', 'navigate'] as const;
    for (const label of labels) {
      const result = extractIntent(`Some thought.\nINTENT: ${label}`);
      expect(result.intent).toBe(label);
    }
  });

  it('returns null for unknown intent label but strips the line', () => {
    const result = extractIntent('Some thought.\nINTENT: teleport');
    expect(result.intent).toBeNull();
    expect(result.text).toBe('Some thought.');
  });

  it('strips unknown INTENT with trailing blanks', () => {
    const result = extractIntent('Some thought.\nINTENT: fly\n\n');
    expect(result.intent).toBeNull();
    expect(result.text).toBe('Some thought.');
  });

  it('returns null when no INTENT line present', () => {
    const result = extractIntent('I should explore the cave.');
    expect(result.intent).toBeNull();
    expect(result.intentParse).toBeNull();
    expect(result.text).toBe('I should explore the cave.');
  });

  it('extracts and strips inline INTENT on non-final line', () => {
    const result = extractIntent('INTENT: gather\nI should do something else.');
    expect(result.intent).toBe('gather');
    expect(result.intentParse).toBe('inline_noncompliant');
    expect(result.text).not.toContain('INTENT');
  });

  it('is case-insensitive for INTENT keyword', () => {
    const result = extractIntent('Thought.\nintent: explore');
    expect(result.intent).toBe('explore');
  });

  it('strips the INTENT line from output text', () => {
    const result = extractIntent('Line one.\nLine two.\nINTENT: craft');
    expect(result.text).toBe('Line one.\nLine two.');
    expect(result.intent).toBe('craft');
  });

  it('handles INTENT line with extra whitespace', () => {
    const result = extractIntent('Thought.\nINTENT:   mine  ');
    expect(result.intent).toBe('mine');
  });

  it('extracts and strips INTENT from mid-text as inline_noncompliant', () => {
    const result = extractIntent('First.\nINTENT: gather\nLast line here.');
    expect(result.intent).toBe('gather');
    expect(result.intentParse).toBe('inline_noncompliant');
    expect(result.text).not.toContain('INTENT');
    // Text should still have surrounding content
    expect(result.text).toContain('First.');
    expect(result.text).toContain('Last line here.');
  });

  it('handles single-line text with INTENT', () => {
    const result = extractIntent('INTENT: navigate');
    expect(result.intent).toBe('navigate');
    expect(result.text).toBe('');
  });

  it('handles trailing blank lines after INTENT (small model quirk)', () => {
    const result = extractIntent('I should gather wood.\nINTENT: gather\n\n');
    expect(result.intent).toBe('gather');
    expect(result.text).toBe('I should gather wood.');
  });

  it('handles trailing whitespace-only lines after INTENT', () => {
    const result = extractIntent('Thought.\nINTENT: explore\n   \n  ');
    expect(result.intent).toBe('explore');
    expect(result.text).toBe('Thought.');
  });

  it('strips inline INTENT mid-sentence (observed LLM pattern)', () => {
    // Real pattern observed: "I will look for a nearby tree. INTENT: explore I notice a nearby tree."
    const result = extractIntent('I will look for a nearby tree. INTENT: explore I notice a nearby tree.');
    expect(result.intent).toBe('explore');
    expect(result.intentParse).toBe('inline_noncompliant');
    expect(result.text).not.toContain('INTENT');
    expect(result.text).toContain('I will look for a nearby tree.');
    expect(result.text).toContain('I notice a nearby tree.');
  });

  it('strips multiple inline INTENT occurrences', () => {
    const result = extractIntent('First. INTENT: gather Second. INTENT: mine Third.');
    // First match is used for intent label
    expect(result.intent).toBe('gather');
    expect(result.intentParse).toBe('inline_noncompliant');
    expect(result.text).not.toContain('INTENT');
  });
});

describe('sanitizeLLMOutput with INTENT', () => {
  it('includes intent field in sanitized output', () => {
    const result = sanitizeLLMOutput('I should gather wood.\nINTENT: gather');
    expect(result.intent).toBe('gather');
    expect(result.text).toBe('I should gather wood.');
  });

  it('returns intent: null when no INTENT present', () => {
    const result = sanitizeLLMOutput('I should explore the cave.');
    expect(result.intent).toBeNull();
  });

  it('extracts both goal and intent', () => {
    const result = sanitizeLLMOutput('I should mine stone. [GOAL: mine stone 16]\nINTENT: mine');
    expect(result.goalTag).not.toBeNull();
    expect(result.goalTag!.action).toBe('mine');
    expect(result.intent).toBe('mine');
  });

  it('returns intent: null for unknown label and strips the line', () => {
    const result = sanitizeLLMOutput('Hmm.\nINTENT: fly');
    expect(result.intent).toBeNull();
    expect(result.text).toBe('Hmm.');
  });

  it('strips INTENT line before degeneration check', () => {
    const result = sanitizeLLMOutput('I should explore.\nINTENT: explore');
    expect(result.text).toBe('I should explore.');
    expect(result.text).not.toContain('INTENT');
  });
});

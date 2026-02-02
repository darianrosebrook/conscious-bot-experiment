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
    expect(result.text).toBe('I should gather wood.');
  });

  it('extracts all valid intent labels', () => {
    const labels = ['none', 'explore', 'gather', 'craft', 'shelter', 'food', 'mine', 'navigate'] as const;
    for (const label of labels) {
      const result = extractIntent(`Some thought.\nINTENT: ${label}`);
      expect(result.intent).toBe(label);
    }
  });

  it('returns null for unknown intent label', () => {
    const result = extractIntent('Some thought.\nINTENT: teleport');
    expect(result.intent).toBeNull();
  });

  it('returns null when no INTENT line present', () => {
    const result = extractIntent('I should explore the cave.');
    expect(result.intent).toBeNull();
    expect(result.text).toBe('I should explore the cave.');
  });

  it('only matches INTENT on the final line', () => {
    const result = extractIntent('INTENT: gather\nI should do something else.');
    expect(result.intent).toBeNull();
    expect(result.text).toBe('INTENT: gather\nI should do something else.');
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

  it('returns null for INTENT line mid-text', () => {
    const result = extractIntent('First.\nINTENT: gather\nLast line here.');
    expect(result.intent).toBeNull();
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

  it('returns intent: null for unknown label', () => {
    const result = sanitizeLLMOutput('Hmm.\nINTENT: fly');
    expect(result.intent).toBeNull();
  });

  it('strips INTENT line before degeneration check', () => {
    const result = sanitizeLLMOutput('I should explore.\nINTENT: explore');
    expect(result.text).toBe('I should explore.');
    expect(result.text).not.toContain('INTENT');
  });
});

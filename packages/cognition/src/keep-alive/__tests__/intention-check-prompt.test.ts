/**
 * Tests for Intention Check Prompt
 *
 * Validates the non-injective prompt templates.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';

import {
  renderIntentionCheckPrompt,
  getIntentionCheckVariants,
  validateNonInjectivePrompt,
  INTENTION_CHECK_TEMPLATE,
  INTENTION_CHECK_MINIMAL,
  INTENTION_CHECK_REFLECTIVE,
  INTENTION_CHECK_VARIANTS,
} from '../intention-check-prompt';

describe('renderIntentionCheckPrompt', () => {
  const testFrame = `[Bot State]
Health: 20/20
Hunger: 18/20
Position: (100, 64, 200)
Time: Day (safe)
Inventory: oak_log x32, cobblestone x64

[World State]
Biome: plains`;

  it('should render standard prompt with frame', () => {
    const prompt = renderIntentionCheckPrompt(testFrame, 'standard');

    expect(prompt).toContain('You are observing the current situation');
    expect(prompt).toContain(testFrame);
    // Goal tag format matches the parser in llm-output-sanitizer.ts:
    // [GOAL: <action> <target> <amount>] with space-separated tokens
    expect(prompt).toContain('[GOAL: <action> <target> <amount>]');
    expect(prompt).toContain('Observation without action is valid');
  });

  it('should render minimal prompt with frame', () => {
    const prompt = renderIntentionCheckPrompt(testFrame, 'minimal');

    expect(prompt).toContain('Situation:');
    expect(prompt).toContain(testFrame);
    expect(prompt).toContain('[GOAL:');
    expect(prompt.length).toBeLessThan(
      renderIntentionCheckPrompt(testFrame, 'standard').length
    );
  });

  it('should render reflective prompt with frame', () => {
    const prompt = renderIntentionCheckPrompt(testFrame, 'reflective');

    expect(prompt).toContain('taking a moment to observe');
    expect(prompt).toContain(testFrame);
    expect(prompt).toContain('simple observation is sufficient');
  });

  it('should default to standard variant', () => {
    const prompt = renderIntentionCheckPrompt(testFrame);
    const standardPrompt = renderIntentionCheckPrompt(testFrame, 'standard');

    expect(prompt).toBe(standardPrompt);
  });
});

describe('getIntentionCheckVariants', () => {
  it('should return all variant names', () => {
    const variants = getIntentionCheckVariants();

    expect(variants).toContain('standard');
    expect(variants).toContain('minimal');
    expect(variants).toContain('reflective');
    expect(variants).toHaveLength(3);
  });
});

describe('validateNonInjectivePrompt', () => {
  describe('should reject goal-suggesting patterns', () => {
    const forbiddenPhrases = [
      'you should gather wood',
      'you could craft a pickaxe',
      'consider doing something',
      'might want to build a shelter',
      'try to explore',
      'why not mine some ore',
      'perhaps you could hunt',
      'maybe you should eat',
      'it would be good to rest',
      'a good idea would be to craft',
      'options include mining or crafting',
      'you can choose to build or explore',
    ];

    for (const phrase of forbiddenPhrases) {
      it(`should reject: "${phrase.slice(0, 30)}..."`, () => {
        const template = `Some preamble. ${phrase}. More text.`;
        expect(validateNonInjectivePrompt(template)).toBe(false);
      });
    }
  });

  describe('should accept non-injective templates', () => {
    it('should accept standard template', () => {
      expect(validateNonInjectivePrompt(INTENTION_CHECK_TEMPLATE)).toBe(true);
    });

    it('should accept minimal template', () => {
      expect(validateNonInjectivePrompt(INTENTION_CHECK_MINIMAL)).toBe(true);
    });

    it('should accept reflective template', () => {
      expect(validateNonInjectivePrompt(INTENTION_CHECK_REFLECTIVE)).toBe(true);
    });

    it('should accept factual statements', () => {
      const templates = [
        'You are at position (100, 64, 200).',
        'Health: 20/20. Hunger: 18/20.',
        'Nearby: 3 cows, 1 pig.',
        'If you have an intention, express it.',
        'Observation is valid.',
      ];

      for (const template of templates) {
        expect(validateNonInjectivePrompt(template)).toBe(true);
      }
    });
  });
});

describe('built-in templates', () => {
  it('should all have the {situationFrame} placeholder', () => {
    for (const [name, template] of Object.entries(INTENTION_CHECK_VARIANTS)) {
      expect(template).toContain('{situationFrame}');
    }
  });

  it('should all pass non-injective validation', () => {
    for (const [name, template] of Object.entries(INTENTION_CHECK_VARIANTS)) {
      expect(validateNonInjectivePrompt(template)).toBe(true);
    }
  });

  it('should not suggest specific actions', () => {
    for (const [name, template] of Object.entries(INTENTION_CHECK_VARIANTS)) {
      // Should not mention specific Minecraft actions
      expect(template.toLowerCase()).not.toContain('mine');
      expect(template.toLowerCase()).not.toContain('craft');
      expect(template.toLowerCase()).not.toContain('build');
      expect(template.toLowerCase()).not.toContain('gather');
      expect(template.toLowerCase()).not.toContain('explore');
    }
  });
});

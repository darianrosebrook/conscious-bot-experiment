/**
 * Tests for TTS Usable Content (Temporary Copy)
 *
 * These tests pin the behavior of isUsableForTTS to detect divergence from
 * the canonical isUsableContent in llm-output-sanitizer.
 *
 * If these tests fail after changes to llm-output-sanitizer, either:
 * 1. Update the copied logic in tts-usable-content.ts to match, OR
 * 2. Migrate thought-stream-helpers to language-io and delete the copy
 */

import { describe, it, expect } from 'vitest';
import { isUsableForTTS } from '../tts-usable-content';

describe('isUsableForTTS (equivalence pinning)', () => {
  describe('should reject unusable content', () => {
    it('rejects empty string', () => {
      expect(isUsableForTTS('')).toBe(false);
    });

    it('rejects whitespace-only', () => {
      expect(isUsableForTTS('   ')).toBe(false);
      expect(isUsableForTTS('\n\t  ')).toBe(false);
    });

    it('rejects too short (< 5 chars)', () => {
      expect(isUsableForTTS('Hi')).toBe(false);
      expect(isUsableForTTS('OK')).toBe(false);
      expect(isUsableForTTS('Yes')).toBe(false);
    });

    it('rejects generic filler patterns', () => {
      expect(isUsableForTTS('maintaining awareness of surroundings')).toBe(false);
      expect(isUsableForTTS('Observing surroundings.')).toBe(false);
      expect(isUsableForTTS('MONITORING THE ENVIRONMENT')).toBe(false);
      expect(isUsableForTTS('staying alert')).toBe(false);
      expect(isUsableForTTS('keeping watch.')).toBe(false);
      expect(isUsableForTTS('Looking around')).toBe(false);
      expect(isUsableForTTS('nothing to report.')).toBe(false);
    });

    it('rejects code-like content (single line, high symbol density)', () => {
      // These have >25% symbol density after whitespace removal
      // 0.308 density: 8/26 symbols
      expect(isUsableForTTS('const x = foo({ bar: [1,2,3] });')).toBe(false);
      // 0.647 density: 11/17 symbols (very high)
      expect(isUsableForTTS('if (x > 0) { y++; z--; }')).toBe(false);
      // 0.323 density: 10/31 symbols
      expect(isUsableForTTS('arr.map(x=>x*2).filter(y=>y>10)')).toBe(false);
    });

    it('accepts borderline code-like content (low symbol density)', () => {
      // These have <25% symbol density and should pass
      // 0.143 density: 4/28 symbols
      expect(isUsableForTTS('import { thing } from "./module";')).toBe(true);
      // 0.185 density: 5/27 symbols
      expect(isUsableForTTS('function test() { return true; }')).toBe(true);
      // 0.148 density: 4/27 symbols
      expect(isUsableForTTS('{"key":"value","arr":[1,2]}')).toBe(true);
    });

    it('rejects code-like content (multi-line, high line density)', () => {
      const codeBlock = `
        function example() {
          const data = [1, 2, 3];
          return data.map(x => x * 2);
        }
      `;
      expect(isUsableForTTS(codeBlock)).toBe(false);
    });

    it('rejects multi-line with high bracket/keyword density', () => {
      const codeish = `
        {
          "key": "value",
          "array": [1, 2, 3]
        }
      `;
      expect(isUsableForTTS(codeish)).toBe(false);
    });
  });

  describe('should accept usable content', () => {
    it('accepts normal sentences', () => {
      expect(isUsableForTTS('I see some trees nearby.')).toBe(true);
      expect(isUsableForTTS('The sun is setting over the horizon.')).toBe(true);
      expect(isUsableForTTS('I hear water flowing to the west.')).toBe(true);
    });

    it('accepts short meaningful utterances (>= 5 chars)', () => {
      expect(isUsableForTTS('Hello there!')).toBe(true);
      expect(isUsableForTTS('I understand.')).toBe(true);
      expect(isUsableForTTS('Moving forward.')).toBe(true);
    });

    it('accepts natural observations', () => {
      expect(isUsableForTTS('There are passive mobs visible.')).toBe(true);
      expect(isUsableForTTS('I notice iron ore in the cave wall.')).toBe(true);
      expect(isUsableForTTS('The biome appears to be a forest.')).toBe(true);
    });

    it('accepts sentences with some symbols (low density)', () => {
      expect(isUsableForTTS('I need wood, stone, and iron.')).toBe(true);
      expect(isUsableForTTS('The coordinates are X: 100, Z: 200.')).toBe(true);
      expect(isUsableForTTS('Time to craft a pickaxe!')).toBe(true);
    });

    it('accepts multi-line prose (low code density)', () => {
      const prose = `
        I'm exploring the area carefully.
        There are several oak trees here.
        This looks like a good place to gather resources.
      `;
      expect(isUsableForTTS(prose)).toBe(true);
    });

    it('accepts number-heavy content if not code-like', () => {
      expect(isUsableForTTS('I have 32 cobblestone and 16 iron ore.')).toBe(true);
      expect(isUsableForTTS('Health: 20, Food: 18, Position: 100, 64, 200')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles unicode and non-latin text', () => {
      // These should pass if they meet length/density requirements
      expect(isUsableForTTS('私はここにいます。')).toBe(true); // Japanese
      expect(isUsableForTTS('Je vois des arbres.')).toBe(true); // French
    });

    it('handles mixed content', () => {
      // Prose with code mention (low density overall)
      expect(isUsableForTTS('I need to use the crafting table.')).toBe(true);

      // Inline code reference (still mostly prose)
      expect(isUsableForTTS('The bot.chat command sends messages.')).toBe(true);
    });

    it('handles URLs and identifiers', () => {
      // URL in prose (symbol density borderline but should pass)
      expect(isUsableForTTS('Check the docs at example.com for more info.')).toBe(true);
    });
  });
});

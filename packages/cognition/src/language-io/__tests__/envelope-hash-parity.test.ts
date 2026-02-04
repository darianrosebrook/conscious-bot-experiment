/**
 * Cross-Language Hash Parity Tests
 *
 * These tests verify that TypeScript computes identical envelope_id hashes
 * as Python. This is critical for cross-system provenance tracking.
 *
 * The expected hashes are pre-computed by Python and checked into fixtures.
 * If any test fails, it indicates a UTF-8 encoding or hashing mismatch.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { computeEnvelopeId } from '../envelope-builder';
import hashParityCases from './fixtures/hash-parity-cases.json';

describe('Cross-Language Hash Parity', () => {
  describe('Python-computed expected values', () => {
    for (const testCase of hashParityCases) {
      it(`matches Python hash for: ${testCase.name}`, () => {
        const tsHash = computeEnvelopeId(testCase.input);
        expect(tsHash).toBe(testCase.python_computed_hash);
      });
    }
  });

  describe('UTF-8 encoding correctness', () => {
    it('handles ASCII correctly', () => {
      // SHA256('hello world')[:16] = b94d27b9934d3e08
      expect(computeEnvelopeId('hello world')).toBe('b94d27b9934d3e08');
    });

    it('handles Unicode emoji correctly', () => {
      // Emoji requires multi-byte UTF-8 encoding
      // SHA256('hello 🌍')[:16] = 92de6bbfa52e6cfa
      expect(computeEnvelopeId('hello 🌍')).toBe('92de6bbfa52e6cfa');
    });

    it('handles Japanese characters correctly', () => {
      // Japanese characters are 3-byte UTF-8
      // SHA256('こんにちは')[:16] = 125aeadf27b0459b
      expect(computeEnvelopeId('こんにちは')).toBe('125aeadf27b0459b');
    });

    it('handles leading/trailing whitespace', () => {
      // Whitespace is preserved, not trimmed before hashing
      // SHA256('  spaced  ')[:16] = 1dcc24a14a6bf8cb
      expect(computeEnvelopeId('  spaced  ')).toBe('1dcc24a14a6bf8cb');
    });

    it('handles newlines correctly', () => {
      // SHA256('line1\nline2\nline3')[:16] = 6bb6a5ad9b9c43a7
      expect(computeEnvelopeId('line1\nline2\nline3')).toBe('6bb6a5ad9b9c43a7');
    });

    it('handles empty string', () => {
      // SHA256('')[:16] = e3b0c44298fc1c14
      expect(computeEnvelopeId('')).toBe('e3b0c44298fc1c14');
    });
  });

  describe('Real-world input patterns', () => {
    it('handles typical goal tag input', () => {
      // SHA256('I see trees nearby. [GOAL: craft wood]')[:16] = 3051772209c11dc7
      expect(computeEnvelopeId('I see trees nearby. [GOAL: craft wood]')).toBe('3051772209c11dc7');
    });

    it('handles multiple goal tags', () => {
      // SHA256('[GOAL: mine stone] then [GOAL: craft pickaxe]')[:16] = 9002439e5ba7dca6
      expect(computeEnvelopeId('[GOAL: mine stone] then [GOAL: craft pickaxe]')).toBe(
        '9002439e5ba7dca6',
      );
    });

    it('handles code fences in input', () => {
      // Note: Hash is computed on RAW text before sanitization
      const input = '```\nI will gather resources. [GOAL: collect wood]\n```';
      // SHA256 of raw input with fences
      expect(computeEnvelopeId(input)).toBe('1f526e61b41873bb');
    });
  });

  describe('Hash stability contract', () => {
    it('same input always produces same hash', () => {
      const input = 'deterministic test input with [GOAL: verify]';
      const hash1 = computeEnvelopeId(input);
      const hash2 = computeEnvelopeId(input);
      const hash3 = computeEnvelopeId(input);
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('different inputs produce different hashes', () => {
      const hashes = new Set<string>();
      const inputs = [
        'input one',
        'input two',
        'input three',
        '[GOAL: one]',
        '[GOAL: two]',
        'same words different [GOAL: order]',
        '[GOAL: order] same words different',
      ];

      for (const input of inputs) {
        hashes.add(computeEnvelopeId(input));
      }

      // All inputs should produce unique hashes
      expect(hashes.size).toBe(inputs.length);
    });
  });
});

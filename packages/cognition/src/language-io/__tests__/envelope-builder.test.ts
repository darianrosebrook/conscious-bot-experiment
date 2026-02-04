/**
 * Envelope Builder Tests
 *
 * Tests for the LanguageIOEnvelope builder, including:
 * - Golden vector tests against expected outputs
 * - Marker extraction strictness tests
 * - Sanitization pipeline tests
 *
 * Key invariants verified:
 * - I-BOUNDARY-3: TS extracts only explicitly declared surface markers verbatim
 * - No normalization of action verbs (Sterling does that)
 * - No markers created from natural language intent
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { buildLanguageIOEnvelope, computeEnvelopeId } from '../envelope-builder';
import goldenVectors from './fixtures/envelope-golden-vectors.json';

describe('LanguageIOEnvelope Builder', () => {
  describe('Golden Vector Tests', () => {
    for (const vector of goldenVectors) {
      it(`produces expected output for: ${vector.name}`, () => {
        const envelope = buildLanguageIOEnvelope(vector.input);

        // Exact match on envelope_id
        expect(envelope.envelope_id).toBe(vector.expected.envelope_id);

        // Exact match on declared_markers
        expect(envelope.declared_markers).toEqual(vector.expected.declared_markers);

        // Sanitized text matches
        expect(envelope.sanitized_text).toBe(vector.expected.sanitized_text);
      });
    }
  });

  describe('Marker Extraction Strictness (I-BOUNDARY-3)', () => {
    it('extracts explicit [GOAL:] tags only', () => {
      const envelope = buildLanguageIOEnvelope('I see trees. [GOAL: craft wood]');
      expect(envelope.declared_markers).toHaveLength(1);
      expect(envelope.declared_markers[0].marker_type).toBe('GOAL_TAG');
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: craft wood]');
    });

    it('does NOT create markers from natural language intent', () => {
      const envelope = buildLanguageIOEnvelope('I want to craft a wooden pickaxe.');
      expect(envelope.declared_markers).toHaveLength(0);
    });

    it('does NOT normalize action verbs', () => {
      // "dig" should NOT become "mine" - Sterling does that
      const envelope = buildLanguageIOEnvelope('[GOAL: dig stone]');
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: dig stone]');
      // NO normalized_action field - this is a critical boundary check
      expect(envelope.declared_markers[0]).not.toHaveProperty('normalized_action');
      expect(envelope.declared_markers[0]).not.toHaveProperty('action');
      expect(envelope.declared_markers[0]).not.toHaveProperty('canonical_action');
    });

    it('preserves exact text including brackets', () => {
      const envelope = buildLanguageIOEnvelope('[GOAL: explore mountains]');
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: explore mountains]');
      // Full tag, not parsed components
      expect(envelope.declared_markers[0]).not.toHaveProperty('parsed_action');
      expect(envelope.declared_markers[0]).not.toHaveProperty('parsed_target');
    });

    it('handles case-insensitive goal tags', () => {
      const lowerEnvelope = buildLanguageIOEnvelope('[goal: mine ore]');
      expect(lowerEnvelope.declared_markers).toHaveLength(1);
      expect(lowerEnvelope.declared_markers[0].verbatim_text).toBe('[goal: mine ore]');

      const mixedEnvelope = buildLanguageIOEnvelope('[Goal: explore]');
      expect(mixedEnvelope.declared_markers).toHaveLength(1);
      expect(mixedEnvelope.declared_markers[0].verbatim_text).toBe('[Goal: explore]');
    });

    it('extracts multiple goal tags with correct spans', () => {
      const input = '[GOAL: first] and [GOAL: second]';
      const envelope = buildLanguageIOEnvelope(input);
      expect(envelope.declared_markers).toHaveLength(2);

      // First marker
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: first]');
      expect(envelope.declared_markers[0].span[0]).toBe(0);
      expect(envelope.declared_markers[0].span[1]).toBe(13);

      // Second marker
      expect(envelope.declared_markers[1].verbatim_text).toBe('[GOAL: second]');
      expect(envelope.declared_markers[1].span[0]).toBe(18);
      expect(envelope.declared_markers[1].span[1]).toBe(32);

      // Verify spans match actual text positions
      expect(input.slice(...envelope.declared_markers[0].span)).toBe('[GOAL: first]');
      expect(input.slice(...envelope.declared_markers[1].span)).toBe('[GOAL: second]');
    });
  });

  describe('Envelope Construction', () => {
    it('includes schema metadata', () => {
      const envelope = buildLanguageIOEnvelope('test');
      expect(envelope.schema_id).toBe('sterling.language_io_envelope.v1');
      expect(envelope.schema_version).toBe('1.0.0');
    });

    it('preserves raw text verbatim', () => {
      const rawText = '  whitespace  preserved  [GOAL: test]  ';
      const envelope = buildLanguageIOEnvelope(rawText);
      expect(envelope.raw_text_verbatim).toBe(rawText);
    });

    it('sets timestamp_ms', () => {
      const before = Date.now();
      const envelope = buildLanguageIOEnvelope('test');
      const after = Date.now();
      expect(envelope.timestamp_ms).toBeGreaterThanOrEqual(before);
      expect(envelope.timestamp_ms).toBeLessThanOrEqual(after);
    });

    it('includes model_id when provided', () => {
      const envelope = buildLanguageIOEnvelope('test', { modelId: 'mlx-qwen-7b' });
      expect(envelope.model_id).toBe('mlx-qwen-7b');
    });

    it('includes prompt_digest when provided', () => {
      const envelope = buildLanguageIOEnvelope('test', { promptDigest: 'abc123' });
      expect(envelope.prompt_digest).toBe('abc123');
    });

    it('sets null for optional fields when not provided', () => {
      const envelope = buildLanguageIOEnvelope('test');
      expect(envelope.model_id).toBeNull();
      expect(envelope.prompt_digest).toBeNull();
      expect(envelope.world_snapshot_ref).toBeNull();
    });
  });

  describe('Sanitization Pipeline', () => {
    it('strips code fences', () => {
      const envelope = buildLanguageIOEnvelope('```\ncode here\n```');
      expect(envelope.sanitized_text).toBe('code here');
      expect(envelope.sanitization_flags.had_code_fences).toBe(true);
    });

    it('strips thinking blocks', () => {
      const envelope = buildLanguageIOEnvelope('<think>internal</think>visible');
      expect(envelope.sanitized_text).toBe('visible');
      expect(envelope.sanitization_flags.stripped_thinking_blocks).toBe(true);
    });

    it('detects degeneration', () => {
      const envelope = buildLanguageIOEnvelope('word word word word word');
      expect(envelope.sanitization_flags.had_degeneration).toBe(true);
      expect(envelope.sanitized_text).toContain('...');
    });

    it('removes goal tags from sanitized text', () => {
      const envelope = buildLanguageIOEnvelope('Before [GOAL: test] after');
      expect(envelope.sanitized_text).toBe('Before after');
      // But markers still capture them
      expect(envelope.declared_markers).toHaveLength(1);
    });

    it('includes sanitization version', () => {
      const envelope = buildLanguageIOEnvelope('test');
      expect(envelope.sanitization_version).toBe('sanitizer/v3');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty string', () => {
      const envelope = buildLanguageIOEnvelope('');
      expect(envelope.raw_text_verbatim).toBe('');
      expect(envelope.declared_markers).toHaveLength(0);
      expect(envelope.envelope_id).toBe('e3b0c44298fc1c14'); // SHA256 of empty string
    });

    it('handles whitespace-only input', () => {
      const envelope = buildLanguageIOEnvelope('   \n\t   ');
      expect(envelope.raw_text_verbatim).toBe('   \n\t   ');
      expect(envelope.sanitized_text).toBe('');
    });

    it('handles very long goal tags', () => {
      const longTarget = 'a'.repeat(200);
      const input = `[GOAL: mine ${longTarget}]`;
      const envelope = buildLanguageIOEnvelope(input);
      expect(envelope.declared_markers).toHaveLength(1);
      expect(envelope.declared_markers[0].verbatim_text).toBe(input);
    });

    it('handles special characters in goal tag', () => {
      const envelope = buildLanguageIOEnvelope('[GOAL: craft wood_planks]');
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: craft wood_planks]');
    });

    it('handles unicode in text', () => {
      const envelope = buildLanguageIOEnvelope('I see 🌲 trees. [GOAL: craft 木]');
      expect(envelope.declared_markers[0].verbatim_text).toBe('[GOAL: craft 木]');
      expect(envelope.raw_text_verbatim).toBe('I see 🌲 trees. [GOAL: craft 木]');
    });
  });
});

describe('computeEnvelopeId', () => {
  it('produces 16 character hex string', () => {
    const id = computeEnvelopeId('test');
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    const id1 = computeEnvelopeId('test input');
    const id2 = computeEnvelopeId('test input');
    expect(id1).toBe(id2);
  });

  it('differs for different inputs', () => {
    const id1 = computeEnvelopeId('input one');
    const id2 = computeEnvelopeId('input two');
    expect(id1).not.toBe(id2);
  });
});

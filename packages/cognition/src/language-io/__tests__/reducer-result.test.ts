/**
 * Reducer Result Tests
 *
 * Tests for parsing and handling Sterling reducer results.
 *
 * Key invariants verified:
 * - Fails closed on unknown schema versions
 * - Correctly computes is_executable from source data
 * - Does NOT expose raw predicates or semantic internals
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { parseReducerResult, SchemaVersionError } from '../reducer-result-types';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeRawResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_id: 'sterling.language_reducer_result.v1',
    schema_version: '1.1.0',
    source_envelope_id: 'env_123',
    committed_ir_digest: 'ling_ir:abc123def456',
    committed_goal_prop_id: null,
    reducer_version: 'intent_reducer/v1.0.0',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('parseReducerResult', () => {
  describe('Schema Version Handling', () => {
    it('accepts supported version 1.0.0', () => {
      const raw = makeRawResponse({ schema_version: '1.0.0' });
      expect(() => parseReducerResult(raw)).not.toThrow();
    });

    it('accepts supported version 1.1.0', () => {
      const raw = makeRawResponse({ schema_version: '1.1.0' });
      expect(() => parseReducerResult(raw)).not.toThrow();
    });

    it('fails closed on unknown future version', () => {
      const raw = makeRawResponse({ schema_version: '2.0.0' });
      expect(() => parseReducerResult(raw)).toThrow(SchemaVersionError);
    });

    it('fails closed on unknown past version', () => {
      const raw = makeRawResponse({ schema_version: '0.9.0' });
      expect(() => parseReducerResult(raw)).toThrow(SchemaVersionError);
    });

    it('fails closed on malformed version', () => {
      const raw = makeRawResponse({ schema_version: 'invalid' });
      expect(() => parseReducerResult(raw)).toThrow(SchemaVersionError);
    });

    it('includes helpful error message', () => {
      const raw = makeRawResponse({ schema_version: '99.0.0' });
      try {
        parseReducerResult(raw);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaVersionError);
        const error = e as SchemaVersionError;
        expect(error.message).toContain('99.0.0');
        expect(error.message).toContain('1.1.0');
        expect(error.schemaType).toBe('reducer_result');
        expect(error.receivedVersion).toBe('99.0.0');
      }
    });
  });

  describe('Response Structure Validation', () => {
    it('fails on null response', () => {
      expect(() => parseReducerResult(null)).toThrow('Invalid reducer response structure');
    });

    it('fails on non-object response', () => {
      expect(() => parseReducerResult('string')).toThrow('Invalid reducer response structure');
      expect(() => parseReducerResult(123)).toThrow('Invalid reducer response structure');
    });

    it('fails on missing schema_version', () => {
      const raw = makeRawResponse();
      delete raw.schema_version;
      expect(() => parseReducerResult(raw)).toThrow('Invalid reducer response structure');
    });

    it('fails on missing source_envelope_id', () => {
      const raw = makeRawResponse();
      delete raw.source_envelope_id;
      expect(() => parseReducerResult(raw)).toThrow('Invalid reducer response structure');
    });

    it('fails on missing committed_ir_digest', () => {
      const raw = makeRawResponse();
      delete raw.committed_ir_digest;
      expect(() => parseReducerResult(raw)).toThrow('Invalid reducer response structure');
    });
  });

  describe('Executable Computation', () => {
    it('is executable when has committed goal and no grounding', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: 'prop_123',
        grounding: null,
      });
      const result = parseReducerResult(raw);
      expect(result.is_executable).toBe(true);
    });

    it('is executable when has committed goal and grounding passed', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: 'prop_123',
        grounding: { passed: true, reason: 'All entities found' },
      });
      const result = parseReducerResult(raw);
      expect(result.is_executable).toBe(true);
    });

    it('is NOT executable when no committed goal', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: null,
        advisory: { intent_family: 'PLAN', confidence: 0.9 },
      });
      const result = parseReducerResult(raw);
      expect(result.is_executable).toBe(false);
    });

    it('is NOT executable when grounding failed', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: 'prop_123',
        grounding: { passed: false, reason: 'Entity not found' },
      });
      const result = parseReducerResult(raw);
      expect(result.is_executable).toBe(false);
    });
  });

  describe('Advisory Parsing', () => {
    it('parses advisory when present', () => {
      const raw = makeRawResponse({
        advisory: {
          intent_family: 'PLAN',
          intent_type: 'CRAFT',
          confidence: 0.85,
          suggested_domain: 'planning',
        },
      });
      const result = parseReducerResult(raw);
      expect(result.advisory).not.toBeNull();
      expect(result.advisory!.intent_family).toBe('PLAN');
      expect(result.advisory!.intent_type).toBe('CRAFT');
      expect(result.advisory!.confidence).toBe(0.85);
      expect(result.advisory!.suggested_domain).toBe('planning');
    });

    it('returns null advisory when not present', () => {
      const raw = makeRawResponse({ advisory: null });
      const result = parseReducerResult(raw);
      expect(result.advisory).toBeNull();
    });

    it('handles partial advisory (null fields)', () => {
      const raw = makeRawResponse({
        advisory: {
          intent_family: 'NAVIGATE',
          intent_type: null,
          confidence: 0.5,
        },
      });
      const result = parseReducerResult(raw);
      expect(result.advisory!.intent_family).toBe('NAVIGATE');
      expect(result.advisory!.intent_type).toBeNull();
    });
  });

  describe('Grounding Parsing', () => {
    it('parses grounding when present and passed', () => {
      const raw = makeRawResponse({
        grounding: {
          passed: true,
          reason: 'All entities grounded',
          world_snapshot_digest: 'snap_abc123',
        },
      });
      const result = parseReducerResult(raw);
      expect(result.grounding).not.toBeNull();
      expect(result.grounding!.passed).toBe(true);
      expect(result.grounding!.reason).toBe('All entities grounded');
      expect(result.grounding!.world_snapshot_digest).toBe('snap_abc123');
    });

    it('parses grounding when present and failed', () => {
      const raw = makeRawResponse({
        grounding: {
          passed: false,
          reason: 'diamond_ore not found in nearby blocks',
        },
      });
      const result = parseReducerResult(raw);
      expect(result.grounding!.passed).toBe(false);
      expect(result.grounding!.reason).toContain('diamond_ore');
    });

    it('returns null grounding when not present', () => {
      const raw = makeRawResponse({ grounding: null });
      const result = parseReducerResult(raw);
      expect(result.grounding).toBeNull();
    });
  });

  describe('Semantic Empty Detection', () => {
    it('is semantically empty when no committed goal and no propositions', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: null,
        has_committed_propositions: false,
      });
      const result = parseReducerResult(raw);
      expect(result.is_semantically_empty).toBe(true);
    });

    it('is NOT semantically empty when has committed goal', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: 'prop_123',
      });
      const result = parseReducerResult(raw);
      expect(result.is_semantically_empty).toBe(false);
    });
  });

  describe('Data Protection (I-CONVERSION-1)', () => {
    it('does NOT expose raw predicates', () => {
      const raw = makeRawResponse({
        committed_ir_dict: {
          predicates: [{ pred_id: 'pred_1', lemma: 'craft' }],
        },
      });
      const result = parseReducerResult(raw);
      // Result should NOT have predicates exposed
      expect(result).not.toHaveProperty('predicates');
      expect(result).not.toHaveProperty('committed_ir_dict');
    });

    it('does NOT expose proposition roles', () => {
      const raw = makeRawResponse({
        committed_ir_dict: {
          propositions: [
            {
              prop_id: 'prop_1',
              roles: { agent: 'speaker', theme: 'wood' },
            },
          ],
        },
      });
      const result = parseReducerResult(raw);
      expect(result).not.toHaveProperty('propositions');
      expect(result).not.toHaveProperty('roles');
    });

    it('does NOT expose entity labels', () => {
      const raw = makeRawResponse({
        committed_ir_dict: {
          entities: [{ ent_id: 'ent_1', label: 'wood', type: 'item' }],
        },
      });
      const result = parseReducerResult(raw);
      expect(result).not.toHaveProperty('entities');
    });

    it('exposes ONLY safe fields', () => {
      const raw = makeRawResponse({
        committed_goal_prop_id: 'prop_123',
        advisory: { intent_family: 'PLAN', confidence: 1.0 },
        grounding: { passed: true, reason: 'ok' },
      });
      const result = parseReducerResult(raw);

      // Allowed fields
      const allowedFields = [
        'committed_goal_prop_id',
        'committed_ir_digest',
        'source_envelope_id',
        'is_executable',
        'is_semantically_empty',
        'advisory',
        'grounding',
        'schema_version',
        'reducer_version',
      ];

      for (const key of Object.keys(result)) {
        expect(allowedFields).toContain(key);
      }
    });
  });
});

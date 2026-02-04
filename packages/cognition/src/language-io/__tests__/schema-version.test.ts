/**
 * Schema Version Tests
 *
 * Tests for schema version compatibility and fail-closed behavior.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import {
  validateEnvelopeVersion,
  validateReducerResultVersion,
  validateWorldSnapshotVersion,
  SchemaVersionError,
  ENVELOPE_SUPPORTED_VERSIONS,
  REDUCER_RESULT_SUPPORTED_VERSIONS,
  WORLD_SNAPSHOT_SUPPORTED_VERSIONS,
  isVersionSupported,
} from '../schema-compatibility';

describe('Schema Version Handling', () => {
  describe('validateEnvelopeVersion', () => {
    it('accepts supported versions', () => {
      for (const version of ENVELOPE_SUPPORTED_VERSIONS) {
        expect(() => validateEnvelopeVersion(version)).not.toThrow();
      }
    });

    it('rejects unknown versions with SchemaVersionError', () => {
      expect(() => validateEnvelopeVersion('2.0.0')).toThrow(SchemaVersionError);
      expect(() => validateEnvelopeVersion('0.9.0')).toThrow(SchemaVersionError);
      expect(() => validateEnvelopeVersion('unknown')).toThrow(SchemaVersionError);
    });
  });

  describe('validateReducerResultVersion', () => {
    it('accepts supported versions', () => {
      for (const version of REDUCER_RESULT_SUPPORTED_VERSIONS) {
        expect(() => validateReducerResultVersion(version)).not.toThrow();
      }
    });

    it('rejects unknown versions with SchemaVersionError', () => {
      expect(() => validateReducerResultVersion('2.0.0')).toThrow(SchemaVersionError);
      expect(() => validateReducerResultVersion('0.5.0')).toThrow(SchemaVersionError);
    });
  });

  describe('validateWorldSnapshotVersion', () => {
    it('accepts supported versions', () => {
      for (const version of WORLD_SNAPSHOT_SUPPORTED_VERSIONS) {
        expect(() => validateWorldSnapshotVersion(version)).not.toThrow();
      }
    });

    it('rejects unknown versions with SchemaVersionError', () => {
      expect(() => validateWorldSnapshotVersion('3.0.0')).toThrow(SchemaVersionError);
    });
  });

  describe('SchemaVersionError', () => {
    it('includes schema type in error', () => {
      try {
        validateReducerResultVersion('99.0.0');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaVersionError);
        const error = e as SchemaVersionError;
        expect(error.schemaType).toBe('reducer_result');
      }
    });

    it('includes received version in error', () => {
      try {
        validateReducerResultVersion('99.0.0');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as SchemaVersionError;
        expect(error.receivedVersion).toBe('99.0.0');
      }
    });

    it('includes supported versions in error', () => {
      try {
        validateReducerResultVersion('99.0.0');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as SchemaVersionError;
        expect(error.supportedVersions).toEqual(REDUCER_RESULT_SUPPORTED_VERSIONS);
      }
    });

    it('includes helpful message', () => {
      try {
        validateReducerResultVersion('2.0.0');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as SchemaVersionError;
        expect(error.message).toContain('2.0.0');
        expect(error.message).toContain('1.1.0');
        expect(error.message).toContain('reducer_result');
        expect(error.message).toContain('Update TS client');
      }
    });
  });

  describe('isVersionSupported', () => {
    it('returns true for supported envelope versions', () => {
      expect(isVersionSupported('envelope', '1.0.0')).toBe(true);
    });

    it('returns false for unsupported envelope versions', () => {
      expect(isVersionSupported('envelope', '2.0.0')).toBe(false);
    });

    it('returns true for supported reducer_result versions', () => {
      expect(isVersionSupported('reducer_result', '1.1.0')).toBe(true);
    });

    it('returns false for unsupported reducer_result versions', () => {
      expect(isVersionSupported('reducer_result', '0.5.0')).toBe(false);
    });

    it('returns true for supported world_snapshot versions', () => {
      expect(isVersionSupported('world_snapshot', '1.0.0')).toBe(true);
    });

    it('returns false for unsupported world_snapshot versions', () => {
      expect(isVersionSupported('world_snapshot', '5.0.0')).toBe(false);
    });
  });
});

describe('Fail-Closed Contract', () => {
  it('fails closed rather than attempting best-effort parsing', () => {
    // This test documents the contract: unknown version = error, not fallback
    const unknownVersion = '999.0.0';

    // All validators should throw, not return or attempt parsing
    expect(() => validateEnvelopeVersion(unknownVersion)).toThrow(SchemaVersionError);
    expect(() => validateReducerResultVersion(unknownVersion)).toThrow(SchemaVersionError);
    expect(() => validateWorldSnapshotVersion(unknownVersion)).toThrow(SchemaVersionError);
  });

  it('requires explicit version upgrade in code', () => {
    // To support a new version, the SUPPORTED_VERSIONS array must be updated
    // This test documents that the arrays are the source of truth

    expect(ENVELOPE_SUPPORTED_VERSIONS).toContain('1.0.0');
    expect(REDUCER_RESULT_SUPPORTED_VERSIONS).toContain('1.0.0');
    expect(REDUCER_RESULT_SUPPORTED_VERSIONS).toContain('1.1.0');
    expect(WORLD_SNAPSHOT_SUPPORTED_VERSIONS).toContain('1.0.0');
    expect(WORLD_SNAPSHOT_SUPPORTED_VERSIONS).toContain('1.1.0');

    // Future versions are NOT supported until explicitly added
    expect(ENVELOPE_SUPPORTED_VERSIONS).not.toContain('2.0.0');
    expect(REDUCER_RESULT_SUPPORTED_VERSIONS).not.toContain('2.0.0');
    expect(WORLD_SNAPSHOT_SUPPORTED_VERSIONS).not.toContain('2.0.0');
  });
});

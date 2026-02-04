/**
 * Schema version compatibility for Language IO boundary.
 *
 * TS must fail closed on unknown versions rather than
 * attempting "best effort" parsing.
 *
 * @author @darianrosebrook
 */

// =============================================================================
// Supported Version Constants
// =============================================================================

export const ENVELOPE_SUPPORTED_VERSIONS = ['1.0.0'] as const;
export const REDUCER_RESULT_SUPPORTED_VERSIONS = ['1.0.0', '1.1.0'] as const;
export const WORLD_SNAPSHOT_SUPPORTED_VERSIONS = ['1.0.0', '1.1.0'] as const;

export type EnvelopeVersion = (typeof ENVELOPE_SUPPORTED_VERSIONS)[number];
export type ReducerResultVersion = (typeof REDUCER_RESULT_SUPPORTED_VERSIONS)[number];
export type WorldSnapshotVersion = (typeof WORLD_SNAPSHOT_SUPPORTED_VERSIONS)[number];

// =============================================================================
// Schema Version Error
// =============================================================================

/**
 * Error thrown when an unsupported schema version is encountered.
 *
 * This error is intentionally informative to help debugging cross-system
 * compatibility issues.
 */
export class SchemaVersionError extends Error {
  constructor(
    public readonly schemaType: string,
    public readonly receivedVersion: string,
    public readonly supportedVersions: readonly string[],
  ) {
    super(
      `Unsupported ${schemaType} schema version: ${receivedVersion}. ` +
        `Supported versions: ${supportedVersions.join(', ')}. ` +
        `Update TS client or check Sterling version compatibility.`,
    );
    this.name = 'SchemaVersionError';
  }
}

// =============================================================================
// Version Validators
// =============================================================================

/**
 * Validate envelope schema version.
 *
 * @throws SchemaVersionError if version is not supported
 */
export function validateEnvelopeVersion(version: string): asserts version is EnvelopeVersion {
  if (!ENVELOPE_SUPPORTED_VERSIONS.includes(version as EnvelopeVersion)) {
    throw new SchemaVersionError('envelope', version, ENVELOPE_SUPPORTED_VERSIONS);
  }
}

/**
 * Validate reducer result schema version.
 *
 * @throws SchemaVersionError if version is not supported
 */
export function validateReducerResultVersion(
  version: string,
): asserts version is ReducerResultVersion {
  if (!REDUCER_RESULT_SUPPORTED_VERSIONS.includes(version as ReducerResultVersion)) {
    throw new SchemaVersionError('reducer_result', version, REDUCER_RESULT_SUPPORTED_VERSIONS);
  }
}

/**
 * Validate world snapshot schema version.
 *
 * @throws SchemaVersionError if version is not supported
 */
export function validateWorldSnapshotVersion(
  version: string,
): asserts version is WorldSnapshotVersion {
  if (!WORLD_SNAPSHOT_SUPPORTED_VERSIONS.includes(version as WorldSnapshotVersion)) {
    throw new SchemaVersionError('world_snapshot', version, WORLD_SNAPSHOT_SUPPORTED_VERSIONS);
  }
}

/**
 * Check if a version is supported without throwing.
 */
export function isVersionSupported(
  schemaType: 'envelope' | 'reducer_result' | 'world_snapshot',
  version: string,
): boolean {
  switch (schemaType) {
    case 'envelope':
      return ENVELOPE_SUPPORTED_VERSIONS.includes(version as EnvelopeVersion);
    case 'reducer_result':
      return REDUCER_RESULT_SUPPORTED_VERSIONS.includes(version as ReducerResultVersion);
    case 'world_snapshot':
      return WORLD_SNAPSHOT_SUPPORTED_VERSIONS.includes(version as WorldSnapshotVersion);
  }
}

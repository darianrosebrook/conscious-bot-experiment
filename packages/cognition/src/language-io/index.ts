/**
 * Language IO Boundary Module
 *
 * This module provides the TypeScript side of the Sterling Language IO boundary.
 * It constructs envelopes for Sterling to consume, extracts verbatim markers,
 * and handles Sterling responses.
 *
 * Key principle: TypeScript is an EVIDENCE EMITTER, not a semantic authority.
 * Sterling handles all semantic interpretation.
 *
 * @author @darianrosebrook
 */

// =============================================================================
// Envelope Construction (Input Contract)
// =============================================================================

export { buildLanguageIOEnvelope, computeEnvelopeId, verifyEnvelopeId } from './envelope-builder';
export type { EnvelopeBuilderOptions } from './envelope-builder';

// Types (projections of Sterling schemas)
export type {
  LanguageIOEnvelopeV1,
  DeclaredMarker,
  SanitizationFlags,
  WorldSnapshotRef,
} from './envelope-types';
export {
  LANGUAGE_IO_ENVELOPE_SCHEMA_ID,
  LANGUAGE_IO_ENVELOPE_SCHEMA_VERSION,
  SANITIZATION_VERSION,
  createDefaultSanitizationFlags,
} from './envelope-types';

// Marker extraction (verbatim only)
export { extractVerbatimMarkers, countGoalTags, hasGoalTag } from './marker-extractor';

// Sanitization pipeline
export { sanitize } from './sanitization-pipeline';
export type { SanitizationResult } from './sanitization-pipeline';

// =============================================================================
// Reducer Result Handling (Output Contract)
// =============================================================================

export { parseReducerResult, SchemaVersionError } from './reducer-result-types';
export type { ReducerResultView, AdvisoryView, GroundingView } from './reducer-result-types';

// =============================================================================
// Execution Gate (Task Conversion)
// =============================================================================

export {
  canConvertToTask,
  requireExecutable,
  getExecutionBlockReason,
  isSemanticEmpty,
  ExecutionGateError,
} from './execution-gate';

// =============================================================================
// Schema Compatibility
// =============================================================================

export {
  validateEnvelopeVersion,
  validateReducerResultVersion,
  validateWorldSnapshotVersion,
  isVersionSupported,
  ENVELOPE_SUPPORTED_VERSIONS,
  REDUCER_RESULT_SUPPORTED_VERSIONS,
  WORLD_SNAPSHOT_SUPPORTED_VERSIONS,
} from './schema-compatibility';
export type {
  EnvelopeVersion,
  ReducerResultVersion,
  WorldSnapshotVersion,
} from './schema-compatibility';

// =============================================================================
// Sterling Language IO Client (Single Entry Point)
// =============================================================================

export {
  SterlingLanguageIOClient,
  getDefaultLanguageIOClient,
  setDefaultLanguageIOClient,
} from './sterling-language-io-client';
export type {
  LanguageIOClientConfig,
  ReduceOptions,
  ReduceResult,
  ReduceError,
  FallbackResult,
} from './sterling-language-io-client';

// =============================================================================
// Transport Layer (for production wiring)
// =============================================================================

export {
  SterlingTransportAdapter,
  MockLanguageIOTransport,
  getDefaultTransport,
  setDefaultTransport,
} from './transport';
export type {
  LanguageIOTransport,
  LanguageIOReduceResponse,
  SterlingClientLike,
} from './transport';

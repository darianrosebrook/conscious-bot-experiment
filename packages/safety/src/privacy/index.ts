/**
 * Privacy Module - Data Protection and Server Safety Compliance
 *
 * @author @darianrosebrook
 */

// Main Privacy System
export { PrivacySystem } from './privacy-system';
export type {
  PrivacySystemConfig,
  PrivacyMetrics,
  DataProcessingRequest,
  DataProcessingResult,
} from './privacy-system';

// Core Components
export {
  DataAnonymizer,
  DEFAULT_ANONYMIZATION_CONFIG,
} from './data-anonymizer';
export { GeofenceManager } from './geofence-manager';
export {
  ConsentManager,
  DEFAULT_CONSENT_RETENTION_PERIODS,
  CONSENT_BENEFITS,
} from './consent-manager';
export { RateLimiter } from './rate-limiter';

// Types and Interfaces
export * from './types';

// Version info
export const PRIVACY_MODULE_VERSION = '1.0.0';

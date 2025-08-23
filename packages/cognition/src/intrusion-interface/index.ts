/**
 * Intrusion Interface Module
 *
 * Exports for the intrusion interface system that handles external suggestions
 * with robust filtering and evaluation mechanisms.
 *
 * @author @darianrosebrook
 */

export {
  IntrusionInterface,
  type ProcessingResult,
} from './intrusion-interface';
export { IntrusionParser, type SourceMetadata } from './intrusion-parser';
export { TaxonomyClassifier } from './taxonomy-classifier';

// Types
export type {
  IntrusionContent,
  RiskClassification,
  ContentClassification,
  RiskAssessment,
  RuleViolation,
  ComplianceResult,
  IntrusionDecision,
  RejectionPattern,
  DriftReport,
  AgentContext,
  QueueEntry,
  IntrusionInterfaceConfig,
  IntrusionStats,
  PerformanceMetrics,
  IntrusionEvent,
  IntrusionFeedback,
} from './types';

// Enums
export { RiskLevel, ContentType, DecisionType, UrgencyLevel } from './types';

// Default configuration
export { DEFAULT_INTRUSION_CONFIG } from './types';

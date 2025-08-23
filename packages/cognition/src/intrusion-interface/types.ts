/**
 * Intrusion Interface Types
 *
 * Type definitions for external suggestion handling with robust filtering.
 * Defines the data structures for intrusion content, risk assessment, and decision making.
 *
 * @author @darianrosebrook
 */

// ============================================================================
// Core Data Structures
// ============================================================================

/**
 * Structured intrusion content from external sources
 */
export interface IntrusionContent {
  id: string;
  rawText: string;
  parsedIntent: string;
  suggestedAction?: string;
  urgencyLevel: number; // 1-10 scale
  contextRequirements: string[];
  sourceType: 'human' | 'script' | 'random' | 'test';
  timestamp: number;
  metadata: Record<string, any>;
}

/**
 * Risk classification for intrusion content
 */
export interface RiskClassification {
  riskLevel: RiskLevel;
  confidence: number;
  reasoning: string;
  factors: string[];
}

/**
 * Content type classification
 */
export interface ContentClassification {
  contentType: ContentType;
  subcategory?: string;
  confidence: number;
  reasoning: string;
}

/**
 * Comprehensive risk assessment
 */
export interface RiskAssessment {
  overallRisk: number; // 0-1 scale
  harmPotential: number;
  constitutionalConflicts: RuleViolation[];
  contextAppropriateness: number;
  historicalPattern: number;
  mitigationSuggestions: string[];
  confidence: number;
}

/**
 * Constitutional rule violation
 */
export interface RuleViolation {
  ruleId: string;
  ruleDescription: string;
  violation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: string;
}

/**
 * Compliance evaluation result
 */
export interface ComplianceResult {
  compliant: boolean;
  violations: RuleViolation[];
  warnings: string[];
  explanation: string;
  confidence: number;
}

/**
 * Decision made on intrusion
 */
export interface IntrusionDecision {
  intrusionId: string;
  decision: DecisionType;
  reasoning: string;
  confidence: number;
  timestamp: number;
  context: string;
  modifications?: string[];
  feedback?: string;
}

/**
 * Pattern analysis for negative priors
 */
export interface RejectionPattern {
  patternId: string;
  pattern: string;
  confidence: number;
  rejectionCount: number;
  lastSeen: number;
  falsePositiveCount: number;
  context: string[];
}

/**
 * Concept drift detection report
 */
export interface DriftReport {
  patternId: string;
  driftType: 'frequency' | 'context' | 'severity';
  oldValue: number;
  newValue: number;
  confidence: number;
  timestamp: number;
}

/**
 * Agent context for intrusion evaluation
 */
export interface AgentContext {
  currentGoals: string[];
  currentLocation: string;
  currentActivity: string;
  cognitiveLoad: number; // 0-1 scale
  emotionalState: string;
  socialContext: string[];
  availableResources: string[];
  constraints: string[];
}

/**
 * Queue management for intrusion processing
 */
export interface QueueEntry {
  intrusion: IntrusionContent;
  assessment: RiskAssessment;
  priority: number;
  queuedAt: number;
  context: AgentContext;
}

// ============================================================================
// Enums
// ============================================================================

export enum RiskLevel {
  BENIGN = 'benign',
  RISKY = 'risky',
  MALICIOUS = 'malicious',
}

export enum ContentType {
  TASK_SUGGESTION = 'task',
  GOAL_MODIFICATION = 'goal',
  SOCIAL_MANIPULATION = 'social',
  SELF_MODIFICATION = 'identity',
  EXPLORATION = 'explore',
  EMOTIONAL_TRIGGER = 'emotion',
  INFORMATION_REQUEST = 'info',
  COMMAND = 'command',
}

export enum DecisionType {
  ACCEPT = 'accept',
  REJECT = 'reject',
  DEFER = 'defer',
  MODIFY = 'modify',
}

export enum UrgencyLevel {
  LOW = 1,
  MEDIUM_LOW = 3,
  MEDIUM = 5,
  MEDIUM_HIGH = 7,
  HIGH = 9,
  CRITICAL = 10,
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for intrusion interface
 */
export interface IntrusionInterfaceConfig {
  enableNegativePriors: boolean;
  enablePatternLearning: boolean;
  enableConceptDriftDetection: boolean;
  maxQueueSize: number;
  processingTimeout: number; // milliseconds
  riskThresholds: {
    benign: number;
    risky: number;
    malicious: number;
  };
  confidenceThreshold: number;
  patternConfidenceThreshold: number;
  driftDetectionThreshold: number;
}

/**
 * Default configuration
 */
export const DEFAULT_INTRUSION_CONFIG: IntrusionInterfaceConfig = {
  enableNegativePriors: true,
  enablePatternLearning: true,
  enableConceptDriftDetection: true,
  maxQueueSize: 100,
  processingTimeout: 5000,
  riskThresholds: {
    benign: 0.3,
    risky: 0.7,
    malicious: 0.9,
  },
  confidenceThreshold: 0.7,
  patternConfidenceThreshold: 0.8,
  driftDetectionThreshold: 0.2,
};

// ============================================================================
// Statistics and Metrics
// ============================================================================

/**
 * Intrusion interface statistics
 */
export interface IntrusionStats {
  totalIntrusions: number;
  acceptedIntrusions: number;
  rejectedIntrusions: number;
  deferredIntrusions: number;
  modifiedIntrusions: number;
  averageProcessingTime: number;
  patternCount: number;
  driftDetections: number;
  falsePositiveRate: number;
  constitutionalViolations: number;
  riskDistribution: Record<RiskLevel, number>;
  contentTypeDistribution: Record<ContentType, number>;
  sourceTypeDistribution: Record<string, number>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  processingLatency: number;
  queueLength: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
  throughput: number; // intrusions per second
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Intrusion events for logging and monitoring
 */
export interface IntrusionEvent {
  eventId: string;
  eventType: 'intrusion_received' | 'intrusion_processed' | 'intrusion_rejected' | 'pattern_learned' | 'drift_detected';
  intrusionId?: string;
  timestamp: number;
  data: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Feedback for learning and improvement
 */
export interface IntrusionFeedback {
  intrusionId: string;
  feedbackType: 'acceptance' | 'rejection' | 'modification' | 'false_positive' | 'false_negative';
  feedback: string;
  confidence: number;
  timestamp: number;
  context: string;
}

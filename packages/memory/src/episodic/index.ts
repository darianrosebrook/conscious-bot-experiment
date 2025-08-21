/**
 * Episodic memory system exports.
 *
 * Provides comprehensive episodic memory functionality including
 * event logging, salience scoring, consolidation, retrieval, and narrative generation.
 *
 * @author @darianrosebrook
 */

export { EventLogger } from './event-logger';
export { SalienceScorer } from './salience-scorer';
export { MemoryConsolidation, ConsolidationResult, MemoryPattern, PatternType, SemanticUpdate, ConsolidationMetrics } from './memory-consolidation';
export { EpisodicRetrieval, RetrievalCue, RetrievalCueType, RetrievalContext, RetrievedMemory, TemporalQuery, SpatialQuery, SocialQuery, EmotionalQuery } from './episodic-retrieval';
export { 
  NarrativeGenerator, 
  NarrativeStyle, 
  NarrativeTheme, 
  GeneratedNarrative,
  AutobiographicalNarrative,
  TemporalNarrative,
  ExplanatoryNarrative,
  ComparativeNarrative,
  SummativeNarrative,
  TimelineEvent,
  Milestone,
  TemporalPattern,
  ComparisonPeriod,
  Change,
  Continuity
} from './narrative-generator';

// Re-export types for convenience
export type { Experience, ExperienceType } from '../types';

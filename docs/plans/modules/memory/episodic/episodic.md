# Episodic Memory: Experience and Event Storage

**Module:** `memory/episodic/`
**Purpose:** Autobiographical memory system storing significant experiences and events
**Author:** @darianrosebrook

> **Implementation Status: PARTIALLY IMPLEMENTED**
> Last verified: 2026-02-08
> Code location: `packages/memory/src/episodic/`
> Implemented: `event-logger.ts`, `memory-consolidation.ts`, `episodic-retrieval.ts`, `narrative-generator.ts`
> Design-only (not yet implemented): Some class hierarchies and sub-components described below exist only as design targets.

## Overview

The Episodic Memory module implements a **computational autobiographical memory** that captures, stores, and retrieves the agent's personal experiences. This system enables the conscious bot to remember specific events, learn from past experiences, and maintain temporal continuity of its existence—a crucial component of consciousness-like behavior.

## Conceptual Framework

### Human-Like Episodic Memory

Inspired by human episodic memory research, this system captures:

- **What happened**: Specific events and their details
- **When it happened**: Temporal context and sequencing
- **Where it happened**: Spatial context and location
- **Who was involved**: Social context and participants
- **How it felt**: Emotional significance and valence
- **Why it mattered**: Personal relevance and importance

### Memory Formation Process

```
Experience → Encoding → Consolidation → Storage → Retrieval → Reconstruction
    ↓           ↓            ↓          ↓         ↓            ↓
Sensory     Event        Significance  Long-term  Cue-based   Narrative
Input    → Detection  → Assessment  → Storage  → Search   → Generation
```

## Core Components

### 1. Event Detection (`event-detector.ts`)

**Purpose:** Identify significant events worthy of episodic storage

```typescript
/**
 * Event detection system that identifies significant experiences
 * and determines their episodic memory worthiness based on multiple criteria.
 * 
 * @author @darianrosebrook
 */
class EventDetector {
  /**
   * Detect significant events from ongoing experience stream
   * 
   * @param experienceData - Continuous stream of agent experiences
   * @param detectionCriteria - Criteria for event significance
   * @returns Detected events with significance scores
   */
  detectSignificantEvents(
    experienceData: ExperienceStream,
    detectionCriteria: EventDetectionCriteria
  ): DetectedEvent[];

  /**
   * Evaluate event significance for episodic memory storage
   * 
   * @param event - Event to evaluate for significance
   * @param context - Current agent and environmental context
   * @returns Significance assessment with contributing factors
   */
  evaluateEventSignificance(
    event: CandidateEvent,
    context: EpisodicalContext
  ): SignificanceAssessment;

  /**
   * Identify event boundaries and temporal structure
   * 
   * @param experienceSequence - Sequence of experiences to analyze
   * @returns Event boundaries with temporal segmentation
   */
  identifyEventBoundaries(
    experienceSequence: Experience[]
  ): EventBoundary[];

  /**
   * Classify event types for categorical organization
   * 
   * @param event - Event to classify
   * @param classificationScheme - Classification taxonomy
   * @returns Event classification with confidence scores
   */
  classifyEventType(
    event: DetectedEvent,
    classificationScheme: EventClassificationScheme
  ): EventClassification;

  /**
   * Detect emotional significance and valence of events
   * 
   * @param event - Event to analyze for emotional content
   * @param emotionalContext - Current emotional state context
   * @returns Emotional significance assessment
   */
  detectEmotionalSignificance(
    event: DetectedEvent,
    emotionalContext: EmotionalContext
  ): EmotionalSignificance;
}
```

### 2. Episodic Encoder (`episodic-encoder.ts`)

**Purpose:** Encode detected events into rich episodic memory representations

```typescript
/**
 * Episodic encoding system that transforms detected events into
 * rich, multi-dimensional memory representations suitable for storage and retrieval.
 * 
 * @author @darianrosebrook
 */
class EpisodicEncoder {
  /**
   * Encode event into comprehensive episodic memory representation
   * 
   * @param event - Event to encode into episodic memory
   * @param encodingContext - Context affecting encoding process
   * @returns Encoded episodic memory with rich structure
   */
  encodeEpisode(
    event: DetectedEvent,
    encodingContext: EncodingContext
  ): EpisodicMemory;

  /**
   * Extract temporal context and sequencing information
   * 
   * @param event - Event to extract temporal context from
   * @param temporalHistory - Historical temporal context
   * @returns Temporal encoding with relative and absolute timing
   */
  encodeTemporalContext(
    event: DetectedEvent,
    temporalHistory: TemporalHistory
  ): TemporalEncoding;

  /**
   * Extract spatial context and location information
   * 
   * @param event - Event to extract spatial context from
   * @param spatialContext - Current spatial understanding
   * @returns Spatial encoding with location and environmental details
   */
  encodeSpatialContext(
    event: DetectedEvent,
    spatialContext: SpatialContext
  ): SpatialEncoding;

  /**
   * Extract social context and participant information
   * 
   * @param event - Event to extract social context from
   * @param socialContext - Current social relationships and context
   * @returns Social encoding with participant roles and relationships
   */
  encodeSocialContext(
    event: DetectedEvent,
    socialContext: SocialContext
  ): SocialEncoding;

  /**
   * Generate causal links between events
   * 
   * @param event - Current event to link
   * @param priorEvents - Previous events that might be causally related
   * @returns Causal encoding with antecedent and consequent relationships
   */
  encodeCausalLinks(
    event: DetectedEvent,
    priorEvents: EpisodicMemory[]
  ): CausalEncoding;

  /**
   * Encode personal significance and meaning
   * 
   * @param event - Event to encode personal significance for
   * @param personalContext - Personal goals, values, and significance markers
   * @returns Personal significance encoding
   */
  encodePersonalSignificance(
    event: DetectedEvent,
    personalContext: PersonalContext
  ): PersonalSignificanceEncoding;
}
```

### 3. Memory Consolidation (`memory-consolidation.ts`)

**Purpose:** Consolidate episodic memories and integrate with existing knowledge

```typescript
/**
 * Memory consolidation system that integrates new episodic memories
 * with existing knowledge and performs sleep-like consolidation processes.
 * 
 * @author @darianrosebrook
 */
class MemoryConsolidation {
  /**
   * Consolidate new episodic memories during rest periods
   * 
   * @param recentMemories - Recently formed episodic memories
   * @param consolidationParameters - Parameters controlling consolidation
   * @returns Consolidation results with strengthened memories
   */
  consolidateRecentMemories(
    recentMemories: EpisodicMemory[],
    consolidationParameters: ConsolidationParameters
  ): ConsolidationResult;

  /**
   * Integrate episodic memories with semantic knowledge
   * 
   * @param episodicMemory - Episodic memory to integrate
   * @param semanticKnowledge - Existing semantic knowledge base
   * @returns Integration result with updated semantic knowledge
   */
  integrateWithSemanticKnowledge(
    episodicMemory: EpisodicMemory,
    semanticKnowledge: SemanticKnowledge
  ): SemanticIntegrationResult;

  /**
   * Identify patterns and themes across multiple episodes
   * 
   * @param episodeCollection - Collection of episodes to analyze
   * @param patternDetectionCriteria - Criteria for pattern identification
   * @returns Identified patterns and recurring themes
   */
  identifyEpisodicPatterns(
    episodeCollection: EpisodicMemory[],
    patternDetectionCriteria: PatternDetectionCriteria
  ): EpisodicPattern[];

  /**
   * Strengthen memories based on retrieval and significance
   * 
   * @param memoryId - ID of memory to strengthen
   * @param strengtheningFactors - Factors contributing to strengthening
   * @returns Memory strengthening result
   */
  strengthenMemory(
    memoryId: string,
    strengtheningFactors: StrengtheningFactor[]
  ): MemoryStrengtheningResult;

  /**
   * Fade or compress less significant memories over time
   * 
   * @param memoryCollection - Collection of memories to process
   * @param fadingCriteria - Criteria for memory fading and compression
   * @returns Memory fading and compression results
   */
  fadeAndCompressMemories(
    memoryCollection: EpisodicMemory[],
    fadingCriteria: FadingCriteria
  ): MemoryFadingResult;
}
```

### 4. Episodic Retrieval (`episodic-retrieval.ts`)

**Purpose:** Retrieve episodic memories based on various cues and contexts

```typescript
/**
 * Episodic memory retrieval system that finds relevant memories
 * based on contextual cues, temporal proximity, and semantic similarity.
 * 
 * @author @darianrosebrook
 */
class EpisodicRetrieval {
  /**
   * Retrieve episodic memories based on contextual cues
   * 
   * @param retrievalCues - Cues for memory retrieval
   * @param retrievalContext - Context affecting retrieval process
   * @returns Retrieved memories ranked by relevance
   */
  retrieveByContext(
    retrievalCues: RetrievalCue[],
    retrievalContext: RetrievalContext
  ): RetrievedMemory[];

  /**
   * Retrieve memories from specific time periods
   * 
   * @param temporalQuery - Time-based query for memory retrieval
   * @param temporalContext - Temporal context for interpretation
   * @returns Temporally relevant memories
   */
  retrieveByTimeframe(
    temporalQuery: TemporalQuery,
    temporalContext: TemporalContext
  ): TemporallyRetrievedMemory[];

  /**
   * Retrieve memories associated with specific locations
   * 
   * @param spatialQuery - Location-based query for memory retrieval
   * @param spatialContext - Spatial context for interpretation
   * @returns Spatially relevant memories
   */
  retrieveByLocation(
    spatialQuery: SpatialQuery,
    spatialContext: SpatialContext
  ): SpatiallyRetrievedMemory[];

  /**
   * Retrieve memories involving specific entities or participants
   * 
   * @param socialQuery - Social entity-based query
   * @param socialContext - Social context for interpretation
   * @returns Socially relevant memories
   */
  retrieveBySocialContext(
    socialQuery: SocialQuery,
    socialContext: SocialContext
  ): SociallyRetrievedMemory[];

  /**
   * Retrieve memories with similar emotional significance
   * 
   * @param emotionalQuery - Emotion-based query for memory retrieval
   * @param emotionalContext - Current emotional context
   * @returns Emotionally relevant memories
   */
  retrieveByEmotionalSimilarity(
    emotionalQuery: EmotionalQuery,
    emotionalContext: EmotionalContext
  ): EmotionallyRetrievedMemory[];

  /**
   * Reconstruct detailed memory from stored representation
   * 
   * @param memoryId - ID of memory to reconstruct
   * @param reconstructionContext - Context for memory reconstruction
   * @returns Detailed reconstructed memory narrative
   */
  reconstructMemoryNarrative(
    memoryId: string,
    reconstructionContext: ReconstructionContext
  ): ReconstructedMemory;
}
```

### 5. Narrative Generator (`narrative-generator.ts`)

**Purpose:** Generate coherent narratives from episodic memory collections

```typescript
/**
 * Narrative generation system that creates coherent stories
 * from episodic memories for self-reflection and communication.
 * 
 * @author @darianrosebrook
 */
class NarrativeGenerator {
  /**
   * Generate autobiographical narrative from memory collection
   * 
   * @param memoryCollection - Collection of memories to narrativize
   * @param narrativeStyle - Style and structure for narrative generation
   * @returns Generated autobiographical narrative
   */
  generateAutobiographicalNarrative(
    memoryCollection: EpisodicMemory[],
    narrativeStyle: NarrativeStyle
  ): AutobiographicalNarrative;

  /**
   * Create temporal narrative sequences showing development over time
   * 
   * @param timespan - Time period for narrative construction
   * @param narrativeTheme - Thematic focus for narrative
   * @returns Temporal development narrative
   */
  generateTemporalNarrative(
    timespan: Timespan,
    narrativeTheme: NarrativeTheme
  ): TemporalNarrative;

  /**
   * Generate explanatory narratives for decision-making contexts
   * 
   * @param decision - Decision requiring explanation
   * @param relevantMemories - Memories relevant to the decision
   * @returns Explanatory narrative linking memories to decision
   */
  generateExplanatoryNarrative(
    decision: Decision,
    relevantMemories: EpisodicMemory[]
  ): ExplanatoryNarrative;

  /**
   * Create comparative narratives showing change and growth
   * 
   * @param comparisonPeriods - Time periods to compare
   * @param comparisonDimensions - Dimensions for comparison
   * @returns Comparative narrative showing development
   */
  generateComparativeNarrative(
    comparisonPeriods: Timespan[],
    comparisonDimensions: ComparisonDimension[]
  ): ComparativeNarrative;

  /**
   * Generate summative narratives for memory consolidation
   * 
   * @param memoryCluster - Cluster of related memories
   * @param summaryParameters - Parameters for summary generation
   * @returns Summative narrative capturing essential elements
   */
  generateSummativeNarrative(
    memoryCluster: EpisodicMemory[],
    summaryParameters: SummaryParameters
  ): SummativeNarrative;
}
```

## Episodic Memory Structure

### Memory Representation

```typescript
interface EpisodicMemory {
  // Core identification
  id: string;
  timestamp: number;
  duration: number;
  
  // Event description
  event: {
    type: EventType;
    description: string;
    participants: Participant[];
    outcome: EventOutcome;
    significance: number;
  };
  
  // Contextual information
  context: {
    temporal: TemporalContext;
    spatial: SpatialContext;
    social: SocialContext;
    emotional: EmotionalContext;
    environmental: EnvironmentalContext;
  };
  
  // Sensory details
  sensoryDetails: {
    visualMemory: VisualMemoryTrace[];
    auditoryMemory: AuditoryMemoryTrace[];
    tactileMemory: TactileMemoryTrace[];
    environmentalCues: EnvironmentalCue[];
  };
  
  // Personal significance
  personalSignificance: {
    goalRelevance: number;
    emotionalImpact: number;
    identityRelevance: number;
    learningValue: number;
    socialImportance: number;
  };
  
  // Causal relationships
  causalLinks: {
    antecedents: CausalLink[];
    consequences: CausalLink[];
    correlatedEvents: CorrelationLink[];
  };
  
  // Memory properties
  memoryProperties: {
    vividness: number;
    confidence: number;
    accessibility: number;
    consolidationLevel: number;
    retrievalCount: number;
    lastRetrieved: number;
  };
  
  // Provenance information
  provenance: {
    encodingMethod: EncodingMethod;
    sourceExperiences: ExperienceReference[];
    validationStatus: ValidationStatus;
    modifications: MemoryModification[];
  };
}
```

### Event Classification

```typescript
enum EventType {
  // Achievement events
  GOAL_ACCOMPLISHED = 'goal_accomplished',
  SKILL_MASTERED = 'skill_mastered',
  MILESTONE_REACHED = 'milestone_reached',
  
  // Social events
  FIRST_MEETING = 'first_meeting',
  SOCIAL_INTERACTION = 'social_interaction',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  COOPERATION_SUCCESS = 'cooperation_success',
  
  // Exploration events
  NEW_PLACE_DISCOVERED = 'new_place_discovered',
  RESOURCE_FOUND = 'resource_found',
  DANGER_ENCOUNTERED = 'danger_encountered',
  
  // Learning events
  PROBLEM_SOLVED = 'problem_solved',
  MISTAKE_MADE = 'mistake_made',
  INSIGHT_GAINED = 'insight_gained',
  SKILL_IMPROVED = 'skill_improved',
  
  // Emotional events
  FEAR_EXPERIENCED = 'fear_experienced',
  JOY_EXPERIENCED = 'joy_experienced',
  SURPRISE_ENCOUNTERED = 'surprise_encountered',
  PRIDE_FELT = 'pride_felt',
  
  // Survival events
  NEAR_DEATH_EXPERIENCE = 'near_death_experience',
  RESOURCE_SCARCITY = 'resource_scarcity',
  SAFETY_ACHIEVED = 'safety_achieved',
  
  // Creative events
  SOMETHING_BUILT = 'something_built',
  ARTISTIC_CREATION = 'artistic_creation',
  INNOVATION_ACHIEVED = 'innovation_achieved'
}
```

## Memory Organization Strategies

### Temporal Organization

```typescript
interface TemporalOrganization {
  // Hierarchical time structure
  timeHierarchy: {
    sessions: Session[];         // Individual gameplay sessions
    days: Day[];                // Game days
    weeks: Week[];              // Week-long periods
    months: Month[];            // Month-long periods
    eras: Era[];                // Major life phases
  };
  
  // Temporal clustering
  temporalClusters: {
    recentEvents: EpisodicMemory[];      // Last 24 hours
    significantPeriods: EpisodicMemory[]; // Important time periods
    periodicEvents: EpisodicMemory[];    // Recurring events
  };
  
  // Temporal landmarks
  temporalLandmarks: {
    firstEvents: EpisodicMemory[];       // First occurrence of event types
    lastEvents: EpisodicMemory[];        // Most recent occurrences
    uniqueEvents: EpisodicMemory[];      // One-time significant events
  };
}
```

### Thematic Organization

```typescript
interface ThematicOrganization {
  // Life themes
  lifeThemes: {
    survival: EpisodicMemory[];
    exploration: EpisodicMemory[];
    social: EpisodicMemory[];
    creativity: EpisodicMemory[];
    learning: EpisodicMemory[];
  };
  
  // Goal-related organization
  goalRelated: {
    goalAchievements: EpisodicMemory[];
    goalSetbacks: EpisodicMemory[];
    goalDiscoveries: EpisodicMemory[];
  };
  
  // Emotional organization
  emotionalClusters: {
    positiveMemories: EpisodicMemory[];
    negativeMemories: EpisodicMemory[];
    neutralMemories: EpisodicMemory[];
    mixedMemories: EpisodicMemory[];
  };
}
```

## Integration with Other Systems

### Identity and Self-Model Integration

```typescript
interface IdentityIntegration {
  // Identity development tracking
  identityDevelopment: {
    formativeExperiences: EpisodicMemory[];
    valueFormation: ValueFormationEvent[];
    personalityChanges: PersonalityChangeEvent[];
  };
  
  // Self-narrative construction
  selfNarrative: {
    coreStories: CoreStory[];
    characterDevelopment: CharacterDevelopmentArc[];
    identityConsistency: ConsistencyMetrics;
  };
  
  // Values and beliefs evolution
  valuesEvolution: {
    beliefChanges: BeliefChangeEvent[];
    valueReinforcement: ValueReinforcementEvent[];
    moralDilemmas: MoralDilemmaEvent[];
  };
}
```

### Planning System Integration

```typescript
interface PlanningIntegration {
  // Historical experience for planning
  experiencialPlanning: {
    similarSituations: (context: PlanningContext) => EpisodicMemory[];
    outcomeHistory: (actionType: ActionType) => OutcomeHistory;
    successPatterns: (goalType: GoalType) => SuccessPattern[];
  };
  
  // Learning from failures
  failureLearning: {
    failureAnalysis: (failure: Failure) => FailureAnalysis;
    preventionStrategies: (failureType: FailureType) => PreventionStrategy[];
    adaptationLearning: (adaptation: Adaptation) => AdaptationInsight[];
  };
}
```

## Performance Optimization

### Memory Indexing

```typescript
interface MemoryIndexing {
  // Multi-dimensional indexing
  indices: {
    temporalIndex: TemporalIndex;
    spatialIndex: SpatialIndex;
    socialIndex: SocialIndex;
    emotionalIndex: EmotionalIndex;
    causalIndex: CausalIndex;
    semanticIndex: SemanticIndex;
  };
  
  // Retrieval optimization
  retrievalOptimization: {
    frequentlyAccessedCache: MemoryCache;
    recentMemoriesCache: MemoryCache;
    significantMemoriesCache: MemoryCache;
  };
  
  // Compression strategies
  compressionStrategies: {
    oldMemoryCompression: CompressionStrategy;
    redundantMemoryMerging: MergingStrategy;
    summaryGeneration: SummaryStrategy;
  };
}
```

### Storage Efficiency

```typescript
interface StorageEfficiency {
  // Hierarchical storage
  storageHierarchy: {
    activeMemories: MemoryStorage;     // Recent, frequently accessed
    archiveMemories: MemoryStorage;    // Older, less frequently accessed
    compressedMemories: MemoryStorage; // Highly compressed summaries
  };
  
  // Memory lifecycle management
  lifecycleManagement: {
    memoryAging: AgingStrategy;
    consolidationScheduling: ConsolidationScheduler;
    garbageCollection: GarbageCollectionStrategy;
  };
}
```

## Configuration

```yaml
# config/episodic_memory.yaml
event_detection:
  significance_threshold: 0.3
  temporal_window: 300        # seconds
  emotional_weight: 2.0
  goal_relevance_weight: 3.0
  novelty_weight: 1.5
  
encoding:
  detail_level: 'high'
  sensory_encoding: true
  causal_linking: true
  emotional_encoding: true
  
consolidation:
  consolidation_interval: 3600  # seconds
  pattern_detection: true
  semantic_integration: true
  memory_strengthening: true
  
retrieval:
  max_retrieved_memories: 20
  relevance_threshold: 0.2
  reconstruction_detail: 'medium'
  context_weighting: true
  
storage:
  max_active_memories: 10000
  compression_threshold: 90   # days
  archival_threshold: 365     # days
  deletion_threshold: never   # Never delete memories
  
performance:
  indexing_enabled: true
  caching_enabled: true
  compression_enabled: true
  background_consolidation: true
```

## Implementation Files

```
memory/episodic/
├── event-detector.ts        # Event detection and significance assessment
├── episodic-encoder.ts      # Event encoding into episodic memories
├── memory-consolidation.ts  # Memory consolidation and integration
├── episodic-retrieval.ts    # Memory retrieval and reconstruction
├── narrative-generator.ts   # Narrative generation from memories
├── memory-indexing.ts       # Multi-dimensional memory indexing
├── storage-manager.ts       # Memory storage and lifecycle management
├── types.ts                # TypeScript interfaces
├── config.ts               # Configuration management
└── __tests__/
    ├── event-detector.test.ts
    ├── episodic-encoder.test.ts
    ├── memory-consolidation.test.ts
    ├── episodic-retrieval.test.ts
    └── integration.test.ts
```

## Success Criteria

### Functional Requirements

- [ ] Detect and encode 95%+ of significant events into episodic memory
- [ ] Retrieve relevant memories with >80% relevance accuracy
- [ ] Generate coherent narratives from memory collections
- [ ] Maintain temporal and causal consistency across memories

### Performance Requirements

- [ ] Event detection latency <50ms per experience
- [ ] Memory retrieval latency <100ms for typical queries
- [ ] Storage efficiency >80% through compression and organization
- [ ] Support 100,000+ episodic memories with linear scaling

---

The Episodic Memory module provides **autobiographical intelligence** that enables the conscious bot to remember its experiences, learn from its past, and maintain the temporal continuity essential for consciousness-like behavior.

# Working Memory: Cognitive Workspace

**Module:** `memory/working/`
**Purpose:** Short-term cognitive workspace for active information processing
**Author:** @darianrosebrook

> **Implementation Status: PARTIALLY IMPLEMENTED**
> Last verified: 2026-02-08
> Code location: `packages/memory/src/working/`
> Implemented: `central-executive.ts`, `attention-manager.ts`, `goal-tracker.ts`
> Naming note: Code uses `goal-tracker.ts` rather than `GoalStackManager` referenced below.

## Overview

The Working Memory module implements a **cognitive workspace** that maintains currently active information, goals, and processing state. This system enables the conscious bot to maintain focused attention, integrate information from multiple sources, and provide the cognitive "scratchpad" necessary for complex reasoning and decision-making.

## Conceptual Framework

### Cognitive Workspace Theory

Based on **Global Workspace Theory** and working memory research, this system provides:

- **Attention Focus**: Currently attended information and goals
- **Information Integration**: Combining data from perception, memory, and reasoning
- **Cognitive Control**: Managing cognitive resources and processing priorities  
- **Temporary Storage**: Short-term retention of task-relevant information
- **Processing Coordination**: Orchestrating multi-step cognitive operations

### Working Memory Architecture

```
[Sensory Input] → [Attention Filter] → [Central Executive] → [Goal Management]
       ↓               ↓                    ↓                    ↓
[Perception]    [Focus Control]     [Information           [Active Goals]
                                   Integration]                  ↓
       ↓               ↓                    ↓              [Action Planning]
[Episodic] ←→ [Phonological] ←→ [Visuospatial] ←→ [Semantic Integration]
[Buffer]        [Loop]           [Sketchpad]        [Knowledge]
```

## Core Components

### 1. Central Executive (`central-executive.ts`)

**Purpose:** Cognitive control and resource allocation for working memory

```typescript
/**
 * Central executive system that controls attention, manages cognitive resources,
 * and coordinates information flow within the working memory workspace.
 * 
 * @author @darianrosebrook
 */
class CentralExecutive {
  /**
   * Allocate attention resources to cognitive tasks
   * 
   * @param attentionRequests - Requests for attention allocation
   * @param resourceBudget - Available cognitive resources
   * @returns Attention allocation with resource assignments
   */
  allocateAttentionResources(
    attentionRequests: AttentionRequest[],
    resourceBudget: CognitiveResourceBudget
  ): AttentionAllocation;

  /**
   * Control information flow between working memory components
   * 
   * @param informationSources - Sources of information requiring integration
   * @param integrationObjectives - Objectives for information integration
   * @returns Information flow control plan
   */
  controlInformationFlow(
    informationSources: InformationSource[],
    integrationObjectives: IntegrationObjective[]
  ): InformationFlowControl;

  /**
   * Manage cognitive load and prevent overload
   * 
   * @param currentLoad - Current cognitive load assessment
   * @param newTasks - New cognitive tasks requesting resources
   * @returns Load management strategy with task prioritization
   */
  manageCognitiveLoad(
    currentLoad: CognitiveLoadAssessment,
    newTasks: CognitiveTask[]
  ): CognitiveLoadManagement;

  /**
   * Coordinate multi-step cognitive operations
   * 
   * @param cognitiveOperation - Complex operation requiring coordination
   * @param coordinationStrategy - Strategy for operation coordination
   * @returns Cognitive operation coordination plan
   */
  coordinateCognitiveOperation(
    cognitiveOperation: CognitiveOperation,
    coordinationStrategy: CoordinationStrategy
  ): CognitiveOperationCoordination;

  /**
   * Update working memory contents based on changing priorities
   * 
   * @param priorityChanges - Changes in task or goal priorities
   * @param retentionCriteria - Criteria for information retention
   * @returns Working memory update with content reorganization
   */
  updateWorkingMemoryContents(
    priorityChanges: PriorityChange[],
    retentionCriteria: RetentionCriteria
  ): WorkingMemoryUpdate;
}
```

### 2. Attention Manager (`attention-manager.ts`)

**Purpose:** Focus attention on relevant information and manage attentional resources

```typescript
/**
 * Attention management system that controls focus, filters information,
 * and manages the spotlight of consciousness within the cognitive workspace.
 * 
 * @author @darianrosebrook
 */
class AttentionManager {
  /**
   * Focus attention on specific information or goals
   * 
   * @param focusTargets - Items requiring focused attention
   * @param focusContext - Context affecting attention focus
   * @returns Attention focus allocation with intensity levels
   */
  focusAttention(
    focusTargets: AttentionTarget[],
    focusContext: AttentionContext
  ): AttentionFocus;

  /**
   * Filter incoming information based on relevance and priority
   * 
   * @param incomingInformation - New information requiring filtering
   * @param filterCriteria - Criteria for information filtering
   * @returns Filtered information with relevance scores
   */
  filterInformation(
    incomingInformation: IncomingInformation[],
    filterCriteria: FilterCriteria
  ): FilteredInformation[];

  /**
   * Manage attention switching and focus transitions
   * 
   * @param currentFocus - Current attention focus
   * @param switchTriggers - Triggers requiring attention switching
   * @returns Attention switching plan with transition management
   */
  manageAttentionSwitching(
    currentFocus: AttentionFocus,
    switchTriggers: AttentionSwitchTrigger[]
  ): AttentionSwitching;

  /**
   * Monitor attention sustainability and prevent attention fatigue
   * 
   * @param attentionHistory - Historical attention allocation patterns
   * @param fatigueIndicators - Indicators of cognitive fatigue
   * @returns Attention sustainability assessment with recommendations
   */
  monitorAttentionSustainability(
    attentionHistory: AttentionHistory,
    fatigueIndicators: FatigueIndicator[]
  ): AttentionSustainabilityAssessment;

  /**
   * Coordinate attention with other cognitive processes
   * 
   * @param cognitiveProcesses - Other processes requiring attention coordination
   * @param coordinationRequirements - Requirements for attention coordination
   * @returns Attention coordination plan
   */
  coordinateAttentionWithProcesses(
    cognitiveProcesses: CognitiveProcess[],
    coordinationRequirements: CoordinationRequirement[]
  ): AttentionCoordination;
}
```

### 3. Information Integrator (`information-integrator.ts`)

**Purpose:** Combine information from multiple sources into coherent representations

```typescript
/**
 * Information integration system that combines data from perception,
 * memory, and reasoning into coherent working memory representations.
 * 
 * @author @darianrosebrook
 */
class InformationIntegrator {
  /**
   * Integrate multi-modal information into unified representation
   * 
   * @param informationSources - Multiple sources of information
   * @param integrationSchema - Schema for information integration
   * @returns Integrated information representation
   */
  integrateMultiModalInformation(
    informationSources: MultiModalInformation,
    integrationSchema: IntegrationSchema
  ): IntegratedInformation;

  /**
   * Resolve conflicts between different information sources
   * 
   * @param conflictingInformation - Information sources with conflicts
   * @param resolutionStrategy - Strategy for conflict resolution
   * @returns Conflict resolution result with integrated information
   */
  resolveInformationConflicts(
    conflictingInformation: ConflictingInformation[],
    resolutionStrategy: ConflictResolutionStrategy
  ): ConflictResolutionResult;

  /**
   * Update integrated information when new data arrives
   * 
   * @param currentIntegration - Current integrated information state
   * @param newInformation - New information requiring integration
   * @returns Updated integrated information
   */
  updateIntegratedInformation(
    currentIntegration: IntegratedInformation,
    newInformation: NewInformation[]
  ): IntegrationUpdateResult;

  /**
   * Maintain coherence across integrated information
   * 
   * @param integratedInformation - Current integrated information
   * @param coherenceCriteria - Criteria for information coherence
   * @returns Coherence assessment with improvement recommendations
   */
  maintainInformationCoherence(
    integratedInformation: IntegratedInformation,
    coherenceCriteria: CoherenceCriteria
  ): CoherenceMaintenanceResult;

  /**
   * Generate summary representations of complex information
   * 
   * @param complexInformation - Complex information requiring summarization
   * @param summarizationGoals - Goals for information summarization
   * @returns Summary representations with key insights
   */
  generateInformationSummaries(
    complexInformation: ComplexInformation,
    summarizationGoals: SummarizationGoal[]
  ): InformationSummary[];
}
```

### 4. Goal Stack Manager (`goal-stack-manager.ts`)

**Purpose:** Manage active goals and their hierarchical relationships

```typescript
/**
 * Goal stack management system that maintains active goals,
 * their priorities, and hierarchical relationships within working memory.
 * 
 * @author @darianrosebrook
 */
class GoalStackManager {
  /**
   * Push new goal onto the active goal stack
   * 
   * @param newGoal - Goal to add to active consideration
   * @param goalContext - Context for goal activation
   * @returns Goal activation result with stack update
   */
  pushGoal(
    newGoal: Goal,
    goalContext: GoalActivationContext
  ): GoalActivationResult;

  /**
   * Pop completed or abandoned goal from stack
   * 
   * @param goalId - ID of goal to remove from stack
   * @param completionReason - Reason for goal completion/removal
   * @returns Goal completion result with stack reorganization
   */
  popGoal(
    goalId: string,
    completionReason: GoalCompletionReason
  ): GoalCompletionResult;

  /**
   * Update goal priorities based on changing circumstances
   * 
   * @param priorityUpdates - Updates to goal priorities
   * @param priorityContext - Context affecting priority changes
   * @returns Goal priority update with stack reordering
   */
  updateGoalPriorities(
    priorityUpdates: GoalPriorityUpdate[],
    priorityContext: PriorityContext
  ): GoalPriorityUpdateResult;

  /**
   * Manage goal conflicts and resource competition
   * 
   * @param conflictingGoals - Goals competing for resources
   * @param resolutionStrategy - Strategy for goal conflict resolution
   * @returns Goal conflict resolution with resource allocation
   */
  resolveGoalConflicts(
    conflictingGoals: ConflictingGoal[],
    resolutionStrategy: GoalResolutionStrategy
  ): GoalConflictResolution;

  /**
   * Track goal progress and completion status
   * 
   * @param activeGoals - Currently active goals to track
   * @param progressIndicators - Indicators of goal progress
   * @returns Goal progress tracking with completion predictions
   */
  trackGoalProgress(
    activeGoals: ActiveGoal[],
    progressIndicators: ProgressIndicator[]
  ): GoalProgressTracking;

  /**
   * Coordinate goal execution with available cognitive resources
   * 
   * @param goalStack - Current goal stack
   * @param availableResources - Available cognitive and physical resources
   * @returns Goal execution coordination plan
   */
  coordinateGoalExecution(
    goalStack: GoalStack,
    availableResources: AvailableResources
  ): GoalExecutionCoordination;
}
```

### 5. Context Maintainer (`context-maintainer.ts`)

**Purpose:** Maintain relevant context and situational awareness

```typescript
/**
 * Context maintenance system that preserves relevant situational context
 * and supports context-dependent cognitive processing.
 * 
 * @author @darianrosebrook
 */
class ContextMaintainer {
  /**
   * Update current situational context
   * 
   * @param contextualUpdates - New contextual information
   * @param contextualPriorities - Priorities for context maintenance
   * @returns Context update result with relevance assessment
   */
  updateSituationalContext(
    contextualUpdates: ContextualUpdate[],
    contextualPriorities: ContextualPriority[]
  ): ContextUpdateResult;

  /**
   * Maintain context continuity across cognitive operations
   * 
   * @param previousContext - Previous context state
   * @param contextualChanges - Changes affecting context
   * @returns Context continuity maintenance result
   */
  maintainContextContinuity(
    previousContext: SituationalContext,
    contextualChanges: ContextualChange[]
  ): ContextContinuityResult;

  /**
   * Identify relevant context for current cognitive tasks
   * 
   * @param currentTasks - Tasks requiring contextual support
   * @param availableContext - Available contextual information
   * @returns Relevant context identification with applicability scores
   */
  identifyRelevantContext(
    currentTasks: CognitiveTask[],
    availableContext: AvailableContext
  ): RelevantContextIdentification;

  /**
   * Manage context switching when focus changes
   * 
   * @param focusChange - Change in cognitive focus
   * @param contextSwitchingStrategy - Strategy for context switching
   * @returns Context switching result with preservation plan
   */
  manageContextSwitching(
    focusChange: FocusChange,
    contextSwitchingStrategy: ContextSwitchingStrategy
  ): ContextSwitchingResult;

  /**
   * Archive inactive context for potential future retrieval
   * 
   * @param inactiveContext - Context no longer actively needed
   * @param archivalCriteria - Criteria for context archival
   * @returns Context archival result with retrieval metadata
   */
  archiveInactiveContext(
    inactiveContext: InactiveContext[],
    archivalCriteria: ArchivalCriteria
  ): ContextArchivalResult;
}
```

## Working Memory Components

### Active Information Buffers

```typescript
interface WorkingMemoryBuffers {
  // Visuospatial sketchpad
  visuospatialBuffer: {
    visualImagery: VisualImage[];
    spatialRelationships: SpatialRelationship[];
    movementPatterns: MovementPattern[];
    visualWorkspace: VisualWorkspace;
    capacity: 4; // Miller's magic number
  };
  
  // Phonological loop (for internal speech/dialogue)
  phonologicalBuffer: {
    internalSpeech: InternalSpeechElement[];
    verbalRehearsal: RehearsalLoop;
    linguisticProcessing: LinguisticProcess[];
    auditoryImagery: AuditoryImage[];
    capacity: 7; // ±2 chunks
  };
  
  // Episodic buffer (multimodal integration)
  episodicBuffer: {
    integratedEpisodes: IntegratedEpisode[];
    multimodalBindings: MultimodalBinding[];
    temporalSequences: TemporalSequence[];
    consciousExperience: ConsciousExperience[];
    capacity: 3; // Limited conscious awareness
  };
  
  // Semantic integration workspace
  semanticBuffer: {
    activeKnowledge: ActiveKnowledge[];
    conceptualIntegration: ConceptualIntegration[];
    meaningRepresentation: MeaningRepresentation[];
    inferenceResults: InferenceResult[];
    capacity: 5; // Conceptual chunks
  };
}
```

### Goal and Task Management

```typescript
interface GoalManagementStructure {
  // Hierarchical goal stack
  goalHierarchy: {
    superordinate: SuperordinateGoal;     // High-level life goals
    intermediate: IntermediateGoal[];     // Medium-term objectives
    subordinate: SubordinateGoal[];       // Immediate tasks
    microGoals: MicroGoal[];             // Moment-to-moment intentions
  };
  
  // Goal state tracking
  goalStates: {
    active: ActiveGoal[];                 // Currently being pursued
    suspended: SuspendedGoal[];           // Temporarily inactive
    completed: CompletedGoal[];           // Recently finished
    abandoned: AbandonedGoal[];           // Given up on
  };
  
  // Resource allocation
  resourceAllocation: {
    attentionAllocation: AttentionResource[];
    cognitiveEffort: CognitiveEffortAllocation[];
    timeAllocation: TimeResourceAllocation[];
    priorityWeights: GoalPriorityWeight[];
  };
  
  // Progress monitoring
  progressMonitoring: {
    goalProgress: GoalProgressMetric[];
    milestoneTracking: MilestoneTracking[];
    obstacleDetection: ObstacleDetection[];
    adaptationNeeds: AdaptationNeed[];
  };
}
```

### Context Representation

```typescript
interface ContextualInformation {
  // Environmental context
  environmental: {
    currentLocation: Location;
    timeOfDay: GameTime;
    weather: WeatherCondition;
    nearbyEntities: NearbyEntity[];
    environmental_affordances: Affordance[];
  };
  
  // Social context
  social: {
    presentPlayers: Player[];
    recentInteractions: RecentInteraction[];
    socialExpectations: SocialExpectation[];
    communicationContext: CommunicationContext;
  };
  
  // Task context
  task: {
    currentTask: Task;
    taskHistory: TaskHistory[];
    availableTools: Tool[];
    resourceConstraints: ResourceConstraint[];
    performanceExpectations: PerformanceExpectation[];
  };
  
  // Temporal context
  temporal: {
    recentEvents: RecentEvent[];
    anticipatedEvents: AnticipatedEvent[];
    temporalDeadlines: Deadline[];
    timeConstraints: TimeConstraint[];
  };
  
  // Motivational context
  motivational: {
    currentMoods: MoodState[];
    energyLevel: EnergyLevel;
    confidenceLevel: ConfidenceLevel;
    motivationSources: MotivationSource[];
  };
}
```

## Cognitive Control Mechanisms

### Attention Control

```typescript
interface AttentionControlMechanisms {
  // Focused attention
  focusedAttention: {
    attentionSpotlight: AttentionSpotlight;
    focusIntensity: number;
    focusDuration: number;
    focusStability: number;
  };
  
  // Divided attention
  dividedAttention: {
    parallelProcesses: AttentionProcess[];
    resourceSharing: ResourceSharingStrategy;
    performanceDegradation: PerformanceDegradationModel;
    attentionSwitching: AttentionSwitchingMechanism;
  };
  
  // Selective attention
  selectiveAttention: {
    relevanceFiltering: RelevanceFilter;
    distractorInhibition: DistractorInhibition;
    signalDetection: SignalDetectionMechanism;
    attentionalBias: AttentionalBias[];
  };
  
  // Sustained attention
  sustainedAttention: {
    vigilanceDecrement: VigilanceDecrementModel;
    attentionMaintenance: AttentionMaintenanceMechanism;
    fatigueMonitoring: FatigueMonitoringSystem;
    restorationStrategies: AttentionRestorationStrategy[];
  };
}
```

### Executive Control

```typescript
interface ExecutiveControlFunctions {
  // Working memory updating
  workingMemoryControl: {
    informationGating: InformationGatingMechanism;
    contentMaintenance: ContentMaintenanceMechanism;
    interferenceResolution: InterferenceResolutionMechanism;
    capacityManagement: CapacityManagementStrategy;
  };
  
  // Cognitive flexibility
  cognitiveFlexibility: {
    taskSwitching: TaskSwitchingMechanism;
    attentionSwitching: AttentionSwitchingMechanism;
    setShifting: SetShiftingMechanism;
    adaptabilityAssessment: AdaptabilityAssessment;
  };
  
  // Inhibitory control
  inhibitoryControl: {
    responseInhibition: ResponseInhibitionMechanism;
    interferenceInhibition: InterferenceInhibitionMechanism;
    distractorSuppression: DistractorSuppressionMechanism;
    impulseControl: ImpulseControlMechanism;
  };
  
  // Performance monitoring
  performanceMonitoring: {
    errorDetection: ErrorDetectionMechanism;
    conflictMonitoring: ConflictMonitoringMechanism;
    performanceAdjustment: PerformanceAdjustmentMechanism;
    metacognitiveAwareness: MetacognitiveAwarenessMechanism;
  };
}
```

## Integration with Other Systems

### Perception Integration

```typescript
interface PerceptionIntegration {
  // Perceptual input processing
  perceptualInput: {
    sensoryBuffering: (input: SensoryInput) => BufferedSensoryData;
    attentionalFiltering: (data: BufferedSensoryData) => FilteredPerception;
    perceptualBinding: (perception: FilteredPerception) => BoundPerception;
    consciousAccess: (perception: BoundPerception) => ConsciousPerception;
  };
  
  // Perceptual working memory
  perceptualWorkingMemory: {
    visualWorkspace: VisualWorkspace;
    auditoryWorkspace: AuditoryWorkspace;
    tactileWorkspace: TactileWorkspace;
    multimodalIntegration: MultimodalIntegrationWorkspace;
  };
}
```

### Memory System Integration

```typescript
interface MemorySystemIntegration {
  // Long-term memory access
  longTermMemoryAccess: {
    episodicRetrieval: (cues: RetrievalCue[]) => EpisodicMemory[];
    semanticRetrieval: (query: SemanticQuery) => SemanticKnowledge[];
    proceduralActivation: (context: ProceduralContext) => ProceduralKnowledge[];
  };
  
  // Memory encoding from working memory
  memoryEncoding: {
    episodicEncoding: (experience: WorkingMemoryExperience) => EpisodicMemory;
    semanticExtraction: (patterns: WorkingMemoryPattern[]) => SemanticKnowledge;
    proceduralLearning: (skills: WorkingMemorySkill[]) => ProceduralKnowledge;
  };
}
```

### Planning Integration

```typescript
interface PlanningIntegration {
  // Goal-plan coordination
  goalPlanCoordination: {
    goalActivation: (goals: Goal[]) => ActivatedGoal[];
    planGeneration: (goals: ActivatedGoal[]) => GeneratedPlan[];
    planMonitoring: (plans: GeneratedPlan[]) => PlanMonitoringResult[];
    planRevision: (feedback: ExecutionFeedback[]) => RevisedPlan[];
  };
  
  // Working memory support for planning
  planningSupport: {
    planningWorkspace: PlanningWorkspace;
    alternativeGeneration: AlternativeGenerationMechanism;
    consequenceEvaluation: ConsequenceEvaluationMechanism;
    decisionIntegration: DecisionIntegrationMechanism;
  };
}
```

## Performance Optimization

### Capacity Management

```typescript
interface CapacityManagement {
  // Dynamic capacity allocation
  dynamicAllocation: {
    taskDemandAssessment: (tasks: CognitiveTask[]) => DemandAssessment;
    resourceAllocation: (demands: DemandAssessment[]) => ResourceAllocation;
    performanceMonitoring: (allocation: ResourceAllocation) => PerformanceMonitoring;
    adaptiveAdjustment: (monitoring: PerformanceMonitoring) => AllocationAdjustment;
  };
  
  // Overload prevention
  overloadPrevention: {
    loadMonitoring: LoadMonitoringSystem;
    capacityPrediction: CapacityPredictionModel;
    priorityBasedShedding: PriorityBasedSheddingMechanism;
    gracefulDegradation: GracefulDegradationStrategy;
  };
  
  // Efficiency optimization
  efficiencyOptimization: {
    chunkingStrategies: ChunkingStrategy[];
    rehearsalOptimization: RehearsalOptimizationStrategy;
    encodingOptimization: EncodingOptimizationStrategy;
    retrievalOptimization: RetrievalOptimizationStrategy;
  };
}
```

### Real-Time Constraints

```typescript
interface RealTimeConstraints {
  // Timing requirements
  timingRequirements: {
    attentionSwitching: 100;      // ms maximum
    informationIntegration: 200;  // ms maximum
    goalActivation: 50;           // ms maximum
    contextUpdate: 150;           // ms maximum
  };
  
  // Capacity limits
  capacityLimits: {
    simultaneousGoals: 3;         // Maximum active goals
    activeInformation: 7;         // Miller's number ±2
    contextualElements: 5;        // Maximum context elements
    attentionTargets: 4;          // Maximum attention targets
  };
  
  // Performance budgets
  performanceBudgets: {
    totalCognitiveLoad: 0.8;      // 80% maximum utilization
    attentionAllocation: 0.9;     // 90% maximum attention use
    memoryUtilization: 0.7;       // 70% maximum memory use
    processingOverhead: 0.2;      // 20% overhead allowance
  };
}
```

## Configuration

```yaml
# config/working_memory.yaml
capacity_limits:
  max_active_goals: 3
  max_information_chunks: 7
  max_context_elements: 5
  max_attention_targets: 4
  
attention_management:
  focus_duration_ms: 5000      # Maximum sustained focus
  attention_switching_cost: 100 # ms penalty for switching
  distractor_threshold: 0.3    # Relevance threshold
  fatigue_monitoring: true
  
information_integration:
  integration_timeout: 200     # ms maximum
  conflict_resolution: 'evidence_weighted'
  coherence_checking: true
  summary_generation: true
  
goal_management:
  goal_activation_threshold: 0.6
  priority_update_frequency: 1000 # ms
  progress_monitoring: true
  conflict_resolution: 'utility_based'
  
context_maintenance:
  context_update_frequency: 500 # ms
  relevance_threshold: 0.4
  continuity_checking: true
  archival_enabled: true
  
performance:
  cognitive_load_monitoring: true
  overload_prevention: true
  adaptive_allocation: true
  graceful_degradation: true
  
real_time:
  max_processing_latency: 50   # ms
  attention_budget: 80         # % of available attention
  memory_budget: 70            # % of available memory
  processing_overhead: 20      # % overhead allowance
```

## Implementation Files

```
memory/working/
├── central-executive.ts       # Cognitive control and resource allocation
├── attention-manager.ts       # Attention focus and filtering
├── information-integrator.ts  # Multi-modal information integration
├── goal-stack-manager.ts      # Active goal management
├── context-maintainer.ts      # Situational context maintenance
├── buffer-manager.ts          # Working memory buffer management
├── capacity-manager.ts        # Cognitive capacity optimization
├── performance-monitor.ts     # Working memory performance tracking
├── types.ts                   # TypeScript interfaces
├── config.ts                  # Configuration management
└── __tests__/
    ├── central-executive.test.ts
    ├── attention-manager.test.ts
    ├── information-integrator.test.ts
    ├── goal-stack-manager.test.ts
    └── integration.test.ts
```

## Success Criteria

### Functional Requirements

- [ ] Maintain 3-7 active information chunks without interference
- [ ] Switch attention focus within 100ms of priority changes
- [ ] Integrate multi-modal information with 95% coherence
- [ ] Coordinate multiple goals without resource conflicts

### Performance Requirements

- [ ] Cognitive processing latency <50ms p95 for routine operations
- [ ] Attention allocation efficiency >80% of optimal
- [ ] Memory utilization <70% to prevent overload
- [ ] Goal coordination success rate >90% for non-conflicting goals

---

The Working Memory module provides **cognitive workspace intelligence** that enables the conscious bot to maintain focused attention, integrate complex information, and coordinate multiple cognitive processes for coherent, goal-directed behavior.

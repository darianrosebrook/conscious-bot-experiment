/**
 * Perception Integration - Unified visual perception coordination
 *
 * Coordinates ray casting, object recognition, confidence tracking, and visual
 * attention to provide a comprehensive human-like perception system.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { VisualFieldManager } from './visual-field-manager';
import { ObjectRecognition } from './object-recognition';
import { ConfidenceTracker } from './confidence-tracker';
import { VisibleSensing } from '../sensing/visible-sensing';

import {
  IPerceptionIntegration,
  AgentState,
  PerceptionConfig,
  PerceptionUpdate,
  SpatialArea,
  PerceptualAwareness,
  RecognizedObject,
  VisualStimulus,
  validatePerceptionConfig,
  validatePerceptionUpdate,
  validateAgentState,
} from './types';
import { Vec3, Observation, SweepResult } from '../types';

export interface PerceptionIntegrationEvents {
  'perception-updated': [PerceptionUpdate];
  'object-discovered': [RecognizedObject];
  'object-lost': [string]; // object ID
  'attention-shift': [{ from: Vec3; to: Vec3 }];
  'exploration-needed': [SpatialArea];
  'performance-warning': [{ metric: string; value: number; threshold: number }];
}

/**
 * Comprehensive perception system integrating all visual processing components
 */
export class PerceptionIntegration
  extends EventEmitter<PerceptionIntegrationEvents>
  implements IPerceptionIntegration
{
  private visualFieldManager: VisualFieldManager;
  private objectRecognition: ObjectRecognition;
  private confidenceTracker: ConfidenceTracker;
  private visibleSensing: VisibleSensing;

  private trackedObjects = new Map<string, RecognizedObject>();
  private lastPerceptionUpdate?: PerceptionUpdate;
  private performanceMetrics = {
    totalUpdates: 0,
    averageProcessingTime: 0,
    objectsDiscovered: 0,
    objectsLost: 0,
  };

  private readonly updateInterval: NodeJS.Timeout;

  constructor(
    private config: PerceptionConfig,
    private getCurrentAgentState: () => AgentState,
    visibleSensing?: VisibleSensing
  ) {
    super();

    validatePerceptionConfig(config);

    // Initialize components
    this.visualFieldManager = new VisualFieldManager(config.fieldOfView);
    this.objectRecognition = new ObjectRecognition();
    this.confidenceTracker = new ConfidenceTracker(config.confidenceDecay);

    // Use provided sensing system or create mock for testing
    this.visibleSensing = visibleSensing || this.createMockSensing();

    this.setupEventHandlers();

    // Start periodic updates
    this.updateInterval = setInterval(() => {
      this.performAutomaticUpdate();
    }, 100); // 10 FPS for smooth perception
  }

  /**
   * Perform complete perception update for current frame
   */
  async updatePerception(
    agentState: AgentState,
    perceptionConfig: PerceptionConfig
  ): Promise<PerceptionUpdate> {
    const startTime = Date.now();

    validateAgentState(agentState);
    validatePerceptionConfig(perceptionConfig);

    this.config = perceptionConfig;

    try {
      // 1. Update visual field based on agent state
      const visualField = this.visualFieldManager.updateVisualField(
        agentState.headDirection,
        perceptionConfig.fieldOfView
      );

      // 2. Perform visual sensing sweep
      const sweepResult = await this.performVisualSweep(agentState);

      // 3. Update confidence for existing objects
      const timeElapsed = this.lastPerceptionUpdate
        ? startTime - this.lastPerceptionUpdate.timestamp
        : 0;

      const confidenceUpdates = this.confidenceTracker.updateConfidenceLevels(
        this.trackedObjects,
        timeElapsed,
        perceptionConfig.confidenceDecay
      );

      // 4. Process new observations with object recognition
      const viewingConditions = this.calculateViewingConditions(
        sweepResult.observations,
        agentState
      );
      const newRecognitions = this.objectRecognition.recognizeObjects(
        sweepResult.observations,
        viewingConditions,
        perceptionConfig
      );

      // 5. Update object tracking with new observations
      const previousTracking = new Map(this.trackedObjects);
      this.trackedObjects = this.objectRecognition.trackObjectPersistence(
        newRecognitions,
        this.trackedObjects
      );

      // 6. Prune stale observations
      const prunedIds = this.confidenceTracker.pruneStaleObservations(
        this.trackedObjects,
        perceptionConfig.confidenceDecay.pruningThreshold
      );

      // 7. Identify changes
      const { newObservations, updatedObservations, lostObservations } =
        this.identifyObjectChanges(
          previousTracking,
          this.trackedObjects,
          prunedIds
        );

      // 8. Process visual stimuli and attention
      const stimuli = this.generateVisualStimuli(
        newObservations,
        updatedObservations
      );
      const attentionAllocation = this.visualFieldManager.manageVisualAttention(
        stimuli,
        {
          // Default attention model
          bottomUpWeight: 0.3,
          topDownWeight: 0.7,
          inhibitionOfReturn: true,
          attentionSpan: 3000,
          maxSimultaneousTargets: 3,
        }
      );

      // 9. Calculate performance metrics
      const processingTime = Date.now() - startTime;
      const performance = {
        processingTimeMs: processingTime,
        raysCast: sweepResult.raysCast,
        objectsRecognized: newRecognitions.length,
        confidenceUpdatesApplied: confidenceUpdates.length,
        cacheHitRate: 0.8, // Placeholder
      };

      // 10. Generate recognition statistics
      const recognitionStats = this.generateRecognitionStats();

      // 11. Create perception update result
      const perceptionUpdate: PerceptionUpdate = {
        timestamp: startTime,
        agentState,
        newObservations,
        updatedObservations,
        lostObservations,
        confidenceUpdates,
        performance,
        visualField,
        recognitionStats,
      };

      this.lastPerceptionUpdate = validatePerceptionUpdate(perceptionUpdate);

      // 12. Update performance tracking
      this.updatePerformanceMetrics(
        processingTime,
        newObservations.length,
        lostObservations.length
      );

      // 13. Emit events
      this.emitPerceptionEvents(perceptionUpdate);

      // 14. Check for performance warnings
      this.checkPerformanceThresholds(perceptionUpdate);

      return this.lastPerceptionUpdate;
    } catch (error) {
      console.error('Perception update failed:', error);
      throw error;
    }
  }

  /**
   * Query current perceptual awareness of specific area
   */
  queryPerceptualAwareness(
    queryArea: SpatialArea,
    confidenceThreshold: number = 0.1
  ): PerceptualAwareness {
    const visibleObjects: RecognizedObject[] = [];
    const rememberedObjects: RecognizedObject[] = [];

    for (const obj of this.trackedObjects.values()) {
      const distance = this.calculateDistance(obj.position, queryArea.center);

      if (distance <= queryArea.radius) {
        if (obj.recognitionConfidence >= confidenceThreshold) {
          const isCurrentlyVisible = this.isObjectCurrentlyVisible(obj);

          if (isCurrentlyVisible) {
            visibleObjects.push(obj);
          } else {
            rememberedObjects.push(obj);
          }
        }
      }
    }

    // Calculate coverage information
    const coverage = this.calculateAreaCoverage(
      queryArea,
      visibleObjects,
      rememberedObjects
    );

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(
      visibleObjects,
      rememberedObjects
    );

    // Generate exploration recommendations
    const explorationPriority = this.calculateExplorationPriority(
      queryArea,
      coverage
    );
    const suggestedViewpoints = this.generateViewpointSuggestions(
      queryArea,
      coverage
    );

    return {
      queryArea,
      timestamp: Date.now(),
      visibleObjects,
      rememberedObjects,
      coverage,
      overallConfidence,
      stalenessFactors: this.calculateStalenessFactors(queryArea),
      explorationPriority,
      suggestedViewpoints,
    };
  }

  /**
   * Get all tracked objects with optional filtering
   */
  getTrackedObjects(
    filter?: (obj: RecognizedObject) => boolean
  ): RecognizedObject[] {
    const objects = Array.from(this.trackedObjects.values());
    return filter ? objects.filter(filter) : objects;
  }

  /**
   * Identify perception gaps requiring active exploration
   */
  identifyPerceptionGaps(
    currentKnowledge: Map<string, RecognizedObject>,
    explorationGoals: any[]
  ): SpatialArea[] {
    const gaps: SpatialArea[] = [];

    // Find areas with low observation density
    const agentState = this.getCurrentAgentState();
    const knownPositions = Array.from(currentKnowledge.values()).map(
      (obj) => obj.position
    );

    // Use spatial clustering to identify gaps
    const clusters = this.spatialCluster(knownPositions, 20); // 20-block radius clusters

    for (
      let x = agentState.position.x - 50;
      x <= agentState.position.x + 50;
      x += 25
    ) {
      for (
        let z = agentState.position.z - 50;
        z <= agentState.position.z + 50;
        z += 25
      ) {
        const testPoint = { x, y: agentState.position.y, z };
        const hasNearbyObservations = clusters.some(
          (cluster) =>
            this.calculateDistance(testPoint, cluster.center) < cluster.radius
        );

        if (!hasNearbyObservations) {
          gaps.push({
            center: testPoint,
            radius: 15,
            includeVertical: true,
            minConfidence: 0.3,
          });
        }
      }
    }

    // Sort by exploration priority
    gaps.sort((a, b) => {
      const distA = this.calculateDistance(a.center, agentState.position);
      const distB = this.calculateDistance(b.center, agentState.position);
      return distA - distB; // Closer gaps have higher priority
    });

    return gaps.slice(0, 5); // Return top 5 gaps
  }

  /**
   * Get perception statistics
   */
  getPerceptionStatistics(): {
    trackedObjects: number;
    averageConfidence: number;
    performanceMetrics: typeof this.performanceMetrics;
    memoryUsage: number;
  } {
    const stats = this.confidenceTracker.getConfidenceStatistics(
      this.trackedObjects
    );

    return {
      trackedObjects: stats.totalObjects,
      averageConfidence: stats.averageConfidence,
      performanceMetrics: this.performanceMetrics,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    clearInterval(this.updateInterval);
    this.confidenceTracker.dispose();
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private async performVisualSweep(
    agentState: AgentState
  ): Promise<SweepResult> {
    // Mock sweep result for testing
    return {
      observations: [],
      raysCast: 100,
      duration: 5,
      timestamp: Date.now(),
      pose: {
        position: agentState.position,
        orientation: { yaw: 0, pitch: 0 },
      },
      performance: {
        raysPerSecond: 20000,
        avgRayDistance: 25,
        hitRate: 0.3,
      },
    };
  }

  private createMockSensing(): VisibleSensing {
    // Create a mock sensing system for testing
    return {
      performSweep: async () => ({
        observations: [],
        raysCast: 100,
        duration: 5,
        timestamp: Date.now(),
        pose: {
          position: { x: 0, y: 64, z: 0 },
          orientation: { yaw: 0, pitch: 0 },
        },
        performance: {
          raysPerSecond: 20000,
          avgRayDistance: 25,
          hitRate: 0.3,
        },
      }),
      getObservations: () => [],
      findNearestResource: () => null,
      updateConfig: () => {},
      getPerformanceMetrics: () => ({
        sweepsCompleted: 0,
        totalRaysCast: 0,
        averageSweepDuration: 0,
        p95SweepDuration: 0,
        budgetViolations: 0,
        adaptiveThrottles: 0,
        quality: {
          visibleRecall: 0,
          falseOcclusionRate: 0,
          timeToFirstObservation: 0,
        },
        index: {
          stalenessRate: 0,
          resourceToUseLatency: 0,
          evictionsPerMinute: 0,
        },
      }),
      startContinuousSensing: () => {},
      stopContinuousSensing: () => {},
    } as any;
  }

  private setupEventHandlers(): void {
    this.objectRecognition.on('object-recognized', (obj) => {
      this.emit('object-discovered', obj);
    });

    this.confidenceTracker.on('observation-pruned', ({ objectId }) => {
      this.emit('object-lost', objectId);
    });

    this.visualFieldManager.on('attention-shifted', (allocation) => {
      if (allocation.primaryFocus.attentionWeight > 0.5) {
        // Emit attention shift for significant focus changes
        this.emit('attention-shift', {
          from: { x: 0, y: 0, z: 0 }, // Previous focus placeholder
          to: allocation.primaryFocus.position,
        });
      }
    });
  }

  private calculateViewingConditions(
    observations: Observation[],
    agentState: AgentState
  ): Map<Vec3, any> {
    const conditions = new Map();

    for (const obs of observations) {
      conditions.set(obs.pos, {
        distance: obs.distance,
        lightLevel: obs.light || 15,
        occlusionPercent: 0, // Would be calculated from ray casting
        isInPeriphery: false, // Would be calculated from visual field
        visualAcuity: 1.0, // Would be calculated from visual field
      });
    }

    return conditions;
  }

  private identifyObjectChanges(
    previous: Map<string, RecognizedObject>,
    current: Map<string, RecognizedObject>,
    prunedIds: string[]
  ): {
    newObservations: RecognizedObject[];
    updatedObservations: RecognizedObject[];
    lostObservations: string[];
  } {
    const newObservations: RecognizedObject[] = [];
    const updatedObservations: RecognizedObject[] = [];
    const lostObservations: string[] = [...prunedIds];

    for (const [id, obj] of current) {
      if (!previous.has(id)) {
        newObservations.push(obj);
      } else if (obj.lastSeen !== previous.get(id)!.lastSeen) {
        updatedObservations.push(obj);
      }
    }

    for (const id of previous.keys()) {
      if (!current.has(id) && !prunedIds.includes(id)) {
        lostObservations.push(id);
      }
    }

    return { newObservations, updatedObservations, lostObservations };
  }

  private generateVisualStimuli(
    newObservations: RecognizedObject[],
    updatedObservations: RecognizedObject[]
  ): VisualStimulus[] {
    const stimuli: VisualStimulus[] = [];

    // New objects create stimuli
    for (const obj of newObservations) {
      stimuli.push({
        id: obj.id,
        position: obj.position,
        type: 'new_object',
        intensity: obj.recognitionConfidence,
        duration: 1000, // 1 second
        novelty: 1.0, // New objects are maximally novel
      });
    }

    // Moving objects create stimuli
    for (const obj of updatedObservations) {
      if (obj.positionHistory.length >= 2) {
        const velocity =
          obj.positionHistory[obj.positionHistory.length - 1].velocity;
        if (velocity && Math.abs(velocity.x) + Math.abs(velocity.z) > 0.1) {
          stimuli.push({
            id: obj.id,
            position: obj.position,
            type: 'movement',
            intensity: Math.min(
              1.0,
              (Math.abs(velocity.x) + Math.abs(velocity.z)) / 5
            ),
            duration: 500,
            novelty: 0.5,
          });
        }
      }
    }

    return stimuli;
  }

  private generateRecognitionStats(): {
    totalTrackedObjects: number;
    highConfidenceObjects: number;
    mediumConfidenceObjects: number;
    lowConfidenceObjects: number;
    averageConfidence: number;
  } {
    const stats = this.confidenceTracker.getConfidenceStatistics(
      this.trackedObjects
    );

    return {
      totalTrackedObjects: stats.totalObjects,
      highConfidenceObjects: stats.confidenceDistribution['high (0.8-1.0)'],
      mediumConfidenceObjects: stats.confidenceDistribution['medium (0.5-0.8)'],
      lowConfidenceObjects:
        stats.confidenceDistribution['low (0.1-0.5)'] +
        stats.confidenceDistribution['very-low (0.0-0.1)'],
      averageConfidence: stats.averageConfidence,
    };
  }

  private updatePerformanceMetrics(
    processingTime: number,
    newObjects: number,
    lostObjects: number
  ): void {
    this.performanceMetrics.totalUpdates++;
    this.performanceMetrics.averageProcessingTime =
      (this.performanceMetrics.averageProcessingTime *
        (this.performanceMetrics.totalUpdates - 1) +
        processingTime) /
      this.performanceMetrics.totalUpdates;
    this.performanceMetrics.objectsDiscovered += newObjects;
    this.performanceMetrics.objectsLost += lostObjects;
  }

  private emitPerceptionEvents(update: PerceptionUpdate): void {
    this.emit('perception-updated', update);

    for (const obj of update.newObservations) {
      this.emit('object-discovered', obj);
    }

    for (const objId of update.lostObservations) {
      this.emit('object-lost', objId);
    }
  }

  private checkPerformanceThresholds(update: PerceptionUpdate): void {
    if (
      update.performance.processingTimeMs >
      this.config.performance.maxProcessingTimeMs
    ) {
      this.emit('performance-warning', {
        metric: 'processing_time',
        value: update.performance.processingTimeMs,
        threshold: this.config.performance.maxProcessingTimeMs,
      });
    }

    if (update.performance.raysCast > this.config.performance.maxRaysPerFrame) {
      this.emit('performance-warning', {
        metric: 'rays_per_frame',
        value: update.performance.raysCast,
        threshold: this.config.performance.maxRaysPerFrame,
      });
    }
  }

  private performAutomaticUpdate(): void {
    // Perform lightweight updates automatically
    if (this.trackedObjects.size > 0) {
      const confidenceUpdates = this.confidenceTracker.updateConfidenceLevels(
        this.trackedObjects,
        100, // 100ms since last automatic update
        this.config.confidenceDecay
      );

      if (confidenceUpdates.some((update) => update.decayAmount > 0.1)) {
        // Significant confidence changes occurred
        const stats = this.generateRecognitionStats();
        // Could emit an event here if needed
      }
    }
  }

  private calculateDistance(pos1: Vec3, pos2: Vec3): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private isObjectCurrentlyVisible(obj: RecognizedObject): boolean {
    // Simple heuristic: object is visible if it was seen recently
    const timeSinceLastSeen = Date.now() - obj.lastSeen;
    return timeSinceLastSeen < 5000; // 5 seconds
  }

  private calculateAreaCoverage(
    queryArea: SpatialArea,
    visibleObjects: RecognizedObject[],
    rememberedObjects: RecognizedObject[]
  ): {
    totalAreaQueried: number;
    directlyObservableArea: number;
    occludedArea: number;
    coveragePercentage: number;
  } {
    const totalArea = Math.PI * queryArea.radius * queryArea.radius;
    const observedArea = Math.min(
      totalArea,
      (visibleObjects.length + rememberedObjects.length) * 16
    ); // 4x4 block area per object

    return {
      totalAreaQueried: totalArea,
      directlyObservableArea: observedArea,
      occludedArea: totalArea - observedArea,
      coveragePercentage: observedArea / totalArea,
    };
  }

  private calculateOverallConfidence(
    visibleObjects: RecognizedObject[],
    rememberedObjects: RecognizedObject[]
  ): number {
    const allObjects = [...visibleObjects, ...rememberedObjects];
    if (allObjects.length === 0) return 0;

    const totalConfidence = allObjects.reduce(
      (sum, obj) => sum + obj.recognitionConfidence,
      0
    );
    return totalConfidence / allObjects.length;
  }

  private calculateStalenessFactors(
    queryArea: SpatialArea
  ): Record<string, number> {
    // Simplified staleness calculation
    return {
      center: 0.1,
      periphery: 0.3,
      distant: 0.5,
    };
  }

  private calculateExplorationPriority(
    queryArea: SpatialArea,
    coverage: any
  ): number {
    // Priority is higher for areas with low coverage
    return Math.max(0, 1 - coverage.coveragePercentage);
  }

  private generateViewpointSuggestions(
    queryArea: SpatialArea,
    coverage: any
  ): Array<{
    position: Vec3;
    expectedCoverage: number;
    accessibilityRating: number;
  }> {
    // Generate simple viewpoint suggestions around the query area
    const suggestions = [];
    const radius = queryArea.radius * 1.5;

    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 4) {
      const x = queryArea.center.x + Math.cos(angle) * radius;
      const z = queryArea.center.z + Math.sin(angle) * radius;

      suggestions.push({
        position: { x, y: queryArea.center.y + 2, z },
        expectedCoverage: 0.7 + Math.random() * 0.3,
        accessibilityRating: 0.8,
      });
    }

    return suggestions;
  }

  private spatialCluster(
    positions: Vec3[],
    radius: number
  ): Array<{ center: Vec3; radius: number }> {
    // Simple spatial clustering
    const clusters = [];
    const used = new Set<number>();

    for (let i = 0; i < positions.length; i++) {
      if (used.has(i)) continue;

      const cluster = { center: positions[i], radius };
      clusters.push(cluster);
      used.add(i);

      // Add nearby points to this cluster
      for (let j = i + 1; j < positions.length; j++) {
        if (used.has(j)) continue;

        const distance = this.calculateDistance(positions[i], positions[j]);
        if (distance <= radius) {
          used.add(j);
        }
      }
    }

    return clusters;
  }

  private estimateMemoryUsage(): number {
    // Rough memory estimation
    return this.trackedObjects.size * 1000; // ~1KB per tracked object
  }
}

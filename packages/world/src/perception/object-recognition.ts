/**
 * Object Recognition - Advanced visual object identification and classification
 *
 * Identifies blocks, entities, and items within the visual field with human-like
 * recognition capabilities including confidence scoring and behavioral tracking.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IObjectRecognition,
  RecognizedObject,
  ObjectType,
  VisualFeature,
  PerceptionConfig,
  validateRecognizedObject,
} from './types';
import { Observation, Vec3, distance } from '../types';

export interface ObjectRecognitionEvents {
  'object-recognized': [RecognizedObject];
  'object-updated': [RecognizedObject, RecognizedObject]; // old, new
  'entity-behavior-detected': [{ objectId: string; behavior: string }];
  'recognition-confidence-changed': [
    { objectId: string; oldConfidence: number; newConfidence: number },
  ];
}

/**
 * Comprehensive object recognition system with confidence tracking
 */
export class ObjectRecognition
  extends EventEmitter<ObjectRecognitionEvents>
  implements IObjectRecognition
{
  private objectDatabase = new Map<string, any>(); // Block/entity type -> recognition data
  private previousFrame = new Map<string, RecognizedObject>();
  private entityBehaviorHistory = new Map<
    string,
    Array<{ timestamp: number; behavior: any }>
  >();

  constructor() {
    super();
    this.initializeObjectDatabase();
  }

  /**
   * Recognize and classify visible objects from perception data
   */
  recognizeObjects(
    observations: Observation[],
    viewingConditions: Map<string, any>,
    config: PerceptionConfig
  ): RecognizedObject[] {
    const recognizedObjects: RecognizedObject[] = [];

    for (const observation of observations) {
      try {
        const recognized = this.recognizeSingleObject(
          observation,
          viewingConditions,
          config
        );

        if (
          recognized &&
          recognized.recognitionConfidence >=
            config.recognition.minimumConfidenceToTrack
        ) {
          recognizedObjects.push(recognized);
          this.emit('object-recognized', recognized);
        }
      } catch (error) {
        console.warn('Object recognition error:', error);
      }
    }

    return recognizedObjects;
  }

  /**
   * Calculate recognition confidence based on viewing conditions
   */
  calculateRecognitionConfidence(object: any, viewingConditions: any): number {
    let confidence = 1.0;

    // Distance factor
    if (viewingConditions.distance !== undefined) {
      const distanceFactor = Math.max(
        0.1,
        1.0 - viewingConditions.distance / 50
      );
      confidence *= distanceFactor;
    }

    // Lighting factor
    if (viewingConditions.lightLevel !== undefined) {
      const lightingFactor = Math.max(0.3, viewingConditions.lightLevel / 15);
      confidence *= lightingFactor;
    }

    // Occlusion factor
    if (viewingConditions.occlusionPercent !== undefined) {
      const occlusionFactor = Math.max(
        0.1,
        1.0 - viewingConditions.occlusionPercent
      );
      confidence *= occlusionFactor;
    }

    // Visual acuity factor (peripheral vision degradation)
    if (viewingConditions.visualAcuity !== undefined) {
      confidence *= viewingConditions.visualAcuity;
    }

    // Movement factor (harder to recognize moving objects)
    if (viewingConditions.movementSpeed !== undefined) {
      const movementFactor = Math.max(
        0.5,
        1.0 - viewingConditions.movementSpeed / 10
      );
      confidence *= movementFactor;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Track object persistence across multiple observation frames
   */
  trackObjectPersistence(
    newObservations: RecognizedObject[],
    previousTracking: Map<string, RecognizedObject>
  ): Map<string, RecognizedObject> {
    const updated = new Map<string, RecognizedObject>();
    const currentTime = Date.now();

    // Create spatial index for efficient matching
    const spatialIndex = this.createSpatialIndex(
      Array.from(previousTracking.values())
    );

    for (const newObj of newObservations) {
      // Try to match with existing tracked objects
      const matchedObj = this.findBestMatch(newObj, spatialIndex);

      if (matchedObj) {
        // Update existing object
        const updatedObj = this.updateTrackedObject(
          matchedObj,
          newObj,
          currentTime
        );
        updated.set(updatedObj.id, updatedObj);
        this.emit('object-updated', matchedObj, updatedObj);
      } else {
        // New object
        const newTrackedObj = this.createNewTrackedObject(newObj, currentTime);
        updated.set(newTrackedObj.id, newTrackedObj);
      }
    }

    // Keep track of objects that weren't re-observed (for confidence decay)
    for (const [id, obj] of previousTracking) {
      if (!updated.has(id)) {
        // Object not re-observed, but keep tracking for confidence decay
        updated.set(id, obj);
      }
    }

    return updated;
  }

  /**
   * Identify entities (mobs, players) with behavioral context
   */
  identifyEntities(
    entityObservations: any[],
    behavioralContext: any
  ): RecognizedObject[] {
    const entities: RecognizedObject[] = [];

    for (const entityObs of entityObservations) {
      const entityType = this.classifyEntity(entityObs, behavioralContext);

      if (entityType) {
        const recognizedEntity = this.createEntityObject(
          entityObs,
          entityType,
          behavioralContext
        );
        entities.push(recognizedEntity);

        // Track behavior patterns
        this.updateEntityBehavior(
          recognizedEntity.id,
          entityObs,
          behavioralContext
        );
      }
    }

    return entities;
  }

  /**
   * Get recognition statistics
   */
  getRecognitionStats(): {
    totalRecognized: number;
    byType: Map<ObjectType, number>;
    averageConfidence: number;
  } {
    const stats = {
      totalRecognized: this.previousFrame.size,
      byType: new Map<ObjectType, number>(),
      averageConfidence: 0,
    };

    let totalConfidence = 0;
    for (const obj of this.previousFrame.values()) {
      const count = stats.byType.get(obj.type) || 0;
      stats.byType.set(obj.type, count + 1);
      totalConfidence += obj.recognitionConfidence;
    }

    stats.averageConfidence =
      stats.totalRecognized > 0 ? totalConfidence / stats.totalRecognized : 0;

    return stats;
  }

  /**
   * Clear tracking state (for testing)
   */
  clearTrackingState(): void {
    this.previousFrame.clear();
    this.entityBehaviorHistory.clear();
  }

  // ===== PRIVATE METHODS =====

  private recognizeSingleObject(
    observation: Observation,
    viewingConditions: Map<string, any>,
    config: PerceptionConfig
  ): RecognizedObject | null {
    const objectType = this.classifyObjectType(observation.blockId, config);

    if (!objectType) return null;

    const posKey = `${observation.pos.x},${observation.pos.y},${observation.pos.z}`;
    const viewingCond = viewingConditions.get(posKey) || {};
    const confidence = this.calculateRecognitionConfidence(
      observation,
      viewingCond
    );

    const visualFeatures = this.extractVisualFeatures(
      observation.blockId,
      objectType
    );

    const recognizedObject: RecognizedObject = {
      id: uuidv4(),
      type: objectType,
      position: observation.pos,
      recognitionConfidence: confidence,
      lastSeen: observation.lastSeen,
      totalObservations: 1,

      appearanceData: {
        blockType: objectType === 'block' ? observation.blockId : undefined,
        visualFeatures,
      },

      viewingConditions: {
        distance: viewingCond.distance || observation.distance,
        lightLevel: observation.light || 15,
        occlusionPercent: viewingCond.occlusionPercent || 0,
        isInPeriphery: viewingCond.isInPeriphery || false,
        visualAcuity: viewingCond.visualAcuity || 1.0,
      },

      confidenceHistory: [
        {
          timestamp: Date.now(),
          confidence,
          reason: 'initial_recognition',
        },
      ],

      positionHistory: [
        {
          timestamp: Date.now(),
          position: observation.pos,
        },
      ],
    };

    return validateRecognizedObject(recognizedObject);
  }

  private classifyObjectType(
    blockId: string,
    config: PerceptionConfig
  ): ObjectType | null {
    // Defensive programming: ensure blockId exists
    if (!blockId || typeof blockId !== 'string') {
      console.warn('Invalid blockId provided to classifyObjectType:', blockId);
      return null;
    }

    // Defensive programming: ensure objectClassification exists
    if (!config?.objectClassification) {
      console.warn('Object classification config is missing, using defaults');
      // Return default classification for Minecraft blocks
      if (blockId.startsWith('minecraft:')) {
        return 'block';
      }
      return null;
    }

    // Additional check for individual arrays - provide defaults if missing
    const ores = (config.objectClassification.ores || []).filter(Boolean);
    const structures = (config.objectClassification.structures || []).filter(
      Boolean
    );
    const hazards = (config.objectClassification.hazards || []).filter(Boolean);
    const resources = (config.objectClassification.resources || []).filter(
      Boolean
    );
    const hostileEntities = (
      config.objectClassification.hostileEntities || []
    ).filter(Boolean);
    const neutralEntities = (
      config.objectClassification.neutralEntities || []
    ).filter(Boolean);

    // Check ore types
    if (ores.some((ore) => blockId.includes(ore))) {
      return 'block';
    }

    // Check structures
    if (structures.some((struct) => blockId.includes(struct))) {
      return 'structure';
    }

    // Check hazards
    if (hazards.some((hazard) => blockId.includes(hazard))) {
      return 'block'; // Hazards are still blocks
    }

    // Check resources
    if (resources.some((resource) => blockId.includes(resource))) {
      return 'block'; // Resources are still blocks
    }

    // Check entities
    if (hostileEntities.some((entity) => blockId.includes(entity))) {
      return 'entity_mob_hostile';
    }

    if (neutralEntities.some((entity) => blockId.includes(entity))) {
      return 'entity_mob_neutral';
    }

    // Default classification for Minecraft blocks
    if (blockId.startsWith('minecraft:')) {
      return 'block';
    }

    return 'unknown';
  }

  private extractVisualFeatures(
    blockId: string,
    objectType: ObjectType
  ): VisualFeature[] {
    const features: VisualFeature[] = [];

    // Get cached features from database
    const dbEntry = this.objectDatabase.get(blockId);
    if (dbEntry?.visualFeatures) {
      return dbEntry.visualFeatures;
    }

    // Generate features based on block type
    if (blockId.includes('ore')) {
      features.push({
        shape: 'cube',
        texture: 'rough',
        luminance: 0,
        animation: false,
      });
    } else if (blockId.includes('log')) {
      features.push({
        shape: 'cube',
        texture: 'wood_grain',
        color: 'brown',
        luminance: 0,
        animation: false,
      });
    } else if (blockId.includes('stone')) {
      features.push({
        shape: 'cube',
        texture: 'rough',
        color: 'gray',
        luminance: 0,
        animation: false,
      });
    } else if (objectType.startsWith('entity_')) {
      features.push({
        shape: 'humanoid',
        animation: true,
        luminance: 0,
      });
    }

    // Cache the features
    this.objectDatabase.set(blockId, { visualFeatures: features });

    return features;
  }

  private createSpatialIndex(
    objects: RecognizedObject[]
  ): Map<string, RecognizedObject[]> {
    const index = new Map<string, RecognizedObject[]>();

    for (const obj of objects) {
      // Create spatial grid key (4x4x4 block regions)
      const gridKey = `${Math.floor(obj.position.x / 4)},${Math.floor(obj.position.y / 4)},${Math.floor(obj.position.z / 4)}`;

      if (!index.has(gridKey)) {
        index.set(gridKey, []);
      }
      index.get(gridKey)!.push(obj);
    }

    return index;
  }

  private findBestMatch(
    newObj: RecognizedObject,
    spatialIndex: Map<string, RecognizedObject[]>
  ): RecognizedObject | null {
    const gridKey = `${Math.floor(newObj.position.x / 4)},${Math.floor(newObj.position.y / 4)},${Math.floor(newObj.position.z / 4)}`;
    const candidates = spatialIndex.get(gridKey) || [];

    let bestMatch: RecognizedObject | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateMatchScore(newObj, candidate);
      if (score > bestScore && score > 0.7) {
        // Minimum match threshold
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  private calculateMatchScore(
    obj1: RecognizedObject,
    obj2: RecognizedObject
  ): number {
    let score = 0;

    // Type match (critical)
    if (obj1.type === obj2.type) {
      score += 0.4;
    } else {
      return 0; // Different types can't match
    }

    // Block type match
    if (obj1.appearanceData.blockType === obj2.appearanceData.blockType) {
      score += 0.3;
    }

    // Position proximity
    const dist = distance(obj1.position, obj2.position);
    const positionScore = Math.max(0, 1 - dist / 5); // 5 block tolerance
    score += positionScore * 0.3;

    return Math.min(1, score);
  }

  private updateTrackedObject(
    existing: RecognizedObject,
    newObservation: RecognizedObject,
    currentTime: number
  ): RecognizedObject {
    const updated = { ...existing };

    // Update position and tracking
    updated.position = newObservation.position;
    updated.lastSeen = currentTime;
    updated.totalObservations += 1;

    // Update confidence (weighted average with recency bias)
    const recencyWeight = 0.7;
    updated.recognitionConfidence =
      (1 - recencyWeight) * existing.recognitionConfidence +
      recencyWeight * newObservation.recognitionConfidence;

    // Update viewing conditions
    updated.viewingConditions = newObservation.viewingConditions;

    // Add to confidence history
    updated.confidenceHistory.push({
      timestamp: currentTime,
      confidence: updated.recognitionConfidence,
      reason: 'observation_update',
    });

    // Add to position history
    updated.positionHistory.push({
      timestamp: currentTime,
      position: newObservation.position,
      velocity: this.calculateVelocity(
        existing.positionHistory,
        newObservation.position,
        currentTime
      ),
    });

    // Trim history to prevent memory growth
    if (updated.confidenceHistory.length > 50) {
      updated.confidenceHistory = updated.confidenceHistory.slice(-25);
    }
    if (updated.positionHistory.length > 50) {
      updated.positionHistory = updated.positionHistory.slice(-25);
    }

    return updated;
  }

  private createNewTrackedObject(
    obj: RecognizedObject,
    currentTime: number
  ): RecognizedObject {
    return {
      ...obj,
      id: uuidv4(),
      lastSeen: currentTime,
      confidenceHistory: [
        {
          timestamp: currentTime,
          confidence: obj.recognitionConfidence,
          reason: 'new_object',
        },
      ],
      positionHistory: [
        {
          timestamp: currentTime,
          position: obj.position,
        },
      ],
    };
  }

  private calculateVelocity(
    positionHistory: Array<{ timestamp: number; position: Vec3 }>,
    currentPosition: Vec3,
    currentTime: number
  ): Vec3 | undefined {
    if (positionHistory.length === 0) return undefined;

    const lastEntry = positionHistory[positionHistory.length - 1];
    const timeDelta = (currentTime - lastEntry.timestamp) / 1000; // seconds

    if (timeDelta <= 0) return undefined;

    return {
      x: (currentPosition.x - lastEntry.position.x) / timeDelta,
      y: (currentPosition.y - lastEntry.position.y) / timeDelta,
      z: (currentPosition.z - lastEntry.position.z) / timeDelta,
    };
  }

  private classifyEntity(
    entityObs: any,
    behavioralContext: any
  ): ObjectType | null {
    // This would be expanded based on actual entity observation data
    // For now, return a placeholder classification
    if (entityObs.type?.includes('player')) return 'entity_player';
    if (
      entityObs.type?.includes('zombie') ||
      entityObs.type?.includes('skeleton')
    )
      return 'entity_mob_hostile';
    if (entityObs.type?.includes('cow') || entityObs.type?.includes('sheep'))
      return 'entity_mob_passive';

    return 'entity_mob_neutral';
  }

  private createEntityObject(
    entityObs: any,
    entityType: ObjectType,
    behavioralContext: any
  ): RecognizedObject {
    return {
      id: uuidv4(),
      type: entityType,
      position: entityObs.position || { x: 0, y: 0, z: 0 },
      recognitionConfidence: 0.8,
      lastSeen: Date.now(),
      totalObservations: 1,

      appearanceData: {
        entityType: entityObs.type,
        visualFeatures: [
          {
            shape: 'humanoid',
            animation: true,
            luminance: 0,
          },
        ],
      },

      viewingConditions: {
        distance: entityObs.distance || 10,
        lightLevel: 15,
        occlusionPercent: 0,
        isInPeriphery: false,
        visualAcuity: 1.0,
      },

      behaviorPattern: {
        movementSpeed: entityObs.velocity || 0,
        hostilityLevel: entityType === 'entity_mob_hostile' ? 0.8 : 0.1,
        interactionHistory: [],
      },

      confidenceHistory: [
        {
          timestamp: Date.now(),
          confidence: 0.8,
          reason: 'entity_recognition',
        },
      ],

      positionHistory: [
        {
          timestamp: Date.now(),
          position: entityObs.position || { x: 0, y: 0, z: 0 },
        },
      ],
    };
  }

  private updateEntityBehavior(
    objectId: string,
    entityObs: any,
    behavioralContext: any
  ): void {
    const history = this.entityBehaviorHistory.get(objectId) || [];

    history.push({
      timestamp: Date.now(),
      behavior: {
        movement: entityObs.velocity || 0,
        interaction: behavioralContext?.lastInteraction,
        state: entityObs.state,
      },
    });

    // Trim history
    if (history.length > 100) {
      history.splice(0, history.length - 50);
    }

    this.entityBehaviorHistory.set(objectId, history);

    // Emit behavior detection event
    this.emit('entity-behavior-detected', {
      objectId,
      behavior: history[history.length - 1].behavior,
    });
  }

  private initializeObjectDatabase(): void {
    // Initialize common Minecraft blocks with their visual features
    const commonBlocks = [
      {
        id: 'minecraft:coal_ore',
        features: [
          {
            shape: 'cube' as const,
            texture: 'rough',
            color: 'black',
            luminance: 0,
          },
        ],
      },
      {
        id: 'minecraft:iron_ore',
        features: [
          {
            shape: 'cube' as const,
            texture: 'rough',
            color: 'orange',
            luminance: 0,
          },
        ],
      },
      {
        id: 'minecraft:diamond_ore',
        features: [
          {
            shape: 'cube' as const,
            texture: 'crystalline',
            color: 'cyan',
            luminance: 0,
          },
        ],
      },
      {
        id: 'minecraft:chest',
        features: [
          {
            shape: 'cube' as const,
            texture: 'wood_grain',
            color: 'brown',
            luminance: 0,
          },
        ],
      },
      {
        id: 'minecraft:oak_log',
        features: [
          {
            shape: 'cube' as const,
            texture: 'wood_grain',
            color: 'brown',
            luminance: 0,
          },
        ],
      },
    ];

    for (const block of commonBlocks) {
      this.objectDatabase.set(block.id, { visualFeatures: block.features });
    }
  }
}

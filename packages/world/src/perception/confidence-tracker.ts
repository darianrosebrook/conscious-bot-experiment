/**
 * Confidence Tracker - Manage confidence decay and observation freshness
 *
 * Tracks the confidence decay of visual observations over time and manages
 * the freshness of perceptual information for authentic uncertainty modeling.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  IConfidenceTracker,
  RecognizedObject,
  ConfidenceDecayModel,
  ConfidenceUpdate,
  validateRecognizedObject,
} from './types';

export interface ConfidenceTrackerEvents {
  'confidence-updated': [ConfidenceUpdate];
  'observation-refreshed': [{ objectId: string; newConfidence: number }];
  'observation-pruned': [{ objectId: string; finalConfidence: number }];
  'confidence-threshold-crossed': [
    { objectId: string; threshold: string; confidence: number },
  ];
}

/**
 * Advanced confidence tracking with context-sensitive decay models
 */
export class ConfidenceTracker
  extends EventEmitter<ConfidenceTrackerEvents>
  implements IConfidenceTracker
{
  private readonly cleanupInterval: NodeJS.Timeout;
  private lastUpdateTime = Date.now();

  constructor(
    private decayModel: ConfidenceDecayModel,
    private updateIntervalMs: number = 1000 // 1 second
  ) {
    super();

    // Start periodic confidence updates
    this.cleanupInterval = setInterval(() => {
      this.performPeriodicUpdate();
    }, this.updateIntervalMs);
  }

  /**
   * Record new observation with initial confidence
   */
  recordObservation(
    observation: RecognizedObject,
    initialConfidence: number
  ): RecognizedObject {
    const trackedObservation = {
      ...observation,
      recognitionConfidence: Math.max(0, Math.min(1, initialConfidence)),
      lastSeen: Date.now(),
    };

    // Add initial confidence entry to history
    if (!trackedObservation.confidenceHistory) {
      trackedObservation.confidenceHistory = [];
    }

    trackedObservation.confidenceHistory.push({
      timestamp: Date.now(),
      confidence: trackedObservation.recognitionConfidence,
      reason: 'initial_observation',
    });

    return validateRecognizedObject(trackedObservation);
  }

  /**
   * Update confidence levels for all tracked observations
   */
  updateConfidenceLevels(
    trackedObjects: Map<string, RecognizedObject>,
    timeElapsed: number,
    decayModel: ConfidenceDecayModel
  ): ConfidenceUpdate[] {
    const updates: ConfidenceUpdate[] = [];
    const currentTime = Date.now();

    for (const [objectId, obj] of trackedObjects) {
      const previousConfidence = obj.recognitionConfidence;
      const decayResult = this.calculateConfidenceDecay(
        obj,
        timeElapsed,
        decayModel
      );

      // Apply decay
      obj.recognitionConfidence = decayResult.newConfidence;

      // Create update record
      const update: ConfidenceUpdate = {
        objectId,
        previousConfidence,
        newConfidence: decayResult.newConfidence,
        decayAmount: decayResult.decayAmount,
        reason: decayResult.reason,
        timestamp: currentTime,
      };

      updates.push(update);

      // Add to confidence history
      obj.confidenceHistory.push({
        timestamp: currentTime,
        confidence: decayResult.newConfidence,
        reason: decayResult.reason,
      });

      // Emit events for significant changes
      this.emit('confidence-updated', update);

      // Check for threshold crossings
      this.checkThresholdCrossings(
        objectId,
        previousConfidence,
        decayResult.newConfidence,
        decayModel
      );
    }

    this.lastUpdateTime = currentTime;
    return updates;
  }

  /**
   * Refresh observation confidence when re-sighted
   */
  refreshObservation(
    objectId: string,
    newObservation: RecognizedObject,
    trackedObjects: Map<string, RecognizedObject>
  ): RecognizedObject {
    const existing = trackedObjects.get(objectId);
    if (!existing) {
      return this.recordObservation(
        newObservation,
        newObservation.recognitionConfidence
      );
    }

    const currentTime = Date.now();

    // Calculate refresh boost based on time since last observation
    const timeSinceLastSeen = currentTime - existing.lastSeen;
    const refreshBoost = this.calculateRefreshBoost(
      timeSinceLastSeen,
      existing.recognitionConfidence
    );

    // Update confidence with boost
    const newConfidence = Math.min(
      1.0,
      Math.max(
        existing.recognitionConfidence,
        newObservation.recognitionConfidence + refreshBoost
      )
    );

    // Update the object
    existing.recognitionConfidence = newConfidence;
    existing.lastSeen = currentTime;
    existing.totalObservations += 1;

    // Update viewing conditions from new observation
    existing.viewingConditions = newObservation.viewingConditions;

    // Add refresh entry to confidence history
    existing.confidenceHistory.push({
      timestamp: currentTime,
      confidence: newConfidence,
      reason: 'observation_refresh',
    });

    // Add to position history
    existing.positionHistory.push({
      timestamp: currentTime,
      position: newObservation.position,
      velocity: this.calculateVelocity(
        existing.positionHistory,
        newObservation.position,
        currentTime
      ),
    });

    this.emit('observation-refreshed', { objectId, newConfidence });

    return validateRecognizedObject(existing);
  }

  /**
   * Prune observations that have fallen below confidence threshold
   */
  pruneStaleObservations(
    trackedObjects: Map<string, RecognizedObject>,
    minimumConfidence: number
  ): string[] {
    const prunedIds: string[] = [];

    for (const [objectId, obj] of trackedObjects) {
      if (obj.recognitionConfidence < minimumConfidence) {
        prunedIds.push(objectId);
        trackedObjects.delete(objectId);

        this.emit('observation-pruned', {
          objectId,
          finalConfidence: obj.recognitionConfidence,
        });
      }
    }

    return prunedIds;
  }

  /**
   * Get confidence statistics for tracked objects
   */
  getConfidenceStatistics(trackedObjects: Map<string, RecognizedObject>): {
    totalObjects: number;
    averageConfidence: number;
    confidenceDistribution: { [range: string]: number };
    stalestObject: { id: string; age: number } | null;
    freshestObject: { id: string; age: number } | null;
  } {
    const currentTime = Date.now();
    let totalConfidence = 0;
    let stalestAge = 0;
    let stalestId = '';
    let freshestAge = Infinity;
    let freshestId = '';

    const distribution = {
      'high (0.8-1.0)': 0,
      'medium (0.5-0.8)': 0,
      'low (0.1-0.5)': 0,
      'very-low (0.0-0.1)': 0,
    };

    for (const [objectId, obj] of trackedObjects) {
      totalConfidence += obj.recognitionConfidence;

      // Update distribution
      if (obj.recognitionConfidence >= 0.8) distribution['high (0.8-1.0)']++;
      else if (obj.recognitionConfidence >= 0.5)
        distribution['medium (0.5-0.8)']++;
      else if (obj.recognitionConfidence >= 0.1)
        distribution['low (0.1-0.5)']++;
      else distribution['very-low (0.0-0.1)']++;

      // Track stalest and freshest
      const age = currentTime - obj.lastSeen;
      if (age > stalestAge) {
        stalestAge = age;
        stalestId = objectId;
      }
      if (age < freshestAge) {
        freshestAge = age;
        freshestId = objectId;
      }
    }

    return {
      totalObjects: trackedObjects.size,
      averageConfidence:
        trackedObjects.size > 0 ? totalConfidence / trackedObjects.size : 0,
      confidenceDistribution: distribution,
      stalestObject: stalestId ? { id: stalestId, age: stalestAge } : null,
      freshestObject: freshestId ? { id: freshestId, age: freshestAge } : null,
    };
  }

  /**
   * Force confidence update for specific object
   */
  forceConfidenceUpdate(
    objectId: string,
    newConfidence: number,
    reason: string,
    trackedObjects: Map<string, RecognizedObject>
  ): boolean {
    const obj = trackedObjects.get(objectId);
    if (!obj) return false;

    const previousConfidence = obj.recognitionConfidence;
    obj.recognitionConfidence = Math.max(0, Math.min(1, newConfidence));

    // Add to confidence history
    obj.confidenceHistory.push({
      timestamp: Date.now(),
      confidence: obj.recognitionConfidence,
      reason: `forced_update: ${reason}`,
    });

    const update: ConfidenceUpdate = {
      objectId,
      previousConfidence,
      newConfidence: obj.recognitionConfidence,
      decayAmount: previousConfidence - obj.recognitionConfidence,
      reason: `forced_update: ${reason}`,
      timestamp: Date.now(),
    };

    this.emit('confidence-updated', update);
    return true;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
  }

  // ===== PRIVATE METHODS =====

  private calculateConfidenceDecay(
    obj: RecognizedObject,
    timeElapsed: number,
    decayModel: ConfidenceDecayModel
  ): { newConfidence: number; decayAmount: number; reason: string } {
    const timeElapsedSeconds = timeElapsed / 1000;
    const timeSinceLastSeen = (Date.now() - obj.lastSeen) / 1000;

    // Base decay rate
    let decayRate = decayModel.baseDecayRate;

    // Distance-based decay
    const distanceDecay =
      decayModel.distanceFactor * obj.viewingConditions.distance;
    decayRate += distanceDecay;

    // Context-sensitive decay
    const contextMultiplier = this.getContextDecayMultiplier(obj, decayModel);
    decayRate *= contextMultiplier;

    // Apply time-based decay
    const baseDecayAmount = decayRate * timeElapsedSeconds;

    // Additional decay for time since last seen
    const stalenessDecayAmount = (timeSinceLastSeen / 300) * 0.1; // 5 minutes for 10% additional decay

    const totalDecayAmount = baseDecayAmount + stalenessDecayAmount;
    const newConfidence = Math.max(
      0,
      obj.recognitionConfidence - totalDecayAmount
    );

    let reason = 'time_decay';
    if (distanceDecay > decayModel.baseDecayRate) reason = 'distance_decay';
    if (stalenessDecayAmount > baseDecayAmount) reason = 'staleness_decay';

    return { newConfidence, decayAmount: totalDecayAmount, reason };
  }

  private getContextDecayMultiplier(
    obj: RecognizedObject,
    decayModel: ConfidenceDecayModel
  ): number {
    // Get object-specific decay multiplier
    const objectKey = obj.appearanceData.blockType || obj.type;
    const contextMultiplier = decayModel.contextSensitivity[objectKey];

    if (contextMultiplier !== undefined) {
      return contextMultiplier;
    }

    // Default multipliers by object type
    switch (obj.type) {
      case 'block':
        return 0.8; // Blocks decay slower (they don't move)
      case 'structure':
        return 0.6; // Structures are very stable
      case 'entity_mob_hostile':
        return 1.5; // Hostile mobs decay faster (important to track)
      case 'entity_mob_neutral':
        return 1.2; // Neutral mobs decay moderately
      case 'entity_player':
        return 1.3; // Players move unpredictably
      default:
        return 1.0;
    }
  }

  private calculateRefreshBoost(
    timeSinceLastSeen: number,
    currentConfidence: number
  ): number {
    // Boost is higher for objects that haven't been seen for a while
    const timeBonus = Math.min(0.3, timeSinceLastSeen / 60000); // Up to 0.3 for 1 minute

    // Boost is higher for low-confidence objects (helps recover from uncertainty)
    const confidenceBonus = (1 - currentConfidence) * 0.2;

    return timeBonus + confidenceBonus;
  }

  private calculateVelocity(
    positionHistory: Array<{
      timestamp: number;
      position: { x: number; y: number; z: number };
    }>,
    currentPosition: { x: number; y: number; z: number },
    currentTime: number
  ): { x: number; y: number; z: number } | undefined {
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

  private checkThresholdCrossings(
    objectId: string,
    previousConfidence: number,
    newConfidence: number,
    decayModel: ConfidenceDecayModel
  ): void {
    const thresholds = [
      { name: 'refresh', value: decayModel.refreshThreshold },
      { name: 'pruning', value: decayModel.pruningThreshold },
      { name: 'high_confidence', value: 0.8 },
      { name: 'medium_confidence', value: 0.5 },
    ];

    for (const threshold of thresholds) {
      // Check for downward crossing
      if (
        previousConfidence >= threshold.value &&
        newConfidence < threshold.value
      ) {
        this.emit('confidence-threshold-crossed', {
          objectId,
          threshold: `${threshold.name}_down`,
          confidence: newConfidence,
        });
      }

      // Check for upward crossing
      if (
        previousConfidence < threshold.value &&
        newConfidence >= threshold.value
      ) {
        this.emit('confidence-threshold-crossed', {
          objectId,
          threshold: `${threshold.name}_up`,
          confidence: newConfidence,
        });
      }
    }
  }

  private performPeriodicUpdate(): void {
    // This would be called by external systems with their tracked objects
    // For now, just update internal state
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - this.lastUpdateTime;

    if (timeSinceLastUpdate > this.updateIntervalMs * 2) {
      console.warn(
        `ConfidenceTracker: Large gap in updates (${timeSinceLastUpdate}ms)`
      );
    }

    this.lastUpdateTime = currentTime;
  }
}

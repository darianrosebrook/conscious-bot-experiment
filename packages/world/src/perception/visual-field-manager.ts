/**
 * Visual Field Manager - Human-like field of view and attention management
 *
 * Simulates human visual perception with central focus, peripheral vision,
 * and dynamic attention allocation based on stimuli and goals.
 *
 * @author @darianrosebrook
 */

import { EventEmitter } from 'events';
import {
  IVisualFieldManager,
  VisualField,
  FieldOfViewConfig,
  VisualStimulus,
  AttentionModel,
  AttentionAllocation,
  validatePerceptionConfig,
  degreesToRadians,
  isInVisionCone,
  calculateAcuity,
  angularDistance,
} from './types';
import { Vec3, Direction, distance } from '../types';

export interface VisualFieldEvents {
  'field-updated': [VisualField];
  'attention-shifted': [AttentionAllocation];
  'stimulus-detected': [VisualStimulus];
  'peripheral-detection': [{ position: Vec3; acuity: number }];
}

/**
 * Advanced visual field management with human-like perception constraints
 */
export class VisualFieldManager
  extends EventEmitter<VisualFieldEvents>
  implements IVisualFieldManager
{
  private currentVisualField?: VisualField;
  private attentionHistory: Array<{
    timestamp: number;
    target: Vec3;
    duration: number;
  }> = [];
  private inhibitionMap = new Map<string, number>(); // position -> timestamp
  private stimulusBuffer: VisualStimulus[] = [];

  constructor(private config: FieldOfViewConfig) {
    super();
  }

  /**
   * Update visual field based on agent's head orientation
   */
  updateVisualField(
    headDirection: Direction,
    fieldOfView: FieldOfViewConfig
  ): VisualField {
    this.config = fieldOfView;

    // Generate ray directions for field of view
    const rayDirections = this.generateFieldOfViewRays(
      headDirection,
      fieldOfView
    );

    // Calculate acuity map for each direction
    const acuityMap = new Map<string, number>();
    for (const rayDir of rayDirections) {
      const angleFromCenter = angularDistance(rayDir, headDirection);
      const acuity = calculateAcuity(
        angleFromCenter,
        fieldOfView.centralFocusAngle,
        fieldOfView.peripheralAcuity
      );
      const dirKey = `${rayDir.x.toFixed(3)},${rayDir.y.toFixed(3)},${rayDir.z.toFixed(3)}`;
      acuityMap.set(dirKey, acuity);
    }

    const visualField: VisualField = {
      centerDirection: headDirection,
      fovConfig: fieldOfView,
      rayDirections,
      acuityMap,
      lastUpdated: Date.now(),
    };

    this.currentVisualField = visualField;
    this.emit('field-updated', visualField);

    return visualField;
  }

  /**
   * Calculate visual acuity based on position relative to gaze center
   */
  calculateVisualAcuity(
    objectPosition: Vec3,
    gazeCenter: Vec3,
    visualField: VisualField
  ): number {
    if (!this.currentVisualField) return 0;

    // Calculate direction to object from eye position
    const eyePos = { x: gazeCenter.x, y: gazeCenter.y + 1.62, z: gazeCenter.z }; // Add eye height
    const toObject = {
      x: objectPosition.x - eyePos.x,
      y: objectPosition.y - eyePos.y,
      z: objectPosition.z - eyePos.z,
    };

    const objectDistance = Math.sqrt(
      toObject.x ** 2 + toObject.y ** 2 + toObject.z ** 2
    );

    if (objectDistance === 0) return 1.0;

    // Normalize direction
    const objectDirection = {
      x: toObject.x / objectDistance,
      y: toObject.y / objectDistance,
      z: toObject.z / objectDistance,
    };

    // Check if within field of view
    if (
      !isInVisionCone(
        objectPosition,
        eyePos,
        visualField.centerDirection,
        degreesToRadians(visualField.fovConfig.horizontalFov)
      )
    ) {
      return 0; // Outside field of view
    }

    // Calculate angle from center of vision
    const angleFromCenter = angularDistance(
      objectDirection,
      visualField.centerDirection
    );

    // Apply distance-based acuity degradation
    const distanceAcuity = Math.max(
      0.1,
      1.0 - objectDistance / visualField.fovConfig.maxDistance
    );

    // Calculate angular acuity
    const angularAcuity = calculateAcuity(
      angleFromCenter,
      visualField.fovConfig.centralFocusAngle,
      visualField.fovConfig.peripheralAcuity
    );

    // Combine distance and angular acuity
    const combinedAcuity = distanceAcuity * angularAcuity;

    // Emit peripheral detection if in peripheral vision
    if (angularAcuity < 1.0 && combinedAcuity > 0.1) {
      this.emit('peripheral-detection', {
        position: objectPosition,
        acuity: combinedAcuity,
      });
    }

    return combinedAcuity;
  }

  /**
   * Determine if object is within current field of view
   */
  isWithinFieldOfView(objectPosition: Vec3, visualField: VisualField): boolean {
    const eyePos = { x: 0, y: 1.62, z: 0 }; // Relative to agent position

    // Check horizontal FOV
    const inHorizontalFOV = isInVisionCone(
      objectPosition,
      eyePos,
      visualField.centerDirection,
      degreesToRadians(visualField.fovConfig.horizontalFov)
    );

    if (!inHorizontalFOV) return false;

    // Check vertical FOV
    const toObject = {
      x: objectPosition.x - eyePos.x,
      y: objectPosition.y - eyePos.y,
      z: objectPosition.z - eyePos.z,
    };

    const distance = Math.sqrt(
      toObject.x ** 2 + toObject.y ** 2 + toObject.z ** 2
    );
    if (distance > visualField.fovConfig.maxDistance) return false;

    // Check vertical angle
    const verticalAngle = Math.atan2(
      toObject.y,
      Math.sqrt(toObject.x ** 2 + toObject.z ** 2)
    );
    const maxVerticalAngle = degreesToRadians(
      visualField.fovConfig.verticalFov / 2
    );

    return Math.abs(verticalAngle) <= maxVerticalAngle;
  }

  /**
   * Simulate visual attention and focus management
   */
  manageVisualAttention(
    stimuli: VisualStimulus[],
    attentionModel: AttentionModel
  ): AttentionAllocation {
    const currentTime = Date.now();

    // Add new stimuli to buffer
    this.stimulusBuffer.push(...stimuli);

    // Emit stimulus detection events
    for (const stimulus of stimuli) {
      this.emit('stimulus-detected', stimulus);
    }

    // Clean up old stimuli and inhibition
    this.cleanupOldData(currentTime, attentionModel.attentionSpan);

    // Calculate attention weights for all stimuli
    const weightedStimuli = this.calculateStimulusWeights(
      this.stimulusBuffer,
      attentionModel,
      currentTime
    );

    // Select primary focus and secondary targets
    const allocation = this.allocateAttention(
      weightedStimuli,
      attentionModel,
      currentTime
    );

    this.emit('attention-shifted', allocation);
    return allocation;
  }

  /**
   * Get current visual field
   */
  getCurrentVisualField(): VisualField | undefined {
    return this.currentVisualField;
  }

  /**
   * Get recent attention history
   */
  getAttentionHistory(durationMs: number = 10000): Array<{
    timestamp: number;
    target: Vec3;
    duration: number;
  }> {
    const cutoff = Date.now() - durationMs;
    return this.attentionHistory.filter((entry) => entry.timestamp > cutoff);
  }

  /**
   * Add manual stimulus (for testing or external events)
   */
  addStimulus(stimulus: VisualStimulus): void {
    this.stimulusBuffer.push(stimulus);
    this.emit('stimulus-detected', stimulus);
  }

  /**
   * Clear attention state (for testing)
   */
  clearAttentionState(): void {
    this.stimulusBuffer = [];
    this.attentionHistory = [];
    this.inhibitionMap.clear();
  }

  // ===== PRIVATE METHODS =====

  private generateFieldOfViewRays(
    centerDirection: Direction,
    fovConfig: FieldOfViewConfig
  ): Direction[] {
    const rays: Direction[] = [];

    const hFovRad = degreesToRadians(fovConfig.horizontalFov);
    const vFovRad = degreesToRadians(fovConfig.verticalFov);

    // Calculate number of rays based on angular resolution
    const angularResolution = 2.0; // degrees
    const angularResRad = degreesToRadians(angularResolution);

    const hSteps = Math.ceil(hFovRad / angularResRad);
    const vSteps = Math.ceil(vFovRad / angularResRad);

    // Generate rays in spherical coordinates relative to center direction
    for (let h = -hSteps / 2; h <= hSteps / 2; h++) {
      for (let v = -vSteps / 2; v <= vSteps / 2; v++) {
        const yawOffset = h * angularResRad;
        const pitchOffset = v * angularResRad;

        // Convert center direction to spherical coordinates
        const centerYaw = Math.atan2(-centerDirection.x, centerDirection.z);
        const centerPitch = Math.asin(-centerDirection.y);

        // Apply offsets
        const rayYaw = centerYaw + yawOffset;
        const rayPitch = centerPitch + pitchOffset;

        // Convert back to direction vector
        const rayDirection: Direction = {
          x: -Math.sin(rayYaw) * Math.cos(rayPitch),
          y: -Math.sin(rayPitch),
          z: Math.cos(rayYaw) * Math.cos(rayPitch),
        };

        rays.push(rayDirection);
      }
    }

    return rays;
  }

  private calculateStimulusWeights(
    stimuli: VisualStimulus[],
    attentionModel: AttentionModel,
    currentTime: number
  ): Array<VisualStimulus & { weight: number; reason: string }> {
    return stimuli.map((stimulus) => {
      let weight = 0;
      let reason = '';

      // Bottom-up attention (stimulus-driven)
      const bottomUpWeight =
        stimulus.intensity * stimulus.novelty * attentionModel.bottomUpWeight;

      // Top-down attention (goal-driven) - placeholder for now
      const topDownWeight = 0.5 * attentionModel.topDownWeight;

      // Recency factor
      const age = currentTime - (currentTime - stimulus.duration);
      const recencyFactor = Math.max(0, 1 - age / attentionModel.attentionSpan);

      // Inhibition of return
      const posKey = `${Math.floor(stimulus.position.x)},${Math.floor(stimulus.position.y)},${Math.floor(stimulus.position.z)}`;
      const lastAttention = this.inhibitionMap.get(posKey) || 0;
      const inhibitionFactor = currentTime - lastAttention > 2000 ? 1.0 : 0.3; // 2 second inhibition

      weight =
        (bottomUpWeight + topDownWeight) * recencyFactor * inhibitionFactor;
      reason = `bottom-up: ${bottomUpWeight.toFixed(2)}, top-down: ${topDownWeight.toFixed(2)}, recency: ${recencyFactor.toFixed(2)}, inhibition: ${inhibitionFactor.toFixed(2)}`;

      return { ...stimulus, weight, reason };
    });
  }

  private allocateAttention(
    weightedStimuli: Array<VisualStimulus & { weight: number; reason: string }>,
    attentionModel: AttentionModel,
    currentTime: number
  ): AttentionAllocation {
    // Sort by weight
    const sortedStimuli = weightedStimuli.sort((a, b) => b.weight - a.weight);

    // Select primary focus
    const primaryFocus =
      sortedStimuli.length > 0
        ? {
            position: sortedStimuli[0].position,
            objectId: sortedStimuli[0].id,
            attentionWeight: sortedStimuli[0].weight,
            reason: sortedStimuli[0].reason,
          }
        : {
            position: { x: 0, y: 0, z: 0 },
            attentionWeight: 0,
            reason: 'no_stimuli',
          };

    // Select secondary targets
    const secondaryTargets = sortedStimuli
      .slice(1, attentionModel.maxSimultaneousTargets)
      .map((stimulus) => ({
        position: stimulus.position,
        objectId: stimulus.id,
        attentionWeight: stimulus.weight,
        reason: stimulus.reason,
      }));

    // Mark suppressed stimuli
    const suppressedStimuli = sortedStimuli
      .slice(attentionModel.maxSimultaneousTargets)
      .map((stimulus) => stimulus.id);

    // Update attention history
    if (primaryFocus.attentionWeight > 0) {
      this.attentionHistory.push({
        timestamp: currentTime,
        target: primaryFocus.position,
        duration: 0, // Will be updated when attention shifts
      });

      // Update inhibition map
      const posKey = `${Math.floor(primaryFocus.position.x)},${Math.floor(primaryFocus.position.y)},${Math.floor(primaryFocus.position.z)}`;
      this.inhibitionMap.set(posKey, currentTime);
    }

    return {
      timestamp: currentTime,
      primaryFocus,
      secondaryTargets,
      suppressedStimuli,
      attentionHistory: this.attentionHistory.slice(-10), // Last 10 entries
    };
  }

  private cleanupOldData(currentTime: number, attentionSpan: number): void {
    // Remove old stimuli
    this.stimulusBuffer = this.stimulusBuffer.filter(
      (stimulus) =>
        currentTime - (currentTime - stimulus.duration) < attentionSpan
    );

    // Remove old attention history
    this.attentionHistory = this.attentionHistory.filter(
      (entry) => currentTime - entry.timestamp < attentionSpan
    );

    // Remove old inhibition entries
    for (const [posKey, timestamp] of this.inhibitionMap.entries()) {
      if (currentTime - timestamp > attentionSpan) {
        this.inhibitionMap.delete(posKey);
      }
    }
  }
}

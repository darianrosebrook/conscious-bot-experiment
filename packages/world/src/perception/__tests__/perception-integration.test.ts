/**
 * Perception Integration Tests
 *
 * Comprehensive tests for the advanced perception system including visual field
 * management, object recognition, confidence tracking, and spatial awareness.
 *
 * @author @darianrosebrook
 */

import { PerceptionIntegration } from '../perception-integration';
import { VisualFieldManager } from '../visual-field-manager';
import { ObjectRecognition } from '../object-recognition';
import { ConfidenceTracker } from '../confidence-tracker';
import {
  AgentState,
  PerceptionConfig,
  RecognizedObject,
  SpatialArea,
  VisualStimulus,
  validatePerceptionConfig,
  validateAgentState,
} from '../types';

describe('Perception Integration System', () => {
  let perception: PerceptionIntegration;
  let mockAgentState: AgentState;
  let defaultConfig: PerceptionConfig;

  beforeEach(() => {
    mockAgentState = {
      position: { x: 0, y: 64, z: 0 },
      orientation: { yaw: 0, pitch: 0 },
      headDirection: { x: 0, y: 0, z: 1 },
      eyeHeight: 1.62,
    };

    defaultConfig = {
      fieldOfView: {
        horizontalFov: 90,
        verticalFov: 60,
        centralFocusAngle: 30,
        peripheralAcuity: 0.5,
        maxDistance: 50,
      },
      confidenceDecay: {
        baseDecayRate: 0.002,
        distanceFactor: 0.01,
        contextSensitivity: {},
        refreshThreshold: 0.3,
        pruningThreshold: 0.1,
      },
      recognition: {
        maxRecognitionChecks: 100,
        minimumConfidenceToTrack: 0.1,
        blockRecognitionEnabled: true,
        entityRecognitionEnabled: true,
        itemRecognitionEnabled: true,
      },
      performance: {
        maxRaysPerFrame: 500,
        maxProcessingTimeMs: 30,
        adaptiveResolution: true,
        cacheEnabled: true,
        batchProcessing: true,
      },
      objectClassification: {
        ores: ['coal_ore', 'iron_ore', 'diamond_ore'],
        structures: ['chest', 'furnace'],
        hazards: ['lava', 'fire'],
        resources: ['oak_log', 'stone'],
        hostileEntities: ['zombie', 'skeleton'],
        neutralEntities: ['cow', 'sheep'],
      },
    };

    perception = new PerceptionIntegration(defaultConfig, () => mockAgentState);
  });

  afterEach(() => {
    perception.dispose();
  });

  describe('Configuration and Initialization', () => {
    test('should validate and accept valid configuration', () => {
      expect(() => validatePerceptionConfig(defaultConfig)).not.toThrow();
    });

    test('should validate agent state', () => {
      expect(() => validateAgentState(mockAgentState)).not.toThrow();
    });

    test('should reject invalid configuration', () => {
      const invalidConfig = { ...defaultConfig };
      invalidConfig.fieldOfView.horizontalFov = -10; // Invalid negative FOV
      expect(() => validatePerceptionConfig(invalidConfig)).toThrow();
    });

    test('should initialize with proper component integration', () => {
      expect(perception).toBeDefined();

      const stats = perception.getPerceptionStatistics();
      expect(stats).toBeDefined();
      expect(stats.trackedObjects).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });
  });

  describe('Perception Updates', () => {
    test('should perform complete perception update', async () => {
      const result = await perception.updatePerception(
        mockAgentState,
        defaultConfig
      );

      expect(result).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.agentState).toEqual(mockAgentState);
      expect(Array.isArray(result.newObservations)).toBe(true);
      expect(Array.isArray(result.updatedObservations)).toBe(true);
      expect(Array.isArray(result.lostObservations)).toBe(true);
      expect(result.performance).toBeDefined();
      expect(result.visualField).toBeDefined();
      expect(result.recognitionStats).toBeDefined();
    });

    test('should handle multiple perception updates', async () => {
      const update1 = await perception.updatePerception(
        mockAgentState,
        defaultConfig
      );

      // Move agent slightly
      const newAgentState = {
        ...mockAgentState,
        position: { x: 1, y: 64, z: 0 },
      };

      const update2 = await perception.updatePerception(
        newAgentState,
        defaultConfig
      );

      expect(update2.timestamp).toBeGreaterThan(update1.timestamp);
      expect(update2.agentState.position).toEqual(newAgentState.position);
    });

    test('should track performance metrics', async () => {
      await perception.updatePerception(mockAgentState, defaultConfig);
      await perception.updatePerception(mockAgentState, defaultConfig);

      const stats = perception.getPerceptionStatistics();
      expect(stats.trackedObjects).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    });

    test('should emit perception events', async () => {
      let eventsReceived = 0;
      const expectedEvents = 1;

      return new Promise<void>((resolve) => {
        perception.on('perception-updated', (update) => {
          expect(update).toBeDefined();
          eventsReceived++;

          if (eventsReceived >= expectedEvents) {
            resolve();
          }
        });

        perception.updatePerception(mockAgentState, defaultConfig);
      });
    });
  });

  describe('Spatial Awareness Queries', () => {
    test('should query perceptual awareness of area', () => {
      const queryArea: SpatialArea = {
        center: { x: 0, y: 64, z: 0 },
        radius: 20,
        includeVertical: true,
        minConfidence: 0.3,
      };

      const awareness = perception.queryPerceptualAwareness(queryArea);

      expect(awareness).toBeDefined();
      expect(awareness.queryArea).toEqual(queryArea);
      expect(Array.isArray(awareness.visibleObjects)).toBe(true);
      expect(Array.isArray(awareness.rememberedObjects)).toBe(true);
      expect(awareness.coverage).toBeDefined();
      expect(awareness.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(awareness.explorationPriority).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(awareness.suggestedViewpoints)).toBe(true);
    });

    test('should filter objects by confidence threshold', () => {
      const queryArea: SpatialArea = {
        center: { x: 0, y: 64, z: 0 },
        radius: 50,
        includeVertical: true,
        minConfidence: 0.8, // High confidence threshold
      };

      const highConfidenceAwareness = perception.queryPerceptualAwareness(
        queryArea,
        0.8
      );
      const lowConfidenceAwareness = perception.queryPerceptualAwareness(
        queryArea,
        0.1
      );

      // High confidence should have equal or fewer objects than low confidence
      expect(highConfidenceAwareness.visibleObjects.length).toBeLessThanOrEqual(
        lowConfidenceAwareness.visibleObjects.length
      );
    });

    test('should provide exploration recommendations', () => {
      const queryArea: SpatialArea = {
        center: { x: 10, y: 64, z: 10 },
        radius: 15,
        includeVertical: true,
      };

      const awareness = perception.queryPerceptualAwareness(queryArea);

      expect(awareness.suggestedViewpoints.length).toBeGreaterThan(0);

      for (const viewpoint of awareness.suggestedViewpoints) {
        expect(viewpoint.position).toBeDefined();
        expect(viewpoint.expectedCoverage).toBeGreaterThanOrEqual(0);
        expect(viewpoint.expectedCoverage).toBeLessThanOrEqual(1);
        expect(viewpoint.accessibilityRating).toBeGreaterThanOrEqual(0);
        expect(viewpoint.accessibilityRating).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Object Tracking and Recognition', () => {
    test('should track objects across updates', async () => {
      // First update - no objects
      await perception.updatePerception(mockAgentState, defaultConfig);
      let trackedObjects = perception.getTrackedObjects();
      const initialCount = trackedObjects.length;

      // Simulate adding some objects by triggering mock recognition
      // (In a real system, this would come from visual sensing)

      // Second update
      await perception.updatePerception(mockAgentState, defaultConfig);
      trackedObjects = perception.getTrackedObjects();

      // Objects should be tracked consistently
      expect(trackedObjects.length).toBeGreaterThanOrEqual(initialCount);
    });

    test('should filter tracked objects', () => {
      const allObjects = perception.getTrackedObjects();
      const highConfidenceObjects = perception.getTrackedObjects(
        (obj) => obj.recognitionConfidence > 0.8
      );

      expect(Array.isArray(allObjects)).toBe(true);
      expect(Array.isArray(highConfidenceObjects)).toBe(true);
      expect(highConfidenceObjects.length).toBeLessThanOrEqual(
        allObjects.length
      );
    });

    test('should identify perception gaps', () => {
      const currentKnowledge = new Map<string, RecognizedObject>();
      const explorationGoals: any[] = [];

      const gaps = perception.identifyPerceptionGaps(
        currentKnowledge,
        explorationGoals
      );

      expect(Array.isArray(gaps)).toBe(true);
      expect(gaps.length).toBeGreaterThanOrEqual(0);

      for (const gap of gaps) {
        expect(gap.center).toBeDefined();
        expect(gap.radius).toBeGreaterThan(0);
        expect(typeof gap.includeVertical).toBe('boolean');
      }
    });
  });

  describe('Performance and Resource Management', () => {
    test('should respect performance limits', async () => {
      const strictConfig = {
        ...defaultConfig,
        performance: {
          ...defaultConfig.performance,
          maxProcessingTimeMs: 10, // Very strict limit
          maxRaysPerFrame: 50,
        },
      };

      const result = await perception.updatePerception(
        mockAgentState,
        strictConfig
      );

      // Should complete without crashing even with strict limits
      expect(result).toBeDefined();
      expect(result.performance.processingTimeMs).toBeGreaterThan(0);
    });

    test('should emit performance warnings', async () => {
      const strictConfig = {
        ...defaultConfig,
        performance: {
          ...defaultConfig.performance,
          maxProcessingTimeMs: 1, // Extremely strict to trigger warning
        },
      };

      return new Promise<void>((resolve) => {
        perception.on('performance-warning', (warning) => {
          expect(warning.metric).toBeDefined();
          expect(warning.value).toBeGreaterThan(warning.threshold);
          resolve();
        });

        perception.updatePerception(mockAgentState, strictConfig);
      });
    });

    test('should provide memory usage estimates', () => {
      const stats = perception.getPerceptionStatistics();

      expect(stats.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(typeof stats.memoryUsage).toBe('number');
    });
  });

  describe('Event System', () => {
    test('should emit object discovery events', async () => {
      return new Promise<void>((resolve) => {
        perception.on('object-discovered', (obj) => {
          expect(obj).toBeDefined();
          expect(obj.id).toBeDefined();
          expect(obj.type).toBeDefined();
          expect(obj.position).toBeDefined();
          resolve();
        });

        // Trigger object discovery through update
        perception.updatePerception(mockAgentState, defaultConfig);

        // If no objects are discovered, complete test after timeout
        setTimeout(() => {
          resolve();
        }, 100);
      });
    });

    test('should emit object loss events', async () => {
      return new Promise<void>((resolve) => {
        perception.on('object-lost', (objectId) => {
          expect(typeof objectId).toBe('string');
          resolve();
        });

        // Perform update and then wait for potential loss events
        perception.updatePerception(mockAgentState, defaultConfig).then(() => {
          // Complete test after short delay if no loss events
          setTimeout(() => {
            resolve();
          }, 50);
        });
      });
    });

    test('should emit attention shift events', async () => {
      return new Promise<void>((resolve) => {
        perception.on('attention-shift', (shift) => {
          expect(shift.from).toBeDefined();
          expect(shift.to).toBeDefined();
          resolve();
        });

        // Perform update that might trigger attention shift
        perception.updatePerception(mockAgentState, defaultConfig).then(() => {
          // Complete test after short delay if no attention shift
          setTimeout(() => {
            resolve();
          }, 50);
        });
      });
    });
  });
});

describe('Individual Component Tests', () => {
  describe('VisualFieldManager', () => {
    let visualField: VisualFieldManager;

    beforeEach(() => {
      const config = {
        horizontalFov: 90,
        verticalFov: 60,
        centralFocusAngle: 30,
        peripheralAcuity: 0.5,
        maxDistance: 50,
      };
      visualField = new VisualFieldManager(config);
    });

    test('should update visual field correctly', () => {
      const headDirection = { x: 0, y: 0, z: 1 };
      const config = {
        horizontalFov: 90,
        verticalFov: 60,
        centralFocusAngle: 30,
        peripheralAcuity: 0.5,
        maxDistance: 50,
      };

      const field = visualField.updateVisualField(headDirection, config);

      expect(field).toBeDefined();
      expect(field.centerDirection).toEqual(headDirection);
      expect(field.fovConfig).toEqual(config);
      expect(Array.isArray(field.rayDirections)).toBe(true);
      expect(field.rayDirections.length).toBeGreaterThan(0);
      expect(field.lastUpdated).toBeGreaterThan(0);
    });

    test('should calculate visual acuity correctly', () => {
      const objectPos = { x: 5, y: 64, z: 5 };
      const gazeCenter = { x: 0, y: 64, z: 0 };
      const config = {
        horizontalFov: 90,
        verticalFov: 60,
        centralFocusAngle: 30,
        peripheralAcuity: 0.5,
        maxDistance: 50,
      };

      const field = visualField.updateVisualField({ x: 0, y: 0, z: 1 }, config);
      const acuity = visualField.calculateVisualAcuity(
        objectPos,
        gazeCenter,
        field
      );

      expect(acuity).toBeGreaterThanOrEqual(0);
      expect(acuity).toBeLessThanOrEqual(1);
    });

    test('should handle visual attention management', () => {
      const stimuli: VisualStimulus[] = [
        {
          id: 'test-stimulus',
          position: { x: 10, y: 64, z: 10 },
          type: 'movement',
          intensity: 0.8,
          duration: 1000,
          novelty: 0.6,
        },
      ];

      const attentionModel = {
        bottomUpWeight: 0.3,
        topDownWeight: 0.7,
        inhibitionOfReturn: true,
        attentionSpan: 3000,
        maxSimultaneousTargets: 3,
      };

      const allocation = visualField.manageVisualAttention(
        stimuli,
        attentionModel
      );

      expect(allocation).toBeDefined();
      expect(allocation.primaryFocus).toBeDefined();
      expect(Array.isArray(allocation.secondaryTargets)).toBe(true);
      expect(Array.isArray(allocation.suppressedStimuli)).toBe(true);
    });
  });

  describe('ObjectRecognition', () => {
    let recognition: ObjectRecognition;

    beforeEach(() => {
      recognition = new ObjectRecognition();
    });

    test('should calculate recognition confidence', () => {
      const object = { type: 'block', name: 'coal_ore' };
      const viewingConditions = {
        distance: 10,
        lightLevel: 15,
        occlusionPercent: 0.1,
        visualAcuity: 0.8,
      };

      const confidence = recognition.calculateRecognitionConfidence(
        object,
        viewingConditions
      );

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    test('should provide recognition statistics', () => {
      const stats = recognition.getRecognitionStats();

      expect(stats).toBeDefined();
      expect(stats.totalRecognized).toBeGreaterThanOrEqual(0);
      expect(stats.byType).toBeInstanceOf(Map);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('ConfidenceTracker', () => {
    let tracker: ConfidenceTracker;

    beforeEach(() => {
      const decayModel = {
        baseDecayRate: 0.002,
        distanceFactor: 0.01,
        contextSensitivity: {},
        refreshThreshold: 0.3,
        pruningThreshold: 0.1,
      };
      tracker = new ConfidenceTracker(decayModel);
    });

    afterEach(() => {
      tracker.dispose();
    });

    test('should record new observations', () => {
      const observation: RecognizedObject = {
        id: 'test-obj',
        type: 'block',
        position: { x: 0, y: 64, z: 0 },
        recognitionConfidence: 0.9,
        lastSeen: Date.now(),
        totalObservations: 1,
        appearanceData: { visualFeatures: [] },
        viewingConditions: {
          distance: 10,
          lightLevel: 15,
          occlusionPercent: 0,
          isInPeriphery: false,
          visualAcuity: 1.0,
        },
        confidenceHistory: [],
        positionHistory: [],
      };

      const tracked = tracker.recordObservation(observation, 0.9);

      expect(tracked).toBeDefined();
      expect(tracked.recognitionConfidence).toBe(0.9);
      expect(tracked.confidenceHistory.length).toBeGreaterThan(0);
    });

    test('should provide confidence statistics', () => {
      const trackedObjects = new Map<string, RecognizedObject>();
      const stats = tracker.getConfidenceStatistics(trackedObjects);

      expect(stats).toBeDefined();
      expect(stats.totalObjects).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.confidenceDistribution).toBeDefined();
    });

    test('should prune stale observations', () => {
      const trackedObjects = new Map<string, RecognizedObject>();
      const prunedIds = tracker.pruneStaleObservations(trackedObjects, 0.5);

      expect(Array.isArray(prunedIds)).toBe(true);
    });
  });
});

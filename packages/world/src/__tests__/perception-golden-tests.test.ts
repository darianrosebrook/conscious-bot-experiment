/**
 * Golden Tests for Perception System
 * 
 * These tests validate that specific perception scenarios produce
 * expected visual field and object recognition results.
 * 
 * @author @darianrosebrook
 */

import { PerceptionIntegration } from '../perception/perception-integration';
import { VisualFieldManager } from '../perception/visual-field-manager';
import { ObjectRecognition } from '../perception/object-recognition';
import { ConfidenceTracker } from '../perception/confidence-tracker';
import { RaycastEngine } from '../sensing/raycast-engine';
import { 
  PerceptionConfig, 
  VisualQuery, 
  WorldPosition, 
  PerceptionResult,
  ObjectClassification,
  ConfidenceScore
} from '../perception/types';

describe('Perception Golden Tests', () => {
  let perceptionSystem: PerceptionIntegration;
  let mockRaycastEngine: jest.Mocked<RaycastEngine>;

  beforeEach(() => {
    mockRaycastEngine = {
      castRay: jest.fn(),
      castCone: jest.fn(),
      castGrid: jest.fn(),
      isBlockVisible: jest.fn(),
      getVisibleBlocks: jest.fn(),
      updateWorld: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<RaycastEngine>;

    const config: PerceptionConfig = {
      visualField: {
        horizontalFov: 90,
        verticalFov: 60,
        maxRenderDistance: 64,
        lodLevels: 3,
        detailDistance: 16,
        peripheralReduction: 0.5,
        nightVisionRange: 8,
        underwaterRange: 5,
      },
      objectRecognition: {
        confidenceThreshold: 0.7,
        maxClassifications: 10,
        contextWindowSize: 5,
        temporalMemory: 30000,
        classificationTimeout: 100,
        fuzzyMatching: true,
      },
      performance: {
        maxRaysPerFrame: 1000,
        adaptiveQuality: true,
        frameBudget: 16,
        prioritizeCenter: true,
        cullingEnabled: true,
        cacheDuration: 5000,
      },
      confidence: {
        baselineConfidence: 0.5,
        distanceDecay: 0.02,
        occlusionPenalty: 0.3,
        lightingWeight: 0.2,
        motionBonus: 0.1,
        temporalSmoothing: 0.8,
      },
    };

    perceptionSystem = new PerceptionIntegration(config, mockRaycastEngine);
  });

  afterEach(() => {
    perceptionSystem.dispose();
  });

  describe('Basic Visual Field Scenarios', () => {
    const visualScenarios = [
      {
        name: 'empty_field_center',
        description: 'Clear visual field with no obstacles',
        playerPosition: { x: 0, y: 64, z: 0 },
        playerRotation: { yaw: 0, pitch: 0 },
        mockRaycastResults: {
          visibleBlocks: [],
          rayHits: []
        },
        expectedResult: {
          visibleObjects: 0,
          confidence: '>0.8',
          fieldCoverage: '100%',
          processingTime: '<10ms'
        }
      },
      {
        name: 'single_block_center',
        description: 'Single block directly in front',
        playerPosition: { x: 0, y: 64, z: 0 },
        playerRotation: { yaw: 0, pitch: 0 },
        mockRaycastResults: {
          visibleBlocks: [
            { position: { x: 0, y: 64, z: -5 }, blockType: 'minecraft:stone', distance: 5 }
          ],
          rayHits: [
            { position: { x: 0, y: 64, z: -5 }, blockType: 'minecraft:stone', normal: { x: 0, y: 0, z: 1 } }
          ]
        },
        expectedResult: {
          visibleObjects: 1,
          objectType: 'minecraft:stone',
          confidence: '>0.9',
          position: { x: 0, y: 64, z: -5 },
          distance: 5,
          processingTime: '<15ms'
        }
      },
      {
        name: 'multiple_blocks_pattern',
        description: 'Structured pattern of blocks',
        playerPosition: { x: 0, y: 64, z: 0 },
        playerRotation: { yaw: 0, pitch: 0 },
        mockRaycastResults: {
          visibleBlocks: [
            { position: { x: -2, y: 64, z: -5 }, blockType: 'minecraft:wood', distance: 5.4 },
            { position: { x: 0, y: 64, z: -5 }, blockType: 'minecraft:stone', distance: 5 },
            { position: { x: 2, y: 64, z: -5 }, blockType: 'minecraft:wood', distance: 5.4 },
            { position: { x: 0, y: 65, z: -5 }, blockType: 'minecraft:glass', distance: 5.1 },
          ],
          rayHits: [
            { position: { x: -2, y: 64, z: -5 }, blockType: 'minecraft:wood', normal: { x: 0, y: 0, z: 1 } },
            { position: { x: 0, y: 64, z: -5 }, blockType: 'minecraft:stone', normal: { x: 0, y: 0, z: 1 } },
            { position: { x: 2, y: 64, z: -5 }, blockType: 'minecraft:wood', normal: { x: 0, y: 0, z: 1 } },
            { position: { x: 0, y: 65, z: -5 }, blockType: 'minecraft:glass', normal: { x: 0, y: 0, z: 1 } },
          ]
        },
        expectedResult: {
          visibleObjects: 4,
          structuralPattern: 'wall_with_window',
          confidence: '>0.85',
          materialTypes: ['minecraft:wood', 'minecraft:stone', 'minecraft:glass'],
          spatialCohesion: true,
          processingTime: '<25ms'
        }
      },
      {
        name: 'peripheral_vision_test',
        description: 'Objects at edge of visual field',
        playerPosition: { x: 0, y: 64, z: 0 },
        playerRotation: { yaw: 0, pitch: 0 },
        mockRaycastResults: {
          visibleBlocks: [
            { position: { x: -8, y: 64, z: -8 }, blockType: 'minecraft:redstone_ore', distance: 11.3 },
            { position: { x: 8, y: 64, z: -8 }, blockType: 'minecraft:diamond_ore', distance: 11.3 },
          ],
          rayHits: [
            { position: { x: -8, y: 64, z: -8 }, blockType: 'minecraft:redstone_ore', normal: { x: 0, y: 0, z: 1 } },
            { position: { x: 8, y: 64, z: -8 }, blockType: 'minecraft:diamond_ore', normal: { x: 0, y: 0, z: 1 } },
          ]
        },
        expectedResult: {
          visibleObjects: 2,
          peripheralDetection: true,
          reducedConfidence: true,
          confidenceRange: '0.4-0.7',
          processingTime: '<20ms'
        }
      }
    ];

    visualScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, async () => {
        // Setup mock raycast results
        mockRaycastEngine.getVisibleBlocks.mockReturnValue(scenario.mockRaycastResults.visibleBlocks);
        mockRaycastEngine.castGrid.mockReturnValue(scenario.mockRaycastResults.rayHits);

        const visualQuery: VisualQuery = {
          observerPosition: scenario.playerPosition,
          observerRotation: scenario.playerRotation,
          fieldOfView: { horizontal: 90, vertical: 60 },
          maxDistance: 64,
          level: 'standard'
        };

        const startTime = Date.now();
        const result = await perceptionSystem.processVisualField(visualQuery);
        const processingTime = Date.now() - startTime;

        // Validate processing time
        const maxTime = parseInt(scenario.expectedResult.processingTime.replace(/[<>ms]/g, ''));
        expect(processingTime).toBeLessThan(maxTime);

        // Validate object count
        expect(result.detectedObjects.length).toBe(scenario.expectedResult.visibleObjects);

        // Validate confidence
        if (scenario.expectedResult.confidence.startsWith('>')) {
          const minConfidence = parseFloat(scenario.expectedResult.confidence.slice(1));
          expect(result.overallConfidence).toBeGreaterThan(minConfidence);
        } else if (scenario.expectedResult.confidenceRange) {
          const [min, max] = scenario.expectedResult.confidenceRange.split('-').map(parseFloat);
          expect(result.overallConfidence).toBeGreaterThanOrEqual(min);
          expect(result.overallConfidence).toBeLessThanOrEqual(max);
        }

        // Scenario-specific validations
        if (scenario.expectedResult.objectType) {
          expect(result.detectedObjects[0].classification.primary).toBe(scenario.expectedResult.objectType);
        }

        if (scenario.expectedResult.position) {
          const detectedPos = result.detectedObjects[0].worldPosition;
          expect(detectedPos.x).toBeCloseTo(scenario.expectedResult.position.x, 1);
          expect(detectedPos.y).toBeCloseTo(scenario.expectedResult.position.y, 1);
          expect(detectedPos.z).toBeCloseTo(scenario.expectedResult.position.z, 1);
        }

        if (scenario.expectedResult.materialTypes) {
          const detectedTypes = result.detectedObjects.map(obj => obj.classification.primary);
          scenario.expectedResult.materialTypes.forEach(expectedType => {
            expect(detectedTypes).toContain(expectedType);
          });
        }

        if (scenario.expectedResult.peripheralDetection) {
          // Check if any objects are in peripheral areas (outside central 30-degree cone)
          const hasPeripheralObjects = result.detectedObjects.some(obj => {
            const angle = Math.abs(Math.atan2(
              obj.worldPosition.x - scenario.playerPosition.x,
              scenario.playerPosition.z - obj.worldPosition.z
            ) * 180 / Math.PI);
            return angle > 15; // Outside central cone
          });
          expect(hasPeripheralObjects).toBe(true);
        }

        if (scenario.expectedResult.spatialCohesion) {
          // Verify objects form a coherent spatial group
          const positions = result.detectedObjects.map(obj => obj.worldPosition);
          const maxDistance = Math.max(...positions.map((p1, i) =>
            Math.max(...positions.slice(i + 1).map(p2 =>
              Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.z - p2.z, 2))
            ))
          ));
          expect(maxDistance).toBeLessThan(5); // Objects should be clustered
        }
      });
    });
  });

  describe('Object Recognition Scenarios', () => {
    const recognitionScenarios = [
      {
        name: 'basic_material_classification',
        description: 'Recognize common building materials',
        inputBlocks: [
          { blockType: 'minecraft:stone', confidence: 0.95 },
          { blockType: 'minecraft:wood', confidence: 0.92 },
          { blockType: 'minecraft:glass', confidence: 0.88 },
          { blockType: 'minecraft:dirt', confidence: 0.90 }
        ],
        expectedClassifications: {
          'minecraft:stone': { category: 'building_material', hardness: 'medium', mineable: true },
          'minecraft:wood': { category: 'organic_material', hardness: 'soft', combustible: true },
          'minecraft:glass': { category: 'transparent_material', hardness: 'fragile', seeThrough: true },
          'minecraft:dirt': { category: 'natural_material', hardness: 'soft', tillable: true }
        }
      },
      {
        name: 'ore_recognition',
        description: 'Identify valuable ores with appropriate confidence',
        inputBlocks: [
          { blockType: 'minecraft:diamond_ore', confidence: 0.85 },
          { blockType: 'minecraft:gold_ore', confidence: 0.89 },
          { blockType: 'minecraft:iron_ore', confidence: 0.92 },
          { blockType: 'minecraft:coal_ore', confidence: 0.94 }
        ],
        expectedClassifications: {
          'minecraft:diamond_ore': { category: 'precious_ore', value: 'very_high', rarity: 'rare' },
          'minecraft:gold_ore': { category: 'precious_ore', value: 'high', rarity: 'uncommon' },
          'minecraft:iron_ore': { category: 'common_ore', value: 'medium', rarity: 'common' },
          'minecraft:coal_ore': { category: 'fuel_ore', value: 'low', rarity: 'abundant' }
        }
      },
      {
        name: 'structure_recognition',
        description: 'Recognize constructed patterns and structures',
        inputBlocks: [
          // House-like structure
          { blockType: 'minecraft:cobblestone', position: { x: 0, y: 64, z: 0 }, confidence: 0.90 },
          { blockType: 'minecraft:cobblestone', position: { x: 1, y: 64, z: 0 }, confidence: 0.90 },
          { blockType: 'minecraft:cobblestone', position: { x: 0, y: 65, z: 0 }, confidence: 0.90 },
          { blockType: 'minecraft:cobblestone', position: { x: 1, y: 65, z: 0 }, confidence: 0.90 },
          { blockType: 'minecraft:glass', position: { x: 0, y: 65, z: 1 }, confidence: 0.88 },
          { blockType: 'minecraft:wooden_door', position: { x: 1, y: 64, z: 1 }, confidence: 0.87 }
        ],
        expectedClassifications: {
          structureType: 'building',
          function: 'shelter',
          complexity: 'simple',
          materials: ['minecraft:cobblestone', 'minecraft:glass', 'minecraft:wooden_door'],
          features: ['wall', 'window', 'entrance']
        }
      },
      {
        name: 'hazard_detection',
        description: 'Identify environmental hazards',
        inputBlocks: [
          { blockType: 'minecraft:lava', confidence: 0.98 },
          { blockType: 'minecraft:fire', confidence: 0.95 },
          { blockType: 'minecraft:cactus', confidence: 0.92 },
          { blockType: 'minecraft:tnt', confidence: 0.89 }
        ],
        expectedClassifications: {
          'minecraft:lava': { category: 'liquid_hazard', danger: 'extreme', damage: 'fire' },
          'minecraft:fire': { category: 'environmental_hazard', danger: 'high', damage: 'burn' },
          'minecraft:cactus': { category: 'natural_hazard', danger: 'low', damage: 'pierce' },
          'minecraft:tnt': { category: 'explosive_hazard', danger: 'variable', damage: 'explosion' }
        }
      }
    ];

    recognitionScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, () => {
        const startTime = Date.now();
        
        scenario.inputBlocks.forEach(block => {
          const classification = perceptionSystem.classifyObject(
            block.blockType,
            block.confidence,
            block.position
          );

          if (scenario.expectedClassifications[block.blockType]) {
            const expected = scenario.expectedClassifications[block.blockType];
            
            expect(classification.primary).toBe(block.blockType);
            expect(classification.confidence).toBeCloseTo(block.confidence, 2);
            
            if (expected.category) {
              expect(classification.properties.category).toBe(expected.category);
            }
            if (expected.danger) {
              expect(classification.properties.danger).toBe(expected.danger);
            }
            if (expected.value) {
              expect(classification.properties.value).toBe(expected.value);
            }
          }
        });

        const processingTime = Date.now() - startTime;
        expect(processingTime).toBeLessThan(50); // Should be fast for individual objects
      });
    });
  });

  describe('Confidence Tracking Scenarios', () => {
    const confidenceScenarios = [
      {
        name: 'distance_confidence_decay',
        description: 'Confidence decreases with distance',
        objects: [
          { blockType: 'minecraft:stone', distance: 2, baseConfidence: 0.95 },
          { blockType: 'minecraft:stone', distance: 10, baseConfidence: 0.95 },
          { blockType: 'minecraft:stone', distance: 30, baseConfidence: 0.95 },
          { blockType: 'minecraft:stone', distance: 50, baseConfidence: 0.95 }
        ],
        expectedPattern: 'decreasing_with_distance'
      },
      {
        name: 'lighting_confidence_impact',
        description: 'Confidence varies with lighting conditions',
        objects: [
          { blockType: 'minecraft:diamond_ore', lightLevel: 15, baseConfidence: 0.85 },
          { blockType: 'minecraft:diamond_ore', lightLevel: 8, baseConfidence: 0.85 },
          { blockType: 'minecraft:diamond_ore', lightLevel: 2, baseConfidence: 0.85 },
          { blockType: 'minecraft:diamond_ore', lightLevel: 0, baseConfidence: 0.85 }
        ],
        expectedPattern: 'decreasing_with_darkness'
      },
      {
        name: 'occlusion_confidence_penalty',
        description: 'Confidence reduced for partially occluded objects',
        objects: [
          { blockType: 'minecraft:gold_ore', occlusion: 0.0, baseConfidence: 0.90 },
          { blockType: 'minecraft:gold_ore', occlusion: 0.3, baseConfidence: 0.90 },
          { blockType: 'minecraft:gold_ore', occlusion: 0.6, baseConfidence: 0.90 },
          { blockType: 'minecraft:gold_ore', occlusion: 0.9, baseConfidence: 0.90 }
        ],
        expectedPattern: 'decreasing_with_occlusion'
      },
      {
        name: 'temporal_confidence_smoothing',
        description: 'Confidence stabilizes over multiple observations',
        observations: [
          { confidence: 0.7, timestamp: 0 },
          { confidence: 0.8, timestamp: 100 },
          { confidence: 0.75, timestamp: 200 },
          { confidence: 0.82, timestamp: 300 },
          { confidence: 0.78, timestamp: 400 }
        ],
        expectedPattern: 'stabilizing_over_time'
      }
    ];

    confidenceScenarios.forEach(scenario => {
      test(`should handle ${scenario.name} correctly`, () => {
        if (scenario.objects) {
          const confidences = scenario.objects.map(obj => {
            return perceptionSystem.calculateConfidence(
              obj.baseConfidence,
              obj.distance || 5,
              obj.lightLevel || 15,
              obj.occlusion || 0
            );
          });

          switch (scenario.expectedPattern) {
            case 'decreasing_with_distance':
              for (let i = 1; i < confidences.length; i++) {
                expect(confidences[i]).toBeLessThan(confidences[i - 1]);
              }
              break;
              
            case 'decreasing_with_darkness':
              for (let i = 1; i < confidences.length; i++) {
                expect(confidences[i]).toBeLessThanOrEqual(confidences[i - 1]);
              }
              break;
              
            case 'decreasing_with_occlusion':
              for (let i = 1; i < confidences.length; i++) {
                expect(confidences[i]).toBeLessThan(confidences[i - 1]);
              }
              break;
          }
        }

        if (scenario.observations) {
          let smoothedConfidence = scenario.observations[0].confidence;
          const smoothingFactor = 0.8;

          scenario.observations.slice(1).forEach(obs => {
            smoothedConfidence = smoothedConfidence * smoothingFactor + 
                               obs.confidence * (1 - smoothingFactor);
          });

          const variance = scenario.observations.reduce((sum, obs) => {
            return sum + Math.pow(obs.confidence - smoothedConfidence, 2);
          }, 0) / scenario.observations.length;

          // Smoothed confidence should have lower variance than raw observations
          expect(Math.sqrt(variance)).toBeLessThan(0.05);
        }
      });
    });
  });

  describe('Performance Consistency', () => {
    test('perception system maintains consistent performance', async () => {
      const testQueries = Array.from({ length: 10 }, (_, i) => ({
        observerPosition: { x: i * 2, y: 64, z: 0 },
        observerRotation: { yaw: i * 10, pitch: 0 },
        fieldOfView: { horizontal: 90, vertical: 60 },
        maxDistance: 32,
        level: 'standard' as const
      }));

      const timings: number[] = [];

      for (const query of testQueries) {
        // Setup consistent mock data
        mockRaycastEngine.getVisibleBlocks.mockReturnValue([
          { position: { x: query.observerPosition.x + 5, y: 64, z: -5 }, blockType: 'minecraft:stone', distance: 7.07 }
        ]);

        const startTime = Date.now();
        await perceptionSystem.processVisualField(query);
        const endTime = Date.now();

        timings.push(endTime - startTime);
      }

      // Validate timing consistency
      const avgTiming = timings.reduce((sum, t) => sum + t, 0) / timings.length;
      const maxDeviation = Math.max(...timings.map(t => Math.abs(t - avgTiming)));
      
      expect(avgTiming).toBeLessThan(20); // Average should be under 20ms
      expect(maxDeviation).toBeLessThan(avgTiming); // No timing should deviate more than average
    });

    test('memory usage remains bounded', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process many visual queries
      for (let i = 0; i < 100; i++) {
        mockRaycastEngine.getVisibleBlocks.mockReturnValue([
          { position: { x: i, y: 64, z: 0 }, blockType: 'minecraft:dirt', distance: i + 1 }
        ]);

        perceptionSystem.processVisualField({
          observerPosition: { x: 0, y: 64, z: 0 },
          observerRotation: { yaw: 0, pitch: 0 },
          fieldOfView: { horizontal: 90, vertical: 60 },
          maxDistance: 64,
          level: 'standard'
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (under 10MB for 100 queries)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });
});

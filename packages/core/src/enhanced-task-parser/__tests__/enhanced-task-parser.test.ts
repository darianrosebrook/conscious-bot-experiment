/**
 * Enhanced Task Parser Tests
 *
 * Comprehensive test suite for the Enhanced Task Parser module,
 * covering task parsing, validation, feasibility checking, and
 * environmental immersion capabilities.
 *
 * @author @darianrosebrook
 */

import { TaskParser } from '../task-parser';
import { EnvironmentalImmersion } from '../environmental-immersion';
import {
  TaskDefinition,
  EnvironmentalContext,
  TaskValidationResult,
  TaskFeasibility,
  TaskParsingResult,
  DEFAULT_TASK_PARSER_CONFIG,
  TaskParserError,
} from '../types';

describe('Enhanced Task Parser', () => {
  let taskParser: TaskParser;
  let environmentalImmersion: EnvironmentalImmersion;

  beforeEach(() => {
    taskParser = new TaskParser();
    environmentalImmersion = new EnvironmentalImmersion();
  });

  afterEach(() => {
    taskParser.clearTaskHistory();
    environmentalImmersion.clearHistory();
  });

  describe('TaskParser', () => {
    describe('parseLLMOutput', () => {
      it('should parse JSON task definition correctly', async () => {
        const llmOutput = JSON.stringify({
          type: 'gathering',
          parameters: {
            resource: 'cobblestone',
            quantity: 64,
            location: 'nearest_surface',
            tool_required: 'pickaxe',
          },
          priority: 0.8,
          safety_level: 'safe',
          estimated_duration: 300000,
        });

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {
            pickaxe: {
              available: true,
              quantity: 1,
              location: 'inventory',
              last_seen: Date.now(),
              confidence: 1.0,
            },
            cobblestone: {
              available: true,
              quantity: 0,
              location: 'nearby',
              last_seen: Date.now(),
              confidence: 0.8,
            },
          },
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.parseLLMOutput(
          llmOutput,
          environmentalContext
        );

        expect(result.task.type).toBe('gathering');
        expect(result.task.parameters.resource).toBe('cobblestone');
        expect(result.task.parameters.quantity).toBe(64);
        expect(result.task.priority).toBe(0.8);
        expect(result.task.safety_level).toBe('safe');
        expect(result.validation.is_valid).toBe(true);
        expect(result.feasibility.is_feasible).toBe(true);
      });

      it('should parse natural language task description', async () => {
        const llmOutput =
          'I need to gather 32 cobblestone urgently for building a shelter';

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.parseLLMOutput(
          llmOutput,
          environmentalContext
        );

        expect(result.task.type).toBe('gathering');
        // The regex should extract "32" as quantity and "cobblestone" as resource
        expect(result.task.parameters.quantity).toBe(32);
        expect(result.task.parameters.resource).toBe('cobblestone');
        expect(result.task.priority).toBeGreaterThan(0.5); // Should detect urgency
      });

      it('should handle invalid LLM output gracefully', async () => {
        const llmOutput = 'invalid json {';

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        // Should still parse as exploration task even with invalid JSON
        const result = await taskParser.parseLLMOutput(
          llmOutput,
          environmentalContext
        );
        expect(result.task.type).toBe('exploration');
      });
    });

    describe('validateTask', () => {
      it('should validate gathering task correctly', async () => {
        const task: TaskDefinition = {
          id: 'test-task',
          type: 'gathering',
          parameters: {
            resource: 'cobblestone',
            quantity: 64,
            tool_required: 'pickaxe',
          },
          priority: 0.8,
          safety_level: 'safe',
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {
            pickaxe: {
              available: true,
              quantity: 1,
              location: 'inventory',
              last_seen: Date.now(),
              confidence: 1.0,
            },
          },
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.validateTask(
          task,
          environmentalContext
        );

        expect(result.is_valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should detect missing required parameters', async () => {
        const task: TaskDefinition = {
          id: 'test-task',
          type: 'gathering',
          parameters: {},
          priority: 0.8,
          safety_level: 'safe',
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.validateTask(
          task,
          environmentalContext
        );

        expect(result.is_valid).toBe(false);
        expect(result.errors).toContain(
          'Gathering task requires a resource parameter'
        );
        expect(result.confidence).toBeLessThan(0.8);
      });

      it('should warn about night time outdoor activities', async () => {
        const task: TaskDefinition = {
          id: 'test-task',
          type: 'gathering',
          parameters: {
            resource: 'cobblestone',
            quantity: 64,
          },
          priority: 0.8,
          safety_level: 'safe',
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'night',
          weather: 'clear',
          biome: 'plains',
          light_level: 5,
          threat_level: 0.3,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.validateTask(
          task,
          environmentalContext
        );

        expect(result.warnings).toContain(
          'Performing outdoor task at night may be dangerous'
        );
        expect(result.suggestions).toContain(
          'Consider waiting until day or using torches'
        );
      });
    });

    describe('checkFeasibility', () => {
      it('should check resource availability', async () => {
        const task: TaskDefinition = {
          id: 'test-task',
          type: 'gathering',
          parameters: {
            resource: 'diamond',
            tool_required: 'diamond_pickaxe',
          },
          priority: 0.8,
          safety_level: 'safe',
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {
            stone_pickaxe: {
              available: true,
              quantity: 1,
              location: 'inventory',
              last_seen: Date.now(),
              confidence: 1.0,
            },
          },
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.checkFeasibility(
          task,
          environmentalContext
        );

        expect(result.is_feasible).toBe(false);
        expect(result.missing_resources).toContain('diamond_pickaxe');
        expect(result.confidence).toBeLessThan(0.7);
      });

      it('should assess environmental constraints', async () => {
        const task: TaskDefinition = {
          id: 'test-task',
          type: 'gathering',
          parameters: {
            resource: 'cobblestone',
            quantity: 64,
          },
          priority: 0.8,
          safety_level: 'safe',
          created_at: Date.now(),
          updated_at: Date.now(),
        };

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'night',
          weather: 'storm',
          biome: 'plains',
          light_level: 3,
          threat_level: 0.9,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const result = await taskParser.checkFeasibility(
          task,
          environmentalContext
        );

        expect(result.environmental_constraints).toContain(
          'Night time reduces visibility and safety'
        );
        expect(result.risk_assessment.factors).toContain(
          'Hostile mobs are more active at night'
        );
        expect(result.risk_assessment.level).toBe('dangerous');
      });
    });

    describe('performance metrics', () => {
      it('should track performance metrics correctly', async () => {
        const llmOutput = JSON.stringify({
          type: 'gathering',
          parameters: { resource: 'cobblestone', quantity: 64 },
          priority: 0.8,
          safety_level: 'safe',
        });

        const environmentalContext: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.1,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        await taskParser.parseLLMOutput(llmOutput, environmentalContext);

        const metrics = taskParser.getPerformanceMetrics();
        expect(metrics.parsing_time).toBeGreaterThan(0);
        expect(metrics.validation_time).toBeGreaterThan(0);
        expect(metrics.feasibility_time).toBeGreaterThan(0);
      });
    });
  });

  describe('EnvironmentalImmersion', () => {
    describe('updateContext', () => {
      it('should update environmental context from world state', () => {
        const worldState = {
          time: 6000, // Dusk
          weather: 'clear',
          biome: 'forest',
          light_level: 10,
          position: { x: 100, y: 64, z: 200 },
          entities: [
            {
              id: 'zombie-1',
              type: 'zombie',
              position: { x: 102, y: 64, z: 200 },
              is_hostile: true,
              health: 20,
            },
          ],
          inventory: [
            { name: 'stone_pickaxe', quantity: 1 },
            { name: 'torch', quantity: 16 },
          ],
          nearby_blocks: [
            { type: 'stone', position: { x: 101, y: 63, z: 200 } },
          ],
          chat_messages: [
            {
              sender: 'Player1',
              content: 'Hello there!',
              timestamp: Date.now(),
            },
          ],
        };

        const context = environmentalImmersion.updateContext(worldState);

        expect(context.time_of_day).toBe('dusk');
        expect(context.weather).toBe('clear');
        expect(context.biome).toBe('forest');
        expect(context.light_level).toBe(10);
        expect(context.threat_level).toBeGreaterThan(0);
        expect(context.nearby_entities).toHaveLength(1);
        expect(context.nearby_entities[0].type).toBe('zombie');
        expect(context.nearby_entities[0].is_hostile).toBe(true);
        expect(context.resource_availability.stone_pickaxe.available).toBe(
          true
        );
        expect(context.resource_availability.torch.available).toBe(true);
        expect(context.social_context.chat_activity).toBe(true);
      });

      it('should calculate threat level correctly', () => {
        const worldState = {
          time: 18000, // Night
          weather: 'clear',
          biome: 'plains',
          light_level: 5,
          position: { x: 100, y: 64, z: 200 },
          entities: [
            {
              id: 'creeper-1',
              type: 'creeper',
              position: { x: 101, y: 64, z: 200 },
              is_hostile: true,
            },
            {
              id: 'skeleton-1',
              type: 'skeleton',
              position: { x: 105, y: 64, z: 200 },
              is_hostile: true,
            },
          ],
          inventory: [],
          nearby_blocks: [],
          chat_messages: [],
        };

        const context = environmentalImmersion.updateContext(worldState);

        expect(context.threat_level).toBeGreaterThan(0.5);
        expect(context.time_of_day).toBe('night');
      });
    });

    describe('getBehaviorAdaptations', () => {
      it('should recommend night time adaptations', () => {
        const context: EnvironmentalContext = {
          time_of_day: 'night',
          weather: 'clear',
          biome: 'plains',
          light_level: 5,
          threat_level: 0.3,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const adaptations =
          environmentalImmersion.getBehaviorAdaptations(context);

        expect(adaptations.adaptations).toContain('seek_shelter');
        expect(adaptations.adaptations).toContain('use_torches');
        expect(adaptations.priority).toBeGreaterThan(0.7);
        expect(adaptations.reasoning).toContain(
          'Night time requires defensive measures'
        );
      });

      it('should recommend threat-based adaptations', () => {
        const context: EnvironmentalContext = {
          time_of_day: 'day',
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          threat_level: 0.8,
          nearby_entities: [],
          resource_availability: {},
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        const adaptations =
          environmentalImmersion.getBehaviorAdaptations(context);

        expect(adaptations.adaptations).toContain('defensive_stance');
        expect(adaptations.adaptations).toContain('avoid_combat');
        expect(adaptations.priority).toBeGreaterThan(0.8);
        expect(adaptations.reasoning).toContain(
          'High threat level requires defensive behavior'
        );
      });
    });

    describe('getEnvironmentalSummary', () => {
      it('should provide accurate environmental summary', () => {
        const context: EnvironmentalContext = {
          time_of_day: 'night',
          weather: 'storm',
          biome: 'forest',
          light_level: 3,
          threat_level: 0.9,
          nearby_entities: [],
          resource_availability: {
            torch: {
              available: true,
              quantity: 16,
              location: 'inventory',
              last_seen: Date.now(),
              confidence: 1.0,
            },
          },
          social_context: {
            nearby_players: [],
            nearby_villagers: [],
            chat_activity: false,
          },
          timestamp: Date.now(),
        };

        // Update the context first with high threat level
        environmentalImmersion.updateContext({
          time: 18000,
          weather: 'storm',
          biome: 'forest',
          light_level: 3,
          position: { x: 100, y: 64, z: 200 },
          entities: [
            {
              id: 'creeper-1',
              type: 'creeper',
              position: { x: 101, y: 64, z: 200 },
              is_hostile: true,
            },
          ],
          inventory: [{ name: 'torch', quantity: 16 }],
          nearby_blocks: [],
          chat_messages: [],
        });

        const summary = environmentalImmersion.getEnvironmentalSummary();

        expect(summary.safety_level).toBe('dangerous');
        expect(summary.warnings).toContain('High threat level detected');
        expect(summary.warnings).toContain('Night time increases danger');
        expect(summary.warnings).toContain(
          'Storm conditions may affect activities'
        );
        expect(summary.warnings).toContain(
          'Low light level may affect visibility'
        );
        expect(summary.activity_recommendations).toContain(
          'Consider seeking shelter'
        );
        expect(summary.activity_recommendations).toContain(
          'Use appropriate weather protection'
        );
        expect(summary.activity_recommendations).toContain(
          'Use lighting sources'
        );
      });
    });

    describe('lifecycle management', () => {
      it('should start and stop monitoring correctly', () => {
        const startSpy = jest.fn();
        const stopSpy = jest.fn();

        environmentalImmersion.on('started', startSpy);
        environmentalImmersion.on('stopped', stopSpy);

        environmentalImmersion.start(100);
        expect(startSpy).toHaveBeenCalled();
        expect(environmentalImmersion.getCurrentContext()).toBeNull();

        environmentalImmersion.stop();
        expect(stopSpy).toHaveBeenCalled();
      });

      it('should emit context update events', (done) => {
        environmentalImmersion.on('context_updated', (context) => {
          expect(context).toBeDefined();
          expect(context.time_of_day).toBe('dusk'); // 6000 time = dusk
          done();
        });

        const worldState = {
          time: 6000, // Dusk time
          weather: 'clear',
          biome: 'plains',
          light_level: 15,
          position: { x: 100, y: 64, z: 200 },
          entities: [],
          inventory: [],
          nearby_blocks: [],
          chat_messages: [],
        };

        environmentalImmersion.updateContext(worldState);
      });
    });
  });

  describe('Integration', () => {
    it('should integrate task parsing with environmental context', async () => {
      const llmOutput =
        'I need to gather cobblestone for building, but it is getting dark';

      const worldState = {
        time: 18000, // Night
        weather: 'clear',
        biome: 'plains',
        light_level: 5,
        position: { x: 100, y: 64, z: 200 },
        entities: [],
        inventory: [{ name: 'stone_pickaxe', quantity: 1 }],
        nearby_blocks: [],
        chat_messages: [],
      };

      // Update environmental context
      const environmentalContext =
        environmentalImmersion.updateContext(worldState);

      // Parse task with environmental context
      const result = await taskParser.parseLLMOutput(
        llmOutput,
        environmentalContext
      );

      expect(result.task.type).toBe('gathering');
      expect(result.task.parameters.resource).toBe('cobblestone');
      expect(result.validation.warnings).toContain(
        'Performing outdoor task at night may be dangerous'
      );
      expect(result.feasibility.environmental_constraints).toContain(
        'Night time reduces visibility and safety'
      );
      expect(result.feasibility.risk_assessment.level).toBe('risky');
    });
  });
});

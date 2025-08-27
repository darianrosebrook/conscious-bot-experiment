/**
 * Enhanced Task Parser Tests
 *
 * Comprehensive test suite for the enhanced task parser system,
 * including dual-channel prompting and creative paraphrasing functionality.
 *
 * @author @darianrosebrook
 */

import { EnhancedTaskParser } from '../enhanced-task-parser';
import { EnvironmentalContext, TaskDefinition } from '../types';
import { ParaphrasingStyle } from '../creative-paraphrasing';
import { TaskType } from '../types';

describe('Enhanced Task Parser', () => {
  // Increase timeout for all tests in this suite
  let enhancedTaskParser: EnhancedTaskParser;
  let mockEnvironmentalContext: EnvironmentalContext;

  beforeEach(() => {
    enhancedTaskParser = new EnhancedTaskParser();

    mockEnvironmentalContext = {
      time_of_day: 'day',
      weather: 'clear',
      biome: 'plains',
      light_level: 15,
      threat_level: 0.2,
      nearby_entities: [],
      resource_availability: {
        wood: { available: true, quantity: 10, confidence: 0.9 },
        stone: { available: true, quantity: 20, confidence: 0.8 },
      },
      social_context: {
        nearby_players: [],
        nearby_villagers: [],
        chat_activity: false,
        social_mood: 'neutral',
      },
      timestamp: Date.now(),
    };
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const config = enhancedTaskParser.getConfig();
      expect(config.enable_schema_validation).toBe(true);
      expect(config.enable_context_awareness).toBe(true);
      expect(config.enable_adaptive_learning).toBe(true);
      expect(config.max_paraphrase_options).toBe(3);
    });

    test('should initialize dual-channel prompting', () => {
      const dualChannelMetrics = enhancedTaskParser.getDualChannelMetrics();
      expect(dualChannelMetrics).toBeDefined();
      expect(typeof dualChannelMetrics.operational_success_rate).toBe('number');
    });

    test('should initialize creative paraphrasing', () => {
      const paraphrasingMetrics =
        enhancedTaskParser.getCreativeParaphrasingMetrics();
      expect(paraphrasingMetrics).toBeDefined();
      expect(typeof paraphrasingMetrics.average_confidence).toBe('number');
    });
  });

  describe('User Input Parsing', () => {
    test('should parse simple gathering command', async () => {
      const userInput = 'gather 10 wood';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(result.task).toBeDefined();
      expect(result.task.type).toBe('gathering');
      expect(result.paraphrase_options).toHaveLength(3);
      expect(result.selected_paraphrase).toBeDefined();
      expect(result.channel_used).toBeDefined();
      expect(result.context_adaptations).toBeDefined();
      expect(result.user_interaction_metadata).toBeDefined();
    });

    test('should parse complex multi-step command', async () => {
      const userInput = 'build a house and then gather food for survival';
      const userContext = {
        expertise_level: 'intermediate' as const,
        preferred_style: 'conversational' as ParaphrasingStyle,
        urgency_level: 0.7,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(result.task).toBeDefined();
      expect(result.paraphrase_options.length).toBeGreaterThan(0);
      expect(result.selected_paraphrase.confidence).toBeGreaterThan(0.5);
    });

    test('should handle question input with expressive channel', async () => {
      const userInput = 'How do I craft a diamond pickaxe?';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.3,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(result.channel_used).toBe('expressive');
      expect(result.task.type).toBe('crafting');
    });

    test('should handle urgent command with operational channel', async () => {
      const userInput = 'URGENT: I need shelter immediately!';
      const userContext = {
        expertise_level: 'expert' as const,
        preferred_style: 'technical' as ParaphrasingStyle,
        urgency_level: 0.9,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(result.channel_used).toBe('operational');
      expect(result.context_adaptations).toContain('Added urgency indicators');
    });
  });

  describe('Creative Response Generation', () => {
    test('should generate creative response for casual input', async () => {
      const userInput = 'Hello! How are you doing today?';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'casual' as ParaphrasingStyle,
        urgency_level: 0.1,
      };

      const response = await enhancedTaskParser.generateCreativeResponse(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(10);
    });

    test('should generate technical response for expert user', async () => {
      const userInput = 'What is the optimal mining strategy for diamonds?';
      const userContext = {
        expertise_level: 'expert' as const,
        preferred_style: 'technical' as ParaphrasingStyle,
        urgency_level: 0.6,
      };

      const response = await enhancedTaskParser.generateCreativeResponse(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(20);
    });
  });

  describe('Paraphrasing Options', () => {
    test('should generate multiple paraphrasing options', async () => {
      const task: TaskDefinition = {
        id: 'test-task',
        type: 'gathering',
        parameters: { resource: 'wood', quantity: 10 },
        priority: 0.7,
        safety_level: 'safe',
        estimated_duration: 300000,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const userContext = {
        expertise_level: 'intermediate' as const,
        preferred_style: 'conversational' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      const options = await enhancedTaskParser.generateParaphrasingOptions(
        task,
        mockEnvironmentalContext,
        userContext,
        ['casual', 'formal', 'instructional']
      );

      expect(options).toHaveLength(3);
      expect(options[0].style_used).toBe('casual');
      expect(options[1].style_used).toBe('formal');
      expect(options[2].style_used).toBe('instructional');

      options.forEach((option) => {
        expect(option.confidence).toBeGreaterThan(0.5);
        expect(option.paraphrased_task).toBeDefined();
        expect(option.adaptations_applied).toBeDefined();
      });
    });

    test('should filter options by confidence threshold', async () => {
      const task: TaskDefinition = {
        id: 'test-task',
        type: 'crafting',
        parameters: { item: 'diamond_pickaxe' },
        priority: 0.8,
        safety_level: 'safe',
        estimated_duration: 600000,
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const userContext = {
        expertise_level: 'expert' as const,
        preferred_style: 'technical' as ParaphrasingStyle,
        urgency_level: 0.7,
      };

      const options = await enhancedTaskParser.generateParaphrasingOptions(
        task,
        mockEnvironmentalContext,
        userContext
      );

      options.forEach((option) => {
        expect(option.confidence).toBeGreaterThanOrEqual(0.7);
      });
    });
  });

  describe('User Feedback Integration', () => {
    test('should handle user feedback for task parsing', async () => {
      const userInput = 'gather stone for building';
      const userContext = {
        user_id: 'test-user',
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      // Provide positive feedback
      enhancedTaskParser.provideUserFeedback(
        result.task.id,
        0.9,
        'Great job understanding my request!',
        result.selected_paraphrase.id
      );

      // Check that feedback was recorded
      const taskHistory = enhancedTaskParser.getTaskHistory();
      const task = taskHistory.find((t) => t.task.id === result.task.id);
      expect(task?.user_interaction_metadata.feedback_score).toBe(0.9);
    });

    test('should update user preferences based on feedback', async () => {
      const userContext = {
        user_id: 'learning-user',
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      // Parse multiple tasks with feedback
      const tasks = ['gather wood', 'build a house', 'craft tools'];

      for (const taskInput of tasks) {
        const result = await enhancedTaskParser.parseUserInput(
          taskInput,
          mockEnvironmentalContext,
          userContext
        );

        // Provide feedback
        enhancedTaskParser.provideUserFeedback(
          result.task.id,
          0.8,
          'Good understanding',
          result.selected_paraphrase.id
        );
      }

      // Check user interaction history
      const userHistory = enhancedTaskParser.getUserInteractionHistory();
      const user = userHistory.get('learning-user');
      expect(user).toBeDefined();
      expect(user?.interaction_history).toHaveLength(3);
    });
  });

  describe('Context Awareness', () => {
    test('should adapt to dangerous environmental context', async () => {
      const dangerousContext: EnvironmentalContext = {
        ...mockEnvironmentalContext,
        threat_level: 0.9,
        time_of_day: 'night',
        weather: 'storm',
      };

      const userInput = 'explore the area';
      const userContext = {
        expertise_level: 'intermediate' as const,
        preferred_style: 'conversational' as ParaphrasingStyle,
        urgency_level: 0.6,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        dangerousContext,
        userContext
      );

      expect(result.context_adaptations).toContain(
        'Added safety context for dangerous environment'
      );
      expect(result.context_adaptations).toContain(
        'Adjusted for nighttime conditions'
      );
    });

    test('should adapt to beginner user expertise', async () => {
      const userInput = 'craft advanced redstone contraption';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.4,
      };

      const result = await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      expect(result.context_adaptations).toContain(
        'Simplified language for beginner user'
      );
    });
  });

  describe('Performance Metrics', () => {
    test('should track performance metrics', async () => {
      const userInput = 'gather resources';
      const userContext = {
        expertise_level: 'intermediate' as const,
        preferred_style: 'conversational' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      const metrics = enhancedTaskParser.getPerformanceMetrics();
      expect(metrics.parsing_time).toBeGreaterThan(0);
      expect(metrics.success_rate).toBeGreaterThanOrEqual(0);
      expect(metrics.error_rate).toBeGreaterThanOrEqual(0);
    });

    test('should track dual-channel metrics', () => {
      const dualChannelMetrics = enhancedTaskParser.getDualChannelMetrics();
      expect(
        dualChannelMetrics.operational_success_rate
      ).toBeGreaterThanOrEqual(0);
      expect(dualChannelMetrics.expressive_success_rate).toBeGreaterThanOrEqual(
        0
      );
      expect(dualChannelMetrics.average_response_time).toBeGreaterThanOrEqual(
        0
      );
    });

    test('should track creative paraphrasing metrics', () => {
      const paraphrasingMetrics =
        enhancedTaskParser.getCreativeParaphrasingMetrics();
      expect(paraphrasingMetrics.average_confidence).toBeGreaterThanOrEqual(0);
      expect(
        paraphrasingMetrics.user_satisfaction_score
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const newConfig = {
        max_paraphrase_options: 5,
        paraphrase_confidence_threshold: 0.8,
        enable_schema_validation: false,
      };

      enhancedTaskParser.updateConfig(newConfig);
      const config = enhancedTaskParser.getConfig();

      expect(config.max_paraphrase_options).toBe(5);
      expect(config.paraphrase_confidence_threshold).toBe(0.8);
      expect(config.enable_schema_validation).toBe(false);
    });

    test('should update sub-component configurations', () => {
      const newConfig = {
        dual_channel: {
          operational: {
            temperature: 0.5,
            max_tokens: 1000,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
            system_prompt: 'You are a helpful assistant',
            user_prompt_template: 'User: {user_input}\nAssistant:',
          },
          expressive: {
            temperature: 0.7,
            max_tokens: 1500,
            top_p: 0.8,
            frequency_penalty: 0.2,
            presence_penalty: 0.2,
            system_prompt: 'You are a creative writer',
            user_prompt_template: 'User: {user_input}\nAssistant:',
          },
          context_aware_routing: false,
          auto_fallback: false,
          max_retries: 3,
          timeout_ms: 10000,
        },
        creative_paraphrasing: {
          enable_context_adaptation: false,
          enable_style_matching: false,
          enable_emotion_integration: false,
          enable_cultural_adaptation: false,
          min_confidence_threshold: 0.5,
          max_paraphrase_length: 100,
          enable_fallback_paraphrasing: false,
          max_adaptation_attempts: 2,
        },
      };

      enhancedTaskParser.updateConfig(newConfig);
      const config = enhancedTaskParser.getConfig();

      expect(config.dual_channel.context_aware_routing).toBe(false);
      expect(config.dual_channel.auto_fallback).toBe(false);
      expect(config.creative_paraphrasing.enable_emotion_integration).toBe(
        false
      );
      expect(config.creative_paraphrasing.max_paraphrase_length).toBe(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle parsing errors gracefully', async () => {
      const invalidInput = '';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      await expect(
        enhancedTaskParser.parseUserInput(
          invalidInput,
          mockEnvironmentalContext,
          userContext
        )
      ).rejects.toThrow();
    });

    test('should handle paraphrase generation errors', async () => {
      const invalidTask: TaskDefinition = {
        id: 'invalid-task',
        type: 'invalid_type' as TaskType,
        parameters: {},
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      await expect(
        enhancedTaskParser.generateParaphrasingOptions(
          invalidTask,
          mockEnvironmentalContext,
          userContext
        )
      ).rejects.toThrow();
    });
  });

  describe('Event Emission', () => {
    test('should emit events for task parsing', async () => {
      const userInput = 'gather wood';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      return new Promise<void>((resolve) => {
        enhancedTaskParser.on('enhanced_task_parsed', (result) => {
          expect(result.task).toBeDefined();
          expect(result.paraphrase_options).toBeDefined();
          resolve();
        });

        enhancedTaskParser.parseUserInput(
          userInput,
          mockEnvironmentalContext,
          userContext
        );
      });
    });

    test('should emit events for creative response generation', async () => {
      const userInput = 'Hello there!';
      const userContext = {
        expertise_level: 'beginner' as const,
        preferred_style: 'casual' as ParaphrasingStyle,
        urgency_level: 0.1,
      };

      return new Promise<void>((resolve) => {
        enhancedTaskParser.on('creative_response_generated', (data) => {
          expect(data.response).toBeDefined();
          expect(data.userInput).toBe(userInput);
          resolve();
        });

        enhancedTaskParser.generateCreativeResponse(
          userInput,
          mockEnvironmentalContext,
          userContext
        );
      });
    });

    test('should emit events for user feedback', async () => {
      const userInput = 'gather stone';
      const userContext = {
        user_id: 'test-user',
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      return new Promise<void>((resolve) => {
        enhancedTaskParser.on('enhanced_task_parsed', (result) => {
          enhancedTaskParser.on('user_feedback_received', (feedback) => {
            expect(feedback.taskId).toBe(result.task.id);
            expect(feedback.feedbackScore).toBe(0.8);
            resolve();
          });

          enhancedTaskParser.provideUserFeedback(
            result.task.id,
            0.8,
            'Good job!'
          );
        });

        enhancedTaskParser.parseUserInput(
          userInput,
          mockEnvironmentalContext,
          userContext
        );
      });
    });
  });

  describe('History Management', () => {
    test('should maintain task history', async () => {
      const userInput = 'gather resources';
      const userContext = {
        expertise_level: 'intermediate' as const,
        preferred_style: 'conversational' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      await enhancedTaskParser.parseUserInput(
        userInput,
        mockEnvironmentalContext,
        userContext
      );

      const taskHistory = enhancedTaskParser.getTaskHistory();
      expect(taskHistory.length).toBeGreaterThan(0);
      expect(taskHistory[0].task.type).toBe('gathering');
    });

    test('should maintain user interaction history', async () => {
      const userContext = {
        user_id: 'test-user',
        expertise_level: 'beginner' as const,
        preferred_style: 'instructional' as ParaphrasingStyle,
        urgency_level: 0.5,
      };

      await enhancedTaskParser.parseUserInput(
        'gather wood',
        mockEnvironmentalContext,
        userContext
      );

      const userHistory = enhancedTaskParser.getUserInteractionHistory();
      const user = userHistory.get('test-user');
      expect(user).toBeDefined();
      expect(user?.interaction_history.length).toBeGreaterThan(0);
    });

    test('should clear history', () => {
      enhancedTaskParser.clearTaskHistory();
      enhancedTaskParser.clearUserInteractionHistory();

      const taskHistory = enhancedTaskParser.getTaskHistory();
      const userHistory = enhancedTaskParser.getUserInteractionHistory();

      expect(taskHistory).toHaveLength(0);
      expect(userHistory.size).toBe(0);
    });
  });
});

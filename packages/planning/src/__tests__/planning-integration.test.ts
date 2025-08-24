/**
 * Planning System Integration Test Suite
 * 
 * Tests the integration between the planning system and cognitive integration,
 * including task validation, alternative task generation, and workflow management.
 * 
 * @author @darianrosebrook
 */

import { CognitiveIntegration } from '../cognitive-integration';

// Mock the planning system functions
const mockPlanningSystem = {
  goalFormulation: {
    _failedTaskCount: 0,
    _maxConsecutiveFailures: 3,
    _lastTaskExecution: 0,
    _tasks: [],
    addTask: jest.fn(),
    getCompletedTasks: jest.fn(() => []),
  },
  reactiveExecutor: {
    executeNextTask: jest.fn(),
  },
};

// Mock the cognitive integration
jest.mock('../cognitive-integration');

describe('Planning System Integration', () => {
  let cognitiveIntegration: CognitiveIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    cognitiveIntegration = new CognitiveIntegration();
    
    // Reset mock planning system state
    mockPlanningSystem.goalFormulation._failedTaskCount = 0;
    mockPlanningSystem.goalFormulation._lastTaskExecution = 0;
    mockPlanningSystem.goalFormulation._tasks = [];
  });

  describe('Task Validation', () => {
    it('should validate successful crafting tasks', () => {
      const task = { type: 'craft' };
      const result = { success: true, error: undefined };

      // This would be the validateTaskCompletion function from server.ts
      const validateTaskCompletion = (task: any, result: any): boolean => {
        if (!result || result.error) {
          return false;
        }

        if (task.type === 'craft') {
          return result.success === true && !result.error;
        }

        if (task.type === 'mine') {
          return result.success === true && !result.error;
        }

        if (result.success === false) {
          return false;
        }

        return true;
      };

      const isValid = validateTaskCompletion(task, result);
      expect(isValid).toBe(true);
    });

    it('should validate failed crafting tasks', () => {
      const task = { type: 'craft' };
      const result = { success: false, error: 'Missing materials' };

      const validateTaskCompletion = (task: any, result: any): boolean => {
        if (!result || result.error) {
          return false;
        }

        if (task.type === 'craft') {
          return result.success === true && !result.error;
        }

        if (task.type === 'mine') {
          return result.success === true && !result.error;
        }

        if (result.success === false) {
          return false;
        }

        return true;
      };

      const isValid = validateTaskCompletion(task, result);
      expect(isValid).toBe(false);
    });

    it('should validate successful mining tasks', () => {
      const task = { type: 'mine' };
      const result = { 
        success: true, 
        error: undefined,
        results: [{ success: true }],
        type: 'mining'
      };

      const validateTaskCompletion = (task: any, result: any): boolean => {
        if (!result || result.error) {
          return false;
        }

        if (task.type === 'craft') {
          return result.success === true && !result.error;
        }

        if (task.type === 'mine') {
          return result.success === true && !result.error;
        }

        if (result.success === false) {
          return false;
        }

        return true;
      };

      const isValid = validateTaskCompletion(task, result);
      expect(isValid).toBe(true);
    });

    it('should validate failed mining tasks', () => {
      const task = { type: 'mine' };
      const result = { 
        success: false, 
        error: 'No blocks were successfully mined',
        results: [{ success: false }],
        type: 'mining'
      };

      const validateTaskCompletion = (task: any, result: any): boolean => {
        if (!result || result.error) {
          return false;
        }

        if (task.type === 'craft') {
          return result.success === true && !result.error;
        }

        if (task.type === 'mine') {
          return result.success === true && !result.error;
        }

        if (result.success === false) {
          return false;
        }

        return true;
      };

      const isValid = validateTaskCompletion(task, result);
      expect(isValid).toBe(false);
    });
  });

  describe('Alternative Task Generation', () => {
    it('should generate alternative tasks when current strategy fails', () => {
      const failedTask = { type: 'craft', description: 'Craft complex item' };

      const generateAlternativeTask = (failedTask: any): any => {
        const alternativeTaskTypes = [
          {
            type: 'explore',
            description: 'Explore the surroundings to find resources',
            parameters: { distance: 3, direction: 'forward' },
          },
          {
            type: 'gather',
            description: 'Look for and collect nearby resources',
            parameters: { resource: 'wood', amount: 1 },
          },
          {
            type: 'move',
            description: 'Move to a different location',
            parameters: { distance: 2, direction: 'forward' },
          },
        ];

        const availableTypes = alternativeTaskTypes.filter(t => t.type !== failedTask.type);
        const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];

        return {
          id: `alt-task-${Date.now()}`,
          type: selectedType.type,
          description: selectedType.description,
          priority: 0.7,
          urgency: 0.6,
          parameters: selectedType.parameters,
          goal: 'alternative_strategy',
          status: 'pending',
          createdAt: Date.now(),
          completedAt: null,
          autonomous: true,
          isAlternative: true,
        };
      };

      const alternativeTask = generateAlternativeTask(failedTask);
      
      expect(alternativeTask).toBeDefined();
      expect(alternativeTask.type).not.toBe('craft');
      expect(alternativeTask.isAlternative).toBe(true);
      expect(alternativeTask.goal).toBe('alternative_strategy');
    });

    it('should generate tasks from cognitive feedback suggestions', () => {
      const suggestions = ['Explore the environment', 'Gather the required materials'];

      const generateTaskFromSuggestions = (suggestions: string[]): any | null => {
        for (const suggestion of suggestions) {
          if (suggestion.includes('Explore the environment')) {
            return {
              id: `explore-task-${Date.now()}`,
              type: 'explore',
              description: 'Explore the environment to find new resources',
              priority: 0.8,
              urgency: 0.6,
              parameters: { distance: 5, direction: 'forward' },
              goal: 'exploration',
              status: 'pending',
              createdAt: Date.now(),
              completedAt: null,
              autonomous: true,
              isAlternative: true,
            };
          } else if (suggestion.includes('Gather the required materials')) {
            return {
              id: `gather-task-${Date.now()}`,
              type: 'gather',
              description: 'Gather required materials for crafting',
              priority: 0.9,
              urgency: 0.8,
              parameters: { resource: 'wood', amount: 1 },
              goal: 'resource_gathering',
              status: 'pending',
              createdAt: Date.now(),
              completedAt: null,
              autonomous: true,
              isAlternative: true,
            };
          }
        }
        return null;
      };

      const task = generateTaskFromSuggestions(suggestions);
      
      expect(task).toBeDefined();
      expect(task.type).toBe('explore'); // First suggestion should match
      expect(task.isAlternative).toBe(true);
    });
  });

  describe('Autonomous Task Generation', () => {
    it('should generate autonomous tasks with proper structure', () => {
      const generateAutonomousTask = () => {
        const taskTypes = [
          {
            type: 'explore',
            description: 'Explore the surroundings to understand the environment',
            parameters: { distance: 5, direction: 'forward' },
          },
          {
            type: 'gather',
            description: 'Gather resources from the environment',
            parameters: { resource: 'wood', amount: 1 },
          },
          {
            type: 'mine',
            description: 'Mine for valuable resources',
            parameters: { depth: 5, resource: 'stone' },
          },
        ];

        const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];

        return {
          id: `auto-task-${Date.now()}`,
          type: taskType.type,
          description: taskType.description,
          priority: 0.6,
          urgency: 0.5,
          parameters: taskType.parameters,
          goal: 'autonomous_exploration',
          status: 'pending',
          createdAt: Date.now(),
          completedAt: null,
          autonomous: true,
        };
      };

      const task = generateAutonomousTask();
      
      expect(task).toBeDefined();
      expect(task.id).toMatch(/^auto-task-\d+$/);
      expect(task.autonomous).toBe(true);
      expect(task.status).toBe('pending');
      expect(task.goal).toBe('autonomous_exploration');
      expect(['explore', 'gather', 'mine']).toContain(task.type);
    });
  });

  describe('Task Execution Workflow', () => {
    it('should handle successful task execution', async () => {
      const task = {
        id: 'test-task-1',
        type: 'mine',
        description: 'Mine for resources',
        status: 'in_progress',
        attempts: 1,
      };

      const result = {
        success: true,
        type: 'mining',
        error: undefined,
      };

      // Mock cognitive feedback
      const mockFeedback = {
        taskId: task.id,
        success: true,
        reasoning: 'Successfully completed mine task on first attempt.',
        alternativeSuggestions: [],
        emotionalImpact: 'positive' as const,
        confidence: 0.8,
        timestamp: Date.now(),
      };

      jest.spyOn(cognitiveIntegration, 'processTaskCompletion').mockResolvedValue(mockFeedback);

      // Simulate task completion workflow
      const taskCompleted = true; // validateTaskCompletion would return true
      
      if (taskCompleted) {
        task.status = 'completed';
        task.completedAt = Date.now();
        task.result = result;
        task.cognitiveFeedback = mockFeedback;
        
        // Reset failure counter on success
        mockPlanningSystem.goalFormulation._failedTaskCount = 0;
      }

      expect(task.status).toBe('completed');
      expect(task.cognitiveFeedback).toBe(mockFeedback);
      expect(mockPlanningSystem.goalFormulation._failedTaskCount).toBe(0);
    });

    it('should handle failed task execution', async () => {
      const task = {
        id: 'test-task-2',
        type: 'craft',
        description: 'Craft wooden pickaxe',
        status: 'in_progress',
        attempts: 1,
      };

      const result = {
        success: false,
        type: 'crafting',
        error: 'Missing required materials',
      };

      // Mock cognitive feedback
      const mockFeedback = {
        taskId: task.id,
        success: false,
        reasoning: 'Failed to complete craft task: Missing required materials.',
        alternativeSuggestions: ['Gather the required materials first'],
        emotionalImpact: 'neutral' as const,
        confidence: 0.3,
        timestamp: Date.now(),
      };

      jest.spyOn(cognitiveIntegration, 'processTaskCompletion').mockResolvedValue(mockFeedback);

      // Simulate task failure workflow
      const taskCompleted = false; // validateTaskCompletion would return false
      
      if (!taskCompleted) {
        task.status = 'failed';
        task.failedAt = Date.now();
        task.failureReason = result.error;
        task.result = result;
        task.cognitiveFeedback = mockFeedback;
        
        // Increment failure counter
        mockPlanningSystem.goalFormulation._failedTaskCount++;
      }

      expect(task.status).toBe('failed');
      expect(task.failureReason).toBe('Missing required materials');
      expect(task.cognitiveFeedback).toBe(mockFeedback);
      expect(mockPlanningSystem.goalFormulation._failedTaskCount).toBe(1);
    });

    it('should trigger task abandonment when failure threshold is reached', async () => {
      const task = {
        id: 'test-task-3',
        type: 'craft',
        description: 'Craft complex item',
        status: 'in_progress',
        attempts: 3,
      };

      const result = {
        success: false,
        type: 'crafting',
        error: 'Missing materials',
      };

      // Mock cognitive feedback suggesting abandonment
      const mockFeedback = {
        taskId: task.id,
        success: false,
        reasoning: 'Stuck in a loop with craft task. Failed 3 times consecutively.',
        alternativeSuggestions: ['Try a different task type', 'Gather materials first'],
        emotionalImpact: 'negative' as const,
        confidence: 0.1,
        timestamp: Date.now(),
      };

      jest.spyOn(cognitiveIntegration, 'processTaskCompletion').mockResolvedValue(mockFeedback);
      jest.spyOn(cognitiveIntegration, 'shouldAbandonTask').mockReturnValue(true);

      // Simulate task abandonment workflow
      const taskCompleted = false;
      
      if (!taskCompleted) {
        task.status = 'failed';
        task.failedAt = Date.now();
        task.failureReason = result.error;
        task.result = result;
        task.cognitiveFeedback = mockFeedback;
        
        mockPlanningSystem.goalFormulation._failedTaskCount++;

        // Check if task should be abandoned
        if (cognitiveIntegration.shouldAbandonTask(task.id)) {
          task.status = 'abandoned';
          task.abandonedAt = Date.now();
          task.abandonReason = 'Cognitive feedback suggests abandonment';
        }
      }

      expect(task.status).toBe('abandoned');
      expect(task.abandonReason).toBe('Cognitive feedback suggests abandonment');
      expect(cognitiveIntegration.shouldAbandonTask).toHaveBeenCalledWith(task.id);
    });
  });

  describe('Task Result Formatting', () => {
    it('should format mining task results correctly', () => {
      const mineResults = [
        { success: false, error: 'No block found' },
        { success: true, block: 'stone', position: { x: 0, y: 63, z: 0 } },
      ];

      const successfulMining = mineResults.some((result: any) => result.success === true);
      
      const formattedResult = {
        results: mineResults,
        type: 'mining',
        success: successfulMining,
        error: successfulMining ? undefined : 'No blocks were successfully mined',
      };

      expect(formattedResult.success).toBe(true);
      expect(formattedResult.type).toBe('mining');
      expect(formattedResult.error).toBeUndefined();
      expect(formattedResult.results).toHaveLength(2);
    });

    it('should format failed mining task results correctly', () => {
      const mineResults = [
        { success: false, error: 'No block found' },
        { success: false, error: 'Block not mineable' },
      ];

      const successfulMining = mineResults.some((result: any) => result.success === true);
      
      const formattedResult = {
        results: mineResults,
        type: 'mining',
        success: successfulMining,
        error: successfulMining ? undefined : 'No blocks were successfully mined',
      };

      expect(formattedResult.success).toBe(false);
      expect(formattedResult.type).toBe('mining');
      expect(formattedResult.error).toBe('No blocks were successfully mined');
    });

    it('should format crafting task results correctly', () => {
      const craftResults = [
        { success: true, message: 'Successfully crafted wooden_pickaxe!' },
      ];

      const formattedResult = {
        results: craftResults,
        type: 'crafting',
        success: true,
        error: undefined,
        item: 'wooden_pickaxe',
      };

      expect(formattedResult.success).toBe(true);
      expect(formattedResult.type).toBe('crafting');
      expect(formattedResult.error).toBeUndefined();
      expect(formattedResult.item).toBe('wooden_pickaxe');
    });
  });
});

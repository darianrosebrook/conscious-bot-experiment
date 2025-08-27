/**
 * Working Memory Integration Test
 *
 * Tests the integration of central executive, context manager, goal tracker,
 * and memory integration components.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CentralExecutive,
  ContextManager,
  GoalTracker,
  MemoryIntegration,
  createWorkingMemory,
  WorkingItemType,
  ItemFormat,
  ContextType,
  GoalStatus,
} from '../index';

describe('Working Memory Integration', () => {
  let centralExecutive: CentralExecutive;
  let contextManager: ContextManager;
  let goalTracker: GoalTracker;
  let memoryIntegration: MemoryIntegration;

  beforeEach(() => {
    const workingMemory = createWorkingMemory();
    centralExecutive = workingMemory.centralExecutive;
    contextManager = workingMemory.contextManager;
    goalTracker = workingMemory.goalTracker;
    memoryIntegration = workingMemory.memoryIntegration;
  });

  describe('Central Executive', () => {
    it('should initialize with default state', () => {
      const state = centralExecutive.getState();

      expect(state).toBeDefined();
      expect(state.cognitiveLoad).toBeLessThan(0.5);
      expect(state.attentionFocus.primaryFocus).toBeNull();
      expect(state.workingItems).toHaveLength(0);
      expect(state.activeGoals).toHaveLength(0);
      expect(state.contextFrames).toHaveLength(0);
    });

    it('should add items to working memory', () => {
      const result = centralExecutive.addItem(
        WorkingItemType.FACT,
        'The sky is blue',
        {
          format: ItemFormat.TEXT,
          importance: 0.7,
        }
      );

      expect(result.success).toBe(true);
      expect(result.affectedItems).toHaveLength(1);

      const state = centralExecutive.getState();
      expect(state.workingItems).toHaveLength(1);
      expect(state.workingItems[0].content).toBe('The sky is blue');
      expect(state.workingItems[0].importance).toBe(0.7);
    });

    it('should focus attention on items', () => {
      // Add an item
      const addResult = centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'A red apple',
        { importance: 0.6 }
      );

      const itemId = addResult.affectedItems[0];

      // Focus on it
      const focusResult = centralExecutive.focusAttention(itemId);
      expect(focusResult.success).toBe(true);

      const state = centralExecutive.getState();
      expect(state.attentionFocus.primaryFocus).toBe(itemId);
      expect(state.attentionFocus.focusStrength).toBeGreaterThan(0.5);
    });

    it('should manage cognitive load', () => {
      const initialState = centralExecutive.getState();
      const initialLoad = initialState.cognitiveLoad;

      // Add several items
      for (let i = 0; i < 5; i++) {
        centralExecutive.addItem(WorkingItemType.FACT, `Fact ${i}`, {
          importance: 0.5 + i * 0.1,
        });
      }

      const updatedState = centralExecutive.getState();
      expect(updatedState.cognitiveLoad).toBeGreaterThan(initialLoad);
    });
  });

  describe('Context Manager', () => {
    it('should update spatial context', () => {
      const location = {
        x: 100,
        y: 64,
        z: 200,
        biome: 'forest',
        landmarks: ['large oak tree', 'stream'],
      };

      const result = contextManager.updateSpatialContext(location);
      expect(result.success).toBe(true);

      const contexts = contextManager.getAllContexts();
      expect(contexts).toHaveLength(1);
      expect(contexts[0].type).toBe(ContextType.SPATIAL);
      expect(contexts[0].content).toEqual(location);
    });

    it('should update multiple context types', () => {
      contextManager.updateSpatialContext({ biome: 'desert' });
      contextManager.updateTemporalContext({
        currentTime: Date.now(),
        dayPhase: 'day',
      });
      contextManager.updateTaskContext({ activity: 'exploring' });

      const contexts = contextManager.getAllContexts();
      expect(contexts).toHaveLength(3);

      const contextTypes = contexts.map((c) => c.type);
      expect(contextTypes).toContain(ContextType.SPATIAL);
      expect(contextTypes).toContain(ContextType.TEMPORAL);
      expect(contextTypes).toContain(ContextType.TASK);
    });

    it('should get most relevant contexts', () => {
      contextManager.updateSpatialContext(
        { biome: 'mountains' },
        { relevance: 0.9 }
      );
      contextManager.updateTemporalContext(
        { currentTime: Date.now() },
        { relevance: 0.5 }
      );
      contextManager.updateSocialContext({ entities: [] }, { relevance: 0.3 });

      const relevantContexts = contextManager.getMostRelevantContexts(2);
      expect(relevantContexts).toHaveLength(2);
      expect(relevantContexts[0].type).toBe(ContextType.SPATIAL);
      expect(relevantContexts[0].relevance).toBe(0.9);
    });

    it('should generate context summary', () => {
      contextManager.updateSpatialContext({ biome: 'plains' });
      contextManager.updateEnvironmentalContext({
        conditions: { weather: 'sunny', temperature: 'warm' },
      });

      const summary = contextManager.getContextSummary();
      expect(summary).toBeDefined();
      expect(summary.location).toBeDefined();
      expect(summary.location.biome).toBe('plains');
      expect(summary.environment).toBeDefined();
      expect(summary.environment.conditions.weather).toBe('sunny');
    });
  });

  describe('Goal Tracker', () => {
    it('should add goals to working memory', () => {
      const result = goalTracker.addGoal('Find food', { priority: 0.8 });

      expect(result.success).toBe(true);

      const goals = goalTracker.getAllGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0].description).toBe('Find food');
      expect(goals[0].priority).toBe(0.8);
      expect(goals[0].status).toBe(GoalStatus.ACTIVE);
    });

    it('should update goal progress', () => {
      const addResult = goalTracker.addGoal('Build shelter');
      const goalId = addResult.affectedItems[0];

      const updateResult = goalTracker.updateGoalProgress(goalId, 0.5);
      expect(updateResult.success).toBe(true);

      const goals = goalTracker.getAllGoals();
      expect(goals[0].progress).toBe(0.5);
    });

    it('should manage goal status transitions', () => {
      const addResult = goalTracker.addGoal('Craft tools');
      const goalId = addResult.affectedItems[0];

      // Pause goal
      goalTracker.pauseGoal(goalId);
      expect(goalTracker.getGoalsByStatus(GoalStatus.PAUSED)).toHaveLength(1);

      // Resume goal
      goalTracker.resumeGoal(goalId);
      expect(goalTracker.getGoalsByStatus(GoalStatus.ACTIVE)).toHaveLength(1);

      // Complete goal
      goalTracker.completeGoal(goalId);
      expect(goalTracker.getGoalsByStatus(GoalStatus.COMPLETED)).toHaveLength(
        1
      );
    });

    it('should handle subgoals', () => {
      const parentResult = goalTracker.addGoal('Build house');
      const parentId = parentResult.affectedItems[0];

      const subgoalResult = goalTracker.addSubgoal(parentId, 'Gather wood');

      expect(subgoalResult.success).toBe(true);

      const goals = goalTracker.getAllGoals();
      expect(goals).toHaveLength(2);

      const parentGoal = goals.find((g) => g.id === parentId);
      expect(parentGoal?.subgoals).toHaveLength(1);
    });
  });

  describe('Memory Integration', () => {
    it('should add episodic memory to working memory', () => {
      const episodicMemory = {
        description: 'Found a cave with iron ore',
        timestamp: Date.now() - 3600000, // 1 hour ago
        location: { biome: 'mountains' },
        emotions: { excitement: 0.7 },
      };

      const result = memoryIntegration.addEpisodicMemory(episodicMemory);
      expect(result.success).toBe(true);

      const state = centralExecutive.getState();
      expect(state.workingItems).toHaveLength(1);
      expect(state.buffers.episodic).toHaveLength(1);
    });

    it('should add verbal information to phonological loop', () => {
      const result = memoryIntegration.addVerbalInfo(
        'Turn left at the big oak tree'
      );

      expect(result.success).toBe(true);

      const state = centralExecutive.getState();
      expect(state.workingItems).toHaveLength(1);
      expect(state.buffers.phonological).toHaveLength(1);
      expect(state.buffers.phonological[0].content).toBe(
        'Turn left at the big oak tree'
      );
    });

    it('should rehearse verbal information', () => {
      const addResult = memoryIntegration.addVerbalInfo(
        'Remember to collect water'
      );
      const itemId = addResult.affectedItems[0];

      const rehearseResult = memoryIntegration.rehearseVerbalInfo(itemId);
      expect(rehearseResult.success).toBe(true);

      const state = centralExecutive.getState();
      const phonoItem = state.buffers.phonological[0];
      expect(phonoItem.rehearsals).toBe(1);
    });

    it('should create inferences from working memory items', () => {
      // Add source items
      const item1Result = centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'Dark clouds in the sky'
      );

      const item2Result = centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'Wind is picking up'
      );

      // Create inference
      const inferenceResult = memoryIntegration.createInference(
        [item1Result.affectedItems[0], item2Result.affectedItems[0]],
        'A storm is approaching'
      );

      expect(inferenceResult.success).toBe(true);

      const state = centralExecutive.getState();
      const inferenceItem = state.workingItems.find(
        (i) => i.type === WorkingItemType.INFERENCE
      );
      expect(inferenceItem).toBeDefined();
      expect(inferenceItem?.content.content).toBe('A storm is approaching');
    });

    it('should update situation with multiple contexts', () => {
      const result = memoryIntegration.updateSituation({
        location: { biome: 'plains', position: [100, 64, 200] },
        time: { dayPhase: 'evening', timePressure: 0.3 },
        activity: 'returning to base',
        environment: { weather: 'clear', visibility: 'good' },
        emotional: { primary: 'satisfied', intensity: 0.6, valence: 0.7 },
      });

      expect(result.success).toBe(true);

      const contexts = contextManager.getAllContexts();
      expect(contexts.length).toBeGreaterThanOrEqual(4);

      const contextTypes = contexts.map((c) => c.type);
      expect(contextTypes).toContain(ContextType.SPATIAL);
      expect(contextTypes).toContain(ContextType.TEMPORAL);
      expect(contextTypes).toContain(ContextType.TASK);
      expect(contextTypes).toContain(ContextType.EMOTIONAL);
      expect(contextTypes).toContain(ContextType.ENVIRONMENTAL);
    });

    it('should provide cognitive workspace snapshot', () => {
      // Set up a workspace with various elements
      goalTracker.addGoal('Find shelter before dark', { priority: 0.9 });
      contextManager.updateSpatialContext({
        biome: 'forest',
        landmarks: ['river'],
      });
      centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'Rain clouds forming'
      );

      const workspace = memoryIntegration.getCognitiveWorkspace();

      expect(workspace).toBeDefined();
      expect(workspace.goals).toHaveLength(1);
      expect(workspace.goals[0].description).toBe('Find shelter before dark');
      expect(workspace.context).toBeDefined();
      expect(workspace.context.location).toBeDefined();
      expect(workspace.items).toHaveLength(1);
    });
  });

  describe('Integration and Edge Cases', () => {
    it('should handle cognitive load limitations', () => {
      // Add many items to increase cognitive load
      for (let i = 0; i < 10; i++) {
        centralExecutive.addItem(WorkingItemType.FACT, `Fact ${i}`, {
          importance: 0.5,
        });
      }

      const state = centralExecutive.getState();
      expect(state.cognitiveLoad).toBeGreaterThan(0.5);

      // Should have limited items due to capacity
      expect(state.workingItems.length).toBeLessThanOrEqual(10);
    });

    it('should handle item removal and decay', () => {
      // Add item
      const result = centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'Temporary observation',
        { importance: 0.3 } // Low importance
      );

      const itemId = result.affectedItems[0];

      // Remove item
      const removeResult = centralExecutive.removeItem(itemId);
      expect(removeResult.success).toBe(true);

      const state = centralExecutive.getState();
      expect(state.workingItems).toHaveLength(0);
    });

    it('should maintain attention focus when handling distractions', () => {
      // Set initial focus
      const item1Result = centralExecutive.addItem(
        WorkingItemType.FACT,
        'Important task information',
        { importance: 0.7 }
      );

      centralExecutive.focusAttention(item1Result.affectedItems[0]);

      // Add distraction
      const item2Result = centralExecutive.addItem(
        WorkingItemType.OBSERVATION,
        'Sudden loud noise',
        { importance: 0.9 } // High importance = distraction
      );

      const state = centralExecutive.getState();

      // Should have a distraction
      expect(state.attentionFocus.distractions.length).toBeGreaterThan(0);

      // Handle distraction
      const distractionId = item2Result.affectedItems[0];
      centralExecutive.handleDistraction(distractionId);

      const updatedState = centralExecutive.getState();

      // Distraction should be handled
      const handledDistraction = updatedState.attentionFocus.distractions.find(
        (d) => d.source === distractionId
      );
      expect(handledDistraction?.handled).toBe(true);
    });

    it('should provide meaningful statistics', () => {
      // Add various elements
      goalTracker.addGoal('Primary goal');
      goalTracker.addGoal('Secondary goal', { priority: 0.5 });
      contextManager.updateSpatialContext({ biome: 'mountains' });
      memoryIntegration.addVerbalInfo('Remember this information');

      const stats = memoryIntegration.getStats();

      expect(stats).toBeDefined();
      expect(stats.itemCount).toBeGreaterThan(0);
      expect(stats.goalStats.totalGoals).toBe(2);
      expect(stats.contextStats.totalContexts).toBeGreaterThan(0);
      expect(stats.buffers.phonological).toBeGreaterThan(0);
    });
  });
});

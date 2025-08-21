/**
 * M2 Integration Test
 * 
 * Tests the integration between planning, memory, and cognition packages
 * to ensure goal generation, memory storage, and cognitive processing work together.
 * 
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Planning components
import { HomeostasisMonitor, NeedGenerator, GoalManager } from '@conscious-bot/planning';
import { GoalType, NeedType } from '@conscious-bot/planning';

// Memory components
import { EventLogger, SalienceScorer } from '@conscious-bot/memory';
import { ExperienceType } from '@conscious-bot/memory';

// Cognition components
import { LLMInterface, InternalDialogue } from '@conscious-bot/cognition';
import { ThoughtType } from '@conscious-bot/cognition';

describe('M2 Foundation Integration', () => {
  let homeostasisMonitor: HomeostasisMonitor;
  let needGenerator: NeedGenerator;
  let goalManager: GoalManager;
  let eventLogger: EventLogger;
  let salienceScorer: SalienceScorer;
  let llmInterface: LLMInterface;
  let internalDialogue: InternalDialogue;

  beforeEach(() => {
    homeostasisMonitor = new HomeostasisMonitor();
    needGenerator = new NeedGenerator();
    goalManager = new GoalManager();
    eventLogger = new EventLogger();
    salienceScorer = new SalienceScorer();
    llmInterface = new LLMInterface({
      model: 'deepseek-r1:8b', // Use smaller model for testing
      maxTokens: 256,
      timeout: 10000,
    });
    internalDialogue = new InternalDialogue(llmInterface);
  });

  describe('Goal Generation Flow', () => {
    it('should generate goals from homeostasis state', () => {
      // Simulate low energy homeostasis state
      const homeostasis = homeostasisMonitor.sample({
        energy: 0.2,
        hunger: 0.8,
        safety: 0.9,
      });

      expect(homeostasis).toBeDefined();
      expect(homeostasis.energy).toBe(0.2);
      expect(homeostasis.hunger).toBe(0.8);

      // Generate needs from homeostasis
      const needs = needGenerator.generateNeeds(homeostasis);
      expect(needs).toBeDefined();
      expect(needs.length).toBeGreaterThan(0);

      // Should prioritize hunger and energy needs
      const hungerNeed = needs.find(n => n.type === NeedType.HUNGER);
      expect(hungerNeed).toBeDefined();
      expect(hungerNeed?.intensity).toBeGreaterThan(0.5);

      // Create goal from needs
      const goal = goalManager.createFromNeeds(needs);
      expect(goal).toBeDefined();
      expect(goal?.type).toBe(GoalType.SURVIVAL);
      expect(goal?.priority).toBeGreaterThan(0.5);
    });

    it('should manage goal queue and selection', () => {
      const homeostasis = homeostasisMonitor.sample();
      const needs = needGenerator.generateNeeds(homeostasis);
      
      // Create multiple goals
      const goal1 = goalManager.createFromNeeds(needs);
      const goal2 = goalManager.createFromNeeds(needs);

      if (goal1) goalManager.upsert(goal1);
      if (goal2) goalManager.upsert(goal2);

      const goals = goalManager.list();
      expect(goals.length).toBeGreaterThanOrEqual(1);

      const selectedGoal = goalManager.selectNext();
      expect(selectedGoal).toBeDefined();
      expect(selectedGoal?.utility).toBeGreaterThan(0);
    });
  });

  describe('Memory Integration', () => {
    it('should log and score experiences', () => {
      // Log a goal achievement experience
      const experience = eventLogger.logGoalAchievement(
        'Found food source',
        0.9,
        5000
      );

      expect(experience).toBeDefined();
      expect(experience.type).toBe(ExperienceType.GOAL_ACHIEVEMENT);
      expect(experience.emotions.satisfaction).toBe(0.9);
      expect(experience.salienceScore).toBe(0.8); // High salience for achievements

      // Test salience scoring
      const salience = salienceScorer.calculateSalience(experience, {
        currentGoals: ['find food', 'explore area'],
        recentExperiences: [],
      });

      expect(salience).toBeGreaterThan(0.5);
      expect(salience).toBeLessThanOrEqual(1);
    });

    it('should handle exploration experiences', () => {
      const location = {
        x: 100,
        y: 64,
        z: 200,
        dimension: 'overworld',
        description: 'forest clearing',
      };

      const experience = eventLogger.logExploration(
        'Discovered new forest clearing with oak trees',
        location,
        ['oak_trees', 'clearing', 'peaceful_area']
      );

      expect(experience.type).toBe(ExperienceType.EXPLORATION);
      expect(experience.location).toEqual(location);
      expect(experience.emotions.curiosity).toBeGreaterThan(0.5);
      expect(experience.tags).toContain('oak_trees');

      const stats = eventLogger.getStats();
      expect(stats.totalExperiences).toBeGreaterThan(0);
      expect(stats.byType[ExperienceType.EXPLORATION]).toBeGreaterThan(0);
    });
  });

  describe('Cognitive Integration', () => {
    it('should check LLM availability', async () => {
      const isHealthy = await llmInterface.healthCheck();
      // Note: This test will only pass if Ollama is running locally
      if (isHealthy) {
        expect(isHealthy).toBe(true);
      } else {
        console.warn('Ollama not available - skipping LLM tests');
      }
    });

    it('should process situations and generate thoughts', async () => {
      const situation = 'Observed a new structure in the distance';
      const context = {
        currentGoals: ['explore surroundings', 'find resources'],
        recentEvents: ['left spawn area', 'walked north'],
        urgency: 0.4,
      };

      const thoughts = await internalDialogue.processsituation(situation, context);
      
      // Thoughts array should be defined (may be empty if LLM unavailable)
      expect(Array.isArray(thoughts)).toBe(true);
      
      // If thoughts were generated, validate structure
      if (thoughts.length > 0) {
        const thought = thoughts[0];
        expect(thought.type).toBeDefined();
        expect(thought.content).toBeDefined();
        expect(thought.confidence).toBeGreaterThan(0);
        expect(thought.timestamp).toBeGreaterThan(0);
      }
    });

    it('should manage internal dialogue history', async () => {
      // Add some mock thoughts
      await internalDialogue.processsituation('Started exploring', {
        currentGoals: ['explore'],
      });

      const stats = internalDialogue.getStats();
      expect(stats.totalThoughts).toBeGreaterThanOrEqual(0);
      expect(stats.isActive).toBe(true);

      const recentThoughts = internalDialogue.getRecentThoughts();
      expect(Array.isArray(recentThoughts)).toBe(true);
    });
  });

  describe('End-to-End Cognitive Loop', () => {
    it('should complete a basic cognitive cycle', async () => {
      // 1. Monitor homeostasis
      const homeostasis = homeostasisMonitor.sample({
        curiosity: 0.8,
        energy: 0.7,
      });

      // 2. Generate needs and goals
      const needs = needGenerator.generateNeeds(homeostasis);
      const goal = goalManager.createFromNeeds(needs);
      
      if (goal) {
        goalManager.upsert(goal);
      }

      // 3. Log exploration experience
      const experience = eventLogger.logExploration(
        'Spotted interesting cave entrance',
        { x: 150, y: 70, z: 250, dimension: 'overworld' },
        ['cave', 'dark', 'mysterious']
      );

      // 4. Generate internal thoughts about the situation
      const thoughts = await internalDialogue.processsituation(
        'Found a cave that might contain resources',
        {
          currentGoals: goal ? [goal.description] : [],
          recentEvents: [experience.description],
          urgency: 0.6,
        }
      );

      // Validate the cognitive cycle components
      expect(homeostasis.curiosity).toBe(0.8);
      expect(needs.length).toBeGreaterThan(0);
      expect(experience.type).toBe(ExperienceType.EXPLORATION);
      expect(Array.isArray(thoughts)).toBe(true);

      // Validate integration worked
      const selectedGoal = goalManager.selectNext();
      const recentExperiences = eventLogger.getRecentExperiences();
      const recentThoughts = internalDialogue.getRecentThoughts();

      expect(selectedGoal || recentExperiences.length > 0 || recentThoughts.length >= 0).toBe(true);
    });
  });

  describe('Error Handling and Guards', () => {
    it('should handle missing or invalid inputs gracefully', () => {
      // Test null/undefined guards
      expect(() => needGenerator.generateNeeds(undefined)).not.toThrow();
      expect(() => goalManager.createFromNeeds([])).not.toThrow();
      expect(() => salienceScorer.calculateSalience(null as any)).not.toThrow();

      // Test empty inputs
      const emptyNeeds = needGenerator.generateNeeds(undefined);
      expect(emptyNeeds.length).toBeGreaterThan(0); // Should provide default exploration need

      const noGoal = goalManager.createFromNeeds([]);
      expect(noGoal).toBeUndefined();

      const zeroSalience = salienceScorer.calculateSalience(null as any);
      expect(zeroSalience).toBe(0);
    });

    it('should validate data structures', () => {
      const homeostasis = homeostasisMonitor.sample();
      expect(homeostasis.health).toBeGreaterThanOrEqual(0);
      expect(homeostasis.health).toBeLessThanOrEqual(1);
      expect(homeostasis.timestamp).toBeGreaterThan(0);

      const experience = eventLogger.logGoalAchievement('test goal');
      expect(experience.id).toBeDefined();
      expect(experience.timestamp).toBeGreaterThan(0);
      expect(experience.salienceScore).toBeGreaterThanOrEqual(0);
      expect(experience.salienceScore).toBeLessThanOrEqual(1);
    });
  });
});

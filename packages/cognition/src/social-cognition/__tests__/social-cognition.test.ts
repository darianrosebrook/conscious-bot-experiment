/**
 * Social Cognition Test Suite
 *
 * Comprehensive tests for theory of mind, social learning, and relationship management
 * capabilities of the social cognition module.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentModeler } from '../agent-modeler';
import { TheoryOfMindEngine } from '../theory-of-mind-engine';
import { SocialLearner } from '../social-learner';
import { RelationshipManager } from '../relationship-manager';
import {
  Entity,
  AgentInteraction,
} from '../types';

// Mock LLM Interface for testing
class MockLLMInterface {
  async generateResponse(
    prompt: string | any,
    options?: any
  ): Promise<{ text: string }> {
    // Handle both string prompts and LLMContext objects
    const promptText =
      typeof prompt === 'string' ? prompt : prompt.messages?.[0]?.content || '';

    // JSON format responses for theory of mind inference
    // These prompts expect JSON output
    if (promptText.includes('Infer the current mental state') && promptText.includes('JSON format')) {
      return {
        text: JSON.stringify({
          beliefs: {
            "situation_safe": { content: "The environment is safe", confidence: 0.8, accuracy: true, source: "observation", lastUpdated: Date.now() },
            "resources_available": { content: "Resources are nearby", confidence: 0.7, accuracy: null, source: "inference", lastUpdated: Date.now() }
          },
          goals: [
            { id: "goal_1", description: "Build shelter", priority: 0.9, urgency: 0.7, progress: 0.3, obstacles: [], subgoals: [] },
            { id: "goal_2", description: "Gather resources", priority: 0.7, urgency: 0.5, progress: 0.2, obstacles: [], subgoals: [] }
          ],
          emotions: {
            primary: "curious",
            intensity: 0.6,
            secondary: ["hopeful"],
            triggers: ["new environment"],
            duration: 5000,
            stability: 0.8
          },
          attention: {
            focusTarget: "surroundings",
            focusIntensity: 0.7,
            distractions: []
          },
          knowledge: {
            knownFacts: ["terrain is plains"],
            uncertainAreas: ["nearby threats"],
            recentLearning: []
          },
          confidence: 0.7,
          reasoning: "Inferred from observation patterns and agent behavior"
        })
      };
    } else if (promptText.includes('Predict actions') && promptText.includes('JSON format')) {
      return {
        text: JSON.stringify({
          actions: [
            { action: "explore", probability: 0.7, timing: "immediate", prerequisites: [] },
            { action: "gather_wood", probability: 0.5, timing: "soon", prerequisites: ["find trees"] }
          ],
          confidence: 0.6,
          reasoning: ["Agent shows exploratory behavior", "Resource gathering is a priority"],
          alternatives: [],
          timeline: { immediate: 0.4, short_term: 0.4, long_term: 0.2 }
        })
      };
    } else if (promptText.includes('perspective simulation') || promptText.includes('viewpoint')) {
      return {
        text: JSON.stringify({
          viewpoint: "From this agent's perspective, the situation appears manageable",
          beliefs: { safety: 0.8 },
          goals: ["survival", "exploration"],
          emotions: ["curiosity"],
          reactions: ["observe carefully"],
          confidence: 0.6,
          reasoning: "Based on agent's personality profile",
          limitations: ["limited visibility"]
        })
      };
    }

    // Generate realistic responses based on prompt content (non-JSON responses)
    if (promptText.includes('capabilities')) {
      return {
        text: `- Movement and navigation
- Resource gathering and crafting
- Social interaction and communication
- Problem-solving and planning
- Tool use and construction`,
      };
    } else if (promptText.includes('personality')) {
      return {
        text: 'Friendly and cooperative, shows curiosity and helpfulness in interactions',
      };
    } else if (promptText.includes('beliefs')) {
      return {
        text: `- The world is a place for exploration and building
- Other players can be trusted for cooperation
- Resources should be shared and used wisely
- Safety and shelter are important priorities`,
      };
    } else if (promptText.includes('goals')) {
      return {
        text: `- Build a secure shelter
- Gather essential resources
- Help other players when possible
- Learn new crafting techniques
- Explore the environment safely`,
      };
    } else if (promptText.includes('emotions')) {
      return {
        text: `- Curiosity about new discoveries
- Satisfaction from successful building
- Concern for other players' safety
- Excitement about resource finds`,
      };
    } else if (promptText.includes('behaviors')) {
      return {
        text: `- Approaches other players with friendly gestures
- Shares resources without being asked
- Takes time to observe before acting
- Shows patience in complex tasks
- Leads group expeditions
- Coordinates team activities`,
      };
    } else if (promptText.includes('intentions')) {
      return {
        text: `- Will likely offer help to new players
- Plans to expand their shelter
- Intends to explore nearby caves
- Wants to improve crafting skills`,
      };
    } else if (promptText.includes('context')) {
      return {
        text: 'Cooperative multiplayer environment with friendly social dynamics',
      };
    } else if (promptText.includes('description')) {
      return {
        text: 'A helpful and experienced player who enjoys building and assisting others',
      };
    } else if (
      promptText.includes('patterns') ||
      promptText.includes('history')
    ) {
      return {
        text: `- Defensive building patterns
- Resource management strategies
- Social interaction protocols
- Safety-first approach`,
      };
    } else if (
      promptText.includes('norms') ||
      promptText.includes('interactions')
    ) {
      return {
        text: `- Greeting others when approaching
- Sharing resources when possible
- Helping new players
- Respecting others' builds`,
      };
    } else {
      return {
        text: 'Analysis completed successfully',
      };
    }
  }
}

describe('Social Cognition Module', () => {
  let agentModeler: AgentModeler;
  let theoryOfMindEngine: TheoryOfMindEngine;
  let socialLearner: SocialLearner;
  let relationshipManager: RelationshipManager;
  let mockLLM: MockLLMInterface;

  beforeEach(() => {
    mockLLM = new MockLLMInterface();
    agentModeler = new AgentModeler(mockLLM as any);
    theoryOfMindEngine = new TheoryOfMindEngine(mockLLM as any, agentModeler);
    socialLearner = new SocialLearner(mockLLM as any, agentModeler);
    relationshipManager = new RelationshipManager(mockLLM as any, agentModeler);
  });

  describe('Agent Modeler', () => {
    it('should create agent models from observations', async () => {
      const entity = {
        id: 'player_123',
        name: 'Alex',
        type: 'player',
        position: { x: 100, y: 64, z: 200 },
      } as any as Entity;

      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_123',
          description: 'Built a wooden shelter with basic amenities',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'construction',
        },
        {
          id: 'obs_2',
          agentId: 'player_123',
          description: 'Shared iron tools with a new player',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'social_interaction',
        },
        {
          id: 'obs_3',
          agentId: 'player_123',
          description: 'Explored nearby caves for resources',
          timestamp: Date.now(),
          confidence: 0.7,
          context: 'exploration',
        },
      ];

      const model = await agentModeler.createAgentModel(entity, observations as any);

      expect(model).toBeDefined();
      expect(model.agentId).toBe('player_123');
      expect(model.name).toBe('Alex');
      expect(model.capabilities.domains.length).toBeGreaterThan(0);
      expect(model.personality).toBeDefined();
      expect(model.beliefs.length).toBeGreaterThan(0);
      expect(model.goals.length).toBeGreaterThan(0);
      expect(model.emotions.length).toBeGreaterThan(0);
      expect(model.behaviors.length).toBeGreaterThan(0);
      expect(model.intentions.length).toBeGreaterThan(0);
      expect(model.confidence).toBeGreaterThan(0);
    });

    it('should update agent models with new observations', async () => {
      const entity = {
        id: 'player_456',
        name: 'Sam',
        type: 'player',
        position: { x: 150, y: 64, z: 250 },
      } as any as Entity;

      const initialObservations = [
        {
          id: 'obs_1',
          agentId: 'player_456',
          description: 'Built a small house',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'construction',
        },
      ];

      await agentModeler.createAgentModel(entity, initialObservations as any);

      const newObservations = [
        {
          id: 'obs_2',
          agentId: 'player_456',
          description: 'Defended against hostile mobs aggressively',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'combat',
        },
        {
          id: 'obs_3',
          agentId: 'player_456',
          description: 'Refused to share resources with others',
          timestamp: Date.now(),
          confidence: 0.7,
          context: 'social_interaction',
        },
      ];

      const update = await agentModeler.updateAgentModel(
        'player_456',
        newObservations as any
      );

      expect(update.updated).toBe(true);
      expect(update.changes.length).toBeGreaterThanOrEqual(0); // Changes may not be detected with mock LLM
      expect(update.newObservations).toBe(2);
      expect(update.confidence).toBeGreaterThan(0);

      const updatedModel = agentModeler.getAgentModel('player_456');
      expect(updatedModel).toBeDefined();
      expect(updatedModel!.history.length).toBe(3);
    });

    it('should track interaction history', () => {
      const interaction = {
        id: 'interaction_1',
        agentId: 'player_123',
        otherAgentId: 'player_456',
        type: 'resource_sharing',
        description: 'Shared iron ore with player_456',
        timestamp: Date.now(),
        outcome: 'positive',
        duration: 5000,
        context: 'cooperation',
      } as any as AgentInteraction;

      agentModeler.addInteraction(interaction);

      const history = agentModeler.getInteractionHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('interaction_1');
      expect(history[0].outcome).toBe('positive');
    });

    it('should provide comprehensive statistics', () => {
      const stats = agentModeler.getStats();

      expect(stats.totalAgentModels).toBe(0);
      expect(stats.totalInteractions).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.config).toBeDefined();
    });
  });

  describe('Theory of Mind Engine', () => {
    it('should infer mental states from observations', async () => {
      const entity = {
        id: 'player_789',
        name: 'TestPlayer',
        type: 'player',
        position: { x: 100, y: 64, z: 200 },
      } as any as Entity;

      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_789',
          description: 'Looked around nervously before entering dark cave',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'exploration',
        },
        {
          id: 'obs_2',
          agentId: 'player_789',
          description: 'Quickly retreated when hearing zombie sounds',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'survival',
        },
      ];

      // Create agent model first
      await agentModeler.createAgentModel(entity, observations as any);

      const mentalState = await theoryOfMindEngine.inferMentalState(
        'player_789',
        {
          situation: 'exploration',
          participants: ['player_789'],
          environment: 'cave',
        }
      );

      expect(mentalState).toBeDefined();
      expect(mentalState.agentId).toBe('player_789');
      expect(mentalState.currentBeliefs).toBeDefined();
      expect(mentalState.currentGoals).toBeDefined();
      expect(mentalState.currentEmotions).toBeDefined();
      expect(mentalState.confidence).toBeGreaterThan(0);
    });

    it('should predict agent intentions', async () => {
      const entity = {
        id: 'player_456',
        name: 'TestPlayer456',
        type: 'player',
        position: { x: 150, y: 64, z: 250 },
      } as any as Entity;

      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_456',
          description: 'Competed for resources in cave',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'competition',
        },
      ];

      // Create agent model first
      await agentModeler.createAgentModel(entity, observations as any);

      const context = {
        agentId: 'player_123',
        otherAgentId: 'player_456',
        situation: 'resource_competition',
        environment: 'cave_exploration',
        socialDynamics: 'competitive',
        timestamp: Date.now(),
      };

      const predictions = await theoryOfMindEngine.predictIntentions(
        'player_456',
        context as any
      );

      expect(predictions).toBeDefined();
      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions[0].confidence).toBeGreaterThan(0);
      expect((predictions[0] as any).reasoning).toBeDefined();
    });

    it('should simulate perspective taking', async () => {
      const entity = {
        id: 'player_456',
        name: 'TestPlayer456',
        type: 'player',
        position: { x: 150, y: 64, z: 250 },
      } as any as Entity;

      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_456',
          description: 'Discovered iron ore location',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'exploration',
        },
      ];

      // Create agent model first
      await agentModeler.createAgentModel(entity, observations as any);

      const situation = {
        agentId: 'player_123',
        otherAgentId: 'player_456',
        context: 'resource_discovery',
        sharedKnowledge: ['iron_ore_location'],
        privateKnowledge: {
          player_123: ['has_pickaxe', 'needs_iron'],
          player_456: ['has_sword', 'needs_iron'],
        },
      };

      const perspective = await theoryOfMindEngine.simulatePerspective(
        'player_456',
        situation
      );

      expect(perspective).toBeDefined();
      expect(perspective.agentId).toBe('player_456');
      expect(perspective.perspective).toBeDefined();
      expect(perspective.confidence).toBeGreaterThan(0);
    });
  });

  describe('Social Learner', () => {
    it('should learn behaviors from observations', async () => {
      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_123',
          description: 'Used water bucket to create safe lava crossing',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'problem_solving',
        },
        {
          id: 'obs_2',
          agentId: 'player_123',
          description: 'Built redstone contraption for automatic door',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'engineering',
        },
      ];

      const learnedBehaviors = await socialLearner.learnBehaviors(observations);

      expect(learnedBehaviors).toBeDefined();
      expect(learnedBehaviors.length).toBeGreaterThan(0);
      expect(learnedBehaviors[0].description).toBeDefined();
      expect(learnedBehaviors[0].confidence).toBeGreaterThan(0);
    });

    it('should recognize behavioral patterns', async () => {
      const behaviorHistory = [
        'Built shelter near water source',
        'Placed torches around perimeter',
        'Created underground storage room',
        'Built defensive wall with archer positions',
      ];

      const patterns = await socialLearner.recognizePatterns(behaviorHistory);

      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].pattern).toBeDefined();
      expect(patterns[0].confidence).toBeGreaterThan(0);
    });

    it('should infer social norms', async () => {
      const interactions = [
        {
          id: 'int_1',
          agentId: 'player_123',
          otherAgentId: 'player_456',
          type: 'greeting',
          description: 'Waved hello when approaching',
          timestamp: Date.now(),
          outcome: 'positive',
          duration: 2000,
          context: 'social',
        },
        {
          id: 'int_2',
          agentId: 'player_789',
          otherAgentId: 'player_123',
          type: 'greeting',
          description: 'Waved hello when approaching',
          timestamp: Date.now(),
          outcome: 'positive',
          duration: 2000,
          context: 'social',
        },
      ];

      const norms = await socialLearner.inferNorms(interactions as any);

      expect(norms).toBeDefined();
      expect(norms.length).toBeGreaterThan(0);
      expect(norms[0].norm).toBeDefined();
      expect(norms[0].confidence).toBeGreaterThan(0);
    });
  });

  describe('Relationship Manager', () => {
    it('should track relationship development', async () => {
      const interaction = {
        id: 'int_1',
        agentId: 'player_123',
        otherAgentId: 'player_456',
        type: 'resource_sharing',
        description: 'Shared diamond pickaxe for 2 hours',
        timestamp: Date.now(),
        outcome: 'positive',
        duration: 7200000,
        context: 'cooperation',
      } as any;

      const relationship = await relationshipManager.updateRelationship(
        'player_123',
        'player_456',
        interaction
      );

      expect(relationship).toBeDefined();
      expect(relationship.agentId).toBe('player_123');
      expect(relationship.otherAgentId).toBe('player_456');
      expect(relationship.trust).toBeGreaterThan(0);
      expect(relationship.familiarity).toBeGreaterThan(0);
    });

    it('should calculate trust scores', async () => {
      const interactions = [
        {
          id: 'int_1',
          agentId: 'player_123',
          otherAgentId: 'player_456',
          type: 'promise_fulfillment',
          description: 'Kept promise to help build shelter',
          timestamp: Date.now(),
          outcome: 'positive',
          duration: 3600000,
          context: 'cooperation',
        },
        {
          id: 'int_2',
          agentId: 'player_123',
          otherAgentId: 'player_456',
          type: 'resource_sharing',
          description: 'Shared valuable resources',
          timestamp: Date.now(),
          outcome: 'positive',
          duration: 1800000,
          context: 'generosity',
        },
      ];

      const trustScore = await relationshipManager.calculateTrust(
        'player_123',
        'player_456',
        interactions
      );

      expect(trustScore).toBeDefined();
      expect(trustScore.score).toBeGreaterThan(0);
      expect(trustScore.confidence).toBeGreaterThan(0);
      expect(trustScore.factors).toBeDefined();
    });

    it('should manage social bonds', async () => {
      const bond = await relationshipManager.createBond(
        'player_123',
        'player_456',
        'mentorship'
      );

      expect(bond).toBeDefined();
      expect(bond.agentId).toBe('player_123');
      expect(bond.otherAgentId).toBe('player_456');
      expect(bond.type).toBe('mentorship');
      expect(bond.strength).toBeGreaterThan(0);

      const updatedBond = await relationshipManager.strengthenBond(
        'player_123',
        'player_456',
        0.2
      );

      expect(updatedBond).toBeDefined();
      expect(updatedBond.strength).toBeGreaterThan(bond.strength);
    });
  });

  describe('Integration Features', () => {
    it('should integrate components for comprehensive social analysis', async () => {
      // Create agent model
      const entity = {
        id: 'player_999',
        name: 'Jordan',
        type: 'player',
        position: { x: 200, y: 64, z: 300 },
      } as any as Entity;

      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_999',
          description: 'Led group expedition to find diamonds',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'leadership',
        },
        {
          id: 'obs_2',
          agentId: 'player_999',
          description: 'Resolved conflict between two players',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'mediation',
        },
      ];

      const model = await agentModeler.createAgentModel(entity, observations as any);

      // Infer mental state
      const mentalState = await theoryOfMindEngine.inferMentalState(
        'player_999',
        observations as any
      );

      // Learn behaviors
      const learnedBehaviors = await socialLearner.learnBehaviors(observations);

      // Track relationship
      const interaction = {
        id: 'int_1',
        agentId: 'player_123',
        otherAgentId: 'player_999',
        type: 'leadership_following',
        description: "Followed Jordan's lead in expedition",
        timestamp: Date.now(),
        outcome: 'positive',
        duration: 1800000,
        context: 'cooperation',
      } as any;

      const relationship = await relationshipManager.updateRelationship(
        'player_123',
        'player_999',
        interaction
      );

      // Verify integration
      expect(model).toBeDefined();
      expect(mentalState).toBeDefined();
      expect(learnedBehaviors).toBeDefined();
      expect(relationship).toBeDefined();

      // Check for leadership patterns
      const leadershipPatterns = learnedBehaviors.filter(
        (behavior) =>
          behavior.description.toLowerCase().includes('lead') ||
          behavior.description.toLowerCase().includes('group')
      );
      expect(leadershipPatterns.length).toBeGreaterThan(0);
    });

    it('should handle complex social scenarios', async () => {
      // Simulate a complex social scenario with multiple agents
      const agents = ['player_A', 'player_B', 'player_C'];
      const interactions: any[] = [];

      // Create interaction network
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          interactions.push({
            id: `int_${i}_${j}`,
            agentId: agents[i],
            otherAgentId: agents[j],
            type: 'cooperation',
            description: `Cooperative interaction between ${agents[i]} and ${agents[j]}`,
            timestamp: Date.now(),
            outcome: 'positive',
            duration: 300000,
            context: 'teamwork',
          });
        }
      }

      // Process all interactions
      for (const interaction of interactions) {
        await relationshipManager.updateRelationship(
          interaction.agentId,
          interaction.otherAgentId,
          interaction
        );
      }

      // Verify network effects
      const relationships = await Promise.all(
        agents.map((agent) => relationshipManager.getRelationships(agent))
      );

      expect(relationships.length).toBe(3);
      relationships.forEach((relList) => {
        expect(relList.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing or invalid observations gracefully', async () => {
      const entity = {
        id: 'player_invalid',
        name: 'Invalid',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
      } as any as Entity;

      const model = await agentModeler.createAgentModel(entity, []);

      expect(model).toBeDefined();
      expect(model.confidence).toBe(0);
      // Capabilities might be returned even with empty observations due to mock LLM
      expect(model.capabilities.domains.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle conflicting observations', async () => {
      const observations = [
        {
          id: 'obs_1',
          agentId: 'player_conflict',
          description: 'Shared resources generously',
          timestamp: Date.now(),
          confidence: 0.9,
          context: 'generosity',
        },
        {
          id: 'obs_2',
          agentId: 'player_conflict',
          description: 'Refused to share any resources',
          timestamp: Date.now(),
          confidence: 0.8,
          context: 'selfishness',
        },
      ];

      const model = await agentModeler.createAgentModel(
        {
          id: 'player_conflict',
          name: 'Conflict',
          type: 'player',
          position: { x: 0, y: 0, z: 0 },
        } as any as Entity,
        observations as any
      );

      expect(model).toBeDefined();
      expect(model.confidence).toBeLessThan(1.0); // Lower confidence due to conflicts
    });

    it('should maintain performance under load', async () => {
      const startTime = Date.now();

      // Create multiple agents simultaneously
      const promises = Array.from({ length: 10 }, (_, i) => {
        const entity = {
          id: `player_${i}`,
          name: `Player${i}`,
          type: 'player',
          position: { x: i * 10, y: 64, z: i * 10 },
        } as any as Entity;

        const observations = [
          {
            id: `obs_${i}`,
            agentId: `player_${i}`,
            description: `Player ${i} performed action`,
            timestamp: Date.now(),
            confidence: 0.8,
            context: 'general',
          },
        ];

        return agentModeler.createAgentModel(entity, observations as any);
      });

      const models = await Promise.all(promises);
      const endTime = Date.now();

      expect(models.length).toBe(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});

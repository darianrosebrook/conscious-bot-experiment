/**
 * Tests for ReAct Arbiter
 *
 * @author @darianrosebrook
 */

import {
  ReActArbiter,
  ReActContext,
  WorldSnapshot,
  InventoryState,
  Goal,
} from '../ReActArbiter';

describe('ReActArbiter', () => {
  let arbiter: ReActArbiter;
  let mockContext: ReActContext;

  beforeEach(() => {
    arbiter = new ReActArbiter({
      provider: 'ollama',
      model: 'llama3.2',
      maxTokens: 1000,
      temperature: 0.3,
      timeout: 30000,
      retries: 3,
    });

    const snapshot: WorldSnapshot = {
      stateId: 'test-snapshot-1',
      position: { x: 100, y: 64, z: 100 },
      biome: 'plains',
      time: 6000,
      light: 15,
      hazards: ['none'],
      nearbyEntities: [],
      nearbyBlocks: [],
      weather: 'clear',
    };

    const inventory: InventoryState = {
      stateId: 'test-inventory-1',
      items: [
        { id: 'item-1', name: 'wooden_pickaxe', quantity: 1, durability: 59 },
        { id: 'item-2', name: 'oak_log', quantity: 8 },
      ],
      armor: [],
      tools: [],
    };

    const goals: Goal[] = [
      {
        id: 'goal-1',
        type: 'survival',
        description: 'Build a shelter',
        priority: 0.8,
        utility: 0.9,
        source: 'drive',
      },
    ];

    mockContext = {
      snapshot,
      inventory,
      goalStack: goals,
      memorySummaries: [],
    };
  });

  describe('reason', () => {
    it('should execute a ReAct reasoning step', async () => {
      const step = await arbiter.reason(mockContext);

      expect(step).toBeDefined();
      expect(step.thoughts).toBeDefined();
      expect(step.selectedTool).toBeDefined();
      expect(step.args).toBeDefined();
    });

    it('should validate tool selection', async () => {
      const step = await arbiter.reason(mockContext);

      // Should select a valid tool from the registry
      const validTools = [
        'find_blocks',
        'pathfind',
        'dig',
        'place',
        'craft',
        'smelt',
        'query_inventory',
        'waypoint',
        'sense_hostiles',
        'chat',
      ];
      expect(validTools).toContain(step.selectedTool);
    });

    it('should include tool arguments', async () => {
      const step = await arbiter.reason(mockContext);

      expect(step.args).toBeDefined();
      expect(typeof step.args).toBe('object');
    });
  });

  describe('reflect', () => {
    it('should generate reflection on success', async () => {
      const episodeTrace = [
        {
          action: 'find_blocks',
          result: 'success',
          data: { blocks: ['oak_log'] },
        },
        { action: 'dig', result: 'success', data: { blocks_removed: 1 } },
      ];

      const reflection = await arbiter.reflect(episodeTrace, 'success');

      expect(reflection).toBeDefined();
      expect(reflection.situation).toBeDefined();
      expect(reflection.lesson).toBeDefined();
    });

    it('should generate reflection on failure', async () => {
      const episodeTrace = [
        {
          action: 'find_blocks',
          result: 'success',
          data: { blocks: ['oak_log'] },
        },
        { action: 'dig', result: 'failure', error: 'hostile_detected' },
      ];

      const reflection = await arbiter.reflect(episodeTrace, 'failure', [
        'hostile_detected',
      ]);

      expect(reflection).toBeDefined();
      expect(reflection.situation).toBeDefined();
      expect(reflection.failure).toBeDefined();
      expect(reflection.lesson).toBeDefined();
    });
  });

  describe('getRelevantReflexionHints', () => {
    it('should return relevant hints for a situation', async () => {
      // First generate some reflections
      const episodeTrace = [
        { action: 'mine_at_night', result: 'failure', error: 'zombie_swarm' },
      ];
      await arbiter.reflect(episodeTrace, 'failure', ['zombie_swarm']);

      const hints = arbiter.getRelevantReflexionHints('night_mining');
      expect(hints).toBeDefined();
      expect(Array.isArray(hints)).toBe(true);
    });
  });
});

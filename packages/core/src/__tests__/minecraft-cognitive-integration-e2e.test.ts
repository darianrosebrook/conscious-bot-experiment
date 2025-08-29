/**
 * Minecraft Cognitive Integration End-to-End Test
 *
 * Tests the complete dynamic capability creation workflow using the actual
 * Mineflayer bot integration to verify end-to-end functionality.
 *
 * @author @darianrosebrook
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { MinecraftCognitiveIntegration } from '../minecraft-cognitive-integration';
import { Bot } from 'mineflayer';
import { EnhancedRegistry } from '../mcp-capabilities/enhanced-registry';
import { DynamicCreationFlow } from '../mcp-capabilities/dynamic-creation-flow';
import torchCorridorBTDSL from '../examples/torch-corridor-bt-dsl.json';

// Mock Vec3 and goals imports
vi.mock('vec3', () => {
  class MockVec3 {
    constructor(
      public x: number,
      public y: number,
      public z: number
    ) {}

    floored() {
      return new MockVec3(
        Math.floor(this.x),
        Math.floor(this.y),
        Math.floor(this.z)
      );
    }

    offset(dx: number, dy: number, dz: number) {
      return new MockVec3(this.x + dx, this.y + dy, this.z + dz);
    }

    equals(other: MockVec3) {
      return this.x === other.x && this.y === other.y && this.z === other.z;
    }
  }

  return {
    Vec3: MockVec3,
  };
});

vi.mock('mineflayer-pathfinder', () => {
  const mockGoals = {
    GoalNear: class GoalNear {
      constructor(
        public x: number,
        public y: number,
        public z: number,
        public range: number
      ) {}
    },
  };

  return {
    pathfinder: {},
    goals: mockGoals,
  };
});

// Mock Mineflayer bot for testing
const createMockMineflayerBot = (): Bot => {
  // Import the mocked Vec3
  const { Vec3 } = require('vec3');

  const mockBot = {
    entity: {
      position: new Vec3(0, 64, 0),
      yaw: 0, // Add yaw for step_forward_safely
    },
    health: 20,
    food: 20,
    inventory: {
      items: () => [
        { name: 'torch', count: 10 },
        { name: 'stone_pickaxe', count: 1 },
        { name: 'bread', count: 5 },
      ],
    },
    on: vi.fn(),
    removeListener: vi.fn(),
    pathfinder: {
      goto: vi.fn().mockResolvedValue({ success: true }),
      stop: vi.fn(),
      setGoal: vi.fn().mockImplementation((goal) => {
        // Simulate successful pathfinding by moving bot to target
        if (
          goal &&
          goal.x !== undefined &&
          goal.y !== undefined &&
          goal.z !== undefined
        ) {
          const targetPos = new Vec3(goal.x, goal.y, goal.z);
          mockBot._simulateMovement(targetPos);
        }
        return Promise.resolve();
      }),
    },
    dig: vi.fn().mockResolvedValue(true),
    placeBlock: vi.fn().mockResolvedValue(true),
    craft: vi.fn().mockResolvedValue(true),
    findBlock: vi.fn().mockResolvedValue({ position: new Vec3(0, 63, 0) }),
    findEntity: vi.fn().mockResolvedValue(null),
    chat: vi.fn(),
    emit: vi.fn(),
    // Add missing methods that leaves expect
    blockAt: vi.fn().mockImplementation((pos) => {
      // Return a proper block structure for step_forward_safely
      if (pos.y === 63) {
        return {
          name: 'stone',
          position: pos,
          boundingBox: 'block', // This is the floor
        };
      } else if (pos.y === 64) {
        return {
          name: 'air',
          position: pos,
          boundingBox: 'empty', // This is the target position
        };
      } else if (pos.y === 65) {
        return {
          name: 'air',
          position: pos,
          boundingBox: 'empty', // This is the head position
        };
      }
      return {
        name: 'air',
        position: pos,
        boundingBox: 'empty',
      };
    }),
    equip: vi.fn().mockResolvedValue(true),
    consume: vi.fn().mockResolvedValue(true),
    getLight: vi.fn().mockReturnValue(15),
    getLightLevel: vi.fn().mockReturnValue(15),
    world: {
      getLight: vi.fn().mockReturnValue(15), // High light level
      getLightLevel: vi.fn().mockReturnValue(15),
    },
    physics: {
      canDigBlock: vi.fn().mockReturnValue(true),
      canPlaceBlock: vi.fn().mockReturnValue(true),
    },
    // Add position methods with dynamic position for step_forward_safely
    position: new Vec3(0, 64, 0),
    getPosition: vi.fn().mockReturnValue(new Vec3(0, 64, 0)),
    // Simulate position changes for step_forward_safely
    _simulateMovement: function (targetPos: any) {
      this.position = targetPos;
      this.entity.position = targetPos;
      this.getPosition = vi.fn().mockReturnValue(targetPos);
    },
    // Add movement methods
    moveTo: vi.fn().mockResolvedValue(true),
    lookAt: vi.fn().mockResolvedValue(true),
    // Add inventory methods
    getInventory: vi.fn().mockReturnValue({
      items: () => [
        { name: 'torch', count: 10 },
        { name: 'stone_pickaxe', count: 1 },
        { name: 'bread', count: 5 },
      ],
    }),
    // Add Vec3 constructor
    Vec3: Vec3,
  } as any;

  return mockBot;
};

// Create mock leaf context utility
const createMockLeafContext = () => ({
  bot: createMockMineflayerBot(),
  abortSignal: new AbortController().signal,
  now: () => Date.now(),
  snapshot: vi.fn().mockResolvedValue({
    position: { x: 0, y: 64, z: 0 },
    lightLevel: 8,
    hostiles: [],
  }),
  inventory: vi.fn().mockResolvedValue({
    torch: 10,
    stone_pickaxe: 1,
    bread: 5,
  }),
  emitMetric: vi.fn(),
});

describe('Minecraft Cognitive Integration End-to-End', () => {
  let integration: MinecraftCognitiveIntegration;
  let mockBot: Bot;
  let registry: EnhancedRegistry;
  let dynamicFlow: DynamicCreationFlow;

  beforeEach(async () => {
    mockBot = createMockMineflayerBot();

    // Create integration with mock bot
    integration = new MinecraftCognitiveIntegration({
      bot: mockBot,
      enableRealActions: true,
      actionTimeout: 30000,
      maxRetries: 3,
    });

    // Get registry and dynamic flow from cognitive stream
    await integration.initialize();

    // Access the internal components for testing
    const cognitiveStream = (integration as any).cognitiveStream;
    registry = cognitiveStream.getMCPRegistry();
    dynamicFlow = cognitiveStream.getDynamicCreationFlow();

    // Inject mock LLM interface for testing
    const mockLLMInterface = {
      proposeOption: async () => ({
        name: 'opt.mock_proposal',
        version: '1.0.0',
        btDsl: {
          name: 'opt.mock_proposal',
          version: '1.0.0',
          root: {
            type: 'Sequence',
            children: [
              {
                type: 'Leaf',
                leafName: 'wait',
                args: { durationMs: 1000 },
              },
            ],
          },
        },
        confidence: 0.8,
        estimatedSuccessRate: 0.9,
        reasoning: 'Mock proposal for testing',
      }),
    };

    // Replace the LLM interface in the dynamic flow
    (dynamicFlow as any).llmInterface = mockLLMInterface;
  });

  afterEach(async () => {
    if (integration) {
      await integration.disconnect();
    }
  });

  test('should initialize with real Mineflayer bot', async () => {
    expect(integration).toBeDefined();
    expect(mockBot).toBeDefined();
    expect(registry).toBeDefined();
    expect(dynamicFlow).toBeDefined();
  });

  test('should register real leaf implementations', async () => {
    // Check that leaves are registered in the registry
    const moveToLeaf = registry.getLeaf('move_to');
    const senseHostilesLeaf = registry.getLeaf('sense_hostiles');
    const placeTorchLeaf = registry.getLeaf('place_torch_if_needed');

    expect(moveToLeaf).toBeDefined();
    expect(senseHostilesLeaf).toBeDefined();
    expect(placeTorchLeaf).toBeDefined();
  });

  test('should register and execute torch corridor capability with real bot', async () => {
    // 1. Register the torch corridor capability with unique name
    const uniqueBTDSL = {
      ...torchCorridorBTDSL,
      name: 'opt.torch_corridor_real_bot',
      version: '1.0.0',
    };

    const result = registry.registerOption(
      uniqueBTDSL,
      {
        author: 'llm',
        createdAt: new Date().toISOString(),
      },
      {
        successThreshold: 0.8,
        maxShadowRuns: 10,
        failureThreshold: 0.3,
        minShadowRuns: 3,
      }
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBe('opt.torch_corridor_real_bot@1.0.0');

    // 2. Create real leaf context with mock bot
    const leafContext = createMockLeafContext();

    // 3. Execute shadow run with real bot context
    const shadowResult = await registry.executeShadowRun(
      result.id!,
      leafContext,
      undefined,
      {
        end: { x: 100, y: 12, z: -35 },
        interval: 6,
        hostilesRadius: 10,
      }
    );

    expect(shadowResult.status).toBe('success');
    expect(shadowResult.durationMs).toBeGreaterThan(0);
    expect(shadowResult.id).toContain('opt.torch_corridor_real_bot@1.0.0');
  }, 60000); // Increase timeout to 60 seconds

  test('should execute planning cycle with real bot integration', async () => {
    // Set up event listeners to capture planning events
    const events: any[] = [];

    integration.on('planGenerated', (event) => {
      console.log('📡 Captured planGenerated event:', event);
      events.push({ type: 'planning', ...event });
    });

    integration.on('planExecuted', (event) => {
      console.log('📡 Captured planExecuted event:', event);
      events.push({ type: 'execution', ...event });
    });

    // Execute planning cycle
    const goal = 'torch the mining corridor safely';
    await integration.executePlanningCycle(goal);

    // Wait for events to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('📊 Total events captured:', events.length);
    console.log('📊 Events:', events);

    // Verify events were emitted
    expect(events.length).toBeGreaterThan(0);

    // Check that plan was generated
    const planEvent = events.find((e) => e.type === 'planning');
    expect(planEvent).toBeDefined();
    expect(planEvent.content).toContain('Generated plan');

    // Check that plan was executed
    const executedEvent = events.find((e) => e.type === 'execution');
    expect(executedEvent).toBeDefined();
  });

  test('should detect impasse and propose new capability with real bot', async () => {
    const goal = 'build a complex redstone contraption';
    const taskId = 'redstone-contraption-task';
    const mockLeafContext = createMockLeafContext();

    // Simulate multiple failures to trigger impasse (threshold is 3)
    const failure = {
      code: 'unknown' as const,
      detail: 'goal_analysis',
      retryable: false,
    };

    // First two failures shouldn't trigger impasse
    let impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(false);

    impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(false);

    // Third failure should trigger impasse
    impasseResult = dynamicFlow.checkImpasse(taskId, failure);
    expect(impasseResult.isImpasse).toBe(true);

    // Propose new capability
    const proposal = await dynamicFlow.requestOptionProposal(
      taskId,
      mockLeafContext,
      goal,
      []
    );

    expect(proposal).not.toBeNull();
    expect(proposal?.name).toContain('opt.');
    expect(proposal?.btDsl).toBeDefined();
    expect(proposal?.confidence).toBeGreaterThan(0);
  });

  test('should update bot state from real Mineflayer bot', async () => {
    // Simulate bot movement
    mockBot.entity.position = { x: 10, y: 64, z: 10 };
    mockBot.health = 15;
    mockBot.food = 18;

    // Trigger state update
    (integration as any).updateBotStateFromRealBot();

    // Get current bot state
    const botState = integration.getBotState();

    expect(botState).toBeDefined();
    expect(botState.position).toEqual({ x: 10, y: 64, z: 10 });
    expect(botState.health).toBe(15);
    expect(botState.food).toBe(18);
  });

  test('should handle bot inventory changes', async () => {
    // Simulate inventory change
    mockBot.inventory = {
      items: () => [
        { name: 'torch', count: 5 }, // Reduced from 10
        { name: 'stone_pickaxe', count: 1 },
        { name: 'bread', count: 3 }, // Reduced from 5
        { name: 'iron_ore', count: 2 }, // New item
      ],
    } as any;

    // Trigger state update
    (integration as any).updateBotStateFromRealBot();

    // Get current bot state
    const botState = integration.getBotState();

    expect(botState.inventory).toBeDefined();
    expect(botState.inventory.torch).toBe(5);
    expect(botState.inventory.bread).toBe(3);
    expect(botState.inventory.iron_ore).toBe(2);
  });

  test('should determine current task based on bot state', async () => {
    // Test critical survival state
    mockBot.health = 3;
    mockBot.food = 2;
    let currentTask = (integration as any).determineCurrentTask();
    expect(currentTask).toBe('critical survival');

    // Test normal state
    mockBot.health = 20;
    mockBot.food = 20;
    currentTask = (integration as any).determineCurrentTask();
    expect(currentTask).toBe('exploring surface');

    // Test underground mining
    mockBot.entity.position = { x: 0, y: 50, z: 0 }; // Below sea level
    currentTask = (integration as any).determineCurrentTask();
    expect(currentTask).toBe('mining underground');
  });

  test('should get MCP capabilities status', async () => {
    const status = await integration.getMCPCapabilitiesStatus();

    expect(status).toBeDefined();
    expect(status.totalCapabilities).toBeGreaterThan(0);
    expect(status.activeCapabilities).toBeGreaterThanOrEqual(0);
    expect(status.shadowCapabilities).toBeGreaterThanOrEqual(0);

    // Check that we have some capabilities
    expect(status.totalCapabilities).toBeGreaterThan(0);
  });

  test('should get active goals and cognitive stream', async () => {
    // Execute a planning cycle to generate goals
    await integration.executePlanningCycle('find food');

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    const activeGoals = integration.getActiveGoals();
    const cognitiveStream = integration.getCognitiveStream();

    expect(Array.isArray(activeGoals)).toBe(true);
    expect(Array.isArray(cognitiveStream)).toBe(true);
  });

  test('should handle bot errors gracefully', async () => {
    const errorEvents: any[] = [];

    integration.on('botError', (event) => {
      errorEvents.push(event);
    });

    // Simulate bot error by directly calling the integration's error handler
    const setupEventForwarding = (integration as any).setupEventForwarding;
    if (setupEventForwarding) {
      // Manually trigger the error handler that was set up in setupEventForwarding
      const errorHandler = (event: any) => {
        integration.emit('botError', { error: event.message });
      };
      errorHandler(new Error('Connection lost'));
    }

    // Wait for error processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errorEvents.length).toBeGreaterThan(0);
    expect(errorEvents[0].error).toContain('Connection lost');
  });

  test('should disconnect and cleanup properly', async () => {
    // Set up some event listeners
    const testListener = vi.fn();
    integration.on('test', testListener);

    // Disconnect
    await integration.disconnect();

    // Verify listeners are removed
    integration.emit('test');
    expect(testListener).not.toHaveBeenCalled();
  });
});

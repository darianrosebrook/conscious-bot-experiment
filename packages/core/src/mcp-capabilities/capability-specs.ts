/**
 * Capability Specifications - Predefined Minecraft action capabilities
 *
 * Defines all available Minecraft actions as structured capabilities with
 * preconditions, effects, safety constraints, and execution metadata.
 *
 * @author @darianrosebrook
 */

import {
  CapabilitySpec,
  RiskLevel,
  CapabilityExecutor,
  CapabilityValidator,
  ExecutionRequest,
  ExecutionContext,
  ExecutionResult,
  Effect,
} from './types';

// ===== BASE EXECUTORS =====

/**
 * Base executor for Minecraft capabilities
 */
abstract class BaseMinecraftExecutor implements CapabilityExecutor {
  abstract execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult>;

  estimateCost(request: ExecutionRequest, context: ExecutionContext): number {
    // Default cost estimation - can be overridden
    return 10;
  }

  canExecute(request: ExecutionRequest, context: ExecutionContext): boolean {
    // Basic health and safety checks
    return context.agentHealth > 0.1 && context.dangerLevel < 0.8;
  }
}

/**
 * Base validator for Minecraft capabilities
 */
abstract class BaseMinecraftValidator implements CapabilityValidator {
  abstract validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean>;

  validateContext(context: ExecutionContext): boolean {
    // Basic context validation
    return (
      context.agentHealth > 0 &&
      context.agentPosition.y > -64 &&
      context.agentPosition.y < 320
    );
  }

  abstract predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[];
}

// ===== MOVEMENT CAPABILITIES =====

class MoveForwardExecutor extends BaseMinecraftExecutor {
  async execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Simulate movement execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: true,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [
          {
            type: 'entity',
            change: 'position_updated',
            location: 'agent',
            metadata: { direction: 'forward', distance: 1 },
          },
        ],
        actualCost: 5,
        retryCount: 0,
      };
    } catch (error) {
      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
      };
    }
  }
}

class MoveForwardValidator extends BaseMinecraftValidator {
  async validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean> {
    // Check if path is clear and agent can move
    return context.agentHealth > 0.1 && context.dangerLevel < 0.5;
  }

  predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[] {
    return [
      {
        type: 'entity',
        change: 'position_updated',
        location: 'agent',
        metadata: { direction: 'forward', distance: 1 },
      },
    ];
  }
}

class ExploreExecutor extends BaseMinecraftExecutor {
  async execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Simulate exploration movement
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const distance = Math.random() * 50; // Random distance up to 50 blocks

      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: true,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [
          {
            type: 'entity',
            change: 'position_updated',
            location: 'agent',
            metadata: { action: 'exploration', random_move: true, distance },
          },
          {
            type: 'world',
            change: 'area_scanned',
            location: 'surrounding',
            metadata: { radius: 50, type: 'exploration' },
          },
        ],
        actualCost: 15,
        retryCount: 0,
      };
    } catch (error) {
      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
      };
    }
  }

  estimateCost(request: ExecutionRequest, context: ExecutionContext): number {
    return 15; // Exploration cost
  }
}

class ExploreValidator extends BaseMinecraftValidator {
  async validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean> {
    // Check if agent has enough health and is in a safe environment
    return context.agentHealth > 0.2 && context.dangerLevel < 0.5;
  }

  predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[] {
    return [
      {
        type: 'entity',
        change: 'position_updated',
        location: 'agent',
        metadata: { action: 'exploration', random_move: true },
      },
      {
        type: 'world',
        change: 'area_scanned',
        location: 'surrounding',
        metadata: { radius: 50, type: 'exploration' },
      },
    ];
  }
}

// ===== BLOCK MANIPULATION CAPABILITIES =====

class PlaceBlockExecutor extends BaseMinecraftExecutor {
  async execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const blockType = request.parameters.blockType || 'torch';

    try {
      // Simulate block placement
      await new Promise((resolve) => setTimeout(resolve, 200));

      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: true,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [
          {
            type: 'world',
            change: 'block_placed',
            location: 'target',
            item: blockType,
            quantity: 1,
          },
          {
            type: 'inventory',
            change: 'item_consumed',
            item: blockType,
            quantity: 1,
          },
        ],
        actualCost: 12,
        resourcesUsed: { [blockType]: 1 },
        retryCount: 0,
      };
    } catch (error) {
      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
      };
    }
  }

  estimateCost(request: ExecutionRequest, context: ExecutionContext): number {
    return 12; // Standard block placement cost
  }
}

class PlaceBlockValidator extends BaseMinecraftValidator {
  async validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean> {
    const blockType = request.parameters.blockType || 'torch';

    // Check if agent has the required item
    const hasItem = context.inventory.some(
      (item) => item.item === blockType && item.quantity > 0
    );

    // Check if within reach (simplified)
    return hasItem && context.agentHealth > 0.1;
  }

  predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[] {
    const blockType = request.parameters.blockType || 'torch';

    const effects: Effect[] = [
      {
        type: 'world',
        change: 'block_placed',
        location: 'target',
        item: blockType,
        quantity: 1,
      },
      {
        type: 'inventory',
        change: 'item_consumed',
        item: blockType,
        quantity: 1,
      },
    ];

    // Add lighting effect for torches
    if (blockType === 'torch') {
      effects.push({
        type: 'lighting',
        change: 'light_level_increased',
        area: 'target.radius(8)',
        metadata: { lightLevel: 14 },
      });
    }

    return effects;
  }
}

// ===== MINING CAPABILITIES =====

class MineBlockExecutor extends BaseMinecraftExecutor {
  async execute(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const blockType = request.parameters.blockType || 'stone';
    const tool = request.parameters.tool || 'hand';

    try {
      // Simulate mining time based on block type and tool
      const miningTime = this.calculateMiningTime(blockType, tool);
      await new Promise((resolve) => setTimeout(resolve, miningTime));

      const drops = this.calculateDrops(blockType, tool);

      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: true,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [
          {
            type: 'world',
            change: 'block_removed',
            location: 'target',
            item: blockType,
            quantity: 1,
          },
          {
            type: 'inventory',
            change: 'items_gained',
            metadata: { drops },
          },
        ],
        actualCost: 25,
        resourcesUsed: { durability: 1 },
        retryCount: 0,
      };
    } catch (error) {
      return {
        id: `exec_${Date.now()}`,
        requestId: request.id,
        capabilityId: request.capabilityId,
        success: false,
        startTime,
        endTime: Date.now(),
        duration: Date.now() - startTime,
        effects: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount: 0,
      };
    }
  }

  private calculateMiningTime(blockType: string, tool: string): number {
    // Simplified mining time calculation
    const baseTimes: Record<string, number> = {
      dirt: 100,
      stone: 800,
      iron_ore: 1200,
      diamond_ore: 2000,
    };

    const toolMultipliers: Record<string, number> = {
      hand: 1.0,
      wooden_pickaxe: 0.5,
      stone_pickaxe: 0.3,
      iron_pickaxe: 0.2,
      diamond_pickaxe: 0.15,
    };

    const baseTime = baseTimes[blockType] || 500;
    const multiplier = toolMultipliers[tool] || 1.0;

    return Math.floor(baseTime * multiplier);
  }

  private calculateDrops(
    blockType: string,
    tool: string
  ): Array<{ item: string; quantity: number }> {
    // Simplified drop calculation
    const drops: Record<string, Array<{ item: string; quantity: number }>> = {
      stone: [{ item: 'cobblestone', quantity: 1 }],
      iron_ore: [{ item: 'raw_iron', quantity: 1 }],
      coal_ore: [{ item: 'coal', quantity: 1 }],
      dirt: [{ item: 'dirt', quantity: 1 }],
    };

    return drops[blockType] || [{ item: blockType, quantity: 1 }];
  }

  estimateCost(request: ExecutionRequest, context: ExecutionContext): number {
    const blockType = request.parameters.blockType || 'stone';
    const tool = request.parameters.tool || 'hand';

    return this.calculateMiningTime(blockType, tool) / 10; // Cost roughly proportional to time
  }
}

class MineBlockValidator extends BaseMinecraftValidator {
  async validatePreconditions(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Promise<boolean> {
    // Check if agent has appropriate tool and is within reach
    return context.agentHealth > 0.2 && context.dangerLevel < 0.6;
  }

  predictEffects(
    request: ExecutionRequest,
    context: ExecutionContext
  ): Effect[] {
    const blockType = request.parameters.blockType || 'stone';

    return [
      {
        type: 'world',
        change: 'block_removed',
        location: 'target',
        item: blockType,
        quantity: 1,
      },
      {
        type: 'inventory',
        change: 'items_gained',
        metadata: { estimated: true },
      },
    ];
  }
}

// ===== CAPABILITY SPECIFICATIONS =====

export const MOVEMENT_CAPABILITIES: CapabilitySpec[] = [
  {
    id: 'move_forward',
    name: 'Move Forward',
    description: 'Move the agent one block forward',
    category: 'movement',

    preconditions: [
      {
        type: 'spatial',
        condition: 'path_clear',
        args: { direction: 'forward', distance: 1 },
        description: 'Path ahead must be clear',
      },
      {
        type: 'environmental',
        condition: 'stable_ground',
        args: {},
        description: 'Agent must be on stable ground',
      },
    ],

    effects: [
      {
        type: 'entity',
        change: 'position_updated',
        location: 'agent',
        metadata: { direction: 'forward', distance: 1 },
      },
    ],

    costHint: 5,
    durationMs: 100,
    energyCost: 1,

    safetyTags: ['reversible', 'no_grief'],
    constitutionalRules: ['avoid_dangerous_areas'],
    riskLevel: RiskLevel.MINIMAL,

    cooldownMs: 0,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },

  {
    id: 'turn_left',
    name: 'Turn Left',
    description: 'Rotate the agent 90 degrees to the left',
    category: 'movement',

    preconditions: [],
    effects: [
      {
        type: 'entity',
        change: 'orientation_updated',
        location: 'agent',
        metadata: { rotation: -90 },
      },
    ],

    costHint: 2,
    durationMs: 50,
    energyCost: 0,

    safetyTags: ['reversible', 'no_grief'],
    constitutionalRules: [],
    riskLevel: RiskLevel.MINIMAL,

    cooldownMs: 0,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },

  {
    id: 'jump',
    name: 'Jump',
    description: 'Make the agent jump',
    category: 'movement',

    preconditions: [
      {
        type: 'environmental',
        condition: 'on_ground',
        args: {},
        description: 'Agent must be on ground to jump',
      },
    ],

    effects: [
      {
        type: 'entity',
        change: 'position_updated',
        location: 'agent',
        metadata: { action: 'jump', height: 1.25 },
      },
    ],

    costHint: 8,
    durationMs: 200,
    energyCost: 2,

    safetyTags: ['reversible'],
    constitutionalRules: ['avoid_fall_damage'],
    riskLevel: RiskLevel.LOW,

    cooldownMs: 100,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },

  {
    id: 'explore',
    name: 'Explore Area',
    description:
      'Explore the surrounding area by moving to a random location within range',
    category: 'movement',

    preconditions: [
      {
        type: 'spatial',
        condition: 'has_space',
        args: { radius: 50 },
        description: 'Must have space to explore within 50 blocks',
      },
      {
        type: 'environmental',
        condition: 'safe_environment',
        args: {},
        description: 'Environment must be safe for exploration',
      },
    ],

    effects: [
      {
        type: 'entity',
        change: 'position_updated',
        location: 'agent',
        metadata: { action: 'exploration', random_move: true },
      },
      {
        type: 'world',
        change: 'area_scanned',
        location: 'surrounding',
        metadata: { radius: 50, type: 'exploration' },
      },
    ],

    costHint: 15,
    durationMs: 5000,
    energyCost: 5,

    safetyTags: ['reversible', 'no_grief'],
    constitutionalRules: ['avoid_dangerous_areas', 'respect_boundaries'],
    riskLevel: RiskLevel.LOW,

    cooldownMs: 10000, // 10 second cooldown
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },
];

export const BLOCK_CAPABILITIES: CapabilitySpec[] = [
  {
    id: 'place_block',
    name: 'Place Block',
    description: 'Place a block at the specified coordinates',
    category: 'block_manipulation',

    preconditions: [
      {
        type: 'inventory',
        condition: 'has_item',
        args: { item: 'parameter.blockType', min: 1 },
        description: 'Must have block in inventory',
      },
      {
        type: 'spatial',
        condition: 'within_reach',
        args: { distance: 4 },
        description: 'Target must be within reach',
      },
      {
        type: 'spatial',
        condition: 'block_placeable',
        args: {},
        description: 'Target location must allow block placement',
      },
    ],

    effects: [
      {
        type: 'world',
        change: 'block_placed',
        location: 'target',
        item: 'parameter.blockType',
        quantity: 1,
      },
      {
        type: 'inventory',
        change: 'item_consumed',
        item: 'parameter.blockType',
        quantity: 1,
      },
    ],

    costHint: 12,
    durationMs: 200,
    energyCost: 1,

    safetyTags: ['reversible', 'constructive'],
    constitutionalRules: ['no_destructive_placement', 'respect_property'],
    riskLevel: RiskLevel.LOW,

    cooldownMs: 50,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },

  {
    id: 'mine_block',
    name: 'Mine Block',
    description: 'Mine a block at the specified coordinates',
    category: 'block_manipulation',

    preconditions: [
      {
        type: 'spatial',
        condition: 'within_reach',
        args: { distance: 4 },
        description: 'Target must be within reach',
      },
      {
        type: 'inventory',
        condition: 'has_appropriate_tool',
        args: {},
        description: 'Must have appropriate mining tool',
      },
      {
        type: 'spatial',
        condition: 'block_minable',
        args: {},
        description: 'Target block must be minable',
      },
    ],

    effects: [
      {
        type: 'world',
        change: 'block_removed',
        location: 'target',
        item: 'parameter.blockType',
        quantity: 1,
      },
      {
        type: 'inventory',
        change: 'items_gained',
        metadata: { drops: 'calculated' },
      },
      { type: 'inventory', change: 'durability_decreased', quantity: 1 },
    ],

    costHint: 25,
    durationMs: 800,
    energyCost: 3,

    safetyTags: ['potentially_destructive', 'resource_gain'],
    constitutionalRules: ['no_grief_mining', 'respect_structures'],
    riskLevel: RiskLevel.MEDIUM,

    cooldownMs: 100,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },
];

export const INVENTORY_CAPABILITIES: CapabilitySpec[] = [
  {
    id: 'pick_up_item',
    name: 'Pick Up Item',
    description: 'Pick up an item from the ground',
    category: 'inventory',

    preconditions: [
      {
        type: 'spatial',
        condition: 'item_nearby',
        args: { distance: 2 },
        description: 'Item must be within pickup range',
      },
      {
        type: 'inventory',
        condition: 'has_space',
        args: {},
        description: 'Must have inventory space',
      },
    ],

    effects: [
      {
        type: 'inventory',
        change: 'item_added',
        item: 'parameter.itemType',
        quantity: 1,
      },
      {
        type: 'world',
        change: 'item_removed',
        location: 'parameter.itemLocation',
      },
    ],

    costHint: 8,
    durationMs: 100,
    energyCost: 1,

    safetyTags: ['reversible', 'resource_gain'],
    constitutionalRules: ['respect_property'],
    riskLevel: RiskLevel.LOW,

    cooldownMs: 50,
    maxConcurrent: 1,

    requiresApproval: false,
    enabled: true,
  },
];

export const SOCIAL_CAPABILITIES: CapabilitySpec[] = [
  {
    id: 'send_chat',
    name: 'Send Chat Message',
    description: 'Send a message in the chat',
    category: 'social',

    preconditions: [
      {
        type: 'permission',
        condition: 'chat_allowed',
        args: {},
        description: 'Chat must be enabled',
      },
    ],

    effects: [
      {
        type: 'sound',
        change: 'message_sent',
        metadata: {
          message: 'parameter.message',
          recipient: 'parameter.recipient',
        },
      },
    ],

    costHint: 5,
    durationMs: 50,
    energyCost: 0,

    safetyTags: ['affects_others', 'reversible'],
    constitutionalRules: ['no_harmful_speech', 'respectful_communication'],
    riskLevel: RiskLevel.LOW,

    cooldownMs: 1000, // Prevent spam
    maxConcurrent: 1,
    dailyLimit: 1000,

    requiresApproval: false,
    enabled: true,
  },
];

// ===== CAPABILITY REGISTRY =====

export const ALL_CAPABILITIES: CapabilitySpec[] = [
  ...MOVEMENT_CAPABILITIES,
  ...BLOCK_CAPABILITIES,
  ...INVENTORY_CAPABILITIES,
  ...SOCIAL_CAPABILITIES,
];

// ===== EXECUTOR REGISTRY =====

export const CAPABILITY_EXECUTORS: Record<string, CapabilityExecutor> = {
  move_forward: new MoveForwardExecutor(),
  place_block: new PlaceBlockExecutor(),
  mine_block: new MineBlockExecutor(),
  explore: new ExploreExecutor(),
};

export const CAPABILITY_VALIDATORS: Record<string, CapabilityValidator> = {
  move_forward: new MoveForwardValidator(),
  place_block: new PlaceBlockValidator(),
  mine_block: new MineBlockValidator(),
  explore: new ExploreValidator(),
};

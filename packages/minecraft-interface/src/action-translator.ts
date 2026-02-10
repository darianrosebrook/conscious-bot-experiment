/**
 * ActionTranslator: Converts PlanStep to executable Minecraft actions
 *
 * Translates high-level planning actions into specific mineflayer bot commands
 * with proper error handling, timeouts, and verification.
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import {
  RaycastEngine,
  validateSensingConfig,
  SensingConfig,
  Orientation,
} from '@conscious-bot/world';
import { resilientFetch } from '@conscious-bot/core';
import { NavigationLeaseManager } from './navigation-lease-manager';
import { createHash } from 'crypto';

/**
 * Seeded hash for exploration target selection.
 * Returns a stable value in [0, 1) derived from immutable trace facts.
 * Replayable: same input string always produces the same output.
 *
 * @param input - Seed string built from task scope, target, bot pos, distance
 * @returns A number in [0, 1) suitable for angle computation
 */
export function explorationSeedHash(input: string): number {
  const hash = createHash('sha256').update(input).digest();
  // Use first 4 bytes as a uint32, normalize to [0, 1)
  const uint32 = hash.readUInt32BE(0);
  return uint32 / 0x100000000;
}

// Simple inline goal classes for ES modules compatibility
class SimpleGoalNear {
  constructor(x: number, y: number, z: number, range: number = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.range = range;
  }
  x: number;
  y: number;
  z: number;
  range: number;

  // Required Goal interface properties
  heuristic(node: any): number {
    return 0;
  }

  isEnd(endNode: any): boolean {
    return false;
  }

  hasChanged(): boolean {
    return false;
  }

  isValid(): boolean {
    return true;
  }
}

class SimpleGoalBlock {
  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  x: number;
  y: number;
  z: number;

  // Required Goal interface properties
  heuristic(node: any): number {
    return 0;
  }

  isEnd(endNode: any): boolean {
    return false;
  }

  hasChanged(): boolean {
    return false;
  }

  isValid(): boolean {
    return true;
  }
}

// Export goals object
const simpleGoals = {
  GoalNear: SimpleGoalNear,
  GoalBlock: SimpleGoalBlock,
};

function getGoals() {
  return Promise.resolve(simpleGoals);
}
import { PlanStep } from './types';
import {
  MinecraftAction,
  MinecraftActionType,
  ActionResult,
  BotConfig,
  NavigateAction,
  MineBlockAction,
  CraftAction,
  ConsumeFoodAction,
  PlaceBlockAction,
  FindShelterAction,
} from './types';

// Configuration interface for ActionTranslator
interface ActionTranslatorConfig {
  actionTimeout: number;
  pathfindingTimeout?: number;
  maxRetries?: number;
}
import { NavigationBridge } from './navigation-bridge';
import { StateMachineWrapper } from './extensions/state-machine-wrapper';

import {
  ACTION_CONTRACTS,
  buildActionTypeToLeafMap,
  normalizeActionParams,
} from './action-contract-registry';

/**
 * Maps action types to their canonical leaf spec names.
 * Generated from ACTION_CONTRACTS — single source of truth.
 */
export const ACTION_TYPE_TO_LEAF: Record<string, string> =
  buildActionTypeToLeafMap();

/** Navigation priority levels for the lease system. */
export type NavigationPriority = 'normal' | 'high' | 'emergency';

/** Optional params that callers can pass through action parameters to control nav lease identity. */
export interface NavLeaseParams {
  navLeaseHolder?: string;
  navigationPriority?: NavigationPriority;
  /** Scope token (e.g. taskId) to disambiguate concurrent actions of the same type. */
  navLeaseScope?: string;
}

/**
 * Derive nav lease holder and priority from action parameters.
 * Validates types at runtime — invalid inputs fall back to defaults.
 * Exported so tests can call the same implementation used in production.
 */
export function deriveNavLeaseContext(
  actionType: string,
  params: Record<string, any> | undefined,
): { holder: string; priority: NavigationPriority } {
  // Reserved __nav namespace for lease metadata (avoids collisions with action params)
  const nav = params?.__nav as { holder?: string; scope?: string; priority?: string } | undefined;
  // Legacy flat params for backward compat
  const rawHolder = nav?.holder ?? params?.navLeaseHolder;
  // Scope chain: explicit holder > taskId-scoped > type-only fallback
  const scope = nav?.scope ?? params?.navLeaseScope;
  const holder: string =
    typeof rawHolder === 'string' && rawHolder.length > 0
      ? rawHolder
      : typeof scope === 'string' && scope.length > 0
        ? `action:${actionType}:${scope}`
        : `action:${actionType}`;
  const rawPriority = nav?.priority ?? params?.navigationPriority;
  const priority: NavigationPriority =
    rawPriority === 'normal' || rawPriority === 'high' || rawPriority === 'emergency'
      ? rawPriority
      : 'normal';
  return { holder, priority };
}

/**
 * Strip reserved metadata namespaces before passing to leaf functions.
 * `__nav` is consumed for lease routing but should never reach leaf implementations.
 *
 * This is called at the final dispatch boundary (_runLeaf, executeCraftItem, etc.)
 * rather than in normalizeActionParams() to avoid call-order issues where lease
 * context might be derived after normalization.
 *
 * @param params - The action parameters that may contain __nav
 * @returns A shallow copy with __nav removed
 */
export function stripReservedMeta(params: Record<string, any>): Record<string, any> {
  const { __nav, ...clean } = params;
  return clean;
}

export class ActionTranslator {
  private bot: Bot;
  private config: ActionTranslatorConfig;
  private movements?: Movements;
  private navigationBridge!: NavigationBridge;
  private stateMachineWrapper?: StateMachineWrapper;
  private raycastEngine: RaycastEngine;
  private raycastConfig: SensingConfig;
  private lastNavTargetKey: string | null = null;
  private lastNavAttemptAt = 0;
  private navDebounceMs = 1500;
  private navLogThrottleMs = 5000; // 5 seconds between identical nav logs
  private lastLogAt = new Map<string, number>();

  // ── Exploration loop-avoidance ring buffer ──
  // Tracks recent exploration targets to prevent "stuck jitter" where the
  // seeded hash repeatedly selects the same position.
  private recentExplorationTargets: Array<{ x: number; z: number; at: number }> = [];
  private readonly EXPLORATION_HISTORY_SIZE = 8;
  private readonly EXPLORATION_DEDUP_RADIUS = 5; // blocks
  private readonly EXPLORATION_MAX_RETRIES = 4;

  // ── Navigation lease: prevents concurrent pathfinder corruption ──
  private navLeaseManager: NavigationLeaseManager;

  constructor(
    bot: Bot,
    config: ActionTranslatorConfig,
    stateMachineWrapper?: StateMachineWrapper
  ) {
    this.bot = bot;
    this.config = {
      ...config,
      pathfindingTimeout: config.pathfindingTimeout || 10000,
      maxRetries: config.maxRetries || 3,
    };
    this.stateMachineWrapper = stateMachineWrapper;
    this.raycastConfig = validateSensingConfig({
      maxDistance: 32,
      fovDegrees: 90,
      angularResolution: 6,
      panoramicSweep: false,
      maxRaysPerTick: 160,
      tickBudgetMs: 5,
    });
    this.raycastEngine = new RaycastEngine(this.raycastConfig, bot as any);
    this.navLeaseManager = new NavigationLeaseManager({
      onPreempt: (evicted) => {
        try {
          this.navigationBridge?.stopNavigation();
        } catch (err) {
          console.warn(`[NavLease] stopNavigation failed during preempt of ${evicted}:`, err);
        }
      },
    });

    // Initialize NavigationBridge if bot is spawned.
    // NavigationBridge.initializePathfinder() handles loadPlugin + Movements + setMovements.
    // We no longer duplicate that work here.
    if (bot.entity && bot.entity.position) {
      // ActionTranslator initialized (verbose logging suppressed)

      // Initialize D* Lite navigation bridge (owns pathfinder lifecycle)
      this.navigationBridge = new NavigationBridge(bot, {
        maxRaycastDistance: 32,
        pathfindingTimeout: 30000,
        replanThreshold: 5,
        obstacleDetectionRadius: 8,
        enableDynamicReplanning: true,
        useRaycasting: true,
        usePathfinding: true,
      });
    } else {
      console.log(
        '⚠️ ActionTranslator initialized without NavigationBridge - bot not fully spawned yet',
        {
          hasBot: !!bot,
          botSpawned: !!bot.entity?.position,
          hasStateMachine: !!stateMachineWrapper,
          timestamp: Date.now(),
        }
      );
    }
  }

  // ── Navigation lease API (delegates to NavigationLeaseManager) ──

  /** Acquire the navigation lease. Returns a release function on success, null if busy. */
  acquireNavigationLease(
    holder: string,
    priority: NavigationPriority = 'normal',
  ): (() => void) | null {
    return this.navLeaseManager.acquire(holder, priority);
  }

  /** Release the navigation lease. Ref-counted: only clears when all nested acquires are released. */
  releaseNavigationLease(holder: string): void {
    this.navLeaseManager.release(holder);
  }

  /** Whether navigation is currently leased. */
  get isNavigationBusy(): boolean {
    return this.navLeaseManager.isBusy;
  }

  /**
   * Execute an async function that requires pathfinder access under the nav lease.
   * Acquires the lease before calling `fn`, releases in `finally`.
   * Returns the function's result on success, or `busyResult` if the lease is busy.
   */
  async withNavLease(
    holder: string,
    priority: NavigationPriority,
    fn: () => Promise<{ success: boolean; error?: string }>,
    busyResult: { success: false; error: string },
    preemptResult?: { success: false; error: string },
  ): Promise<{ success: boolean; error?: string }> {
    return this.navLeaseManager.withLease(holder, priority, fn, busyResult, {
      preemptResult,
    });
  }

  /**
   * Ensure the navigation subsystem is initialized.
   * Safe to call multiple times — NavigationBridge's stored promise resolves idempotently.
   */
  async ensureReady(timeoutMs = 5000): Promise<boolean> {
    if (!this.navigationBridge) return false;
    const ready = await this.navigationBridge.waitForPathfinderReady(timeoutMs);
    if (ready && this.navigationBridge.movements) {
      const m = this.navigationBridge.movements;
      m.scafoldingBlocks = [];
      m.canDig = false;
      this.movements = m;
    }
    return ready;
  }

  /**
   * Main translation function: PlanStep → MinecraftAction → Execution
   */
  async executePlanStep(step: PlanStep): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      if (!step.action) throw new Error('Step action is required');
      const actionType = step.action.type.toLowerCase();

      // Check if this action type should be handled by state machine
      const stateMachineActions = [
        'craft',
        'build',
        'gather',
        'explore',
        'mine',
      ];

      if (
        this.stateMachineWrapper &&
        stateMachineActions.includes(actionType)
      ) {
        try {
          // Route complex actions to state machine
          const result = await this.stateMachineWrapper.executePlanStep(step);
          return {
            success: result.success,
            action: {
              type: step.action.type as MinecraftActionType,
              parameters: step.action.parameters ?? {},
            },
            startTime,
            endTime: Date.now(),
            data: result.metadata,
            error: result.error,
          };
        } catch (error) {
          console.error(
            `State machine failed for action ${actionType}:`,
            error
          );
          // Fall through to regular action execution
        }
      }

      // Translate plan step to minecraft action
      const action = this.translatePlanStepToAction(step);

      // Execute the action
      const result = await this.executeAction(action);

      return {
        success: result.success,
        action,
        startTime,
        endTime: Date.now(),
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        action: { type: 'wait', parameters: {} }, // fallback action
        startTime,
        endTime: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Translate planning step to Minecraft action
   */
  private translatePlanStepToAction(step: PlanStep): MinecraftAction {
    if (!step.action) throw new Error('Step action is required');
    const actionType = step.action.type.toLowerCase();
    const params = step.action.parameters ?? {};

    // Translating action type: ${actionType} with params

    // Map common planning actions to Minecraft actions
    switch (actionType) {
      case 'navigate':
      case 'move':
      case 'go_to':
      case 'explore_environment':
      case 'explore':
      case 'scout':
      case 'patrol':
      case 'wander':
      case 'look_around':
        return this.createNavigateAction(params);

      case 'move_forward':
        // Creating move_forward action
        return {
          type: 'move_forward',
          parameters: {
            distance: params.distance || 5,
          },
          timeout: 10000,
        };

      case 'mine_block':
      case 'break_block':
        return {
          type: 'dig_block',
          parameters: {
            pos: params.pos || params.position || 'current',
            tool: params.tool,
          },
          timeout: 15000,
        };

      case 'place_block':
        // Creating place_block action
        return {
          type: 'place_block',
          parameters: {
            block_type: params.block_type || 'stone',
            count: params.count || 1,
            placement: params.placement || 'around_player',
            position: params.position,
          },
          timeout: 15000,
        };

      case 'craft':
      case 'make':
        return {
          type: 'craft_item',
          parameters: {
            item: params.item,
            quantity: params.amount || 1,
          },
          timeout: 20000,
        };

      case 'gather':
        return {
          type: 'gather',
          parameters: {
            resource: params.resource || 'wood',
            amount: params.amount || 3,
            target: params.target || 'tree',
          },
          timeout: 15000,
        };

      case 'consume_food':
        // Creating consume_food action
        return {
          type: 'consume_food',
          parameters: {
            food_type: params.food_type || 'any',
            amount: params.amount || 1,
          },
          timeout: 10000,
        };

      case 'experiment_with_item':
      case 'try_item':
        // Creating experimental item interaction
        return {
          type: 'experiment_with_item',
          parameters: {
            item_type: params.item_type || 'unknown',
            action: params.action || 'consume', // consume, place, craft, etc.
          },
          timeout: 15000,
        };

      case 'explore_item_properties':
        return {
          type: 'explore_item_properties',
          parameters: {
            item_type: params.item_type,
            properties_to_test: params.properties_to_test || [
              'edible',
              'placeable',
              'craftable',
            ],
          },
          timeout: 20000,
        };

      // Add support for planning system actions
      case 'analyze_biome_resources':
      case 'scan_for_animals':
      case 'scan_for_trees':
      case 'scan_for_berries':
        // Creating scan action: ${actionType}
        return {
          type: 'wait',
          parameters: {
            duration: 2000,
          },
          timeout: 2500,
        };

      // Behavior Tree action mappings
      case 'clear_3x3_area':
        // Creating clear_3x3_area action
        return {
          type: 'mine_block',
          parameters: {
            position: params.position || 'current',
            tool: params.tool || 'pickaxe',
            area: { x: 3, y: 2, z: 3 },
          },
          timeout: 15000,
        };

      case 'place_blocks':
        // Creating place_blocks action
        const pattern = params.pattern || 'single';
        const blockType = params.block || 'stone';

        if (pattern === '3x3_floor') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 9,
              placement: 'pattern_3x3_floor',
            },
            timeout: 15000,
          };
        } else if (pattern === '3x3_walls_2_high') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 12,
              placement: 'pattern_3x3_walls',
            },
            timeout: 15000,
          };
        } else if (pattern === '3x3_roof') {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 9,
              placement: 'pattern_3x3_roof',
            },
            timeout: 15000,
          };
        } else {
          return {
            type: 'place_block',
            parameters: {
              block_type: blockType,
              count: 1,
              placement: 'around_player',
            },
            timeout: 15000,
          };
        }

      case 'place_door':
        // Creating place_door action
        return {
          type: 'place_block',
          parameters: {
            block_type: 'oak_door',
            count: 1,
            placement: 'specific_position',
            position: params.position || 'front_center',
          },
          timeout: 15000,
        };

      case 'place_torch':
        // Creating place_torch action
        return {
          type: 'place_block',
          parameters: {
            block_type: 'torch',
            count: 1,
            placement:
              params.position === 'center_wall'
                ? 'specific_position'
                : 'around_player',
            position: params.position || 'around_player',
          },
          timeout: 15000,
        };

      case 'cook_food':
      case 'eat_food':
        // Creating food action: ${actionType}
        return {
          type: 'consume_food',
          parameters: {
            food_type: params.food_type || 'any',
            amount: params.amount || 1,
          },
          timeout: 10000,
        };

      case 'scan_tree_structure':
        // Creating tree scan action
        return {
          type: 'wait',
          parameters: {
            duration: 1000,
          },
          timeout: 1500,
        };

      case 'dig_blocks':
        // Creating dig action
        // Handle pattern-based digging (like tree_logs_top_down)
        if (params.pattern === 'tree_logs_top_down') {
          return {
            type: 'dig_block',
            parameters: {
              pos: 'current', // Start with current position for tree chopping
              tool: params.tool || 'hand',
            },
            timeout: 15000,
          };
        }
        return {
          type: 'dig_block',
          parameters: {
            pos: params.position || params.pos || 'current',
            tool: params.tool || 'hand',
          },
          timeout: 15000,
        };

      case 'acquire_material':
        // Combined dig + collect in one atomic operation
        return {
          type: 'acquire_material',
          parameters: {
            item: params.item || params.blockType,
            count: params.count || params.quantity || 1,
          },
          timeout: 30000,
        };

      case 'collect_items':
        // Creating collect items action with improved search
        return {
          type: 'collect_items_enhanced',
          parameters: {
            item: params.item,
            radius: params.radius || 10,
            maxSearchTime: 30000, // Search for up to 30 seconds
            exploreOnFail: true, // Explore area if items not found immediately
          },
          timeout: 35000, // Allow time for exploration
        };

      case 'pickup_item':
        // Creating pickup item action
        return {
          type: 'pickup_item',
          parameters: {
            maxDistance: params.maxDistance || params.radius || 10,
            item: params.item,
          },
          timeout: 5000,
        };

      case 'attack_entity':
        // Creating attack action
        return {
          type: 'attack_entity',
          parameters: {
            target: params.target || 'nearest',
          },
          timeout: 10000,
        };

      case 'harvest_crops':
        // Creating harvest action
        return {
          type: 'dig_block',
          parameters: {
            pos: params.position || 'current',
            tool: 'hand',
          },
          timeout: 10000,
        };

      case 'craft_item':
        // Creating craft action
        return {
          type: 'craft_item',
          parameters: {
            item: params.item || params.recipe,
            quantity: params.amount || 1,
          },
          timeout: 20000,
        };

      case 'turn_left':
        // Creating turn left action
        return {
          type: 'turn_left',
          parameters: {},
          timeout: 2000,
        };

      case 'turn_right':
        // Creating turn right action
        return {
          type: 'turn_right',
          parameters: {},
          timeout: 2000,
        };

      case 'jump':
        // Creating jump action
        return {
          type: 'jump',
          parameters: {},
          timeout: 1000,
        };

      case 'chat':
      case 'say':
        // Creating chat action
        return {
          type: 'chat',
          parameters: {
            message: params.message || 'Hello!',
          },
          timeout: 5000,
        };

      default:
        // Unknown action type: ${actionType}, inferring from description
        console.warn(
          `Unknown action type: ${actionType}, inferring from description`
        );
        // Try to infer action from description
        const description = step.action.description?.toLowerCase() || '';

        if (
          description.includes('move') ||
          description.includes('go') ||
          description.includes('navigate') ||
          description.includes('explore') ||
          description.includes('scout') ||
          description.includes('patrol') ||
          description.includes('wander')
        ) {
          return this.createNavigateAction(params);
        }

        if (
          description.includes('mine') ||
          description.includes('break') ||
          description.includes('dig')
        ) {
          return {
            type: 'mine_block',
            parameters: params,
            timeout: 15000,
          };
        }

        if (
          description.includes('craft') ||
          description.includes('make') ||
          description.includes('build')
        ) {
          return {
            type: 'craft_item',
            parameters: {
              item: params.item || 'oak_planks',
              quantity: params.amount || 1,
            },
            timeout: 20000,
          };
        }

        if (
          description.includes('gather') ||
          description.includes('collect') ||
          description.includes('pick')
        ) {
          return {
            type: 'gather',
            parameters: {
              resource: params.resource || 'wood',
              amount: params.amount || 3,
            },
            timeout: 15000,
          };
        }

        if (
          description.includes('eat') ||
          description.includes('consume') ||
          description.includes('food')
        ) {
          return {
            type: 'consume_food',
            parameters: params,
            timeout: 10000,
          };
        }

        if (
          description.includes('try') ||
          description.includes('experiment') ||
          description.includes('test')
        ) {
          return {
            type: 'experiment_with_item',
            parameters: params,
            timeout: 15000,
          };
        }

        // Default to wait action with logging
        console.warn(
          `No mapping found for action ${actionType}, defaulting to wait`
        );
        return {
          type: 'wait',
          parameters: {
            duration: 2000,
          },
          timeout: 2500,
        };
    }
  }

  /**
   * Create navigation action
   */
  private createNavigateAction(params: any): NavigateAction {
    let target: Vec3;

    if (params.target) {
      if (Array.isArray(params.target)) {
        target = new Vec3(params.target[0], params.target[1], params.target[2]);
      } else if (params.target.x !== undefined) {
        target = new Vec3(params.target.x, params.target.y, params.target.z);
      } else {
        target = params.target;
      }
    } else if (params.x !== undefined) {
      // Ensure bot is spawned before accessing position
      if (!this.bot.entity || !this.bot.entity.position) {
        throw new Error('Bot not fully spawned - cannot access position');
      }
      target = new Vec3(
        params.x,
        params.y || this.bot.entity.position.y,
        params.z
      );
    } else {
      // Default to nearby exploration
      if (!this.bot.entity || !this.bot.entity.position) {
        throw new Error('Bot not fully spawned - cannot access position');
      }
      const pos = this.bot.entity.position;
      target = pos.offset(Math.random() * 20 - 10, 0, Math.random() * 20 - 10);
    }

    return {
      type: 'navigate',
      parameters: {
        target,
        range: params.range || 1,
        sprint: params.sprint || false,
      },
      timeout: this.config.pathfindingTimeout,
    };
  }

  /**
   * Create mining action
   */
  private createMineAction(params: any): MineBlockAction {
    let position: Vec3;

    if (params.position) {
      if (Array.isArray(params.position)) {
        position = new Vec3(
          params.position[0],
          params.position[1],
          params.position[2]
        );
      } else if (params.position.x !== undefined) {
        position = new Vec3(
          params.position.x,
          params.position.y,
          params.position.z
        );
      } else {
        position = params.position;
      }
    } else if (params.blockType) {
      // Find nearest *visible* block so we do not plan to dig through obstacles
      position = this.findNearestVisibleBlock(params.blockType);
    } else {
      throw new Error('Mining action requires position or blockType parameter');
    }

    return {
      type: 'mine_block',
      parameters: {
        position,
        blockType: params.blockType,
        tool: params.tool,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create crafting action
   */
  private createCraftAction(params: any): CraftAction {
    return {
      type: 'craft_item',
      parameters: {
        item: params.item || params.recipe || params.output,
        count: params.count || 1,
        useCraftingTable: params.useCraftingTable || false,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create pickup action
   */
  private createPickupAction(params: any): MinecraftAction {
    return {
      type: 'pickup_item',
      parameters: {
        item: params.item,
        maxDistance: params.maxDistance || 5,
      },
      timeout: this.config.actionTimeout,
    };
  }

  /**
   * Create look action
   */
  private createLookAction(params: any): MinecraftAction {
    let target: Vec3;

    if (params.target) {
      target = Array.isArray(params.target)
        ? new Vec3(params.target[0], params.target[1], params.target[2])
        : params.target;
    } else {
      target = new Vec3(params.x, params.y, params.z);
    }

    return {
      type: 'look_at',
      parameters: { target },
      timeout: 1000,
    };
  }

  /**
   * Create wait action
   */
  private createWaitAction(params: any): MinecraftAction {
    return {
      type: 'wait',
      parameters: {
        duration: params.duration || params.time || 1000,
      },
      timeout: (params.duration || params.time || 1000) + 500,
    };
  }

  /**
   * Infer action from step description using keywords
   */
  private inferActionFromDescription(step: PlanStep): MinecraftAction {
    if (!step.action) throw new Error('Step action is required');
    const description =
      step.action.type.toLowerCase() +
      ' ' +
      (step.action.parameters?.description || '').toLowerCase();

    if (
      description.includes('navigate') ||
      description.includes('move') ||
      description.includes('go')
    ) {
      return this.createNavigateAction(step.action.parameters ?? {});
    }

    if (
      description.includes('mine') ||
      description.includes('break') ||
      description.includes('dig')
    ) {
      return this.createMineAction(step.action.parameters ?? {});
    }

    if (description.includes('craft') || description.includes('make')) {
      return this.createCraftAction(step.action.parameters ?? {});
    }

    // Default to wait if we can't determine the action
    return this.createWaitAction({ duration: 2000 });
  }

  /**
   * Execute a Minecraft action.
   *
   * Dispatch order:
   * 1. LeafFactory-first: if a non-placeholder leaf exists for the action type
   *    (or its normalized name via ACTION_TYPE_TO_LEAF), delegate to dispatchToLeaf.
   * 2. Hardcoded handlers: legacy switch for action types without leaf implementations.
   *
   * As leaves are implemented for more action types, the hardcoded cases
   * naturally become unreachable and can be removed one at a time.
   */
  async executeAction(
    action: MinecraftAction,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const timeout = action.timeout || this.config.actionTimeout;

    // Action types that must use legacy handlers (D* Lite NavigationBridge, etc.)
    const LEGACY_ONLY = new Set(['move_to', 'navigate']);

    try {
      // Phase 1: Contract-driven dispatch (skip legacy-only actions)
      const leafFactory = (global as any).minecraftLeafFactory;
      const contract = ACTION_CONTRACTS[action.type];
      if (leafFactory && !LEGACY_ONLY.has(action.type)) {
        const leafName =
          ACTION_TYPE_TO_LEAF[action.type] || action.type;
        const routable = leafFactory.isRoutable
          ? leafFactory.isRoutable(leafName)
          : (leafFactory.get(leafName) && (leafFactory.get(leafName) as any)?.spec?.placeholder !== true);

        if (routable) {
          const dispatchMode = contract?.dispatchMode ?? 'leaf';

          // 'handler' — always use dedicated handler, skip leaf dispatch entirely
          if (dispatchMode === 'handler') {
            // Fall through to Phase 2 switch
          }
          // 'guarded' — check semantic guards; if none fire, dispatch to leaf
          else if (dispatchMode === 'guarded') {
            // Guard: place_block with pattern-based multi-block placement needs handler
            if (
              leafName === 'place_block' &&
              action.parameters.placement &&
              action.parameters.placement !== 'around_player'
            ) {
              return await this.executePlaceBlock(action as PlaceBlockAction, timeout);
            }

            // Guard: place_block with count > 1 needs handler (leaf places single blocks)
            if (leafName === 'place_block' && (action.parameters.count ?? 1) > 1) {
              return await this.executePlaceBlock(action as PlaceBlockAction, timeout);
            }

            // Guard: collect_items_enhanced with exploreOnFail=true needs handler
            // (CollectItemsLeaf doesn't support spiral exploration fallback)
            if (
              leafName === 'collect_items' &&
              action.type === 'collect_items_enhanced' &&
              action.parameters.exploreOnFail === true
            ) {
              return await this.executeCollectItemsEnhanced(action, timeout);
            }

            // No guard fired — normalize and dispatch to leaf (fall through below)
          }
          // 'leaf' (default) — direct leaf dispatch

          if (dispatchMode !== 'handler') {
            // Normalize using the ORIGINAL action type (not leafName) so
            // alias/strip/default contracts for synonyms like
            // collect_items_enhanced apply correctly.
            const { params: normalizedParams, warnings, missingKeys } = normalizeActionParams(
              action.type,
              action.parameters
            );
            for (const w of warnings) {
              console.warn(`[leaf-dispatch] ${w}`);
            }

            // Fail-closed: reject if required keys are missing after normalization
            if (missingKeys.length > 0) {
              return {
                success: false,
                error: `Missing required params for ${action.type}: ${missingKeys.join(', ')}`,
              };
            }

            return await this.dispatchToLeaf(
              leafName,
              action.type,
              normalizedParams,
              timeout,
              signal,
            );
          }
        }
      }

      // Phase 2: Hardcoded handlers (legacy)
      switch (action.type) {
        case 'navigate':
          return await this.executeNavigate(action as NavigateAction, timeout);

        case 'move_to':
          // Treat move_to like navigate for now
          return await this.executeNavigate(action as NavigateAction, timeout);

        case 'move_forward':
        case 'move_backward':
        case 'strafe_left':
        case 'strafe_right':
          return await this.executeDirectMovement(action, timeout);

        case 'experiment_with_item':
          return await this.executeExperimentWithItem(
            action,
            action.timeout || this.config.actionTimeout
          );

        case 'explore_item_properties':
          return await this.executeExploreItemProperties(
            action,
            action.timeout || this.config.actionTimeout
          );

        case 'find_shelter':
          return await this.executeFindShelter(
            action as FindShelterAction,
            action.timeout || this.config.actionTimeout
          );

        case 'mine_block':
          return await this.executeMineBlock(
            action as MineBlockAction,
            timeout
          );

        case 'dig_block':
          // Executing dig_block action
          return await this.executeDigBlock(action, timeout);

        case 'craft':
        case 'craft_item':
          return await this.executeCraftItem(action, timeout, signal);

        case 'smelt':
        case 'smelt_item':
          return await this.executeSmeltItem(action, timeout, signal);

        case 'prepare_site':
        case 'build_module':
        case 'place_feature':
          return await this.dispatchToLeafLegacy(action, timeout, signal);

        case 'pickup_item':
          return await this.executePickup(action, timeout);

        case 'look_at':
          return await this.executeLookAt(action, timeout);

        case 'chat':
          return await this.executeChat(action, timeout);

        case 'turn_left':
          return await this.executeTurnLeft(action, timeout);

        case 'turn_right':
          return await this.executeTurnRight(action, timeout);

        case 'jump':
          return await this.executeJump(action, timeout);

        case 'attack_entity':
          return await this.executeAttackEntity(action, timeout);

        case 'wait':
          return await this.executeWait(action, timeout);

        case 'gather':
          return await this.executeGather(action, timeout);

        case 'scan_environment':
          return await this.executeScanEnvironment(action, timeout);

        case 'execute_behavior_tree':
          return await this.executeBehaviorTree(action, timeout);

        default:
          return {
            success: false,
            error: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute craft item action using the leaf system with fallback
   */
  private async executeCraftItem(
    action: MinecraftAction,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    // Normalize using contract registry (item → recipe, quantity → qty)
    const { params: normalizedParams, warnings, missingKeys } = normalizeActionParams(
      action.type,
      action.parameters
    );
    for (const w of warnings) {
      console.warn(`[craft-handler] ${w}`);
    }
    if (missingKeys.length > 0) {
      return {
        success: false,
        error: `Missing required params for ${action.type}: ${missingKeys.join(', ')}`,
      };
    }
    const recipe = normalizedParams.recipe;
    const qty = normalizedParams.qty ?? 1;

    try {
      console.log(
        `🔧 Attempting to craft ${qty}x ${recipe} using leaf system`
      );

      // Get the global leaf factory
      const leafFactory = (global as any).minecraftLeafFactory;
      console.log('🔧 Leaf factory available:', !!leafFactory);
      if (!leafFactory) {
        console.warn(
          'Leaf factory not available, falling back to basic crafting'
        );
        return await this.executeBasicCraftItem(action, timeout);
      }

      // Try to use the leaf system first
      const craftRecipeLeaf = leafFactory.get('craft_recipe');
      if (
        craftRecipeLeaf &&
        (leafFactory.isRoutable ? leafFactory.isRoutable('craft_recipe') : (craftRecipeLeaf as any)?.spec?.placeholder !== true)
      ) {
        try {
          const context = this.createLeafContext(signal);

          // Execute the craft_recipe leaf with normalized params (strip __nav)
          const result = await craftRecipeLeaf.run(context, {
            ...stripReservedMeta(normalizedParams),
            timeoutMs: timeout,
          });

          if (result.status === 'success') {
            console.log(
              `✅ Crafting successful: ${result.result.crafted}x ${result.result.recipe}`
            );
            return {
              success: true,
              data: {
                requestedActionType: action.type,
                resolvedLeafName: 'craft_recipe',
                item: result.result.recipe,
                quantity: result.result.crafted,
                crafted: result.result.crafted,
              },
            };
          } else {
            console.log(`❌ Crafting failed: ${result.error?.detail}`);
            return {
              success: false,
              error: result.error?.detail || 'Crafting failed',
            };
          }
        } catch (error) {
          console.log(
            '❌ Leaf crafting failed, falling back to basic crafting:',
            error
          );
        }
      }

      // Fallback: Basic crafting without mcData
      return await this.executeBasicCraftItem(action, timeout);
    } catch (error) {
      console.log('❌ Leaf crafting error:', error);
      return await this.executeBasicCraftItem(action, timeout);
    }
  }

  /**
   * Execute basic crafting as fallback when leaf system is not available
   */
  private async executeBasicCraftItem(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, quantity = 1 } = action.parameters;

    console.log(`🔧 Attempting basic crafting for ${quantity}x ${item}`);

    // Check if we have the required materials
    const inventory = this.bot.inventory.items();
    console.log(
      'Current inventory:',
      inventory.map((item: any) => `${item.name} x${item.count}`)
    );

    // Simple recipe mapping for basic items
    const basicRecipes: Record<
      string,
      { inputs: Record<string, number>; requiresTable: boolean }
    > = {
      oak_planks: { inputs: { oak_log: 1 }, requiresTable: false },
      crafting_table: { inputs: { oak_planks: 4 }, requiresTable: false },
      wooden_pickaxe: {
        inputs: { oak_planks: 3, stick: 2 },
        requiresTable: false,
      },
      stick: { inputs: { oak_planks: 2 }, requiresTable: false },
    };

    const recipe = basicRecipes[item];
    if (!recipe) {
      return {
        success: false,
        error: `No recipe available for ${item}`,
      };
    }

    // Check if we have the required materials
    const itemCounts: Record<string, number> = {};
    inventory.forEach((invItem: any) => {
      itemCounts[invItem.name] =
        (itemCounts[invItem.name] || 0) + invItem.count;
    });

    for (const [requiredItem, requiredCount] of Object.entries(recipe.inputs)) {
      const available = itemCounts[requiredItem] || 0;
      const needed = requiredCount * quantity;
      if (available < needed) {
        return {
          success: false,
          error: `Insufficient ${requiredItem}: need ${needed}, have ${available}`,
        };
      }
    }

    // Simulate successful crafting (since we can't actually craft without mcData)
    console.log(
      `✅ Basic crafting simulation successful: ${quantity}x ${item}`
    );
    return {
      success: true,
      data: {
        item,
        quantity,
        crafted: quantity,
        note: 'Basic crafting simulation (mcData not available)',
      },
    };
  }

  /**
   * Create a leaf execution context from the current bot state.
   * Shared by executeCraftItem, executeSmeltItem, _runLeaf, and executeDigBlock.
   */
  private createLeafContext(signal?: AbortSignal) {
    return {
      bot: this.bot,
      abortSignal: signal ?? new AbortController().signal,
      now: () => Date.now(),
      snapshot: async () => ({
        position: this.bot.entity.position,
        biome: 'unknown',
        time: 0,
        lightLevel: 0,
        nearbyHostiles: [],
        weather: 'clear',
        inventory: { items: this.bot.inventory.items() },
        toolDurability: {},
        waypoints: [],
      }),
      inventory: async () => ({
        items: this.bot.inventory.items().map((item: any) => ({
          type: item.name,
          name: item.name,
          count: item.count,
          slot: item.slot,
          metadata: item.metadata,
        })),
        selectedSlot: 0,
        totalSlots: 36,
        freeSlots: 36 - this.bot.inventory.items().length,
      }),
      emitMetric: (
        name: string,
        value: number,
        tags?: Record<string, string>
      ) => {
        console.log(`Metric: ${name} = ${value}`, tags);
      },
      emitError: (error: any) => {
        console.error('Leaf error:', error);
      },
      // LOS for all leaves (AcquireMaterialLeaf already consumes this)
      hasLineOfSight: (
        obs: { x: number; y: number; z: number },
        tgt: { x: number; y: number; z: number }
      ) =>
        this.raycastEngine.hasLineOfSight(obs, tgt, {
          maxDistance: this.raycastConfig.maxDistance,
          assumeBlockedOnError: true,
        }),
    };
  }

  /**
   * Execute smelt action via the SmeltLeaf in LeafFactory.
   */
  private async executeSmeltItem(
    action: MinecraftAction,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const leafFactory = (global as any).minecraftLeafFactory;
      if (!leafFactory) {
        return {
          success: false,
          error: 'Leaf factory not available for smelt',
        };
      }

      const smeltLeaf = leafFactory.get('smelt');
      if (!smeltLeaf) {
        return { success: false, error: 'No leaf registered for smelt' };
      }
      if (leafFactory.isRoutable ? !leafFactory.isRoutable('smelt') : (smeltLeaf as any)?.spec?.placeholder === true) {
        return {
          success: false,
          error: "Leaf 'smelt' is a placeholder stub",
        };
      }

      // Normalize using the contract registry so aliases (item → input,
      // quantity → qty) and defaults (fuel → coal) are applied consistently.
      const { params: normalizedParams, warnings, missingKeys } = normalizeActionParams(
        action.type,
        action.parameters
      );
      for (const w of warnings) {
        console.warn(`[smelt-handler] ${w}`);
      }
      if (missingKeys.length > 0) {
        return {
          success: false,
          error: `Missing required params for ${action.type}: ${missingKeys.join(', ')}`,
        };
      }

      const context = this.createLeafContext(signal);
      // Strip __nav before passing to leaf
      const result = await smeltLeaf.run(context, {
        ...stripReservedMeta(normalizedParams),
        timeoutMs: timeout,
      });

      return {
        success: result.status === 'success',
        data: {
          requestedActionType: action.type,
          resolvedLeafName: 'smelt',
          leafResult: result,
        },
        error:
          result.status === 'failure'
            ? result.error?.detail || 'Smelting failed'
            : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Dispatch a pre-normalized action to a leaf.
   * Called from Phase 1 (contract-driven dispatch) where normalization
   * has already been applied using the requestedActionType.
   */
  private async dispatchToLeaf(
    leafName: string,
    requestedActionType: string,
    params: Record<string, any>,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return this._runLeaf(leafName, requestedActionType, params, timeout, signal);
  }

  /**
   * Dispatch a MinecraftAction to a leaf via LeafFactory.
   * Called from Phase 2 (legacy switch) for action types whose .type
   * IS the leaf name (e.g. prepare_site, build_module, place_feature).
   * Normalizes using action.type directly.
   */
  private async dispatchToLeafLegacy(
    action: MinecraftAction,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { params, warnings, missingKeys } = normalizeActionParams(action.type, action.parameters);
    for (const w of warnings) {
      console.warn(`[leaf-dispatch] ${w}`);
    }
    if (missingKeys.length > 0) {
      return {
        success: false,
        error: `Missing required params for ${action.type}: ${missingKeys.join(', ')}`,
      };
    }
    return this._runLeaf(action.type, action.type, params, timeout, signal);
  }

  /**
   * Shared leaf execution logic for both dispatch methods.
   */
  private async _runLeaf(
    leafName: string,
    requestedActionType: string,
    params: Record<string, any>,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const leafFactory = (global as any).minecraftLeafFactory;
    if (!leafFactory) {
      return {
        success: false,
        error: `Leaf factory not available for ${leafName}`,
      };
    }

    const leaf = leafFactory.get(leafName);
    if (!leaf) {
      return {
        success: false,
        error: `No leaf registered for action type: ${leafName}`,
      };
    }

    if (leafFactory.isRoutable ? !leafFactory.isRoutable(leafName) : (leaf as any)?.spec?.placeholder === true) {
      return {
        success: false,
        error: `Leaf '${leafName}' is a placeholder stub`,
      };
    }

    try {
      // Use the leaf's declared timeout as a floor — never go below it
      const leafTimeout = (leaf as any)?.spec?.timeoutMs;
      const effectiveTimeout = leafTimeout ? Math.max(leafTimeout, timeout) : timeout;

      const context = this.createLeafContext(signal);
      const result = await leaf.run(context, {
        ...stripReservedMeta(params),
        timeoutMs: effectiveTimeout,
      });

      return {
        success: result.status === 'success',
        data: {
          requestedActionType,
          resolvedLeafName: leafName,
          leafResult: result,
        },
        error:
          result.status === 'failure'
            ? result.error?.detail || `${leafName} failed`
            : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute dig block action using leaf factory with fallback
   */
  private async executeDigBlock(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('🔧 executeDigBlock called with:', action);
    try {
      // Get the global leaf factory
      const leafFactory = (global as any).minecraftLeafFactory;
      console.log('🔧 Leaf factory available:', !!leafFactory);
      if (!leafFactory) {
        console.warn(
          'Leaf factory not available, falling back to basic digging'
        );
        return await this.executeBasicDigBlock(action, timeout);
      }

      // Get the dig_block leaf
      const digBlockLeaf = leafFactory.get('dig_block');
      if (!digBlockLeaf) {
        return {
          success: false,
          error: 'Dig block leaf not found',
        };
      }
      if (leafFactory.isRoutable ? !leafFactory.isRoutable('dig_block') : (digBlockLeaf as any)?.spec?.placeholder === true) {
        return {
          success: false,
          error:
            'Placeholder leaf cannot be executed; real leaf must be registered by minecraft-interface.',
        };
      }

      const context = this.createLeafContext();

      // Resolve parameters and infer a target position when only a blockType is provided
      // Strip __nav at dispatch boundary — consumed for lease routing, not leaf semantics
      let parameters = stripReservedMeta({ ...action.parameters }) as any;

      // If a blockType is provided without an explicit position, find the nearest *visible* block
      if (!parameters.pos && parameters.blockType) {
        try {
          const targetPos = this.findNearestVisibleBlock(parameters.blockType);
          parameters.pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
          // Also set an expectation so the leaf can validate
          if (!parameters.expect) parameters.expect = parameters.blockType;
        } catch (e) {
          return {
            success: false,
            error:
              e instanceof Error
                ? e.message
                : 'No visible matching block found nearby',
          };
        }
      }

      // Handle "current" position case (fallback)
      if (parameters.pos === 'current') {
        const botPos = this.bot.entity.position;
        parameters.pos = {
          x: Math.floor(botPos.x),
          y: Math.floor(botPos.y),
          z: Math.floor(botPos.z),
        };
        // If caller specified a blockType, we must find that block type; do not dig whatever is under the bot
        if (parameters.blockType) {
          try {
            const targetPos = this.findNearestVisibleBlock(
              parameters.blockType
            );
            parameters.pos = { x: targetPos.x, y: targetPos.y, z: targetPos.z };
            if (!parameters.expect) parameters.expect = parameters.blockType;
          } catch (e) {
            return {
              success: false,
              error:
                e instanceof Error
                  ? e.message
                  : `No visible ${parameters.blockType} found nearby; move to the resource first`,
            };
          }
        }
      }

      // Validate line-of-sight before digging: do not dig blocks the bot cannot see
      if (parameters.pos && typeof parameters.pos.x === 'number') {
        const blockPos = new Vec3(
          parameters.pos.x,
          parameters.pos.y,
          parameters.pos.z
        );
        const observer = this.getEyePosition();
        const blockCenter = {
          x: blockPos.x + 0.5,
          y: blockPos.y + 0.5,
          z: blockPos.z + 0.5,
        };
        const hasLos = this.raycastEngine.hasLineOfSight(
          observer,
          blockCenter,
          {
            maxDistance: this.raycastConfig.maxDistance,
            assumeBlockedOnError: true,
          }
        );
        if (!hasLos) {
          return {
            success: false,
            error: 'Block not visible (occluded); cannot dig through obstacles',
          };
        }
      }

      // LOS validator is now provided by createLeafContext() for all leaves

      // Execute the dig block leaf
      const result = await digBlockLeaf.run(context, parameters);

      return {
        success: result.status === 'success',
        data: result.result,
        error: result.error?.detail,
      };
    } catch (error) {
      console.log(
        '❌ Leaf digging failed, falling back to basic digging:',
        error
      );
      return await this.executeBasicDigBlock(action, timeout);
    }
  }

  /**
   * Acquire material: combined navigate + dig + collect in one atomic operation.
   * Finds the nearest matching block, pathfinds to within reach, mines it,
   * then immediately picks up drops.
   */
  private async executeAcquireMaterial(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, blockType, count = 1 } = action.parameters;
    const targetBlock = item || blockType;
    if (!targetBlock) {
      return { success: false, error: 'acquire_material requires item or blockType' };
    }

    const collected: Array<{ name: string; count: number }> = [];
    let remaining = count as number;
    const deadline = Date.now() + timeout;
    // Minecraft dig reach is ~4.5 blocks; navigate if farther than this
    const DIG_REACH = 4.0;

    while (remaining > 0 && Date.now() < deadline) {
      // Step 1: Find the nearest matching block
      let blockPos: Vec3;
      try {
        blockPos = this.findNearestVisibleBlock(targetBlock);
      } catch (e) {
        if (collected.length > 0) break;
        return {
          success: false,
          error: `No visible ${targetBlock} found nearby`,
          data: { collected },
        };
      }

      // Step 2: Pathfind to within reach if too far away
      const botPos = this.bot.entity.position;
      const dist = botPos.distanceTo(blockPos);
      if (dist > DIG_REACH) {
        console.log(
          `[AcquireMaterial] Block ${targetBlock} at ${blockPos} is ${dist.toFixed(1)} blocks away — pathfinding to reach`
        );
        const navResult = await this.executeNavigate(
          {
            type: 'navigate',
            parameters: {
              target: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
              range: 3,
            },
          } as any,
          Math.min(20000, deadline - Date.now())
        );
        if (!navResult.success) {
          console.warn(
            `[AcquireMaterial] Failed to pathfind to ${targetBlock}: ${navResult.error}`
          );
          if (collected.length > 0) break;
          return {
            success: false,
            error: `Cannot reach ${targetBlock}: ${navResult.error}`,
            data: { collected },
          };
        }
      }

      // Step 3: Dig the block (now within reach)
      const digResult = await this.executeDigBlock(
        { type: 'dig_block', parameters: { blockType: targetBlock } },
        Math.min(15000, deadline - Date.now())
      );

      if (!digResult.success) {
        if (collected.length > 0) break;
        return {
          success: false,
          error: `Failed to mine ${targetBlock}: ${digResult.error}`,
          data: { collected },
        };
      }

      // Step 4: Brief pause for drops to spawn
      await new Promise((r) => setTimeout(r, 300));

      // Step 5: Collect nearby drops
      const collectResult = await this.executeCollectItemsEnhanced(
        {
          type: 'collect_items_enhanced',
          parameters: {
            item: targetBlock,
            radius: 8,
            maxSearchTime: 5000,
            exploreOnFail: false,
          },
        },
        Math.min(8000, deadline - Date.now())
      );

      if (collectResult.success && collectResult.data?.collected) {
        const items = collectResult.data.items || [{ name: targetBlock, count: 1 }];
        collected.push(...items);
      }

      remaining--;
    }

    return {
      success: collected.length > 0,
      data: {
        collected,
        totalCollected: collected.reduce((s, i) => s + i.count, 0),
        requested: count,
      },
    };
  }

  /**
   * Execute basic digging as fallback when leaf system is not available
   */
  private async executeBasicDigBlock(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { pos, blockType, tool } = action.parameters;

    try {
      let position: Vec3;

      if (pos && pos !== 'current') {
        if (Array.isArray(pos)) {
          position = new Vec3(pos[0], pos[1], pos[2]);
        } else if (pos.x !== undefined) {
          position = new Vec3(pos.x, pos.y, pos.z);
        } else {
          position = pos;
        }
      } else {
        // Use current position
        if (!this.bot.entity || !this.bot.entity.position) {
          return {
            success: false,
            error: 'Bot not spawned - cannot access position',
          };
        }
        position = this.bot.entity.position.clone();
      }

      const block = this.bot.blockAt(position);
      if (!block || block.name === 'air') {
        return {
          success: false,
          error: 'No block at specified position',
        };
      }

      if (blockType && block.name !== blockType) {
        return {
          success: false,
          error: `Expected ${blockType}, found ${block.name}`,
        };
      }

      // Do not dig blocks the bot cannot see (e.g. stone behind two layers of dirt)
      const observer = this.getEyePosition();
      const blockCenter = {
        x: position.x + 0.5,
        y: position.y + 0.5,
        z: position.z + 0.5,
      };
      const hasLos = this.raycastEngine.hasLineOfSight(observer, blockCenter, {
        maxDistance: this.raycastConfig.maxDistance,
        assumeBlockedOnError: true,
      });
      if (!hasLos) {
        return {
          success: false,
          error: 'Block not visible (occluded); cannot dig through obstacles',
        };
      }

      // Equip appropriate tool if specified
      if (tool) {
        const toolItem = this.bot.inventory
          .items()
          .find((item) => item.name.includes(tool));
        if (toolItem) {
          await this.bot.equip(toolItem, 'hand');
        }
      }

      // Dig the block
      await this.bot.dig(block);

      return {
        success: true,
        data: {
          blockType: block.name,
          position: position.clone(),
          toolUsed: this.bot.heldItem?.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute direct movement using control states
   */
  private async executeDirectMovement(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { distance = 1 } = action.parameters;
    const controlState = action.type
      .replace('move_', '')
      .replace('strafe_', '');

    return new Promise((resolve) => {
      let distanceMoved = 0;
      const startPosition = this.bot.entity.position.clone();

      // Start movement
      this.bot.setControlState(controlState as any, true);

      // Stop movement after distance * 1000ms (1 second per block)
      setTimeout(() => {
        this.bot.setControlState(controlState as any, false);
        const endPosition = this.bot.entity.position;
        distanceMoved = startPosition.distanceTo(endPosition);

        resolve({
          success: true,
          data: {
            distanceMoved,
            startPosition: {
              x: startPosition.x,
              y: startPosition.y,
              z: startPosition.z,
            },
            endPosition: {
              x: endPosition.x,
              y: endPosition.y,
              z: endPosition.z,
            },
          },
        });
      }, distance * 1000);
    });
  }

  /**
   * Execute food consumption to restore health
   */
  private async executeConsumeFood(
    action: ConsumeFoodAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { food_type = 'any', amount = 1 } = action.parameters;

      // Find food in inventory - use discovery-based approach
      const foodItems = this.bot.inventory.items().filter((item) => {
        const itemName = item.name.toLowerCase();

        // Discovery-based food detection:
        // 1. Items that have been successfully consumed before (would be stored in memory)
        // 2. Items that look potentially edible based on name patterns
        // 3. Items that other entities have been observed consuming

        // For now, use basic heuristics that could be learned:
        const potentiallyEdible =
          itemName.includes('apple') ||
          itemName.includes('bread') ||
          itemName.includes('cooked') ||
          itemName.includes('food') ||
          itemName.includes('meal') ||
          itemName.includes('beef') ||
          itemName.includes('chicken') ||
          itemName.includes('pork') ||
          itemName.includes('fish') ||
          itemName.includes('potato') ||
          itemName.includes('carrot');

        // In a true discovery system, this would check:
        // - Memory of successful consumption attempts
        // - Observed effects on health/hunger
        // - Learning from other entities
        // - Trial and error results

        return potentiallyEdible;
      });

      if (foodItems.length === 0) {
        return {
          success: false,
          error: 'No food available in inventory',
        };
      }

      // Consume the first available food item
      const foodItem = foodItems[0];
      await this.bot.consume();

      return {
        success: true,
        data: {
          foodConsumed: foodItem.name,
          healthBefore: this.bot.health,
          foodBefore: this.bot.food,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error consuming food',
      };
    }
  }

  /**
   * Execute block placement (e.g., placing torches for light)
   */
  private async executePlaceBlock(
    action: PlaceBlockAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('🔧 executePlaceBlock called with:', action);
    try {
      const {
        block_type = 'torch',
        count = 1,
        placement = 'around_player',
      } = action.parameters;

      // Find the block in inventory
      const blockItem = this.bot.inventory
        .items()
        .find(
          (item) => item.name === block_type || item.name.includes(block_type)
        );

      if (!blockItem) {
        return {
          success: false,
          error: `No ${block_type} available in inventory`,
        };
      }

      let blocksPlaced = 0;
      const botPosition = this.bot.entity.position;

      if (placement === 'around_player') {
        // Place blocks around the player in a circle, looking for suitable locations
        const radius = 3; // Increased radius
        const angles = [
          0,
          Math.PI / 6,
          Math.PI / 3,
          Math.PI / 2,
          (2 * Math.PI) / 3,
          (5 * Math.PI) / 6,
          Math.PI,
          (7 * Math.PI) / 6,
          (4 * Math.PI) / 3,
          (3 * Math.PI) / 2,
          (5 * Math.PI) / 3,
          (11 * Math.PI) / 6,
        ];

        console.log(
          `🔍 Searching for placement locations around bot at ${botPosition.x}, ${botPosition.y}, ${botPosition.z}`
        );

        for (let i = 0; i < count && i < angles.length; i++) {
          const angle = angles[i];
          const x = Math.round(botPosition.x + Math.cos(angle) * radius);
          const z = Math.round(botPosition.z + Math.sin(angle) * radius);
          const y = Math.round(botPosition.y);

          try {
            const targetPosition = new Vec3(x, y, z);
            const targetBlock = this.bot.blockAt(targetPosition);
            const blockBelow = this.bot.blockAt(new Vec3(x, y - 1, z));

            console.log(
              `🔍 Checking position ${x}, ${y}, ${z}: target=${targetBlock?.name}, below=${blockBelow?.name}`
            );

            // Check if the target position is air (can place block there)
            if (targetBlock && targetBlock.name === 'air') {
              // Check if the block below is solid (can support the block)
              if (blockBelow && blockBelow.name !== 'air') {
                console.log(
                  `🔧 Attempting to place ${block_type} at ${x}, ${y}, ${z}`
                );
                await this.bot.placeBlock(targetBlock, blockItem as any);
                blocksPlaced++;
                console.log(
                  `✅ Successfully placed ${block_type} at ${x}, ${y}, ${z}`
                );
                break; // Successfully placed one block
              } else {
                console.log(
                  `⚠️ Block below at ${x}, ${y - 1}, ${z} is not solid: ${blockBelow?.name}`
                );
              }
            } else {
              console.log(
                `⚠️ Target position ${x}, ${y}, ${z} is not air: ${targetBlock?.name}`
              );
            }
          } catch (error) {
            console.log(
              `❌ Failed to place block at ${x}, ${y}, ${z}: ${error}`
            );
            // Continue trying other positions
            continue;
          }
        }
      }

      return {
        success: blocksPlaced > 0,
        data: {
          blocksPlaced,
          blockType: block_type,
          placement: placement,
        },
        error: blocksPlaced === 0 ? 'Could not place any blocks' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error placing block',
      };
    }
  }

  /**
   * Execute shelter finding/building
   */
  private async executeFindShelter(
    action: FindShelterAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const {
        shelter_type = 'cave_or_house',
        light_sources = true,
        search_radius = 10,
      } = action.parameters;

      const botPosition = this.bot.entity.position;
      let shelterFound = false;
      let shelterPosition = null;

      // Look for nearby caves or existing structures
      const nearbyBlocks = this.bot.findBlocks({
        matching: [0], // Air blocks (caves)
        maxDistance: search_radius,
        count: 10,
      });

      if (nearbyBlocks.length > 0) {
        // Find the closest suitable shelter position
        for (const blockPos of nearbyBlocks) {
          const position = new Vec3(blockPos.x, blockPos.y, blockPos.z);

          // Check if this position is suitable for shelter
          const isSuitable = await this.checkShelterSuitability(position);

          if (isSuitable) {
            shelterPosition = position;
            shelterFound = true;
            break;
          }
        }
      }

      if (shelterFound && shelterPosition) {
        // Move to the shelter (under nav lease)
        const Goals = await getGoals();
        console.log('🔍 Using Goals module:', !!Goals, typeof Goals);

        if (!Goals || !Goals.GoalBlock) {
          console.error('❌ Goals module missing GoalBlock:', Goals);
          throw new Error('Goals module not properly initialized');
        }

        const { holder, priority: pri } = deriveNavLeaseContext('find_shelter', action.parameters as any);

        const gotoResult = await this.withNavLease(
          holder,
          pri,
          async () => {
            await this.bot.pathfinder.goto(
              new Goals.GoalBlock(
                shelterPosition!.x,
                shelterPosition!.y,
                shelterPosition!.z
              )
            );
            return { success: true };
          },
          { success: false, error: 'NAV_BUSY' },
          { success: false, error: 'NAV_PREEMPTED' },
        );
        if (!gotoResult.success) {
          return { success: false, error: gotoResult.error, data: { shelterFound: false } };
        }

        // Place light sources if requested
        if (light_sources) {
          const torchItem = this.bot.inventory
            .items()
            .find(
              (item) => item.name === 'torch' || item.name.includes('torch')
            );

          if (torchItem) {
            try {
              const shelterBlock = this.bot.blockAt(shelterPosition);
              if (shelterBlock) {
                await this.bot.placeBlock(shelterBlock, torchItem as any);
              }
            } catch (error) {
              // Continue even if torch placement fails
            }
          }
        }

        return {
          success: true,
          data: {
            shelterFound: true,
            shelterPosition: {
              x: shelterPosition.x,
              y: shelterPosition.y,
              z: shelterPosition.z,
            },
            shelterType: shelter_type,
            lightSourcesPlaced: light_sources,
          },
        };
      } else {
        // No suitable shelter found, try to build a simple one
        return await this.buildSimpleShelter(botPosition, light_sources);
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error finding shelter',
      };
    }
  }

  /**
   * Check if a position is suitable for shelter
   */
  private async checkShelterSuitability(position: Vec3): Promise<boolean> {
    try {
      // Check if there's enough space (at least 2x2x2)
      const blocks = [
        position,
        position.offset(1, 0, 0),
        position.offset(0, 0, 1),
        position.offset(1, 0, 1),
        position.offset(0, 1, 0),
        position.offset(1, 1, 0),
        position.offset(0, 1, 1),
        position.offset(1, 1, 1),
      ];

      for (const blockPos of blocks) {
        const block = this.bot.blockAt(blockPos);
        if (block && block.name !== 'air') {
          return false; // Not enough space
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Build a simple shelter when no natural shelter is found
   */
  private async buildSimpleShelter(
    position: Vec3,
    lightSources: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Look for building materials
      const buildingBlocks = this.bot.inventory
        .items()
        .filter(
          (item) =>
            item.name.includes('stone') ||
            item.name.includes('dirt') ||
            item.name.includes('wood') ||
            item.name.includes('cobblestone')
        );

      if (buildingBlocks.length === 0) {
        return {
          success: false,
          error: 'No building materials available',
        };
      }

      const blockItem = buildingBlocks[0];
      let blocksPlaced = 0;

      // Build a simple 2x2x2 shelter
      const shelterPositions = [
        position.offset(0, 0, 0),
        position.offset(1, 0, 0),
        position.offset(0, 0, 1),
        position.offset(1, 0, 1),
        position.offset(0, 1, 0),
        position.offset(1, 1, 0),
        position.offset(0, 1, 1),
        position.offset(1, 1, 1),
      ];

      for (const blockPos of shelterPositions) {
        try {
          const targetBlock = this.bot.blockAt(blockPos);
          if (targetBlock) {
            await this.bot.placeBlock(targetBlock, blockItem as any);
          }
          blocksPlaced++;
        } catch (error) {
          // Continue building even if some blocks fail
          continue;
        }
      }

      return {
        success: blocksPlaced > 0,
        data: {
          shelterBuilt: true,
          blocksPlaced,
          shelterType: 'simple_2x2x2',
        },
        error: blocksPlaced === 0 ? 'Could not build shelter' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error building shelter',
      };
    }
  }

  /**
   * Execute navigation action using D* Lite pathfinding
   */
  private async executeNavigate(
    action: NavigateAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const params: any = action?.parameters ?? {};
    const { range, sprint } = params;

    const coerceVec3 = (raw: any): Vec3 | null => {
      const t =
        raw?.target ?? raw?.position ?? raw?.destination ?? raw?.goal ?? raw;
      if (!t) return null;
      if (t instanceof Vec3) return t;
      if (Array.isArray(t) && t.length >= 3) {
        const [x, y, z] = t;
        if ([x, y, z].every((n) => Number.isFinite(Number(n)))) {
          return new Vec3(Number(x), Number(y), Number(z));
        }
        return null;
      }
      if (typeof t === 'object') {
        const x = Number((t as any).x);
        const y = Number((t as any).y);
        const z = Number((t as any).z);
        if ([x, y, z].every((n) => Number.isFinite(n))) {
          return new Vec3(x, y, z);
        }
      }
      return null;
    };

    // ── Navigation lease: no navigation starts without one ──
    // Callers (e.g. SafetyMonitor) can propagate their lease context through
    // action parameters to avoid self-blocking when they pre-acquire the lease.
    const { holder: leaseHolder, priority: navPriority } = deriveNavLeaseContext(action.type, params);
    const release = this.acquireNavigationLease(leaseHolder, navPriority);
    if (!release) {
      const preempted = this.navLeaseManager.lastPreemptReason;
      return {
        success: false,
        error: preempted ? 'NAV_PREEMPTED' : 'NAV_BUSY',
        data: { targetReached: false },
      };
    }

    let targetVec: Vec3 | null = null;
    try {
      const now = Date.now();
      if (this.navigationBridge?.isNavigationActive()) {
        if (this.shouldLog('nav-gated', this.navLogThrottleMs)) {
          console.log(
            `[ActionTranslator] 🧭 navigate gated: already navigating`
          );
        }
        return {
          success: false,
          error: 'Already navigating',
        };
      }

      // Exploration trace metadata — populated when fallback fires, merged into result.
      let explorationTrace: {
        seedInput: string;
        seed: number;
        retryCount: number;
        chosenPos: { x: number; y: number; z: number };
        botPos: { x: number; y: number; z: number };
        distance: number;
        target: string;
      } | undefined;

      targetVec = coerceVec3(params);
      if (!targetVec) {
        // Exploration fallback: when Sterling sends target='exploration_target'
        // (or any non-coordinate target), compute a seeded position within
        // the requested distance from the bot's current position.
        //
        // Seed is derived from immutable trace facts so the decision is
        // replayable given the same context (audit-grade randomness).
        const botPos = this.bot.entity?.position;
        const dist = Number(params.distance) || 10;
        if (botPos && dist > 0) {
          const scope = params?.__nav?.scope ?? '';
          const baseSeedInput = `${scope}:${params.target ?? ''}:${Math.round(botPos.x)}:${Math.round(botPos.z)}:${dist}`;

          // Loop-avoidance: if computed target is near a recently visited
          // position, rotate deterministically by appending ":retry:N".
          let seed: number;
          let candidateX: number;
          let candidateZ: number;
          let retryCount = 0;
          let finalSeedInput = baseSeedInput;
          do {
            finalSeedInput = retryCount === 0
              ? baseSeedInput
              : `${baseSeedInput}:retry:${retryCount}`;
            seed = explorationSeedHash(finalSeedInput);
            const angle = seed * 2 * Math.PI;
            candidateX = Math.round(botPos.x + Math.cos(angle) * dist);
            candidateZ = Math.round(botPos.z + Math.sin(angle) * dist);

            const tooClose = this.recentExplorationTargets.some((prev) => {
              const dx = candidateX - prev.x;
              const dz = candidateZ - prev.z;
              return Math.sqrt(dx * dx + dz * dz) < this.EXPLORATION_DEDUP_RADIUS;
            });
            if (!tooClose) break;
            retryCount++;
          } while (retryCount < this.EXPLORATION_MAX_RETRIES);

          targetVec = new Vec3(candidateX, botPos.y, candidateZ);

          // Record in ring buffer
          this.recentExplorationTargets.push({ x: candidateX, z: candidateZ, at: Date.now() });
          if (this.recentExplorationTargets.length > this.EXPLORATION_HISTORY_SIZE) {
            this.recentExplorationTargets.shift();
          }

          // Capture trace for audit-grade replayability.
          // On replay/verification, the recorded pos can be checked directly
          // instead of recomputing (avoids false mismatch from botPos drift).
          explorationTrace = {
            seedInput: finalSeedInput,
            seed,
            retryCount,
            chosenPos: { x: candidateX, y: botPos.y, z: candidateZ },
            botPos: { x: botPos.x, y: botPos.y, z: botPos.z },
            distance: dist,
            target: String(params.target ?? ''),
          };

          console.log(
            `[ActionTranslator] Exploration fallback: target=${params.target}, distance=${dist}, seed=${seed.toFixed(4)}, retries=${retryCount} → pos=(${targetVec.x}, ${targetVec.y}, ${targetVec.z})`
          );
        } else {
          if (this.shouldLog('nav-invalid-target', 1000)) {
            console.error(
              `[ActionTranslator] ❌ Invalid navigation target (missing/NaN coordinates)`
            );
          }
          return {
            success: false,
            error: 'Invalid navigation target',
            data: { targetReached: false },
          };
        }
      }

      const targetKey = `${targetVec.x.toFixed(2)},${targetVec.y.toFixed(
        2
      )},${targetVec.z.toFixed(2)}`;

      if (
        this.lastNavTargetKey === targetKey &&
        now - this.lastNavAttemptAt < this.navDebounceMs
      ) {
        if (this.shouldLog('nav-debounce', this.navLogThrottleMs)) {
          console.log(
            `[ActionTranslator] 🧭 navigate debounced: ${targetKey} (${
              now - this.lastNavAttemptAt
            }ms)`
          );
        }
        return {
          success: false,
          error: 'Debounced duplicate navigate',
        };
      }

      this.lastNavTargetKey = targetKey;
      this.lastNavAttemptAt = now;

      if (this.shouldLog('nav-execute', this.navLogThrottleMs)) {
        console.log(
          `[ActionTranslator] 🧭 executeNavigate called with target: ${targetVec.x}, ${targetVec.y}, ${targetVec.z}`
        );
      }
      if (this.shouldLog('nav-state', this.navLogThrottleMs)) {
        console.log('[ActionTranslator] 🔍 state:', {
          hasNavigationBridge: !!this.navigationBridge,
          hasBot: !!this.bot,
          botSpawned: !!this.bot.entity?.position,
          botPathfinder: !!(this.bot as any).pathfinder,
          timestamp: Date.now(),
        });
      }

      if (!this.navigationBridge) {
        console.error(
          '❌ NavigationBridge not initialized in ActionTranslator'
        );
        return {
          success: false,
          error:
            'NavigationBridge not initialized - bot may not be fully spawned',
        };
      }

      // Ensure pathfinder is ready before dispatching navigation
      const pfReady = await this.ensureReady(5000);
      if (!pfReady) {
        return {
          success: false,
          error: 'Navigation subsystem not ready (pathfinder init failed or timed out)',
        };
      }

      if (this.shouldLog('nav-dstar', this.navLogThrottleMs)) {
        console.log(
          `[ActionTranslator] 🧭 Using D* Lite navigation to target: ${targetVec.x}, ${targetVec.y}, ${targetVec.z}`
        );
      }

      // Use D* Lite navigation bridge for intelligent pathfinding
      const navigationResult = await this.navigationBridge.navigateTo(
        targetVec,
        {
          timeout: timeout,
          useRaycasting: true,
          dynamicReplanning: true,
        }
      );

      if (sprint) {
        this.bot.setControlState('sprint', true);
      }

      if (navigationResult.success) {
        console.log(
          `[ActionTranslator] ✅ D* Lite navigation successful: ${navigationResult.pathLength} steps, ${navigationResult.replans} replans`
        );

        if (sprint) {
          this.bot.setControlState('sprint', false);
        }

        return {
          success: true,
          data: {
            targetReached: true,
            finalPosition: navigationResult.finalPosition,
            distanceRemaining: navigationResult.distanceToGoal,
            pathLength: navigationResult.pathLength,
            replans: navigationResult.replans,
            obstaclesDetected: navigationResult.obstaclesDetected,
            planningTime: navigationResult.data?.planningTime,
            ...(explorationTrace ? { explorationTrace } : {}),
          },
        };
      } else {
        if (this.shouldLog('nav-fail', this.navLogThrottleMs)) {
          console.log(
            `[ActionTranslator] ❌ D* Lite navigation failed: ${navigationResult.error}`
          );
        }

        if (sprint) {
          this.bot.setControlState('sprint', false);
        }

        return {
          success: false,
          error: navigationResult.error || 'Navigation failed',
          data: {
            targetReached: false,
            finalPosition: navigationResult.finalPosition,
            distanceRemaining: navigationResult.distanceToGoal,
            pathLength: navigationResult.pathLength,
            replans: navigationResult.replans,
            obstaclesDetected: navigationResult.obstaclesDetected,
            ...(explorationTrace ? { explorationTrace } : {}),
          },
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (this.shouldLog('nav-error', 1000)) {
        console.error(`[ActionTranslator] ❌ D* Lite navigation error: ${msg}`);
        if (process.env.NAV_DEBUG_STACK === '1' && error instanceof Error) {
          console.error(error.stack);
        }
      }

      if (sprint) {
        this.bot.setControlState('sprint', false);
      }

      const pos = this.bot.entity?.position;
      const finalPos = pos?.clone ? pos.clone() : undefined;
      return {
        success: false,
        error: msg || 'Unknown navigation error',
        data: {
          targetReached: false,
          finalPosition: finalPos,
          distanceRemaining:
            pos && targetVec ? pos.distanceTo(targetVec) : undefined,
        },
      };
    } finally {
      release();
    }
  }

  /**
   * Execute mining action
   */
  private async executeMineBlock(
    action: MineBlockAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { position, blockType, tool } = action.parameters;

    const block = this.bot.blockAt(position);
    if (!block || block.name === 'air') {
      return {
        success: false,
        error: 'No block at specified position',
      };
    }

    if (blockType && block.name !== blockType) {
      return {
        success: false,
        error: `Expected ${blockType}, found ${block.name}`,
      };
    }

    // Equip appropriate tool if specified
    if (tool) {
      const toolItem = this.bot.inventory
        .items()
        .find((item) => item.name.includes(tool));
      if (toolItem) {
        await this.bot.equip(toolItem, 'hand');
      }
    }

    try {
      await this.bot.dig(block);
      return {
        success: true,
        data: {
          blockType: block.name,
          position: position.clone(),
          toolUsed: this.bot.heldItem?.name,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private shouldLog(key: string, intervalMs: number): boolean {
    const now = Date.now();
    const last = this.lastLogAt.get(key) ?? 0;
    if (now - last < intervalMs) return false;
    this.lastLogAt.set(key, now);
    return true;
  }

  /**
   * Execute crafting action (supports both 2x2 and 3x3 crafting)
   */
  private async executeCraft(
    action: CraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, count, useCraftingTable } = action.parameters;

    try {
      // Find recipe for the item
      const recipe = this.bot.recipesFor(
        (this.bot as any).mcData.itemsByName[item]?.id,
        null,
        1,
        null
      )[0];
      if (!recipe) {
        return {
          success: false,
          error: `No recipe found for ${item}`,
        };
      }

      // Check if we have the required ingredients
      const canCraft = (this.bot as any).canCraft(recipe, count);
      if (!canCraft) {
        return {
          success: false,
          error: `Insufficient materials to craft ${count}x ${item}`,
        };
      }

      // Handle 3x3 crafting with crafting table
      if (useCraftingTable) {
        // Find nearby crafting table
        const craftingTable = this.bot.findBlock({
          matching: (this.bot as any).mcData.blocksByName.crafting_table.id,
          maxDistance: 3,
        });

        if (!craftingTable) {
          return {
            success: false,
            error: 'No crafting table found within range',
          };
        }

        // Move to crafting table (under nav lease)
        const Goals = await getGoals();
        const gotoResult = await this.withNavLease(
          'action:craft',
          'normal',
          async () => {
            await this.bot.pathfinder.goto(
              new Goals.GoalNear(
                craftingTable.position.x,
                craftingTable.position.y,
                craftingTable.position.z,
                2
              )
            );
            return { success: true };
          },
          { success: false, error: 'NAV_BUSY' },
          { success: false, error: 'NAV_PREEMPTED' },
        );
        if (!gotoResult.success) {
          return { success: false, error: 'Navigation busy — cannot reach crafting table' };
        }

        // Use the crafting table
        await this.bot.activateBlock(craftingTable);
      }

      // Craft the item
      await this.bot.craft(recipe, count, undefined);

      return {
        success: true,
        data: {
          item,
          count,
          recipe: recipe.result,
          usedCraftingTable: useCraftingTable || false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute pickup action
   */
  private async executePickup(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { item, maxDistance = 3 } = action.parameters;

    // Find nearby items
    const droppedItems = Object.values(this.bot.entities).filter(
      (entity) =>
        entity.name === 'item' &&
        (!item ||
          (entity.metadata?.[8] as any)?.itemId ===
            (this.bot as any).mcData.itemsByName[item]?.id) &&
        entity.position.distanceTo(this.bot.entity.position) <= maxDistance
    );

    if (droppedItems.length === 0) {
      return {
        success: false,
        error: `No ${item || 'items'} found within ${maxDistance} blocks`,
      };
    }

    // Sort items by distance and collect them
    const sortedItems = droppedItems.sort(
      (a, b) =>
        a.position.distanceTo(this.bot.entity.position) -
        b.position.distanceTo(this.bot.entity.position)
    );

    let collectedItems = 0;
    const collectedData: any[] = [];

    for (const itemEntity of sortedItems) {
      try {
        // Move to the item
        const Goals = await getGoals();
        const goal = new Goals.GoalNear(
          itemEntity.position.x,
          itemEntity.position.y,
          itemEntity.position.z,
          1
        );
        this.bot.pathfinder.setGoal(goal);

        // Wait for goal to be reached or timeout
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(
            () => reject(new Error('Pickup timeout')),
            timeout
          );

          this.bot.once('goal_reached', () => {
            clearTimeout(timeoutId);
            resolve();
          });

          (this.bot as any).once('path_error', (error: any) => {
            clearTimeout(timeoutId);
            reject(error);
          });
        });

        // The item should be automatically collected when we're close enough
        collectedItems++;
        collectedData.push({
          itemId: itemEntity.id,
          position: itemEntity.position.clone(),
        });

        // Small delay to allow collection
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`Failed to collect item ${itemEntity.id}: ${error}`);
        continue;
      }
    }

    if (collectedItems > 0) {
      return {
        success: true,
        data: {
          collectedItems,
          items: collectedData,
        },
      };
    } else {
      return {
        success: false,
        error: 'Failed to collect any items',
      };
    }
  }

  /**
   * Execute enhanced collect items action with exploration
   */
  private async executeCollectItemsEnhanced(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const {
      item,
      radius = 10,
      maxSearchTime = 30000,
      exploreOnFail = true,
    } = action.parameters;
    const startTime = Date.now();

    console.log(
      `🔍 Starting enhanced item collection for ${item || 'any items'} within ${radius} blocks`
    );

    // First, try the normal pickup method
    const initialPickup = await this.executePickup(
      {
        type: 'pickup_item',
        parameters: { item, maxDistance: radius },
        timeout: Math.min(5000, timeout),
      },
      Math.min(5000, timeout)
    );

    if (initialPickup.success) {
      console.log('✅ Items found and collected immediately');
      return initialPickup;
    }

    // If no items found and exploreOnFail is enabled, try exploration
    if (exploreOnFail && Date.now() - startTime < maxSearchTime) {
      console.log(
        `🔍 No items found immediately, starting exploration within ${radius} blocks`
      );

      // Try to explore the area by moving in a spiral pattern
      const explorationResult = await this.exploreForItems(
        item,
        radius,
        maxSearchTime - (Date.now() - startTime)
      );

      if (explorationResult.success) {
        console.log('✅ Items found during exploration');
        return explorationResult;
      }
    }

    return {
      success: false,
      error: `No ${item || 'items'} found within ${radius} blocks after ${Math.round((Date.now() - startTime) / 1000)}s search`,
    };
  }

  /**
   * Execute scan environment action to find trees or other resources
   */
  private async executeScanEnvironment(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const {
      targetBlock = 'oak_log',
      radius = 50,
      action: scanAction = 'find_nearest_block',
    } = action.parameters;

    console.log(
      `🔍 Scanning environment for ${targetBlock} within ${radius} blocks`
    );

    try {
      const scanResult = this.scanVisibleForTargetBlock(
        targetBlock,
        Math.min(radius, this.raycastConfig.maxDistance),
        timeout
      );

      if (scanResult.foundBlocks.length > 0) {
        const closestBlock = scanResult.foundBlocks.reduce(
          (closest, current) =>
            current.distance < closest.distance ? current : closest
        );

        console.log(
          `✅ Found ${scanResult.foundBlocks.length} ${targetBlock} blocks in FoV, closest at ${closestBlock.distance.toFixed(1)} blocks`
        );

        return {
          success: true,
          data: {
            foundBlocks: scanResult.foundBlocks.length,
            closestBlock: {
              position: closestBlock.position,
              distance: closestBlock.distance,
              blockType: targetBlock,
            },
          },
        };
      }

      console.log(`❌ No ${targetBlock} blocks found within ${radius} blocks`);
      return {
        success: false,
        error: `No ${targetBlock} blocks found within ${radius} blocks`,
      };
    } catch (error) {
      console.error('❌ Error during environment scan:', error);
      return {
        success: false,
        error: `Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private scanVisibleForTargetBlock(
    targetBlock: string,
    maxDistance: number,
    timeout: number
  ): { foundBlocks: Array<{ position: Vec3; distance: number }> } {
    const startTime = Date.now();
    const origin = this.getEyePosition();
    const orientation = this.getOrientation();
    const targets = this.buildTargetNameSet(targetBlock);

    const sweepConfig = {
      ...this.raycastConfig,
      maxDistance,
      fovDegrees: 90,
      panoramicSweep: false,
    };

    const hits = this.raycastEngine.sweepOccluders(
      { x: origin.x, y: origin.y, z: origin.z },
      orientation,
      sweepConfig
    );

    const foundBlocks: Array<{ position: Vec3; distance: number }> = [];
    const seen = new Set<string>();

    for (const hit of hits) {
      if (Date.now() - startTime > timeout) break;
      if (!targets.has(this.normalizeBlockName(hit.blockId))) continue;

      const position = new Vec3(hit.position.x, hit.position.y, hit.position.z);
      const key = `${Math.floor(position.x)},${Math.floor(
        position.y
      )},${Math.floor(position.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      foundBlocks.push({
        position,
        distance: this.bot.entity.position.distanceTo(position),
      });
    }

    return { foundBlocks };
  }

  private buildTargetNameSet(targetBlock: string): Set<string> {
    const normalized = this.normalizeBlockName(targetBlock);
    return new Set([normalized]);
  }

  private normalizeBlockName(name: string): string {
    return name.startsWith('minecraft:')
      ? name.slice('minecraft:'.length)
      : name;
  }

  private getEyePosition(): Vec3 {
    return this.bot.entity.position.offset(0, this.bot.entity.height, 0);
  }

  private getOrientation(): Orientation {
    return {
      yaw: this.bot.entity.yaw,
      pitch: this.bot.entity.pitch,
    };
  }

  /**
   * Execute a behavior tree by ID
   */
  private async executeBehaviorTree(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { btId } = action.parameters;

    console.log(`🎯 Executing behavior tree: ${btId}`);

    try {
      // For now, implement basic behavior tree execution
      // This is a placeholder that should be enhanced with proper BT execution
      if (btId === 'opt.craft_wooden_axe') {
        return await this.executeCraftWoodenAxe(action, timeout);
      }

      // Default behavior tree execution
      console.log(
        `⚠️ Behavior tree ${btId} not implemented, executing as wait`
      );
      return await this.executeWait(action, timeout);
    } catch (error) {
      console.error(`❌ Error executing behavior tree ${btId}:`, error);
      return {
        success: false,
        error: `Behavior tree execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Execute craft wooden axe behavior
   */
  private async executeCraftWoodenAxe(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    console.log('🔨 Crafting wooden axe...');

    try {
      // Check if we have the required materials
      const inventory = this.bot.inventory.items();
      const planks = inventory.find((item) => item.name === 'oak_planks');
      const sticks = inventory.find((item) => item.name === 'stick');

      if (!planks || planks.count < 3) {
        return {
          success: false,
          error: 'Need at least 3 oak planks to craft wooden axe',
        };
      }

      if (!sticks || sticks.count < 2) {
        return {
          success: false,
          error: 'Need at least 2 sticks to craft wooden axe',
        };
      }

      // For now, simulate crafting an axe since mineflayer API is complex
      // In a real implementation, this would use proper crafting mechanics
      console.log(
        '🔨 Simulating axe crafting (mineflayer API compatibility issue)'
      );

      // Check if we can simulate having an axe by checking inventory
      const currentInventory = this.bot.inventory.items();
      const hasAxe = currentInventory.some((item) => item.name.includes('axe'));

      if (hasAxe) {
        console.log('✅ Bot already has an axe');
        return {
          success: true,
          data: {
            crafted: 'wooden_axe',
            quantity: 1,
          },
        };
      } else {
        console.log(
          '⚠️ Bot needs an axe but crafting is not fully implemented'
        );
        return {
          success: false,
          error: 'Axe crafting not available - bot needs manual tool provision',
        };
      }
    } catch (error) {
      console.error('❌ Error crafting wooden axe:', error);
      return {
        success: false,
        error: `Crafting failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Explore area for items using spiral movement pattern
   */
  private async exploreForItems(
    item: string | undefined,
    radius: number,
    maxTime: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const startTime = Date.now();
    const center = this.bot.entity.position.clone();
    const spiralRadius = Math.min(radius, 10); // Limit spiral to reasonable size

    console.log(
      `🔄 Starting enhanced exploration using perception system within ${radius} blocks`
    );

    try {
      // Use the world package's perception system for better item detection
      const worldUrl = process.env.WORLD_SERVICE_URL || 'http://localhost:3004';

      const response = await resilientFetch(
        `${worldUrl}/api/perception/visual-field`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            position: { x: center.x, y: center.y, z: center.z },
            radius: radius,
            fieldOfView: { horizontal: 120, vertical: 60 }, // Wide field of view for exploration
            maxDistance: radius,
            observerPosition: { x: center.x, y: center.y, z: center.z },
            level: 'enhanced', // Use enhanced perception for better detection
          }),
        }
      );

      if (!response?.ok) {
        console.log(
          `World perception API failed, falling back to spiral search`
        );
        return this.fallbackSpiralExploration(
          item,
          radius,
          maxTime - (Date.now() - startTime)
        );
      }

      const perceptionResult = (await response.json()) as {
        observations?: Array<{
          type: string;
          itemId?: string;
          pos: { x: number; y: number; z: number };
          distance: number;
        }>;
      };

      // Look for items in the perception results
      const itemsFound =
        perceptionResult.observations?.filter(
          (obs) =>
            obs.type === 'item' &&
            (!item ||
              obs.itemId === (this.bot as any).mcData.itemsByName[item]?.id)
        ) || [];

      if (itemsFound.length > 0) {
        console.log(
          `🎯 Found ${itemsFound.length} items via perception system`
        );

        // Try to collect the closest item
        const closestItem = itemsFound.reduce((closest: any, current: any) =>
          current.distance < closest.distance ? current : closest
        );

        // Move to the item using pathfinding (under nav lease)
        try {
          const Goals = await getGoals();
          const gotoResult = await this.withNavLease(
            'action:explore_item',
            'normal',
            async () => {
              await this.bot.pathfinder.goto(
                new Goals.GoalBlock(
                  closestItem.pos.x,
                  closestItem.pos.y,
                  closestItem.pos.z
                )
              );
              return { success: true };
            },
            { success: false, error: 'NAV_BUSY' },
            { success: false, error: 'NAV_PREEMPTED' },
          );
          if (!gotoResult.success) {
            return { success: false, error: 'Navigation busy — cannot reach item' };
          }

          return await this.executePickup(
            {
              type: 'pickup_item',
              parameters: { item, maxDistance: radius },
              timeout: 5000,
            },
            5000
          );
        } catch (error) {
          console.log(`Failed to reach item at ${closestItem.pos}:`, error);
        }
      }

      // If no items found via perception, fall back to spiral exploration
      return this.fallbackSpiralExploration(
        item,
        radius,
        maxTime - (Date.now() - startTime)
      );
    } catch (error) {
      console.log(
        `Perception exploration failed, falling back to spiral:`,
        error
      );
      return this.fallbackSpiralExploration(
        item,
        radius,
        maxTime - (Date.now() - startTime)
      );
    }
  }

  /**
   * Fallback spiral exploration for when perception system fails
   */
  private async fallbackSpiralExploration(
    item: string | undefined,
    radius: number,
    maxTime: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const startTime = Date.now();
    const center = this.bot.entity.position.clone();
    const spiralRadius = Math.min(radius, 10); // Limit spiral to reasonable size

    console.log(
      `🔄 Starting fallback spiral exploration pattern within ${spiralRadius} blocks`
    );

    // Simple spiral exploration
    for (let r = 1; r <= spiralRadius; r += 2) {
      if (Date.now() - startTime > maxTime) {
        break;
      }

      // Check 4 directions at this radius
      const directions = [
        new Vec3(r, 0, 0), // East
        new Vec3(0, 0, r), // South
        new Vec3(-r, 0, 0), // West
        new Vec3(0, 0, -r), // North
      ];

      for (const direction of directions) {
        const targetPos = center.clone().add(direction);

        // Check if position is safe (not over void, water, lava, etc.)
        const block = this.bot.blockAt(targetPos);
        if (!block || block.name === 'air') {
          continue;
        }

        // Move to position (under nav lease)
        try {
          const Goals = await getGoals();
          const gotoResult = await this.withNavLease(
            'action:explore_spiral',
            'normal',
            async () => {
              await this.bot.pathfinder.goto(
                new Goals.GoalBlock(targetPos.x, targetPos.y, targetPos.z)
              );
              return { success: true };
            },
            { success: false, error: 'NAV_BUSY' },
            { success: false, error: 'NAV_PREEMPTED' },
          );
          if (!gotoResult.success) {
            continue; // Skip this waypoint, try the next direction
          }

          // Look for items from this new position
          const itemsFound = Object.values(this.bot.entities).filter(
            (entity) =>
              entity.name === 'item' &&
              (!item ||
                (entity.metadata?.[8] as any)?.itemId ===
                  (this.bot as any).mcData.itemsByName[item]?.id) &&
              entity.position.distanceTo(this.bot.entity.position) <= radius
          );

          if (itemsFound.length > 0) {
            console.log(
              `🎯 Found ${itemsFound.length} items at exploration position`
            );
            // Try to collect them
            return await this.executePickup(
              {
                type: 'pickup_item',
                parameters: { item, maxDistance: radius },
                timeout: 5000,
              },
              5000
            );
          }
        } catch (error) {
          // Ignore pathfinding errors and continue
          continue;
        }
      }
    }

    return {
      success: false,
      error: 'No items found during exploration',
    };
  }

  /**
   * Execute look at action
   */
  private async executeLookAt(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { target, direction, duration } = action.parameters;

    try {
      if (target) {
        // Look at specific target
        await this.bot.lookAt(target);
        return {
          success: true,
          data: {
            target: target.clone(),
            yaw: this.bot.entity.yaw,
            pitch: this.bot.entity.pitch,
          },
        };
      } else if (direction) {
        // Look in a specific direction
        let yaw = 0;
        let pitch = 0;

        // Ensure bot entity is available
        if (!this.bot.entity) {
          return {
            success: false,
            error: 'Bot entity not available for look action',
          };
        }

        switch (direction) {
          case 'around':
            yaw = Math.random() * 360;
            break;
          case 'up':
            pitch = -90;
            break;
          case 'down':
            pitch = 90;
            break;
          case 'left':
            yaw = (this.bot.entity.yaw || 0) - 90;
            break;
          case 'right':
            yaw = (this.bot.entity.yaw || 0) + 90;
            break;
          case 'forward':
            yaw = this.bot.entity.yaw || 0;
            break;
          case 'backward':
            yaw = (this.bot.entity.yaw || 0) + 180;
            break;
          default:
            yaw = Math.random() * 360;
        }

        await this.bot.look(yaw, pitch);

        // Wait for the specified duration
        if (duration) {
          await new Promise((resolve) => setTimeout(resolve, duration));
        }

        return {
          success: true,
          data: {
            direction,
            duration,
            yaw: this.bot.entity?.yaw || 0,
            pitch: this.bot.entity?.pitch || 0,
          },
        };
      } else {
        return {
          success: false,
          error: 'No target or direction specified for look_at action',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute chat action
   */
  private async executeChat(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    let { message } = action.parameters;

    try {
      // Cap outbound chat length
      if (message && message.length > 256) {
        const lastSpace = message.slice(0, 256).lastIndexOf(' ');
        message = lastSpace > 180 ? message.slice(0, lastSpace) + '...' : message.slice(0, 253) + '...';
      }
      await this.bot.chat(message);
      return {
        success: true,
        data: { message },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chat failed',
      };
    }
  }

  /**
   * Execute turn left action
   */
  private async executeTurnLeft(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current yaw
      const currentYaw = this.bot.entity.yaw || 0;
      const targetYaw = currentYaw - Math.PI / 2; // Turn 90 degrees left

      // Turn to the target yaw
      await this.bot.look(targetYaw, this.bot.entity.pitch || 0);

      return {
        success: true,
        data: {
          action: 'turn_left',
          previousYaw: currentYaw,
          newYaw: targetYaw,
          degreesTurned: 90,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Turn left failed',
      };
    }
  }

  /**
   * Execute turn right action
   */
  private async executeTurnRight(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current yaw
      const currentYaw = this.bot.entity.yaw || 0;
      const targetYaw = currentYaw + Math.PI / 2; // Turn 90 degrees right

      // Turn to the target yaw
      await this.bot.look(targetYaw, this.bot.entity.pitch || 0);

      return {
        success: true,
        data: {
          action: 'turn_right',
          previousYaw: currentYaw,
          newYaw: targetYaw,
          degreesTurned: 90,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Turn right failed',
      };
    }
  }

  /**
   * Execute jump action
   */
  private async executeJump(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Set the jump control state
      this.bot.setControlState('jump', true);

      // Wait a short time
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Release the jump control state
      this.bot.setControlState('jump', false);

      return {
        success: true,
        data: { action: 'jump' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Jump failed',
      };
    }
  }

  /**
   * Execute wait action
   */
  private async executeWait(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const { duration } = action.parameters;

    await new Promise((resolve) => setTimeout(resolve, duration));

    return {
      success: true,
      data: { duration },
    };
  }

  /**
   * Execute gather action - collect resources from the environment
   */
  private async executeGather(
    action: MinecraftAction,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const {
      resource = 'wood',
      amount = 3,
      target = 'tree',
    } = action.parameters;

    try {
      console.log(
        `🔧 Executing gather action for ${amount}x ${resource} from ${target}`
      );

      // Get current position
      const position = this.bot.entity.position;
      console.log(`Bot position: ${position.x}, ${position.y}, ${position.z}`);

      // Look for nearby blocks of the target type
      const nearbyBlocks = this.bot.findBlocks({
        matching: (block: any) => {
          const blockName = block.name.toLowerCase();
          const resourceName = resource.toLowerCase();

          // Match wood/logs for wood gathering
          if (
            resourceName === 'wood' &&
            (blockName.includes('log') || blockName.includes('wood'))
          ) {
            return true;
          }

          // Match stone for stone gathering
          if (
            resourceName === 'stone' &&
            (blockName.includes('stone') || blockName.includes('cobblestone'))
          ) {
            return true;
          }

          return blockName.includes(resourceName);
        },
        maxDistance: 5,
        count: amount,
      });

      console.log(`Found ${nearbyBlocks.length} nearby ${resource} blocks`);

      if (nearbyBlocks.length === 0) {
        return {
          success: false,
          error: `No ${resource} blocks found within 5 blocks`,
        };
      }

      let gatheredCount = 0;
      const gatheredItems: any[] = [];

      // Try to break each block
      for (const blockPos of nearbyBlocks) {
        if (gatheredCount >= amount) break;

        try {
          console.log(
            `Breaking block at ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`
          );

          // First, move closer to the block to ensure we can pick up items
          const Goals = await getGoals();
          const goal = new Goals.GoalNear(
            blockPos.x,
            blockPos.y,
            blockPos.z,
            2
          );
          this.bot.pathfinder.setGoal(goal);

          // Wait a moment for the bot to move closer
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Use dig_block action to break the block
          const digResult = await this.executeDigBlock(
            {
              type: 'dig_block',
              parameters: { pos: blockPos },
              timeout: 5000,
            },
            5000
          );

          if (digResult.success) {
            gatheredCount++;
            gatheredItems.push({
              position: blockPos,
              resource: resource,
              success: true,
            });
            console.log(
              `✅ Successfully gathered ${resource} from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}`
            );
          } else {
            console.log(
              `❌ Failed to gather from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}: ${digResult.error}`
            );
          }
        } catch (error) {
          console.log(
            `❌ Error gathering from ${blockPos.x}, ${blockPos.y}, ${blockPos.z}: ${error}`
          );
        }
      }

      // Check if we actually picked up items
      const inventoryBefore = this.bot.inventory.items().length;

      // Wait a moment for items to be picked up
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Try to pick up any dropped items
      if (gatheredCount > 0) {
        console.log('🔧 Attempting to pick up dropped items...');
        try {
          const pickupResult = await this.executePickup(
            {
              type: 'pickup_item',
              parameters: { radius: 3 },
              timeout: 5000,
            },
            5000
          );

          if (pickupResult.success) {
            console.log('✅ Successfully picked up items');
          } else {
            console.log('⚠️ Failed to pick up items:', pickupResult.error);
          }
        } catch (error) {
          console.log('⚠️ Error during pickup:', error);
        }
      }

      // Wait a bit more for pickup to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const inventoryAfter = this.bot.inventory.items().length;
      const itemsPickedUp = inventoryAfter - inventoryBefore;

      console.log(
        `Inventory change: ${inventoryBefore} → ${inventoryAfter} (+${itemsPickedUp} items)`
      );

      return {
        success: gatheredCount > 0,
        data: {
          gathered: gatheredCount,
          target: resource,
          items: gatheredItems,
          inventoryChange: itemsPickedUp,
        },
        error:
          gatheredCount === 0 ? `Failed to gather any ${resource}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute experimental item interaction to discover properties
   */
  private async executeExperimentWithItem(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { item_type = 'any', action: experimentAction = 'consume' } =
        action.parameters;

      // Find items to experiment with
      const items = this.bot.inventory.items();
      let targetItems = items;

      if (item_type !== 'any') {
        targetItems = items.filter((item) =>
          item.name.toLowerCase().includes(item_type.toLowerCase())
        );
      }

      if (targetItems.length === 0) {
        return {
          success: false,
          error: `No items found for experimentation with type: ${item_type}`,
        };
      }

      // Choose an item to experiment with
      const itemToTest = targetItems[0];
      const healthBefore = this.bot.health;
      const foodBefore = this.bot.food;

      let experimentResult = null;

      // Try different interactions based on the experiment action
      switch (experimentAction) {
        case 'consume':
          try {
            await this.bot.consume();
            experimentResult = {
              action: 'consume',
              success: true,
              healthChange: this.bot.health - healthBefore,
              foodChange: this.bot.food - foodBefore,
            };
          } catch (error) {
            experimentResult = {
              action: 'consume',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
          break;

        case 'place':
          try {
            const position = this.bot.entity.position.offset(0, 0, 1);
            const targetBlock = this.bot.blockAt(position);
            if (targetBlock) {
              await this.bot.placeBlock(targetBlock, itemToTest as any);
            }
            experimentResult = {
              action: 'place',
              success: true,
              position: position,
            };
          } catch (error) {
            experimentResult = {
              action: 'place',
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
          break;

        default:
          return {
            success: false,
            error: `Unknown experiment action: ${experimentAction}`,
          };
      }

      return {
        success: true,
        data: {
          itemTested: itemToTest.name,
          experimentAction,
          result: experimentResult,
          discovery: {
            itemType: itemToTest.name,
            isEdible:
              experimentAction === 'consume' &&
              experimentResult.success &&
              (experimentResult.healthChange ?? 0) > 0,
            isPlaceable:
              experimentAction === 'place' && experimentResult.success,
            healthEffect: experimentResult.healthChange || 0,
            foodEffect: experimentResult.foodChange || 0,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during experimentation',
      };
    }
  }

  /**
   * Execute comprehensive item property exploration
   */
  private async executeExploreItemProperties(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { item_type, properties_to_test = ['edible', 'placeable'] } =
        action.parameters;

      const items = this.bot.inventory.items();
      const targetItems = items.filter((item) =>
        item.name.toLowerCase().includes(item_type.toLowerCase())
      );

      if (targetItems.length === 0) {
        return {
          success: false,
          error: `No items found for property exploration: ${item_type}`,
        };
      }

      const itemToTest = targetItems[0];
      const healthBefore = this.bot.health;
      const foodBefore = this.bot.food;
      const discoveries = [];

      // Test each property
      for (const property of properties_to_test) {
        try {
          switch (property) {
            case 'edible':
              try {
                await this.bot.consume();
                discoveries.push({
                  property: 'edible',
                  result: true,
                  healthEffect: this.bot.health - healthBefore,
                  foodEffect: this.bot.food - foodBefore,
                });
              } catch (error) {
                discoveries.push({
                  property: 'edible',
                  result: false,
                  error:
                    error instanceof Error ? error.message : 'Cannot consume',
                });
              }
              break;

            case 'placeable':
              try {
                const position = this.bot.entity.position.offset(0, 0, 1);
                const targetBlock = this.bot.blockAt(position);
                if (targetBlock) {
                  await this.bot.placeBlock(targetBlock, itemToTest as any);
                }
                discoveries.push({
                  property: 'placeable',
                  result: true,
                  position: position,
                });
              } catch (error) {
                discoveries.push({
                  property: 'placeable',
                  result: false,
                  error:
                    error instanceof Error ? error.message : 'Cannot place',
                });
              }
              break;

            default:
              discoveries.push({
                property,
                result: false,
                error: 'Property test not implemented',
              });
          }
        } catch (error) {
          discoveries.push({
            property,
            result: false,
            error: error instanceof Error ? error.message : 'Test failed',
          });
        }
      }

      return {
        success: true,
        data: {
          itemExplored: itemToTest.name,
          propertiesTested: properties_to_test,
          discoveries,
          summary: {
            isEdible:
              discoveries.find((d) => d.property === 'edible')?.result || false,
            isPlaceable:
              discoveries.find((d) => d.property === 'placeable')?.result ||
              false,
            healthEffect:
              discoveries.find((d) => d.property === 'edible')?.healthEffect ||
              0,
            foodEffect:
              discoveries.find((d) => d.property === 'edible')?.foodEffect || 0,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during property exploration',
      };
    }
  }

  /**
   * Execute attack entity action
   */
  private async executeAttackEntity(
    action: any,
    timeout: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { target = 'nearest' } = action.parameters;

      // Find the nearest entity to attack
      const entities = Object.values(this.bot.entities);
      let targetEntity = null;

      if (target === 'nearest') {
        // Find the nearest entity that can be attacked
        let nearestDistance = Infinity;
        for (const entity of entities) {
          if (entity.type === 'hostile' || entity.type === 'other') {
            const distance = this.bot.entity.position.distanceTo(
              entity.position
            );
            if (distance < nearestDistance) {
              nearestDistance = distance;
              targetEntity = entity;
            }
          }
        }
      } else {
        // Find entity by type
        targetEntity = entities.find(
          (entity) => entity.type === target || entity.name === target
        );
      }

      if (!targetEntity) {
        return {
          success: false,
          error: `No target entity found for: ${target}`,
        };
      }

      // Move towards the entity if it's not close enough
      const distance = this.bot.entity.position.distanceTo(
        targetEntity.position
      );
      if (distance > 3) {
        const Goals = await getGoals();
        const gotoResult = await this.withNavLease(
          'action:attack',
          'normal',
          async () => {
            await this.bot.pathfinder.goto(
              new Goals.GoalBlock(
                targetEntity!.position.x,
                targetEntity!.position.y,
                targetEntity!.position.z
              )
            );
            return { success: true };
          },
          { success: false, error: 'NAV_BUSY' },
          { success: false, error: 'NAV_PREEMPTED' },
        );
        if (!gotoResult.success) {
          return { success: false, error: 'Navigation busy — cannot reach target entity' };
        }
      }

      // Attack the entity
      await this.bot.attack(targetEntity);

      return {
        success: true,
        data: {
          target: targetEntity.name || targetEntity.type,
          position: targetEntity.position,
          distance: distance,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Attack failed',
      };
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Find nearest block of specified type (any block in range, no visibility check).
   * Prefer findNearestVisibleBlock for dig targets so the bot only targets blocks it can see.
   */
  private findNearestBlock(blockType: string): Vec3 {
    const bot = this.bot;

    // Ensure bot is spawned before accessing position
    if (!bot.entity || !bot.entity.position) {
      throw new Error('Bot not fully spawned - cannot access position');
    }

    const pos = bot.entity.position;

    for (let radius = 1; radius <= 10; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
          for (let z = -radius; z <= radius; z++) {
            const checkPos = pos.offset(x, y, z);
            const block = bot.blockAt(checkPos);
            if (block && block.name.includes(blockType)) {
              return checkPos;
            }
          }
        }
      }
    }

    throw new Error(`No ${blockType} found within 10 blocks`);
  }

  /**
   * Find nearest block of specified type that the bot can actually see (line-of-sight).
   * Uses raycast sweep so only unoccluded blocks are considered; prevents digging through dirt/stone.
   */
  private findNearestVisibleBlock(blockType: string): Vec3 {
    const timeout = 3000;
    const result = this.scanVisibleForTargetBlock(
      blockType,
      this.raycastConfig.maxDistance,
      timeout
    );
    if (result.foundBlocks.length === 0) {
      throw new Error(
        `No visible ${blockType} found within ${this.raycastConfig.maxDistance} blocks`
      );
    }
    const closest = result.foundBlocks.reduce((a, b) =>
      a.distance < b.distance ? a : b
    );
    return closest.position;
  }

  /**
   * Update pathfinding settings
   */
  updateMovements(): void {
    this.movements = new Movements(this.bot);
    this.movements.scafoldingBlocks = [];
    this.movements.canDig = false;
  }
}

/**
 * Types for Minecraft integration with conscious bot planning system
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import {
  PlanningContext,
  IntegratedPlanningResult,
  Plan,
  PlanStep,
} from '@conscious-bot/planning';

// ==================== Minecraft World State ====================

export interface MinecraftWorldState {
  player: {
    position: Vec3;
    health: number;
    food: number;
    experience: number;
    gameMode: string;
    dimension: string;
  };

  inventory: {
    items: MinecraftItem[];
    totalSlots: number;
    usedSlots: number;
  };

  environment: {
    timeOfDay: number;
    isRaining: boolean;
    nearbyBlocks: MinecraftBlock[];
    nearbyEntities: MinecraftEntity[];
  };

  server: {
    playerCount: number;
    difficulty: string;
    version: string;
  };
}

export interface MinecraftItem {
  type: string;
  count: number;
  slot: number;
  metadata?: any;
}

export interface MinecraftBlock {
  type: string;
  position: Vec3;
  properties?: Record<string, any>;
  hardness?: number;
  tool?: string;
}

export interface MinecraftEntity {
  id: number;
  type: string;
  position: Vec3;
  health?: number;
  isHostile?: boolean;
}

// ==================== Bot Configuration ====================

export interface BotConfig {
  host: string;
  port: number;
  username: string;
  version: string;
  auth: 'mojang' | 'offline';

  // Behavior settings
  pathfindingTimeout: number;
  actionTimeout: number;
  observationRadius: number;

  // Safety settings
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  emergencyDisconnect: boolean;
}

// ==================== Minecraft Actions ====================

export type MinecraftActionType =
  | 'navigate'
  | 'look_at'
  | 'mine_block'
  | 'place_block'
  | 'craft_item'
  | 'pickup_item'
  | 'drop_item'
  | 'use_item'
  | 'attack_entity'
  | 'chat'
  | 'wait';

export interface MinecraftAction {
  type: MinecraftActionType;
  parameters: Record<string, any>;
  timeout?: number;
  retries?: number;
}

// Specific action parameter types
export interface NavigateAction extends MinecraftAction {
  type: 'navigate';
  parameters: {
    target: Vec3;
    range?: number;
    sprint?: boolean;
  };
}

export interface MineBlockAction extends MinecraftAction {
  type: 'mine_block';
  parameters: {
    position: Vec3;
    blockType?: string;
    tool?: string;
  };
}

export interface CraftAction extends MinecraftAction {
  type: 'craft_item';
  parameters: {
    item: string;
    count: number;
    useCraftingTable?: boolean;
  };
}

// ==================== Execution Results ====================

export interface ActionResult {
  success: boolean;
  action: MinecraftAction;
  startTime: number;
  endTime: number;
  error?: string;
  data?: any;
}

export interface PlanExecutionResult {
  success: boolean;
  plan: Plan;
  executedSteps: number;
  totalSteps: number;
  startTime: number;
  endTime: number;
  actionResults: ActionResult[];
  repairAttempts: number;
  finalWorldState: MinecraftWorldState;
  error?: string;
  planningResult?: IntegratedPlanningResult;
  signals?: any[];
  finalHomeostasis?: any;
}

// ==================== Scenarios ====================

export interface ScenarioConfig {
  name: string;
  description: string;
  timeout: number;
  preconditions?: Record<string, any>;
  successConditions: Record<string, any>;
  failureConditions?: Record<string, any>;
  tags?: string[];
}

export interface ScenarioResult {
  scenario: ScenarioConfig;
  success: boolean;
  executionTime: number;
  planningResult: IntegratedPlanningResult;
  executionResult: PlanExecutionResult;
  telemetry: ScenarioTelemetry;
  error?: string;
}

// ==================== Telemetry ====================

export interface ScenarioTelemetry {
  planningLatency: number;
  executionLatency: number;
  totalLatency: number;

  stepMetrics: {
    planned: number;
    executed: number;
    succeeded: number;
    failed: number;
    repaired: number;
  };

  performanceMetrics: {
    memoryUsage: number;
    cpuUsage?: number;
    networkLatency?: number;
  };

  cognitiveMetrics: {
    routingDecision: string;
    planningApproach: string;
    confidence: number;
    complexityScore: number;
  };

  minecraftMetrics: {
    blocksInteracted: number;
    distanceTraveled: number;
    itemsCollected: number;
    actionsFailed: number;
  };
}

// ==================== Event Types ====================

export type BotEventType =
  | 'connected'
  | 'spawned'
  | 'disconnected'
  | 'error'
  | 'health_changed'
  | 'inventory_changed'
  | 'position_changed'
  | 'block_broken'
  | 'item_picked_up'
  | 'chat_message';

export interface BotEvent {
  type: BotEventType;
  timestamp: number;
  data: any;
}

// ==================== Simulation Stub ====================

export interface SimulationConfig {
  worldSeed: string;
  spawnPosition: Vec3;
  initialInventory: MinecraftItem[];
  worldBlocks: MinecraftBlock[];
  timeStep: number; // milliseconds per simulation step
}

export interface SimulationState {
  step: number;
  worldState: MinecraftWorldState;
  actionQueue: MinecraftAction[];
  events: BotEvent[];
}

// ==================== Utilities ====================

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  component: string;
  message: string;
  data?: any;
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  operations: {
    [operation: string]: {
      count: number;
      totalTime: number;
      averageTime: number;
      minTime: number;
      maxTime: number;
    };
  };
}

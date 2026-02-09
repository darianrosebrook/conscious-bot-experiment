/**
 * Types for Minecraft integration with conscious bot planning system
 *
 * @author @darianrosebrook
 */

import { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';

// ==================== Navigation Configuration ====================

export interface NavigationConfig {
  dstarLite?: {
    searchRadius?: number;
    replanThreshold?: number;
    maxComputationTime?: number;
    heuristicWeight?: number;
  };
  costCalculation?: {
    baseMoveCost?: number;
    diagonalMultiplier?: number;
    verticalMultiplier?: number;
    jumpCost?: number;
    swimCost?: number;
    // Enhanced water navigation costs
    surfaceSwimCost?: number;
    deepSwimCost?: number;
    currentResistanceCost?: number;
    buoyancyCost?: number;
    waterExitCost?: number;
  };
  hazardCosts?: {
    lavaProximity?: number;
    voidFall?: number;
    mobProximity?: number;
    darknessPenalty?: number;
    waterPenalty?: number;
    // Enhanced water hazards
    drowningRisk?: number;
    currentHazard?: number;
    deepWaterPenalty?: number;
    surfaceObstruction?: number;
    // Minecraft-specific hazards
    cactusPenalty?: number;
    firePenalty?: number;
    poisonPenalty?: number;
  };
  optimization?: {
    pathSmoothing?: boolean;
    lookaheadDistance?: number;
    safetyMargin?: number;
  };
  maxDistance?: number;
  timeout?: number;
  [key: string]: any;
}

// Minimal type definitions to avoid circular dependency with planning package
export interface PlanningContext {
  goal: string;
  currentState: Record<string, any>;
  resources: Record<string, any>;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  worldState?: Record<string, any>;
  timeConstraints?: Record<string, any>;
  activeGoals?: any[];
  availableResources?: any[];
  situationalFactors?: any;
  bot?: any;
}

export interface IntegratedPlanningResult {
  success: boolean;
  plan?: Plan;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Plan {
  id: string;
  steps: PlanStep[];
  metadata?: Record<string, any>;
  goalId?: string;
  status?: string;
  updatedAt?: number;
}

export interface PlanStep {
  id: string;
  type: 'action' | 'goal' | 'subgoal' | 'condition';
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'blocked';
  priority: number;
  estimatedDuration: number;
  dependencies: string[];
  constraints: string[];
  metadata?: Record<string, any>;
  preconditions?: any[];
  effects?: any[];
  order?: number;
  expectedDurationMs?: number;
  stepId?: string;
  args?: any;
  safetyLevel?: string;
  action?: {
    id?: string;
    name?: string;
    type: string;
    parameters?: Record<string, any>;
    description?: string;
    preconditions?: any[];
    effects?: any[];
    cost?: number;
    duration?: number;
    successProbability?: number;
  };
  planId?: string;
}

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
    worldSeed?: string; // World seed for memory versioning
    worldName?: string; // World name for identification
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
  name?: string;
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
  auth: 'microsoft' | 'offline';

  // World configuration for memory versioning
  worldSeed?: string; // Optional world seed for memory isolation
  worldName?: string; // Optional world name for identification

  // Behavior settings
  pathfindingTimeout: number;
  actionTimeout: number;
  observationRadius: number;
  maxRetries?: number;

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
  | 'dig_block'
  | 'place_block'
  | 'craft_item'
  | 'craft'
  | 'pickup_item'
  | 'collect_items_enhanced'
  | 'execute_behavior_tree'
  | 'drop_item'
  | 'use_item'
  | 'attack_entity'
  | 'chat'
  | 'wait'
  | 'consume_food'
  | 'find_shelter'
  | 'move_forward'
  | 'move_backward'
  | 'strafe_left'
  | 'strafe_right'
  | 'turn_left'
  | 'turn_right'
  | 'jump'
  | 'experiment_with_item'
  | 'explore_item_properties'
  | 'gather'
  | 'move_to'
  | 'scan_environment'
  | 'smelt'
  | 'smelt_item'
  | 'prepare_site'
  | 'build_module'
  | 'place_feature'
  | 'place_workstation'
  | 'acquire_material'
  | 'equip_weapon'
  | 'equip_tool'
  | 'retreat_from_threat';

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

export interface ConsumeFoodAction extends MinecraftAction {
  type: 'consume_food';
  parameters: {
    food_type?: string;
    amount?: number;
  };
}

export interface PlaceBlockAction extends MinecraftAction {
  type: 'place_block';
  parameters: {
    block_type: string;
    count?: number;
    placement?: 'around_player' | 'specific_position';
    position?: Vec3;
  };
}

export interface FindShelterAction extends MinecraftAction {
  type: 'find_shelter';
  parameters: {
    shelter_type?: 'cave_or_house' | 'underground' | 'above_ground';
    light_sources?: boolean;
    search_radius?: number;
  };
}

export interface ExperimentWithItemAction extends MinecraftAction {
  type: 'experiment_with_item';
  parameters: {
    item_type: string;
    experiment_type?: 'consume' | 'place' | 'craft';
    position?: Vec3;
  };
}

export interface GatherAction extends MinecraftAction {
  type: 'gather';
  parameters: {
    resource: string;
    amount?: number;
    target?: string;
    radius?: number;
  };
}

export interface ExploreItemPropertiesAction extends MinecraftAction {
  type: 'explore_item_properties';
  parameters: {
    item_type: string;
    properties_to_test?: string[];
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
  | 'respawned'
  | 'disconnected'
  | 'error'
  | 'warning'
  | 'health_changed'
  | 'inventory_changed'
  | 'position_changed'
  | 'block_broken'
  | 'item_picked_up'
  | 'chat_message'
  | 'safety_emergency'
  | 'safety_emergency_failed';

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

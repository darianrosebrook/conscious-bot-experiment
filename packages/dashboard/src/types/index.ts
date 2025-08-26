/**
 * Dashboard Types
 * @author @darianrosebrook
 */

// HUD (Heads-Up Display) types
export interface Vitals {
  health: number;
  hunger: number;
  stamina: number;
  sleep: number;
}

export interface Interoception {
  stress: number;
  focus: number;
  curiosity: number;
}

export interface HudData {
  ts: string;
  vitals: Vitals;
  intero: Interoception;
  mood: string;
}

// Chain of Thought types
export type ThoughtType = 'self' | 'reflection' | 'intrusion';

export interface Thought {
  id: string;
  ts: string;
  text: string;
  type: ThoughtType;
  attrHidden?: boolean; // true in prod; debugging only
  sender?: string; // For chat messages
  thoughtType?: string; // Internal thought type (internal, external_chat_in, external_chat_out, intrusive, reflection, observation)
  attribution?: 'self' | 'external' | 'intrusive'; // Source of the thought
}

// Task types
export type TaskSource =
  | 'goal'
  | 'planner'
  | 'reflection'
  | 'intrusion'
  | 'system';

export interface TaskStep {
  id: string;
  label: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  priority: number; // 0..1
  progress: number; // 0..1
  source: TaskSource;
  steps?: TaskStep[];
}

// Event types
export interface Event {
  id: string;
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
}

// Memory types
export type MemoryType = 'episodic' | 'semantic' | 'reflective';

export interface Memory {
  id: string;
  ts: string;
  type: MemoryType;
  text: string;
  tags?: string[];
  link?: {
    eventId?: string;
    entityId?: string;
  };
  score?: number; // salience or retrieval score
}

// Screenshot types
export interface Screenshot {
  id: string;
  ts: string;
  url: string; // signed URL or public path
  eventId?: string; // nearest event id
}

// Environment types
export interface Environment {
  biome: string;
  weather: string;
  timeOfDay: string;
  nearbyEntities: string[];
}

// Planner types
export interface PlanStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  steps: PlanStep[];
  progress: number;
  estimatedDuration: number;
  createdAt: number;
}

export interface Action {
  id: string;
  name: string;
  type: string;
  target?: string;
  priority: number;
  startedAt?: number;
  estimatedDuration?: number;
  progress?: number;
}

export interface PlannerData {
  currentPlan: Plan | null;
  planQueue: Omit<Plan, 'steps' | 'progress' | 'createdAt'>[];
  currentAction: Action | null;
  actionQueue: Action[];
  isPlanningActive: boolean;
  isExecuting: boolean;
  timestamp: number;
}

// Inventory types
export interface InventoryItem {
  type: string | number | null;
  count: number;
  slot: number;
  metadata?: Record<string, unknown>;
  displayName?: string;
  durability?: number;
  maxDurability?: number;
}

export interface InventoryData {
  inventory: InventoryItem[];
  totalItems: number;
  timestamp: number;
}

// Intrusive thought request/response
export interface IntrusiveThoughtRequest {
  text: string;
  tags?: string[];
  strength?: number; // bias weight for planner
}

export interface IntrusiveThoughtResponse {
  id: string;
  accepted: boolean;
  rationale?: string;
}

// WebSocket message types
export interface WsMessage<T = unknown> {
  type: string;
  data: T;
  ts: string;
}

// Replay types
export interface ReplaySession {
  id: string;
  startTime: string;
  endTime: string;
  events: Event[];
  screenshots: Screenshot[];
}

// UI State types
export interface DashboardState {
  isLive: boolean;
  currentSession?: string;
  hud: HudData | null;
  thoughts: Thought[];
  tasks: Task[];
  events: Event[];
  memories: Memory[];
  environment: Environment | null;
  currentScreenshot: Screenshot | null;
  inventory: InventoryItem[];
  plannerData: PlannerData | null;
}

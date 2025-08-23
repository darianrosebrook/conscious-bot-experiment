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
}

// Task types
export type TaskSource = 'goal' | 'planner' | 'reflection' | 'intrusion';

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
}

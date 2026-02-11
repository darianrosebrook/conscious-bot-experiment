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

export interface StressAxes {
  time: number;
  situational: number;
  healthHunger: number;
  resource: number;
  protection: number;
  locationDistance: number;
}

export interface Interoception {
  stress: number;
  focus: number;
  curiosity: number;
  stressAxes?: StressAxes;
}

export interface HudData {
  ts: string;
  vitals: Vitals;
  intero: Interoception;
  mood: string;
}

// Chain of Thought types
export type ThoughtType = 'self' | 'reflection' | 'intrusion' | 'intrusive';

export interface Thought {
  id: string;
  ts: string;
  /** Display text (GOAL tags stripped). Used for dedup and list display. */
  text: string;
  /** Raw content before stripping (may include [GOAL: ...]). Used for goal tag chips. */
  content?: string;
  type: ThoughtType;
  attrHidden?: boolean; // true in prod; debugging only
  sender?: string; // For chat messages
  thoughtType?: string; // Thought type: internal, idle-reflection, reflection, observation, planning, external_chat_in, external_chat_out, intrusive, etc.
  /** Dashboard-only: chain-of-thought vs intrusion for display; bot always sees attribution 'self' */
  provenance?: 'chain-of-thought' | 'intrusion';
  attribution?: 'self' | 'external' | 'intrusive'; // Source of the thought (bot-facing)
  optimistic?: boolean; // Whether this is an optimistic UI update
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
  requirement?: {
    kind: 'collect' | 'mine' | 'craft';
    quantity: number;
    have: number;
    needed: number;
    patterns?: string[];
    outputPattern?: string;
    proxyPatterns?: string[];
    proxyHave?: number;
  };
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

// Note types
export interface Note {
  id: string;
  ts: string;
  type: string;
  title: string;
  content: string;
  source: string;
  confidence: number;
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
  biomeTemperature?: number;
  biomeHumidity?: number;
  biomeCategory?: string;
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

// Database management types
export interface DatabaseOverview {
  databaseName: string;
  worldSeed: string | number;
  totalChunks: number;
  entityCount: number;
  relationshipCount: number;
  memoryTypeDistribution: Record<string, number>;
  tableSizeBytes: number;
  indexInfo: { name: string; size: string; type: string }[];
}

export interface MemoryChunkSummary {
  id: string;
  content: string;
  memoryType: string;
  importance: number;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
  entityCount: number;
  relationshipCount: number;
}

export interface KnowledgeGraphSummary {
  topEntities: { name: string; type: string; connectionCount: number }[];
  entityTypeDistribution: Record<string, number>;
  relationshipTypeDistribution: Record<string, number>;
  totalEntities: number;
  totalRelationships: number;
}

export interface EmbeddingHealth {
  dimension: number;
  totalEmbeddings: number;
  normStats: { min: number; max: number; avg: number; stddev: number };
  indexType: string;
  indexSize: string;
  sampleSimilarityDistribution: { bucket: string; count: number }[];
}

// Reflection & narrative types
export interface ReflectionSummary {
  id: string;
  type: 'progress' | 'failure' | 'success' | 'adaptation' | 'meta' | 'narrative' | 'identity';
  content: string;
  timestamp: number;
  emotionalValence: number;
  confidence: number;
  insights: string[];
  lessons: string[];
  tags: string[];
  isPlaceholder: boolean;
  memorySubtype?: string;
  significance?: number;
  narrativeArc?: string;
  emotionalTone?: string;
  title?: string;
}

export interface LessonSummary {
  id: string;
  content: string;
  category: string;
  effectiveness: number;
  applicationCount: number;
}

export interface NarrativeSummary {
  id: string;
  title: string;
  summary: string;
  timestamp: number;
  significance: number;
  narrativeArc: string;
  emotionalTone: string;
}

// UI State types
export interface DashboardState {
  isLive: boolean;
  currentSession?: string;
  hud: HudData | null;
  thoughts: Thought[];
  tasks: Task[];
  /** True when /api/tasks returned fallback: true (planning unavailable). */
  tasksFallback: boolean;
  events: Event[];
  memories: Memory[];
  notes: Note[];
  environment: Environment | null;
  currentScreenshot: Screenshot | null;
  inventory: InventoryItem[];
  plannerData: PlannerData | null;
  /** Valuation decision records for observability (Rig F). Last 100, deduped by eventId. */
  valuationRecords: ValuationDashboardRecord[];
  /** Whether TTS is enabled on the cognition server. */
  ttsEnabled: boolean;
}

// Interoception History types (evaluation dashboard)
export interface InteroSnapshot {
  ts: number;
  stress: number;
  focus: number;
  curiosity: number;
  stressAxes: StressAxes;
  emotionalState: string;
}

export interface ServiceHealthStatus {
  name: string;
  status: 'up' | 'down';
}

// Valuation observability types (Rig F)
export interface ValuationDashboardRecord {
  eventId: string;
  decisionId: string;
  timestamp: number;
  correlation: { taskId?: string; tickId?: number; plannerCycleId?: string };
  solved: boolean;
  error?: string;
  slotModel: string;
  unknownItemPolicy: string;
  countPolicy: string;
  slotsBefore: number;
  slotsAfter: number;
  slotBudget: number;
  actionsCount: number;
  droppedCount: number;
  storedCount: number;
  keptCount: number;
  unknownItems: string[];
  protectedItems: string[];
  rulesetLintIssueCodes: string[];
  valuationInputDigest: string;
  decisionDigest: string;
  inventoryStateHash: string;
  rulesetDigest: string;
  fastVerification?: { valid: boolean; failedChecks: string[] };
  fullRecord?: Record<string, unknown>;
}

// Embedding visualization types
export interface EmbeddingPoint3D {
  id: string;
  x: number;
  y: number;
  z: number;
  metadata: {
    type: string;
    importance: number;
    content: string;
    createdAt: string;
  };
}

export interface EmbeddingVizResponse {
  points: EmbeddingPoint3D[];
  hash: string;
  count: number;
  message?: string;
}

// Building designer types
export type {
  Vec3,
  PlacedBlock,
  BuildMode,
  BlockCategory,
} from './building';
export {
  BLOCK_CATEGORIES,
  ALL_BLOCKS,
  DEFAULT_BLOCK_TYPE,
  DEFAULT_GRID_SIZE,
} from './building';

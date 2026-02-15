import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import type {
  DashboardState,
  HudData,
  Thought,
  Task,
  Event,
  Memory,
  Note,
  Environment,
  Screenshot,
  InventoryItem,
  PlannerData,
  ValuationDashboardRecord,
} from '@/types';

// =============================================================================
// Types
// =============================================================================

interface DashboardStore extends DashboardState {
  // Actions
  setIsLive: (_isLive: boolean) => void;
  setHud: (_hud: HudData) => void;
  addThought: (_thought: Thought) => void;
  setThoughts: (_thoughts: Thought[]) => void;
  clearThoughts: () => void;
  loadThoughtsFromServer: () => Promise<void>;
  setTasks: (_tasks: Task[]) => void;
  setTasksFallback: (_fallback: boolean) => void;
  updateTask: (_id: string, _updates: Partial<Task>) => void;
  addTask: (_task: Task) => void;
  addEvent: (_event: Event) => void;
  setEvents: (_events: Event[]) => void;
  setMemories: (_memories: Memory[]) => void;
  setNotes: (_notes: Note[]) => void;
  setEnvironment: (_environment: Environment) => void;
  setCurrentScreenshot: (_screenshot: Screenshot) => void;
  setCurrentSession: (_sessionId: string) => void;
  setInventory: (_inventory: InventoryItem[]) => void;
  setPlannerData: (_plannerData: PlannerData) => void;
  addValuationRecord: (_record: ValuationDashboardRecord) => void;
  setValuationRecords: (_records: ValuationDashboardRecord[]) => void;
  setTtsEnabled: (_enabled: boolean) => void;
  toggleTts: () => Promise<void>;
  loadTtsStatus: () => Promise<void>;
  reset: () => void;
}

// =============================================================================
// Persistence Configuration
// =============================================================================

import { GOAL_TAG_RE, cleanDisplayText } from '@/lib/text-utils';

/** Alias for backward-compat references within this file. */
const GOAL_TAG_STRIP_RE = GOAL_TAG_RE;

/** Session restore limits to avoid localStorage bloat. */
const SESSION_TASKS_MAX = 50;
const SESSION_EVENTS_MAX = 50;
const SESSION_MEMORIES_MAX = 50;
const SESSION_NOTES_MAX = 50;
const SESSION_INVENTORY_MAX = 100;

const PERSIST_CONFIG = {
  name: 'conscious-bot-dashboard-state',
  partialize: (state: DashboardStore) => ({
    thoughts: state.thoughts,
    isLive: state.isLive,
    ttsEnabled: state.ttsEnabled,
    valuationRecords: state.valuationRecords.map(
      ({ fullRecord: _dropped, ...rest }) => rest
    ),
    // Session restore: persist so refresh shows data immediately; server fetch updates in background
    tasks: (state.tasks || []).slice(-SESSION_TASKS_MAX),
    tasksFallback: state.tasksFallback,
    events: (state.events || []).slice(-SESSION_EVENTS_MAX),
    memories: (state.memories || []).slice(-SESSION_MEMORIES_MAX),
    notes: (state.notes || []).slice(-SESSION_NOTES_MAX),
    environment: state.environment,
    hud: state.hud,
    inventory: (state.inventory || []).slice(-SESSION_INVENTORY_MAX),
    plannerData: state.plannerData,
  }),
  merge: (
    persistedState: any,
    currentState: DashboardStore
  ): DashboardStore => {
    if (!persistedState) return currentState;
    const merged = { ...currentState, ...persistedState };

    // Clean and deduplicate thoughts
    if (Array.isArray(merged.thoughts)) {
      const cleaned = merged.thoughts.map((t: any) => ({
        ...t,
        text: typeof t.text === 'string' ? cleanDisplayText(t.text) : t.text,
      }));
      const seen = new Map<string, (typeof cleaned)[0]>();
      for (const t of cleaned) {
        const key = (t.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const existing = seen.get(key);
        if (!existing || (t.ts || '') > (existing.ts || '')) {
          seen.set(key, t);
        }
      }
      merged.thoughts = [...seen.values()].sort((a: any, b: any) =>
        (a.ts || '').localeCompare(b.ts || '')
      );
    }

    // Restore session arrays only if valid; otherwise keep initial state
    merged.tasks = Array.isArray(persistedState.tasks)
      ? persistedState.tasks.slice(-SESSION_TASKS_MAX)
      : currentState.tasks;
    merged.events = Array.isArray(persistedState.events)
      ? persistedState.events.slice(-SESSION_EVENTS_MAX)
      : currentState.events;
    merged.memories = Array.isArray(persistedState.memories)
      ? persistedState.memories.slice(-SESSION_MEMORIES_MAX)
      : currentState.memories;
    merged.notes = Array.isArray(persistedState.notes)
      ? persistedState.notes.slice(-SESSION_NOTES_MAX)
      : currentState.notes;
    merged.inventory = Array.isArray(persistedState.inventory)
      ? persistedState.inventory.slice(-SESSION_INVENTORY_MAX)
      : currentState.inventory;
    merged.tasksFallback =
      persistedState.tasksFallback === true || currentState.tasksFallback;
    merged.environment =
      persistedState.environment && typeof persistedState.environment === 'object'
        ? persistedState.environment
        : currentState.environment;
    merged.hud =
      persistedState.hud && typeof persistedState.hud === 'object'
        ? persistedState.hud
        : currentState.hud;
    merged.plannerData =
      persistedState.plannerData && typeof persistedState.plannerData === 'object'
        ? persistedState.plannerData
        : currentState.plannerData;

    return merged;
  },
};

// =============================================================================
// Initial State
// =============================================================================

const initialState: DashboardState = {
  isLive: true,
  hud: null,
  thoughts: [],
  tasks: [],
  tasksFallback: false,
  events: [],
  memories: [],
  notes: [],
  environment: null,
  currentScreenshot: null,
  inventory: [],
  plannerData: null,
  valuationRecords: [],
  ttsEnabled: true,
};

// =============================================================================
// Deep Equality Check
// =============================================================================

const isDeepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!isDeepEqual(a[key], b[key])) return false;
  }

  return true;
};

// =============================================================================
// Dashboard Store
// =============================================================================

/**
 * Dashboard state store using Zustand
 * Manages all real-time data for the conscious bot dashboard
 * Optimized to prevent unnecessary state updates and rerenders
 * Includes persistence for thoughts across page refreshes
 */
export const useDashboardStore = create<DashboardStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setIsLive: (isLive) => {
          const current = get().isLive;
          if (current !== isLive) {
            set({ isLive });
          }
        },

        setHud: (hud) => {
          const current = get().hud;
          if (!isDeepEqual(current, hud)) {
            set({ hud });
          }
        },

        addThought: (thought) =>
          set((state) => {
            const rawContent =
              typeof thought.content === 'string'
                ? thought.content
                : thought.text;
            const displayText =
              typeof thought.text === 'string'
                ? cleanDisplayText(thought.text)
                : typeof rawContent === 'string'
                  ? cleanDisplayText(rawContent)
                  : '';
            const thoughtWithId = {
              ...thought,
              id: thought.id || generateId(),
              text: displayText,
              content: rawContent,
            };

            // Check if thought with same ID already exists
            const existingThought = state.thoughts.find(
              (t) => t.id === thoughtWithId.id
            );
            if (existingThought) {
              // If it's an optimistic update being replaced by server response, allow it
              if (existingThought.optimistic && !thoughtWithId.optimistic) {
                const newThoughts = state.thoughts
                  .map((t) => (t.id === thoughtWithId.id ? thoughtWithId : t))
                  .slice(-100);
                return { thoughts: newThoughts };
              }
              return state; // Don't add duplicate
            }

            // If this is a server-confirmed thought, replace any matching optimistic thought
            // (optimistic thoughts have a different ID like "optimistic-..." so ID match won't catch this)
            if (!thoughtWithId.optimistic) {
              const matchingOptimistic = state.thoughts.find(
                (t) =>
                  t.optimistic &&
                  t.text === thoughtWithId.text &&
                  t.type === thoughtWithId.type
              );
              if (matchingOptimistic) {
                const newThoughts = state.thoughts
                  .map((t) =>
                    t.id === matchingOptimistic.id ? thoughtWithId : t
                  )
                  .slice(-100);
                return { thoughts: newThoughts };
              }
            }

            // Cross-type content dedup: catch identical or near-identical content
            // regardless of type or timestamp. The cognition pipeline re-emits
            // the same content as drive-tick, internal, etc. Strip GOAL tags so
            // "My inventory is bare [GOAL: collect oak_log 8]" matches
            // "My inventory is bare" from a different type. No time window —
            // we never want the same semantic message repeated in the stream.
            const canonical = (thoughtWithId.text || '')
              .toLowerCase()
              .replace(GOAL_TAG_STRIP_RE, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (!thoughtWithId.optimistic && canonical) {
              const echoMatch = state.thoughts.find(
                (t) =>
                  !t.optimistic &&
                  (t.text || '')
                    .toLowerCase()
                    .replace(GOAL_TAG_STRIP_RE, '')
                    .replace(/\s+/g, ' ')
                    .trim() === canonical
              );
              if (echoMatch) {
                return state; // cross-type content echo — skip
              }
            }

            // Check for duplicate content — use a longer window for environmental/awareness messages
            const text = thoughtWithId.text || '';
            const lowerText = text.toLowerCase().trim();
            const isEnvironmental =
              thoughtWithId.thoughtType === 'environmental' ||
              thoughtWithId.thoughtType === 'idle-reflection' ||
              lowerText.startsWith('awareness:') ||
              lowerText === 'maintaining awareness of surroundings.';
            const dedupWindowMs = isEnvironmental ? 120_000 : 30_000; // 2 min vs 30s
            const cutoff = new Date(Date.now() - dedupWindowMs).toISOString();
            const recentDuplicate = state.thoughts.find(
              (t) =>
                t.text === thoughtWithId.text &&
                t.type === thoughtWithId.type &&
                t.ts > cutoff &&
                !t.optimistic // Don't prevent optimistic updates from being replaced
            );

            if (recentDuplicate && !thoughtWithId.optimistic) {
              return state; // Don't add duplicate content
            }

            const newThoughts = [...state.thoughts, thoughtWithId].slice(-100); // Keep last 100 thoughts
            return {
              thoughts: newThoughts,
            };
          }),

        setThoughts: (thoughts) => {
          // Clean all incoming thoughts (strip GOAL tags)
          const cleaned = thoughts.map((t) => ({
            ...t,
            text:
              typeof t.text === 'string' ? cleanDisplayText(t.text) : t.text,
          }));
          const current = get().thoughts;
          if (!isDeepEqual(current, cleaned)) {
            set({ thoughts: cleaned });
          }
        },

        // Clear thoughts (useful for debugging)
        clearThoughts: () => {
          set({ thoughts: [] });
        },

        // Load thoughts from server (for initial load)
        loadThoughtsFromServer: async () => {
          try {
            const response = await fetch('/api/ws/cognitive-stream/recent');
            if (response.ok) {
              const data = await response.json();
              if (data.thoughts && Array.isArray(data.thoughts)) {
                const serverThoughts = data.thoughts.map((thought: any) => {
                  const raw = thought.content;
                  const display = cleanDisplayText(
                    thought.displayContent || thought.content
                  );
                  return {
                    id: thought.id,
                    ts: new Date(thought.timestamp).toISOString(),
                    text: display,
                    content: raw,
                    type: thought.type || 'reflection',
                    attribution: thought.attribution || 'self',
                    thoughtType: thought.metadata?.thoughtType || thought.type,
                    provenance: thought.metadata?.provenance,
                  };
                });
                set({ thoughts: serverThoughts });
              }
            }
          } catch (error) {
            if (import.meta.env.VITE_DEBUG_DASHBOARD === '1') {
              console.warn('Failed to load thoughts from server:', error);
            }
          }
        },

        setTasks: (tasks) => {
          const current = get().tasks;
          if (!isDeepEqual(current, tasks)) {
            set({ tasks });
          }
        },

        setTasksFallback: (fallback) => set({ tasksFallback: fallback }),

        updateTask: (id, updates) =>
          set((state) => {
            const taskIndex = state.tasks.findIndex((t) => t.id === id);
            if (taskIndex === -1) return state;

            const updatedTask = { ...state.tasks[taskIndex], ...updates };
            if (isDeepEqual(state.tasks[taskIndex], updatedTask)) {
              return state; // No change, don't update
            }

            const newTasks = [...state.tasks];
            newTasks[taskIndex] = updatedTask;
            return { tasks: newTasks };
          }),

        addTask: (task) =>
          set((state) => {
            if (state.tasks.some((t) => t.id === task.id)) return state;
            return { tasks: [...state.tasks, task].slice(-100) };
          }),

        addEvent: (event) =>
          set((state) => {
            const eventWithId = {
              ...event,
              id: event.id || generateId(),
            };

            // Check for duplicate events
            const existingEvent = state.events.find(
              (e) => e.id === eventWithId.id
            );
            if (existingEvent) return state;

            const newEvents = [...state.events, eventWithId].slice(-50); // Keep last 50 events
            return { events: newEvents };
          }),

        setEvents: (events) => {
          const current = get().events;
          if (!isDeepEqual(current, events)) {
            set({ events });
          }
        },

        setMemories: (memories) => {
          const current = get().memories;
          if (!isDeepEqual(current, memories)) {
            set({ memories });
          }
        },

        setNotes: (notes) => {
          const current = get().notes;
          if (!isDeepEqual(current, notes)) {
            set({ notes });
          }
        },

        setEnvironment: (environment) => {
          const current = get().environment;
          if (!isDeepEqual(current, environment)) {
            set({ environment });
          }
        },

        setCurrentScreenshot: (screenshot) => {
          const current = get().currentScreenshot;
          if (!isDeepEqual(current, screenshot)) {
            set({ currentScreenshot: screenshot });
          }
        },

        setCurrentSession: (sessionId) => {
          const current = get().currentSession;
          if (current !== sessionId) {
            set({ currentSession: sessionId });
          }
        },

        setInventory: (inventory) => {
          const current = get().inventory;
          if (!isDeepEqual(current, inventory)) {
            set({ inventory });
          }
        },

        setPlannerData: (plannerData) => {
          const current = get().plannerData;
          if (!isDeepEqual(current, plannerData)) {
            set({ plannerData });
          }
        },

        addValuationRecord: (record) =>
          set((state) => {
            // Dedup by eventId (NOT decisionId — occurrences are never collapsed)
            if (
              state.valuationRecords.some((r) => r.eventId === record.eventId)
            ) {
              return state;
            }
            const newRecords = [...state.valuationRecords, record].slice(-100);
            return { valuationRecords: newRecords };
          }),

        setValuationRecords: (records) => {
          const current = get().valuationRecords;
          if (!isDeepEqual(current, records)) {
            set({ valuationRecords: records });
          }
        },

        setTtsEnabled: (enabled) => {
          if (get().ttsEnabled !== enabled) {
            set({ ttsEnabled: enabled });
          }
        },

        toggleTts: async () => {
          const current = get().ttsEnabled;
          // Optimistic update
          set({ ttsEnabled: !current });
          try {
            const res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: !current }),
            });
            if (res.ok) {
              const data = await res.json();
              set({ ttsEnabled: data.enabled });
            } else {
              // Revert on failure
              set({ ttsEnabled: current });
            }
          } catch {
            // Revert on failure
            set({ ttsEnabled: current });
          }
        },

        loadTtsStatus: async () => {
          try {
            const res = await fetch('/api/tts');
            if (res.ok) {
              const data = await res.json();
              if (typeof data.enabled === 'boolean') {
                set({ ttsEnabled: data.enabled });
              }
            }
          } catch {
            // Silently fail — keep current state
          }
        },

        reset: () => set(initialState),
      }),
      PERSIST_CONFIG
    ),
    {
      name: 'dashboard-store',
    }
  )
);

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
} from '@/types';

// =============================================================================
// Types
// =============================================================================

interface DashboardStore extends DashboardState {
  // Actions
  setIsLive: (isLive: boolean) => void;
  setHud: (hud: HudData) => void;
  addThought: (thought: Thought) => void;
  setThoughts: (thoughts: Thought[]) => void;
  clearThoughts: () => void;
  loadThoughtsFromServer: () => Promise<void>;
  setTasks: (tasks: Task[]) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  addEvent: (event: Event) => void;
  setEvents: (events: Event[]) => void;
  setMemories: (memories: Memory[]) => void;
  setNotes: (notes: Note[]) => void;
  setEnvironment: (environment: Environment) => void;
  setCurrentScreenshot: (screenshot: Screenshot) => void;
  setCurrentSession: (sessionId: string) => void;
  setInventory: (inventory: InventoryItem[]) => void;
  setPlannerData: (plannerData: PlannerData) => void;
  reset: () => void;
}

// =============================================================================
// Persistence Configuration
// =============================================================================

const PERSIST_CONFIG = {
  name: 'conscious-bot-dashboard-state',
  partialize: (state: DashboardStore) => ({
    // Only persist thoughts and essential state
    thoughts: state.thoughts,
    isLive: state.isLive,
    // Don't persist real-time data that should be fetched fresh
    // hud: state.hud,
    // tasks: state.tasks,
    // environment: state.environment,
    // inventory: state.inventory,
    // plannerData: state.plannerData,
  }),
};

// =============================================================================
// Initial State
// =============================================================================

const initialState: DashboardState = {
  isLive: true,
  hud: null,
  thoughts: [],
  tasks: [],
  events: [],
  memories: [],
  notes: [],
  environment: null,
  currentScreenshot: null,
  inventory: [],
  plannerData: null,
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

  return false;
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
            // Ensure thought has a unique ID
            const thoughtWithId = {
              ...thought,
              id: thought.id || generateId(),
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

            // Also check for duplicate content within a 30-second window
            // Prevents repetitive fallback observations from flooding the stream
            const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
            const recentDuplicate = state.thoughts.find(
              (t) =>
                t.text === thoughtWithId.text &&
                t.type === thoughtWithId.type &&
                t.ts > thirtySecondsAgo &&
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
          const current = get().thoughts;
          if (!isDeepEqual(current, thoughts)) {
            set({ thoughts });
          }
        },

        // Clear thoughts (useful for debugging)
        clearThoughts: () => {
          set({ thoughts: [] });
        },

        // Load thoughts from server (for initial load)
        loadThoughtsFromServer: async () => {
          try {
            const response = await fetch('/api/ws/cognitive-stream/history');
            if (response.ok) {
              const data = await response.json();
              if (data.thoughts && Array.isArray(data.thoughts)) {
                const serverThoughts = data.thoughts.map((thought: any) => ({
                  id: thought.id,
                  ts: new Date(thought.timestamp).toISOString(),
                  text: thought.content,
                  type: thought.type || 'reflection',
                  attribution: thought.attribution || 'self',
                  thoughtType: thought.metadata?.thoughtType || thought.type,
                }));
                set({ thoughts: serverThoughts });
              }
            }
          } catch (error) {
            console.warn('Failed to load thoughts from server:', error);
          }
        },

        setTasks: (tasks) => {
          const current = get().tasks;
          if (!isDeepEqual(current, tasks)) {
            set({ tasks });
          }
        },

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

        reset: () => set(initialState),
      }),
      PERSIST_CONFIG
    ),
    {
      name: 'dashboard-store',
    }
  )
);

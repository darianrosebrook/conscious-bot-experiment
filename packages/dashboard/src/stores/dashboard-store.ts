import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import type {
  DashboardState,
  HudData,
  Thought,
  Task,
  Event,
  Memory,
  Environment,
  Screenshot,
  InventoryItem,
} from '@/types';

interface DashboardStore extends DashboardState {
  // Actions
  setIsLive: (isLive: boolean) => void;
  setHud: (hud: HudData) => void;
  addThought: (thought: Thought) => void;
  setThoughts: (thoughts: Thought[]) => void;
  setTasks: (tasks: Task[]) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  addEvent: (event: Event) => void;
  setEvents: (events: Event[]) => void;
  setMemories: (memories: Memory[]) => void;
  setEnvironment: (environment: Environment) => void;
  setCurrentScreenshot: (screenshot: Screenshot) => void;
  setCurrentSession: (sessionId: string) => void;
  setInventory: (inventory: InventoryItem[]) => void;
  reset: () => void;
}

const initialState: DashboardState = {
  isLive: true,
  hud: null,
  thoughts: [],
  tasks: [],
  events: [],
  memories: [],
  environment: null,
  currentScreenshot: null,
  inventory: [],
};

/**
 * Dashboard state store using Zustand
 * Manages all real-time data for the conscious bot dashboard
 */
export const useDashboardStore = create<DashboardStore>()(
  devtools(
    (set, _get) => ({
      ...initialState,

      setIsLive: (isLive) => set({ isLive }),

      setHud: (hud) => set({ hud }),

      addThought: (thought) =>
        set((state) => {
          console.log('Store: addThought called with:', thought);
          // Ensure thought has a unique ID
          const thoughtWithId = {
            ...thought,
            id: thought.id || generateId(),
          };

          console.log('Store: thoughtWithId:', thoughtWithId);

          // Check if thought with same ID already exists
          const existingThought = state.thoughts.find(
            (t) => t.id === thoughtWithId.id
          );
          if (existingThought) {
            console.log('Store: Duplicate ID found, not adding');
            return state; // Don't add duplicate
          }

          // Also check for duplicate content within a short time window (5 seconds)
          const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
          const recentDuplicate = state.thoughts.find(
            (t) =>
              t.text === thoughtWithId.text &&
              t.type === thoughtWithId.type &&
              t.ts > fiveSecondsAgo
          );

          if (recentDuplicate) {
            console.log('Store: Recent duplicate found, not adding');
            return state; // Don't add duplicate content
          }

          const newThoughts = [...state.thoughts, thoughtWithId].slice(-100); // Keep last 100 thoughts
          console.log(
            'Store: Adding thought, new thoughts count:',
            newThoughts.length
          );
          return {
            thoughts: newThoughts,
          };
        }),

      setThoughts: (thoughts) => set({ thoughts }),

      setTasks: (tasks) => set({ tasks }),

      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        })),

      addEvent: (event) =>
        set((state) => ({
          events: [...state.events, event].slice(-50), // Keep last 50 events
        })),

      setEvents: (events) => set({ events }),

      setMemories: (memories) => set({ memories }),

      setEnvironment: (environment) => set({ environment }),

      setCurrentScreenshot: (currentScreenshot) => set({ currentScreenshot }),

      setCurrentSession: (currentSession) => set({ currentSession }),

      setInventory: (inventory) => set({ inventory }),

      reset: () => set(initialState),
    }),
    {
      name: 'dashboard-store',
    }
  )
);

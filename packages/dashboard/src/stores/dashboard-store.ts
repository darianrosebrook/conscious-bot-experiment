import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { 
  DashboardState, 
  HudData, 
  Thought, 
  Task, 
  Event, 
  Memory, 
  Environment, 
  Screenshot 
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
        set((state) => ({ 
          thoughts: [...state.thoughts, thought].slice(-100) // Keep last 100 thoughts
        })),

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
          events: [...state.events, event].slice(-50) // Keep last 50 events
        })),

      setEvents: (events) => set({ events }),

      setMemories: (memories) => set({ memories }),

      setEnvironment: (environment) => set({ environment }),

      setCurrentScreenshot: (currentScreenshot) => set({ currentScreenshot }),

      setCurrentSession: (currentSession) => set({ currentSession }),

      reset: () => set(initialState),
    }),
    {
      name: 'dashboard-store',
    }
  )
);

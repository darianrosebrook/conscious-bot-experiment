/**
 * Dashboard Context
 * Provides configuration and shared state for dashboard components
 * @author @darianrosebrook
 */

import React, { createContext, useContext, ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface DashboardConfig {
  routes: {
    tasks: () => string;
    planner: () => string;
    world: () => string;
    inventory: () => string;
    memories: () => string;
    events: () => string;
    notes: () => string;
    intrusive: () => string;
    screenshots: () => string;
    viewerStatus: () => string;
    startViewer: () => string;
    stopViewer: () => string;
    botStateHTTP: () => string;
    botState: () => string;
    botHealth: () => string;
    cognitiveStreamSSE: () => string;
    cognitiveStreamPOST: () => string;
  };
  api: {
    baseUrl: string;
    timeout: number;
  };
  websocket: {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };
}

interface DashboardContextType {
  config: DashboardConfig;
}

// =============================================================================
// Default Configuration
// =============================================================================

const defaultConfig: DashboardConfig = {
  routes: {
    tasks: () => '/api/tasks',
    planner: () => 'http://localhost:3002/planner',
    world: () => '/api/world',
    inventory: () => '/api/inventory',
    memories: () => '/api/memories',
    events: () => '/api/events',
    notes: () => '/api/notes',
    intrusive: () => '/api/intrusive',
    screenshots: () => '/api/screenshots',
    viewerStatus: () => 'http://localhost:3005/viewer-status',
    startViewer: () => 'http://localhost:3005/start-viewer',
    stopViewer: () => 'http://localhost:3005/stop-viewer',
    botStateHTTP: () => '/api/ws/bot-state',
    botState: () => 'http://localhost:3005/state',
    botHealth: () => 'http://localhost:3005/health',
    cognitiveStreamSSE: () => '/api/ws/cognitive-stream',
    cognitiveStreamPOST: () => '/api/ws/cognitive-stream',
  },
  api: {
    baseUrl: '',
    timeout: 10000,
  },
  websocket: {
    url: 'ws://localhost:3005',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
  },
};

// =============================================================================
// Context
// =============================================================================

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined
);

// =============================================================================
// Provider Component
// =============================================================================

interface DashboardProviderProps {
  children: ReactNode;
  config?: Partial<DashboardConfig>;
}

export function DashboardProvider({
  children,
  config: customConfig,
}: DashboardProviderProps) {
  const config: DashboardConfig = {
    ...defaultConfig,
    ...customConfig,
    routes: {
      ...defaultConfig.routes,
      ...customConfig?.routes,
    },
    api: {
      ...defaultConfig.api,
      ...customConfig?.api,
    },
    websocket: {
      ...defaultConfig.websocket,
      ...customConfig?.websocket,
    },
  };

  return (
    <DashboardContext.Provider value={{ config }}>
      {children}
    </DashboardContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useDashboardContext(): DashboardContextType {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error(
      'useDashboardContext must be used within a DashboardProvider'
    );
  }
  return context;
}

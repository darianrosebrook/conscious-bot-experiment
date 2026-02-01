'use client';
/**
 * Dashboard Context
 * Provides configuration and shared state for dashboard components
 * @author @darianrosebrook
 */

import React, {
  createContext,
  useContext,
  ReactNode,
  // useState,
  // useEffect,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ServiceEndpoints {
  minecraft: {
    baseUrl: string;
    health: () => string;
    state: () => string;
    inventory: () => string;
    telemetry: () => string;
    viewerStatus: () => string;
    startViewer: () => string;
    stopViewer: () => string;
  };
  cognition: {
    baseUrl: string;
    health: () => string;
    process: () => string;
    generateThoughts: () => string;
    cognitiveStream: {
      sse: () => string;
      post: () => string;
      recent: () => string;
    };
  };
  memory: {
    baseUrl: string;
    health: () => string;
    state: () => string;
    telemetry: () => string;
    entities: () => string;
    search: () => string;
  };
  planning: {
    baseUrl: string;
    health: () => string;
    tasks: () => string;
    state: () => string;
    planner: () => string;
    telemetry: () => string;
  };
  world: {
    baseUrl: string;
    health: () => string;
    state: () => string;
    environment: () => string;
  };
  evaluation: {
    baseUrl: string;
    health: () => string;
    metrics: () => string;
    alerts: () => string;
  };
}

export interface DashboardConfig {
  // Legacy routes for backward compatibility
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

  // Environment-based service discovery
  environment: 'development' | 'production' | 'docker' | 'kubernetes' | 'test';
  serviceDiscovery: {
    enabled: boolean;
    registryUrl?: string;
    healthCheckInterval: number;
  };

  // Service endpoints with fallbacks
  endpoints: ServiceEndpoints;

  // API configuration
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };

  // WebSocket configuration
  websocket: {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };

  // Dashboard-specific settings
  dashboard: {
    refreshInterval: number;
    maxThoughts: number;
    maxEvents: number;
  };

  // Feature flags
  features: {
    evaluation: boolean;
    advancedMetrics: boolean;
    systemHealth: boolean;
    realTimeUpdates: boolean;
  };
}

/**
 * Enhanced API Client for all services
 */
class ApiClient {
  private config: DashboardConfig;
  private serviceDiscovery: ServiceDiscovery;

  constructor(config: DashboardConfig) {
    this.config = config;
    this.serviceDiscovery = ServiceDiscovery.getInstance();
  }

  /**
   * Make a request with retry logic and fallback handling
   */
  private async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.api.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.api.timeout
        );

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...options.headers,
          },
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return response;
        }

        // If service is unavailable, try to get updated endpoints
        if (response.status >= 500 && this.config.serviceDiscovery.enabled) {
          await this.serviceDiscovery.getHealthyEndpoints();
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.api.retryAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.api.retryDelay * attempt)
          );
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  // Service-specific methods
  async getTasks() {
    const response = await this.makeRequest(
      this.config.endpoints.planning.tasks()
    );
    return response.json();
  }

  async getInventory() {
    const response = await this.makeRequest(
      this.config.endpoints.minecraft.inventory()
    );
    return response.json();
  }

  async getMemories() {
    const response = await this.makeRequest(
      this.config.endpoints.memory.state()
    );
    return response.json();
  }

  async getEvents() {
    const [memoryEvents, planningEvents, minecraftEvents] =
      await Promise.allSettled([
        this.makeRequest(this.config.endpoints.memory.telemetry()).then((r) =>
          r.json()
        ),
        this.makeRequest(this.config.endpoints.planning.telemetry()).then((r) =>
          r.json()
        ),
        this.makeRequest(this.config.endpoints.minecraft.telemetry()).then(
          (r) => r.json()
        ),
      ]);

    const allEvents: any[] = [];

    if (memoryEvents.status === 'fulfilled') {
      allEvents.push(...(memoryEvents.value.events || []));
    }
    if (planningEvents.status === 'fulfilled') {
      allEvents.push(...(planningEvents.value.events || []));
    }
    if (minecraftEvents.status === 'fulfilled') {
      allEvents.push(...(minecraftEvents.value.events || []));
    }

    return { events: allEvents };
  }

  async getEnvironment() {
    const response = await this.makeRequest(
      this.config.endpoints.world.environment()
    );
    return response.json();
  }

  async getEvaluationMetrics() {
    if (!this.config.features.evaluation) {
      throw new Error('Evaluation features disabled');
    }

    const response = await this.makeRequest(
      this.config.endpoints.evaluation.metrics()
    );
    return response.json();
  }

  async getBotState() {
    const response = await this.makeRequest(
      this.config.endpoints.minecraft.state()
    );
    return response.json();
  }

  async sendIntrusiveThought(content: string, metadata?: any) {
    const response = await this.makeRequest(
      this.config.endpoints.cognition.process(),
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'intrusion',
          content,
          metadata,
        }),
      }
    );
    return response.json();
  }

  /**
   * Get cognitive stream data
   */
  async getCognitiveStream(_limit?: number) {
    const response = await this.makeRequest(
      this.config.endpoints.cognition.cognitiveStream.recent()
    );
    return response.json();
  }
}

interface DashboardContextType {
  config: DashboardConfig;
  apiClient: ApiClient;
  serviceHealth: Record<string, boolean>;
}

// =============================================================================
// Default Configuration
// =============================================================================

// Service discovery and connection management
class ServiceDiscovery {
  private static instance: ServiceDiscovery;
  // private serviceRegistry = new Map<string, string>();
  // private healthChecks = new Map<string, NodeJS.Timeout>();
  private readonly DEFAULT_PORTS = {
    minecraft: 3005,
    cognition: 3003,
    memory: 3001,
    planning: 3002,
    world: 3004,
    evaluation: 3008, // 3006 reserved for Prismarine viewer
  };

  private constructor() {}

  public static getInstance(): ServiceDiscovery {
    if (!ServiceDiscovery.instance) {
      ServiceDiscovery.instance = new ServiceDiscovery();
    }
    return ServiceDiscovery.instance;
  }

  /**
   * Auto-discover service endpoints based on environment
   */
  async discoverServices(): Promise<ServiceEndpoints> {
    const env =
      (process.env.NODE_ENV as
        | 'development'
        | 'production'
        | 'docker'
        | 'kubernetes'
        | 'test') || 'development';

    switch (env) {
      case 'production':
        return this.discoverProductionServices();
      case 'docker':
        return this.discoverDockerServices();
      case 'kubernetes':
        return this.discoverKubernetesServices();
      case 'test':
        return this.discoverDevelopmentServices(); // Use development config for tests
      default:
        return this.discoverDevelopmentServices();
    }
  }

  private async discoverDevelopmentServices(): Promise<ServiceEndpoints> {
    const baseUrls = {
      minecraft: `http://localhost:${this.DEFAULT_PORTS.minecraft}`,
      cognition: `http://localhost:${this.DEFAULT_PORTS.cognition}`,
      memory: `http://localhost:${this.DEFAULT_PORTS.memory}`,
      planning: `http://localhost:${this.DEFAULT_PORTS.planning}`,
      world: `http://localhost:${this.DEFAULT_PORTS.world}`,
      evaluation: `http://localhost:${this.DEFAULT_PORTS.evaluation}`,
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverDockerServices(): Promise<ServiceEndpoints> {
    // In Docker, services are available via service names
    const baseUrls = {
      minecraft: 'http://minecraft-interface:3005',
      cognition: 'http://cognition:3003',
      memory: 'http://memory:3001',
      planning: 'http://planning:3002',
      world: 'http://world:3004',
      evaluation: 'http://evaluation:3006',
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverKubernetesServices(): Promise<ServiceEndpoints> {
    // In Kubernetes, use service discovery or config maps
    const baseUrls = {
      minecraft: 'http://minecraft-interface.default.svc.cluster.local:3005',
      cognition: 'http://cognition.default.svc.cluster.local:3003',
      memory: 'http://memory.default.svc.cluster.local:3001',
      planning: 'http://planning.default.svc.cluster.local:3002',
      world: 'http://world.default.svc.cluster.local:3004',
      evaluation: 'http://evaluation.default.svc.cluster.local:3006',
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverProductionServices(): Promise<ServiceEndpoints> {
    // In production, use environment variables or service registry
    const baseUrls = {
      minecraft:
        process.env.MINECRAFT_SERVICE_URL ||
        `http://minecraft-interface:${this.DEFAULT_PORTS.minecraft}`,
      cognition:
        process.env.COGNITION_SERVICE_URL ||
        `http://cognition:${this.DEFAULT_PORTS.cognition}`,
      memory:
        process.env.MEMORY_SERVICE_URL ||
        `http://memory:${this.DEFAULT_PORTS.memory}`,
      planning:
        process.env.PLANNING_SERVICE_URL ||
        `http://planning:${this.DEFAULT_PORTS.planning}`,
      world:
        process.env.WORLD_SERVICE_URL ||
        `http://world:${this.DEFAULT_PORTS.world}`,
      evaluation:
        process.env.EVALUATION_SERVICE_URL ||
        `http://evaluation:${this.DEFAULT_PORTS.evaluation}`,
    };

    return this.createEndpoints(baseUrls);
  }

  private createEndpoints(baseUrls: Record<string, string>): ServiceEndpoints {
    return {
      minecraft: {
        baseUrl: baseUrls.minecraft,
        health: () => `${baseUrls.minecraft}/health`,
        state: () => `${baseUrls.minecraft}/state`,
        inventory: () => `${baseUrls.minecraft}/inventory`,
        telemetry: () => `${baseUrls.minecraft}/telemetry`,
        viewerStatus: () => `${baseUrls.minecraft}/viewer-status`,
        startViewer: () => `${baseUrls.minecraft}/start-viewer`,
        stopViewer: () => `${baseUrls.minecraft}/stop-viewer`,
      },
      cognition: {
        baseUrl: baseUrls.cognition,
        health: () => `${baseUrls.cognition}/health`,
        process: () => `${baseUrls.cognition}/process`,
        generateThoughts: () => `${baseUrls.cognition}/generate-thoughts`,
        cognitiveStream: {
          sse: () => `/api/ws/cognitive-stream`,
          post: () => `/api/ws/cognitive-stream`,
          recent: () => `${baseUrls.cognition}/api/cognitive-stream/recent`,
        },
      },
      memory: {
        baseUrl: baseUrls.memory,
        health: () => `${baseUrls.memory}/health`,
        state: () => `${baseUrls.memory}/state`,
        telemetry: () => `${baseUrls.memory}/telemetry`,
        entities: () => `${baseUrls.memory}/social-memory/entities`,
        search: () => `${baseUrls.memory}/social-memory/search`,
      },
      planning: {
        baseUrl: baseUrls.planning,
        health: () => `${baseUrls.planning}/health`,
        tasks: () => `${baseUrls.planning}/tasks`,
        state: () => `${baseUrls.planning}/state`,
        planner: () => `${baseUrls.planning}/planner`,
        telemetry: () => `${baseUrls.planning}/telemetry`,
      },
      world: {
        baseUrl: baseUrls.world,
        health: () => `${baseUrls.world}/health`,
        state: () => `${baseUrls.world}/state`,
        environment: () => `${baseUrls.world}/environment`,
      },
      evaluation: {
        baseUrl: baseUrls.evaluation,
        health: () => `${baseUrls.evaluation}/health`,
        metrics: () => `${baseUrls.evaluation}/metrics`,
        alerts: () => `${baseUrls.evaluation}/alerts`,
      },
    };
  }

  /**
   * Check if a service is healthy
   */
  async checkServiceHealth(
    // _serviceName: string,
    url: string
  ): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get all healthy service endpoints (async — probes each service).
   */
  async getHealthyEndpoints(): Promise<ServiceEndpoints> {
    const endpoints = await this.discoverServices();

    // Check health of each service
    const healthChecks = await Promise.allSettled([
      this.checkServiceHealth(endpoints.minecraft.health()),
      this.checkServiceHealth(endpoints.cognition.health()),
      this.checkServiceHealth(endpoints.memory.health()),
      this.checkServiceHealth(endpoints.planning.health()),
      this.checkServiceHealth(endpoints.world.health()),
      this.checkServiceHealth(endpoints.evaluation.health()),
    ]);

    // Return endpoints with fallback URLs for unhealthy services
    return {
      ...endpoints,
      // If a service is unhealthy, provide localhost fallback for development
      minecraft:
        healthChecks[0].status === 'fulfilled' && healthChecks[0].value
          ? endpoints.minecraft
          : {
              ...endpoints.minecraft,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.minecraft}`,
            },
      cognition:
        healthChecks[1].status === 'fulfilled' && healthChecks[1].value
          ? endpoints.cognition
          : {
              ...endpoints.cognition,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.cognition}`,
            },
      memory:
        healthChecks[2].status === 'fulfilled' && healthChecks[2].value
          ? endpoints.memory
          : {
              ...endpoints.memory,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.memory}`,
            },
      planning:
        healthChecks[3].status === 'fulfilled' && healthChecks[3].value
          ? endpoints.planning
          : {
              ...endpoints.planning,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.planning}`,
            },
      world:
        healthChecks[4].status === 'fulfilled' && healthChecks[4].value
          ? endpoints.world
          : {
              ...endpoints.world,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.world}`,
            },
      evaluation:
        healthChecks[5].status === 'fulfilled' && healthChecks[5].value
          ? endpoints.evaluation
          : {
              ...endpoints.evaluation,
              baseUrl: `http://localhost:${this.DEFAULT_PORTS.evaluation}`,
            },
    };
  }

  /**
   * Synchronous default endpoints (no health probing).
   * Used for the initial defaultConfig so the module avoids top-level await.
   */
  getDefaultEndpoints(): ServiceEndpoints {
    return this.createEndpoints({
      minecraft: `http://localhost:${this.DEFAULT_PORTS.minecraft}`,
      cognition: `http://localhost:${this.DEFAULT_PORTS.cognition}`,
      memory: `http://localhost:${this.DEFAULT_PORTS.memory}`,
      planning: `http://localhost:${this.DEFAULT_PORTS.planning}`,
      world: `http://localhost:${this.DEFAULT_PORTS.world}`,
      evaluation: `http://localhost:${this.DEFAULT_PORTS.evaluation}`,
    });
  }
}

// Legacy routes for backward compatibility
const legacyRoutes = {
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
};

const defaultConfig: DashboardConfig = {
  // Legacy routes for backward compatibility
  routes: legacyRoutes,

  environment:
    (process.env.NODE_ENV as 'development' | 'production') || 'development',
  serviceDiscovery: {
    enabled: true,
    healthCheckInterval: 30000, // 30 seconds
  },
  endpoints: ServiceDiscovery.getInstance().getDefaultEndpoints(),
  api: {
    baseUrl: '',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  websocket: {
    url: 'ws://localhost:3005',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
  },
  dashboard: {
    refreshInterval: 10000, // 10 seconds
    maxThoughts: 1000,
    maxEvents: 500,
  },
  features: {
    evaluation: true,
    advancedMetrics: true,
    systemHealth: true,
    realTimeUpdates: true,
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
  const [serviceHealth, setServiceHealth] = React.useState<
    Record<string, boolean>
  >({});
  const [apiClient, setApiClient] = React.useState<ApiClient | null>(null);

  React.useEffect(() => {
    const config: DashboardConfig = {
      ...defaultConfig,
      ...customConfig,
      endpoints: {
        ...defaultConfig.endpoints,
        ...customConfig?.endpoints,
      },
      api: {
        ...defaultConfig.api,
        ...customConfig?.api,
      },
      websocket: {
        ...defaultConfig.websocket,
        ...customConfig?.websocket,
      },
      dashboard: {
        ...defaultConfig.dashboard,
        ...customConfig?.dashboard,
      },
      features: {
        ...defaultConfig.features,
        ...customConfig?.features,
      },
    };

    const client = new ApiClient(config);
    setApiClient(client);

    // Monitor service health
    const monitorHealth = async () => {
      const endpoints = config.endpoints;
      const health: Record<string, boolean> = {};

      const services = [
        { name: 'minecraft', url: endpoints.minecraft.health() },
        { name: 'cognition', url: endpoints.cognition.health() },
        { name: 'memory', url: endpoints.memory.health() },
        { name: 'planning', url: endpoints.planning.health() },
        { name: 'world', url: endpoints.world.health() },
        { name: 'evaluation', url: endpoints.evaluation.health() },
      ];

      for (const service of services) {
        try {
          const response = await fetch(service.url, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),
          });
          health[service.name] = response.ok;
        } catch {
          health[service.name] = false;
        }
      }

      setServiceHealth(health);
    };

    monitorHealth();

    // Set up periodic health monitoring
    const healthInterval = setInterval(
      monitorHealth,
      config.serviceDiscovery.healthCheckInterval
    );

    return () => clearInterval(healthInterval);
  }, [customConfig]);

  if (!apiClient) {
    return null; // Or a loading component
  }

  return (
    <DashboardContext.Provider
      value={{
        config: defaultConfig, // Use the resolved config
        apiClient,
        serviceHealth,
      }}
    >
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

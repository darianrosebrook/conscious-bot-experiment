/**
 * Dashboard Configuration
 * Centralized configuration for all dashboard services and connections
 *
 * Note: Uses Vite's import.meta.env instead of process.env
 * Environment variables must be prefixed with VITE_ to be exposed
 *
 * @author @darianrosebrook
 */

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
}

export interface DashboardConfig {
  environment: 'development' | 'production' | 'test';
  serviceDiscovery: {
    enabled: boolean;
    registryUrl?: string;
    healthCheckInterval: number;
  };
  endpoints: ServiceEndpoints;
  api: {
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  websocket: {
    url: string;
    reconnectInterval: number;
    maxReconnectAttempts: number;
  };
  dashboard: {
    refreshInterval: number;
    maxThoughts: number;
    maxEvents: number;
  };
  features: {
    evaluation: boolean;
    advancedMetrics: boolean;
    systemHealth: boolean;
    realTimeUpdates: boolean;
  };
}

/**
 * Service Discovery Class
 * Automatically discovers and connects to all services
 */
export class ServiceDiscovery {
  private static instance: ServiceDiscovery;
  private readonly DEFAULT_PORTS = {
    minecraft: 3005,
    cognition: 3003,
    memory: 3001,
    planning: 3002,
    world: 3004,
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
    const env = import.meta.env.MODE || 'development';

    switch (env) {
      case 'production':
        return this.discoverProductionServices();
      case 'test':
        return this.discoverTestServices();
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
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverTestServices(): Promise<ServiceEndpoints> {
    const baseUrls = {
      minecraft: 'http://minecraft-interface:3005',
      cognition: 'http://cognition:3003',
      memory: 'http://memory:3001',
      planning: 'http://planning:3002',
      world: 'http://world:3004',
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverProductionServices(): Promise<ServiceEndpoints> {
    const baseUrls = {
      minecraft:
        import.meta.env.VITE_MINECRAFT_SERVICE_URL ||
        `http://minecraft-interface:${this.DEFAULT_PORTS.minecraft}`,
      cognition:
        import.meta.env.VITE_COGNITION_SERVICE_URL ||
        `http://cognition:${this.DEFAULT_PORTS.cognition}`,
      memory:
        import.meta.env.VITE_MEMORY_SERVICE_URL ||
        `http://memory:${this.DEFAULT_PORTS.memory}`,
      planning:
        import.meta.env.VITE_PLANNING_SERVICE_URL ||
        `http://planning:${this.DEFAULT_PORTS.planning}`,
      world:
        import.meta.env.VITE_WORLD_SERVICE_URL ||
        `http://world:${this.DEFAULT_PORTS.world}`,
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
    };
  }

  /**
   * Check if a service is healthy
   */
  async checkServiceHealth(url: string): Promise<boolean> {
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
   * Synchronous default endpoints (no async discovery)
   */
  getDefaultEndpoints(): ServiceEndpoints {
    return this.createEndpoints({
      minecraft: `http://localhost:${this.DEFAULT_PORTS.minecraft}`,
      cognition: `http://localhost:${this.DEFAULT_PORTS.cognition}`,
      memory: `http://localhost:${this.DEFAULT_PORTS.memory}`,
      planning: `http://localhost:${this.DEFAULT_PORTS.planning}`,
      world: `http://localhost:${this.DEFAULT_PORTS.world}`,
    });
  }
}

/**
 * Default configuration
 * Uses Vite's import.meta.env for environment variables
 */
export const defaultConfig: DashboardConfig = {
  environment: import.meta.env.PROD ? 'production' : 'development',
  serviceDiscovery: {
    enabled: import.meta.env.VITE_DASHBOARD_SERVICE_DISCOVERY === 'true',
    healthCheckInterval: parseInt(import.meta.env.VITE_HEALTH_CHECK_INTERVAL || '30000'),
  },
  // Use synchronous default endpoints to avoid top-level await
  endpoints: ServiceDiscovery.getInstance().getDefaultEndpoints(),
  api: {
    timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || '10000'),
    retryAttempts: parseInt(import.meta.env.VITE_API_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(import.meta.env.VITE_API_RETRY_DELAY || '1000'),
  },
  websocket: {
    url: import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:3005',
    reconnectInterval: parseInt(
      import.meta.env.VITE_WEBSOCKET_RECONNECT_INTERVAL || '5000'
    ),
    maxReconnectAttempts: parseInt(
      import.meta.env.VITE_WEBSOCKET_MAX_RECONNECT_ATTEMPTS || '5'
    ),
  },
  dashboard: {
    refreshInterval: parseInt(
      import.meta.env.VITE_DASHBOARD_REFRESH_INTERVAL || '10000'
    ),
    maxThoughts: parseInt(import.meta.env.VITE_DASHBOARD_MAX_THOUGHTS || '1000'),
    maxEvents: parseInt(import.meta.env.VITE_DASHBOARD_MAX_EVENTS || '500'),
  },
  features: {
    evaluation: import.meta.env.VITE_DASHBOARD_ENABLE_EVALUATION !== 'false',
    advancedMetrics: import.meta.env.VITE_DASHBOARD_ENABLE_ADVANCED_METRICS !== 'false',
    systemHealth: import.meta.env.VITE_DASHBOARD_ENABLE_SYSTEM_HEALTH !== 'false',
    realTimeUpdates: import.meta.env.VITE_DASHBOARD_ENABLE_REAL_TIME_UPDATES !== 'false',
  },
};

/**
 * Dashboard Configuration
 * Centralized configuration for all dashboard services and connections
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
  evaluation: {
    baseUrl: string;
    health: () => string;
    metrics: () => string;
    alerts: () => string;
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
    enableMockData: boolean;
    mockDataFallback: boolean;
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
    evaluation: 3006,
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
    const env = process.env.NODE_ENV || 'development';

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
      evaluation: `http://localhost:${this.DEFAULT_PORTS.evaluation}`,
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
      evaluation: 'http://evaluation:3006',
    };

    return this.createEndpoints(baseUrls);
  }

  private async discoverKubernetesServices(): Promise<ServiceEndpoints> {
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
}

/**
 * Default configuration
 */
export const defaultConfig: DashboardConfig = {
  environment:
    (process.env.NODE_ENV as 'development' | 'production') || 'development',
  serviceDiscovery: {
    enabled: process.env.DASHBOARD_SERVICE_DISCOVERY === 'true',
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
  },
  endpoints: await ServiceDiscovery.getInstance().discoverServices(),
  api: {
    timeout: parseInt(process.env.API_TIMEOUT || '10000'),
    retryAttempts: parseInt(process.env.API_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.API_RETRY_DELAY || '1000'),
  },
  websocket: {
    url: process.env.WEBSOCKET_URL || 'ws://localhost:3005',
    reconnectInterval: parseInt(
      process.env.WEBSOCKET_RECONNECT_INTERVAL || '5000'
    ),
    maxReconnectAttempts: parseInt(
      process.env.WEBSOCKET_MAX_RECONNECT_ATTEMPTS || '5'
    ),
  },
  dashboard: {
    refreshInterval: parseInt(
      process.env.DASHBOARD_REFRESH_INTERVAL || '10000'
    ),
    maxThoughts: parseInt(process.env.DASHBOARD_MAX_THOUGHTS || '1000'),
    maxEvents: parseInt(process.env.DASHBOARD_MAX_EVENTS || '500'),
    enableMockData: process.env.DASHBOARD_ENABLE_MOCK_DATA === 'true',
    mockDataFallback: process.env.DASHBOARD_MOCK_DATA_FALLBACK !== 'false',
  },
  features: {
    evaluation: process.env.DASHBOARD_ENABLE_EVALUATION !== 'false',
    advancedMetrics: process.env.DASHBOARD_ENABLE_ADVANCED_METRICS !== 'false',
    systemHealth: process.env.DASHBOARD_ENABLE_SYSTEM_HEALTH !== 'false',
    realTimeUpdates: process.env.DASHBOARD_ENABLE_REAL_TIME_UPDATES !== 'false',
  },
};

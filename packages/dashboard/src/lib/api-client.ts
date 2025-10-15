/**
 * Dashboard API Client
 * Centralized client for all dashboard API calls with retry logic and service discovery
 *
 * @author @darianrosebrook
 */

import { defaultConfig, ServiceDiscovery } from '../../dashboard.config';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ServiceHealth {
  [serviceName: string]: boolean;
}

/**
 * Enhanced API Client with retry logic and service discovery
 */
export class DashboardApiClient {
  private config = defaultConfig;
  private serviceDiscovery = ServiceDiscovery.getInstance();
  private healthCache = new Map<
    string,
    { healthy: boolean; timestamp: number }
  >();
  private readonly HEALTH_CACHE_TTL = 30000; // 30 seconds

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
          await this.serviceDiscovery.discoverServices();
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

  /**
   * Check if a service is healthy (with caching)
   */
  private async isServiceHealthy(url: string): Promise<boolean> {
    const cacheKey = url;
    const cached = this.healthCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.HEALTH_CACHE_TTL) {
      return cached.healthy;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      const healthy = response.ok;
      this.healthCache.set(cacheKey, { healthy, timestamp: Date.now() });
      return healthy;
    } catch {
      this.healthCache.set(cacheKey, { healthy: false, timestamp: Date.now() });
      return false;
    }
  }

  /**
   * Get all service health status
   */
  async getServiceHealth(): Promise<ServiceHealth> {
    const endpoints = this.config.endpoints;
    const services = [
      { name: 'minecraft', url: endpoints.minecraft.health() },
      { name: 'cognition', url: endpoints.cognition.health() },
      { name: 'memory', url: endpoints.memory.health() },
      { name: 'planning', url: endpoints.planning.health() },
      { name: 'world', url: endpoints.world.health() },
      { name: 'evaluation', url: endpoints.evaluation.health() },
    ];

    const health: ServiceHealth = {};

    for (const service of services) {
      health[service.name] = await this.isServiceHealthy(service.url);
    }

    return health;
  }

  // =============================================================================
  // Service-specific API methods
  // =============================================================================

  async getTasks(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.planning.tasks()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getInventory(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.minecraft.inventory()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch inventory',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getMemories(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.memory.state()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch memories',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getEvents(): Promise<ApiResponse> {
    try {
      const [memoryEvents, planningEvents, minecraftEvents] =
        await Promise.allSettled([
          this.makeRequest(this.config.endpoints.memory.telemetry()).then((r) =>
            r.json()
          ),
          this.makeRequest(this.config.endpoints.planning.telemetry()).then(
            (r) => r.json()
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

      return {
        success: true,
        data: { events: allEvents },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch events',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getEnvironment(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.world.environment()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch environment',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getEvaluationMetrics(): Promise<ApiResponse> {
    if (!this.config.features.evaluation) {
      return {
        success: false,
        error: 'Evaluation features disabled',
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const response = await this.makeRequest(
        this.config.endpoints.evaluation.metrics()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch evaluation metrics',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getBotState(): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.minecraft.state()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch bot state',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async sendIntrusiveThought(
    content: string,
    metadata?: any
  ): Promise<ApiResponse> {
    try {
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
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to send intrusive thought',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getCognitiveStream(_limit?: number): Promise<ApiResponse> {
    try {
      const response = await this.makeRequest(
        this.config.endpoints.cognition.cognitiveStream.recent()
      );
      const data = await response.json();
      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch cognitive stream',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getSystemHealth(): Promise<ApiResponse> {
    try {
      const health = await this.getServiceHealth();
      const healthyCount = Object.values(health).filter(Boolean).length;
      const totalCount = Object.keys(health).length;

      return {
        success: true,
        data: {
          services: health,
          overall: {
            healthy: healthyCount,
            total: totalCount,
            status:
              healthyCount === totalCount
                ? 'healthy'
                : healthyCount > 0
                  ? 'degraded'
                  : 'unhealthy',
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check system health',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
export const apiClient = new DashboardApiClient();

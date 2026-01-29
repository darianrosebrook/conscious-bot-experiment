/**
 * Shared HTTP Client with Retry Logic and Error Handling
 *
 * Provides a standardized way to make HTTP requests with:
 * - Automatic retry with exponential backoff
 * - Circuit breaker pattern
 * - Timeout handling
 * - Error handling
 *
 * @author @darianrosebrook
 */

export interface HttpClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

export class HttpClient {
  private config: Required<HttpClientConfig>;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || '',
      timeout: config.timeout || 10000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 300,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerTimeout: config.circuitBreakerTimeout || 30000,
    };
  }

  private getCircuitBreakerKey(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? 443 : 80)}`;
    } catch {
      return url;
    }
  }

  private isCircuitOpen(url: string): boolean {
    const key = this.getCircuitBreakerKey(url);
    const breaker = this.circuitBreakers.get(key);

    if (!breaker) return false;

    if (breaker.isOpen) {
      const timeSinceFailure = Date.now() - breaker.lastFailureTime;
      if (timeSinceFailure > this.config.circuitBreakerTimeout) {
        // Reset circuit breaker
        breaker.isOpen = false;
        breaker.failures = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  private recordSuccess(url: string): void {
    const key = this.getCircuitBreakerKey(url);
    const breaker = this.circuitBreakers.get(key);
    if (breaker) {
      breaker.failures = 0;
      breaker.isOpen = false;
    }
  }

  private recordFailure(url: string): void {
    const key = this.getCircuitBreakerKey(url);
    let breaker = this.circuitBreakers.get(key);

    if (!breaker) {
      breaker = { failures: 0, lastFailureTime: 0, isOpen: false };
      this.circuitBreakers.set(key, breaker);
    }

    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failures >= this.config.circuitBreakerThreshold) {
      breaker.isOpen = true;
    }
  }

  /**
   * Make an HTTP request with retry logic and error handling
   */
  async request(
    path: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const url = path.startsWith('http')
      ? path
      : `${this.config.baseUrl}${path}`;
    const timeout = options.timeout || this.config.timeout;

    // Check circuit breaker
    if (this.isCircuitOpen(url)) {
      throw new Error(`Circuit breaker is open for ${url}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

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
          this.recordSuccess(url);
          return response;
        }

        // If server error and we have retries, try again
        if (
          response.status >= 500 &&
          response.status < 600 &&
          attempt < this.config.retries
        ) {
          const delay =
            this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If client error or no more retries, record failure and return
        if (response.status >= 400 && response.status < 500) {
          this.recordFailure(url);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on abort (timeout) or if it's the last attempt
        if (lastError.name === 'AbortError' || attempt >= this.config.retries) {
          this.recordFailure(url);
          break;
        }

        // Exponential backoff with jitter
        const delay =
          this.config.retryDelay * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * GET request
   */
  async get(
    path: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    return this.request(path, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post(
    path: string,
    body?: any,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put(
    path: string,
    body?: any,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    return this.request(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch(
    path: string,
    body?: any,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    return this.request(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete(
    path: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

/**
 * Create HTTP clients for each service with environment variable configuration
 */
export function createServiceClients() {
  return {
    minecraft: new HttpClient({
      baseUrl: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005',
      timeout: parseInt(process.env.MINECRAFT_TIMEOUT || '5000'),
      retries: parseInt(process.env.MINECRAFT_RETRIES || '3'),
    }),
    planning: new HttpClient({
      baseUrl: process.env.PLANNING_ENDPOINT || 'http://localhost:3002',
      timeout: parseInt(process.env.PLANNING_TIMEOUT || '5000'),
      retries: parseInt(process.env.PLANNING_RETRIES || '3'),
    }),
    cognition: new HttpClient({
      baseUrl: process.env.COGNITION_ENDPOINT || 'http://localhost:3003',
      timeout: parseInt(process.env.COGNITION_TIMEOUT || '5000'),
      retries: parseInt(process.env.COGNITION_RETRIES || '3'),
    }),
    memory: new HttpClient({
      baseUrl: process.env.MEMORY_ENDPOINT || 'http://localhost:3001',
      timeout: parseInt(process.env.MEMORY_TIMEOUT || '5000'),
      retries: parseInt(process.env.MEMORY_RETRIES || '3'),
    }),
    world: new HttpClient({
      baseUrl: process.env.WORLD_ENDPOINT || 'http://localhost:3004',
      timeout: parseInt(process.env.WORLD_TIMEOUT || '5000'),
      retries: parseInt(process.env.WORLD_RETRIES || '3'),
    }),
    dashboard: new HttpClient({
      baseUrl: process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000',
      timeout: parseInt(process.env.DASHBOARD_TIMEOUT || '10000'),
      retries: parseInt(process.env.DASHBOARD_RETRIES || '3'),
    }),
  };
}

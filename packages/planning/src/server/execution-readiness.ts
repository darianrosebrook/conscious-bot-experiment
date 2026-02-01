/**
 * Execution readiness gate.
 *
 * Probes services at startup and periodically re-probes. Gates executor
 * enablement (not server start). The server always boots — degraded
 * observability is better than no server.
 *
 * @author @darianrosebrook
 */

import { resilientFetch } from '@conscious-bot/core';

export type Subsystem =
  | 'planning'
  | 'executor'
  | 'minecraft'
  | 'memory'
  | 'cognition'
  | 'dashboard'
  | 'sterling';

export type ServiceState = 'up' | 'unhealthy' | 'down';

export interface ServiceHealth {
  state: ServiceState;
  latencyMs: number;
  checkedAt: number; // epoch ms
  error?: string;
}

export interface ReadinessResult {
  services: Record<string, ServiceHealth>;
  executorReady: boolean;
}

export interface ReadinessConfig {
  /** Services required for executor to be enabled. Default: ['minecraft'] */
  executionRequired: string[];
  /** Probe timeout per service. Default: 3000 */
  probeTimeoutMs: number;
  /** Service endpoints to probe. Keys are service names. */
  endpoints: Record<string, string>;
}

const DEFAULT_CONFIG: ReadinessConfig = {
  executionRequired: ['minecraft'],
  probeTimeoutMs: 3000,
  endpoints: {
    minecraft: `${process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005'}/health`,
    memory: `${process.env.MEMORY_ENDPOINT || 'http://localhost:3001'}/health`,
    cognition: `${process.env.COGNITION_ENDPOINT || 'http://localhost:3003'}/health`,
    dashboard: `${process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000'}/health`,
  },
};

async function probeOne(
  url: string,
  timeoutMs: number,
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const res = await resilientFetch(url, {
      method: 'GET',
      timeoutMs,
      maxRetries: 0,
      silent: true,
      label: `readiness/${url}`,
    });
    const latencyMs = Date.now() - start;
    if (!res) {
      return { state: 'down', latencyMs, checkedAt: Date.now(), error: 'no response' };
    }
    if (res.ok) {
      return { state: 'up', latencyMs, checkedAt: Date.now() };
    }
    return {
      state: 'unhealthy',
      latencyMs,
      checkedAt: Date.now(),
      error: `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      state: 'down',
      latencyMs: Date.now() - start,
      checkedAt: Date.now(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Probe services. Probes run in parallel. Never blocks server start.
 */
export async function probeServices(
  config?: Partial<ReadinessConfig>,
): Promise<ReadinessResult> {
  const cfg: ReadinessConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    endpoints: { ...DEFAULT_CONFIG.endpoints, ...config?.endpoints },
  };

  const entries = Object.entries(cfg.endpoints);
  const results = await Promise.allSettled(
    entries.map(([, url]) => probeOne(url, cfg.probeTimeoutMs)),
  );

  const services: Record<string, ServiceHealth> = {};
  entries.forEach(([name], i) => {
    const r = results[i];
    services[name] =
      r.status === 'fulfilled'
        ? r.value
        : {
            state: 'down' as const,
            latencyMs: 0,
            checkedAt: Date.now(),
            error: r.reason?.message ?? 'probe rejected',
          };
  });

  const executorReady = cfg.executionRequired.every(
    (svc) => services[svc]?.state === 'up',
  );

  return { services, executorReady };
}

/**
 * Monitors service readiness with periodic re-probing and state-change logging.
 */
export class ReadinessMonitor {
  private _result: ReadinessResult | null = null;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _config: ReadinessConfig;

  constructor(config?: Partial<ReadinessConfig>) {
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      endpoints: { ...DEFAULT_CONFIG.endpoints, ...config?.endpoints },
    };
  }

  /** Run initial probe. Returns result. */
  async probe(): Promise<ReadinessResult> {
    this._result = await probeServices(this._config);
    return this._result;
  }

  /** Start periodic re-probing every intervalMs. Logs only on state transitions. */
  startMonitoring(intervalMs: number = 120_000): void {
    this.stopMonitoring();
    this._timer = setInterval(async () => {
      const oldResult = this._result;
      const newResult = await probeServices(this._config);

      // State-change logging
      for (const [name, newHealth] of Object.entries(newResult.services)) {
        const oldState = oldResult?.services[name]?.state ?? 'down';
        if (newHealth.state !== oldState) {
          console.log(`[readiness] ${name}: ${oldState} → ${newHealth.state}`);
        }
      }

      this._result = newResult;
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /** Current result (null before first probe). */
  get result(): ReadinessResult | null {
    return this._result;
  }

  /** Is service reachable? */
  isUp(name: string): boolean {
    return this._result?.services[name]?.state === 'up';
  }

  /** Is result fresh (within maxAgeMs)? Default: 120s. */
  isFresh(maxAgeMs: number = 120_000): boolean {
    if (!this._result) return false;
    const now = Date.now();
    return Object.values(this._result.services).every(
      (h) => now - h.checkedAt < maxAgeMs,
    );
  }

  /** Is executor ready (all required services up AND result fresh)? */
  get executorReady(): boolean {
    return !!this._result?.executorReady && this.isFresh();
  }
}

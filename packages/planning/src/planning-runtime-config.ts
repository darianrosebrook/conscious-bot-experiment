/**
 * Centralized planning runtime config. Single typed, validated configuration
 * derived from env at startup. Code should read flags from this module only;
 * direct process.env reads for planning/executor/golden flags are discouraged.
 *
 * @darianrosebrook
 */

import crypto from 'node:crypto';

export type PlanningRunMode = 'production' | 'dev' | 'golden';

export type PlanningRuntimeConfig = {
  runMode: PlanningRunMode;
  executorMode: 'shadow' | 'live';
  /** Executor enabled when ENABLE_PLANNING_EXECUTOR=1 */
  executorEnabled: boolean;
  capabilities: {
    /** Skip minecraft readiness (golden-run harness only). */
    skipReadiness: boolean;
    /** Option B task_type_* bridge allowlisted (golden + shadow only). */
    taskTypeBridge: boolean;
  };
  /** Legacy leaf rewrites (dig_block -> acquire_material). Default false (Policy A: allow-but-measure). */
  legacyLeafRewriteEnabled: boolean;
  /** Stable digest of config slice for artifact evidence. */
  configDigest: string;
  /** For banner: human-readable capability list */
  capabilitiesList: string[];
};

const ENV = {
  get nodeEnv(): string {
    return String(process.env.NODE_ENV || '').toLowerCase();
  },
  get planningRunMode(): string {
    return String(process.env.PLANNING_RUN_MODE || '').toLowerCase();
  },
  get executorMode(): string {
    return String(process.env.EXECUTOR_MODE || 'shadow').toLowerCase();
  },
  get executorSkipReadiness(): boolean {
    return (
      String(process.env.EXECUTOR_SKIP_READINESS || '').toLowerCase() === '1'
    );
  },
  get enableDevEndpoints(): boolean {
    return (
      String(process.env.ENABLE_DEV_ENDPOINTS || '').toLowerCase() === 'true'
    );
  },
  get goldenRunMode(): boolean {
    return String(process.env.GOLDEN_RUN_MODE || '') === '1';
  },
  get enableTaskTypeBridge(): boolean {
    return String(process.env.ENABLE_TASK_TYPE_BRIDGE || '') === '1';
  },
  get enablePlanningExecutor(): boolean {
    return process.env.ENABLE_PLANNING_EXECUTOR === '1';
  },
  /** Legacy leaf rewrites (dig_block -> acquire_material). Default false (Policy A: allow-but-measure). */
  get legacyLeafRewriteEnabled(): boolean {
    return String(process.env.STERLING_LEGACY_LEAF_REWRITE_ENABLED || '') === '1';
  },
};

function parseRunMode(): PlanningRunMode {
  const explicit = ENV.planningRunMode;
  if (
    explicit === 'production' ||
    explicit === 'dev' ||
    explicit === 'golden'
  ) {
    return explicit;
  }
  return ENV.nodeEnv === 'production' ? 'production' : 'dev';
}

function computeConfigDigest(canonical: Record<string, unknown>): string {
  const payload = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

let cached: PlanningRuntimeConfig | null = null;

/** Clears cached config. For testing only; call in beforeEach when mutating env. */
export function resetPlanningRuntimeConfigForTesting(): void {
  cached = null;
}

/**
 * Returns the single validated planning runtime config. Validates allowed
 * combinations at first call; throws if EXECUTOR_SKIP_READINESS is used
 * in production or without ENABLE_DEV_ENDPOINTS/GOLDEN_RUN_MODE.
 */
export function getPlanningRuntimeConfig(): PlanningRuntimeConfig {
  if (cached) return cached;

  const runMode = parseRunMode();
  const executorMode = ENV.executorMode === 'live' ? 'live' : 'shadow';
  const executorEnabled = ENV.enablePlanningExecutor;

  // Live Option A: no bypass in live mode. Fail startup when bypass/bridge enabled with live executor.
  if (executorMode === 'live') {
    if (ENV.executorSkipReadiness) {
      throw new Error(
        'EXECUTOR_SKIP_READINESS=1 is forbidden when EXECUTOR_MODE=live (Live Option A). Refusing to start.'
      );
    }
    if (ENV.enableTaskTypeBridge) {
      throw new Error(
        'ENABLE_TASK_TYPE_BRIDGE=1 is forbidden when EXECUTOR_MODE=live (Live Option A). Refusing to start.'
      );
    }
  }

  // Validate skip-readiness: only allowed in dev/golden with explicit harness flag.
  if (ENV.executorSkipReadiness) {
    if (ENV.nodeEnv === 'production') {
      throw new Error(
        'EXECUTOR_SKIP_READINESS=1 is forbidden when NODE_ENV=production. Refusing to start.'
      );
    }
    if (runMode === 'production') {
      throw new Error(
        'EXECUTOR_SKIP_READINESS=1 is forbidden when PLANNING_RUN_MODE=production.'
      );
    }
    if (!ENV.enableDevEndpoints && !ENV.goldenRunMode) {
      throw new Error(
        'EXECUTOR_SKIP_READINESS=1 requires ENABLE_DEV_ENDPOINTS=true or GOLDEN_RUN_MODE=1 (test harness only). Refusing to start.'
      );
    }
  }

  const skipReadiness =
    ENV.executorSkipReadiness &&
    (runMode === 'dev' || runMode === 'golden') &&
    (ENV.enableDevEndpoints || ENV.goldenRunMode);

  // task_type_* bridge: only when dev or golden + shadow (and env bridge flag). Forbidden in production.
  const taskTypeBridge =
    (runMode === 'dev' || runMode === 'golden') &&
    executorMode === 'shadow' &&
    ENV.enableTaskTypeBridge;

  const legacyLeafRewriteEnabled = ENV.legacyLeafRewriteEnabled;

  const capabilitiesList: string[] = [];
  if (skipReadiness) capabilitiesList.push('skip_readiness');
  if (taskTypeBridge) capabilitiesList.push('task_type_bridge');
  if (legacyLeafRewriteEnabled) capabilitiesList.push('legacy_leaf_rewrite');

  // Digest must use only allowlisted non-secret keys. Do not add credentials or tokens here.
  const canonical = {
    runMode,
    executorMode,
    executorEnabled,
    skipReadiness,
    taskTypeBridge,
    legacyLeafRewriteEnabled,
  };
  const configDigest = computeConfigDigest(canonical);

  cached = {
    runMode,
    executorMode,
    executorEnabled,
    capabilities: { skipReadiness, taskTypeBridge },
    legacyLeafRewriteEnabled,
    configDigest,
    capabilitiesList,
  };
  return cached;
}

/**
 * Builds a one-line planning server banner for golden artifacts. Include in
 * every golden run report so the artifact is self-describing (which run mode
 * and capabilities produced it).
 */
export function buildPlanningBanner(config?: PlanningRuntimeConfig): string {
  const c = config ?? getPlanningRuntimeConfig();
  const file = 'planning';
  const git = process.env.GIT_COMMIT ?? process.env.SOURCE_VERSION ?? 'unknown';
  const caps =
    c.capabilitiesList.length > 0 ? c.capabilitiesList.join(',') : 'none';
  return [
    'PLANNING_SERVER_BANNER',
    `file=${file}`,
    `git=${git}`,
    `run_mode=${c.runMode}`,
    `executor_mode=${c.executorMode}`,
    `capabilities=${caps}`,
    `config_digest=${c.configDigest}`,
  ].join(' ');
}

/**
 * Call at startup when capabilities.taskTypeBridge is true: emit a loud
 * warning so the bridge is not mistaken for the default path.
 */
export function logTaskTypeBridgeWarning(): void {
  const c = getPlanningRuntimeConfig();
  if (!c.capabilities.taskTypeBridge) return;
  console.warn(
    '[Planning] Option B task_type_* bridge is enabled (golden harness only). ' +
      'No new executor leaves may be introduced via TS normalization; Option A (Sterling-emitted executor-native leaves) is the only path that scales.'
  );
}

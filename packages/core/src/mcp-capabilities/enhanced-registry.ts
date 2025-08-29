/**
 * Enhanced Registry - Shadow runs, separate registration paths, and health checks
 *
 * Implements separate registration paths for leaves (signed human builds) vs options (LLM-authored),
 * shadow promotion pipeline with CI gates, quota management, and health monitoring.
 *
 * @author @darianrosebrook
 */

import { performance } from 'node:perf_hooks';
import { WorkingLeafFactory } from './working-leaf-factory';
import {
  LeafImpl,
  RegistrationResult,
  LeafContext,
  ExecError,
  createExecError,
} from './leaf-contracts';
import { BTDSLParser, CompiledBTNode } from './bt-dsl-parser';

// ============================================================================
// Registry Status and Versioning (C0)
// ============================================================================

/**
 * Registry status for leaves and options
 */
export type RegistryStatus = 'shadow' | 'active' | 'retired' | 'revoked';

/**
 * Provenance information for tracking authorship and lineage
 */
export interface Provenance {
  author: string;
  parentLineage?: string[]; // Chain of parent versions
  codeHash: string; // SHA-256 of implementation
  signature?: string; // Cryptographic signature
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Enhanced leaf/option specification with governance
 */
export interface EnhancedSpec {
  name: string;
  version: string;
  status: RegistryStatus;
  provenance: Provenance;
  permissions: string[];
  rateLimitPerMin?: number;
  maxConcurrent?: number;
  healthCheck?: {
    endpoint?: string;
    timeoutMs?: number;
    expectedResponse?: any;
  };
  shadowConfig?: {
    successThreshold: number; // Success rate threshold (0-1)
    maxShadowRuns: number; // Max runs before auto-promotion/retirement
    failureThreshold: number; // Failure rate threshold (0-1)
    minShadowRuns?: number; // Min runs before auto-promotion/retirement
  };
}

// ============================================================================
// Shadow Run Tracking
// ============================================================================

/**
 * Shadow run result
 */
export interface ShadowRunResult {
  id: string;
  timestamp: number;
  status: 'success' | 'failure' | 'timeout';
  durationMs: number;
  error?: ExecError;
  metrics?: Record<string, number>;
  context?: Record<string, any>;
}

/**
 * Shadow run statistics
 */
export interface ShadowStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  timeoutRuns: number;
  averageDurationMs: number;
  successRate: number;
  lastRunTimestamp: number;
}

// ============================================================================
// Enhanced Registry
// ============================================================================

// Public surface needed by the BT-DSL parser and callers. Avoids class nominal issues.
interface LeafFactoryLike {
  register(leaf: LeafImpl): RegistrationResult;
  get(name: string, version?: string): LeafImpl | undefined;
  listLeaves(): Array<{
    name: string;
    version: string;
    spec: { name: string; version: string };
  }>;
  run(
    name: string,
    version: string,
    ctx: LeafContext,
    args: unknown,
    opts?: unknown
  ): Promise<any>;
  clear(): void;
  getNames(): string[];
  remove(name: string, version?: string): number;
  getRateLimitUsage(
    name: string,
    version: string
  ): { used: number; limit: number };
  validateArgs(name: string, version: string, args: unknown): boolean;
  getAll(): LeafImpl[];
  has(name: string, version?: string): boolean;
  size(): number;
}

/**
 * Enhanced registry with shadow runs and governance
 */
export class EnhancedRegistry {
  private leafFactory: WorkingLeafFactory;
  private btParser: BTDSLParser;
  private enhancedSpecs: Map<string, EnhancedSpec>; // key: name@version
  private shadowRuns: Map<string, ShadowRunResult[]>; // key: name@version
  private healthChecks: Map<string, () => Promise<boolean>>;
  private quotas: Map<
    string,
    { used: number; limit: number; resetTime: number }
  >;
  private compiled: Map<string, CompiledBTNode>;
  private maxShadowActive = 100; // Max shadow options active at once
  // Critical fix #1: Store option definitions
  private optionDefs = new Map<string, any>(); // id -> BT-DSL JSON
  // Critical fix #2: Circuit breaker for bad shadows
  private cb = new Map<string, number>(); // optionId -> resumeTimestamp
  // Secondary improvement: Audit log
  private audit: Array<{
    ts: number;
    op: string;
    id: string;
    who: string;
    detail?: any;
  }> = [];
  // Secondary improvement: Veto list and global budget
  private veto = new Set<string>();

  constructor() {
    this.leafFactory = new WorkingLeafFactory();
    this.btParser = new BTDSLParser();
    this.enhancedSpecs = new Map();
    this.shadowRuns = new Map();
    this.healthChecks = new Map();
    this.quotas = new Map();
    this.compiled = new Map();
    this.optionDefs = new Map();
    this.cb = new Map();
    this.audit = [];
    this.veto = new Set();
  }

  /**
   * Populate the registry's leaf factory with leaves
   * This is required for BT-DSL parsing to work correctly
   */
  populateLeafFactory(leaves: LeafImpl[]): void {
    for (const leaf of leaves) {
      const result = this.leafFactory.register(leaf);
      if (!result.ok) {
        console.warn(
          `Failed to register leaf ${leaf.spec.name}: ${result.error}`
        );
      }
    }
  }

  /**
   * Get the underlying leaf factory for BT-DSL parsing
   */
  getLeafFactory(): LeafFactoryLike {
    return this.leafFactory;
  }

  /**
   * Get a leaf by ID (name@version or just name for latest)
   */
  getLeaf(leafId: string): LeafImpl | undefined {
    const at = leafId.lastIndexOf('@');
    if (at < 0) {
      // treat whole string as a name requesting "latest"
      return this.leafFactory.get(leafId);
    }
    const name = leafId.slice(0, at);
    const version = leafId.slice(at + 1);
    return this.leafFactory.get(name, version);
  }

  // ============================================================================
  // Leaf Registration (Signed Human Builds)
  // ============================================================================

  /**
   * Register a leaf (signed human build) with provenance
   */
  registerLeaf(
    leaf: LeafImpl,
    provenance: Provenance,
    status: RegistryStatus = 'active'
  ): RegistrationResult {
    // Validate provenance
    if (!this.validateProvenance(provenance)) {
      return { ok: false, error: 'invalid_provenance' };
    }

    // Register with leaf factory
    const result = this.leafFactory.register(leaf);
    if (!result.ok) {
      return result;
    }

    const leafId = result.id;
    if (!leafId) {
      return { ok: false, error: 'missing_id' };
    }

    // Critical fix #2: Check if version already exists
    if (this.enhancedSpecs.has(leafId)) {
      return { ok: false, error: 'version_exists' };
    }

    // Create enhanced spec
    const enhancedSpec: EnhancedSpec = {
      name: leaf.spec.name,
      version: leaf.spec.version,
      status,
      provenance,
      permissions: leaf.spec.permissions,
      rateLimitPerMin: leaf.spec.rateLimitPerMin,
      maxConcurrent: leaf.spec.maxConcurrent,
    };

    this.enhancedSpecs.set(leafId, enhancedSpec);
    this.shadowRuns.set(leafId, []);

    // Secondary improvement: Audit logging
    this.log('register_leaf', leafId, provenance.author, { status });

    return result;
  }

  // ============================================================================
  // Option Registration (LLM-authored with Pipeline)
  // ============================================================================

  /**
   * Register an option (LLM-authored) with shadow configuration
   */
  registerOption(
    btDslJson: any,
    provenance: Provenance,
    shadowConfig: {
      successThreshold: number; // e.g., 0.8
      maxShadowRuns: number; // e.g., 10
      failureThreshold: number; // e.g., 0.3
      minShadowRuns?: number; // e.g., 3
    }
  ): RegistrationResult {
    // Parse and validate BT-DSL against the active leaf factory surface
    const parseResult = this.btParser.parse(btDslJson, this.getLeafFactory());
    if (!parseResult.valid) {
      return {
        ok: false,
        error: 'invalid_bt_dsl',
        detail: parseResult.errors?.join(', '),
      };
    }

    const optionId = `${btDslJson.name}@${btDslJson.version}`;

    // Critical fix #2: Check if option already exists
    if (this.enhancedSpecs.has(optionId)) {
      return { ok: false, error: 'version_exists' };
    }

    // Secondary improvement: Check veto list and global budget
    if (this.veto.has(optionId)) {
      return { ok: false, error: 'option_vetoed' };
    }

    if (this.getShadowOptions().length >= this.maxShadowActive) {
      return { ok: false, error: 'max_shadow_active' };
    }

    // Critical fix #3: Compute real permissions from leaf composition
    const permissions = this.computeOptionPermissions(parseResult.compiled);

    // Create enhanced spec with shadow configuration
    const enhancedSpec: EnhancedSpec = {
      name: btDslJson.name,
      version: btDslJson.version,
      status: 'shadow',
      provenance,
      permissions,
      shadowConfig,
    };

    this.enhancedSpecs.set(optionId, enhancedSpec);
    this.shadowRuns.set(optionId, []);
    this.optionDefs.set(optionId, btDslJson); // Store definition

    // Secondary improvement: Audit logging
    this.log('register_option', optionId, provenance.author, {
      status: 'shadow',
      permissions,
      shadowConfig,
    });

    return { ok: true, id: optionId };
  }

  // ============================================================================
  // Shadow Run Execution
  // ============================================================================

  /**
   * Execute a shadow run for an option
   */
  async executeShadowRun(
    optionId: string,
    leafContext: LeafContext,
    abortSignal?: AbortSignal
  ): Promise<ShadowRunResult> {
    const spec = this.enhancedSpecs.get(optionId);
    if (!spec || spec.status !== 'shadow') {
      throw new Error(`Option ${optionId} not found or not in shadow status`);
    }

    // Critical fix #6: Quota enforcement on execution
    if (!this.checkQuota(optionId)) {
      return {
        id: `${optionId}-${Date.now()}-quota`,
        timestamp: Date.now(),
        status: 'timeout',
        durationMs: 0,
        error: {
          code: 'permission.denied',
          detail: 'quota_exceeded',
          retryable: true,
        },
      };
    }

    // Critical fix #5: Circuit breaker for bad shadows
    if (this.inCooldown(optionId)) {
      return {
        id: `${optionId}-${Date.now()}-cooldown`,
        timestamp: Date.now(),
        status: 'timeout',
        durationMs: 0,
        error: {
          code: 'unknown',
          detail: 'circuit_open',
          retryable: true,
        },
      };
    }

    const startTime = performance.now();
    const runId = `${optionId}-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    try {
      // Secondary improvement: Use cached compiled BT
      const compiled = this.ensureCompiled(optionId);

      // Execute the behavior tree
      const result = await this.btParser.execute(
        compiled,
        this.getLeafFactory(),
        leafContext,
        abortSignal
      );

      const durationMs = performance.now() - startTime;
      const shadowResult: ShadowRunResult = {
        id: runId,
        timestamp: Date.now(),
        status: result.status === 'success' ? 'success' : 'failure',
        durationMs,
        error: result.error,
        metrics: {
          nodeExecutions: result.metrics?.nodeExecutions || 0,
          leafExecutions: result.metrics?.leafExecutions || 0,
        },
      };

      // Store shadow run result
      const runs = this.shadowRuns.get(optionId) || [];
      runs.push(shadowResult);
      this.shadowRuns.set(optionId, runs);

      // Critical fix #5: Check for failing streak and set cooldown
      if (this.failingStreak(optionId)) {
        this.cb.set(optionId, Date.now() + 5 * 60_000); // 5 min cooldown
      }

      // Check for auto-promotion/retirement
      await this.checkShadowPromotion(optionId);

      // Secondary improvement: Audit logging
      this.log('shadow_run', optionId, 'system', {
        runId,
        status: shadowResult.status,
        durationMs,
      });

      return shadowResult;
    } catch (error) {
      const durationMs = performance.now() - startTime;

      // Critical fix #8: Consistent, structured errors in shadow results
      const execErr =
        error && typeof error === 'object' && 'code' in (error as any)
          ? (error as ExecError)
          : createExecError({
              code: 'unknown',
              detail: String(error),
              retryable: false,
            });

      const shadowResult: ShadowRunResult = {
        id: runId,
        timestamp: Date.now(),
        status: execErr.code === 'aborted' ? 'timeout' : 'failure',
        durationMs,
        error: execErr,
      };

      // Store shadow run result
      const runs = this.shadowRuns.get(optionId) || [];
      runs.push(shadowResult);
      this.shadowRuns.set(optionId, runs);

      // Critical fix #5: Check for failing streak and set cooldown
      if (this.failingStreak(optionId)) {
        this.cb.set(optionId, Date.now() + 5 * 60_000); // 5 min cooldown
      }

      // Check for auto-retirement
      await this.checkShadowPromotion(optionId);

      // Secondary improvement: Audit logging
      this.log('shadow_run', optionId, 'system', {
        runId,
        status: shadowResult.status,
        durationMs,
        error: execErr.code,
      });

      return shadowResult;
    }
  }

  // ============================================================================
  // Shadow Promotion Pipeline
  // ============================================================================

  /**
   * Check if an option should be promoted or retired based on shadow run statistics
   */
  private async checkShadowPromotion(optionId: string): Promise<void> {
    const spec = this.enhancedSpecs.get(optionId);
    if (!spec || spec.status !== 'shadow' || !spec.shadowConfig) {
      return;
    }

    const stats = this.getShadowStats(optionId);
    const {
      successThreshold,
      failureThreshold,
      maxShadowRuns,
      minShadowRuns = 3,
    } = spec.shadowConfig;

    // Critical fix #4: Use both success and failure thresholds explicitly
    if (
      stats.totalRuns >= minShadowRuns &&
      stats.successRate >= successThreshold
    ) {
      await this.promoteOption(optionId, 'auto_promotion');
    } else if (
      stats.totalRuns >= maxShadowRuns &&
      stats.successRate <= failureThreshold
    ) {
      await this.retireOption(optionId, 'auto_retirement');
    }
  }

  /**
   * Manually promote an option from shadow to active
   */
  async promoteOption(optionId: string, reason: string): Promise<boolean> {
    const spec = this.enhancedSpecs.get(optionId);
    if (!spec || spec.status !== 'shadow') {
      return false;
    }

    // Critical fix #7: Gate promotion on a passing health check
    const healthy = await this.performHealthCheck(optionId);
    if (!healthy) {
      return false;
    }

    // Critical fix #2: Enforce legal transitions
    if (!this.legalTransition(spec.status, 'active')) {
      return false;
    }

    // Update status
    spec.status = 'active';
    this.enhancedSpecs.set(optionId, spec);

    // Secondary improvement: Audit logging
    this.log('promote_option', optionId, 'system', { reason });

    // Log promotion
    console.log(`Option ${optionId} promoted to active: ${reason}`);
    return true;
  }

  /**
   * Retire an option
   */
  async retireOption(optionId: string, reason: string): Promise<boolean> {
    const spec = this.enhancedSpecs.get(optionId);
    if (!spec) {
      return false;
    }

    // Critical fix #2: Enforce legal transitions
    if (!this.legalTransition(spec.status, 'retired')) {
      return false;
    }

    // Update status
    spec.status = 'retired';
    this.enhancedSpecs.set(optionId, spec);

    // Secondary improvement: Audit logging
    this.log('retire_option', optionId, 'system', { reason });

    // Log retirement
    console.log(`Option ${optionId} retired: ${reason}`);
    return true;
  }

  // ============================================================================
  // Health Checks and Quotas (S3.2)
  // ============================================================================

  /**
   * Register a health check for an option
   */
  registerHealthCheck(optionId: string, checkFn: () => Promise<boolean>): void {
    this.healthChecks.set(optionId, checkFn);
  }

  /**
   * Perform health check for an option
   */
  async performHealthCheck(optionId: string): Promise<boolean> {
    const checkFn = this.healthChecks.get(optionId);
    if (!checkFn) {
      return true; // No health check registered
    }

    try {
      return await checkFn();
    } catch (error) {
      console.error(`Health check failed for ${optionId}:`, error);
      return false;
    }
  }

  /**
   * Set quota for an option
   */
  setQuota(
    optionId: string,
    limit: number,
    resetIntervalMs: number = 60000
  ): void {
    this.quotas.set(optionId, {
      used: 0,
      limit,
      resetTime: Date.now() + resetIntervalMs,
    });
  }

  /**
   * Check and update quota
   */
  checkQuota(optionId: string): boolean {
    const quota = this.quotas.get(optionId);
    if (!quota) {
      return true; // No quota set
    }

    // Reset quota if interval has passed
    if (Date.now() > quota.resetTime) {
      quota.used = 0;
      quota.resetTime = Date.now() + 60000; // Reset to 1 minute from now
    }

    if (quota.used >= quota.limit) {
      return false; // Quota exceeded
    }

    quota.used++;
    return true;
  }

  // ============================================================================
  // Statistics and Monitoring
  // ============================================================================

  /**
   * Get shadow run statistics for an option
   */
  getShadowStats(optionId: string): ShadowStats {
    const runs = this.shadowRuns.get(optionId) || [];
    const totalRuns = runs.length;
    const successfulRuns = runs.filter((r) => r.status === 'success').length;
    const failedRuns = runs.filter((r) => r.status === 'failure').length;
    const timeoutRuns = runs.filter((r) => r.status === 'timeout').length;
    const averageDurationMs =
      totalRuns > 0
        ? runs.reduce((sum, r) => sum + r.durationMs, 0) / totalRuns
        : 0;
    const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
    const lastRunTimestamp =
      totalRuns > 0 ? Math.max(...runs.map((r) => r.timestamp)) : 0;

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      timeoutRuns,
      averageDurationMs,
      successRate,
      lastRunTimestamp,
    };
  }

  /**
   * Get all shadow options
   */
  getShadowOptions(): string[] {
    return Array.from(this.enhancedSpecs.entries())
      .filter(([, spec]) => spec.status === 'shadow')
      .map(([id]) => id);
  }

  /**
   * Get all active options
   */
  getActiveOptions(): string[] {
    return Array.from(this.enhancedSpecs.entries())
      .filter(([, spec]) => spec.status === 'active')
      .map(([id]) => id);
  }

  /**
   * Secondary improvement #13: Make status queries return structured objects
   */
  getActiveOptionsDetailed() {
    return [...this.enhancedSpecs.entries()]
      .filter(([, spec]) => spec.status === 'active')
      .map(([id, spec]) => ({ id, spec, stats: this.getShadowStats(id) }));
  }

  /**
   * Secondary improvement #15: Revoke an option (sticky status)
   */
  async revokeOption(optionId: string, reason: string): Promise<boolean> {
    const spec = this.enhancedSpecs.get(optionId);
    if (!spec) {
      return false;
    }

    // Critical fix #2: Enforce legal transitions
    if (!this.legalTransition(spec.status, 'revoked')) {
      return false;
    }

    // Update status
    spec.status = 'revoked';
    this.enhancedSpecs.set(optionId, spec);

    // Secondary improvement #15: Clear compiled cache and definitions upon revoke
    this.compiled.delete(optionId);
    this.optionDefs.delete(optionId);

    // Secondary improvement: Audit logging
    this.log('revoke_option', optionId, 'system', { reason });

    // Log revocation
    console.log(`Option ${optionId} revoked: ${reason}`);
    return true;
  }

  /**
   * Secondary improvement: Add option to veto list
   */
  addToVetoList(optionId: string): void {
    this.veto.add(optionId);
    this.log('add_to_veto', optionId, 'system');
  }

  /**
   * Secondary improvement: Remove option from veto list
   */
  removeFromVetoList(optionId: string): void {
    this.veto.delete(optionId);
    this.log('remove_from_veto', optionId, 'system');
  }

  /**
   * Secondary improvement: Get audit log
   */
  getAuditLog(): Array<{
    ts: number;
    op: string;
    id: string;
    who: string;
    detail?: any;
  }> {
    return [...this.audit];
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Validate provenance information
   */
  private validateProvenance(provenance: Provenance): boolean {
    return !!(provenance.author && provenance.codeHash && provenance.createdAt);
  }

  /**
   * Critical fix #2: Enforce immutable versioning and legal status transitions
   */
  private legalTransition(from: RegistryStatus, to: RegistryStatus): boolean {
    const allowed: Record<RegistryStatus, RegistryStatus[]> = {
      shadow: ['active', 'retired', 'revoked'],
      active: ['retired', 'revoked'],
      retired: ['revoked'],
      revoked: [],
    };
    return allowed[from].includes(to);
  }

  /**
   * Secondary improvement: Audit logging
   */
  private log(op: string, id: string, who = 'system', detail?: any): void {
    this.audit.push({ ts: Date.now(), op, id, who, detail });
  }

  /**
   * Critical fix #2: Circuit breaker for failing streaks
   */
  private failingStreak(optionId: string, n = 3): boolean {
    const runs = this.shadowRuns.get(optionId) || [];
    if (runs.length < n) return false;
    return runs.slice(-n).every((r) => r.status !== 'success');
  }

  /**
   * Critical fix #2: Check if option is in cooldown
   */
  private inCooldown(optionId: string): boolean {
    const until = this.cb.get(optionId) ?? 0;
    return Date.now() < until;
  }

  /**
   * Secondary improvement: Ensure compiled BT is cached
   */
  private ensureCompiled(optionId: string): CompiledBTNode {
    let node = this.compiled.get(optionId);
    if (node) return node;
    const json = this.getOptionDefinition(optionId);
    if (!json) {
      throw new Error(`Option definition not found: ${optionId}`);
    }
    const parse = this.btParser.parse(json, this.getLeafFactory());
    if (!parse.valid || !parse.compiled) {
      throw new Error(parse.errors?.join(', '));
    }
    node = parse.compiled;
    this.compiled.set(optionId, node);
    return node;
  }

  /**
   * Critical fix #3: Compute real permissions for an option based on its leaf composition
   */
  private computeOptionPermissions(rootNode: any): string[] {
    const perms = new Set<string>();
    const visit = (n: any) => {
      if (!n) return;
      if (n.type === 'Leaf' && n.name) {
        // resolve "latest" is OK in shadow; in production pin version
        const impl = this.leafFactory.get(n.name);
        if (impl) {
          impl.spec.permissions.forEach((p) => perms.add(p));
        }
      }
      (n.children || []).forEach(visit);
      if (n.child) visit(n.child);
    };
    visit(rootNode);
    return [...perms];
  }

  /**
   * Critical fix #1: Get option definition from stored definitions
   */
  private getOptionDefinition(optionId: string): any {
    return this.optionDefs.get(optionId);
  }

  /**
   * Get BT parser for direct access
   */
  getBTParser(): BTDSLParser {
    return this.btParser;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.leafFactory.clear();
    this.enhancedSpecs.clear();
    this.shadowRuns.clear();
    this.healthChecks.clear();
    this.quotas.clear();
    this.optionDefs.clear();
    this.cb.clear();
    this.audit = [];
    this.compiled.clear();
    this.veto.clear();
  }

  // ============================================================================
  // Capability Management Methods (for API endpoints)
  // ============================================================================

  /**
   * Promote a capability from shadow to active
   */
  async promoteCapability(
    capabilityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const spec = this.enhancedSpecs.get(capabilityId);
    if (!spec) {
      return { success: false, error: 'Capability not found' };
    }

    if (spec.status !== 'shadow') {
      return { success: false, error: 'Capability is not in shadow status' };
    }

    // Check if shadow runs meet promotion criteria
    const runs = this.shadowRuns.get(capabilityId) || [];
    if (runs.length < (spec.shadowConfig?.minShadowRuns || 3)) {
      return {
        success: false,
        error: 'Insufficient shadow runs for promotion',
      };
    }

    const successRate =
      runs.filter((r) => r.status === 'success').length / runs.length;
    if (successRate < (spec.shadowConfig?.successThreshold || 0.7)) {
      return {
        success: false,
        error: 'Success rate below threshold for promotion',
      };
    }

    // Promote to active
    spec.status = 'active';
    this.enhancedSpecs.set(capabilityId, spec);
    this.log('promote_capability', capabilityId, 'system', {
      from: 'shadow',
      to: 'active',
    });

    return { success: true };
  }

  /**
   * Retire a capability
   */
  async retireCapability(
    capabilityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const spec = this.enhancedSpecs.get(capabilityId);
    if (!spec) {
      return { success: false, error: 'Capability not found' };
    }

    spec.status = 'retired';
    this.enhancedSpecs.set(capabilityId, spec);
    this.log('retire_capability', capabilityId, 'system', {
      from: spec.status,
      to: 'retired',
    });

    return { success: true };
  }

  /**
   * Get capability details
   */
  async getCapability(capabilityId: string): Promise<any> {
    const spec = this.enhancedSpecs.get(capabilityId);
    if (!spec) {
      return null;
    }

    const runs = this.shadowRuns.get(capabilityId) || [];
    const successRate =
      runs.length > 0
        ? runs.filter((r) => r.status === 'success').length / runs.length
        : 0;

    return {
      id: capabilityId,
      name: spec.name,
      version: spec.version,
      status: spec.status,
      provenance: spec.provenance,
      permissions: spec.permissions,
      shadowConfig: spec.shadowConfig,
      shadowRuns: runs.length,
      successRate,
      lastRun: runs.length > 0 ? runs[runs.length - 1] : null,
    };
  }

  /**
   * List capabilities with optional filtering
   */
  async listCapabilities(filters?: {
    status?: string;
    type?: string;
  }): Promise<any[]> {
    const capabilities: any[] = [];

    for (const [id, spec] of this.enhancedSpecs.entries()) {
      if (filters?.status && spec.status !== filters.status) {
        continue;
      }

      const runs = this.shadowRuns.get(id) || [];
      const successRate =
        runs.length > 0
          ? runs.filter((r) => r.status === 'success').length / runs.length
          : 0;

      capabilities.push({
        id,
        name: spec.name,
        version: spec.version,
        status: spec.status,
        permissions: spec.permissions,
        shadowRuns: runs.length,
        successRate,
        lastRun: runs.length > 0 ? runs[runs.length - 1] : null,
      });
    }

    return capabilities;
  }

  /**
   * Get all capabilities (alias for listCapabilities)
   */
  async getAllCapabilities(): Promise<any[]> {
    return this.listCapabilities();
  }

  /**
   * List registered leaves (for testing and validation)
   */
  async listLeaves(): Promise<any[]> {
    // Access the leaf factory to get registered leaves
    return this.leafFactory.listLeaves();
  }

  /**
   * Get registry statistics
   */
  async getStatistics(): Promise<any> {
    const totalCapabilities = this.enhancedSpecs.size;
    const activeCapabilities = Array.from(this.enhancedSpecs.values()).filter(
      (s) => s.status === 'active'
    ).length;
    const shadowCapabilities = Array.from(this.enhancedSpecs.values()).filter(
      (s) => s.status === 'shadow'
    ).length;
    const retiredCapabilities = Array.from(this.enhancedSpecs.values()).filter(
      (s) => s.status === 'retired'
    ).length;

    const totalShadowRuns = Array.from(this.shadowRuns.values()).reduce(
      (sum, runs) => sum + runs.length,
      0
    );
    const successfulShadowRuns = Array.from(this.shadowRuns.values()).reduce(
      (sum, runs) => sum + runs.filter((r) => r.status === 'success').length,
      0
    );

    return {
      totalCapabilities,
      activeCapabilities,
      shadowCapabilities,
      retiredCapabilities,
      totalShadowRuns,
      successfulShadowRuns,
      overallSuccessRate:
        totalShadowRuns > 0 ? successfulShadowRuns / totalShadowRuns : 0,
      auditLogEntries: this.audit.length,
    };
  }
}

/**
 * Enhanced Registry - Shadow runs, separate registration paths, and health checks
 *
 * Implements separate registration paths for leaves (signed human builds) vs options (LLM-authored),
 * shadow promotion pipeline with CI gates, quota management, and health monitoring.
 *
 * @author @darianrosebrook
 */
import { performance } from 'node:perf_hooks';
import { LeafFactory } from './leaf-factory';
import { createExecError } from './leaf-contracts';
import { BTDSLParser } from './bt-dsl-parser';
// ============================================================================
// Enhanced Registry
// ============================================================================
/**
 * Enhanced registry with shadow runs and governance
 */
export class EnhancedRegistry {
    constructor() {
        // Critical fix #1: Store option definitions
        this.optionDefs = new Map(); // id -> BT-DSL JSON
        // Critical fix #2: Circuit breaker for bad shadows
        this.cb = new Map(); // optionId -> resumeTimestamp
        // Secondary improvement: Audit log
        this.audit = [];
        // Secondary improvement: Compiled BT cache
        this.compiled = new Map();
        // Secondary improvement: Veto list and global budget
        this.veto = new Set();
        this.maxShadowActive = 10;
        this.leafFactory = new LeafFactory();
        this.btParser = new BTDSLParser();
        this.enhancedSpecs = new Map();
        this.shadowRuns = new Map();
        this.healthChecks = new Map();
        this.quotas = new Map();
    }
    // ============================================================================
    // Leaf Registration (Signed Human Builds)
    // ============================================================================
    /**
     * Register a leaf (signed human build) with provenance
     */
    registerLeaf(leaf, provenance, status = 'active') {
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
        const enhancedSpec = {
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
    registerOption(btDslJson, provenance, shadowConfig) {
        // Parse and validate BT-DSL
        const parseResult = this.btParser.parse(btDslJson, this.leafFactory);
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
        const enhancedSpec = {
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
    async executeShadowRun(optionId, leafContext, abortSignal) {
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
            const result = await this.btParser.execute(compiled, this.leafFactory, leafContext, abortSignal);
            const durationMs = performance.now() - startTime;
            const shadowResult = {
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
                this.cb.set(optionId, Date.now() + 5 * 60000); // 5 min cooldown
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
        }
        catch (error) {
            const durationMs = performance.now() - startTime;
            // Critical fix #8: Consistent, structured errors in shadow results
            const execErr = error && typeof error === 'object' && 'code' in error
                ? error
                : createExecError({
                    code: 'unknown',
                    detail: String(error),
                    retryable: false,
                });
            const shadowResult = {
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
                this.cb.set(optionId, Date.now() + 5 * 60000); // 5 min cooldown
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
    async checkShadowPromotion(optionId) {
        const spec = this.enhancedSpecs.get(optionId);
        if (!spec || spec.status !== 'shadow' || !spec.shadowConfig) {
            return;
        }
        const stats = this.getShadowStats(optionId);
        const { successThreshold, failureThreshold, maxShadowRuns, minShadowRuns = 3, } = spec.shadowConfig;
        // Critical fix #4: Use both success and failure thresholds explicitly
        if (stats.totalRuns >= minShadowRuns &&
            stats.successRate >= successThreshold) {
            await this.promoteOption(optionId, 'auto_promotion');
        }
        else if (stats.totalRuns >= maxShadowRuns &&
            stats.successRate <= failureThreshold) {
            await this.retireOption(optionId, 'auto_retirement');
        }
    }
    /**
     * Manually promote an option from shadow to active
     */
    async promoteOption(optionId, reason) {
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
    async retireOption(optionId, reason) {
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
    registerHealthCheck(optionId, checkFn) {
        this.healthChecks.set(optionId, checkFn);
    }
    /**
     * Perform health check for an option
     */
    async performHealthCheck(optionId) {
        const checkFn = this.healthChecks.get(optionId);
        if (!checkFn) {
            return true; // No health check registered
        }
        try {
            return await checkFn();
        }
        catch (error) {
            console.error(`Health check failed for ${optionId}:`, error);
            return false;
        }
    }
    /**
     * Set quota for an option
     */
    setQuota(optionId, limit, resetIntervalMs = 60000) {
        this.quotas.set(optionId, {
            used: 0,
            limit,
            resetTime: Date.now() + resetIntervalMs,
        });
    }
    /**
     * Check and update quota
     */
    checkQuota(optionId) {
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
    getShadowStats(optionId) {
        const runs = this.shadowRuns.get(optionId) || [];
        const totalRuns = runs.length;
        const successfulRuns = runs.filter((r) => r.status === 'success').length;
        const failedRuns = runs.filter((r) => r.status === 'failure').length;
        const timeoutRuns = runs.filter((r) => r.status === 'timeout').length;
        const averageDurationMs = totalRuns > 0
            ? runs.reduce((sum, r) => sum + r.durationMs, 0) / totalRuns
            : 0;
        const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
        const lastRunTimestamp = totalRuns > 0 ? Math.max(...runs.map((r) => r.timestamp)) : 0;
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
    getShadowOptions() {
        return Array.from(this.enhancedSpecs.entries())
            .filter(([toBeNull, spec]) => {
            console.log('toBeNull', toBeNull);
            return spec.status === 'shadow';
        })
            .map(([id]) => id);
    }
    /**
     * Get all active options
     */
    getActiveOptions() {
        return Array.from(this.enhancedSpecs.entries())
            .filter(([toBeNull, spec]) => {
            console.log('toBeNull', toBeNull);
            return spec.status === 'active';
        })
            .map(([id]) => id);
    }
    /**
     * Secondary improvement #13: Make status queries return structured objects
     */
    getActiveOptionsDetailed() {
        return [...this.enhancedSpecs.entries()]
            .filter(([toBeNull, spec]) => {
            console.log('toBeNull', toBeNull);
            return spec.status === 'active';
        })
            .map(([id, spec]) => ({ id, spec, stats: this.getShadowStats(id) }));
    }
    /**
     * Secondary improvement #15: Revoke an option (sticky status)
     */
    async revokeOption(optionId, reason) {
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
    addToVetoList(optionId) {
        this.veto.add(optionId);
        this.log('add_to_veto', optionId, 'system');
    }
    /**
     * Secondary improvement: Remove option from veto list
     */
    removeFromVetoList(optionId) {
        this.veto.delete(optionId);
        this.log('remove_from_veto', optionId, 'system');
    }
    /**
     * Secondary improvement: Get audit log
     */
    getAuditLog() {
        return [...this.audit];
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Validate provenance information
     */
    validateProvenance(provenance) {
        return !!(provenance.author && provenance.codeHash && provenance.createdAt);
    }
    /**
     * Critical fix #2: Enforce immutable versioning and legal status transitions
     */
    legalTransition(from, to) {
        const allowed = {
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
    log(op, id, who = 'system', detail) {
        this.audit.push({ ts: Date.now(), op, id, who, detail });
    }
    /**
     * Critical fix #2: Circuit breaker for failing streaks
     */
    failingStreak(optionId, n = 3) {
        const runs = this.shadowRuns.get(optionId) || [];
        if (runs.length < n)
            return false;
        return runs.slice(-n).every((r) => r.status !== 'success');
    }
    /**
     * Critical fix #2: Check if option is in cooldown
     */
    inCooldown(optionId) {
        const until = this.cb.get(optionId) ?? 0;
        return Date.now() < until;
    }
    /**
     * Secondary improvement: Ensure compiled BT is cached
     */
    ensureCompiled(optionId) {
        let node = this.compiled.get(optionId);
        if (node)
            return node;
        const json = this.getOptionDefinition(optionId);
        if (!json) {
            throw new Error(`Option definition not found: ${optionId}`);
        }
        const parse = this.btParser.parse(json, this.leafFactory);
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
    computeOptionPermissions(rootNode) {
        const perms = new Set();
        const visit = (n) => {
            if (!n)
                return;
            if (n.type === 'Leaf' && n.name) {
                // resolve "latest" is OK in shadow; in production pin version
                const impl = this.leafFactory.get(n.name);
                if (impl) {
                    impl.spec.permissions.forEach((p) => perms.add(p));
                }
            }
            (n.children || []).forEach(visit);
            if (n.child)
                visit(n.child);
        };
        visit(rootNode);
        return [...perms];
    }
    /**
     * Critical fix #1: Get option definition from stored definitions
     */
    getOptionDefinition(optionId) {
        return this.optionDefs.get(optionId);
    }
    /**
     * Get leaf factory for direct access
     */
    getLeafFactory() {
        return this.leafFactory;
    }
    /**
     * Get BT parser for direct access
     */
    getBTParser() {
        return this.btParser;
    }
    /**
     * Clear all data (for testing)
     */
    clear() {
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
    async promoteCapability(capabilityId) {
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
            return { success: false, error: 'Insufficient shadow runs for promotion' };
        }
        const successRate = runs.filter(r => r.status === 'success').length / runs.length;
        if (successRate < (spec.shadowConfig?.successThreshold || 0.7)) {
            return { success: false, error: 'Success rate below threshold for promotion' };
        }
        // Promote to active
        spec.status = 'active';
        this.enhancedSpecs.set(capabilityId, spec);
        this.log('promote_capability', capabilityId, 'system', { from: 'shadow', to: 'active' });
        return { success: true };
    }
    /**
     * Retire a capability
     */
    async retireCapability(capabilityId) {
        const spec = this.enhancedSpecs.get(capabilityId);
        if (!spec) {
            return { success: false, error: 'Capability not found' };
        }
        spec.status = 'retired';
        this.enhancedSpecs.set(capabilityId, spec);
        this.log('retire_capability', capabilityId, 'system', { from: spec.status, to: 'retired' });
        return { success: true };
    }
    /**
     * Get capability details
     */
    async getCapability(capabilityId) {
        const spec = this.enhancedSpecs.get(capabilityId);
        if (!spec) {
            return null;
        }
        const runs = this.shadowRuns.get(capabilityId) || [];
        const successRate = runs.length > 0
            ? runs.filter(r => r.status === 'success').length / runs.length
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
    async listCapabilities(filters) {
        const capabilities = [];
        for (const [id, spec] of this.enhancedSpecs.entries()) {
            if (filters?.status && spec.status !== filters.status) {
                continue;
            }
            const runs = this.shadowRuns.get(id) || [];
            const successRate = runs.length > 0
                ? runs.filter(r => r.status === 'success').length / runs.length
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
     * Get registry statistics
     */
    async getStatistics() {
        const totalCapabilities = this.enhancedSpecs.size;
        const activeCapabilities = Array.from(this.enhancedSpecs.values()).filter(s => s.status === 'active').length;
        const shadowCapabilities = Array.from(this.enhancedSpecs.values()).filter(s => s.status === 'shadow').length;
        const retiredCapabilities = Array.from(this.enhancedSpecs.values()).filter(s => s.status === 'retired').length;
        const totalShadowRuns = Array.from(this.shadowRuns.values()).reduce((sum, runs) => sum + runs.length, 0);
        const successfulShadowRuns = Array.from(this.shadowRuns.values()).reduce((sum, runs) => sum + runs.filter(r => r.status === 'success').length, 0);
        return {
            totalCapabilities,
            activeCapabilities,
            shadowCapabilities,
            retiredCapabilities,
            totalShadowRuns,
            successfulShadowRuns,
            overallSuccessRate: totalShadowRuns > 0 ? successfulShadowRuns / totalShadowRuns : 0,
            auditLogEntries: this.audit.length,
        };
    }
}
//# sourceMappingURL=enhanced-registry.js.map
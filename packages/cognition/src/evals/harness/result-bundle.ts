/**
 * Result Bundle for Eval Harness
 *
 * Creates content-addressed result bundles for eval runs.
 * Bundle IDs are deterministic based on content, not timestamps.
 *
 * @author @darianrosebrook
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { EvalMetrics, EvalPassCriteria, ScenarioSummary } from './metrics-collector';

// ============================================================================
// Types
// ============================================================================

/**
 * Complete summary of an eval run.
 */
export interface EvalSummary {
  run: {
    run_id: string;
    mode: 'thought_only' | 'end_to_end';
    suite_id: string;
    suite_sha256: string;
    frame_profile: string;
    sampler_profile: string;
    model_id?: string;
    oracle_version: string;
    production_surface_version: string;
    production_surface_digests: Record<string, string>;
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
  metrics: EvalMetrics;
  pass: EvalPassCriteria;
  scenarios: ScenarioSummary[];
}

/**
 * Result bundle with content-addressed ID.
 */
export interface ResultBundle {
  /** Content-addressed bundle ID */
  bundle_id: string;
  /** The full summary */
  summary: EvalSummary;
  /** Path where the bundle was saved */
  output_path: string;
}

// ============================================================================
// Bundle Creation
// ============================================================================

/**
 * Create a content-addressed bundle ID from summary content.
 *
 * The bundle ID is deterministic: same inputs/outputs produce same ID.
 * Non-deterministic fields (timestamps, run_id) are excluded from the hash.
 *
 * @param summary - The eval summary
 * @returns Content-addressed bundle ID (hex string)
 */
export function computeBundleId(summary: EvalSummary): string {
  // Create a canonical representation excluding non-deterministic fields
  const canonical = {
    // Run metadata (deterministic parts only)
    mode: summary.run.mode,
    suite_id: summary.run.suite_id,
    suite_sha256: summary.run.suite_sha256,
    frame_profile: summary.run.frame_profile,
    sampler_profile: summary.run.sampler_profile,
    model_id: summary.run.model_id,
    oracle_version: summary.run.oracle_version,
    production_surface_version: summary.run.production_surface_version,
    production_surface_digests: sortObject(summary.run.production_surface_digests),

    // Metrics (deterministic)
    metrics: sortObject(summary.metrics as unknown as Record<string, unknown>),

    // Pass criteria (deterministic)
    pass: sortObject(summary.pass as unknown as Record<string, unknown>),

    // Scenario summaries (deterministic, sorted by ID)
    scenarios: summary.scenarios
      .map(s => ({
        scenario_id: s.scenario_id,
        pass: s.pass,
        action_taken: s.action_taken,
        affordance: s.affordance,
        is_compulsion: s.is_compulsion,
        is_inertia: s.is_inertia,
        grounding_pass: s.grounding_pass,
        referenced_facts_count: s.referenced_facts_count,
        violations: s.violations,
        // Exclude latency_ms (non-deterministic)
        // Exclude error (non-deterministic)
      }))
      .sort((a, b) => a.scenario_id.localeCompare(b.scenario_id)),
  };

  // Compute SHA-256 hash of canonical JSON
  const json = JSON.stringify(canonical, null, 0);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/**
 * Sort object keys for deterministic JSON serialization.
 */
function sortObject<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

/**
 * Create a result bundle from an eval summary.
 *
 * @param summary - The eval summary
 * @param outputDir - Directory to save the bundle
 * @returns Result bundle with content-addressed ID
 */
export function createResultBundle(
  summary: EvalSummary,
  outputDir: string
): ResultBundle {
  const bundleId = computeBundleId(summary);

  // Create output directory if needed
  fs.mkdirSync(outputDir, { recursive: true });

  // Write summary.json
  const summaryPath = path.join(outputDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  return {
    bundle_id: bundleId,
    summary,
    output_path: summaryPath,
  };
}

/**
 * Generate a unique run ID.
 *
 * Format: {timestamp}-{random}
 * Example: 20260203-143052-a1b2c3
 */
export function generateRunId(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  const random = crypto.randomBytes(3).toString('hex');

  return `${timestamp}-${random}`;
}

/**
 * Build the output directory path for an eval run.
 *
 * Structure: {baseDir}/{suiteId}/{frameProfile}/{samplerProfile}/{runId}
 *
 * @param baseDir - Base artifacts directory
 * @param suiteId - Suite identifier
 * @param frameProfile - Frame profile name
 * @param samplerProfile - Sampler profile name
 * @param runId - Run identifier
 * @returns Full output directory path
 */
export function buildOutputDir(
  baseDir: string,
  suiteId: string,
  frameProfile: string,
  samplerProfile: string,
  runId: string
): string {
  return path.join(baseDir, suiteId, frameProfile, samplerProfile, runId);
}

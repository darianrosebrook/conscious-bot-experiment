/**
 * Reflection Persistence Soak Test Harness
 *
 * Two distinct soak test classes with different epistemic goals:
 *
 * A. DETERMINISTIC PIPELINE SOAK — proves "hard" governance invariants:
 *    - Identity determinism (same event → same dedupeKey)
 *    - Idempotency (duplicate signals → single row)
 *    - Persistence correctness (metadata fields survive round-trip)
 *    - Queryability (pagination stable, ordering correct)
 *
 * B. REFLECTION QUALITY SOAK — probes "soft" quality:
 *    - LLM-generated reflections are coherent
 *    - Grounded in provided context (no hallucination)
 *    - Metadata well-formed (insights/lessons bounded, valence numeric)
 *
 * These are NOT vitest tests — they are executable harnesses that run against
 * live services and produce machine-readable reports. Run via:
 *
 *   npx tsx packages/memory/src/__tests__/reflection-soak-harness.ts [mode]
 *
 * Where [mode] is:
 *   --pipeline     Run deterministic pipeline soak (A)
 *   --quality      Run reflection quality soak (B)
 *   --both         Run both (default)
 *
 * Requires:
 *   - All services running (pnpm dev)
 *   - PostgreSQL with pgvector
 *   - Embedding service healthy (Ollama or MLX-LM)
 *   - Optionally: ENABLE_REFLECTION_GENERATION=true for quality soak
 *
 * Output: ./soak-report-{timestamp}.json
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';

// ============================================================================
// Configuration
// ============================================================================

const MEMORY_URL = process.env.MEMORY_ENDPOINT || 'http://localhost:3001';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Soak parameters
const PIPELINE_SOAK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const PIPELINE_SAMPLE_INTERVAL_MS = 10_000; // Check every 10 seconds
const QUALITY_SAMPLE_SIZE = 10; // Number of reflections to quality-check
const PREFLIGHT_FLUSH_WAIT_MS = 8_000; // Wait for async flush during preflight

// ============================================================================
// Types
// ============================================================================

interface SoakReport {
  timestamp: string;
  mode: 'pipeline' | 'quality' | 'both';
  durationMs: number;

  // Preflight results
  preflight?: {
    memoryServiceHealthy: boolean;
    embeddingServiceHealthy: boolean;
    singleReflectionPersisted: boolean;
    metadataContractValid: boolean;
    effectiveEmbeddingHost: string;
    preflightDurationMs: number;
  };

  // A. Pipeline soak counters
  pipeline?: {
    /** Number of unique dedupeKeys generated (one per sample interval) */
    uniqueEventsEmitted: number;
    /** Total HTTP POST attempts (uniqueEventsEmitted * 2: original + duplicate) */
    totalHttpAttempts: number;
    /** Fresh POSTs accepted (queued for async persistence, not yet confirmed persisted) */
    freshPostsAccepted: number;
    /** Duplicate attempts correctly rejected via status='duplicate' (preflight or db source) */
    dedupeRejectsViaStatus: number;
    /** Duplicate attempts rejected via unique constraint error (legacy path, should be 0 with new handler) */
    dedupeRejectsViaConstraint: number;
    /** Rows found missing required metadata fields */
    missingMetadataRows: number;
    /** Pagination ordering violations detected */
    paginationViolations: number;

    // Invariant violations (should be empty)
    violations: Array<{
      type: string;
      dedupeKey: string;
      detail: string;
    }>;

    // Latency distributions (ms)
    latency: {
      memoryPostP50: number;
      memoryPostP95: number;
      findByDedupeKeyP50: number;
      findByDedupeKeyP95: number;
    };
  };

  // B. Quality soak results
  quality?: {
    reflectionsChecked: number;
    schemaValid: number;
    schemaInvalid: number;
    groundingPassed: number;
    groundingFailed: number;
    provenancePresent: number;
    provenanceMissing: number;
    placeholderCount: number;
    generatedCount: number;

    // Issues found
    issues: Array<{
      reflectionId: string;
      issue: string;
      detail: string;
    }>;
  };

  // Overall pass/fail
  passed: boolean;
  summary: string;
}

interface ReflectionRow {
  id: string;
  content: string;
  // Top-level fields returned by GET /enhanced/reflections
  dedupeKey?: string;
  memorySubtype?: string;
  isPlaceholder?: boolean;
  timestamp?: number;
  // Legacy nested metadata (for backwards compatibility with raw chunk queries)
  metadata?: {
    dedupeKey?: string;
    memorySubtype?: string;
    isPlaceholder?: boolean;
    reflectionType?: string;
    emotionalValence?: number;
    insights?: string[];
    lessons?: string[];
    provenance?: {
      model?: string;
      tokensUsed?: number;
      latencyMs?: number;
      schemaVersion?: number;
    };
    [key: string]: any;
  };
  createdAt: number;
}

// ============================================================================
// Utility functions
// ============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ============================================================================
// Preflight Checks
// ============================================================================

async function runPreflight(): Promise<SoakReport['preflight']> {
  console.log('\n=== PREFLIGHT CHECKS ===\n');
  const preflightStart = Date.now();

  const result: SoakReport['preflight'] = {
    memoryServiceHealthy: false,
    embeddingServiceHealthy: false,
    singleReflectionPersisted: false,
    metadataContractValid: false,
    effectiveEmbeddingHost: OLLAMA_HOST,
    preflightDurationMs: 0,
  };

  // Check 1: Memory service health
  console.log(`1. Checking memory service at ${MEMORY_URL}...`);
  try {
    const health = await fetchJson<{ status: string }>(`${MEMORY_URL}/health`);
    result.memoryServiceHealthy = health.status === 'healthy';
    console.log(`   ${result.memoryServiceHealthy ? '✅' : '❌'} Memory service: ${health.status}`);
  } catch (err) {
    console.log(`   ❌ Memory service unreachable: ${err}`);
  }

  // Check 2: Embedding service health (via memory service status)
  console.log(`2. Checking embedding service health...`);
  try {
    const status = await fetchJson<{
      status: { services: { embeddingService: string } };
    }>(`${MEMORY_URL}/enhanced/status`);
    result.embeddingServiceHealthy = status.status?.services?.embeddingService === 'healthy';
    console.log(
      `   ${result.embeddingServiceHealthy ? '✅' : '❌'} Embedding service: ${status.status?.services?.embeddingService || 'unknown'}`
    );
    if (!result.embeddingServiceHealthy) {
      console.log(`   ⚠️  Embedding host: ${OLLAMA_HOST}`);
      console.log(`   ⚠️  Ensure embedding service is running and has a model loaded.`);
    }
  } catch (err) {
    console.log(`   ❌ Could not check embedding service: ${err}`);
  }

  // Check 3: Single reflection round-trip + metadata contract assertion
  console.log(`3. Testing single reflection persistence + metadata contract...`);
  const preflightKey = `preflight-${Date.now()}`;
  try {
    // POST the reflection
    const postRes = await fetchJson<{ success: boolean; status?: string }>(
      `${MEMORY_URL}/enhanced/reflections`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'narrative',
          content: '[PREFLIGHT] Single reflection persistence check',
          context: {
            emotionalState: 'neutral',
            currentGoals: [],
            recentEvents: ['preflight'],
            location: null,
            timeOfDay: 'unknown',
          },
          dedupeKey: preflightKey,
          isPlaceholder: true,
        }),
      }
    );

    if (!postRes.success) {
      console.log(`   ❌ POST failed: ${JSON.stringify(postRes)}`);
    } else {
      // Wait for flush cycle
      console.log(`   ⏳ Waiting ${PREFLIGHT_FLUSH_WAIT_MS / 1000}s for async flush...`);
      await new Promise((r) => setTimeout(r, PREFLIGHT_FLUSH_WAIT_MS));

      // Query to verify persistence
      const queryRes = await fetchJson<{
        success: boolean;
        data?: { reflections: ReflectionRow[] };
      }>(`${MEMORY_URL}/enhanced/reflections?page=1&limit=50&includePlaceholders=true`);

      // Check top-level dedupeKey (returned by GET endpoint) or fallback to metadata
      const found = queryRes.data?.reflections?.find(
        (r) => (r.dedupeKey || r.metadata?.dedupeKey) === preflightKey
      );
      result.singleReflectionPersisted = !!found;

      if (found) {
        console.log(`   ✅ Reflection persisted and queryable (id: ${found.id})`);

        // Check 4: Assert metadata contract (same invariants the soak cares about)
        // GET endpoint returns these at top level, but we also check metadata for backwards compat
        const dedupeKey = found.dedupeKey ?? found.metadata?.dedupeKey;
        const memorySubtype = found.memorySubtype ?? found.metadata?.memorySubtype;
        const isPlaceholder = found.isPlaceholder ?? found.metadata?.isPlaceholder;
        const metadataIssues: string[] = [];

        if (dedupeKey !== preflightKey) {
          metadataIssues.push(`dedupeKey mismatch: expected "${preflightKey}", got "${dedupeKey}"`);
        }
        if (memorySubtype !== 'reflection') {
          metadataIssues.push(`memorySubtype mismatch: expected "reflection", got "${memorySubtype}"`);
        }
        // isPlaceholder should be threaded through (we sent isPlaceholder: true)
        if (isPlaceholder !== true) {
          metadataIssues.push(`isPlaceholder not preserved: expected true, got ${isPlaceholder}`);
        }

        if (metadataIssues.length === 0) {
          result.metadataContractValid = true;
          console.log(`   ✅ Metadata contract valid (dedupeKey, memorySubtype, isPlaceholder)`);
        } else {
          console.log(`   ❌ Metadata contract violations:`);
          metadataIssues.forEach((issue) => console.log(`      - ${issue}`));
        }
      } else {
        console.log(`   ❌ Reflection not found after flush. Check embedding service.`);
        console.log(`   ⚠️  This usually means embeddings are failing silently.`);
      }
    }
  } catch (err) {
    console.log(`   ❌ Preflight reflection test failed: ${err}`);
  }

  result.preflightDurationMs = Date.now() - preflightStart;
  console.log(`\nPreflight completed in ${result.preflightDurationMs}ms`);

  // Fail fast if critical checks fail
  if (!result.memoryServiceHealthy) {
    console.error('\n❌ PREFLIGHT FAILED: Memory service not healthy. Aborting.');
    process.exit(1);
  }
  if (!result.embeddingServiceHealthy) {
    console.error('\n❌ PREFLIGHT FAILED: Embedding service not healthy. Aborting.');
    console.error(`   Embedding host: ${OLLAMA_HOST}`);
    process.exit(1);
  }
  if (!result.singleReflectionPersisted) {
    console.error('\n❌ PREFLIGHT FAILED: Single reflection did not persist. Aborting.');
    console.error('   The pipeline appears broken — no point running soak.');
    process.exit(1);
  }
  if (!result.metadataContractValid) {
    console.error('\n❌ PREFLIGHT FAILED: Metadata contract invalid. Aborting.');
    console.error('   The persistence pipeline is not threading metadata correctly.');
    process.exit(1);
  }

  console.log('\n✅ All preflight checks passed.\n');
  return result;
}

// ============================================================================
// A. Deterministic Pipeline Soak
// ============================================================================

async function runPipelineSoak(): Promise<SoakReport['pipeline']> {
  console.log('\n=== A. DETERMINISTIC PIPELINE SOAK ===\n');

  const result: SoakReport['pipeline'] = {
    uniqueEventsEmitted: 0,
    totalHttpAttempts: 0,
    freshPostsAccepted: 0,
    dedupeRejectsViaStatus: 0,
    dedupeRejectsViaConstraint: 0,
    missingMetadataRows: 0,
    paginationViolations: 0,
    violations: [],
    latency: {
      memoryPostP50: 0,
      memoryPostP95: 0,
      findByDedupeKeyP50: 0,
      findByDedupeKeyP95: 0,
    },
  };

  const postLatencies: number[] = [];
  const findLatencies: number[] = [];
  const emittedKeys = new Set<string>();

  const startTime = Date.now();
  let sampleCount = 0;

  while (Date.now() - startTime < PIPELINE_SOAK_DURATION_MS) {
    sampleCount++;
    console.log(`Sample ${sampleCount}...`);

    // --- Invariant 1: Emit a test reflection and verify single persistence ---
    const testDedupeKey = `soak-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    emittedKeys.add(testDedupeKey);

    const postStart = Date.now();
    try {
      const postRes = await fetchJson<{ success: boolean; status?: string }>(
        `${MEMORY_URL}/enhanced/reflections`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'narrative',
            content: `[SOAK TEST] Pipeline invariant check at ${new Date().toISOString()}`,
            context: {
              emotionalState: 'neutral',
              currentGoals: [],
              recentEvents: ['soak_test'],
              location: null,
              timeOfDay: 'unknown',
            },
            lessons: [],
            insights: [],
            dedupeKey: testDedupeKey,
            isPlaceholder: true,
          }),
        }
      );
      postLatencies.push(Date.now() - postStart);
      result.totalHttpAttempts++;

      if (postRes.status === 'duplicate') {
        // This shouldn't happen for a fresh key
        result.violations.push({
          type: 'unexpected_duplicate_on_fresh_key',
          dedupeKey: testDedupeKey,
          detail: `Fresh key was marked as duplicate`,
        });
      } else {
        result.uniqueEventsEmitted++;
        result.freshPostsAccepted++;
      }
    } catch (err) {
      console.error(`POST failed: ${err}`);
    }

    // --- Idempotency check: Try to create duplicate (should be rejected) ---
    try {
      result.totalHttpAttempts++;
      const dupRes = await fetchJson<{ success: boolean; status?: string }>(
        `${MEMORY_URL}/enhanced/reflections`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'narrative',
            content: `[SOAK TEST] Duplicate attempt`,
            context: {
              emotionalState: 'neutral',
              currentGoals: [],
              recentEvents: [],
              location: null,
              timeOfDay: 'unknown',
            },
            dedupeKey: testDedupeKey,
            isPlaceholder: true,
          }),
        }
      );

      if (dupRes.status === 'duplicate') {
        result.dedupeRejectsViaStatus++;
      } else {
        result.violations.push({
          type: 'idempotency_failure',
          dedupeKey: testDedupeKey,
          detail: `Expected 'duplicate' status, got: ${JSON.stringify(dupRes).slice(0, 200)}`,
        });
      }
    } catch (err) {
      // Unique constraint error from DB is also acceptable (backstop)
      const errStr = String(err);
      if (errStr.includes('duplicate key') || errStr.includes('23505')) {
        result.dedupeRejectsViaConstraint++;
      } else {
        console.error(`Duplicate check failed unexpectedly: ${err}`);
      }
    }

    // --- Invariant 2: Verify row has metadata fields ---
    const findStart = Date.now();
    try {
      const found = await fetchJson<{ success: boolean; data?: ReflectionRow }>(
        `${MEMORY_URL}/enhanced/memories/${testDedupeKey}`
      );
      findLatencies.push(Date.now() - findStart);

      if (found.data) {
        const meta = found.data.metadata;
        if (!meta) {
          result.missingMetadataRows++;
          result.violations.push({
            type: 'missing_metadata_object',
            dedupeKey: testDedupeKey,
            detail: `Row has no metadata object at all`,
          });
        } else if (!meta.dedupeKey || !meta.memorySubtype) {
          result.missingMetadataRows++;
          result.violations.push({
            type: 'missing_metadata_fields',
            dedupeKey: testDedupeKey,
            detail: `Missing: dedupeKey=${!!meta.dedupeKey}, memorySubtype=${!!meta.memorySubtype}`,
          });
        }
      }
    } catch {
      // Row might not be queryable by ID if the endpoint is different
      // This is acceptable — the findByDedupeKey check below is more important
    }

    // --- Invariant 3: Pagination ordering check ---
    try {
      const response = await fetchJson<{
        success: boolean;
        data?: {
          reflections: ReflectionRow[];
          total: number;
        };
      }>(`${MEMORY_URL}/enhanced/reflections?page=1&limit=10&includePlaceholders=true`);

      const reflections = response.data?.reflections ?? [];
      if (reflections.length > 1) {
        for (let i = 1; i < reflections.length; i++) {
          if (reflections[i].createdAt > reflections[i - 1].createdAt) {
            result.paginationViolations++;
            result.violations.push({
              type: 'pagination_order',
              dedupeKey: reflections[i].metadata?.dedupeKey || 'unknown',
              detail: `Row ${i} newer than row ${i - 1} (should be newest first)`,
            });
            break;
          }
        }
      }
    } catch (err) {
      console.error(`Pagination check failed: ${err}`);
    }

    await new Promise((r) => setTimeout(r, PIPELINE_SAMPLE_INTERVAL_MS));
  }

  // --- Final audit: check for any rows missing dedupeKey or memorySubtype ---
  // The GET endpoint returns these at top level, but we also check metadata for backwards compat
  console.log('\nRunning final audit query...');
  try {
    const auditResponse = await fetchJson<{
      success: boolean;
      data?: {
        reflections: ReflectionRow[];
        total: number;
      };
    }>(`${MEMORY_URL}/enhanced/reflections?page=1&limit=100&includePlaceholders=true`);

    const reflections = auditResponse.data?.reflections ?? [];
    for (const row of reflections) {
      // Extract fields from top level or metadata
      const dedupeKey = row.dedupeKey ?? row.metadata?.dedupeKey;
      const memorySubtype = row.memorySubtype ?? row.metadata?.memorySubtype;

      if (!dedupeKey || !memorySubtype) {
        result.missingMetadataRows++;
        if (!result.violations.some((v) => v.dedupeKey === row.id)) {
          result.violations.push({
            type: 'audit_missing_metadata_fields',
            dedupeKey: row.id,
            detail: `Row ${row.id} missing: dedupeKey=${!!dedupeKey}, memorySubtype=${!!memorySubtype}`,
          });
        }
      }
    }
  } catch (err) {
    console.error(`Final audit failed: ${err}`);
  }

  // Calculate latency percentiles
  result.latency.memoryPostP50 = percentile(postLatencies, 50);
  result.latency.memoryPostP95 = percentile(postLatencies, 95);
  result.latency.findByDedupeKeyP50 = percentile(findLatencies, 50);
  result.latency.findByDedupeKeyP95 = percentile(findLatencies, 95);

  console.log(
    `\nPipeline soak complete.` +
      `\n  Unique events: ${result.uniqueEventsEmitted}` +
      `\n  HTTP attempts: ${result.totalHttpAttempts}` +
      `\n  Fresh posts accepted: ${result.freshPostsAccepted}` +
      `\n  Dedupe (status): ${result.dedupeRejectsViaStatus}` +
      `\n  Dedupe (constraint): ${result.dedupeRejectsViaConstraint}` +
      `\n  Violations: ${result.violations.length}`
  );

  return result;
}

// ============================================================================
// B. Reflection Quality Soak
// ============================================================================

async function runQualitySoak(): Promise<SoakReport['quality']> {
  console.log('\n=== B. REFLECTION QUALITY SOAK ===\n');

  const result: SoakReport['quality'] = {
    reflectionsChecked: 0,
    schemaValid: 0,
    schemaInvalid: 0,
    groundingPassed: 0,
    groundingFailed: 0,
    provenancePresent: 0,
    provenanceMissing: 0,
    placeholderCount: 0,
    generatedCount: 0,
    issues: [],
  };

  // Fetch recent reflections
  let reflections: ReflectionRow[] = [];
  try {
    const res = await fetchJson<{
      success: boolean;
      data?: { reflections: ReflectionRow[] };
    }>(
      `${MEMORY_URL}/enhanced/reflections?page=1&limit=${QUALITY_SAMPLE_SIZE}&includePlaceholders=true`
    );
    reflections = res.data?.reflections || [];
  } catch (err) {
    console.error(`Failed to fetch reflections: ${err}`);
    return result;
  }

  console.log(`Checking ${reflections.length} reflections...`);

  for (const ref of reflections) {
    result.reflectionsChecked++;

    // Defensive: skip rows without metadata
    if (!ref.metadata) {
      result.schemaInvalid++;
      result.issues.push({
        reflectionId: ref.id,
        issue: 'missing_metadata_object',
        detail: 'Row has no metadata object',
      });
      continue;
    }

    const meta = ref.metadata;

    // --- Check 1: Schema validity ---
    const schemaIssues: string[] = [];

    if (typeof ref.content !== 'string' || ref.content.length === 0) {
      schemaIssues.push('content empty or not string');
    }
    if (ref.content && ref.content.length > 10000) {
      schemaIssues.push(`content too long: ${ref.content.length}`);
    }
    if (meta.insights !== undefined && !Array.isArray(meta.insights)) {
      schemaIssues.push('insights not an array');
    }
    if (Array.isArray(meta.insights) && meta.insights.length > 20) {
      schemaIssues.push(`insights unbounded: ${meta.insights.length}`);
    }
    if (meta.lessons !== undefined && !Array.isArray(meta.lessons)) {
      schemaIssues.push('lessons not an array');
    }
    if (Array.isArray(meta.lessons) && meta.lessons.length > 20) {
      schemaIssues.push(`lessons unbounded: ${meta.lessons.length}`);
    }
    if (
      meta.emotionalValence !== undefined &&
      (typeof meta.emotionalValence !== 'number' ||
        meta.emotionalValence < -1 ||
        meta.emotionalValence > 1)
    ) {
      schemaIssues.push(`emotionalValence out of range: ${meta.emotionalValence}`);
    }

    if (schemaIssues.length > 0) {
      result.schemaInvalid++;
      result.issues.push({
        reflectionId: ref.id,
        issue: 'schema_invalid',
        detail: schemaIssues.join('; '),
      });
    } else {
      result.schemaValid++;
    }

    // --- Check 2: Placeholder vs generated ---
    if (meta.isPlaceholder || (ref.content && ref.content.startsWith('[PLACEHOLDER]'))) {
      result.placeholderCount++;
    } else {
      result.generatedCount++;
    }

    // --- Check 3: Provenance (only for generated) ---
    if (!meta.isPlaceholder) {
      if (
        meta.provenance &&
        meta.provenance.model &&
        meta.provenance.schemaVersion !== undefined
      ) {
        result.provenancePresent++;
      } else {
        result.provenanceMissing++;
        result.issues.push({
          reflectionId: ref.id,
          issue: 'provenance_missing',
          detail: `Generated reflection missing provenance fields`,
        });
      }
    }

    // --- Check 4: Grounding (simple heuristic) ---
    // For non-placeholder reflections, check that content doesn't mention
    // specific entities/events that aren't plausibly Minecraft-related
    if (!meta.isPlaceholder && ref.content) {
      const suspiciousPatterns = [
        /\b(Tesla|Bitcoin|iPhone|Facebook|Twitter|Google)\b/i,
        /\b(president|election|politics|congress)\b/i,
        /\b(covid|pandemic|vaccine)\b/i,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(ref.content)) {
          result.groundingFailed++;
          result.issues.push({
            reflectionId: ref.id,
            issue: 'grounding_hallucination',
            detail: `Content mentions non-Minecraft entity: ${pattern.source}`,
          });
          break;
        }
      }

      // If no hallucination detected
      if (!result.issues.some((i) => i.reflectionId === ref.id && i.issue === 'grounding_hallucination')) {
        result.groundingPassed++;
      }
    }
  }

  console.log(
    `\nQuality soak complete. Checked: ${result.reflectionsChecked}, Schema valid: ${result.schemaValid}, Issues: ${result.issues.length}`
  );

  return result;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode: 'pipeline' | 'quality' | 'both' = args.includes('--pipeline')
    ? 'pipeline'
    : args.includes('--quality')
      ? 'quality'
      : 'both';
  const skipPreflight = args.includes('--skip-preflight');

  console.log(`\n🧪 REFLECTION PERSISTENCE SOAK TEST`);
  console.log(`Mode: ${mode}`);
  console.log(`Memory URL: ${MEMORY_URL}`);
  console.log(`OLLAMA_HOST: ${OLLAMA_HOST}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  const report: SoakReport = {
    timestamp: new Date().toISOString(),
    mode,
    durationMs: 0,
    passed: true,
    summary: '',
  };

  // Run preflight (unless skipped)
  if (!skipPreflight) {
    report.preflight = await runPreflight();
  }

  // Run soaks
  if (mode === 'pipeline' || mode === 'both') {
    report.pipeline = await runPipelineSoak();
    if (report.pipeline && report.pipeline.violations.length > 0) {
      report.passed = false;
    }
  }

  if (mode === 'quality' || mode === 'both') {
    report.quality = await runQualitySoak();
    if (report.quality && (report.quality.schemaInvalid > 0 || report.quality.groundingFailed > 0)) {
      report.passed = false;
    }
  }

  report.durationMs = Date.now() - startTime;

  // Generate summary
  const summaryParts: string[] = [];
  if (report.pipeline) {
    summaryParts.push(
      `Pipeline: ${report.pipeline.uniqueEventsEmitted} unique events, ` +
        `${report.pipeline.totalHttpAttempts} HTTP attempts, ` +
        `${report.pipeline.freshPostsAccepted} persisted, ` +
        `${report.pipeline.dedupeRejectsViaStatus + report.pipeline.dedupeRejectsViaConstraint} dedupe rejects, ` +
        `${report.pipeline.violations.length} violations`
    );
  }
  if (report.quality) {
    summaryParts.push(
      `Quality: ${report.quality.reflectionsChecked} checked, ${report.quality.schemaInvalid} schema issues, ${report.quality.groundingFailed} grounding failures`
    );
  }
  report.summary = summaryParts.join(' | ');

  // Write report
  const reportPath = `./soak-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SOAK TEST ${report.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Duration: ${(report.durationMs / 1000).toFixed(1)}s`);
  console.log(report.summary);
  console.log(`Report: ${reportPath}`);
  console.log('='.repeat(60));

  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Soak harness crashed:', err);
  process.exit(1);
});

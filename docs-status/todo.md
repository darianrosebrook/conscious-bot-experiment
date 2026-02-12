1018 results - 241 files
regex: (TODO|placeholder|mock|for now|real implementation|simpl|fake|blocked by)
exclude: .md, *debug*, *test*, .git, node_modules, .yaml, .json, 1, .log, .csv, *eslint*, scripts/,

packages/cognition/src/index.ts:
  137:   MockLanguageIOTransport,

packages/cognition/src/intrusive-thought-processor.ts:
   91: // Simple HTTP-based MCP client that connects to the planning server's MCP endpoints
  379:     // 1) Try to map to an active option by simple name heuristics
  567:     // Simple heuristic

packages/cognition/src/server.ts:
  1002:  * Simple LLM generation endpoint for keep-alive intention checking.

packages/cognition/src/thought-generator.ts:
   68:     // Simple hash function for thought content
  299:   /** IDLE-5: Prompt template hash for provenance (simplified - could be actual hash) */

packages/cognition/src/cognitive-core/context-optimizer.ts:
  430:    * Estimate tokens in text (simple approximation)
  433:     // Simple approximation: ~4 characters per token

packages/cognition/src/cognitive-core/conversation-manager.ts:
  274:     // Simple keyword extraction - in a real implementation, this would use NLP
  431:       // Update trust level based on message content (simplified)
  531:     // Simple engagement indicators

packages/cognition/src/cognitive-core/creative-solver.ts:
  257:     // Simple parsing - in a real implementation, this would be more sophisticated

packages/cognition/src/cognitive-core/emotional-memory-llm-adapter.ts:
  763:     // Simple sentiment analysis

packages/cognition/src/cognitive-core/internal-dialogue.ts:
  289:       // Simple keyword-based trigger evaluation
  396:     // Simple pattern matching for follow-up identification
  506:     // Simple cooldown check - in a real implementation,

packages/cognition/src/cognitive-core/llm-interface.ts:
   23:  * Production code uses defaults; tests can inject mocks.
   30:    * DI SEAM (Migration B): This allows handshake tests to inject a mock
   60:    * DI SEAM: Tests can inject a mock client to verify Sterling is called
  612:     // Simple confidence calculation based on response completeness

packages/cognition/src/cognitive-core/llm-output-reducer.ts:
  118:  * Compute a simple hash of text for logging (not cryptographic).
  258:  * Create a mock reduction result for testing.
  261: export function createMockReductionResult(

packages/cognition/src/cognitive-core/memory-aware-llm.ts:
  616:   ): 'simple' | 'medium' | 'complex' {
  621:     if (length < 50 && !hasQuestions && !hasMultipleSteps) return 'simple';

packages/cognition/src/constitutional-filter/constitutional-filter.ts:
  479:             // This is a simple implementation; in practice, you would use LLM to modify the content
  557:     // Simple implementation; in practice, you would use LLM to modify the content

packages/cognition/src/constitutional-filter/rules-engine.ts:
  226:     // Otherwise, use simple heuristic matching
  341:    * Evaluate rule match using simple heuristics

packages/cognition/src/constitutional-filter/types.ts:
   33: // TODO: These enums are defined for future use
   45: // TODO: These enums are defined for future use
   55: // TODO: These enums are defined for future use
  156: // TODO: These enums are defined for future use
  192: // TODO: These enums are defined for future use

packages/cognition/src/evals/harness/eval-orchestrator.ts:
   90:  * Default LLM generator that returns a mock response.
   94:   // For thought_only mode without a real LLM, return a simple observation
  109:  * 3. Generates thoughts (via LLM or mock)
  375:   // Build prompt (simple wrapper around frame)
  490: - If you have no current intention, simply acknowledge the situation. This is the expected default.

packages/cognition/src/intrusion-interface/intrusion-parser.ts:
  295:     const contentHash = this.simpleHash(rawContent);
  300:    * Simple hash function for content
  302:   private simpleHash(str: string): string {

packages/cognition/src/intrusion-interface/taxonomy-classifier.ts:
  320:     const contentHash = this.simpleHash(content.rawText + content.parsedIntent);
  325:    * Simple hash function for content
  327:   private simpleHash(str: string): string {

packages/cognition/src/keep-alive/intention-check-prompt.ts:
  13:  * 1. Simply acknowledge the situation (default, expected)
  26:  * Placeholders:
  36:  * the non-injective property (see tests). The format is shown with placeholders.
  44: - If you have no current intention, simply acknowledge the situation. This is the expected default.
  75: Most often, simple observation is sufficient. There is no requirement to act.

packages/cognition/src/language-io/index.ts:
  103:   MockLanguageIOTransport,

packages/cognition/src/language-io/sterling-language-io-client.ts:
   33: import { getDefaultTransport, MockLanguageIOTransport } from './transport';
  148:  * // With mock transport (testing)
  465:   MockLanguageIOTransport,

packages/cognition/src/language-io/transport.ts:
    5:  * This allows the SterlingLanguageIOClient to be tested with mock transports
   52:  * - MockTransport: For unit testing
  118: // Mock Transport (for testing)
  122:  * Mock transport that simulates Sterling behavior.
  129:  * The mock implements the SAME semantic logic that Sterling would,
  132: export class MockLanguageIOTransport implements LanguageIOTransport {
  134:   private _mockResponses: Map<string, LanguageIOReduceResponse> = new Map();
  144:    * Register a mock response for a specific envelope ID.
  146:   registerMockResponse(envelopeId: string, response: LanguageIOReduceResponse): void {
  147:     this._mockResponses.set(envelopeId, response);
  151:    * Clear all registered mock responses.
  153:   clearMockResponses(): void {
  154:     this._mockResponses.clear();
  162:       throw new Error('Mock transport unavailable');
  167:     // Check for registered mock response
  168:     const mockResponse = this._mockResponses.get(envelopeId);
  169:     if (mockResponse) {
  170:       return mockResponse;
  182:    * Build a default mock response based on envelope content.
  210:         committed_ir_digest: `ling_ir:mock_${envelopeId}`,
  221:           reason: 'Mock grounding passed (explicit goal)',
  224:         reducer_version: 'mock_reducer/v1.0.0',
  234:         committed_ir_digest: `ling_ir:mock_${envelopeId}`,
  244:         reducer_version: 'mock_reducer/v1.0.0',
  253:       committed_ir_digest: `ling_ir:mock_${envelopeId}`,
  258:       reducer_version: 'mock_reducer/v1.0.0',
  272:  * If not set, returns a MockLanguageIOTransport for development.
  277:     // Default to mock for development/testing
  278:     defaultTransport = new MockLanguageIOTransport();

packages/cognition/src/reasoning-surface/eligibility.ts:
  9:  * The rule is simple and immutable:

packages/cognition/src/reasoning-surface/frame-renderer.ts:
  335:  * Compute a simple digest of frame content.
  339:   // Simple FNV-1a hash

packages/cognition/src/reasoning-surface/index.ts:
  407:   // Build a fake reduction for the new pipeline
  408:   const fakeReduction: ReductionProvenance = {
  418:   const grounding = groundGoal(fakeReduction, context, { requireSterling: false });
  419:   const eligibility = deriveEligibility({ reduction: fakeReduction });

packages/cognition/src/routes/cognitive-stream-routes.ts:
  425:       // (replaces simple 24-hour cutoff with three-tier age limits + hard cap)

packages/cognition/src/routes/reflection-generation-contract.ts:
   19:  *   - Fallback: returns isPlaceholder=true with static text on LLM failure
   46:  *         Feature-flagged: skip cognition call if disabled, POST placeholder.
  108:   /** Whether generation succeeded or fell back to placeholder */
  114:   /** LLM-generated or placeholder reflection text */
  117:   /** Whether this is placeholder content (LLM was unavailable or disabled) */
  118:   isPlaceholder: boolean;
  120:   /** LLM-extracted insights (empty array if placeholder) */
  123:   /** LLM-extracted lessons (empty array if placeholder) */
  126:   /** LLM-assessed emotional valence (-1 to 1; 0 if placeholder) */
  129:   /** LLM confidence in the reflection quality (0-1; 0.5 if placeholder) */
  134:     /** Model identifier (e.g. 'gemma3n:e2b' or 'placeholder') */
  137:     /** Token count used (0 if placeholder) */
  140:     /** Generation latency in ms (0 if placeholder) */
  158:  * - isPlaceholder: true
  159:  * - content: static placeholder text (same as current TODOs)
  160:  * - provenance.model: 'placeholder'
  236:  *      POST /enhanced/reflections { type, content, context, lessons, insights, dedupeKey, isPlaceholder }
  237:  *    - If step 3 succeeded: use generated content, isPlaceholder=false
  238:  *    - If step 3 failed/disabled: use static placeholder, isPlaceholder=true
  244:  * Steps 2-3 have a 10s combined timeout. On timeout, fall through to placeholder.

packages/cognition/src/routes/social-routes.ts:
  284:       // Mock social cognition system (dev-only)
  285:       if (process.env.ALLOW_COGNITION_MOCKS !== 'true') {
  287:           error: 'Social cognition not configured (mocks disabled)',

packages/cognition/src/self-model/advanced-identity-analyzer.ts:
  648:     // Simple evolution rate calculation

packages/cognition/src/self-model/contract-system.ts:
  423:     // Simple integrity calculation based on progress consistency

packages/cognition/src/self-model/identity-tracker.ts:
  427:     // Extract trait name from description (simple parsing)
  448:     // Simple value consistency update based on impact type
  488:     // Simple heuristic: create new version if significant changes accumulated

packages/cognition/src/self-model/narrative-intelligence.ts:
  699:     // Simple complexity calculation based on experience variety and outcomes
  739:     // Simple completeness calculation
  758:     // Simple coherence calculation
  946:     const mockExperiences: ExperienceAnalysis[] = narrativeElements.map(
  955:     return this.assessCoherence(mockExperiences);
  962:     const mockSynthesis: StorySynthesis = {
  973:     return this.generateNarrativeInsights(mockSynthesis);

packages/cognition/src/self-model/narrative-manager.ts:
  415:     // Simple pattern-based lesson extraction
  459:     // Simple impact assessment based on keywords
  514:     // Simple coherence assessment
  538:     // Simple coherence calculation based on chapter connections

packages/cognition/src/server-utils/cognitive-load-calculators.ts:
  63:   // In a real implementation, this would track active cognitive processes
  64:   // For now, return a simulated value based on system activity
  81:     // Convert to percentage (simplified calculation)

packages/cognition/src/social-cognition/relationship-manager.ts:
   947:     // Update frequency (simple count-based for now)
   986:     // Simple reciprocity calculation based on cooperation level
  1011:     // Simple rule-based relationship type assessment

packages/core/src/advanced-need-generator.ts:
   931:     // Simple keyword matching - could be enhanced with semantic analysis
  1038:     // Simple resource checking - could be enhanced with inventory analysis

packages/core/src/advanced-signal-processor.ts:
  454:     // Content correlation (simplified)
  476:     // Simple similarity based on intensity and direction
  592:     // Simplified Bayesian fusion
  983:     // Simple pattern detection based on signal frequency and timing

packages/core/src/arbiter.ts:
   117:  * Simple reflex module for emergency responses
   456:     // Simple heuristics - would be much more sophisticated in practice
   620:     // Simple priority-based preemption
   655:     const currentModule = this.registeredModules.get(ModuleType.REFLEX); // Simplified
   798:           complexity: prioritizedTask.complexity > 0.5 ? 'complex' : 'simple',
   954:           : 'simple';
  1178:         complexity: 'simple',
  1234:         complexity: 'simple',
  1315:     return LocationType.VILLAGE; // Default for now
  1319:     return SocialContext.ALONE; // Default for now
  1323:     return []; // Default for now - would include weather, lighting, etc.
  1327:     return []; // Default for now
  1331:     return []; // Default for now
  1335:     return ['time', 'attention']; // Default for now
  1339:     return 'normal'; // Default for now
  1343:     return []; // Default for now
  1347:     return []; // Default for now
  1351:     return 0.8; // Default for now
  1355:     return 0.3; // Default for now
  1362:     // Simple system load calculation based on active tasks and memory
  1424:     // For now, just log the sync operation
  1556:     // Simple load calculation based on signal processing rate and latency
  1731:     // For now, always use primary for consistency

packages/core/src/cognitive-stream-integration.ts:
   40:  * Simple LLM interface for generating narrative thoughts
  285:           // Simple keyword matching
  345:         // No fallback mocks: return an explicit impasse requiring capability creation

packages/core/src/demo-real-bot-integration.ts:
  93:     // Step 2: Execute a simple goal

packages/core/src/fix-action-aborts.ts:
   66:       // Test simple movement first
   67:       console.log('   Testing simple movement...');
   80:       console.log(`   Simple movement: ${moved ? '✅ Success' : '❌ Failed'}`);
   82:       console.log(`   ❌ Simple movement failed: ${error}`);
  211:     console.log('     • Simple movement - Working');

packages/core/src/goal-template-manager.ts:
   757:       // Simple progress-based metric update
   828:     // Simple keyword matching for context evaluation
  1045:     const requiredResources = ['wood', 'stone', 'tools', 'food']; // Simplified
  1102:     // Simple time assessment - could be enhanced with time-of-day analysis

packages/core/src/mock-bot-service.ts:
    2:  * Mock Bot Service
   19: // Mock bot state
   86: // Execute task endpoint (mock)
   89:   console.log(`🤖 [MOCK BOT] Executing task: ${task?.title || 'Unknown task'}`);
   95:       message: 'Task executed successfully (mock)',
  104:   console.log(`💬 [MOCK BOT] Chat: ${message}`);
  105:   res.json({ success: true, message: 'Chat message sent (mock)' });
  118:   console.log(`✅ Mock Bot Service running on port ${port}`);

packages/core/src/performance-monitor.ts:
  324:     // Simple recovery logic - improve if p95 latency is reasonable
  384:     // Calculate throughput (simplified)
  394:         cpuUtilization: 0.5, // Simplified: avoid circular dependency for now
  462:    * Estimate CPU utilization (simplified)
  465:     // Simple heuristic based on active sessions and recent latency
  480:    * Estimate memory usage (simplified)
  483:     // Simple estimation based on session count and history size

packages/core/src/signal-processor.ts:
   229:       // In degraded mode, use simplified processing
   321:     // Apply context gates (simplified - would integrate with context system)
   322:     // For now, just apply urgency multiplier if score is high
   338:       urgency: score * (rule.urgencyMultiplier / 2), // Simplified urgency calculation
   400:     // Simple linear trend calculation
   686:    * Generate goal candidates from needs (simplified implementation)
   821:     // For now, it's a placeholder for the timer-based processing
   822:     // In a real implementation, this would process a signal queue
   939:    * Simplified signal processing for degraded mode
  1123:       // Estimate error rate (simple moving average)
  1135:     // For now, just ensure metrics are current

packages/core/src/types.ts:
  81:   complexity: z.enum(['simple', 'moderate', 'complex']),

packages/core/src/leaves/crafting-leaves.ts:
  265:     // assume the crafting was successful (the test mock handles the inventory)
  443:           // This is a simplified implementation

packages/core/src/leaves/interaction-leaves.ts:
  244:     // Simple interval check - place every N blocks
  245:     // This is a simplified version; in practice, you'd track the last torch position
  251:    * Get distance from last torch (simplified implementation)
  254:     // TODO: Implement proper tracking of last torch position for optimal placement
  255:     // For now, return a random value to simulate interval checking

packages/core/src/leaves/sensing-leaves.ts:
  432:         // Simple wait without abort checking

packages/core/src/mcp-capabilities/bt-dsl-parser.ts:
  226:       // Use a simple counter based on the target coordinates to simulate progress
  902:     // Simple hash function for deterministic results

packages/core/src/mcp-capabilities/capability-registry.ts:
  420:     // Basic constitutional check (simplified)
  559:       // Simplified P95 calculation (would use proper percentile calculation in production)

packages/core/src/mcp-capabilities/capability-specs.ts:
  303:     // Check if within reach (simplified)
  404:     // Simplified mining time calculation
  430:     // Simplified drop calculation

packages/core/src/mcp-capabilities/constitutional-filter.ts:
  134:           // Check if near player-built structures (simplified)

packages/core/src/mcp-capabilities/dynamic-creation-flow.ts:
  424:     // Simple hash function (in production, use crypto.createHash)
  583: // Mock LLM interface moved to test utilities
  584: // See packages/core/src/__tests__/test-utils.ts for MockLLMInterface

packages/core/src/mcp-capabilities/leaf-contracts.ts:
  289: // JSON Schema Types (simplified for TypeScript)
  293:  * Simplified JSON Schema 7 type for validation

packages/core/src/mcp-capabilities/leaf-factory.ts:
   33:   private counters: Map<string, number>; // simple rate limiter
   99:    * Check if a leaf is registered AND implemented (not a placeholder stub).
  100:    * Use this instead of checking spec.placeholder directly.
  105:     return (leaf as any)?.spec?.placeholder !== true;

packages/core/src/mcp-capabilities/llm-integration.ts:
  524:         return iteration >= 3; // Simplified time budget check
  622:         // Fallback to a simple sequence

packages/core/src/mcp-capabilities/llm-interface.ts:
   5:  * Replaces mock implementations with production-ready components.
  81:       // In a real implementation, this would call an actual LLM API
  82:       // For now, we'll implement a sophisticated fallback that generates

packages/core/src/mcp-capabilities/rate-limiter.ts:
  244:     ); // Simplified

packages/core/src/real-time/alerting-system.ts:
  747:     return 0.6; // Placeholder

packages/core/src/real-time/degradation-manager.ts:
   42:       | 'simplify_algorithm'
  389:           { type: 'simplify_algorithm', target: 'social_responses' },
  425:           { type: 'simplify_algorithm', target: 'all_cognitive_modules' },
  441:           { type: 'simplify_algorithm', target: 'sensory_processing' },
  531:     // For now, assume all prerequisites are met
  563:     // For now, just track the disabled feature
  570:     // For now, just remove from disabled set

packages/core/src/real-time/performance-tracker.ts:
   12: // Simple bounded history implementation for performance records
  394:         threadUtilization: 0.5, // Placeholder

packages/dashboard/src/components/Dashboard.tsx:
  1148:                         <div className={styles.streamPlaceholder}>
  1149:                           <div className={styles.streamPlaceholderContent}>
  1150:                             <div className={styles.streamPlaceholderIcon}>
  1155:                             <h3 className={styles.streamPlaceholderTitle}>
  1158:                             <p className={styles.streamPlaceholderDesc}>
  1353:                       placeholder="Enter an intrusive thought… (appears as bot's own idea)"

packages/dashboard/src/components/database-panel.module.scss:
  270:   &::placeholder { color: rgb(82 82 91); }
  289: .reflectionCardPlaceholder {
  303: .placeholderBadge {

packages/dashboard/src/components/database-panel.tsx:
  164:         includePlaceholders: 'true',
  690:                             ref.isPlaceholder && s.reflectionCardPlaceholder
  696:                             {ref.isPlaceholder && (
  697:                               <span className={s.placeholderBadge}>
  698:                                 Placeholder
  805:                       placeholder={`Type "${seedStr}" to confirm`}
  861:                       placeholder={`Type "${dbName}" to confirm`}

packages/dashboard/src/components/inventory-display.module.scss:
  68: .emptySlotPlaceholder {

packages/dashboard/src/components/inventory-display.tsx:
  80:             <div className={s.emptySlotPlaceholder} />

packages/dashboard/src/components/building/building-tab.module.scss:
  152:   &::placeholder {

packages/dashboard/src/components/building/building-tab.tsx:
  185:                     placeholder="Layout name…"
  292:           {/* Bot toggle (disabled placeholder) */}

packages/dashboard/src/hooks/use-atlas-material.ts:
  41:         // Missing texture — create a magenta placeholder
  42:         const placeholder = document.createElement('canvas');
  43:         placeholder.width = tileSize;
  44:         placeholder.height = tileSize;
  45:         const pCtx = placeholder.getContext('2d');
  46:         if (!pCtx) return reject(new Error(`Failed to get 2d context for placeholder ${name}`));
  49:         // Return a synthetic image from the placeholder canvas
  51:         pImg.src = placeholder.toDataURL();
  53:         pImg.onerror = () => reject(new Error(`Failed to load placeholder for ${name}`));

packages/dashboard/src/hooks/use-cognitive-stream.ts:
  326:         // For now, we'll just log the error

packages/dashboard/src/lib/ambient-occlusion.ts:
  4:  * Simplified version of the viewer's corner-based AO algorithm.

packages/dashboard/src/lib/block-texture-resolver.ts:
  69:  * crafting tables. Falls back to uniform faces for simple blocks.

packages/dashboard/src/lib/building-templates.ts:
   40: // ─── Template: Simple Shelter ────────────────────────────────────────────────
   42: function simpleShelter(): PlacedBlock[] {
  336:     id: 'simple-shelter',
  337:     name: 'Simple Shelter',
  339:     blocks: dedup(simpleShelter()),

packages/dashboard/src/styles/dashboard.module.scss:
  612: // Stream placeholder
  613: .streamPlaceholder {
  621: .streamPlaceholderContent {
  626: .streamPlaceholderIcon {
  634: .streamPlaceholderTitle {
  642: .streamPlaceholderDesc {
  889:   &::placeholder {

packages/dashboard/src/types/index.ts:
  281:   isPlaceholder: boolean;

packages/evaluation/src/benchmarking/performance-benchmark-runner.ts:
  400:     // TODO: Implement cognitive processing benchmarks
  580:       // Run cognitive benchmarks (placeholder for now)

packages/evaluation/src/benchmarking/performance-benchmarker.ts:
  460:         efficiency: 1 / (memoryStats.mean + 1), // Simple efficiency metric
  622:     // For now, return placeholder trends
  774:     // For now, this is a placeholder
  837:     // Placeholder for statistical significance analysis

packages/evaluation/src/curriculum/curriculum-builder.ts:
  691:     // Simple implementation - longest path
  717:     // Reconstruct path (simplified)
  725:     // Simple implementation - find nodes at same level
  772:     // Simple estimation based on number of nodes and average duration

packages/evaluation/src/curriculum/curriculum-manager.ts:
  745:     // Simple linear regression

packages/evaluation/src/dashboard/evaluation-dashboard.ts:
  811:     // Simplified CSV conversion

packages/evaluation/src/metrics/performance-analyzer.ts:
  441:     // Placeholder - would integrate with actual memory system metrics
  478:     // Simple coherence check based on error patterns and consistency
  646:         averageScore: successCount / domainSessions.length, // Simplified score

packages/evaluation/src/regression/regression-monitor.ts:
  544:     // Simplified t-test calculation
  559:     // Simplified confidence calculation (would use proper t-distribution in real implementation)
  594:     // Simple coverage based on number of metrics
  929:     // Simple linear regression

packages/evaluation/src/scenarios/complex-reasoning-scenarios.ts:
  20:     description: 'Navigate through a simple 5x5 maze to reach the exit',

packages/evaluation/src/scenarios/scenario-manager.ts:
  790:     // Simple target extraction logic
  815:     // Simple movement simulation - move one step towards target
  841:     // Simplified Hanoi move execution
  852:     // Simplified sequence analysis
  863:     // Simple cost calculation
  894:     return 0.8; // Placeholder moral weight

packages/executor-contracts/src/capability-registry.ts:
  181:       // For now, simulate success
  197:       // In real implementation, this would check if we reached the target location
  220:       // For now, simulate crafting delay
  236:       // In real implementation, this would check if the crafted item was added to inventory
  265:       // For now, simulate digging delay
  281:       // In real implementation, this would check if the target block was removed

packages/executor-contracts/src/leaf-factory.ts:
    2:  * Simple Leaf Factory for MCP Integration
   22:  * Simple leaf factory that can register and execute leaf implementations
  155:     // Return latest by name (simplified - just get first match)

packages/executor-contracts/src/leaf-interfaces.ts:
  130:   implementation?: LeafImpl; // Optional for our simple factory
  212: // TODO: These enums are defined for future use
  238:   // Simple verification - can be extended

packages/memory/src/cognitive-map-tracker.ts:
  158:     // Calculate manifold coordinates (simplified UMAP-like projection)
  343:    * Calculate manifold coordinates for a memory (simplified UMAP-like projection)
  452:     // Simple clustering algorithm (could be replaced with more sophisticated method)
  478:             clusterShape: [1.0, 1.0], // Placeholder shape parameters

packages/memory/src/cognitive-task-memory.ts:
   20:   complexity?: 'simple' | 'medium' | 'complex';
  666:     // Simple similarity calculation based on task properties
  682:     // Context similarity (simplified)
  703:     // Simplified context similarity

packages/memory/src/cross-modal-entity-linker.ts:
  698:     // Simple Levenshtein distance approximation

packages/memory/src/embedding-service.ts:
  355:    * Get synonyms for a word (simplified implementation)
  358:     // Simple synonym mapping - in production, this would use a proper thesaurus
  410:     // Simple heuristics for structure
  473:     // Simple hash for cache key - in production, use proper hashing
  683:         latency: 100, // Mock latency
  732:     // Calculate clustering coefficient (simplified)
  757:     // Simplified clustering: measure how well values group together

packages/memory/src/emotional-memory-manager.ts:
    55:  * Convert simple EmotionalState to AdvancedEmotionalState
    58:   simple: EmotionalState,
    69:     id: id || `simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    72:       simple.satisfaction,
    73:       simple.excitement,
    74:       1 - simple.frustration
    77:       { emotion: 'satisfaction', intensity: simple.satisfaction },
    78:       { emotion: 'excitement', intensity: simple.excitement },
    79:       { emotion: 'frustration', intensity: simple.frustration },
    80:       { emotion: 'curiosity', intensity: simple.curiosity },
    81:       { emotion: 'confidence', intensity: simple.confidence },
    85:     timestamp: simple.timestamp,
    90:  * Convert AdvancedEmotionalState to simple EmotionalState
    92: export function toSimpleEmotionalState(
   889:     // Simple blending - in reality this would be more sophisticated
  1111:    * Convert emotional state to simple format for integration
  1113:   toSimpleEmotionalState(state: AdvancedEmotionalState): {

packages/memory/src/entity-extraction-service.ts:
   958:     // Simple relationship inference based on context words
  1053:     // Simplified mutual information calculation

packages/memory/src/htn-memory.ts:
  61:   /** Query executions/methods by simple filters */

packages/memory/src/hybrid-search-service.ts:
  360:     // For now, we'll use a simplified approach
  392:       topEntities: [], // Placeholder
  393:       topTopics: [], // Placeholder

packages/memory/src/identity-memory-guardian.ts:
  424:     // For now, we'll focus on protecting emotional memories
  448:                 (this.emotionalManager as any)?.toSimpleEmotionalState?.(
  613:     // Simple trait extraction from memory descriptions
  648:     // Simple value extraction from memory descriptions

packages/memory/src/integration-examples.ts:
   39: // Placeholder classes - these would normally come from @conscious-bot/core
  518:   // For now, showing the memory structure that would support it

packages/memory/src/knowledge-graph-core.ts:
   830:       const totalCount = entities.length; // For this simple implementation
  1023:         }, // Placeholder entity object

packages/memory/src/memory-signal-generator.ts:
  313:     // For now, return empty array as placeholder
  314:     console.log('🔍 Finding salient memories (placeholder implementation)');
  316:     // In a real implementation, this would:

packages/memory/src/memory-system-coordinator.ts:
  771:     // Simple calculation based on recent reinforcements

packages/memory/src/memory-system.ts:
   495:         // memorySubtype, isPlaceholder etc. are persisted to the DB JSONB column.
   712:     // For now, return empty array as placeholder
   850:     includePlaceholders?: boolean;
   875:       includePlaceholders: options.includePlaceholders,
   940:         // Use explicit isPlaceholder if provided, else infer from content prefix
   941:         const isPlaceholder =
   942:           data.isPlaceholder !== undefined
   943:             ? data.isPlaceholder
   944:             : (data.content || '').startsWith('[PLACEHOLDER]');
   954:             isPlaceholder,
  1050:     // This is a simplified implementation - would need NLP in production
  1085:         storageSize: '0MB', // TODO: Implement storage size calculation
  1107:         memoryIngestionCount: 0, // TODO: Implement ingestion statistics tracking in getStatus method
  1500:    * @param isPlaceholder Optional flag indicating this is a placeholder (not LLM-generated).
  1516:     isPlaceholder?: boolean
  1535:     // Attach isPlaceholder for persistence threading (if explicitly set)
  1536:     if (isPlaceholder !== undefined) {
  1537:       (reflection as any).isPlaceholder = isPlaceholder;
  1746:       taskComplexity: 'simple' | 'medium' | 'complex';
  1791:       taskComplexity?: 'simple' | 'medium' | 'complex';
  2081:       // Simple hash function (in production, use crypto module)
  2217:     // Simple text matching against backup queue
  2351:         // Note: In a real implementation, we'd retrieve the chunks and add them to backup
  2352:         // For now, this is a placeholder
  2392:       // In a real implementation, you might pause critical operations
  2548:     // Basic health check - in a real implementation this would be more comprehensive

packages/memory/src/neuroscience-consolidation-manager.ts:
  476:     // For now, return empty array as placeholder

packages/memory/src/reflection-memory.ts:
  600:     // Simple association based on shared tags and content similarity

packages/memory/src/self-narrative-constructor.ts:
  448:     // For now, select the first milestone (could be enhanced with more sophisticated logic)

packages/memory/src/server.ts:
  1574:     const includePlaceholders = req.query.includePlaceholders === 'true';
  1588:         includePlaceholders,
  1602:           isPlaceholder: meta.isPlaceholder ?? false,
  1618:         includePlaceholders,
  1636:         includePlaceholders,
  1680:     const { type, content, context, lessons, insights, dedupeKey, isPlaceholder } = req.body;
  1708:     // isPlaceholder is preserved for metadata contract
  1716:       isPlaceholder

packages/memory/src/sharp-wave-ripple-manager.ts:
  690:     // For now, we rely on explicit tagging during memory ingestion

packages/memory/src/tool-efficiency-examples.ts:
  279:       taskComplexity: 'simple',

packages/memory/src/tool-efficiency-memory.ts:
  126:     taskComplexity: 'simple' | 'medium' | 'complex';
  760:     // Calculate adaptability based on context diversity (simplified)

packages/memory/src/vector-database.ts:
  1369:     includePlaceholders?: boolean;
  1376:       if (!options.includePlaceholders) {
  1377:         whereClause += ` AND (metadata->>'isPlaceholder' IS NULL OR metadata->>'isPlaceholder' != 'true')`;

packages/memory/src/episodic/episodic-retrieval.ts:
  309:     // In a real implementation, this would reconstruct additional details
  527:     // Simple keyword matching
  728:     // In a real implementation, this would add related memories,

packages/memory/src/episodic/memory-consolidation.ts:
  207:     // For now, use a simple heuristic based on memory type
  221:     // In a real implementation, this would update memory strength
  222:     // For now, we'll just mark it as strengthened
  455:     // Extract from description (simplified)

packages/memory/src/episodic/narrative-generator.ts:
  784:     // For now, return basic alternatives

packages/memory/src/episodic/salience-scorer.ts:
  126:     // Simple novelty calculation based on type and description similarity
  286:    * Simple text similarity calculation

packages/memory/src/provenance/evidence-manager.ts:
  374:     // Sort by relevance (simple implementation)

packages/memory/src/provenance/explanation-generator.ts:
   89:       case ExplanationFormat.SIMPLE:
   90:         content = this.generateSimpleExplanation(decision);
  635:    * Generate simple explanation
  637:   private generateSimpleExplanation(decision: DecisionRecord): string {
  654:     // Simple justification
  657:     // Outcome in simple terms

packages/memory/src/provenance/types.ts:
  285:   SIMPLE = 'simple',

packages/memory/src/semantic/graph-rag.ts:
   96:     // This is a simplified implementation
  172:     // This is a simplified implementation
  203:     // This is a simplified implementation

packages/memory/src/semantic/knowledge-graph-core.ts:
  803:     // This is a simplified implementation
  820:     // This is a simplified implementation

packages/memory/src/semantic/query-engine.ts:
  312:     // This is a simplified implementation
  319:     // Create a simple path

packages/memory/src/semantic/relationship-extractor.ts:
   53:     // This is a simplified implementation
   62:     // Simple entity extraction using basic patterns
   90:     // Simple relationship extraction using basic patterns
  138:     // This is a simplified implementation
  252:     // This is a simplified implementation using regex patterns
  342:     // This is a simplified implementation

packages/memory/src/skills/SkillRegistry.ts:
   50:   complexity: 'simple' | 'moderate' | 'complex';
  110:         complexity: 'simple',

packages/memory/src/social/social-memory-manager.ts:
  391:     // For now, using simple templates

packages/memory/src/working/attention-manager.ts:
  671:     // This is a simplified calculation - in a real implementation,

packages/minecraft-interface/cleanup-unnecessary-files.sh:
  52: backup_and_remove "bin/test-crafting-grid-simple.ts"
  57: backup_and_remove "bin/test-connection-simple.ts"
  72: backup_and_remove_dir "dist-simple"
  73: backup_and_remove "package-simple.json"

packages/minecraft-interface/bin/mc-simple.d.ts:
   3:  * Simple Minecraft Interface CLI
  11: //# sourceMappingURL=mc-simple.d.ts.map

packages/minecraft-interface/bin/mc-simple.d.ts.map:
  1: {"version":3,"file":"mc-simple.d.ts","sourceRoot":"","sources":["mc-simple.ts"],"names":[],"mappings":";AACA;;;;;;;GAOG"}

packages/minecraft-interface/bin/mc-simple.js.map:
  1: {"version":3,"file":"mc-simple.js","sourceRoot":"","sources":["mc-simple.ts"],"names":[],"mappings":";AACA;;;;;;;GAOG;AAEH,OAAO,EACL,8BAA8B,EAC9B,qBAAqB,GAEtB,MAAM,0BAA0B,CAAC;AAUlC,SAAS,SAAS;IAChB,MAAM,IAAI,GAAG,OAAO,CAAC,IAAI,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC;IACnC,MAAM,OAAO,GAAe,EAAE,CAAC;IAE/B,KAAK,IAAI,CAAC,GAAG,CAAC,EAAE,CAAC,GAAG,IAAI,CAAC,MAAM,EAAE,CAAC,EAAE,EAAE,CAAC;QACrC,MAAM,GAAG,GAAG,IAAI,CAAC,CAAC,CAAC,CAAC;QAEpB,QAAQ,GAAG,EAAE,CAAC;YACZ,KAAK,QAAQ;gBACX,OAAO,CAAC,IAAI,GAAG,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC;gBACzB,MAAM;YACR,KAAK,QAAQ;gBACX,OAAO,CAAC,IAAI,GAAG,QAAQ,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC,EAAE,EAAE,CAAC,CAAC;gBACvC,MAAM;YACR,KAAK,YAAY;gBACf,OAAO,CAAC,QAAQ,GAAG,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC;gBAC7B,MAAM;YACR,KAAK,UAAU;gBACb,OAAO,CAAC,MAAM,GAAG,IAAI,CAAC,EAAE,CAAC,CAAC,CAAC;gBAC3B,MAAM;YACR,KAAK,WAAW,CAAC;YACjB,KAAK,IAAI;gBACP,OAAO,CAAC,OAAO,GAAG,IAAI,CAAC;gBACvB,MAAM;YACR,KAAK,QAAQ,CAAC;YACd,KAAK,IAAI;gBACP,SAAS,EAAE,CAAC;gBACZ,OAAO,CAAC,IAAI,CAAC,CAAC,CAAC,CAAC;gBAChB,MAAM;QACV,CAAC;IACH,CAAC;IAED,OAAO,OAAO,CAAC;AACjB,CAAC;AAED,SAAS,SAAS;IAC

packages/minecraft-interface/bin/mc-simple.ts:
    3:  * Simple Minecraft Interface CLI
   12:   createSimpleMinecraftInterface,
   13:   DEFAULT_SIMPLE_CONFIG,
   14:   SimpleBotConfig,
   15: } from '../src/standalone-simple';
   62:  Simple Minecraft Interface CLI
   64: Usage: node mc-simple.js [options]
   69:   --username <name>    Bot username (default: SimpleBot)
   82:   node mc-simple.js --host localhost --port 25565
   83:   node mc-simple.js --action move --verbose
   84:   node mc-simple.js --username TestBot --action chat
  130:           parameters: { message: 'Hello from SimpleBot!' },
  152:     console.log(' Simple Minecraft Interface Test');
  157:     const config: SimpleBotConfig = {
  158:       ...DEFAULT_SIMPLE_CONFIG,
  159:       host: options.host ?? DEFAULT_SIMPLE_CONFIG.host,
  161:         options.port !== undefined ? options.port : DEFAULT_SIMPLE_CONFIG.port,
  162:       username: options.username ?? DEFAULT_SIMPLE_CONFIG.username,
  171:     const minecraftInterface = createSimpleMinecraftInterface(config);

packages/minecraft-interface/bin/mc-standalone.ts:
  106:     // Execute simple movement

packages/minecraft-interface/src/action-executor.ts:
  166:         // Find and move to nearest village (simplified)

packages/minecraft-interface/src/action-translator.ts:
    38: // Simple inline goal classes for ES modules compatibility
    39: class SimpleGoalNear {
    69: class SimpleGoalBlock {
    98: const simpleGoals = {
    99:   GoalNear: SimpleGoalNear,
   100:   GoalBlock: SimpleGoalBlock,
   104:   return Promise.resolve(simpleGoals);
  1057:    * 1. LeafFactory-first: if a non-placeholder leaf exists for the action type
  1082:           : (leafFactory.get(leafName) && (leafFactory.get(leafName) as any)?.spec?.placeholder !== true);
  1158:           // Treat move_to like navigate for now
  1299:         (leafFactory.isRoutable ? leafFactory.isRoutable('craft_recipe') : (craftRecipeLeaf as any)?.spec?.placeholder !== true)
  1371:     // Simple recipe mapping for basic items (wood-variant-aware)
  1505:       if (leafFactory.isRoutable ? !leafFactory.isRoutable('smelt') : (smeltLeaf as any)?.spec?.placeholder === true) {
  1508:           error: "Leaf 'smelt' is a placeholder stub",
  1620:     if (leafFactory.isRoutable ? !leafFactory.isRoutable(leafName) : (leaf as any)?.spec?.placeholder === true) {
  1623:         error: `Leaf '${leafName}' is a placeholder stub`,
  1685:       if (leafFactory.isRoutable ? !leafFactory.isRoutable('dig_block') : (digBlockLeaf as any)?.spec?.placeholder === true) {
  1689:             'Placeholder leaf cannot be executed; real leaf must be registered by minecraft-interface.',
  2065:         // For now, use basic heuristics that could be learned:
  2347:         // No suitable shelter found, try to build a simple one
  2348:         return await this.buildSimpleShelter(botPosition, light_sources);
  2392:    * Build a simple shelter when no natural shelter is found
  2394:   private async buildSimpleShelter(
  2420:       // Build a simple 2x2x2 shelter
  2450:           shelterType: 'simple_2x2x2',
  3223:       // For now, implement basic behavior tree execution
  3224:       // This is a placeholder that should be enhanced with proper BT execution
  3272:       // For now, simulate crafting an axe since mineflayer API is complex
  3273:       // In a real implementation, this would use proper crafting mechanics
  3455:     // Simple spiral exploration

packages/minecraft-interface/src/automatic-safety-monitor.ts:
  723:     // Analyze water currents (simplified - would need more complex logic in real implementation)

packages/minecraft-interface/src/bot-adapter.ts:
  1102:   // TODO(rig-I-primitive-21): Remove /process throttling when observation batching is implemented
  1111:     // TODO(rig-I-primitive-21): Replace with proper entity observation batching
  1118:       await this._detectAndRespondToEntitiesImpl();
  1127:   private async _detectAndRespondToEntitiesImpl(): Promise<void> {
  1161:       // TODO(rig-I-primitive-21): Replace with proper entity observation batching
  1480:       // TODO(rig-I-primitive-21): Replace with proper observation batching

packages/minecraft-interface/src/environmental-detector.ts:
  285:     // Simple pattern-based prediction
  353:         position: position.clone(), // Would be more specific in real implementation

packages/minecraft-interface/src/index.ts:
   39: // Simple interface (minimal dependencies)
   41:   SimpleMinecraftInterface,
   42:   createSimpleMinecraftInterface,
   43:   DEFAULT_SIMPLE_CONFIG,
   44: } from './standalone-simple';
  142:  * Quick interface for simple scenarios

packages/minecraft-interface/src/long-journey-navigator.ts:
  309:       totalJourneys: 0, // Would track in real implementation
  310:       successfulJourneys: 0, // Would track in real implementation
  311:       totalDistance: 0, // Would track in real implementation
  312:       averageSpeed: 0, // Would track in real implementation
  410:         startPos.y, // Keep Y level for now
  633:     // Simple replanning - in a real implementation, this would be more sophisticated
  636:     // For now, allow journey to continue with remaining stages
  815:     // Simple predictive following - move in the direction the player was last moving
  816:     // In a real implementation, this would use more sophisticated prediction

packages/minecraft-interface/src/navigation-bridge.ts:
    65: class MockNavigationSystem extends EventEmitter {
    72:     // Simple implementation that simulates building a navigation graph
    91:     // Simple mock implementation that creates a path
   114:       reason: 'mock_path',
   158:   private navigationSystem: MockNavigationSystem;
   249:     this.navigationSystem = new MockNavigationSystem(navConfig);
   313:       // Create movements without minecraft-data for now
  1586:     // For now, return UNKNOWN to be enhanced later
  1708:     private _navigationSystem: MockNavigationSystem

packages/minecraft-interface/src/neural-terrain-predictor.ts:
  210:     // Simplified gradient computation for demo purposes
  211:     // In a real implementation, this would be more sophisticated
  397:     // For now, return mock features
  468:     // Simple path calculation - prefer high stability, low hazard patterns
  471:     // For demo purposes, return a simple interpolated path
  749:     // For now, return realistic mock features

packages/minecraft-interface/src/observation-mapper.ts:
   91:    * Send a simple thought to the cognition system
  513:     // Social needs (simplified - based on multiplayer presence)

packages/minecraft-interface/src/plan-executor.ts:
  218:       // TODO(rig-planning): Replace with proper Sterling solver integration when planning rigs are implemented.
  444:         finalWorldState: finalWorldState as any, // TODO: Implement proper type conversion for final world state
  634:         complexityScore: executionResult.totalSteps * 10, // Simple complexity metric
  661:         // This is simplified - ideally we'd track all movement
  813:       // This is a simplified calculation - in production you'd want more sophisticated monitoring
  832:       // For now, return a placeholder value
  847:     // For now, it's a placeholder method

packages/minecraft-interface/src/server.ts:
   519:     // TODO [PLACEHOLDER]: Replace static death reflection with LLM-generated content
   537:           '[PLACEHOLDER] Died and respawned. Need to reflect on what went wrong and be more careful.',
   548:         isPlaceholder: true,
  1342:     // Return empty chat history for now - can be implemented later
  1439:     // Return empty player interactions for now - can be implemented later
  1468:     // Return empty processed messages for now - can be implemented later
  2030:       // TODO [PLACEHOLDER]: Replace static reflection text with LLM-generated content
  2049:             '[PLACEHOLDER] Woke up after sleeping through the night. A good time to reflect on recent experiences and consolidate what was learned.',
  2060:           isPlaceholder: true,
  2319:     // Generate some placeholder screenshots
  2323:     // Use placeholder image URLs since Prismarine viewer is disabled
  2324:     const placeholderUrls = [
  2325:       'https://via.placeholder.com/640x480?text=Minecraft+View',
  2326:       'https://via.placeholder.com/640x480?text=Forest+Biome',
  2327:       'https://via.placeholder.com/640x480?text=Plains+Biome',
  2328:       'https://via.placeholder.com/640x480?text=Cave+Exploration',
  2329:       'https://via.placeholder.com/640x480?text=Village+Encounter',
  2336:         url: placeholderUrls[i % placeholderUrls.length],
  2359:     // Generate a placeholder screenshot with a static image URL
  2365:         'https://via.placeholder.com/640x480?text=Minecraft+View+at+' +

packages/minecraft-interface/src/signal-processor.ts:
  473:       // For now, we'll use a simple heuristic based on item names that might indicate edibility
  950:     // Simplified terrain analysis
  951:     // In a real implementation, this would check for:
  977:     // For now, return a small penalty for most positions

packages/minecraft-interface/src/simulation-stub.ts:
   4:  * Provides a mock Minecraft environment for testing without requiring
  14:  * Mock game state for simulation

packages/minecraft-interface/src/standalone-simple.ts:
     2:  * Simplified Standalone Minecraft Interface
    21: export interface SimpleBotConfig {
    29: export interface SimpleGameState {
    38: export interface SimpleAction {
    43: export class SimpleMinecraftInterface extends EventEmitter {
    45:   private config: SimpleBotConfig;
    54:   constructor(config: SimpleBotConfig) {
   170:   async getGameState(): Promise<SimpleGameState> {
   190:    * Execute a simple action
   192:   async executeAction(action: SimpleAction): Promise<any> {
   265:           error: `Cannot move forward: blocked by ${blockAhead.name}`,
   270:       // Simple movement using control state
   724:       // TODO: Implement command handling, resolving the many todos below
   737:           // TODO: Implement follow logic using bot.follow() and pathfinding
   746:           // TODO: Implement stop logic to halt current bot movement
   755:           // TODO: Implement come logic using pathfinding to reach player
   764:           // TODO: Implement go logic for autonomous exploration
  1194:  * Create a simple Minecraft interface
  1196: export function createSimpleMinecraftInterface(
  1197:   config: SimpleBotConfig
  1198: ): SimpleMinecraftInterface {
  1199:   return new SimpleMinecraftInterface(config);
  1205: export const DEFAULT_SIMPLE_CONFIG: SimpleBotConfig = {
  1208:   username: 'SimpleBot',

packages/minecraft-interface/src/standalone.ts:
    4:  * A simplified version of the Minecraft interface that doesn't require
   37:     // Create a mock bot for ActionTranslator - will be replaced when connected
   38:     const mockBot = {} as Bot;
   39:     this.actionTranslator = new ActionTranslator(mockBot, config);
  158:    * Run a simple test scenario
  168:       // Execute a simple movement action

packages/minecraft-interface/src/viewer-enhancements.ts:
  309:         isAttacking: false, // TODO: Track attack state

packages/minecraft-interface/src/water-navigation-manager.ts:
  295:       // In a real implementation, you would track actual execution time
  296:       totalStrategyTime += 5000; // Mock 5 second average
  367:     // Simplified current analysis - in real implementation would detect flow patterns
  672:     // In a real implementation, this would control bot movement patterns
  673:     // For now, we just emit the strategy change
  711:     // In a real implementation, this would execute specific movement patterns
  712:     // For now, we simulate different execution strategies

packages/minecraft-interface/src/asset-pipeline/animated-material.ts:
  300:     // TODO: In the future, we could encode sequence index in the animation map
  301:     // For now, pass -1.0 to indicate no custom sequence lookup needed

packages/minecraft-interface/src/asset-pipeline/asset-server.ts:
  328:       // Helper: simpleName for flat paths like "steve.png" → "steve"
  329:       const simpleName = relativePath.includes('/') ? null : path.basename(relativePath, '.png');
  330:       const altRelativePath = simpleName ? path.join(simpleName, `${simpleName}.png`) : null;
  354:         if (simpleName) {
  355:           for (const candidate of [`player/wide/${simpleName}.png`, `player/slim/${simpleName}.png`]) {
  371:       const playerSkinCandidates = simpleName
  373:             path.join('player', 'wide', `${simpleName}.png`),
  374:             path.join('player', 'slim', `${simpleName}.png`),

packages/minecraft-interface/src/asset-pipeline/atlas-builder.ts:
   52:    * Gets or creates the missing texture placeholder.
   80:    * in the atlas. This is critical because the shader uses a simple V offset
  183:         console.warn(`[atlas-builder] Failed to load texture ${texture.name}, using placeholder`);
  240:         console.warn(`[atlas-builder] Failed to load animated texture ${texture.name}, using placeholder`);
  241:         // Draw placeholder for each frame slot

packages/minecraft-interface/src/asset-pipeline/blockstates-builder.ts:
  229:       // Return a simple cube with missing texture
  237:    * Creates a simple cube model with missing texture for unknown models.

packages/minecraft-interface/src/extensions/demo-state-machine-usage.ts:
   20: // Mock bot for demonstration (in real usage, this would be a real Mineflayer bot)
   21: const mockBot = {
   48:   const craftingStates = createCraftingStateMachine(mockBot, 'iron_pickaxe', 1);
   74:   const buildingStates = createBuildingStateMachine(mockBot, 'house', {
  104:   const gatheringStates = createGatheringStateMachine(mockBot, 'wood', 64);
  130:   const stateMachineWrapper = new StateMachineWrapper(mockBot, {
  172:     mockBot,

packages/minecraft-interface/src/leaves/container-leaves.ts:
  650:         // Use simple goals implementation

packages/minecraft-interface/src/leaves/crafting-leaves.ts:
  435:     // assume the crafting was successful (the test mock handles the inventory)

packages/minecraft-interface/src/leaves/interaction-leaves.ts:
   26: // Fallback simple goals for contexts where real pathfinder goals aren't needed
   27: class SimpleGoalNear {
   57: const simpleGoals = {
   58:   GoalNear: SimpleGoalNear,
  296:     // Simple interval check - place every N blocks
  297:     // This is a simplified version; in practice, you'd track the last torch position
  684:           new simpleGoals.GoalNear(

packages/minecraft-interface/src/leaves/sensing-leaves.ts:
  481:         // Simple wait without abort checking

packages/minecraft-interface/src/leaves/world-interaction-leaves.ts:
   993:         // This would trigger farming/mining operations - simplified for now
  1158:         return dimensions.width * dimensions.height; // Simple wall
  1187:     // Build walls and floor (simplified)
  1220:     // Build circular tower (simplified)

packages/minecraft-interface/src/skill-composer/skill-composer.ts:
     4:  * Implements Voyager-inspired skill composition that allows simple leaves
   440:     // Simple type relationship checking
   503:     // Multi-leaf combinations (up to 3 leaves for now)
   599:       // Determine execution order (simple dependency-based ordering)
   630:     // Simple topological sort based on input/output dependencies
   986:     // Simple prerequisite checking - in practice this would be more sophisticated
  1109:     // For now, return combinations as-is

packages/minecraft-interface/src/viewer/client/index.js:
  343:       // For now, just track the intensity

packages/minecraft-interface/src/viewer/entities/entities.js:
  780:       // without a Mojang cape — disabled for now since most bots don't have capes

packages/minecraft-interface/src/viewer/entities/entity-extras.js:
  259:  * Cape fragment shader - Simple shading with wave-based lighting

packages/minecraft-interface/src/viewer/entities/equipment-renderer.js:
  288:  * Create held item mesh (simplified cube representation)
  298:   // Create a simple box to represent the item

packages/minecraft-interface/src/viewer/meshing/models.js:
  165:       let m = 1 // Fake lighting to improve lisibility
  375:         // TODO: correctly interpolate ao light based on pos (evaluate once for each corner of the block)

packages/minecraft-interface/src/viewer/renderer/worldView.js:
  11: import { spiral, ViewRect, chunkPos } from '../utils/simpleUtils.js'

packages/minecraft-interface/src/viewer/server/mineflayer.js:
  370:       const isSnowBiome = false // TODO: Check bot.world biome temperature
  465:       // (we could track per-socket, but for now just let it grow)

packages/minecraft-interface/src/viewer/utils/simpleUtils.js:
  14: function spiral (X, Y, fun) { // TODO: move that to spiralloop package

packages/planning/src/cognitive-integration.ts:
  269:         alternatives.push('Try crafting simpler items first');

packages/planning/src/cognitive-thought-processor.ts:
  1223:     // Simple entity extraction - in a real system this would use NLP
  1264:    * PLACEHOLDER: real task history not integrated; returns empty until task store or planning API is wired.
  1319:     // Simple extraction based on thought content

packages/planning/src/environment-integration.ts:
  5:  * and resource assessment to replace mock data with actual world state.

packages/planning/src/live-stream-integration.ts:
    5:  * and screenshot integration to replace all mock data from stream APIs.
  364:       // Generate explored area (simplified - in real implementation this would track actual exploration)
  549:    * Generate explored area (simplified)

packages/planning/src/memory-integration.ts:
   5:  * to replace mock data with actual cognitive insights and memory data.
  68:   // Simple per-instance circuit breaker for memory system

packages/planning/src/modular-server.ts:
   355: // simple low-discrepancy sampler for exploration (deterministic per tick)
  3797:         // Sequential solves with inventory accumulation (Option A: simpler)
  4189:     // Register placeholder Minecraft leaves with both the registry and MCP.
  4190:     // Placeholder leaves are registration-only; minecraft-interface must register real leaves before execution.
  4196:         // Create minimal placeholder LeafImpls so BT options can register and validate
  4198:         const makePlaceholder = (
  4225:             description: `${name} (placeholder)` as any,
  4231:             placeholder: true as const,
  4239:                 detail: 'placeholder',
  4247:           makePlaceholder('move_to', '1.0.0', ['movement']),
  4248:           makePlaceholder('step_forward_safely', '1.0.0', ['movement']),
  4249:           makePlaceholder('follow_entity', '1.0.0', ['movement']),
  4250:           makePlaceholder('dig_block', '1.0.0', ['dig']),
  4251:           makePlaceholder('place_block', '1.0.0', ['place']),
  4252:           makePlaceholder('place_workstation', '1.0.0', ['place']),
  4253:           makePlaceholder('place_torch_if_needed', '1.0.0', ['place']),
  4254:           makePlaceholder('retreat_and_block', '1.0.0', ['place']),
  4255:           makePlaceholder('consume_food', '1.0.0', ['sense']),
  4256:           makePlaceholder('sense_hostiles', '1.0.0', ['sense']),
  4257:           makePlaceholder('chat', '1.0.0', ['chat']),
  4258:           makePlaceholder('wait', '1.0.0', ['sense']),
  4259:           makePlaceholder('get_light_level', '1.0.0', ['sense']),
  4260:           makePlaceholder('craft_recipe', '1.1.0', ['craft']),
  4261:           makePlaceholder('smelt', '1.1.0', ['craft']),
  4275:             // Register in governance registry (active status for now)

packages/planning/src/signal-extraction-pipeline.ts:
  223:     // Simple entity extraction - could be enhanced with LLM
  531:     // Simple extraction for LLM context

packages/planning/src/behavior-trees/BehaviorTreeRunner.ts:
    94:     // Simple expression parser for common patterns
   429:     // Initialize with a placeholder tree, will be loaded in execute()
   562:     // Handle simple decorators as wrappers
  1272:       // Fallback: return a simple action node

packages/planning/src/credit/credit-manager.ts:
  85:  * In-memory storage for now. Future: persist to Sterling or memory system.

packages/planning/src/goal-formulation/advanced-signal-processor.ts:
  587:     // For now, return a reasonable default
  602:     // Simple linear regression for trend calculation
  618:     // Simple peak prediction
  625:       acceleration: 0, // Simplified for now
  632:     // Simplified threat assessment

packages/planning/src/goal-formulation/goal-generator.ts:
  816:     // Simplified crafting system - would integrate with actual crafting system
  835:     // Simplified gathering location finder
  848:     // Simplified trading system
  898:     // Simplified path checking - would integrate with navigation system

packages/planning/src/goal-formulation/hunger-driveshaft-controller.ts:
  132: // TODO: The leaf's isFoodItem() in interaction-leaves.ts is the authority for
  321:   // Pipeline instances — real, not mocked

packages/planning/src/goal-formulation/priority-scorer.ts:
  328:     // Simplified path risk assessment

packages/planning/src/goal-formulation/reflex-lifecycle-events.ts:
  51:  * task_id is a placeholder (`pending-{reflexInstanceId.slice(0,8)}`) because
  60:   /** Placeholder ID — use reflexInstanceId for joining, not this */

packages/planning/src/goals/goal-lifecycle-events.ts:
  130:  * Simple event collector for lifecycle events.

packages/planning/src/hierarchical/macro-planner.ts:
  210:     // Simple priority queue (array, re-sort on each iteration)

packages/planning/src/hierarchical-planner/cognitive-router.ts:
  623:     // Additional context check: if it's a simple help request, don't classify as ethical

packages/planning/src/modules/keep-alive-integration.ts:
  339:         // Return a simple observation as fallback

packages/planning/src/modules/mcp-integration.ts:
    71:     complexity?: 'simple' | 'moderate' | 'complex';
   119: // Fallback shim interface for the local MCP server mock
   967:     // Complexity confidence (simpler tools are more reliable)
   969:       case 'simple':
  1115:         // Simple heuristics for result quality
  1143:       // This is a simplified evaluation - in practice, this would be more sophisticated
  1166:     // Simplified goal achievement evaluation
  1251:   private inferToolComplexity(tool: any): 'simple' | 'moderate' | 'complex' {
  1262:       desc.includes('simple') ||
  1266:       return 'simple';
  1333:   ): 'simple' | 'moderate' | 'complex' | null {
  1344:       desc.includes('simple') ||
  1348:       return 'simple';

packages/planning/src/modules/planning-bootstrap.ts:
  47:  * Enables tests to inject mocks via overrides.

packages/planning/src/modules/planning-endpoints.ts:
   747:     // Handle simple task types
  1042:         // Convert task to plan (simplified)

packages/planning/src/reactive-executor/minecraft-executor.ts:
  51:           // Continue with next step for now

packages/planning/src/reactive-executor/reactive-executor.ts:
   442:     // Simple estimation: 30 seconds per step + 10 seconds overhead
   500:       // For now, memory context is handled separately in the execution logic
   716:     // Simplified effect application - in real implementation this would be more complex
   915:       // Capability health (simplified for now)
   918:       // Memory impact (placeholder)
  1058:       // For now, skip MCP and go directly to Minecraft execution
  1344:         threatLevel: 0.1, // TODO: Get from world state
  1358:       // Create mock world state for PBI
  1359:       const mockWorldState = {
  1379:         mockWorldState
  1505:     // Simple safety assessment based on task type and parameters
  1652:           // For now, return 0 to indicate no connection
  1765:           // For now, return failure to indicate no connection
  1816:     // For now, use basic values from world state with empty defaults
  1857:     // For now, return empty array to indicate no opportunities detected
  1864:     // For now, return empty array to indicate no threat responses available
  1875:     // For now, return plan unchanged to indicate no optimization available
  1978:     // Simple safety assessment based on task type and parameters

packages/planning/src/server/execution-gateway.ts:
   48:  * - 'shadow': action was blocked by shadow mode (not a failure, not executed)
  177:       error: 'Blocked by shadow mode',
  184:       error: 'Blocked by shadow mode',

packages/planning/src/skill-integration/llm-skill-composer.ts:
   53:   complexity: 'simple' | 'moderate' | 'complex';
  263:             // For now, we'll just return the base composition result
  308:       // Call LLM for refinement (mock implementation for now)
  490: 1. Breaking down complex goals into simpler sub-goals
  663:       // Mock LLM call for now - in practice this would call an actual LLM service
  664:       console.log(`🤖 Mock LLM call for ${taskType}`);
  670:       // Return mock response based on task type
  671:       return this.generateMockLLMResponse(taskType, prompt);
  679:    * Generate mock LLM responses for testing
  681:   private generateMockLLMResponse(taskType: string, prompt: string): string {
  925:     // For now, return a mock list
  938:   private determineComplexity(goal: Goal): 'simple' | 'moderate' | 'complex' {
  939:     if (goal.priority <= 3) return 'simple';
  948:     // Simple selection based on complexity and risk

packages/planning/src/skill-integration/mcp-capabilities-adapter.ts:
  423:       // Simple keyword matching for now
  733:     // Simple precondition checking for now
  741:     // Simple topological sort for now
  751:     // Simple estimation based on capability status
  792:     // Simple fallback identification for now
  804:     // Simple fallback execution for now
  817:     // Simple keyword matching for now

packages/planning/src/skill-integration/mcp-integration.ts:
    53:   complexity: 'simple' | 'moderate' | 'complex';
   118:   complexity: 'simple' | 'moderate' | 'complex';
   744:     // Simple scoring based on multiple factors
   759:       if (goal.priority <= 3 && strategy.complexity === 'simple') score += 2;
   859:         // Execute capability (mock implementation)
   964:     // Mock capability execution
  1026:   private mapComplexity(complexity: number): 'simple' | 'moderate' | 'complex' {
  1027:     if (complexity <= 3) return 'simple';
  1037:   ): 'simple' | 'moderate' | 'complex' {
  1041:           cap.complexity === 'simple'
  1094:       (cap) => cap.complexity === 'simple'
  1208:     // Simple selection based on goal type and capability category
  1249:       if (goal.priority <= 3 && a.complexity === 'simple') scoreA += 2;
  1250:       if (goal.priority <= 3 && b.complexity === 'simple') scoreB += 2;
  1268:     // Simple adaptation: prefer capabilities that succeeded
  1293:     if (priority <= 3 && complexity === 'simple') return true;

packages/planning/src/skill-integration/skill-composer-adapter.ts:
   90:     preferSimple?: boolean;
  462:   private mapComplexity(complexity: number): 'simple' | 'moderate' | 'complex' {
  463:     if (complexity <= 3) return 'simple';
  514:    * Simple string hashing function
  608:     if (goal.priority <= 3 && skill.metadata.complexity === 'simple')
  633:     // This is a simplified implementation - in practice you'd track actual hits
  636:       hitRate: 0.8, // Placeholder

packages/planning/src/skill-integration/skill-planner-adapter.ts:
  351:     // Simple goal-to-skill mapping based on common patterns
  419:         {}, // Default args for now
  493:     // Simple pattern analysis - in a full implementation, this would use NLP
  557:           | 'simple'
  563:           | 'simple'
  576:     complexity: 'simple' | 'moderate' | 'complex'
  579:       case 'simple':
  595:       // Simple parsing - in full implementation, use proper condition parser
  628:         | 'simple'
  686:     // Simple topological sort for execution order

packages/planning/src/skill-integration/types.ts:
  19:   spec: any; // Simplified for now

packages/planning/src/sterling/episode-classification.ts:
  221: // TODO(2026-03-01): Remove these aliases and update all call sites to use
  229: // TODO(2026-03-01): remove alias
  236: // TODO(2026-03-01): remove alias

packages/planning/src/sterling/minecraft-acquisition-rules.ts:
  391:   // or we check via contextSnapshot. For now, always include as 'unknown'
  445:  * using simple lexicographic comparison (not localeCompare).
  473:     // Deterministic tie-break: simple lexicographic by strategy name

packages/planning/src/sterling/minecraft-acquisition-types.ts:
  198:   // Uses simple lexicographic comparison (not localeCompare) for cross-environment stability.

packages/planning/src/sterling/minecraft-building-rules.ts:
  132:  * Compute a simple site capability hash from dimensions and clearance.

packages/planning/src/sterling/minecraft-crafting-rules.ts:
  49:  * that would pass a simple nullish check but crash on property access.
  62: // Smelting recipes (simplified — no furnace scheduling, just input→output)

packages/planning/src/sterling/minecraft-tool-progression-solver.ts:
  648:    * Determine which tier is blocked by missing blocks.

packages/planning/src/sterling/sterling-reasoning-service.ts:
  472:     // TODO: Validate declaration shape at this boundary instead of trusting the cast.

packages/planning/src/sterling/primitives/p03/p03-capsule-types.ts:
  306:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p08/p08-capsule-types.ts:
  264:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p08/p08-reference-adapter.ts:
  123:     return simpleHash(rotations[0]);
  161:     const id = simpleHash(patternStr);
  236:  * Simple deterministic hash function (no crypto dependency).
  239: function simpleHash(input: string): string {

packages/planning/src/sterling/primitives/p09/p09-capsule-types.ts:
  462:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p09/p09-reference-fixtures.ts:
  349:     // For simplicity in the capsule model: budget must remain positive.

packages/planning/src/sterling/primitives/p10/p10-reference-adapter.ts:
  801:     // Simple: sum of action costs weighted by path probability

packages/planning/src/sterling/primitives/p11/p11-capsule-types.ts:
  313:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p12/p12-capsule-types.ts:
  317:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p13/p13-capsule-types.ts:
   19:  *   reroll/rollback/undo     -> foreclosed   (blocked by commitment)
  107:   /** Operators blocked by commitments (cannot be used anymore). */

packages/planning/src/sterling/primitives/p13/p13-reference-adapter.ts:
   95:         reason: `Operator ${operatorId} is blocked by a prior commitment`,
  175:     // Simple model: 2 points per available option
  192:       optionValue: 0, // Placeholder, recalculated below

packages/planning/src/sterling/primitives/p15/p15-capsule-types.ts:
  335:   /** Content hash of conformance suite source (placeholder until CI generates). */

packages/planning/src/sterling/primitives/p21/p21-capsule-types.ts:
  252:   /** Content hash of suite source — placeholder until CI generates */

packages/planning/src/task-integration/sterling-planner.ts:
  232:     // For now, generate steps for the first macro edge

packages/planning/src/world-state/world-knowledge-integrator.ts:
  317:     // Simple self-agent entity; could be enriched with identity later

packages/safety/src/fail-safes/emergency-response.ts:
   139:           // In a real implementation, this would make an HTTP request
   140:           // For now, simulate the notification
   145:           // In a real implementation, this would send an email
   150:           // In a real implementation, this would update a dashboard
  1035:     // Store checkpoint (in a real implementation, this would be persisted)

packages/safety/src/fail-safes/fail-safes-system.ts:
  134:     // In a real implementation, this would query actual system resources

packages/safety/src/fail-safes/preemption-manager.ts:
  142:     // In a real implementation, this would query actual system memory
  238:     // Simple heuristic: benefit is proportional to priority difference
  749:     // In a real implementation, this would query actual system memory

packages/safety/src/monitoring/health-monitor.ts:
  471:     // This is a simplified health check implementation
  527:     // Simplified CPU check - in real implementation, would measure actual CPU usage
  544:     // Simplified disk check - in real implementation, would check actual disk usage
  564:     // Simplified network check - in real implementation, would ping external services
  576:     // Simplified service check - in real implementation, would check actual endpoints
  604:     // Use checkId as componentId for simplicity

packages/safety/src/monitoring/safety-monitoring-system.ts:
  579:     // CPU usage would be calculated here in a real implementation
  580:     // For now, use a placeholder
  581:     this.metrics.system.cpuUsage = 0.1; // 10% placeholder

packages/safety/src/monitoring/telemetry-collector.ts:
  112:     // Simple cleanup - remove old values (in real implementation, use time-based indexing)
  130:     // In a real implementation, filter by time window
  230:         // For now, we'll continue (overwrite oldest)
  369:       // In a real implementation, this would write to persistent storage
  370:       // For now, we'll just clear the buffer and emit event

packages/safety/src/privacy/consent-manager.ts:
  240:     // In a real implementation, this would send a message to the player
  241:     // For now, we'll emit an event that other systems can handle
  643:     // This would be calculated from stored data in a real implementation

packages/safety/src/privacy/data-anonymizer.ts:
  372:     // In a real implementation, these would be tracked over time

packages/safety/src/privacy/geofence-manager.ts:
   23:   private spatialIndex: Map<string, string[]>; // Simple spatial indexing by chunk
  565:     // This would be tracked over time in a real implementation

packages/world/src/navigation/cost-calculator.ts:
  144:       // For this simplified implementation, we apply a base penalty for each hazard
  145:       const distance = 1; // Simplified - hazards contain position info
  392:     // Generate safety suggestions (simplified)

packages/world/src/navigation/dstar-lite-core.ts:
  630:     // For now, default to move

packages/world/src/navigation/navigation-system.ts:
  594:     // This would need time-based tracking in a real implementation
  605:     // Estimate cache hit rate (simplified)
  606:     this.metrics.efficiency.cacheHitRate = 0.8; // Placeholder

packages/world/src/navigation/types.ts:
  314:   simplified: z.boolean(),
  363:     simplificationEnabled: z.boolean().default(true),
  510:   simplifyPath(

packages/world/src/perception/confidence-tracker.ts:
  484:     // For now, just update internal state

packages/world/src/perception/object-recognition.ts:
  594:     // For now, return a placeholder classification

packages/world/src/perception/perception-integration.ts:
  185:         cacheHitRate: 0.8, // Placeholder
  470:           from: { x: 0, y: 0, z: 0 }, // Previous focus placeholder
  664:     // Simple heuristic: object is visible if it was seen recently
  710:     // Simplified staleness calculation
  734:     // Generate simple viewpoint suggestions around the query area
  756:     // Simple spatial clustering
  860:     // Calculate field coverage (simplified)

packages/world/src/perception/visual-field-manager.ts:
  344:       // Top-down attention (goal-driven) - placeholder for now

packages/world/src/place-graph/spatial-navigator.ts:
  448:     // Fallback: provide a simple high-level directive

packages/world/src/sensing/raycast-engine.ts:
  246:       // Simple cone ray distribution (could be improved with more sophisticated patterns)
  425:     // Simple implementation - in a real system this would use a spatial index
  446:     // Use a simple grid pattern for testing
  507:     // In a real implementation, this would update the world state

packages/world/src/sensing/visible-sensing.ts:
   13: // Mock PerformanceTracker for standalone testing
   16:     return { id: 'mock', operation, context };
  417:     // This is a simplified calculation - in practice would examine actual ages

packages/world/src/sensorimotor/motor-controller.ts:
  762:     // Simplified interleaved execution
  770:     // Simplified conditional execution
  822:     // Simple correction logic based on feedback

packages/world/src/sensorimotor/sensorimotor-system.ts:
  451:     // In a real implementation, this would interface with actual sensors
  606:     // This would be tracked in a real implementation
  624:     // This would be tracked in a real implementation

packages/world/src/sensorimotor/sensory-feedback-processor.ts:
   440:     // Simple noise filtering based on quality threshold
   653:     // Simple relevance calculation based on data quality and timing
   772:     // Simple conflict detection between boolean values
   788:     // Simple conflict detection logic
   841:   // Helper methods (simplified implementations)
   875:     // Simple linear trend calculation
   907:     // Simplified pattern similarity calculation
   909:     const patternMagnitude = 0.5; // Simplified reference magnitude
   925:     // Simplified expected magnitude lookup
   933:     // Simple confidence update using exponential moving average
  1005:     // Create a simple pattern based on feedback characteristics

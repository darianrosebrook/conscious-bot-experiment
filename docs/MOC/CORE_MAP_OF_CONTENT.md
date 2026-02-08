# Conscious-Bot Core Map of Content

**Author**: @darianrosebrook
**Generated**: 2026-02-07 17:02:12

This document provides a comprehensive index of modules in `packages/`, organized by category.
Each entry includes path, description, classes, functions, and staleness assessment.

## Legend

- **Staleness Levels**: `active` | `current` | `stable` | `review_needed` | `potentially_stale` | `likely_stale` | `deprecated` | `archived`
- **Score**: 0.0 (fresh) to 1.0 (definitely stale)
- Lines of code shown in parentheses

---

## LLM integration, thought processing, intent extraction, cognitive stream

### cognition/src/audit/thought-action-audit-logger.ts

**Staleness**: `active` (0.00) | **Lines**: 449 | **Modified**: 0 days ago

**Description**: Implements detailed audit logging of the thought process in the cognition module. Tracks each stage from need identification to action completion in every session.

**Classes**: `ThoughtActionAuditLogger`

**Key Functions**: `startTwoMinuteAudit`, `startQuickAudit`

---

### cognition/src/bot-state-cache.ts

**Staleness**: `active` (0.00) | **Lines**: 162 | **Modified**: 4 days ago

**Description**: state management module that maintains a versioned, time-stamped, and immutable currentState for the cognition layer, ensuring consistent access across all bot surface interactions without additional network calls.

**Key Functions**: `buildInventoryMap`, `updateBotStateCache`, `getBotStateCache`, `isCompletePosition`, `patchBotStateCache`

---

### cognition/src/cognition-state.ts

**Staleness**: `active` (0.00) | **Lines**: 40 | **Modified**: 3 days ago

**Description**: Provides and manages the mutable state for cognitive operations in the conscious-bot LLM integration. Initializes key fields such as cognitiveThoughts, spawnPosition, and ttsEnabled via createInitialState.

**Key Functions**: `createInitialState`

---

### cognition/src/cognitive-core/chat-formatting.ts

**Staleness**: `active` (0.00) | **Lines**: 115 | **Modified**: 1 days ago

**Description**: Provides text cleanup functions for chat output formatting in the cognitive module of conscious-bot. Strips protocol markers and enforces character limits without semantic analysis.

**Key Functions**: `stripProtocolMarkers`, `normalizeWhitespace`, `formatForDisplay`, `formatForChat`

---

### cognition/src/cognitive-core/context-optimizer.ts

**Staleness**: `stable` (0.20) | **Lines**: 612 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements context optimization by integrating and prioritizing memory retrieval, synthesizing relevant context across modules, and applying token and compression strategies to enhance LLM input context for efficient reasoning in the conscious-bot fr

**Classes**: `ContextOptimizer`

---

### cognition/src/cognitive-core/conversation-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 718 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Conversation flow management system. * * Manages conversation state, topic tracking, and communication style * adaptation for natural and coherent social interactions.

**Classes**: `ConversationManager`

---

### cognition/src/cognitive-core/creative-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 610 | **Modified**: 8 days ago

**Description**: Implements creative problem-solving with analogical reasoning, constraint relaxation, and solution generation using the LLM interface. Integrates domain knowledge and maintains a solution history for traceable, adaptive responses.

**Classes**: `CreativeProblemSolver`

---

### cognition/src/cognitive-core/emotional-memory-llm-adapter.ts

**Staleness**: `active` (0.00) | **Lines**: 819 | **Modified**: 8 days ago

**Description**: Contextualizes LLM responses with the bot's emotional memory and self-narrative, enhancing outputs by considering accumulated emotional experiences and identity-aware factors during reasoning. Integrates emotional state, recent experiences, and identity reinforcement into the cognitive stream.

**Classes**: `EmotionalMemoryLLMAdapter`, `if`, `close`

---

### cognition/src/cognitive-core/internal-dialogue.ts

**Staleness**: `active` (0.00) | **Lines**: 536 | **Modified**: 5 days ago

**Description**: Implements internal thought generation for consciousness-like self-reflection within the cognitive module of conscious-bot. Evaluates triggers and constructs a context-rich stream of InternalThought objects using the LLM interface.

**Classes**: `InternalDialogue`

---

### cognition/src/cognitive-core/llm-interface.ts

**Staleness**: `active` (0.00) | **Lines**: 786 | **Modified**: 0 days ago

**Description**: with a clean text interface, provides safe text preprocessing to strip guillemets and prevent prompt injection attacks in the cognitive stream.

**Classes**: `LLMInterface`

**Key Functions**: `stripGuillemets`

---

### cognition/src/cognitive-core/llm-output-reducer.ts

**Staleness**: `active` (0.00) | **Lines**: 297 | **Modified**: 1 days ago

**Description**: Implements the LLM output reduction to assemble raw LLM responses into Sterling envelopes, ensuring strict adherence to the semantic boundary by mapping errors and attaching provenance before forwarding to downstream components.

**Classes**: `ReductionError`

**Key Functions**: `isReduceError`, `hashForLogging`, `reduceRawLLMOutput`, `logReduction`, `createMockReductionResult`

---

### cognition/src/cognitive-core/memory-aware-llm.ts

**Staleness**: `stable` (0.20) | **Lines**: 902 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides a memory-aware LLM interaction layer that enables retrieval, storage, and recall of cognitive patterns during thought processing in the conscious-bot architecture.

**Classes**: `MemoryAwareLLMInterface`

---

### cognition/src/cognitive-core/reflection-engine.ts

**Staleness**: `stable` (0.20) | **Lines**: 773 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Analysis module within the cognitive architecture of conscious-bot, processes recent experiences to extract actionable insights and identify recurring patterns for intent refinement. Utilizes ExperienceAnalysis and Pattern detection to support continuous self-improvement and learning synthesis.

**Classes**: `AdvancedReflectionEngine`

---

### cognition/src/cognitive-metrics-tracker.ts

**Staleness**: `active` (0.00) | **Lines**: 74 | **Modified**: 3 days ago

**Description**: CognitiveMetricsTracker maintains and reports key performance metrics for the conscious-bot's cognitive processes. It tracks optimizations, conversations, solutions generated, violations blocked, and intrusions handled.

**Classes**: `CognitiveMetricsTracker`

---

### cognition/src/cognitive-state-tracker.ts

**Staleness**: `active` (0.00) | **Lines**: 214 | **Modified**: 3 days ago

**Description**: Implements conversation and operation logging in the cognitive-bot architecture. Maintains a set of active conversations and an array of recent operations with metrics such as cognitive load and attention level.

**Classes**: `CognitiveStateTracker`

---

### cognition/src/cognitive-stream-logger.ts

**Staleness**: `active` (0.00) | **Lines**: 200 | **Modified**: 1 days ago

**Description**: API logging service within the cognitive-bot package, forwards structured cognition events and metadata to the dashboard for real-time monitoring and analysis of the bot's thoughts and intent tracking. Handles JSON payload formatting and integrates with the cognitive stream endpoint for secure, centralized logging.

**Classes**: `CognitiveStreamLogger`

---

### cognition/src/config/llm-token-config.ts

**Staleness**: `active` (0.00) | **Lines**: 47 | **Modified**: 5 days ago

**Description**: * Recommended maxTokens and temperature per LLM call source. * Tuned for latency vs quality: lower maxTokens = faster MLX responses.

**Key Functions**: `getLLMConfig`

---

### cognition/src/constitutional-filter/constitutional-filter.ts

**Staleness**: `stable` (0.20) | **Lines**: 767 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Use LLM-generated proposals to evaluate actions, goals, and messages against constitutional rules via RulesEngine, returning compliance results and optional explanations. Implements strict, standard, and advisory enforcement levels with real-time monitoring for norm drift.

**Classes**: `ConstitutionalFilter`

---

### cognition/src/constitutional-filter/rules-database.ts

**Staleness**: `stable` (0.20) | **Lines**: 481 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: * Constitutional rules database. * * Manages the storage, retrieval, and versioning of constitutional rules * that govern agent behavior and decision-making.

**Classes**: `RulesDatabase`

**Key Functions**: `getCoreRules`

---

### cognition/src/constitutional-filter/rules-engine.ts

**Staleness**: `stable` (0.20) | **Lines**: 726 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: rules engine evaluates user actions, goals, and messages against the conscious-bot's constitutional rules and conflict resolution strategies, ensuring ethical compliance and safety; it utilizes a RulesDatabase for rule retrieval and optionally an LLM

**Classes**: `RulesEngine`

---

### cognition/src/constitutional-filter/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 299 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides type definitions for constitutional filtering rules used by the cognitive module in the conscious-bot framework for LLM command filtering and intent enforcement.

---

### cognition/src/environmental/observation-reasoner.ts

**Staleness**: `active` (0.00) | **Lines**: 455 | **Modified**: 3 days ago

**Description**: Implements a structured ObservationPayload type for the cognitive stream, integrating entity and event snapshots with spatial data for LLM input, Enables the LLM to process recent observations, optionally enriched with entity/event details,

**Classes**: `ObservationReasoner`

---

### cognition/src/environmental/saliency-reasoner.ts

**Staleness**: `active` (0.00) | **Lines**: 394 | **Modified**: 3 days ago

**Description**: Provides saliency-based reasoning over entity tracks. Maintains a cognition-side view by applying and comparing saliency deltas with existing track summaries.

**Key Functions**: `cleanupOldAwareness`, `shouldEmitAwareness`, `createSaliencyReasonerState`, `applySaliencyEnvelope`, `applyDelta`

---

### cognition/src/evals/harness/eval-orchestrator.ts

**Staleness**: `active` (0.00) | **Lines**: 507 | **Modified**: 3 days ago

**Description**: EvalOrchestrator in the cognition module orchestrates LLM-based eval runs by initializing the reasoning surface and emitting structured event payloads to track evaluation progress and results. It configures each eval session with the current state and invokes the production LF-4 code for scoring and summary extraction.

**Key Functions**: `defaultLLMGenerator`, `runEval`, `runScenario`, `buildPrompt`

---

### cognition/src/evals/harness/event-emitter.ts

**Staleness**: `active` (0.00) | **Lines**: 313 | **Modified**: 3 days ago

**Description**: Provides a TypeScript event emitter for the cognition module, logging eval run lifecycle events to events.jsonl according to the official conscious-bot schema. Ensures centralized and authoritative tracking of evaluation processes for consistency and auditability.

**Classes**: `EvalEventEmitter`

**Key Functions**: `buildSuiteLoadedPayload`, `buildSuiteInvalidPayload`, `buildProductionSurfacePayload`, `buildScenarioStartedPayload`, `buildScenarioResultPayload`

---

### cognition/src/evals/harness/frame-profiles.ts

**Staleness**: `active` (0.00) | **Lines**: 79 | **Modified**: 3 days ago

**Description**: Provides predefined frame profile configurations for the cognition module.

**Key Functions**: `getFrameProfile`, `isValidFrameProfile`, `getFrameProfileNames`, `getFrameProfileSummary`

---

### cognition/src/evals/harness/metrics-collector.ts

**Staleness**: `active` (0.00) | **Lines**: 354 | **Modified**: 3 days ago

**Description**: Implements collects and aggregates per-scenario metrics for the cognition module's evaluation harness, tracking action_taken, grounding_pass, repetition, and anchoring_ratio for each evaluation run.

**Classes**: `MetricsCollector`

**Key Functions**: `countAvailableFacts`

---

### cognition/src/evals/harness/result-bundle.ts

**Staleness**: `active` (0.00) | **Lines**: 187 | **Modified**: 3 days ago

**Description**: * Result Bundle for Eval Harness * * Creates content-addressed result bundles for eval runs. * Bundle IDs are deterministic based on content, not timestamps.

**Key Functions**: `computeBundleId`, `createResultBundle`, `generateRunId`, `buildOutputDir`

---

### cognition/src/evals/harness/sampler-profiles.ts

**Staleness**: `active` (0.00) | **Lines**: 166 | **Modified**: 3 days ago

**Description**: Provides predefined sampler profiles for the cognition module, allowing the LLM integration to select optimal generation parameters such as temperature, Top- P, and max tokens during intent extraction and cognitive stream processing.

**Key Functions**: `getSamplerProfile`, `isValidSamplerProfile`, `getSamplerProfileNames`, `getSamplerProfileSummary`, `getDefaultSamplerProfile`

---

### cognition/src/evals/harness/scenario-loader.ts

**Staleness**: `active` (0.00) | **Lines**: 262 | **Modified**: 3 days ago

**Description**: Implements scenario loading and validation for the cognition module, parsing and validating each line against an Ajv schema to ensure correct structure for the conscious-bot's intent extraction process.

**Classes**: `ScenarioLoader`

**Key Functions**: `discoverSuites`, `getSuiteId`

---

### cognition/src/evals/types.ts

**Staleness**: `active` (0.00) | **Lines**: 106 | **Modified**: 3 days ago

**Description**: Provides type definitions for evaluating the cognitive stimulus and action affordances within the conscious-bot's LLM integration layer. Defines enum and type structures for tracking event types, threat levels, and time of day states used in eval scenarios.

---

### cognition/src/event-driven-thought-generator.ts

**Staleness**: `active` (0.00) | **Lines**: 417 | **Modified**: 3 days ago

**Description**: Provides event-based triggers for the cognitive stream by analyzing BotLifecycleEvent context.

**Classes**: `EventDrivenThoughtGenerator`

---

### cognition/src/intero-history.ts

**Staleness**: `active` (0.00) | **Lines**: 155 | **Modified**: 1 days ago

**Description**: Provides a ring buffer for timestamped intero snapshots used by the cognition module to persist and retrieve the bot's recent emotional and stress state changes.

**Key Functions**: `appendLine`, `recordInteroSnapshot`, `getInteroHistory`, `loadInteroHistory`, `getInteroHistorySummary`

---

### cognition/src/interoception-store.ts

**Staleness**: `active` (0.00) | **Lines**: 220 | **Modified**: 5 days ago

**Description**: Provides an in-memory store for the bot's interoceptive state, calculating a weighted composite stress score from six axes such as healthHunger, resource, and locationDistance, ensuring values remain clamped between 0 and 100. Manages current focus and curiosity levels for the cognitive stream.

**Key Functions**: `clamp`, `computeComposite`, `makeDefaultState`, `getInteroState`, `setStressAxis`

---

### cognition/src/intrusion-interface/intrusion-interface.ts

**Staleness**: `stable` (0.20) | **Lines**: 667 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: input and validate external suggestions, parsing and classifying their content for risk assessment, then routing decisions through the cognitive pipeline for the conscious-bot's intrusion handling system.

**Classes**: `IntrusionInterface`

---

### cognition/src/intrusion-interface/intrusion-parser.ts

**Staleness**: `stable` (0.20) | **Lines**: 380 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Input and parses raw intrusion content into a structured format for the cognitive stream. Extracts intent, urgency, and context while applying configuration settings.

**Classes**: `IntrusionParser`

---

### cognition/src/intrusion-interface/taxonomy-classifier.ts

**Staleness**: `stable` (0.20) | **Lines**: 427 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: classification results are retrieved or computed from intrusion content using LLM-based intent analysis and configured taxonomies, assigning risk levels and content types for filtering decisions. The class integrates LLM reasoning with static or dynamic taxonomies to evaluate and categorize incoming intrusion messages.

**Classes**: `TaxonomyClassifier`

---

### cognition/src/intrusion-interface/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 288 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: commented as types that structure external intrusion inputs for robust filtering, risk analysis, and decision making within the conscious-bot cognition module.

---

### cognition/src/intrusive-thought-processor.ts

**Staleness**: `active` (0.00) | **Lines**: 1432 | **Modified**: 1 days ago

**Description**: Implements the conversion of intrusive thoughts into structured Task objects that the planning module uses to drive bot behavior, assigning actions, priorities, and confidence levels. Ensures each task retains a traceable thought origin and is formatted for the bot's decision-making pipeline.

**Classes**: `PlanningMCPClient`, `IntrusiveThoughtProcessor`

**Key Functions**: `buildResponseDebug`, `makeRequestId`

---

### cognition/src/keep-alive/event-types.ts

**Staleness**: `active` (0.00) | **Lines**: 208 | **Modified**: 3 days ago

**Description**: Implements keep-alive event types for tracking system health and activity within the cognitive stream. Defines standardized payload schemas for tick, thought, and status events.

**Key Functions**: `createTickEvent`, `createThoughtEvent`, `createSkipNotIdleEvent`, `createViolationEvent`

---

### cognition/src/keep-alive/idle-detector.ts

**Staleness**: `active` (0.00) | **Lines**: 187 | **Modified**: 3 days ago

**Description**: Implements idle detection for the keep-alive gate in the cognitive module of conscious-bot. Evaluates the current state to determine if the bot is idle by checking active plans, task conversions, threat level, and user command presence.

**Key Functions**: `detectIdle`, `buildIdleContext`, `estimateThreatLevel`

---

### cognition/src/keep-alive/intention-check-prompt.ts

**Staleness**: `active` (0.00) | **Lines**: 163 | **Modified**: 3 days ago

**Description**: a non-injective intention check prompt that presents the current situation without suggesting actions, prompting the model to optionally declare its intent using the [GOAL: <action> <target>] format when appropriate

**Key Functions**: `renderIntentionCheckPrompt`, `getIntentionCheckVariants`, `validateNonInjectivePrompt`

---

### cognition/src/keep-alive/keep-alive-controller.ts

**Staleness**: `active` (0.00) | **Lines**: 617 | **Modified**: 1 days ago

**Description**: Provides an idle detection pathway for the cognition module to decide when the LF-4 reasoning surface should be prompted for new goals. Implements a strict invariant that never injects goals, only presents facts and waits for model initiative.

**Classes**: `KeepAliveController`

---

### cognition/src/language-io/envelope-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 114 | **Modified**: 2 days ago

**Description**: context for constructing LanguageIOEnvelopeV1 from raw LLM output with optional metadata

**Key Functions**: `buildLanguageIOEnvelope`, `computeEnvelopeId`, `verifyEnvelopeId`

---

### cognition/src/language-io/envelope-types.ts

**Staleness**: `active` (0.00) | **Lines**: 128 | **Modified**: 2 days ago

**Description**: Provides type definitions for SanitizationFlags used in the conscious-bot cognition module to track modifications applied to user input during text processing.

**Key Functions**: `createDefaultSanitizationFlags`

---

### cognition/src/language-io/execution-gate.ts

**Staleness**: `active` (0.00) | **Lines**: 106 | **Modified**: 2 days ago

**Description**: * Execution gate for task conversion. * * This module provides the SINGLE choke point for deciding if a * reducer result can be converted to a task.

**Classes**: `ExecutionGateError`

**Key Functions**: `canConvertToTask`, `requireExecutable`, `getExecutionBlockReason`, `isSemanticEmpty`

---

### cognition/src/language-io/marker-extractor.ts

**Staleness**: `active` (0.00) | **Lines**: 69 | **Modified**: 2 days ago

**Description**: Provides verbatim extraction of [GOAL:...] markers from text as part of the conscious-bot cognition module. Returns markers with exact spans and type.

**Key Functions**: `extractVerbatimMarkers`, `countGoalTags`, `hasGoalTag`

---

### cognition/src/language-io/reducer-result-types.ts

**Staleness**: `active` (0.00) | **Lines**: 169 | **Modified**: 2 days ago

**Description**: Provides type-safety for committed goal, execution status, and optional advisory routing hints without exposing semantic details.

**Key Functions**: `isValidReducerResponse`, `parseReducerResult`

---

### cognition/src/language-io/sanitization-pipeline.ts

**Staleness**: `active` (0.00) | **Lines**: 166 | **Modified**: 2 days ago

**Description**: * Versioned sanitization pipeline for Language IO envelopes. * * This is a DETERMINISTIC, VERSIONED evidence transform - it produces * another observational surface, not canonical meaning.

**Key Functions**: `sanitize`, `stripCodeFences`, `stripThinkingBlocks`, `truncateDegeneration`, `normalizeWhitespace`

---

### cognition/src/language-io/schema-compatibility.ts

**Staleness**: `active` (0.00) | **Lines**: 103 | **Modified**: 2 days ago

**Description**: * Schema version compatibility for Language IO boundary. * * TS must fail closed on unknown versions rather than * attempting "best effort" parsing.

**Classes**: `SchemaVersionError`

**Key Functions**: `validateEnvelopeVersion`, `validateReducerResultVersion`, `validateWorldSnapshotVersion`, `isVersionSupported`

---

### cognition/src/language-io/sterling-language-io-client.ts

**Staleness**: `active` (0.00) | **Lines**: 448 | **Modified**: 1 days ago

**Description**: required to convert LLM outputs into executable planning tasks via the LanguageIOEnvelope roundtrip interface

**Classes**: `SterlingLanguageIOClient`

**Key Functions**: `getDefaultLanguageIOClient`, `setDefaultLanguageIOClient`

---

### cognition/src/language-io/transport.ts

**Staleness**: `active` (0.00) | **Lines**: 288 | **Modified**: 1 days ago

**Description**: Provides a WebSocket adapter for sending and receiving LanguageIO protocol messages between the cognition module and external LLM systems. Implements the LanguageIOReduceResponse interface to strictly forward data without semantic interpretation.

**Classes**: `SterlingTransportAdapter`, `MockLanguageIOTransport`

**Key Functions**: `getDefaultTransport`, `setDefaultTransport`

---

### cognition/src/llm-output-sanitizer.ts

**Staleness**: `active` (0.00) | **Lines**: 734 | **Modified**: 1 days ago

**Description**: output sanitization transforms user LLM responses to deobfuscate and clean evidence before forwarding to Sterling for semantic analysis.

**Key Functions**: `stripWrappingQuotes`, `stripCodeFences`, `stripSystemPromptLeaks`, `extractGoalTag`, `extractIntent`

---

### cognition/src/react-arbiter/ReActArbiter.ts

**Staleness**: `active` (0.00) | **Lines**: 612 | **Modified**: 5 days ago

**Description**: * ReAct Arbiter - Implements reason↔act loop for grounded cognition * * Orchestrates a ReAct loop that interleaves short reasoning with single tool calls; * selects goals, decides next option/skill, reads environment feedback, and iterates. * * @author @darianrosebrook

**Classes**: `ReActArbiter`

---

### cognition/src/reasoning-surface/eligibility.ts

**Staleness**: `active` (0.00) | **Lines**: 156 | **Modified**: 1 days ago

**Description**: only computes convertEligible using the current Sterling reduction provenance and checks for grounding validity before returning eligibility status

**Key Functions**: `deriveEligibility`, `assertEligibilityInvariant`

---

### cognition/src/reasoning-surface/frame-renderer.ts

**Staleness**: `active` (0.00) | **Lines**: 475 | **Modified**: 3 days ago

**Description**: Provides a structured rendering of the current situation frame for the cognition module, filtering out any goals or actions.

**Key Functions**: `renderSituationFrame`, `formatTimeOfDay`, `formatDelta`, `computeFrameDigest`, `thoughtContextToFrameContext`

---

### cognition/src/reasoning-surface/grounder.ts

**Staleness**: `active` (0.00) | **Lines**: 196 | **Modified**: 1 days ago

**Description**: * Goal Grounder — Sterling-Owned Semantic Boundary * * MIGRATION (PR4): Grounding is now Sterling-owned.

**Key Functions**: `isReductionProvenance`, `groundGoal`, `createGroundingContext`

---

### cognition/src/routes/cognitive-stream-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 507 | **Modified**: 1 days ago

**Description**: * Cognitive stream routes: lifecycle events, thought acking, task review, * recent thoughts, mark processed, and SSE streaming. * * Supports eval isolation via evalRunId filtering (AC-ISO-01, AC-ISO-02, AC-ISO-03).

**Key Functions**: `pruneThoughtQueue`, `broadcastThought`, `createCognitiveStreamRoutes`

---

### cognition/src/routes/process-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 857 | **Modified**: 3 days ago

**Description**: Provides the /process endpoint for the conscious-bot cognition module, handling intrusion detection and route-specific payloads for environmental_awareness, social_interaction, and external_chat. Implements filtering to prevent setting convertEligible: true in route handlers, ensuring safe operation.

**Key Functions**: `createProcessRoutes`

---

### cognition/src/routes/reasoning-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 135 | **Modified**: 3 days ago

**Description**: Input context is parsed and processed by the ReActArbiter to generate a reasoning step, which is returned to the client alongside the current state and timestamp. Handles ReAct-style interaction, extracting intent from inputs and integrating tools like inventory and goal stack manipulation.

**Key Functions**: `createReasoningRoutes`

---

### cognition/src/routes/reflection-generation-contract.ts

**Staleness**: `active` (0.00) | **Lines**: 247 | **Modified**: 3 days ago

**Description**: , the reflection generation contract defines the interface for capturing and processing player reflections via LLM integration in the cognition module, ensuring deterministic keys and structure while delegating text generation to the LLM and persisti

---

### cognition/src/routes/social-memory-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 144 | **Modified**: 3 days ago

**Description**: * Social memory routes: entity retrieval, search, stats, fact recording.

**Key Functions**: `createSocialMemoryRoutes`

---

### cognition/src/routes/social-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 346 | **Modified**: 3 days ago

**Description**: * Social routes: social consideration, nearby entities, chat consideration, * departure communication, social cognition processing.

**Key Functions**: `createSocialRoutes`

---

### cognition/src/routes/system-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 110 | **Modified**: 3 days ago

**Description**: Provides system-level control for thought generation in the conscious-bot cognition module. Implements start, stop, and readiness status endpoints for controlling LLM-based intent extraction and cognitive stream initialization.

**Key Functions**: `createSystemRoutes`

---

### cognition/src/routes/telemetry-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 204 | **Modified**: 3 days ago

**Description**: Provides telemetry-related endpoints for the cognitive module, enabling monitoring of system stress, spawn position, and network activity for the conscious-bot's thought processes.

**Key Functions**: `createTelemetryRoutes`

---

### cognition/src/routes/thought-routes.ts

**Staleness**: `active` (0.00) | **Lines**: 165 | **Modified**: 3 days ago

**Description**: Provides endpoints for retrieving the bot's recent thoughts via the cognitive stream, using a filtered and sorted list of thoughts from internal and external sources, and returns paginated results with timestamp metadata.

**Key Functions**: `createThoughtRoutes`

---

### cognition/src/self-model/advanced-identity-analyzer.ts

**Staleness**: `stable` (0.20) | **Lines**: 802 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: * Advanced identity analysis and evolution tracking. * * Provides sophisticated personality trait analysis, value system * tracking, and identity evolution monitoring for deep self-understanding.

**Classes**: `AdvancedIdentityAnalyzer`

---

### cognition/src/self-model/contract-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 911 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements contract-based tracking of commitments and promises within the cognitive architecture. Maintains commitment and promise state using structured contracts and enforces integrity assessment with TrustScore calculation.

**Classes**: `ContractSystem`

---

### cognition/src/self-model/identity-tracker.ts

**Staleness**: `stable` (0.20) | **Lines**: 582 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements identity aspects for tracking and updating the agent's core traits, values, and capabilities during cognitive operations. Manages a list of personality traits such as Curious, Careful, Helpful, and Persistent.

**Classes**: `IdentityTracker`

**Key Functions**: `getDefaultPersonalityTraits`, `getDefaultCoreValues`

---

### cognition/src/self-model/narrative-intelligence.ts

**Staleness**: `stable` (0.20) | **Lines**: 1048 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements narrative synthesis, experience-to-narrative integration, and thematic coherence tracking to support the cognitive stream of the conscious-bot. Utilizes StorySynthesis, ExperienceIntegration, and NarrativeCoherence components.

**Classes**: `NarrativeIntelligence`

---

### cognition/src/self-model/narrative-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 644 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements narrative integration of new experiences into the conscious-bot's identity. Maintains and updates the agent's life story by adding Experience objects as new NarrativeChapters.

**Classes**: `NarrativeManager`

---

### cognition/src/self-model/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 579 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides type definitions for identity, personality traits, and core values used by the self-model in the cognitive architecture of the conscious-bot. Defines structured models for trait consistency, value conflicts, and version tracking within the bot's reasoning process.

---

### cognition/src/server-utils/cognitive-load-calculators.ts

**Staleness**: `active` (0.00) | **Lines**: 138 | **Modified**: 3 days ago

**Description**: Implements creativity metric calculation by assessing system capacity and recent uptime, penalizing high memory usage over time, and normalizing the result to a 0–1 creativity score for the cognitive stream.

**Key Functions**: `calculateCognitiveLoad`, `calculateAttentionLevel`, `calculateCreativityLevel`, `getActiveProcessCount`, `getSystemCpuUsage`

---

### cognition/src/server-utils/constants.ts

**Staleness**: `active` (0.00) | **Lines**: 20 | **Modified**: 3 days ago

**Description**: Tries to standardize and sanitize text inputs for the LLM integration in conscious-bot's cognition module, filtering out status-like or tag-containing content from being processed as spoken thoughts. Exposes TypeScript utility constants to enforce consistent formatting and prevent miscommunication in intent extraction.

---

### cognition/src/server-utils/observation-helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 203 | **Modified**: 3 days ago

**Description**: Provides utility functions for constructing and sanitizing observation payloads for the cognitive module of conscious-bot. Implements position redaction and numerical coercion to protect sensitive spatial data during LLM processing.

**Key Functions**: `redactPositionForLog`, `coerceNumber`, `inferThreatLevel`, `buildObservationPayload`

---

### cognition/src/server-utils/server-logger.ts

**Staleness**: `active` (0.00) | **Lines**: 234 | **Modified**: 1 days ago

**Description**: Provides a tiered logging system for the cognition module, categorizing routine, lifecycle, research, and error events with color and context for the conscious-bot LLM integration. Implements automatic suppression of routine logs by default unless verbose mode is enabled.

**Key Functions**: `classifyEvent`, `shouldEmit`, `colorize`, `formatValue`, `formatFields`

---

### cognition/src/server-utils/step-generation-helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 156 | **Modified**: 3 days ago

**Description**: * Step generation helpers: LLM-based task step generation with * intelligent fallback by task type.

**Key Functions**: `generateTaskSteps`, `parseNumberedListResponse`, `generateIntelligentFallbackSteps`

---

### cognition/src/server-utils/thought-stream-helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 140 | **Modified**: 1 days ago

**Description**: Provides utility functions to send thoughts to the cognitive stream and execute the intrusion consideration step before passing messages to the LLM.

**Key Functions**: `createThoughtStreamHelpers`, `sendThoughtToCognitiveStream`, `runConsiderationStep`

---

### cognition/src/server-utils/tts-usable-content.ts

**Staleness**: `active` (0.00) | **Lines**: 87 | **Modified**: 1 days ago

**Description**: Provides a temporary wrapper for detecting code-like content in the cognitive module, replicating logic from llm-output-sanitizer. Implements isCodeLike and hasCodeLikeDensity for filtering TTS output.

**Key Functions**: `hasCodeLikeDensity`, `isUsableForTTS`

---

### cognition/src/server.ts

**Staleness**: `active` (0.00) | **Lines**: 1182 | **Modified**: 1 days ago

**Description**: Provides LLM-driven thought processing for the conscious-bot's cognitive stream. Creates and manages services for intent extraction via the LLMInterface.

**Key Functions**: `logObservation`, `resilientFetchLogged`, `drainObservationQueue`, `enqueueObservation`, `startThoughtGeneration`

---

### cognition/src/social-awareness-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 946 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements social interaction decision-making for the bot. Analyzes nearby entities and chat messages to determine if the bot should acknowledge or respond.

**Classes**: `SocialAwarenessManager`

---

### cognition/src/social-cognition/agent-modeler.ts

**Staleness**: `stable` (0.20) | **Lines**: 819 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements agent modeling by analyzing observations and extracting capabilities, personality, and behavioral patterns from other agents. Maintains up-to-date models using real-time interaction logs and adaptive inference algorithms.

**Classes**: `AgentModeler`

---

### cognition/src/social-cognition/relationship-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 1570 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: * Relationship Manager * * Tracks and manages social relationships and bonds over time. * Provides capabilities for trust calculation, bond tracking, and relationship quality assessment.

**Classes**: `RelationshipManager`

---

### cognition/src/social-cognition/social-learner.ts

**Staleness**: `stable` (0.20) | **Lines**: 1331 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a social learning mechanism for the conscious-bot to infer and adapt strategies from agent interactions. Implements observation of behavior sequences and extraction of success indicators and learning opportunities.

**Classes**: `SocialLearner`

---

### cognition/src/social-cognition/theory-of-mind-engine.ts

**Staleness**: `active` (0.00) | **Lines**: 1176 | **Modified**: 3 days ago

**Description**: Implements structured interpretation of LLM outputs for social cognition, extracting beliefs, intentions, and behaviors from agent interactions. Provides parsing of LLM responses to extract actionable intentions and mental state inferences.

**Classes**: `TheoryOfMindEngine`

**Key Functions**: `stripCodeFences`, `stripLeadingBulletIfPresent`, `extractFirstJsonValue`, `extractJson`

---

### cognition/src/social-cognition/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 937 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: agent modeling types for the social cognition module in conscious-bot, defining structures for representing agents, their relationships, and inferred mental states during social interaction processing.

---

### cognition/src/stress-axis-computer.ts

**Staleness**: `active` (0.00) | **Lines**: 287 | **Modified**: 5 days ago

**Description**: Provides real-time Minecraft world state to compute axis scores (0-100) representing safety, resources, and progress for the cognitive stream. Implements individual axis calculations such as time since events and applies smoothing via blending.

**Key Functions**: `clamp100`, `computeTime`, `computeSituational`, `computeHealthHunger`, `computeResource`

---

### cognition/src/stress-boundary-logger.ts

**Staleness**: `active` (0.00) | **Lines**: 73 | **Modified**: 5 days ago

**Description**: event handler for logging decision boundary stress metrics, including intero state and axis vectors; records entries as JSON lines in the stress log for analysis; integrates with observation, intrusion, and task selection events within the cognition 

**Key Functions**: `formatLine`, `writeToFile`, `logStressAtBoundary`

---

### cognition/src/thought-generator.ts

**Staleness**: `active` (0.00) | **Lines**: 1906 | **Modified**: 1 days ago

**Description**: from packages.cognition.src import LLMInterface, computeEligibility * Implements a deduplicator to prevent redundant thoughts during the cognitive stream generation. * Uses LLMInterface and ReductionProvenance from reasoning-surface to ensure context-aware thought filtering.

**Classes**: `ThoughtDeduplicator`, `EnhancedThoughtGenerator`

---

### cognition/src/types.ts

**Staleness**: `active` (0.00) | **Lines**: 837 | **Modified**: 1 days ago

**Description**: to define the interface for interacting with an LLM provider used by the conscious-bot cognition module for sending prompts and receiving responses

---

### cognition/vitest.config.ts

**Staleness**: `stable` (0.20) | **Lines**: 21 | **Modified**: 162 days ago

**Staleness Indicators**:
  - Not modified in 162 days (over 3 months)

**Description**: the vitest module provides configuration for unit and integration tests in the cognition package of conscious-bot, enabling robust evaluation of LLM-driven thought processing and intent extraction through structured test setup and mocks.

---

## MCP server integration

### mcp-server/src/conscious-bot-mcp-server.ts

**Staleness**: `active` (0.00) | **Lines**: 1423 | **Modified**: 5 days ago

**Description**: Contextualizes tool schemas and resource definitions for the conscious-bot's MCP server integration, enforces permissions during method calls, and manages secure, typed interactions with the Minecraft client and external registries.

**Classes**: `ConsciousBotMCPServer`

**Key Functions**: `main`

---

### mcp-server/src/demo-mcp-server.ts

**Staleness**: `stable` (0.20) | **Lines**: 93 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides a demo of the Conscious Bot MCP Server by initializing tools and resources, enabling users to observe how LLM-driven planning executes tasks using the leaves interface, and showcases integration with Minecraft through the dashboard and core 

**Key Functions**: `demoMCPServer`

---

## Minecraft client, leaves, interaction, navigation

### minecraft-interface/bin/mc-sim.ts

**Staleness**: `stable` (0.20) | **Lines**: 269 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a CLI to simulate Minecraft interactions and control the bot's actions within the conscious-bot's simulation stub, enabling testing of movement, chat, and block placement commands.

**Key Functions**: `showHelp`, `main`, `runAction`, `runDemo`, `main`

---

### minecraft-interface/bin/mc-simple.ts

**Staleness**: `stable` (0.20) | **Lines**: 213 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a lightweight CLI interface for testing direct Minecraft connectivity within the conscious-bot system. Implements host, port, username, and action command parsing for simple bot integration.

**Key Functions**: `parseArgs`, `printHelp`, `runAction`, `main`

---

### minecraft-interface/bin/mc-smoke.ts

**Staleness**: `active` (0.00) | **Lines**: 274 | **Modified**: 5 days ago

**Description**: Provides a CLI interface for running Minecraft integration smoke tests on the conscious-bot agent, invoking navigation and resource scenarios by executing preconfigured planning logic with required signals and timeouts.

**Key Functions**: `main`, `runSingleTest`, `parseArgs`, `printHelp`

---

### minecraft-interface/bin/mc-standalone.ts

**Staleness**: `stable` (0.20) | **Lines**: 335 | **Modified**: 157 days ago

**Staleness Indicators**:
  - Not modified in 157 days (over 3 months)

**Description**: Provides a lightweight CLI for directly controlling the Minecraft interface of the conscious-bot agent for component-level testing and manual interaction. Supports configuration for server host, port, and username with optional verbose logging.

**Key Functions**: `parseArgs`, `printHelp`, `runBasicScenario`, `runNavigationScenario`, `runInventoryScenario`

---

### minecraft-interface/bin/mc-viewer.ts

**Staleness**: `active` (0.00) | **Lines**: 325 | **Modified**: 3 days ago

**Description**: Provides a secure, entity-filtered viewer for the conscious-bot's Minecraft interaction layer, using Mineflayer for event handling and Prismarine-Viewer for rendering; integrates safety checks before processing game events and manages navigation via 

**Key Functions**: `createEntityFilter`, `filterEntity`, `main`

---

### minecraft-interface/scripts/mc-assets.ts

**Staleness**: `active` (0.00) | **Lines**: 266 | **Modified**: 3 days ago

**Description**: version-specific assets-extractor: Provides tools to extract textures and blockStates from Minecraft JAR files, managing the asset generation cache for the cognitive asset pipeline. * * Integrates directly with the consciousness-bot's asset management to ensure accurate and up-to-date model inputs.

**Key Functions**: `printHelp`, `formatBytes`, `formatDate`, `main`, `runExtract`

---

### minecraft-interface/src/action-contract-registry.ts

**Staleness**: `active` (0.00) | **Lines**: 222 | **Modified**: 4 days ago

**Description**: handling mappings to dynamic leaf execution by enforcing required keys and routing logic for ActionContract lookups in the Minecraft-Interface.

**Key Functions**: `resolveLeafName`, `normalizeActionParams`, `buildActionTypeToLeafMap`

---

### minecraft-interface/src/action-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 319 | **Modified**: 3 days ago

**Description**: Implements execution of high-level plans by translating them into concrete Minecraft actions using the leaf operation system. Manages plan-to-action conversion and interacts with the bot to perform specified tasks.

**Classes**: `ActionExecutor`

---

### minecraft-interface/src/action-translator-singleton.ts

**Staleness**: `active` (0.00) | **Lines**: 61 | **Modified**: 3 days ago

**Description**: Provides a globally accessible ActionTranslator instance for the bot, ensuring consistent action interpretation and response across the entire cognition workflow. Centralizes translation logic to prevent state corruption when the bot reconnects.

**Key Functions**: `registerActionTranslator`, `getActionTranslator`, `getRegisteredBot`, `clearActionTranslator`

---

### minecraft-interface/src/action-translator.ts

**Staleness**: `active` (0.00) | **Lines**: 4201 | **Modified**: 0 days ago

**Description**: Provides translation from cognitive PlanStep to concrete Minecraft actions using the mineflayer API. Implements heuristic, isEnd, hasChanged, and isValid methods for goal evaluation in the navigation context.

**Classes**: `SimpleGoalNear`, `SimpleGoalBlock`, `ActionTranslator`

**Key Functions**: `getGoals`, `deriveNavLeaseContext`, `stripReservedMeta`

---

### minecraft-interface/src/asset-pipeline/animated-material.ts

**Staleness**: `active` (0.00) | **Lines**: 930 | **Modified**: 1 days ago

**Description**: and implements a custom THREE.ShaderMaterial for animating Minecraft textures using sprite-sheet based frame mapping. It decodes animation data from lookup textures and uses a uniform for day/night cycle interpolation in the shader.

**Key Functions**: `generateAnimationTextures`, `generateFrameSequenceMap`, `generateAnimationMap`, `generateAnimationMapFromLookup`, `buildAnimationLookup`

---

### minecraft-interface/src/asset-pipeline/asset-extractor.ts

**Staleness**: `active` (0.00) | **Lines**: 557 | **Modified**: 1 days ago

**Description**: Extracts textures, blockstates, and models from Minecraft JAR files using yauzl for asynchronous ZIP handling. Processes predefined JAR paths and returns structured assets for the cognitive pipeline.

**Classes**: `AssetExtractor`

**Key Functions**: `getAssetExtractor`

---

### minecraft-interface/src/asset-pipeline/asset-server.ts

**Staleness**: `active` (0.00) | **Lines**: 504 | **Modified**: 0 days ago

**Description**: AssetServer provides versioned Minecraft texture and blockstate file serving using generated outputs, with fallback to bundled assets when requested. It manages routes for textures, blockstates, and status, ensuring only fresh or in-progress versions are distributed.

**Key Functions**: `createAssetServer`, `tryEntityFallback`, `findPvPublicDir`, `createAssetMiddleware`

---

### minecraft-interface/src/asset-pipeline/atlas-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 328 | **Modified**: 2 days ago

**Description**: Provides a missing texture generator for the Minecraft client, creating a magenta-black checkerboard placeholder on load, and integrates it into the asset pipeline for atlas generation.

**Classes**: `AtlasBuilder`

**Key Functions**: `nextPowerOfTwo`, `getAtlasBuilder`

---

### minecraft-interface/src/asset-pipeline/blockstates-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 375 | **Modified**: 3 days ago

**Description**: Implements block model and texture mapping for the renderer. Resolves model inheritance and texture UVs using provided definitions.

**Classes**: `BlockStatesBuilder`

**Key Functions**: `cleanupBlockName`, `buildBlockStates`

---

### minecraft-interface/src/asset-pipeline/entity-animations.ts

**Staleness**: `active` (0.00) | **Lines**: 845 | **Modified**: 1 days ago

**Description**: Implements bone keyframe storage and playback for entity animations in the conscious-bot viewer. Handles mapping entity movement data to appropriate animation state transitions.

**Classes**: `EntityAnimationManager`

**Key Functions**: `createAnimationClip`, `getEntityCategory`, `determineAnimationState`, `calculateAnimationSpeed`, `getAnimationManager`

---

### minecraft-interface/src/asset-pipeline/jar-downloader.ts

**Staleness**: `active` (0.00) | **Lines**: 245 | **Modified**: 3 days ago

**Description**: Downloads, verifies (if enabled), and caches Minecraft client JAR files for the specified version using local paths and SHA1 checksum validation.

**Classes**: `JarDownloader`

**Key Functions**: `getJarDownloader`

---

### minecraft-interface/src/asset-pipeline/pipeline.ts

**Staleness**: `active` (0.00) | **Lines**: 390 | **Modified**: 0 days ago

**Description**: Provides centralized orchestration of asset generation by coordinating version lookup, JAR download, extraction, atlas and blockstates creation for the conscious-bot Minecraft client modules.

**Classes**: `AssetPipeline`

**Key Functions**: `getAssetPipeline`

---

### minecraft-interface/src/asset-pipeline/types.ts

**Staleness**: `active` (0.00) | **Lines**: 470 | **Modified**: 1 days ago

**Description**: Provides type definitions for extracting and validating Minecraft JAR assets within the asset pipeline module. Implements structured parsing of Mojang version manifest data to identify asset IDs, versions, and compliance levels.

---

### minecraft-interface/src/asset-pipeline/version-resolver.ts

**Staleness**: `active` (0.00) | **Lines**: 227 | **Modified**: 3 days ago

**Description**: * Version Resolver - Fetches and parses Mojang's version manifest. * * This module handles fetching the Minecraft version manifest from Mojang's servers, * parsing version metadata, and caching results to minimize API calls.

**Classes**: `VersionResolver`

**Key Functions**: `getVersionResolver`

---

### minecraft-interface/src/asset-pipeline/viewer-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 327 | **Modified**: 3 days ago

**Description**: with the viewer integration module providing a wrapper to seamlessly switch prismarine-viewer's MeshPhongMaterial to an animated ShaderMaterial using generateAnimationMap and updateAnimatedMaterial, it enables dynamic block rendering via synchronized animation logic and supports configuration through ViewerIntegrationOptions for texture and state loading. This ensures smooth, time-aware visual updates in the Minecraft interface.

**Key Functions**: `integrateAnimatedMaterial`, `generateEmptyAnimationMap`, `updateSceneMaterials`, `fetchJSON`, `hookRenderLoop`

---

### minecraft-interface/src/automatic-safety-monitor.ts

**Staleness**: `active` (0.00) | **Lines**: 1168 | **Modified**: 1 days ago

**Description**: * Automatic Safety Monitor for Minecraft Bot * * Continuously monitors bot health and automatically responds to threats * * @author @darianrosebrook

**Classes**: `AutomaticSafetyMonitor`

---

### minecraft-interface/src/bot-adapter.ts

**Staleness**: `active` (0.00) | **Lines**: 1729 | **Modified**: 0 days ago

**Description**: Implements BotAdapter: Manages the mineflayer bot instance and its event streaming interface for the planning module. Tracks connection states and integrates with the belief bus for state updates and threat assessment.

**Classes**: `BotAdapter`, `instances`

---

### minecraft-interface/src/chat-processor.ts

**Staleness**: `active` (0.00) | **Lines**: 621 | **Modified**: 5 days ago

**Description**: Implements chat parsing, intent detection, and context-aware response generation for multi-player Minecraft interaction within the conscious-bot framework. Analyzes incoming messages to determine intent and social cues, and emits structured responses via events to the game client.

**Classes**: `ChatProcessor`

---

### minecraft-interface/src/debounce.ts

**Staleness**: `stable` (0.20) | **Lines**: 18 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides a debounce utility to smooth and limit frequent Minecraft interaction calls, preventing excessive API usage while ensuring timely input handling in the interface layer.

---

### minecraft-interface/src/entity-belief/belief-bus.ts

**Staleness**: `active` (0.00) | **Lines**: 143 | **Modified**: 5 days ago

**Description**: Provides saliency updates by ingesting EvidenceBatches and injecting TrackSet deltas into the pending buffer; ensures timely emission via forced and periodic snapshots for the entity's belief state.

**Classes**: `BeliefBus`

---

### minecraft-interface/src/entity-belief/evidence-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 135 | **Modified**: 5 days ago

**Description**: List entity observations and convert them into standardized EvidenceItem entries with bucketed spatial and kind information for deterministic tracking. Assign each coordinate to integer buckets using fixed sizes to enable spatial sorting.

**Key Functions**: `toPosBucket`, `toDistBucket`, `kindToEnum`, `evidenceSortKey`, `canonicalizeEvidence`

---

### minecraft-interface/src/entity-belief/telemetry.ts

**Staleness**: `active` (0.00) | **Lines**: 78 | **Modified**: 5 days ago

**Description**: leaves entity telemetry counters and emits signals for threat detection metrics, allowing the cognitive module to monitor and report on entity activity, confidence levels, and hazard warnings without affecting learning processes.

**Classes**: `BeliefTelemetry`

---

### minecraft-interface/src/entity-belief/track-set.ts

**Staleness**: `active` (0.00) | **Lines**: 488 | **Modified**: 5 days ago

**Description**: Provides threat classification for entity beliefs in the consciousness-bots Minecraft entity tracking system. Evaluates each entity’s current state to determine hostility and emits SaliencyDeltas for tracked entities.

**Classes**: `TrackSet`

**Key Functions**: `classifyThreat`, `generateTrackId`, `trackEntryToSummary`

---

### minecraft-interface/src/entity-belief/types.ts

**Staleness**: `active` (0.00) | **Lines**: 175 | **Modified**: 5 days ago

**Description**: Provides type definitions for entity belief state, enabling detection, tracking, and saliency event handling for all in-game entities within the Minecraft client's belief layer. Tracks entity positions using bucket-based spatial encoding and limits belief updates to saliency deltas and periodic snapshots for efficient reasoning integration.

---

### minecraft-interface/src/environmental-detector.ts

**Staleness**: `active` (0.00) | **Lines**: 754 | **Modified**: 1 days ago

**Description**: Provides real-time dimension and biome detection for the conscious-bot's navigation system.

**Classes**: `BiomeDatabase`, `DimensionDatabase`, `WeatherPredictor`, `EnvironmentalHazardDetector`, `EnvironmentalDetector`

---

### minecraft-interface/src/extensions/crafting-state-definitions.ts

**Staleness**: `stable` (0.20) | **Lines**: 573 | **Modified**: 157 days ago

**Staleness Indicators**:
  - Not modified in 157 days (over 3 months)

**Description**: Provides standardized material-check state for crafting workflows within the Minecraft interface. Enforces execution by verifying available resources before proceeding.

**Key Functions**: `createCraftingStateMachine`, `createBuildingStateMachine`, `createGatheringStateMachine`

---

### minecraft-interface/src/extensions/demo-state-machine-usage.ts

**Staleness**: `stable` (0.20) | **Lines**: 255 | **Modified**: 157 days ago

**Staleness Indicators**:
  - Not modified in 157 days (over 3 months)

**Description**: Provides a demo for integrating Mineflayer extensions with the planning system in the conscious-bot architecture.

**Key Functions**: `demoCraftingWorkflow`, `demoBuildingWorkflow`, `demoGatheringWorkflow`, `demoPlanningIntegration`, `demoEmergentBehaviorVerification`

---

### minecraft-interface/src/extensions/state-machine-wrapper.ts

**Staleness**: `active` (0.00) | **Lines**: 647 | **Modified**: 8 days ago

**Description**: Provides a structured interface for integrating Mineflayer's state machine with the conscious-bot planning system. Manages state transitions via defined rules and maintains encapsulation by letting the planner drive actions.

**Classes**: `StateMachineWrapper`

---

### minecraft-interface/src/leaves/combat-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 1155 | **Modified**: 3 days ago

**Description**: Provides a helper for threat detection by identifying the nearest hostile entity within a given radius using Mineflayer's entity data. Implements type checking and returns only valid hostile entities for combat context.

**Classes**: `AttackEntityLeaf`, `EquipWeaponLeaf`, `RetreatFromThreatLeaf`, `UseItemLeaf`, `EquipToolLeaf`

**Key Functions**: `findNearestHostile`, `isHostileEntity`, `findBestWeapon`, `isPositionSafe`

---

### minecraft-interface/src/leaves/construction-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 354 | **Modified**: 6 days ago

**Description**: * Construction Leaves - P0 stub leaves for building domain * * These leaves implement the building execution pipeline but do NOT mutate * inventory or world state. They check material presence (read-only) and * emit telemetry via `wouldConsume` / `stub: true` fields.

**Classes**: `PrepareSiteLeaf`, `BuildModuleLeaf`, `PlaceFeatureLeaf`

---

### minecraft-interface/src/leaves/container-leaves.ts

**Staleness**: `stable` (0.20) | **Lines**: 1450 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: id management and tracking for containers in the Minecraft interface, providing state for chests and other storage leaves; initializes and updates container metadata using position and window context; ensures reliable identification and lifecycle man

**Classes**: `ContainerManager`, `OpenContainerLeaf`, `TransferItemsLeaf`, `CloseContainerLeaf`, `InventoryManagementLeaf`

**Key Functions**: `calculateItemValues`, `analyzeCraftingOpportunities`, `optimizeStorageLayout`, `sortInventoryItems`, `compactInventoryStacks`

---

### minecraft-interface/src/leaves/crafting-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 1069 | **Modified**: 4 days ago

**Description**: Provides localized crafting, smelting, and inventory operations for leaves within the conscious-bot Minecraft interface. Implements recipe checks and placement logic with radius-based search and nearby workstation tracking.

**Classes**: `CraftRecipeLeaf`, `SmeltLeaf`, `PlaceWorkstationLeaf`, `IntrospectRecipeLeaf`

**Key Functions**: `countByName`, `findNearestBlock`, `countNearbyBlocks`, `parsePlaceAction`, `isStandableAdjacent`

---

### minecraft-interface/src/leaves/farming-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 1031 | **Modified**: 5 days ago

**Description**: Provides functions to detect and manage crop and farmland interactions in the Minecraft world using the Mineflayer API and Vec3 for spatial checks. Implements harvesting, tilling, and farm state validation for supported crop and soil types.

**Classes**: `TillSoilLeaf`, `PlantCropLeaf`, `HarvestCropLeaf`, `ManageFarmLeaf`

**Key Functions**: `isHarvestableCrop`, `isTillableSoil`, `isFarmland`, `getCropAge`, `isCropReady`

---

### minecraft-interface/src/leaves/interaction-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 2209 | **Modified**: 0 days ago

**Description**: Provides primitive leaves for Mineflayer-based interaction, including block placement and digging operations with safety guards and context-aware execution. Integrates the mineflayer-pathfinder module for pathfinding capabilities.

**Classes**: `SimpleGoalNear`, `PlaceTorchIfNeededLeaf`, `RetreatAndBlockLeaf`, `DigBlockLeaf`, `AcquireMaterialLeaf` (+5 more)

---

### minecraft-interface/src/leaves/movement-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 833 | **Modified**: 2 days ago

**Description**: Provides leaf movement commands for the conscious-bot Minecraft client, using the mineflayer-pathfinder module to implement pathfinding, movement execution, and safe navigation with timeout and error handling.

**Classes**: `MoveToLeaf`, `StepForwardSafelyLeaf`, `FollowEntityLeaf`, `SterlingNavigateLeaf`

**Key Functions**: `ok`, `fail`

---

### minecraft-interface/src/leaves/sensing-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 817 | **Modified**: 5 days ago

**Description**: Implements detection of hostile entities within a configurable radius using Bot's sensors.

**Classes**: `SenseHostilesLeaf`, `ChatLeaf`, `WaitLeaf`, `GetLightLevelLeaf`, `FindResourceLeaf`

---

### minecraft-interface/src/leaves/world-interaction-leaves.ts

**Staleness**: `active` (0.00) | **Lines**: 1454 | **Modified**: 5 days ago

**Description**: Provides block interaction detection for redstone components, doors, and trapdoors using the LeafImpl interface in the consciousness-bot Minecraft leaves module. Implements methods to identify and interact with redstone devices and structural entry points.

**Classes**: `InteractWithBlockLeaf`, `OperatePistonLeaf`, `ControlRedstoneLeaf`, `BuildStructureLeaf`, `EnvironmentalControlLeaf`

**Key Functions**: `isRedstoneComponent`, `isDoor`, `isInteractable`, `isContainer`, `isPiston`

---

### minecraft-interface/src/long-journey-navigator.ts

**Staleness**: `active` (0.00) | **Lines**: 866 | **Modified**: 8 days ago

**Description**: Provides chunk-based journey planning and dynamic waypoint management for long-distance navigation in the conscious-bot system. Implements multi-stage route computation, risk-aware path selection, and integrates real-time Minecraft observations for adaptive replanning.

**Classes**: `LongJourneyNavigator`

---

### minecraft-interface/src/memory-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 251 | **Modified**: 2 days ago

**Description**: Implements memory namespace activation for the current Minecraft world and synchronizes context with the memory system. Maintains a world-specific session ID and server connection details.

**Classes**: `MemoryIntegrationService`

---

### minecraft-interface/src/navigation-bridge.ts

**Staleness**: `active` (0.00) | **Lines**: 1952 | **Modified**: 1 days ago

**Description**: LitePathPlanner integrates D* Lite pathfinding with Mineflayer actions to compute efficient, obstacle-aware navigation within the Minecraft world state

**Classes**: `MockNavigationSystem`, `NavigationBridge`, `TerrainAnalyzer`, `DynamicReconfigurator`

---

### minecraft-interface/src/navigation-lease-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 164 | **Modified**: 3 days ago

**Description**: Implements a ref-counted mutual-exclusion lock for controlling pathfinder navigation access in the conscious-bot Minecraft interface. Maintains lease state, handles priority ranking, and invokes the onPreempt callback during emergency preemption.

**Classes**: `NavigationLeaseManager`

---

### minecraft-interface/src/neural-terrain-predictor.ts

**Staleness**: `active` (0.00) | **Lines**: 794 | **Modified**: 8 days ago

**Description**: Layered terrain analysis engine that predicts walkability, hazards, and resource locations using a configurable neural network model. Implements real-time feature extraction from Minecraft world data and provides confidence scores for each prediction.

**Classes**: `NeuralNetwork`, `TerrainPatternRecognizer`, `PredictivePathfinder`, `SocialLearningSystem`, `NeuralTerrainPredictor`

---

### minecraft-interface/src/observation-mapper.ts

**Staleness**: `active` (0.00) | **Lines**: 701 | **Modified**: 5 days ago

**Description**: Contextualizes bot's perception data by transforming mineflayer events into PlanningContext worldState representations suitable for cognitive planning. Extracts key game state from Bot and delegates sensor data processing via the signal processor.

**Classes**: `ObservationMapper`

---

### minecraft-interface/src/plan-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 946 | **Modified**: 3 days ago

**Description**: step executions in Minecraft using the BotAdapter and ObservationMapper, translating high-level plans into actions, and managing state via the StateMachineWrapper to ensure safe and adaptive task completion

**Classes**: `PlanExecutor`

---

### minecraft-interface/src/reflex/reflex-arbitrator.ts

**Staleness**: `active` (0.00) | **Lines**: 114 | **Modified**: 5 days ago

**Description**: Implements reflex priority management during N-tick events for the conscious-bot Minecraft interface. Triggers reflex override, pauses the planner, and emits typed ReflexEvent to indicate mode changes.

**Classes**: `ReflexArbitrator`

---

### minecraft-interface/src/reflex/reflex-safety.ts

**Staleness**: `active` (0.00) | **Lines**: 83 | **Modified**: 5 days ago

**Description**: State machine for real-time threat assessment in the reflex layer. Processes TrackSet snapshots, classifies threats via TrackSummary, and returns appropriate safety actions without LLM or cognition involvement.

**Key Functions**: `assessReflexThreats`, `toExecutionSnapshot`

---

### minecraft-interface/src/server.ts

**Staleness**: `active` (0.00) | **Lines**: 3056 | **Modified**: 0 days ago

**Description**: Provides leaf handlers for real-time Minecraft interaction via HTTP endpoints. Implements movement, digging, and resource-handling logic for the bot's in-game actions.

**Classes**: `WebSocketStateTracker`

**Key Functions**: `startObservationBroadcast`, `tryStartObservationBroadcast`, `stopObservationBroadcast`, `broadcastBotStateUpdate`, `setupBotStateWebSocket`

---

### minecraft-interface/src/signal-processor.ts

**Staleness**: `active` (0.00) | **Lines**: 1103 | **Modified**: 8 days ago

**Description**: Implements conversion of Minecraft world state into high-level signals for the planning module. Processes health, hunger, fatigue, and threat data to detect homeostasis needs.

**Classes**: `MinecraftSignalProcessor`

**Key Functions**: `createMinecraftSignalProcessor`

---

### minecraft-interface/src/simulation-stub.ts

**Staleness**: `stable` (0.20) | **Lines**: 448 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a simulated Minecraft environment for the bot's interface testing. Exposes core methods such as player movement, entity interaction, and block access to the simulation.

**Classes**: `SimulatedMinecraftInterface`

**Key Functions**: `createSimulatedMinecraftInterface`

---

### minecraft-interface/src/skill-composer/skill-composer.ts

**Staleness**: `stable` (0.20) | **Lines**: 1133 | **Modified**: 157 days ago

**Staleness Indicators**:
  - Not modified in 157 days (over 3 months)

**Description**: parameters and returns a composable skill for the bot's execution. It assembles selected leaves into a structured behavior with input/output type mappings, execution order, and complexity estimation.

**Classes**: `SkillComposer`

---

### minecraft-interface/src/standalone-simple.ts

**Staleness**: `active` (0.00) | **Lines**: 1210 | **Modified**: 8 days ago

**Description**: State updates the bot's position and inventory tracking in the Minecraft world, handling basic user input via SimpleAction, and emits events as part of the cognitive processing pipeline in the conscious-bot architecture.

**Classes**: `SimpleMinecraftInterface`

**Key Functions**: `createSimpleMinecraftInterface`

---

### minecraft-interface/src/standalone.ts

**Staleness**: `active` (0.00) | **Lines**: 224 | **Modified**: 3 days ago

**Description**: Implements real-time Minecraft server connection and basic interaction for the conscious-bot framework. Initializes and manages the BotAdapter, ObservationMapper, and ActionTranslator components.

**Classes**: `StandaloneMinecraftInterface`

**Key Functions**: `createStandaloneMinecraftInterface`

---

### minecraft-interface/src/startup-barrier.ts

**Staleness**: `active` (0.00) | **Lines**: 234 | **Modified**: 1 days ago

**Description**: Provides a startup barrier for the minecraft-interface module, blocking main processing until all required services report ready. Tracks which services are available and waits for the BeliefBus, cognition emission, and observation broadcast to initialize.

**Key Functions**: `isSystemReady`, `isFullyReady`, `getSystemReadyState`, `getReadyServiceCount`, `getExpectedServiceCount`

---

### minecraft-interface/src/threat-perception-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 345 | **Modified**: 5 days ago

**Description**: Implements threat perception for the conscious-bot's Minecraft client by detecting entities via raycasting and line-of-sight checks. Maintains a persistent threat map and enforces configurable sensing limits to prevent omniscient behavior.

**Classes**: `ThreatPerceptionManager`

---

### minecraft-interface/src/types.ts

**Staleness**: `active` (0.00) | **Lines**: 480 | **Modified**: 3 days ago

**Description**: Step 1: Defines TypeScript types for the conscious-bot's Minecraft navigation and hazard awareness modules. Step 2: Provides configuration types for movement costs, path optimization, and environmental factors like lava, mobs, and water.

---

### minecraft-interface/src/utils.ts

**Staleness**: `active` (0.00) | **Lines**: 163 | **Modified**: 3 days ago

**Description**: Provides utilities for validating and preparing the bot's Minecraft connection settings. Implements default and partial configuration merging with strict parameter checks.

**Key Functions**: `createDefaultBotConfig`, `validateBotConfig`, `parseBotConfigFromArgs`, `formatTelemetryOutput`, `createPerformanceSummary`

---

### minecraft-interface/src/viewer-enhancements.ts

**Staleness**: `active` (0.00) | **Lines**: 444 | **Modified**: 1 days ago

**Description**: Provides advanced entity animation and lighting rendering for the prismarine viewer in conscious-bot's Minecraft interface. Implements skeletal walk cycle, movement interpolation, and real-time lighting updates.

**Classes**: `that`, `EnhancedViewer`

**Key Functions**: `createEnhancedViewer`, `applyViewerEnhancements`

---

### minecraft-interface/src/water-navigation-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 818 | **Modified**: 6 days ago

**Description**: Provides water navigation logic for the conscious-bot by assessing buoyancy and current conditions, selecting optimal movement strategies, and calculating safe paths for the agent.

**Classes**: `WaterNavigationManager`

---

## Next.js dashboard, viewer HUD

### dashboard/src/App.tsx

**Staleness**: `active` (0.00) | **Lines**: 12 | **Modified**: 3 days ago

**Description**: component dashboard-app provides the UI context for the dashboard, rendering the main viewer HUD and enabling secure access to the conscious-bot's current status and outputs via the DashboardProvider.

**Key Functions**: `App`

---

### dashboard/src/components/Dashboard.tsx

**Staleness**: `active` (0.00) | **Lines**: 1377 | **Modified**: 0 days ago

**Description**: Mode presents the real-time status and controls of the Conscious Bot's dashboard, integrating key state hooks and UI components for task, memory, and world monitoring.

**Key Functions**: `isStatusOrEnvironmental`, `Dashboard`

---

### dashboard/src/components/database-panel.tsx

**Staleness**: `active` (0.00) | **Lines**: 1024 | **Modified**: 3 days ago

**Description**: from the dashboard module, provides a collapsible section wrapper for displaying and hiding the database panel, using React state and hooks for toggle behavior, and integrates visual components for enhanced user interaction with the bot's database st

**Key Functions**: `CollapsibleSection`, `DatabasePanel`

---

### dashboard/src/components/embedding-viz-canvas.tsx

**Staleness**: `active` (0.00) | **Lines**: 461 | **Modified**: 3 days ago

**Description**: Provides 3D embedding visualization for the dashboard; renders points with color-coded memory types using a custom WebGL component; exposes click and select event handlers for interactive exploration.

**Classes**: `as`, `EmbeddingVizElement`

**Key Functions**: `EmbeddingVizCanvas`

---

### dashboard/src/components/embedding-viz-panel.tsx

**Staleness**: `active` (0.00) | **Lines**: 268 | **Modified**: 3 days ago

**Description**: Provides a 3D embedding visualization panel for the dashboard. Implements interactive scatter chart rendering with loading states and color coding by memory type.

**Key Functions**: `LoadingFallback`, `EmbeddingVizPanel`

---

### dashboard/src/components/empty-state.tsx

**Staleness**: `active` (0.00) | **Lines**: 35 | **Modified**: 3 days ago

**Description**: the dashboard's EmptyState module implements a minimal UI component for rendering no-data placeholders in the conscious-bot viewer HUD, requiring an icon, title, and description, and optionally an action label to indicate absence of content

**Key Functions**: `EmptyState`

---

### dashboard/src/components/evaluation-panel.tsx

**Staleness**: `active` (0.00) | **Lines**: 322 | **Modified**: 3 days ago

**Description**: metrics visualization component for the conscious-bot dashboard that dynamically renders evaluation results, alert status, and performance statistics using Lucide React charts and status indicators

**Key Functions**: `EvaluationPanel`

---

### dashboard/src/components/evaluation-tab.tsx

**Staleness**: `active` (0.00) | **Lines**: 379 | **Modified**: 1 days ago

**Description**: Provides the evaluation tab UI for the conscious-bot dashboard. Displays current task performance, decision quality metrics, system health status, and a timeline of recent activity.

**Key Functions**: `EvaluationTab`

---

### dashboard/src/components/hud-meter.tsx

**Staleness**: `active` (0.00) | **Lines**: 46 | **Modified**: 3 days ago

**Description**: Provides styled components for easy integration into the viewer HUD.

**Key Functions**: `HudMeter`

---

### dashboard/src/components/intero-current-snapshot.tsx

**Staleness**: `active` (0.00) | **Lines**: 105 | **Modified**: 3 days ago

**Description**: * Intero Current Snapshot * * Compact display of the current interoceptive state: * six horizontal bars (one per stress axis), three headline numbers * (composite stress, focus, curiosity), and an emotional state badge. * * @author @darianrosebrook

**Key Functions**: `InteroCurrentSnapshot`

---

### dashboard/src/components/intero-timeline-chart.tsx

**Staleness**: `active` (0.00) | **Lines**: 306 | **Modified**: 3 days ago

**Description**: Provides a multi-line SVG timeline for the conscious-bot dashboard. Implements axis coloring and dynamically renders stress metrics from InteroSnapshot data.

**Key Functions**: `formatTimeLabel`, `InteroTimelineChart`

---

### dashboard/src/components/inventory-display.tsx

**Staleness**: `active` (0.00) | **Lines**: 200 | **Modified**: 2 days ago

**Description**: ;Provides a React component for rendering the conscious-bot's main inventory (slots 9–44) with item details and display logic. Implements display state, item rendering using sprites and metadata, and integrates with the ViewerHudOverlay for the hotbar (slots 0–8).

**Key Functions**: `SlotCell`

---

### dashboard/src/components/pill.tsx

**Staleness**: `active` (0.00) | **Lines**: 36 | **Modified**: 3 days ago

**Description**: , The dashboard's Pill component renders labeled or tagged metadata as clickable visual indicators within the viewer HUD, supporting multiple variants for visual distinction. It is designed to cleanly display and highlight important information such as task sources or thought types.

**Key Functions**: `Pill`

---

### dashboard/src/components/section.tsx

**Staleness**: `active` (0.00) | **Lines**: 54 | **Modified**: 3 days ago

**Description**: Implements a reusable section for organizing dashboard content in the conscious-bot dashboard Provides a structured layout with header and content wrappers Enforces consistent visual styling across all panel sections

**Key Functions**: `Section`

---

### dashboard/src/components/sparkline-chart.tsx

**Staleness**: `active` (0.00) | **Lines**: 126 | **Modified**: 3 days ago

**Description**: * Sparkline Chart * * Tiny reusable SVG sparkline for a single metric over time. * Filled area polygon + polyline stroke + current-value dot.

**Key Functions**: `SparklineChart`

---

### dashboard/src/components/stress-hex-heatmap.tsx

**Staleness**: `active` (0.00) | **Lines**: 338 | **Modified**: 3 days ago

**Description**: Provides a hexagonal heatmap to visually display the bot's current stress levels, mapping each axis to Time, Situational, Health/Hunger, Resource, Protection, or Location via user-defined mapping. Uses a grid of hexagons where the center represents minimal stress and edges indicate increasing stress, with customizable axis labels and dynamic data binding.

**Key Functions**: `hexRing`, `hexSpiral`, `axialToPixel`, `hexPath`, `dominantAxisIndex`

---

### dashboard/src/components/ui/button.tsx

**Staleness**: `active` (0.00) | **Lines**: 51 | **Modified**: 3 days ago

**Description**: from the conscious-bot dashboard module, the Button component implements interactive controls using React and Radix UI, exposing styled and variant props via the buttonVariants type, enabling consistent button appearance and behavior across the viewer HUD. It forwards the button as a Slot when used as a child, allowing flexible layout composition.

---

### dashboard/src/components/ui/card.tsx

**Staleness**: `active` (0.00) | **Lines**: 74 | **Modified**: 3 days ago

**Description**: Provides a customizable React component for displaying structured dashboard information, using forwardRef for sub-components such as CardHeader, CardDescription, and CardContent, each styled and named appropriately for separation of concerns in the c

---

### dashboard/src/components/ui/progress.tsx

**Staleness**: `active` (0.00) | **Lines**: 24 | **Modified**: 4 days ago

**Description**: Module implementation.

---

### dashboard/src/components/ui/scroll-area.tsx

**Staleness**: `active` (0.00) | **Lines**: 45 | **Modified**: 3 days ago

**Description**: Provides a customizable scroll area component for the conscious-bot dashboard UI, rendering a ScrollAreaPrimitive.Root that contains the viewport for content and integrates ScrollBar and Corner visuals. Exposes React props for orientation and styling, enabling consistent HUD navigation elements in the viewer interface.

---

### dashboard/src/components/ui/tabs.tsx

**Staleness**: `active` (0.00) | **Lines**: 45 | **Modified**: 3 days ago

**Description**: Component provides customizable tabs for the conscious-bot dashboard UI, managing list and content components for navigation and rendering. It integrates with React and Radix UI to enable tab switching and visual layout.

---

### dashboard/src/components/ui/toast.tsx

**Staleness**: `active` (0.00) | **Lines**: 117 | **Modified**: 3 days ago

**Description**: Provides a customizable toast notification component for the conscious-bot dashboard UI, implementing variant styling via ClassVarianceAuthority and wrapping the React ToastPrimitives Root. Exposes props for variant selection and integrates with the dashboard's component system for consistent visual feedback.

---

### dashboard/src/components/ui/toaster.tsx

**Staleness**: `active` (0.00) | **Lines**: 34 | **Modified**: 3 days ago

**Description**: asts the user interface for the conscious-bot dashboard, rendering multiple toast notifications with titles, descriptions, and actions using the Toast component and event handlers. It manages the display of toasts and provides a close mechanism for each toast instance.

**Key Functions**: `Toaster`

---

### dashboard/src/components/ui/tooltip.tsx

**Staleness**: `active` (0.00) | **Lines**: 53 | **Modified**: 3 days ago

**Description**: Provides a styled tooltip UI for the conscious-bot dashboard. Implements a provider and child components using Radix UI TooltipPrimitive.

**Key Functions**: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`

---

### dashboard/src/components/valuation-panel.tsx

**Staleness**: `active` (0.00) | **Lines**: 568 | **Modified**: 3 days ago

**Description**: <br>Provides a UI for rendering real-time valuation decisions in the dashboard's observability layer.<br>Processes incoming SSE events and transforms them into ValuationDashboardRecord objects.<br>Displays key metrics, decision logs, and failure anal

**Key Functions**: `formatTime`, `truncateId`, `transformEvent`, `CollapsibleSection`, `ValuationPanel`

---

### dashboard/src/components/viewer-hud-overlay.tsx

**Staleness**: `active` (0.00) | **Lines**: 244 | **Modified**: 4 days ago

**Description**: * Minecraft-style HUD overlay for the prismarine viewer.

**Key Functions**: `getHotbarItemSprite`, `getHotbarItemName`, `getHeartSprite`, `getFoodSprite`, `getArmorSprite`

---

### dashboard/src/config.ts

**Staleness**: `active` (0.00) | **Lines**: 290 | **Modified**: 3 days ago

**Description**: Provides centralized configuration for the conscious-bot dashboard components. Defines service endpoints for Minecraft, cognition, memory, planning, and world modules.

**Classes**: `ServiceDiscovery`

---

### dashboard/src/contexts/dashboard-context.tsx

**Staleness**: `active` (0.00) | **Lines**: 715 | **Modified**: 1 days ago

**Description**: Provides shared context data for dashboard components by exposing access to service endpoints, world, and configuration state used across the viewer HUD and related UI layers.

**Classes**: `ApiClient`, `ServiceDiscovery`

**Key Functions**: `DashboardProvider`, `useDashboardContext`

---

### dashboard/src/hooks/use-api.ts

**Staleness**: `active` (0.00) | **Lines**: 124 | **Modified**: 3 days ago

**Description**: Provides an API hook for dashboard components in the conscious-bot project, enabling HTTP requests with configurable methods, headers, and timeouts for the Next.js viewer HUD. Manages API calls using React memoization for performance and safety.

**Key Functions**: `useApi`

---

### dashboard/src/hooks/use-bot-state-sse.ts

**Staleness**: `active` (0.00) | **Lines**: 72 | **Modified**: 3 days ago

**Description**: Provides a SSE-based hook to receive and filter bot state updates from the dashboard for the Minecraft HUD. Implements a fallback stream when the main WebSocket is disconnected, ensuring continuous display of bot status.

**Key Functions**: `useBotStateSSE`

---

### dashboard/src/hooks/use-cognitive-stream.ts

**Staleness**: `active` (0.00) | **Lines**: 337 | **Modified**: 0 days ago

**Description**: Provides a real-time SSE interface to receive and emit cognitive stream messages from the conscious-bot's LLM integration, manages thought events, and offers hooks for sending intrusive thoughts with tags and strengths.

**Key Functions**: `mapThoughtType`, `mapAttribution`, `useCognitiveStream`

---

### dashboard/src/hooks/use-initial-data-fetch.ts

**Staleness**: `active` (0.00) | **Lines**: 251 | **Modified**: 0 days ago

**Description**: Data fetches the initial state for the dashboard, synchronizing tasks, planner data, world environment, inventory, and bot state via the connection hooks. It triggers a single-time API requests to the bot and services, normalizes the task response, and ensures immediate HUD hydration with up-to-date information.

**Key Functions**: `useInitialDataFetch`

---

### dashboard/src/hooks/use-periodic-refresh.ts

**Staleness**: `active` (0.00) | **Lines**: 372 | **Modified**: 0 days ago

**Description**: Provides periodic state refresh for the dashboard by polling the bot's inventory, thoughts, events, and memory, and updates these via the useDashboardStore hooks.

**Key Functions**: `usePeriodicRefresh`

---

### dashboard/src/hooks/use-sse.ts

**Staleness**: `active` (0.00) | **Lines**: 247 | **Modified**: 3 days ago

**Description**: Provides a robust Server-Sent Events (SSE) hook with exponential reconnection and global connection deduplication for real-time data streaming in the conscious-bot dashboard components. Manages connection lifecycle events via onMessage, onOpen, onClose, and onError.

**Key Functions**: `useSSE`

---

### dashboard/src/hooks/use-task-stream.ts

**Staleness**: `active` (0.00) | **Lines**: 126 | **Modified**: 1 days ago

**Description**: Provides real-time task updates to the dashboard via SSE and handles fallback polling for missed events. Manages task state using setTasks and setTasksFallback hooks.

**Key Functions**: `useTaskStream`

---

### dashboard/src/hooks/use-toast.ts

**Staleness**: `active` (0.00) | **Lines**: 189 | **Modified**: 3 days ago

**Description**: Implements toast management for the Next.js dashboard UI by dispatching actions to add, update, dismiss, or remove toast notifications, maintaining a state of active toasts, and handling timed removals with a queue and Map.

**Key Functions**: `genId`, `dispatch`, `toast`, `useToast`

---

### dashboard/src/hooks/use-viewer.ts

**Staleness**: `active` (0.00) | **Lines**: 239 | **Modified**: 3 days ago

**Description**: Provides viewer state management for the dashboard component using React hooks. Manages viewer start/stop logic, status updates, and prevents unnecessary re-renders.

**Key Functions**: `useViewer`

---

### dashboard/src/hooks/use-ws-bot-state.ts

**Staleness**: `active` (0.00) | **Lines**: 461 | **Modified**: 0 days ago

**Description**: Provides real-time bot state via WebSocket from the minecraft-interface, offering current position, inventory, and connection status updates to the dashboard.

**Key Functions**: `useWsBotState`

---

### dashboard/src/hooks/useWebSocket.ts

**Staleness**: `active` (0.00) | **Lines**: 225 | **Modified**: 3 days ago

**Description**: Provides a real-time WebSocket connection for the dashboard to receive and display the bot's current Minecraft state updates. Handles reconnect logic with configurable intervals and attempts.

**Key Functions**: `useWebSocket`

---

### dashboard/src/lib/message-parser.ts

**Staleness**: `active` (0.00) | **Lines**: 276 | **Modified**: 3 days ago

**Description**: typescript message parser in the dashboard that translates planner actions into user-friendly task descriptions for the viewer HUD

**Key Functions**: `parsePlannerAction`, `parseTaskDescription`, `parseStepDescription`, `parseGoalDescription`, `parseCurrentAction`

---

### dashboard/src/lib/minecraft-assets.ts

**Staleness**: `active` (0.00) | **Lines**: 544 | **Modified**: 3 days ago

**Description**: Provides reliable Minecraft item sprite URLs for the dashboard rendering layer by prioritizing the Wiki data source and falling back to PrismarineJS JSON.

**Key Functions**: `getItemSpriteUrl`, `getWikiSpritePath`, `getItemDisplayName`, `getItemCategory`, `getFallbackSprite`

---

### dashboard/src/lib/minecraft-sprites.ts

**Staleness**: `active` (0.00) | **Lines**: 28 | **Modified**: 3 days ago

**Description**: Provides utility functions to retrieve Minecraft item sprite resources from the local file system, ensuring consistent visual representation for the dashboard viewer HUD.

**Key Functions**: `getItemSprite`, `getFallbackSprite`

---

### dashboard/src/lib/mineflayer-item-mapping.ts

**Staleness**: `active` (0.00) | **Lines**: 848 | **Modified**: 3 days ago

**Description**: * Mineflayer Item Mapping * * Maps Mineflayer item types to our sprite system. * Mineflayer uses different item IDs than the legacy mapping.

**Key Functions**: `getMineflayerItemSprite`, `getMineflayerItemDisplayName`

---

### dashboard/src/lib/resilient-fetch.ts

**Staleness**: `active` (0.00) | **Lines**: 95 | **Modified**: 3 days ago

**Description**: Provides a resilient HTTP client for dashboard fetches, retrying failed requests with exponential backoff and supporting hot-reloadability for external services. Manages transient errors such as ECONNREFUSED and ensures reliable data retrieval for the conscious-bot HUD.

**Key Functions**: `isTransientError`, `sleep`, `resilientFetch`

---

### dashboard/src/lib/task-normalize.ts

**Staleness**: `active` (0.00) | **Lines**: 19 | **Modified**: 1 days ago

**Description**: action normalizeTasksResponse processes and flattens task data from the dashboard interface, converting complex or nested responses into a coherent list of Task objects for the viewer HUD display

**Key Functions**: `normalizeTasksResponse`

---

### dashboard/src/lib/task-utils.ts

**Staleness**: `active` (0.00) | **Lines**: 81 | **Modified**: 3 days ago

**Description**: Provides utility functions to convert the bot's internal planning task representations into the dashboard's Task format. Maps planner, goal, and requirement types to the appropriate Task properties using a strict structure.

**Key Functions**: `mapPlanningTaskToDashboard`

---

### dashboard/src/lib/text-utils.ts

**Staleness**: `active` (0.00) | **Lines**: 81 | **Modified**: 3 days ago

**Description**: Provides wrapper sentence detection and text cleaning utilities essential for rendering the dashboard's viewer HUD. Implements functions to strip planner-specific goal tags and normalize whitespace for display.

**Key Functions**: `stripGoalTags`, `cleanDisplayText`, `parseGoalTags`, `goalToLabel`

---

### dashboard/src/lib/utils.ts

**Staleness**: `active` (0.00) | **Lines**: 137 | **Modified**: 3 days ago

**Description**: Only logs when VITE_DEBUG_DASHBOARD=1 to reduce browser console noise

**Classes**: `string`, `for`, `based`

**Key Functions**: `debugLog`, `cn`, `formatTime`, `formatRelativeTime`, `getHudColor`

---

### dashboard/src/main.tsx

**Staleness**: `active` (0.00) | **Lines**: 5 | **Modified**: 3 days ago

**Description**: , the dashboard module provides a React-based user interface for visualizing and interacting with the conscious-bot's current state and planned actions. It renders the main component that displays the HUD, allowing users to monitor and control the bot's activities through the dashboard.

---

### dashboard/src/stores/dashboard-store.ts

**Staleness**: `active` (0.00) | **Lines**: 526 | **Modified**: 0 days ago

**Description**: DataStore for the dashboard component in the conscious-bot monorepo; manages state for live status, HUD data, thoughts, tasks, events, memories, notes, environment, screenshot, and session; provides methods to set, add, update, and retrieve these ent

---

### dashboard/vite.config.ts

**Staleness**: `active` (0.00) | **Lines**: 186 | **Modified**: 1 days ago

**Description**: Provides Vite configuration for the dashboard, mapping API routes to the conscious-bot's memory service for efficient data visualization and access.

---

## P03/P21 conformance suites

### testkits/src/capability-proof-manifest.ts

**Staleness**: `active` (0.00) | **Lines**: 124 | **Modified**: 5 days ago

**Description**: Provides the invariant evidence structure required by P21 conformance suites, enabling consistent certification across primitives. Manages invariant metadata, status, and dependency tracking for runtime verification.

---

### testkits/src/p03/p03-conformance-suite.ts

**Staleness**: `active` (0.00) | **Lines**: 398 | **Modified**: 5 days ago

**Description**: Provides parameterized tests for the P03TemporalAdapter ensuring invariant compliance in the conscious-bot planning module. Verifies each temporal invariant using a configurable state and adapter.

**Key Functions**: `runP03ConformanceSuite`

---

### testkits/src/p21/helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 44 | **Modified**: 5 days ago

**Description**: * P21 Conformance Suite — Shared Helpers * * Extracted from the original conformance suite to be reused * by both P21-A and P21-B conformance factories.

**Classes**: `label`

**Key Functions**: `makeItem`, `batch`, `riskOrd`, `firstRiskClass`

---

### testkits/src/p21/invariant-ids.ts

**Staleness**: `active` (0.00) | **Lines**: 28 | **Modified**: 5 days ago

**Description**: ID canonicalization and validation for P21A and P21B invariants, ensuring the correct mapping between proof-manifest and defined constants in test kits.

---

### testkits/src/p21/manifest-helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 172 | **Modified**: 5 days ago

**Description**: * Overwrite execution-facing fields on the manifest using the run-handle * as the source of truth. The generator only knows certification status * (proven/partial/not_started from surfaceResults); this function fills * in the execution reality (which invariants actually ran and failed).

**Key Functions**: `createSurfaceResultsFromHandle`, `patchExecutionResults`, `assertManifestTruthfulness`, `finalizeManifest`

---

### testkits/src/p21/p21a-conformance-suite.ts

**Staleness**: `active` (0.00) | **Lines**: 164 | **Modified**: 5 days ago

**Description**: Provides a parameterized test suite for the conscious-bot's P21A conformance, running invariant probes that validate maintenance behavior under various conditions. Each test delegates to shared probe functions (e.g., probeINV04 for uncertainty monotonicity, probeINV10 for id robustness).

**Classes**: `and`

**Key Functions**: `runP21AConformanceSuite`

---

### testkits/src/p21/p21a-invariant-probes.ts

**Staleness**: `active` (0.00) | **Lines**: 481 | **Modified**: 5 days ago

**Description**: Provides invariant probe for determinism check in the p21a-variant-probe suite. Implements a test using the `it()` wrapper to verify deterministic behavior of the core adapter.

**Key Functions**: `resolveExtensions`, `probeINV01`, `probeINV02`, `probeINV03`, `probeINV04`

---

### testkits/src/p21/p21b-conformance-suite.ts

**Staleness**: `active` (0.00) | **Lines**: 155 | **Modified**: 5 days ago

**Description**: , provides parameterized tests for enforcing the emission protocol's delta budget invariant in the P21-B layer by validating saliency events against the deltaCap limit set in each conformance configuration.

**Key Functions**: `runP21BConformanceSuite`

---

### testkits/src/p21/proof-manifest.ts

**Staleness**: `active` (0.00) | **Lines**: 287 | **Modified**: 6 days ago

**Description**: Provides P21A invariant manifests for conformance testing.

**Classes**: `and`

**Key Functions**: `generateP21AManifest`, `generateP21BManifest`

---

### testkits/src/p21/run-handle.ts

**Staleness**: `active` (0.00) | **Lines**: 35 | **Modified**: 5 days ago

**Description**: Implements P21 invariant handling for conscious-bot. Expects a function to record outcomes, updates status on pass or failure, and returns a promise reflecting the test result.

**Key Functions**: `createRunHandle`

---

## Planning executor contracts

### executor-contracts/src/capability-registry.ts

**Staleness**: `active` (0.00) | **Lines**: 357 | **Modified**: 5 days ago

**Description**: Provides a centralized capability registry that validates and exposes registered capabilities to the executor, ensuring type safety and version tracking for capability usage within the conscious-bot planning system.

**Classes**: `CapabilityRegistry`, `CapabilityRegistryBuilder`

---

### executor-contracts/src/leaf-factory.ts

**Staleness**: `stable` (0.20) | **Lines**: 229 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Provides registration and instantiation of leaf implementations for the planning executor; ensures only valid and non-circular leaves are registered and accessible to the cognitive and interface layers.

**Classes**: `LeafFactory`

**Key Functions**: `createLeafFactory`

---

### executor-contracts/src/leaf-interfaces.ts

**Staleness**: `stable` (0.20) | **Lines**: 275 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Leaf implementations in the conscious-bot executor contracts define the required methods for executing tasks using a shared LeafImpl interface. The LeafContext provides runtime access to the bot, world state, and execution parameters such as timeouts and retry settings.

**Key Functions**: `createLeafContext`, `validateLeafImpl`, `createExecError`, `verifyPostconditions`

---

### executor-contracts/src/pbi-enforcer.ts

**Staleness**: `active` (0.00) | **Lines**: 501 | **Modified**: 5 days ago

**Description**: required. It verifies plan steps against the Plan-Body Interface (PBI), monitors execution for stuck conditions using detectors, and ensures that valid plans are executed by the appropriate executor in the conscious-bot planning pipeline.

**Classes**: `PBIEnforcer`, `StuckDetector`

**Key Functions**: `createPBIEnforcer`, `createCustomPBIEnforcer`

---

### executor-contracts/src/types.ts

**Staleness**: `active` (0.00) | **Lines**: 336 | **Modified**: 5 days ago

**Description**: Defines the PlanStep interface to structure executable actions and their associated preconditions, effects, costs, and safety levels for the conscious-bot's planning and execution system.

**Classes**: `PBIError`

**Key Functions**: `isIntent`, `isPlanStep`, `isActionResult`, `isPBIError`

---

## Safety checks and guards

### safety/src/fail-safes/emergency-response.ts

**Staleness**: `stable` (0.20) | **Lines**: 1040 | **Modified**: 128 days ago

**Staleness Indicators**:
  - Not modified in 128 days (over 3 months)

**Description**: type validation functions for EmergencyDeclaration to enforce safe mode entry criteria in the conscious-bot safety module. Provides validation for emergency protocol adherence using validateEmergencyDeclaration.

**Classes**: `EmergencyNotificationManager`, `SafeModeManager`, `EmergencyResponseCoordinator`

---

### safety/src/fail-safes/fail-safes-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 1411 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Implements integrated safety checks and recovery coordination for the conscious-bot system. Manages and executes fail-safes including constitutional filtering, watchdog monitoring, and emergency response protocols.

**Classes**: `ResourceMonitor`, `RecoveryCoordinator`, `FailSafesSystem`

---

### safety/src/fail-safes/preemption-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 764 | **Modified**: 159 days ago

**Staleness Indicators**:
  - Not modified in 159 days (over 3 months)

**Description**: Implements preemption logic to prioritize and manage running tasks within the conscious-bot scheduler. Maintains task and resource state using a map of active tasks and their execution grants.

**Classes**: `RunningTaskManager`, `PreemptionPolicy`, `PreemptedTaskQueue`, `PreemptionManager`

---

### safety/src/fail-safes/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 590 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Provides typed definitions for fail-safe statuses and types used in the conscious-bot safety checks module. Enforces consistent failure event classification through Zod schemas.

---

### safety/src/fail-safes/watchdog-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 667 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Provides component health tracking and failure detection for the conscious-bot system, using timers and a configurable health check function to monitor and report on critical subsystems

**Classes**: `ComponentWatchdog`, `WatchdogManager`

---

### safety/src/monitoring/health-monitor.ts

**Staleness**: `stable` (0.20) | **Lines**: 774 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements component health tracking and failure detection for the conscious-bot's safety subsystem. Maintains per-component health status, executes periodic checks, and aggregates failure trends.

**Classes**: `HealthMonitor`

---

### safety/src/monitoring/safety-monitoring-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 673 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Implements integrated safety monitoring by coordinating telemetry collection, health check execution, anomaly detection, and alerting to ensure the bot's operational integrity and provide real-time safety feedback. Centralizes validation of monitoring configurations and manages event emissions for system health status updates and alerts.

**Classes**: `SafetyMonitoringSystem`

---

### safety/src/monitoring/telemetry-collector.ts

**Staleness**: `stable` (0.20) | **Lines**: 489 | **Modified**: 128 days ago

**Staleness Indicators**:
  - Not modified in 128 days (over 3 months)

**Description**: Implements high-efficiency telemetry buffering using a circular buffer to store and manage incoming data streams securely. Handles overflow by discarding the oldest entries during buffer full events.

**Classes**: `CircularBuffer`, `MetricAggregator`, `TelemetryCollector`

---

### safety/src/monitoring/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 685 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: Defines the data structure for real-time telemetry used by the safety system to monitor conscious-bot components and health metrics. Enforces type safety for metric names, types, component classifications, and event data.

**Key Functions**: `createTelemetryData`, `calculateHealthStatus`, `formatAlertMessage`, `checkThreshold`, `calculateStatistics`

---

### safety/src/privacy/consent-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 724 | **Modified**: 138 days ago

**Staleness Indicators**:
  - Not modified in 138 days (over 3 months)

**Description**: Record player consent decisions for specified data types using the ConsentManager module within the safety framework of the conscious-bot. Maintains per-player consent states and updateable consent history for auditability and compliance.

**Classes**: `ConsentStorage`, `ConsentValidator`, `ConsentNotificationManager`, `ConsentRenewalScheduler`, `ConsentManager`

---

### safety/src/privacy/data-anonymizer.ts

**Staleness**: `stable` (0.20) | **Lines**: 390 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: * Data Anonymizer - Privacy Protection through Anonymization * * Anonymizes player data and personally identifiable information * @author @darianrosebrook

**Classes**: `HashManager`, `LocationFuzzer`, `ContentFilter`, `PatternAbstractor`, `DataAnonymizer`

---

### safety/src/privacy/geofence-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 694 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides spatial boundary checks to enforce access control on the conscious-bot's data layers. Maintains a registry of geofences and supports querying which geofences contain a given location.

**Classes**: `GeofenceRegistry`, `GeofenceAccessPolicies`, `GeofenceViolationDetector`, `GeofenceManager`

---

### safety/src/privacy/privacy-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 559 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: from packages/safety/src/privacy/privacy-system. Provides centralized privacy controls for the conscious-bot, integrating DataAnonymizer, ConsentManager, GeofenceManager, and RateLimiter.

**Classes**: `PrivacySystem`

---

### safety/src/privacy/rate-limiter.ts

**Staleness**: `stable` (0.20) | **Lines**: 701 | **Modified**: 170 days ago

**Staleness Indicators**:
  - Not modified in 170 days (over 3 months)

**Description**: Implements rate limiting for agent actions using a sliding window algorithm in the conscious-bot safety module. Maintains per-action timestamps to track and enforce usage limits.

**Classes**: `SlidingWindowLimiter`, `TokenBucketLimiter`, `ActionTracker`, `AdaptiveRateLimiter`, `RateLimitViolationHandler` (+1 more)

---

### safety/src/privacy/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 380 | **Modified**: 134 days ago

**Staleness Indicators**:
  - Not modified in 134 days (over 3 months)

**Description**: Type safety for privacy controls in the conscious-bot system, providing structured schemas for anonymized player data and chat messages to enforce PII redaction during processing. Implements strict typing for PII patterns, location precision, and salt rotation schedules in AnonymizationConfig.

---

### safety/vitest.config.ts

**Staleness**: `stable` (0.20) | **Lines**: 13 | **Modified**: 163 days ago

**Staleness Indicators**:
  - Not modified in 163 days (over 3 months)

**Description**: Provides safety test configuration for conscious-bot, enabling strict environment isolation and global test setup using Vitest in TypeScript.

---

## Shared utilities, TTS, API clients, base types

### core/src/advanced-need-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 1306 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides context-aware need generation for the conscious-bot’s planning system. Implements dynamic need evaluation using current context and memory signals.

**Classes**: `AdvancedNeedGenerator`, `TrendAnalyzer`

---

### core/src/advanced-signal-processor.ts

**Staleness**: `stable` (0.20) | **Lines**: 1131 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: , implements advanced signal fusion and real-time processing pipelines for the conscious-bot's core systems, using Signal, FusedSignal, and SignalData types to integrate, analyze, and prioritize incoming data streams.

**Classes**: `AdvancedSignalProcessor`, `PatternRecognizer`, `ThreatDetector`, `MemoryIntegrator`, `SocialProcessor`

---

### core/src/arbiter.ts

**Staleness**: `stable` (0.20) | **Lines**: 1786 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Contextualizes and validates all incoming signals and task executions for the conscious-bot, ensuring compliance with safety, performance, and routing requirements. Central coordinator that routes cognitive tasks between modules using prioritization and trend analysis.

**Classes**: `ReflexModule`, `Arbiter`, `RedundantArbiterManager`

---

### core/src/cognitive-stream-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 1176 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides seamless integration with MCP capabilities and planning modules for dynamic decision-making.

**Classes**: `NarrativeLLMInterface`, `CognitiveStreamIntegration`

---

### core/src/debug-demo.ts

**Staleness**: `stable` (0.20) | **Lines**: 337 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides a debug demo to analyze action aborts and collect environmental data from the conscious-bot agent during operation. Implements connection to Minecraft via Mineflayer and a debug listener for spawn and error events.

**Key Functions**: `debugEnhancedDemo`

---

### core/src/debug-floor-check.ts

**Staleness**: `stable` (0.20) | **Lines**: 178 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides the debug floor check functionality for the conscious-bot agent. Evaluates the current block the bot is standing on using the bot entity position.

**Key Functions**: `debugFloorCheck`

---

### core/src/demo-cognitive-stream.ts

**Staleness**: `stable` (0.20) | **Lines**: 138 | **Modified**: 162 days ago

**Staleness Indicators**:
  - Not modified in 162 days (over 3 months)

**Description**: API client for simulating cognitive stream interactions with Minecraft and MCP, enabling goal-driven state transitions for the bot. Initiates and updates the cognitive stream with bot state and task context to trigger adaptive behaviors like entering torch corridor when underground.

**Key Functions**: `demonstrateCognitiveStream`

---

### core/src/demo-full-system-capabilities.ts

**Staleness**: `active` (0.00) | **Lines**: 270 | **Modified**: 5 days ago

**Description**: for the demo, provides a complete integration of the conscious-bot's planning and cognitive modules with real-time Mineflayer actions in Minecraft, enabling end-to-end autonomous task execution and step-wise reasoning.

**Key Functions**: `demoFullSystemCapabilities`

---

### core/src/demo-real-bot-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 165 | **Modified**: 5 days ago

**Description**: bot integration demo provides a live Mineflayer agent that processes cognitive inputs and executes real-time Minecraft actions through the cognitive stream, enabling the conscious-bot to interact with the world using natural language commands.

**Key Functions**: `main`

---

### core/src/demo-working-capabilities.ts

**Staleness**: `active` (0.00) | **Lines**: 222 | **Modified**: 5 days ago

**Description**: Provides a functional demo of the cognitive integration within the conscious-bot system, initializing a real Minecraft bot and logging operational states to verify core capabilities work end-to-end.

**Key Functions**: `demoWorkingCapabilities`

---

### core/src/fix-action-aborts.ts

**Staleness**: `active` (0.00) | **Lines**: 243 | **Modified**: 5 days ago

**Description**: Provides enhanced action abort handling for the conscious-bot's Minecraft agent by simulating timeout and argument issues in its execution flow. Implements custom error and spawn event hooks to validate the fixes before proceeding.

**Key Functions**: `fixActionAborts`

---

### core/src/goal-template-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 1230 | **Modified**: 8 days ago

**Description**: Implements goal template instantiation, auto-feasibility evaluation, and dependency resolution for the conscious-bot's planning engine.

**Classes**: `GoalTemplateManager`, `ResourceMonitor`, `FeasibilityAnalyzer`, `RiskAssessor`

---

### core/src/leaves/crafting-leaves.ts

**Staleness**: `stable` (0.20) | **Lines**: 674 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides leaf crafting logic for the conscious-bot, including recipe validation and inventory updates via LeafImpl interface and error handling via LeafResult. Implements core crafting operations such as crafting and smelting using Bot and Vec3 utilities.

**Classes**: `CraftRecipeLeaf`, `SmeltLeaf`, `IntrospectRecipeLeaf`

**Key Functions**: `countByName`, `findNearestBlock`

---

### core/src/leaves/interaction-leaves.ts

**Staleness**: `stable` (0.20) | **Lines**: 1196 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: contextually evaluates and places a torch when ambient light is below the specified threshold in the current Interaction Leaves interface.

**Classes**: `PlaceTorchIfNeededLeaf`, `RetreatAndBlockLeaf`, `DigBlockLeaf`, `PlaceBlockLeaf`, `ConsumeFoodLeaf`

---

### core/src/leaves/movement-leaves.ts

**Staleness**: `stable` (0.20) | **Lines**: 546 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: with robust pathfinding integration, MoveToLeaf computes the shortest or goal-oriented route for the bot and executes movement using Mineflayer's navigation capabilities, returning structured results with status, position, and error metrics for trans

**Classes**: `MoveToLeaf`, `StepForwardSafelyLeaf`, `FollowEntityLeaf`

**Key Functions**: `ok`, `fail`

---

### core/src/leaves/sensing-leaves.ts

**Staleness**: `stable` (0.20) | **Lines**: 593 | **Modified**: 162 days ago

**Staleness Indicators**:
  - Not modified in 162 days (over 3 months)

**Description**: Provides detection of hostile entities within a configurable radius using Mineflayer, returning detailed entity information in the result. Implements error handling and timeout mechanisms for reliable sensing feedback.

**Classes**: `SenseHostilesLeaf`, `ChatLeaf`, `WaitLeaf`, `GetLightLevelLeaf`

---

### core/src/llm/ollama-client.ts

**Staleness**: `active` (0.00) | **Lines**: 129 | **Modified**: 8 days ago

**Description**: * Ollama LLM Client * * Minimal client for local Ollama server. Supports /api/generate and * OpenAI-compatible /v1/chat/completions when OLLAMA_OPENAI=truish.

**Classes**: `OllamaClient`

---

### core/src/logging/config.ts

**Staleness**: `stable` (0.20) | **Lines**: 120 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides centralized configuration for logging verbosity settings throughout the conscious-bot monorepo modules. Exposes a LoggingConfig interface and a getLoggingConfig function to retrieve debug flags from environment variables.

**Key Functions**: `getLoggingConfig`, `isDebugEnabled`, `debugLog`, `logEnvironmentUpdate`, `logInventoryUpdate`

---

### core/src/mcp-capabilities/bt-dsl-parser.ts

**Staleness**: `stable` (0.20) | **Lines**: 953 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides a TypeScript parser and compiler for the BT-DSL, translating declarative behavior into executable CompiledBTNode instances and enabling deterministic node execution. Implements schema validation using Ajv to ensure correct BT-DSL syntax before compilation.

**Classes**: `SensorPredicateEvaluator`, `CompiledLeafNode`, `CompiledSequenceNode`, `CompiledSelectorNode`, `CompiledRepeatUntilNode` (+3 more)

---

### core/src/mcp-capabilities/bt-dsl-schema.ts

**Staleness**: `stable` (0.20) | **Lines**: 451 | **Modified**: 164 days ago

**Staleness Indicators**:
  - Not modified in 164 days (over 3 months)

**Description**: Provides a RepeatUntil node for iterative behavior in the BT-DSL, requiring a condition to succeed; enforces strict node typing hierarchy for behavior tree composition in the conscious-bot architecture.

**Key Functions**: `isBTNode`, `isSequenceNode`, `isSelectorNode`, `isRepeatUntilNode`, `isTimeoutDecoratorNode`

---

### core/src/mcp-capabilities/capability-registry.ts

**Staleness**: `stable` (0.20) | **Lines**: 715 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: registry module in the core package provides structured metadata and provenance tracking for capability registrations, managing authorship, code hashes, and version lineage, ensuring secure and traceable updates via type-safe interfaces.

**Classes**: `CapabilityRegistry`

---

### core/src/mcp-capabilities/capability-specs.ts

**Staleness**: `stable` (0.20) | **Lines**: 889 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides structured validation for Minecraft capability requests by enforcing agent health and position constraints during execution context checks.

**Classes**: `BaseMinecraftExecutor`, `BaseMinecraftValidator`, `MoveForwardExecutor`, `MoveForwardValidator`, `ExploreExecutor` (+5 more)

---

### core/src/mcp-capabilities/constitutional-filter.ts

**Staleness**: `stable` (0.20) | **Lines**: 664 | **Modified**: 169 days ago

**Staleness Indicators**:
  - Not modified in 169 days (over 3 months)

**Description**: Provides a TypeScript-based constitutional filter for the conscious-bot's capabilities. Implements rule evaluation by checking capability requests against defined ethical and safety constraints in context.

**Classes**: `ConstitutionalFilter`

---

### core/src/mcp-capabilities/dynamic-creation-flow.ts

**Staleness**: `stable` (0.20) | **Lines**: 584 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: a dynamic creation flow that detects impasse through configurable failure thresholds and debouncing, monitors proposal metrics, and triggers automatic retirement of low-performing options to maintain efficient LLM usage

**Classes**: `DynamicCreationFlow`

---

### core/src/mcp-capabilities/leaf-contracts.ts

**Staleness**: `active` (0.00) | **Lines**: 883 | **Modified**: 3 days ago

**Description**: Provides leaf contracts for Mineflayer interactions, enforces validation and safety for primitive actions, and offers type definitions to ensure consistent execution patterns across the conscious-bot system.

**Key Functions**: `getErrorStats`, `clearErrorStats`, `readInventory`, `hostilePredicate`, `dist`

---

### core/src/mcp-capabilities/leaf-factory.ts

**Staleness**: `active` (0.00) | **Lines**: 377 | **Modified**: 4 days ago

**Description**: Provides schema-compiled registration and execution for leaf implementations via AjV, enforces unique registry entries by (name@version), and manages rate limiting for the conscious-bot’s leaf operations.

**Classes**: `LeafFactory`

---

### core/src/mcp-capabilities/llm-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 682 | **Modified**: 3 days ago

**Description**: Provides a dual-system LLM integration interface for conscious-bot's hierarchical reasoning, allowing abstract planning and detailed execution components to communicate through LLMModel and HRMReasoning configurations.

**Classes**: `OllamaClient`, `HRMLLMInterface`

---

### core/src/mcp-capabilities/llm-interface.ts

**Staleness**: `stable` (0.20) | **Lines**: 461 | **Modified**: 163 days ago

**Staleness Indicators**:
  - Not modified in 163 days (over 3 months)

**Description**: * LLM Interface for Dynamic Creation Flow * * Provides a proper interface for LLM-based option proposal and generation. * Replaces mock implementations with production-ready components.

**Classes**: `ProductionLLMInterface`

---

### core/src/mcp-capabilities/rate-limiter.ts

**Staleness**: `stable` (0.20) | **Lines**: 567 | **Modified**: 169 days ago

**Staleness Indicators**:
  - Not modified in 169 days (over 3 months)

**Description**: * Rate Limiter - Prevents capability abuse through sophisticated rate limiting * * Implements sliding window rate limiting with burst allowance, adaptive limits, * and capability-specific controls to prevent abuse while allowing legitimate usage. * * @author @darianrosebrook

**Classes**: `CapabilityRateLimiter`

---

### core/src/mcp-capabilities/registry.ts

**Staleness**: `stable` (0.20) | **Lines**: 1065 | **Modified**: 158 days ago

**Staleness Indicators**:
  - Not modified in 158 days (over 3 months)

**Description**: registry module provides type definitions and metadata management for leaves and options within the conscious-bot system, enforcing separate registration paths for human-signed and LLM-authored entries while tracking provenance, permissions, and runt

**Classes**: `nominal`, `EnhancedRegistry`

---

### core/src/mcp-capabilities/task-timeframe-management.ts

**Staleness**: `stable` (0.20) | **Lines**: 662 | **Modified**: 164 days ago

**Staleness Indicators**:
  - Not modified in 164 days (over 3 months)

**Description**: Implements configurable time buckets for the conscious-bot's task execution timelines. Provides 'tactical', 'short', 'standard', 'long', and 'expedition' buckets with duration caps and priority.

**Classes**: `TaskTimeframeManager`

---

### core/src/mcp-capabilities/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 492 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: state validation types used by the bot's capabilities to enforce safety constraints before action execution

---

### core/src/mcp-capabilities/working-leaf-factory.ts

**Staleness**: `stable` (0.20) | **Lines**: 426 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides a robust leaf registration mechanism with built-in Ajv validators and semver-based input/output validation for the conscious-bot system.

**Classes**: `WorkingLeafFactory`

---

### core/src/minecraft-cognitive-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 309 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: real-time bridges the cognitiveStream with Mineflayer bot, translating thoughts and decisions into Minecraft actions through method calls like MoveToLeaf and PlaceBlockLeaf. Enables safe, timed execution of user intents via the configured action methods and emits progress events to the main cognitive module.

**Classes**: `MinecraftCognitiveIntegration`

**Key Functions**: `createMinecraftCognitiveIntegration`

---

### core/src/mock-bot-service.ts

**Staleness**: `stable` (0.20) | **Lines**: 124 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides mock connectivity for the planning module during evaluation. Simulates bot state, including position, inventory, and health.

---

### core/src/performance-monitor.ts

**Staleness**: `stable` (0.20) | **Lines**: 574 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Implements real-time operation timing by recording start and checkpoint latencies during task execution. Tracks performance metrics for each cognitive and action-based operations using a map.

**Classes**: `TrackingSession`, `LatencyTracker`, `PerformanceMonitor`

---

### core/src/priority-ranker.ts

**Staleness**: `stable` (0.20) | **Lines**: 997 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: score and rank tasks using calculatedPriority, applying customizable boosts for commitment, novelty, and opportunity cost factors to determine the bot's next action.

**Classes**: `PriorityRanker`, `CommitmentTracker`, `OpportunityTracker`, `ContextAnalyzer`

---

### core/src/real-time/alerting-system.ts

**Staleness**: `active` (0.00) | **Lines**: 757 | **Modified**: 8 days ago

**Description**: Provides real-time alert management for the conscious-bot's performance and system health metrics. Implements rule-based thresholds and escalation policies, emits events via custom EventEmitter to notify the dashboard and external channels.

**Classes**: `AlertingSystem`

---

### core/src/real-time/budget-enforcer.ts

**Staleness**: `active` (0.00) | **Lines**: 539 | **Modified**: 8 days ago

**Description**: Contextualizes and enforces system performance budgets using the current SystemLoad, monitoring and adjusting allocations via the thought process

**Classes**: `BudgetEnforcer`

---

### core/src/real-time/degradation-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 720 | **Modified**: 8 days ago

**Description**: * Degradation Manager - Graceful degradation and recovery strategies * * Implements intelligent degradation strategies when performance constraints * cannot be met, with automatic recovery when conditions improve. * * @author @darianrosebrook

**Classes**: `DegradationManager`

---

### core/src/real-time/performance-tracker.ts

**Staleness**: `active` (0.00) | **Lines**: 816 | **Modified**: 8 days ago

**Description**: Implements real-time performance logging for the cognitive and execution layers, capturing operation timings and metrics per session. Maintains a bounded history of performance data for analysis and anomaly detection.

**Classes**: `BoundedHistory`, `PerformanceTracker`

---

### core/src/real-time/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 678 | **Modified**: 169 days ago

**Staleness Indicators**:
  - Not modified in 169 days (over 3 months)

**Description**: Provides type definitions for real-time performance budget tracking in the conscious-bot architecture, enabling enforcement and monitoring of operation-specific allocations within the core system.

---

### core/src/server.ts

**Staleness**: `active` (0.00) | **Lines**: 399 | **Modified**: 6 days ago

**Description**: Provides REST-based endpoints to register, update, and manage option (dynamic capability) registrations within the conscious-bot system. Manages request validation, capability creation, and response status for the /capabilities/option/register route.

**Key Functions**: `createServer`

---

### core/src/signal-processor.ts

**Staleness**: `stable` (0.20) | **Lines**: 1407 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Implements signal aggregation, prioritization, and filtering for the conscious-bot's input stream. Processes incoming signals through a bounded history and trend analysis to generate adaptive needs.

**Classes**: `SignalProcessor`

---

### core/src/sterling/sterling-client.ts

**Staleness**: `active` (0.00) | **Lines**: 858 | **Modified**: 0 days ago

**Description**: Provides a WebSocket client for Sterling's graph-reasoning server integration in the conscious-bot architecture. Manages connection state and implements circuit breaker/retry patterns for reliable message transmission.

**Classes**: `SterlingClient`

---

### core/src/sterling/types.ts

**Staleness**: `active` (0.00) | **Lines**: 352 | **Modified**: 0 days ago

**Description**: Provides type definitions for Sterling's WebSocket protocol messages and request types used across the conscious-bot system. Defines enum and interface structures for domain-specific solver communication in the core module.

---

### core/src/test-cognitive-pipeline.ts

**Staleness**: `stable` (0.20) | **Lines**: 39 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: dependencies for the cognitive pipeline test are managed within the conscious-bot architecture, testing the end-to-end conversion from cognitive thoughts to executed behaviors, ensuring the thought-to-signal and signal-to-action flow works as intended. This test is currently disabled due to cross-package constraints in the conscious-bot monorepo.

**Key Functions**: `testCognitivePipeline`

---

### core/src/tts/tts-client.ts

**Staleness**: `active` (0.00) | **Lines**: 308 | **Modified**: 0 days ago

**Description**: Provides a text-to-speech interface using Kokoro-ONNX for the conscious-bot architecture. Detects and initializes system audio streaming via sox process if available.

**Classes**: `TTSClient`

---

### core/src/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 604 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides Signal and NeedScore types to standardize and validate input to the cognitive modules of conscious-bot, ensuring reliable and structured data flow for health, nutrition, and safety evaluation.

**Classes**: `BoundedHistory`

---

### core/src/utils/http-client.ts

**Staleness**: `stable` (0.20) | **Lines**: 278 | **Modified**: 91 days ago

**Staleness Indicators**:
  - Not modified in 91 days (over 3 months)

**Description**: Client provides a robust HTTP request wrapper with built-in retry, circuit breaker, and timeout mechanisms to ensure safe and reliable communication for the conscious-bot system. It uses exponential backoff and maintains per-url circuit breaker states in memory.

**Classes**: `HttpClient`

**Key Functions**: `createServiceClients`

---

### core/src/utils/resilient-service-client.ts

**Staleness**: `active` (0.00) | **Lines**: 233 | **Modified**: 4 days ago

**Description**: Provides a resilient HTTP client for hot-reloading-aware service calls in conscious-bot. Automatically retries on transient connection errors with exponential backoff and configurable options.

**Classes**: `keying`

**Key Functions**: `isTransientError`, `sleep`, `resilientFetch`, `waitForService`

---

## Task integration, Sterling solver, cognitive thought processor

### planning/scripts/run-smoke.ts

**Staleness**: `active` (0.00) | **Lines**: 57 | **Modified**: 8 days ago

**Description**: Provides a smoke test for the conscious-bot's planning module by starting the server, checking health and state endpoints, and properly shutting down processing and interval timers. Implements endpoint validation logic using fetch calls to /health and /state.

**Key Functions**: `sleep`, `main`

---

### planning/src/__internal_types.ts

**Staleness**: `stable` (0.20) | **Lines**: 8 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: types Provide type definitions used exclusively within the planning module of conscious-bot for robust task representation and local execution. They ensure consistent data structures for the Sterling solver and cognitive thought processor.

---

### planning/src/behavior-trees/BehaviorTreeRunner.ts

**Staleness**: `active` (0.00) | **Lines**: 1411 | **Modified**: 1 days ago

**Description**: Implements the execution of planning options via Behavior Trees, streaming real-time tick feedback and node status updates for the cognitive reasoning process.

**Classes**: `DefaultConditionEvaluator`, `BehaviorTreeRunner`, `default`, `default`, `BTRun`

---

### planning/src/cognitive-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 448 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides bidirectional communication between the planning and cognitive modules. Manages task reflection storage for learning and retry decisions.

**Classes**: `CognitiveIntegration`

---

### planning/src/cognitive-thought-processor.ts

**Staleness**: `active` (0.00) | **Lines**: 1739 | **Modified**: 0 days ago

**Description**: State manages and structures cognitive thoughts into actionable plans for the Sterling solver, using the thought processing interval and batch size to schedule task generation. Integrates with memory and MCP via configurable pipelines and endpoints.

**Classes**: `HttpPlanningClient`, `HttpMemoryClient`, `HttpCognitiveClient`, `CognitiveThoughtProcessor`

---

### planning/src/constraints/constraint-model.ts

**Staleness**: `active` (0.00) | **Lines**: 148 | **Modified**: 4 days ago

**Description**: must ensure module dependencies are respected and propagate reachability checks for the bot to access required areas using Dependency, Reachability, and Support constraints.

**Key Functions**: `extractDependencyConstraints`, `extractSupportConstraints`, `extractReachabilityConstraints`

---

### planning/src/constraints/dag-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 252 | **Modified**: 4 days ago

**Description**: Builds a PartialOrderPlan DAG from building modules and their solve steps. Detects conflicts by analyzing moduleType for commuting paths.

**Key Functions**: `buildDagFromModules`, `deriveConflictKeys`, `hasConflictKeyOverlap`

---

### planning/src/constraints/execution-advisor.ts

**Staleness**: `active` (0.00) | **Lines**: 86 | **Modified**: 5 days ago

**Description**: Provides execution readiness assessment for the Sterling planner by evaluating the Rig G metadata version, feasibility, and parallelism recommendations. Fails-closed on unsupported versions, blocking execution and suggesting replanning.

**Key Functions**: `adviseExecution`

---

### planning/src/constraints/feasibility-checker.ts

**Staleness**: `active` (0.00) | **Lines**: 212 | **Modified**: 4 days ago

**Description**: conscious-bot's planning module uses a feasibility checker to validate PartialOrderPlan instances against PlanConstraint models, returning a PlanningDecision with typed feasibility result and any dependency or reachability violations. It ensures that all required modules are present and the plan meets positional reachability requirements before advancing execution.

---

### planning/src/constraints/linearization.ts

**Staleness**: `active` (0.00) | **Lines**: 149 | **Modified**: 5 days ago

**Description**: stepwise order the nodes of a PartialOrderPlan using Kahn's algorithm, prioritizing nodes by content-identified IDs when multiple are ready, and emits a LinearizationResult with the final order, ready-set size history, and a schema-versioned digest f

**Key Functions**: `insertSorted`

---

### planning/src/constraints/partial-order-plan.ts

**Staleness**: `active` (0.00) | **Lines**: 122 | **Modified**: 4 days ago

**Description**: Provides a DAG-based structure for representing module dependencies in a partial order within the conscious-bot planning system. Nodes encode module identifiers and data with content-addressed IDs and optional conflict keys for conflict detection.

**Key Functions**: `computeNodeId`

---

### planning/src/constraints/planning-decisions.ts

**Staleness**: `active` (0.00) | **Lines**: 30 | **Modified**: 5 days ago

**Description**: Provides a discriminated-union type for modeling planning function outcomes in the conscious-bot's task integration module. Implements PlanningDecision<T> to encapsulate success, blocked reasons, and errors from the planner.

---

### planning/src/constraints/signals.ts

**Staleness**: `active` (0.00) | **Lines**: 66 | **Modified**: 5 days ago

**Description**: Provides computation of key planning signals from partial-order and feasibility analysis. Calculates node and edge counts, linearization metrics (mean, p95), and aggregates rejection statistics from violated constraints.

**Key Functions**: `computeP95`

---

### planning/src/environment-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 736 | **Modified**: 5 days ago

**Description**: Provides real-time Minecraft environment data including biome, weather, position, and entity/block detection to the cognitive planner. Integrates inventory tracking and resource assessment for the bot's decision-making process.

**Classes**: `EnvironmentIntegration`

---

### planning/src/executor/sterling-step-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 648 | **Modified**: 0 days ago

**Description**: stepExecution handles a single Sterling step by validating and normalizing inputs, checking eligibility, and dispatching execution via the provided context, ensuring safety and correct state transitions for the cognitive task manager.

**Key Functions**: `isNavigatingError`, `executeSterlingStep`

---

### planning/src/executor/sterling-step-executor.types.ts

**Staleness**: `active` (0.00) | **Lines**: 115 | **Modified**: 0 days ago

**Description**: Provides type definitions for the Sterling step executor in the conscious-bot planning module. Enforces configuration and context interfaces for task integration and execution, ensuring strict separation of concerns and testability via dependency injection.

---

### planning/src/goal-formulation/advanced-signal-processor.ts

**Staleness**: `stable` (0.20) | **Lines**: 641 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides advanced signal fusion for the cognitive planner, converting raw internal and environmental signals into urgency-aware, context-rich inputs for decision making.

**Classes**: `AdvancedSignalProcessor`

**Key Functions**: `clamp`

---

### planning/src/goal-formulation/goal-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 908 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Advanced goal generation with templates, feasibility analysis, and decomposition. * * Implements sophisticated goal generation that transforms needs into concrete, * feasible objectives with proper decomposition and resource analysis.

**Classes**: `GoalGenerator`, `ResourceAnalyzer`, `SpatialAnalyzer`

---

### planning/src/goal-formulation/goal-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 556 | **Modified**: 5 days ago

**Description**: Implements the core goal manager for the conscious-bot's planning module, orchestrating signal processing, goal generation, and priority ranking. Integrates AdvancedSignalProcessor, GoalGenerator, and PriorityScorer to transform user signals into structured goals and rank them effectively.

**Classes**: `GoalManager`

---

### planning/src/goal-formulation/homeostasis-monitor.ts

**Staleness**: `stable` (0.20) | **Lines**: 82 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements real-time sampling of the cognitive state and synthesizes a normalized HomeostasisState by merging live signals with default values for missing data.

**Classes**: `HomeostasisMonitor`

**Key Functions**: `getDefaultHomeostasis`

---

### planning/src/goal-formulation/need-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 137 | **Modified**: 114 days ago

**Staleness Indicators**:
  - Not modified in 114 days (over 3 months)

**Description**: with current health metrics, generates prioritized safety and survival needs for the conscious-bot's planning pipeline, computing urgency and intensity from the HomeostasisState, and ensures robust execution with safe defaults and early return guards

**Key Functions**: `generateNeeds`

---

### planning/src/goal-formulation/priority-scorer.ts

**Staleness**: `stable` (0.20) | **Lines**: 513 | **Modified**: 165 days ago

**Staleness Indicators**:
  - Not modified in 165 days (over 3 months)

**Description**: Implements multi-factor priority scoring for goal evaluation, combining urgency, context, risk, commitment, novelty, and opportunity cost. Analyzes candidate goals using weighted metrics and risk assessment to rank planning options.

**Classes**: `PriorityScorer`

---

### planning/src/goal-formulation/task-bootstrapper.ts

**Staleness**: `active` (0.00) | **Lines**: 700 | **Modified**: 6 days ago

**Description**: Defines TaskBootstrapper.

**Classes**: `TaskBootstrapper`

---

### planning/src/goal-formulation/utility-calculator.ts

**Staleness**: `stable` (0.20) | **Lines**: 44 | **Modified**: 165 days ago

**Staleness Indicators**:
  - Not modified in 165 days (over 3 months)

**Description**: Provides utility score calculations for task prioritization within the conscious-bot planning module. Implements weighted sum of intensity, urgency, health, and safety factors to evaluate task relevance.

**Key Functions**: `createWeightedUtility`, `avg`, `clamp`

---

### planning/src/goals/activation-reactor.ts

**Staleness**: `active` (0.00) | **Lines**: 277 | **Modified**: 5 days ago

**Description**: state the activation criteria for goal selection in the conscious-bot planning pipeline using relevance scores and budget limits

**Classes**: `ActivationReactor`

**Key Functions**: `computeRelevance`, `computeProximityScore`

---

### planning/src/goals/completion-checker.ts

**Staleness**: `active` (0.00) | **Lines**: 147 | **Modified**: 5 days ago

**Description**: ;Provides goal completion verification logic for the conscious-bot's planning module, monitoring the number of passes until stability criteria are met and handling failed or regression scenarios by restarting the task when necessary

**Key Functions**: `checkCompletion`, `applyCompletionOutcome`

---

### planning/src/goals/effect-partitioning.ts

**Staleness**: `active` (0.00) | **Lines**: 89 | **Modified**: 4 days ago

**Description**: Provides a pure function to partition SyncEffect arrays into those targeting the current task (via apply_hold/clear_hold) and others.

**Key Functions**: `partitionSelfHoldEffects`, `applySelfHoldEffects`

---

### planning/src/goals/goal-binding-normalize.ts

**Staleness**: `active` (0.00) | **Lines**: 215 | **Modified**: 4 days ago

**Description**: mapping goal binding states to task metadata to ensure consistency and prevent contradictions in blocked reasons and hold status. It validates that a paused task must have a proper GoalHold, enforcing the state binding protocol.

**Key Functions**: `detectIllegalStates`, `assertConsistentGoalState`, `syncHoldToTaskFields`, `applyHold`, `clearHold`

---

### planning/src/goals/goal-binding-types.ts

**Staleness**: `active` (0.00) | **Lines**: 113 | **Modified**: 5 days ago

**Description**: Provides goal-binding types for the cognitive planner, defining how strategic goals are linked to executable tasks via goalBinding fields. Implements a goal hold state with reason types and hysteresis mechanisms for safe resumption.

**Key Functions**: `name`

---

### planning/src/goals/goal-hold-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 205 | **Modified**: 5 days ago

**Description**: binding the hold state of goal-bound tasks, the GoalHoldManager enforces manual pauses as unbreakable and validates hold reasons, synchronizing hold information with task fields, and preventing unauthorized hold clearance until review or reset by the

**Key Functions**: `isKnownHoldReason`, `requestHold`, `requestClearHold`, `isHoldDueForReview`, `isManuallyPaused`

---

### planning/src/goals/goal-identity.ts

**Staleness**: `active` (0.00) | **Lines**: 192 | **Modified**: 5 days ago

**Description**: Implements region hashing for goal proximity detection. Generates a coarse region key from position coordinates to group nearby goals.

**Key Functions**: `hashGoalKey`, `coarseRegion`, `computeProvisionalKey`, `computeAnchoredKey`, `anchorGoalIdentity`

---

### planning/src/goals/goal-lifecycle-events.ts

**Staleness**: `active` (0.00) | **Lines**: 265 | **Modified**: 5 days ago

**Description**: Provides goal lifecycle event emitters for transparent goal-binding tracking in the conscious-bot planning module. Implements event types such as GoalCreatedEvent and GoalResolvedEvent to record goal lifecycle states.

**Classes**: `GoalLifecycleCollector`

**Key Functions**: `now`, `goalCreatedEvent`, `goalResolvedEvent`, `goalVerificationEvent`, `goalCompletedEvent`

---

### planning/src/goals/goal-lifecycle-hooks.ts

**Staleness**: `active` (0.00) | **Lines**: 201 | **Modified**: 4 days ago

**Description**: plan execution updates by firing lifecycle hooks when a task's status changes and propagating sync effects to the goal-binding protocol

**Key Functions**: `onTaskStatusChanged`, `onGoalAction`, `onTaskProgressUpdated`, `applySyncEffects`

---

### planning/src/goals/goal-resolver.ts

**Staleness**: `active` (0.00) | **Lines**: 472 | **Modified**: 4 days ago

**Description**: * Goal Resolver * * Resolves incoming goal intent to one of three outcomes: * - "continue": existing non-terminal task matches → return its ID * - "already_satisfied": completed task passes verifier → no new task * - "create": no match → create a new

**Classes**: `GoalResolver`

**Key Functions**: `computeTotal`, `scoreCandidate`, `findCandidates`, `isWithinSatisfactionScope`, `resolveGoalDry`

---

### planning/src/goals/goal-task-sync.ts

**Staleness**: `active` (0.00) | **Lines**: 332 | **Modified**: 5 days ago

**Description**: state machine that synchronizes Goal status with Task status changes using a pure reducer; translates task transitions into goal effects and vice versa according to the Goal-Task Binding Protocol; ensures consistent and reliable cross-layer state ali

**Key Functions**: `taskStatusToGoalStatus`, `reduceTaskEvent`, `reduceGoalEvent`, `detectGoalTaskDrift`, `resolveDrift`

---

### planning/src/goals/keyed-mutex.ts

**Staleness**: `active` (0.00) | **Lines**: 74 | **Modified**: 5 days ago

**Description**: Provides a per-key mutex for atomic task execution in the conscious-bot planning layer. Ensures only one non-terminal task per (goalType, goalKey) runs at a time.

**Classes**: `KeyedMutex`

---

### planning/src/goals/periodic-review.ts

**Staleness**: `active` (0.00) | **Lines**: 135 | **Modified**: 5 days ago

**Description**: ;Implements periodic goal-task alignment checks. Scans current holds for staleness, goal-task drift, and manual pauses.

**Key Functions**: `runPeriodicReview`

---

### planning/src/goals/preemption-budget.ts

**Staleness**: `active` (0.00) | **Lines**: 249 | **Modified**: 5 days ago

**Description**: Implements a preemption budget for tasks that are interrupted, allowing them to safely wind down within a 3-step or 5-second limit after a preemption signal. Tracks steps consumed and triggers a pause when the budget expires.

**Classes**: `PreemptionCoordinator`

**Key Functions**: `createPreemptionBudget`, `consumeStep`, `checkBudget`, `buildHoldWitness`, `isValidWitness`

---

### planning/src/goals/threat-hold-bridge.ts

**Staleness**: `active` (0.00) | **Lines**: 260 | **Modified**: 3 days ago

**Description**: * Threat→Hold Bridge (A1) * * Wires the ThreatPerceptionManager (mc-interface, GET /safety) to the * GoalHoldManager (planning) so that active goal-bound tasks are paused * when the bot is under threat and resumed when the threat subsides.

**Key Functions**: `shouldHold`, `fetchThreatSignal`, `evaluateThreatHolds`

---

### planning/src/goals/verifier-registry.ts

**Staleness**: `active` (0.00) | **Lines**: 216 | **Modified**: 5 days ago

**Description**: Provides a registry of verifier functions for validating task completion within the conscious-bot planning module. Implements the verify_ShelterV0 verifier to determine if a task's target area is sheltered by the environment.

**Classes**: `VerifierRegistry`

**Key Functions**: `verifyShelterV0`, `createDefaultVerifierRegistry`

---

### planning/src/golden-run-recorder.ts

**Staleness**: `active` (0.00) | **Lines**: 654 | **Modified**: 0 days ago

**Description**: Provides execution logging for conscious-bot planning decisions. Records step details such as run_id, decision leaf, and runtime config.

**Classes**: `GoldenRunRecorder`

**Key Functions**: `toDispatchResult`, `deriveLoopStarted`, `isValidGoldenRunBanner`, `sanitizeRunId`, `isObject`

---

### planning/src/hierarchical-planner/cognitive-router.ts

**Staleness**: `stable` (0.20) | **Lines**: 725 | **Modified**: 158 days ago

**Staleness Indicators**:
  - Not modified in 158 days (over 3 months)

**Description**: * Cognitive Task Router * * Implements HRM-inspired task routing between LLM and structured reasoning * Based on the integration plan: "Mixture-of-Experts Routing" (lines 67-68) * * Routes problems to: * - LLM: Natural language, open-ended queries, s

**Classes**: `CognitiveTaskRouter`

**Key Functions**: `createCognitiveRouter`, `routeTask`

---

### planning/src/hierarchical-planner/plan-decomposer.ts

**Staleness**: `active` (0.00) | **Lines**: 183 | **Modified**: 4 days ago

**Description**: Implements macro-planner-based hierarchical task decomposition for the conscious-bot.

**Key Functions**: `decomposeToPlan`, `goalTypeToRequirementKind`

---

### planning/src/hierarchical-planner/task-network.ts

**Staleness**: `stable` (0.20) | **Lines**: 18 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: , the hierarchical-planner module in conscious-bot defines task network structures where each Task has a name and optional child subTasks, enabling structured reasoning and dependency traversal for goal-oriented planning.

---

### planning/src/hierarchical/edge-decomposer.ts

**Staleness**: `active` (0.00) | **Lines**: 211 | **Modified**: 4 days ago

**Description**: Handles unknown macro-edge patterns by signaling a 'decomposition_gap' and blocking execution.

**Key Functions**: `registerDecomposition`, `decomposeEdge`

---

### planning/src/hierarchical/feedback-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 154 | **Modified**: 4 days ago

**Description**: * Feedback Integration (E.3) * * Orchestrates the plan→execute→feedback→replan cycle: * - Holds MacroPlanner + FeedbackStore + active plan * - startEdge() creates a session * - reportStepOutcome() records leaf step results * - completeEdge() finalizes, records outcome, checks shouldReplan * * EMA cost update is explicit and bounded (no learning→semantics leak). * * @author @darianrosebrook

**Classes**: `FeedbackIntegration`

---

### planning/src/hierarchical/feedback.ts

**Staleness**: `active` (0.00) | **Lines**: 275 | **Modified**: 5 days ago

**Description**: Provides macro cost updates by aggregating micro execution outcomes and maintaining edge cost history for the conscious-bot's hierarchical planner. Tracks consecutive failures and enforces safe replan thresholds via EMA.

**Classes**: `FeedbackStore`

---

### planning/src/hierarchical/macro-planner.ts

**Staleness**: `active` (0.00) | **Lines**: 368 | **Modified**: 5 days ago

**Description**: Implements macro-pathfinding between abstract contexts using a Dijkstra-based algorithm. Constructs and maintains a static graph of contexts and learned execution costs.

**Classes**: `MacroPlanner`

**Key Functions**: `buildDefaultMinecraftGraph`

---

### planning/src/hierarchical/macro-state.ts

**Staleness**: `active` (0.00) | **Lines**: 237 | **Modified**: 5 days ago

**Description**: Provides a registry of valid macro contexts for hierarchical planning in the conscious-bot architecture.

**Classes**: `ContextRegistry`

**Key Functions**: `computeEdgeId`, `computeMacroPlanDigest`, `createMacroEdgeSession`, `finalizeSession`

---

### planning/src/hierarchical/signals.ts

**Staleness**: `active` (0.00) | **Lines**: 146 | **Modified**: 5 days ago

**Description**: , RigESignals module collects and exposes key metrics from the conscious-bot's hierarchical planning process, providing runtime configuration status, plan depth, cost estimates, context usage, and determinism digest for monitoring and evaluation.

**Key Functions**: `looksLikeCoordinate`, `collectRigESignals`

---

### planning/src/hierarchical/world-graph-builder.ts

**Staleness**: `active` (0.00) | **Lines**: 125 | **Modified**: 4 days ago

**Description**: Contextualizes Minecraft regions by mapping biome and structure locations to resource zones, extracting adjacency and requirement information for macro-planning. Generates resource requirement graphs from zone metadata and structure adjacency.

**Key Functions**: `buildWorldGraph`

---

### planning/src/interfaces/goal-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 16 | **Modified**: 5 days ago

**Description**: Implements goal management for the conscious-bot planner, allowing creation, update, and status tracking of goals via methods like listGoals, reprioritize, and complete. Provides hooks for dependency injection to modify goal priorities and lifecycle state.

---

### planning/src/interfaces/reactive-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 9 | **Modified**: 5 days ago

**Description**: * Reactive executor interface for dependency injection * * @author @darianrosebrook

---

### planning/src/interfaces/task-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 49 | **Modified**: 3 days ago

**Description**: Contextually links planning tasks to available solvers and manages step execution lifecycle within the cognitive planner of the conscious-bot architecture. Provides methods to register solvers, control step progression (start, annotate, add before current), and manage task state transitions.

---

### planning/src/live-stream-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 692 | **Modified**: 5 days ago

**Description**: Provides real-time integration with external stream data sources to feed the planning module. Manages action logs and visual feedback events for real-time status updates.

**Classes**: `LiveStreamIntegration`

---

### planning/src/memory-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 844 | **Modified**: 5 days ago

**Description**: Provides seamless integration between memory and planning modules, enabling access to real-time memory retrieval and event logging with configurable endpoints and retry options.

**Classes**: `MemoryIntegration`

---

### planning/src/modular-server.ts

**Staleness**: `active` (0.00) | **Lines**: 4112 | **Modified**: 0 days ago

**Description**: Provides an idle state determination service for the modular server in the planning module. Evaluates task and system states to identify the current idle reason using active and eligible task arrays and circuit breaker status.

**Key Functions**: `determineIdleReason`, `getEventDrivenThoughtGenerator`, `getBotState`, `startWorldStatePolling`, `halton`

---

### planning/src/modules/action-mapping.ts

**Staleness**: `active` (0.00) | **Lines**: 448 | **Modified**: 0 days ago

**Description**: Implements task-to-action mapping by extracting item-related keywords from task descriptions and assigning the appropriate tool name to actions. Normalizes task text for consistent item detection.

**Key Functions**: `extractItemFromTask`, `mapTaskTypeToMinecraftAction`, `mapBTActionToMinecraft`

---

### planning/src/modules/action-plan-backend.ts

**Staleness**: `active` (0.00) | **Lines**: 151 | **Modified**: 5 days ago

**Description**: Implements capability-aware routing of task requirements to appropriate planning backends within the conscious-bot architecture. Directly routes crafting, progression, and building tasks to Sterling solvers, while mapping collect/mine actions to the deterministic compiler.

**Key Functions**: `routeActionPlan`

---

### planning/src/modules/capability-registry.ts

**Staleness**: `active` (0.00) | **Lines**: 93 | **Modified**: 2 days ago

**Description**: Provides a unified registry for capability and leaf registration within the cognitive architecture of the conscious-bot. Manages storage and retrieval of registered capabilities using a map-based interface.

**Classes**: `CapabilityRegistry`, `MCPLeafRegistry`

---

### planning/src/modules/cognition-outbox.ts

**Staleness**: `active` (0.00) | **Lines**: 126 | **Modified**: 7 days ago

**Description**: Provides a non-blocking outbox for scheduling cognition POST calls such as thought acknowledgments and lifecycle events. Entries are stored in an in-memory queue and flushed every 500ms to the executor.

**Classes**: `CognitionOutbox`

---

### planning/src/modules/cognitive-stream-client.ts

**Staleness**: `active` (0.00) | **Lines**: 183 | **Modified**: 0 days ago

**Description**: ;Provides a client to fetch recent thoughts from the cognitive-stream endpoint of the conscious-bot Cognition service for task conversion.; Uses the CognitiveStreamClient to parse thoughts and determine if they are convertEligible.; Decouples the HTT

**Classes**: `CognitiveStreamClient`

---

### planning/src/modules/executable-step.ts

**Staleness**: `active` (0.00) | **Lines**: 10 | **Modified**: 7 days ago

**Description**: Implements execution logic for planning steps by setting `meta.executable` for leaf steps lacking it, enabling the conscious-bot to determine which tasks are ready for direct execution. Provides helper functions to normalize and check the executability of planning steps.

**Key Functions**: `normalizeStepExecutability`, `isExecutableStep`

---

### planning/src/modules/inventory-helpers.ts

**Staleness**: `active` (0.00) | **Lines**: 74 | **Modified**: 5 days ago

**Description**: Provides inventory helper functions for the planning module within conscious-bot. Implements checks for pickaxes (wooden, stone), logs, planks, and crafting table items.

**Key Functions**: `itemMatches`, `countItems`, `hasPickaxe`, `hasEnoughLogs`, `hasStonePickaxe`

---

### planning/src/modules/keep-alive-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 529 | **Modified**: 0 days ago

**Description**: Implements the keep-alive integration logic for the conscious-bot's planning system. Binds the KeepAliveController to the planner's decision process to periodically check for user activity.

**Classes**: `KeepAliveIntegration`

**Key Functions**: `createKeepAliveIntegration`

---

### planning/src/modules/leaf-arg-contracts.ts

**Staleness**: `active` (0.00) | **Lines**: 283 | **Modified**: 0 days ago

**Description**: Implements validation contracts for planning actions in the conscious-bot's leaf step execution layer. Enforces required argument shapes and types for fallback task execution.

**Key Functions**: `normalizeLeafArgs`, `validateLeafArgs`, `requirementToLeafMeta`, `requirementToFallbackPlan`

---

### planning/src/modules/logging.ts

**Staleness**: `stable` (0.20) | **Lines**: 62 | **Modified**: 159 days ago

**Staleness Indicators**:
  - Not modified in 159 days (over 3 months)

**Description**: = Provides optimized logging for the Sterling solver, limiting repetitive messages and reducing console output frequency to prevent spam. = Tracks message timestamps and suppression state per key to enforce throttling.

**Classes**: `LoggingOptimizer`

---

### planning/src/modules/mc-client.ts

**Staleness**: `active` (0.00) | **Lines**: 332 | **Modified**: 0 days ago

**Description**: Provides Minecraft client request handling with resilient HTTP calls and circuit breaker logic to ensure task execution reliability. Maintains and resets failure counters to monitor successful task completions.

**Key Functions**: `mcCircuitOpen`, `mcRecordFailure`, `mcRecordSuccess`, `mcFetch`, `waitForBotConnection`

---

### planning/src/modules/mcp-endpoints.ts

**Staleness**: `stable` (0.20) | **Lines**: 432 | **Modified**: 159 days ago

**Staleness Indicators**:
  - Not modified in 159 days (over 3 months)

**Description**: Provides RESTful endpoints for interacting with the MCP tool integration. Implements GET /mcp/status and GET /mcp/tools handlers using the MCPIntegration interface.

**Key Functions**: `createMCPEndpoints`

---

### planning/src/modules/mcp-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 1510 | **Modified**: 128 days ago

**Staleness Indicators**:
  - Not modified in 128 days (over 3 months)

**Description**: Provides seamless interface for MCP server integration within the conscious-bot planning system. Manages connection lifecycle and tool discovery with typed endpoints and retry logic.

**Classes**: `MCPIntegration`

---

### planning/src/modules/planning-bootstrap.ts

**Staleness**: `active` (0.00) | **Lines**: 62 | **Modified**: 5 days ago

**Description**: Creates planning components using default or user-provided overrides for integration, goal management, and executor behavior in the conscious-bot architecture. Facilitates flexible setup for testing and simulation by allowing partial customization.

**Key Functions**: `createPlanningBootstrap`

---

### planning/src/modules/planning-endpoints.ts

**Staleness**: `active` (0.00) | **Lines**: 1408 | **Modified**: 0 days ago

**Description**: Provides interfaces for integrating planning API endpoints into the conscious-bot architecture. Implements execution methods to orchestrate goal and task processing via the planning engine.

**Key Functions**: `getRequestId`, `inspectTaskPayload`, `inferRequirementFromEndpointParams`, `broadcastValuationUpdate`, `broadcastTaskUpdate`

---

### planning/src/modules/requirements.ts

**Staleness**: `active` (0.00) | **Lines**: 349 | **Modified**: 5 days ago

**Description**: Implements equivalence checks for task requirements within the conscious-bot planning module, determining if two requirements represent the same goal by comparing kind and target structure, enabling efficient task deduplication during the planning pr

**Key Functions**: `parseRequiredQuantityFromTitle`, `requirementsEquivalent`, `resolveRequirement`, `computeProgressFromInventory`, `computeRequirementSnapshot`

---

### planning/src/modules/server-config.ts

**Staleness**: `active` (0.00) | **Lines**: 240 | **Modified**: 2 days ago

**Description**: With the planning module, ServerConfiguration sets up and initializes the cognitive server components, including enabling or configuring MCP integration and defining endpoint mappings for the Sterling solver. It centralizes server options such as port, CORS, and MCP server settings.

**Classes**: `ServerConfiguration`

---

### planning/src/modules/solve-contract.ts

**Staleness**: `active` (0.00) | **Lines**: 201 | **Modified**: 5 days ago

**Description**: requirements: Defines required data types for task planning requests sent from the bot to Sterling. SolveInput: Provides the structured envelope for solving tasks, including current state, goals, capabilities, and progress.

---

### planning/src/modules/step-option-a-normalizer.ts

**Staleness**: `active` (0.00) | **Lines**: 123 | **Modified**: 0 days ago

**Description**: Provides executor-native Option A meta-argument validation and materialization for Sterling expansion outputs, ensuring derived steps are properly prepared before execution while tracking planning incomplete states for non-compatible or unresolved st

**Key Functions**: `materializeStepToOptionA`, `normalizeTaskStepsToOptionA`

---

### planning/src/modules/step-to-leaf-execution.ts

**Staleness**: `active` (0.00) | **Lines**: 146 | **Modified**: 0 days ago

**Description**: Implements extraction of executable leaf name and arguments from Sterling-generated task step meta, providing a structured result for the executor to translate steps into tool calls. Supports both explicit plain-object args and derived args from produces/consumes.

**Key Functions**: `isPlainObject`, `stepToLeafExecution`

---

### planning/src/modules/timeout-policy.ts

**Staleness**: `active` (0.00) | **Lines**: 60 | **Modified**: 7 days ago

**Description**: ;Provides failure classification utilities for the conscious-bot planning module, translating errors and HTTP status into consistent failure kinds such as timeout, server error, and client error to enable robust task execution and failure handling ac

**Key Functions**: `classifyFailure`

---

### planning/src/planning-runtime-config.ts

**Staleness**: `active` (0.00) | **Lines**: 210 | **Modified**: 0 days ago

**Description**: * Centralized planning runtime config. Single typed, validated configuration * derived from env at startup.

**Key Functions**: `parseRunMode`, `computeConfigDigest`, `resetPlanningRuntimeConfigForTesting`, `getPlanningRuntimeConfig`, `buildPlanningBanner`

---

### planning/src/reactive-executor/goap-types.ts

**Staleness**: `active` (0.00) | **Lines**: 254 | **Modified**: 5 days ago

**Description**: Provides the necessary interfaces for integrating task planning into the conscious-bot's reactive execution context. Implements minimal types for world state, resource tracking, and threat assessment used by the retired GOAP planner.

**Classes**: `GOAPPlanner`, `PlanRepair`

---

### planning/src/reactive-executor/minecraft-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 382 | **Modified**: 4 days ago

**Description**: from packages.minecraft-interface, runs plan steps by sending commands to the Minecraft client via the interface API, returning execution results, and integrating with the cognitive solver for step-by-step task execution.

**Classes**: `MinecraftExecutor`

---

### planning/src/reactive-executor/reactive-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 2311 | **Modified**: 0 days ago

**Description**: Provides real-time execution of GOAP plans within the reactive executor * * Integrates plan repair, safety reflex activation, and tool execution via MCP * * Enforces operational status tracking for the cognitive workflow

**Classes**: `ReactiveExecutor`, `DefaultExecutionContextBuilder`, `DefaultRealTimeAdapter`

---

### planning/src/reactive-executor/safety-reflexes.ts

**Staleness**: `active` (0.00) | **Lines**: 138 | **Modified**: 6 days ago

**Description**: * Safety Reflexes — reactive veto/pause for emergency responses. * * These are NOT deliberative planning.

**Classes**: `SafetyReflexes`

---

### planning/src/server/action-response.ts

**Staleness**: `active` (0.00) | **Lines**: 100 | **Modified**: 4 days ago

**Description**: response parser for the /action endpoint, converting MC response payloads into the standardized NormalizedActionResponse structure, enforcing the contract that ok is only true on successful leaf-level outcomes

**Key Functions**: `normalizeActionResponse`, `extractLeafError`, `extractFailureCode`

---

### planning/src/server/autonomous-executor.ts

**Staleness**: `active` (0.00) | **Lines**: 331 | **Modified**: 5 days ago

**Description**: Implements periodic execution of autonomous tasks using runCycle, with exponential backoff and circuit breaker for resilience in the conscious-bot planning system.

**Classes**: `StepRateLimiter`

**Key Functions**: `parseGeofenceConfig`, `isInsideGeofence`, `evaluateGuards`, `parseExecutorConfig`, `startAutonomousExecutor`

---

### planning/src/server/cognitive-task-handler.ts

**Staleness**: `active` (0.00) | **Lines**: 223 | **Modified**: 5 days ago

**Description**: Provides sentence-level extraction of actionable steps from cognitive reflections for the conscious-bot planning pipeline. Analyzes user thought content to identify executable commands using predefined action terms.

**Key Functions**: `detectActionableSteps`, `extractActionableSteps`, `determineActionType`, `convertCognitiveReflectionToTasks`

---

### planning/src/server/execution-gateway.ts

**Staleness**: `active` (0.00) | **Lines**: 309 | **Modified**: 4 days ago

**Description**: * ExecutionGateway — single sanctioned path for planning-side world mutations. * * Every planning-side caller that wants to cause a Minecraft world mutation * MUST go through this gateway.

**Key Functions**: `resolveMode`, `getExecutorMode`, `onGatewayAudit`, `emitAudit`, `executeViaGateway`

---

### planning/src/server/execution-readiness.ts

**Staleness**: `active` (0.00) | **Lines**: 238 | **Modified**: 0 days ago

**Description**: Provides executor enablement by probing essential services and determining readiness for the planning module. Evaluates the status of 'minecraft', 'memory', 'cognition', and 'dashboard' endpoints at periodic intervals.

**Classes**: `ReadinessMonitor`

**Key Functions**: `probeOne`, `probeServices`

---

### planning/src/server/executor-circuit-breaker.ts

**Staleness**: `active` (0.00) | **Lines**: 128 | **Modified**: 4 days ago

**Description**: Provides infra error detection and controlled pause for task scheduling. Trips the circuit breaker on systemic errors, tracks retry count, and enforces exponential backoff to avoid task-level over-retry during outages.

**Key Functions**: `tripCircuitBreaker`, `recordSuccess`, `isCircuitBreakerOpen`, `getCircuitBreakerState`

---

### planning/src/server/gateway-wrappers.ts

**Staleness**: `active` (0.00) | **Lines**: 115 | **Modified**: 4 days ago

**Description**: , the `executeTaskViaGateway` function ensures task context is properly attached to actions from the executor, requiring a `taskId` for every invocation to maintain correlation and lease tracking. The wrappers replace unsafe direct calls with typed, structured requests to the gateway, improving safety and clarity.

**Key Functions**: `executeTaskViaGateway`, `executeReactiveViaGateway`, `executeSafetyViaGateway`, `executeCognitionViaGateway`

---

### planning/src/server/sterling-bootstrap.ts

**Staleness**: `active` (0.00) | **Lines**: 122 | **Modified**: 1 days ago

**Description**: Provides initialization and registration of SterlingReasoningService and various Minecraft solvers within the planning module. Integrates and configures the solver registry with task processing capabilities for crafting, building, tool progression, and navigation.

**Key Functions**: `createSterlingBootstrap`

---

### planning/src/server/task-action-resolver.ts

**Staleness**: `active` (0.00) | **Lines**: 908 | **Modified**: 1 days ago

**Description**: * Centralized Task → Action Parameter Resolver * * Every execution path (reactive, autonomous, BT tool executor) must use this * resolver to turn a task into gateway-ready action args. If the resolver * cannot produce valid args, it fails deterministically (no backoff, no retries).

**Key Functions**: `resolveActionFromTask`, `resolveCraftAction`, `resolveMineAction`, `resolveGatherAction`, `resolveExploreAction`

---

### planning/src/server/task-block-evaluator.ts

**Staleness**: `active` (0.00) | **Lines**: 148 | **Modified**: 0 days ago

**Description**: Provides evaluation functions for task block states in the planning module of conscious-bot. Enforces TTL and fail behaviors using the BlockEvaluableTask interface.

**Key Functions**: `shouldAutoUnblockTask`, `evaluateTaskBlockState`, `isTaskEligible`

---

### planning/src/signal-extraction-pipeline.ts

**Staleness**: `active` (0.00) | **Lines**: 606 | **Modified**: 5 days ago

**Description**: Provides a modular signal extraction framework for the planning module of conscious-bot.

**Classes**: `SignalExtractionPipeline`, `MemoryBackedExtractor`, `LLMExtractor`, `HeuristicExtractor`

---

### planning/src/skill-integration/llm-skill-composer.ts

**Staleness**: `active` (0.00) | **Lines**: 1008 | **Modified**: 5 days ago

**Description**: * LLM Skill Composer - Integrates Language Models with Skill Composition * * This enhanced version of the SkillComposer uses language models to: * - Refine and expand goal descriptions * - Generate new skill combinations * - Analyze execution feedbac

**Classes**: `LLMSkillComposer`

---

### planning/src/skill-integration/mcp-capabilities-adapter.ts

**Staleness**: `active` (0.00) | **Lines**: 837 | **Modified**: 5 days ago

**Description**: Provides dynamic capability execution for the planning system in the conscious-bot architecture. Adapts user capabilities to execution requests using the CapabilityRegistry and executes shadow runs via the MCP interface.

**Classes**: `DynamicCreationFlow`, `ExecError`, `MCPCapabilitiesAdapter`

---

### planning/src/skill-integration/mcp-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 1298 | **Modified**: 5 days ago

**Description**: Provides dynamic capability registration and LLM-assisted skill composition for the conscious-bot planner module. Integrates with the MCPSkillConfig to enable adaptive task decomposition and execution.

**Classes**: `DynamicCreationFlow`, `MCPSkillIntegration`, `DefaultAdaptiveCapabilitySelector`

---

### planning/src/skill-integration/skill-composer-adapter.ts

**Staleness**: `stable` (0.20) | **Lines**: 639 | **Modified**: 138 days ago

**Staleness Indicators**:
  - Not modified in 138 days (over 3 months)

**Description**: ;Implements skill composition logic to dynamically build and integrate skills with the conscious-bot planner using SkillRegistry interactions and Skill metadata.

**Classes**: `SkillRegistry`, `SkillComposerAdapter`

---

### planning/src/skill-integration/skill-planner-adapter.ts

**Staleness**: `active` (0.00) | **Lines**: 805 | **Modified**: 6 days ago

**Description**: Provides skill-based task decomposition by mapping SkillRegistry entries to PlanNode structures for BehaviorTreeRunner integration in the cognitive planning layer.

**Classes**: `SkillRegistry`, `SkillPlannerAdapter`

---

### planning/src/skill-integration/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 116 | **Modified**: 158 days ago

**Staleness Indicators**:
  - Not modified in 158 days (over 3 months)

**Description**: Provides type definitions for composing and executing skills in the conscious-bot planning module. Defines interfaces for ExecutionStep, ComposedSkill, and ExecutionContext to model task integration and resource constraints.

---

### planning/src/startup-barrier.ts

**Staleness**: `active` (0.00) | **Lines**: 65 | **Modified**: 5 days ago

**Description**: provides setReadinessMonitor, getReadinessMonitor, isServiceReachable.

**Key Functions**: `setReadinessMonitor`, `getReadinessMonitor`, `isServiceReachable`, `isSystemReady`, `getSystemReadyState`

---

### planning/src/sterling/base-domain-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 525 | **Modified**: 3 days ago

**Description**: Implements the base domain solver for Sterling, providing plan parameter validation and solve logic. Handles episode reporting, identity field tracking, and operator registry management.

**Classes**: `BaseDomainSolver`

**Key Functions**: `isReportIdentityFieldsEnabled`, `buildLatchKey`, `areIdentityFieldsRejected`, `latchIdentityFieldsRejected`, `logIdentityFieldStatusOnce`

---

### planning/src/sterling/compat-linter.ts

**Staleness**: `active` (0.00) | **Lines**: 418 | **Modified**: 3 days ago

**Description**: Implements Sterling's compatibility linter to validate task rules against known hazards and enforce code constraints during CI. Evaluates rule structure and numeric requirements, issues detailed reports for violations, and integrates with the planning solver only when acquire hardening is enabled or the specific solverId is set.

**Key Functions**: `lintRules`, `lintGoal`

---

### planning/src/sterling/degeneracy-detection.ts

**Staleness**: `active` (0.00) | **Lines**: 73 | **Modified**: 5 days ago

**Description**: * * Implements strategy degeneracy detection for the conscious-bot planner by evaluating the cost spread among top-ranked candidates. * Flags a degenerate situation when top strategies’ costs are nearly equal within a given epsilon.

**Key Functions**: `detectStrategyDegeneracy`

---

### planning/src/sterling/domain-declaration.ts

**Staleness**: `active` (0.00) | **Lines**: 189 | **Modified**: 4 days ago

**Description**: * Domain Declaration V1 * * Cross-boundary claim object that a solver sends to Sterling to register * what capabilities it provides. Sterling stores these in an in-memory * registry keyed by content-addressed digest.

**Key Functions**: `computeDeclarationDigest`, `computeRegistrationDigest`, `validateDeclaration`, `buildRegisterMessage`, `buildGetMessage`

---

### planning/src/sterling/episode-classification.ts

**Staleness**: `active` (0.00) | **Lines**: 237 | **Modified**: 3 days ago

**Description**: outcome classification system within the conscious-bot planning module, mapping solveBundle signals to standardized episode outcomes using predefined join keys and fallback string matching on error fields for D8 episodes.

**Classes**: `from`

**Key Functions**: `extractSolveJoinKeys`, `buildSterlingEpisodeLinkage`, `classifyOutcome`, `buildSterlingEpisodeLinkageFromResult`

---

### planning/src/sterling/label-utils.ts

**Staleness**: `active` (0.00) | **Lines**: 45 | **Modified**: 5 days ago

**Description**: Provides mapping of degraded edge labels for task integration in the Sterling solver. Implements a MappingDegradation interface that marks steps as degraded.

**Key Functions**: `extractActionName`

---

### planning/src/sterling/leaf-routing.ts

**Staleness**: `active` (0.00) | **Lines**: 111 | **Modified**: 5 days ago

**Description**: Provides the mapping from action types to leaf names for the planning module in the conscious-bot architecture, enabling the crafting solvers to route intentions correctly. Centralizes the 'crafting' and 'place' dispatch logic to enforce domain-specific action handling.

**Key Functions**: `parsePlaceAction`, `actionTypeToLeaf`, `actionTypeToLeafExtended`, `derivePlaceMeta`, `estimateDuration`

---

### planning/src/sterling/minecraft-acquisition-priors.ts

**Staleness**: `active` (0.00) | **Lines**: 131 | **Modified**: 5 days ago

**Description**: * Minecraft Acquisition Strategy Priors (Rig D) * * In-memory prior store for acquisition strategy learning. * Prior updates are execution-grounded: planId is required.

**Classes**: `StrategyPriorStore`

---

### planning/src/sterling/minecraft-acquisition-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 499 | **Modified**: 5 days ago

**Description**: * Minecraft Acquisition Rules (Rig D) * * Strategy enumeration, ranking, and context building for multi-strategy * item acquisition. Builds AcquisitionContextV1 from raw world state and * enumerates viable strategies with cost estimates.

**Key Functions**: `distanceToBucket`, `buildAcquisitionContext`, `buildAcquisitionStrategies`, `buildMineCandidate`, `buildTradeCandidate`

---

### planning/src/sterling/minecraft-acquisition-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 680 | **Modified**: 3 days ago

**Description**: Implements coordinated acquisition planning in conscious-bot’s planning module. Delegates sub-solvers for mining and salvage/trade strategies using SterlingCraftingSolver and Sterling (trade/loot) logic.

**Classes**: `MinecraftAcquisitionSolver`

**Key Functions**: `buildTradeRules`, `buildLootRules`, `buildSalvageRules`

---

### planning/src/sterling/minecraft-acquisition-types.ts

**Staleness**: `active` (0.00) | **Lines**: 226 | **Modified**: 4 days ago

**Description**: , the `minecraft-acquisition-types` module in the `planning` package provides structured, bucketed world state types for the acquisition solver in conscious-bot, enabling efficient and abstraction-rich coordination between sub-strategies like mine, t

**Classes**: `field`

**Key Functions**: `hashAcquisitionContext`, `lexCmp`, `costToMillis`, `computeCandidateSetDigest`

---

### planning/src/sterling/minecraft-building-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 227 | **Modified**: 9 days ago

**Description**: rules engine that converts world observations into feasible building modules using placementFeasible and siteCaps checks

**Key Functions**: `buildModulesWithFeasibility`, `inventoryForBuilding`, `getRelevantMaterials`, `buildSiteState`, `computeSiteCaps`

---

### planning/src/sterling/minecraft-building-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 565 | **Modified**: 3 days ago

**Description**: Implements building task integration by converting Sterling's solution into a TaskStep array, enforcing dependency and support constraints to ensure feasibility, and manages material deficits by extracting required items and coordinating retry logic 

**Classes**: `MinecraftBuildingSolver`

---

### planning/src/sterling/minecraft-building-types.ts

**Staleness**: `active` (0.00) | **Lines**: 168 | **Modified**: 4 days ago

**Description**: Provides type definitions for building modules used by the conscious-bot's planning solver, tracking required materials and module dependencies without inventory mutation.

---

### planning/src/sterling/minecraft-crafting-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 265 | **Modified**: 4 days ago

**Description**: types provides type definitions for Mineflayer's Minecraft data structures used in the conscious-bot's planning module. It validates and normalizes recipes and items for accurate dependency tracing in goal-driven crafting tasks.

**Key Functions**: `isValidMcData`, `buildCraftingRules`, `trace`, `inventoryToRecord`, `goalFromTaskRequirement`

---

### planning/src/sterling/minecraft-crafting-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 533 | **Modified**: 3 days ago

**Description**: Provides crafting solution generation for the conscious-bot's planning module. Builds Minecraft crafting rules from mcData and interfaces with Sterling for optimal recipes.

**Classes**: `MinecraftCraftingSolver`

---

### planning/src/sterling/minecraft-crafting-types.ts

**Staleness**: `active` (0.00) | **Lines**: 119 | **Modified**: 4 days ago

**Description**: * Minecraft Crafting Domain Type Definitions * * Types for integrating Minecraft crafting with Sterling's graph-search solver. * The crafting domain models inventory states as graph nodes and crafting/mining * actions as edges, allowing Sterling's A* with path-algebra learning to find * optimal crafting sequences.

---

### planning/src/sterling/minecraft-furnace-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 186 | **Modified**: 5 days ago

**Description**: * Furnace Scheduling Rule Builder * * Generates typed operators for the four furnace operator families: * - load_furnace: Place item into furnace slot * - add_fuel: Add fuel to furnace * - wait_tick: Wait for smelting to complete * - retrieve_output:

**Key Functions**: `buildFurnaceRules`, `buildFurnaceGoal`, `checkSlotPrecondition`

---

### planning/src/sterling/minecraft-furnace-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 304 | **Modified**: 3 days ago

**Description**: ts: Provides the planning solver for Minecraft furnace operations by constructing rules, executing with Sterling, and returning structured solve steps.

**Classes**: `MinecraftFurnaceSolver`

---

### planning/src/sterling/minecraft-furnace-types.ts

**Staleness**: `active` (0.00) | **Lines**: 173 | **Modified**: 4 days ago

**Description**: Implements FurnaceSearchState for the conscious-bot planning module, encapsulating the current schedule hash and necessary metadata for efficient state comparison during planning and solving. Maintains a consistent representation required by the Sterling solver to ensure hashable and comparable search states.

---

### planning/src/sterling/minecraft-navigation-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 370 | **Modified**: 3 days ago

**Description**: * Minecraft Navigation Solver * * Orchestrates navigation solves: builds occupancy grid payload, sends to * Sterling, and maps results to NavigationPrimitive[] for the leaf. * * Pattern follows MinecraftCraftingSolver: validate → build payload → * send to Sterling → extract planId → create SolveBundle → return.

**Classes**: `MinecraftNavigationSolver`

---

### planning/src/sterling/minecraft-navigation-types.ts

**Staleness**: `active` (0.00) | **Lines**: 311 | **Modified**: 4 days ago

**Description**: Provides OccupancyGrid representations for the Sterling navigation system in the conscious-bot's planning module. Encodes block states using defined types, supports passability checks (only air is passable), and enables spatial reasoning for pathfinding in Phase 1 movement constraints.

**Key Functions**: `gridAt`, `isPassable`, `isSolid`, `hashOccupancyGrid`, `encodeGridToBase64`

---

### planning/src/sterling/minecraft-tool-progression-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 514 | **Modified**: 9 days ago

**Description**: and returns a capability-gated rule graph for advancing Sterling's pickaxe tier, linking required tools and ores via frozen progression matrix and ensuring only unlocked capabilities can enable next tier

**Key Functions**: `buildToolProgressionRules`, `detectCurrentTier`, `parseToolName`, `validateInventoryInput`, `filterCapTokens`

---

### planning/src/sterling/minecraft-tool-progression-solver.ts

**Staleness**: `active` (0.00) | **Lines**: 638 | **Modified**: 3 days ago

**Description**: Provides tool progression pathfinding for the conscious-bot's planning module using Sterling's graph search. Constructs upgrade sequences from capability requirements and validates tool acquisition steps via capability tokens.

**Classes**: `MinecraftToolProgressionSolver`

---

### planning/src/sterling/minecraft-tool-progression-types.ts

**Staleness**: `active` (0.00) | **Lines**: 290 | **Modified**: 4 days ago

**Description**: classifies tool upgrades as directed graph edges between tiers, defines virtual capability tokens for Sterling's reasoning, and enforces progression constraints during planning.

---

### planning/src/sterling/minecraft-valuation-emitter.ts

**Staleness**: `active` (0.00) | **Lines**: 161 | **Modified**: 3 days ago

**Description**: Provides a pluggable interface for emitting valuation updates in the planning layer. Implements the ValuationEventSink via SSE in the current design.

**Key Functions**: `createBroadcastValuationSink`, `createSSEValuationSink`, `createValuationEmitter`

---

### planning/src/sterling/minecraft-valuation-record-types.ts

**Staleness**: `active` (0.00) | **Lines**: 215 | **Modified**: 4 days ago

**Description**: for the conscious-bot planning module, provides typed definitions for valuation decision records used by the Sterling solver to track and compare inventory states during decision making, ensuring deterministic decision IDs and event emissions, and em

**Key Functions**: `nextEventId`, `canonicalizeInput`, `computeDecisionHash`, `createDecisionRecord`, `createValuationEvent`

---

### planning/src/sterling/minecraft-valuation-rules.ts

**Staleness**: `active` (0.00) | **Lines**: 217 | **Modified**: 4 days ago

**Description**: * Minecraft Valuation Rules (Rig F) * * Static item classification table, scoring logic, and ruleset builder. * First-match-wins linear scan.

**Classes**: `for`

**Key Functions**: `scoreItem`, `buildDefaultRuleset`, `computeRulesetDigest`, `lintClassificationTable`

---

### planning/src/sterling/minecraft-valuation-types.ts

**Staleness**: `active` (0.00) | **Lines**: 328 | **Modified**: 4 days ago

**Description**: Provides certified inventory valuation decisions for the conscious-bot's planning module, using inlined constants to ensure versioned policy rules and deterministic action digests. Processes inventory snapshot, scarcity budget, and context tokens to produce auditable keep/drop/store plans.

**Key Functions**: `lexCmp`, `deriveEffectiveInventory`, `computeValuationInputDigest`, `computeDecisionDigest`

---

### planning/src/sterling/minecraft-valuation-verifier-fast.ts

**Staleness**: `active` (0.00) | **Lines**: 133 | **Modified**: 4 days ago

**Description**: Provides fast input digest verification for planning tasks in the conscious-bot, ensuring raw inputs match computed digests without executing semantic checks or solver logic. Only imports necessary digest calculation functions and maintains strict hash integrity validation for planning records.

**Key Functions**: `checkInputDigestMatch`, `checkDecisionDigestMatch`, `checkInventoryStateHashMatch`, `checkRecordHashIntegrity`, `checkRulesetDigestMatch`

---

### planning/src/sterling/minecraft-valuation-verifier-full.ts

**Staleness**: `active` (0.00) | **Lines**: 123 | **Modified**: 4 days ago

**Description**: Implements full valuation plan verification for the conscious-bot's planning module. Imports the record and solver to deep-equality replay decisions, comparing key bindings and action paths.

**Key Functions**: `verifyValuationFull`

---

### planning/src/sterling/minecraft-valuation-verifier.ts

**Staleness**: `active` (0.00) | **Lines**: 14 | **Modified**: 4 days ago

**Description**: Verifies task valuations for the conscious-bot's planning process using distinct server and client validators. Provides fast and full verification strategies to ensure plan feasibility before execution.

---

### planning/src/sterling/minecraft-valuation.ts

**Staleness**: `active` (0.00) | **Lines**: 438 | **Modified**: 4 days ago

**Description**: * Minecraft Valuation Solver (Rig F) * * Pure TS-local certified decision module. Given an inventory snapshot, * scarcity budget, and observed context tokens, produces a deterministic, * auditable inventory action plan (keep/drop/store per item).

**Key Functions**: `computeValuationPlan`, `scoreToReasonCode`, `buildWitness`, `buildMinimalErrorWitness`, `makeErrorPlan`

---

### planning/src/sterling/primitive-namespace.ts

**Staleness**: `active` (0.00) | **Lines**: 187 | **Modified**: 4 days ago

**Description**: Provides type definitions for domain and engine-level primitives in the conscious-bot planning module, ensuring only qualified IDs are used for capability claims and registration.

**Key Functions**: `isQualifiedPrimitiveId`, `assertQualifiedPrimitiveIds`, `getEngineDependencies`

---

### planning/src/sterling/primitives/p03/p03-capsule-types.ts

**Staleness**: `active` (0.00) | **Lines**: 308 | **Modified**: 5 days ago

**Description**: buckets, encapsulates current time and planning horizon for domain-specific temporal integration within the conscious-bot planning system. Requires integer time values and provides a deterministic slot selection mechanism for task execution.

---

### planning/src/sterling/primitives/p03/p03-reference-adapter.ts

**Staleness**: `active` (0.00) | **Lines**: 167 | **Modified**: 5 days ago

**Description**: Provides a domain-agnostic P03TemporalAdapter implementation for the planning module in conscious-bot. Ensures all temporal state invariants by validating bucket values during initialization and canonicalization.

**Classes**: `P03ReferenceAdapter`

**Key Functions**: `assertNonNegativeInteger`

---

### planning/src/sterling/primitives/p03/p03-reference-fixtures.ts

**Staleness**: `active` (0.00) | **Lines**: 343 | **Modified**: 5 days ago

**Description**: with domain A, provides reference data for smelting operations, including resource slots, operator durations, and batch thresholds for accurate simulation and planning in the cognition module.

---

### planning/src/sterling/primitives/p21/p21-capsule-types.ts

**Staleness**: `active` (0.00) | **Lines**: 295 | **Modified**: 5 days ago

**Description**: * P21 Primitive Capsule — Domain-Agnostic Types * * Defines the contract for entity belief maintenance and saliency * as a portable primitive that any domain can implement. * * Zero Minecraft imports.

**Classes**: `labels`

---

### planning/src/sterling/primitives/p21/p21-reference-fixtures.ts

**Staleness**: `active` (0.00) | **Lines**: 410 | **Modified**: 6 days ago

**Description**: Provides reference risk classifiers for both hostile mobs and security intrusions in the planning domain. Implements distinct risk-classify logic using closure-based strategies for safety and accuracy.

**Key Functions**: `item`

---

### planning/src/sterling/search-health.ts

**Staleness**: `active` (0.00) | **Lines**: 154 | **Modified**: 7 days ago

**Description**: * Search Health Parser & Degeneracy Detector * * Parses heuristic diagnostics from Sterling's A* search metrics * and detects search degeneracy patterns.

**Key Functions**: `parseSearchHealth`, `detectHeuristicDegeneracy`, `asNumber`, `asTerminationReason`

---

### planning/src/sterling/signals-rig-d.ts

**Staleness**: `active` (0.00) | **Lines**: 85 | **Modified**: 5 days ago

**Description**: Provides diagnostic signals for the Sterling planner by extracting key metrics from an AcquisitionSolveResult and optional StrategyPriorStore, including strategy count, selected strategy, and prior update status.

**Key Functions**: `computeRigDSignals`, `detectRankingDegeneracy`

---

### planning/src/sterling/solve-bundle-types.ts

**Staleness**: `active` (0.00) | **Lines**: 343 | **Modified**: 3 days ago

**Description**: for the conscious-bot's planning module, this file defines structured types for audit trails, preflight rule validation reports, and diagnostic metrics for the Sterling solver, ensuring type safety and consistent tracking of solve inputs, rule versio

**Classes**: `was`

---

### planning/src/sterling/solve-bundle.ts

**Staleness**: `active` (0.00) | **Lines**: 482 | **Modified**: 4 days ago

**Description**: * Solve Bundle Computation * * Content-addressed hashing utilities and bundle computation for Sterling * solve round-trips. Uses SHA-256 truncated to 16 hex chars via Node crypto.

**Classes**: `CanonicalizeError`

**Key Functions**: `canonicalize`, `canonicalizeValue`, `contentHash`, `hashDefinition`, `extractSortKey`

---

### planning/src/sterling/solver-ids.ts

**Staleness**: `active` (0.00) | **Lines**: 68 | **Modified**: 3 days ago

**Description**: consistency is ensured by providing type-safe solver ID constants and a derived SolverId type for the planning module in the conscious-bot architecture

**Classes**: `definitions`

**Key Functions**: `isValidSolverId`, `getAcquisitionStrategySolverId`

---

### planning/src/sterling/sterling-reasoning-service.ts

**Staleness**: `active` (0.00) | **Lines**: 480 | **Modified**: 0 days ago

**Description**: Provides semantic pathfinding between concepts using the SterlingClient. Implements knowledge graph traversal for planning goals and returns detailed reachability results.

**Classes**: `SterlingReasoningService`

---

### planning/src/task-integration.ts

**Staleness**: `active` (0.00) | **Lines**: 4182 | **Modified**: 0 days ago

**Description**: Implements task orchestration by coordinating Sterling Solver with the task store and converting cognitive thoughts into actionable task steps. Integrates real-time progress updates via CognitionOutbox and TaskDashboard API.

**Classes**: `TaskIntegration`, `from`

**Key Functions**: `canonicalizeIntentParams`, `inferTaskOrigin`, `projectIncomingMetadata`, `getSterlingDedupeKeyFromMetadata`, `applyTaskBlock`

---

### planning/src/task-integration/build-task-from-requirement.ts

**Staleness**: `active` (0.00) | **Lines**: 107 | **Modified**: 4 days ago

**Description**: Builds sub-task instances with guaranteed `parameters.requirementCandidate` fields, ensuring the planner can resolve dependencies for internal task execution.

**Key Functions**: `computeSubtaskKey`, `buildTaskFromRequirement`

---

### planning/src/task-integration/sterling-planner.ts

**Staleness**: `active` (0.00) | **Lines**: 907 | **Modified**: 1 days ago

**Description**: Implements Sterling-based dynamic step generation for task planning within the conscious-bot architecture, integrating domain solvers and macro planning to produce executable task steps using routeActionPlan and macro session management.

**Classes**: `SterlingPlanner`

**Key Functions**: `getAcquisitionGoalItem`, `deriveLeafArgs`, `ensureSolverMeta`

---

### planning/src/task-integration/task-management-handler.ts

**Staleness**: `active` (0.00) | **Lines**: 295 | **Modified**: 1 days ago

**Description**: Implements management of task state via explicit Sterling management payloads, validating and applying actions such as cancel, pause, and resume to task store entries. Handles transitions as defined in the task status transition table, ensuring only authorized management events are processed.

**Classes**: `TaskManagementHandler`

---

### planning/src/task-integration/task-store.ts

**Staleness**: `active` (0.00) | **Lines**: 329 | **Modified**: 1 days ago

**Description**: currentTaskStore maintains references to tasks without copy-on-write isolation, enabling real-time updates for all task accessors and observers.

**Classes**: `TaskStore`

**Key Functions**: `calculateTitleSimilarity`, `createEmptyStatistics`

---

### planning/src/task-integration/thought-to-task-converter.ts

**Staleness**: `active` (0.00) | **Lines**: 292 | **Modified**: 0 days ago

**Description**: Provides explicit conversion from Sterling reduction artifacts to task representations. Implements the thought-to-task mapping, enforcing strict adherence to reduction data only.

**Key Functions**: `isDigestDuplicate`, `calculateTaskPriority`, `calculateTaskUrgency`, `extractSterlingManagementAction`, `resolveReduction`

---

### planning/src/temporal/batch-operators.ts

**Staleness**: `active` (0.00) | **Lines**: 97 | **Modified**: 5 days ago

**Description**: Provides batch operator definitions for smelting items in the Minecraft domain for the conscious-bot's planning module. Implements per-item and total batch durations using P03BatchOperatorV1 capsule.

**Key Functions**: `getBatchHint`

---

### planning/src/temporal/capacity-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 73 | **Modified**: 5 days ago

**Description**: Implements slot reservation logic for the planning module, delegating to the P03TemporalAdapter to advance the target slot’s bucket and return a new reserved state array. Ensures immutability of input slots.

**Key Functions**: `canonicalizeState`, `findSlot`, `reserveSlot`, `getEarliestAvailableBucket`

---

### planning/src/temporal/deadlock-prevention.ts

**Staleness**: `active` (0.00) | **Lines**: 83 | **Modified**: 5 days ago

**Description**: slot need derivation for planning, conservatively adding required slot types from crafting rules and treating needsFurnace as requiring a furnace slot

**Key Functions**: `deriveSlotNeeds`, `checkDeadlockForRules`, `checkDeadlock`

---

### planning/src/temporal/duration-model.ts

**Staleness**: `active` (0.00) | **Lines**: 101 | **Modified**: 5 days ago

**Description**: Implements a static mapping of Minecraft actions to their temporal properties for task planning. Provides lookup for duration and slot requirements for operators like smelt and craft.

**Key Functions**: `findDuration`, `computeDurationTicks`, `annotateRuleWithDuration`

---

### planning/src/temporal/makespan-objective.ts

**Staleness**: `active` (0.00) | **Lines**: 56 | **Modified**: 5 days ago

**Description**: Provides a pure function to compute the temporal cost of a planned step by blending base and duration-based components using a configurable weight, enabling the cognitive module to evaluate scheduling efficiency for the A* planner.

**Key Functions**: `computeMakespan`, `computeTemporalCost`

---

### planning/src/temporal/temporal-enrichment.ts

**Staleness**: `active` (0.00) | **Lines**: 153 | **Modified**: 5 days ago

**Description**: * Temporal Enrichment — Single Orchestration Entrypoint * * Answers: given goal + rules + observed context + mode, what temporal * enrichments apply and is it deadlocked? * * Three modes: * 'off' — No temporal processing.

**Key Functions**: `computeTemporalEnrichment`

---

### planning/src/temporal/time-state.ts

**Staleness**: `active` (0.00) | **Lines**: 163 | **Modified**: 5 days ago

**Description**: Provides a domain-specific conversion for the temporal state module within the conscious-bot planning architecture, translating Minecraft observations into P03TemporalStateV1 capsule representations using bucket-sized time units. Ensures all temporal context fits within the defined horizon and wait bounds for resource slots.

**Key Functions**: `inferSlotsFromBlocks`, `toTickBucket`, `makeTemporalState`

---

### planning/src/types.ts

**Staleness**: `active` (0.00) | **Lines**: 706 | **Modified**: 6 days ago

**Description**: Provides type definitions for goal formulation in the conscious-bot planning module. Defines interfaces and enums for goal types, priority levels, and status tracking.

---

### planning/src/types/cognition-types.ts

**Staleness**: `stable` (0.20) | **Lines**: 73 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides event-driven thought generation types for the planning module in the conscious-bot architecture. Implements the EventDrivenThoughtGenerator interface to produce contextual thoughts in response to BotLifecycleEvent messages.

---

### planning/src/types/task-step.ts

**Staleness**: `active` (0.00) | **Lines**: 37 | **Modified**: 7 days ago

**Description**: – Defines the canonical TaskStep type used by the planning solver and task-integration modules. – Provides structured metadata for step execution, including source, leaf, and consumption details.

---

### planning/src/types/task.ts

**Staleness**: `active` (0.00) | **Lines**: 297 | **Modified**: 0 days ago

**Description**: Provides types for task integration within the conscious-bot planning module. Defines the structure for tasks including status, progress, parameters, and failure codes for resilient execution.

---

### planning/src/world-state/world-knowledge-integrator.ts

**Staleness**: `active` (0.00) | **Lines**: 352 | **Modified**: 5 days ago

**Description**: Implements integration of world observations with semantic memory, mapping entities and resources to normalized identifiers and updating the KnowledgeGraph using the WorldStateManager.

**Classes**: `WorldKnowledgeIntegrator`

**Key Functions**: `createSemanticMemory`, `normalizeItemName`

---

### planning/src/world-state/world-state-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 249 | **Modified**: 5 days ago

**Description**: Implements periodic world state polling for the conscious-bot's planning module, tracking agent position, inventory, and environmental factors via a WorldStateSnapshot; emits events on state changes and schedules timed polling using Node.js Timeout A

**Classes**: `WorldStateManager`

---

## Test scenarios and evaluation

### evaluation/src/benchmarking/performance-benchmark-runner.ts

**Staleness**: `stable` (0.20) | **Lines**: 637 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: * Performance Benchmark Runner * * Comprehensive automated performance benchmarking system for the Conscious Bot. * Tests system performance across various dimensions including memory operations, * cognitive processing, planning, safety systems, and end-to-end scenarios.

**Classes**: `PerformanceBenchmarkRunner`

---

### evaluation/src/benchmarking/performance-benchmarker.ts

**Staleness**: `stable` (0.20) | **Lines**: 966 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements a benchmarking suite to evaluate the performance of the conscious-bot across tasks, providing statistical analysis and regression detection to ensure consistent behavior. Exposes a configurable interface for defining test scenarios, execution parameters, and reporting options.

**Classes**: `PerformanceBenchmarker`, `StatisticalAnalyzer`, `RegressionDetector`

---

### evaluation/src/benchmarking/run-benchmarks.ts

**Staleness**: `stable` (0.20) | **Lines**: 213 | **Modified**: 132 days ago

**Staleness Indicators**:
  - Not modified in 132 days (over 3 months)

**Description**: * Performance Benchmark Runner Script * * Command-line script to run automated performance benchmarks for the Conscious Bot. * Can be integrated into CI/CD pipelines or run manually for performance monitoring.

**Key Functions**: `parseArguments`, `main`

---

### evaluation/src/curriculum/curriculum-builder.ts

**Staleness**: `stable` (0.20) | **Lines**: 821 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: assessment kit generator for evaluating conscious-bot's skill acquisition progress

**Classes**: `CurriculumBuilder`

---

### evaluation/src/curriculum/curriculum-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 993 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements CurriculumManager, orchestrates creation and modification of test curricula for the conscious-bot, tracks execution progress and generates comprehensive evaluation reports.

**Classes**: `CurriculumManager`

---

### evaluation/src/curriculum/regression-suite.ts

**Staleness**: `stable` (0.20) | **Lines**: 715 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements regression test execution framework for the curriculum, orchestrating test scheduling and result aggregation across performance and quality gates. Manages test cases, computes pass/fail status, and evaluates criteria to ensure curriculum adherence and system integrity.

**Classes**: `RegressionSuiteManager`

---

### evaluation/src/curriculum/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 514 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides type definitions for organizing and evaluating skills within the conscious-bot curriculum. Implements structured schema for learning objectives, assessment criteria, and skill dependencies.

---

### evaluation/src/dashboard/evaluation-dashboard.ts

**Staleness**: `stable` (0.20) | **Lines**: 943 | **Modified**: 114 days ago

**Staleness Indicators**:
  - Not modified in 114 days (over 3 months)

**Description**: output: Displays evaluation metrics in real-time using a customizable dashboard, supports selecting metrics and scenarios to monitor, and provides alerting for deviations in results

**Classes**: `EvaluationDashboard`

---

### evaluation/src/metrics/performance-analyzer.ts

**Staleness**: `stable` (0.20) | **Lines**: 915 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: * Performance Analyzer * * Analyzes evaluation results across multiple dimensions to assess * the cognitive architecture's performance on complex reasoning tasks * * @author @darianrosebrook

**Classes**: `PerformanceAnalyzer`

---

### evaluation/src/regression/regression-monitor.ts

**Staleness**: `stable` (0.20) | **Lines**: 1042 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a comprehensive regression detection system for the conscious-bot, monitoring performance metrics over time and comparing them against baselines. Evaluates and identifies warning and critical degradation using configurable thresholds and statistical analysis.

**Classes**: `RegressionMonitor`

---

### evaluation/src/scenarios/complex-reasoning-scenarios.ts

**Staleness**: `stable` (0.20) | **Lines**: 589 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides a set of navigation-based scenarios to evaluate the core spatial reasoning capabilities of the cognitive architecture within the conscious-bot system. Enforces multi-step problem-solving via maze navigation tasks that require planning and decision-making under simple spatial constraints.

---

### evaluation/src/scenarios/minedojo-scenarios.ts

**Staleness**: `stable` (0.20) | **Lines**: 886 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements a set of MineDojo-style survival scenarios for evaluating the conscious-bot's ability to collect wood in a forest biome. Provides structured initial states, constraints, and diverse success metrics to assess resource gathering performance.

---

### evaluation/src/scenarios/scenario-manager.ts

**Staleness**: `active` (0.00) | **Lines**: 924 | **Modified**: 5 days ago

**Description**: Implements scenario execution by coordinating step-by-step reasoning and outcome validation within the evaluation framework. Manages the flow of input steps, tracks agent decisions, and compares results to expected outcomes using the integrated planning system.

**Classes**: `ScenarioManager`

**Key Functions**: `createIntegratedPlanningSystem`

---

### evaluation/src/testing/postgres-test-container.ts

**Staleness**: `active` (0.00) | **Lines**: 180 | **Modified**: 8 days ago

**Description**: Defines MockEmbeddingService and provides createMemoryFixture, createMemorySeed.

**Classes**: `MockEmbeddingService`

**Key Functions**: `createMemoryFixture`, `createMemorySeed`

---

### evaluation/src/thought-generator-test.ts

**Staleness**: `stable` (0.20) | **Lines**: 86 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Implements test scenarios for the conscious-bot's thought generator by initializing an EnhancedThoughtGenerator with custom LLM configurations and simulating contextual task execution using a detailed test context object.

**Key Functions**: `testThoughtGenerator`

---

### evaluation/src/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 323 | **Modified**: 160 days ago

**Staleness Indicators**:
  - Not modified in 160 days (over 3 months)

**Description**: Provides type definitions for evaluating conscious-bot's reasoning capabilities. Defines structured scenarios with domain, complexity, and expected duration.

---

## Vector DB, reflection memory, hybrid search

### memory/src/asset/asset-memory-store.ts

**Staleness**: `active` (0.00) | **Lines**: 703 | **Modified**: 4 days ago

**Description**: Implements the bot's asset memory store using a vector-based chunk and type indexing system. Maintains an append-only ledger of evidence with hash-based chain of custody for claim verification.

**Classes**: `ReferenceAssetMemoryStore`

**Key Functions**: `sha16`, `chunkFromPos`, `dist`, `computeEvidenceDigest`, `isSuccessEvent`

---

### memory/src/chunking-service.ts

**Staleness**: `stable` (0.20) | **Lines**: 620 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Implements chunking of text into semantic fragments for efficient memory storage and retrieval in the conscious-bot architecture. Maintains rich metadata per chunk to track origin and relevance for different memory types.

**Classes**: `ChunkingService`

---

### memory/src/cognitive-map-tracker.ts

**Staleness**: `stable` (0.20) | **Lines**: 730 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides a manifold-based memory tracking system that builds and updates cognitive maps using embeddings from the vector database and metadata from stored memories. Implements time-based evolution of memory patterns and enables clustering for similarity-driven organization.

**Classes**: `CognitiveMapTracker`

---

### memory/src/cognitive-task-memory.ts

**Staleness**: `stable` (0.20) | **Lines**: 842 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements CognitiveTaskMemory to store, track, and reflect on task execution history and learning for the conscious-bot's planning and reasoning capabilities.

**Classes**: `CognitiveTaskMemoryManager`

---

### memory/src/config/memory-runtime-config.ts

**Staleness**: `active` (0.00) | **Lines**: 256 | **Modified**: 0 days ago

**Description**: Provides the centralized configuration for the memory system in conscious-bot, ensuring secure loading of PostgreSQL or Ollama parameters with environment overrides, and validating runtime settings for both production and dev modes.

**Key Functions**: `getNodeEnv`, `getRunMode`, `getRequiredWorldSeed`, `parsePort`, `computeConfigDigest`

---

### memory/src/cross-modal-entity-linker.ts

**Staleness**: `stable` (0.20) | **Lines**: 730 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides cross-modal entity linking for the conscious-bot's memory system. Implements entity unification, deduplication, and relationship tracking between memory types.

**Classes**: `CrossModalEntityLinker`

---

### memory/src/embedding-service.ts

**Staleness**: `active` (0.00) | **Lines**: 916 | **Modified**: 8 days ago

**Description**: * Enhanced Embedding Service * * Provides strategic text embedding generation with multiple model support, * quality-based confidence scoring, and performance monitoring. * Enhanced with obsidian-rag patterns for memory type optimization.

**Classes**: `EmbeddingService`

---

### memory/src/emotional-memory-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 1140 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements conversion between raw emotional data and the AdvancedEmotionalState interface for the conscious-bot's memory system. Enables tracking of primary emotions, intensities, triggers, and associated context in reflection memory.

**Classes**: `EmotionalMemoryManager`

**Key Functions**: `toAdvancedEmotionalState`, `toSimpleEmotionalState`

---

### memory/src/entity-extraction-service.ts

**Staleness**: `stable` (0.20) | **Lines**: 1281 | **Modified**: 114 days ago

**Staleness Indicators**:
  - Not modified in 114 days (over 3 months)

**Description**: , the Entity Extraction Service identifies and structures entities from multi-modal inputs, scoring their confidence and inferring relationships for the bot's knowledge graph. It processes text, context, and metadata to extract entity IDs, semantic types, and supporting evidence.

**Classes**: `EntityExtractionService`

---

### memory/src/episodic/episodic-retrieval.ts

**Staleness**: `stable` (0.20) | **Lines**: 796 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides episodic memory retrieval using vector search and temporal filters within the conscious-bot architecture.

**Classes**: `EpisodicRetrieval`

---

### memory/src/episodic/event-logger.ts

**Staleness**: `stable` (0.20) | **Lines**: 295 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements event storage for the episodic memory in conscious-bot, capturing experiences with metadata and type classification, ensuring robust defaults and fail-fast guards for invalid entries.

**Classes**: `EventLogger`

**Key Functions**: `getDefaultEmotionalState`

---

### memory/src/episodic/memory-consolidation.ts

**Staleness**: `stable` (0.20) | **Lines**: 529 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: * Memory consolidation system for episodic memories. * * Integrates new episodic memories with existing knowledge and performs * sleep-like consolidation processes to strengthen important memories.

**Classes**: `MemoryConsolidation`

---

### memory/src/episodic/narrative-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 1061 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Provides narrative generation for episodic memories in the conscious-bot architecture. * * Analyzes experience sequences to construct coherent stories emphasizing temporal progression.

**Classes**: `NarrativeGenerator`

---

### memory/src/episodic/salience-scorer.ts

**Staleness**: `stable` (0.20) | **Lines**: 316 | **Modified**: 158 days ago

**Staleness Indicators**:
  - Not modified in 158 days (over 3 months)

**Description**: Implements salience scoring for episodic memories by evaluating multiple factors such as novelty, emotional intensity, and goal relevance using configurable weights. Computes a memory's current salience with decay applied over time and optional boosts for high-scoring experiences.

**Classes**: `SalienceScorer`

---

### memory/src/htn-memory.ts

**Staleness**: `stable` (0.20) | **Lines**: 246 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: HTNMemoryManager stores and retrieves task execution effectiveness metrics for HTNTaskMemory entries, enabling planners to query and optimize methods and networks using structured memory access. It ensures valid HTNTaskMemory and HTNMethodMemory records and supports efficient retrieval for planning and learning.

**Classes**: `HTNMemoryManager`

---

### memory/src/hybrid-search-service.ts

**Staleness**: `active` (0.00) | **Lines**: 1019 | **Modified**: 3 days ago

**Description**: a HybridSearchService that fuses vector search with structured graph RAG, enabling the bot to retrieve relevant data via both semantic and factual routes, track provenance, and rank results using decay-aware logic

**Classes**: `HybridSearchService`

---

### memory/src/identity-memory-guardian.ts

**Staleness**: `stable` (0.20) | **Lines**: 699 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Identity Memory Guardian * * Protects and preserves key identity-related memories from excessive decay. * Ensures that memories crucial to the agent's sense of self are retained * and continue to influence behavior and self-conception.

**Classes**: `IdentityMemoryGuardian`

---

### memory/src/integration-examples.ts

**Staleness**: `active` (0.00) | **Lines**: 634 | **Modified**: 6 days ago

**Description**: Bot integration examples demonstrating how the memory system interfaces with cognition and planning modules using hybrid search and reflection, providing sample workflows for retrieving and contextualizing information via CognitiveTaskMemoryManager a

**Classes**: `AdvancedSignalProcessor`, `AdvancedNeedGenerator`, `CognitiveIntegration`

**Key Functions**: `memorySignalIntegrationExample`, `cognitiveTaskMemoryExample`, `reflectionMemoryExample`, `completeIntegrationExample`, `memoryDrivenGoalFormulationExample`

---

### memory/src/knowledge-graph-core.ts

**Staleness**: `stable` (0.20) | **Lines**: 1799 | **Modified**: 114 days ago

**Staleness Indicators**:
  - Not modified in 114 days (over 3 months)

**Description**: GraphCore integrates entities and relationships with a PostgreSQL-backed knowledge graph, supporting vector and text search for enhanced recall. It provides typed APIs for querying entities, filtering, and relationship extraction.

**Classes**: `EnhancedKnowledgeGraphCore`

**Key Functions**: `mapEntityType`, `mapRelationshipType`, `convertExtractedEntityToEnhancedEntity`, `convertExtractedRelationshipToEnhancedRelationship`

---

### memory/src/memory-decay-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 725 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Memory Decay Manager * * Implements "use it or lose it" memory management that mimics human memory decay. * Tracks memory access patterns, calculates decay rates based on importance and * recency, and manages memory cleanup during reflection checkpoints.

**Classes**: `MemoryDecayManager`

---

### memory/src/memory-signal-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 451 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Memory Signal Generator * * Generates memory-based signals for the core signal processing system. * These signals represent memories that have become salient and need attention * for goal formulation and decision making.

**Classes**: `MemorySignalGenerator`

---

### memory/src/memory-system-coordinator.ts

**Staleness**: `stable` (0.20) | **Lines**: 836 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Memory System Coordinator * * Coordinates between different memory systems (emotional, episodic, semantic, etc.) * and manages milestones for self-narrative construction. Ensures that identity * memories are properly integrated and narrative milestones are triggered at * appropriate intervals (10-24 game days).

**Classes**: `MemorySystemCoordinator`

---

### memory/src/memory-system.ts

**Staleness**: `active` (0.00) | **Lines**: 2668 | **Modified**: 3 days ago

**Description**: Storage and retrieval logic for the conscious-bot's memory system. Implements chunk management, integrates vector and graph-based search for enhanced recall.

**Classes**: `EnhancedMemorySystem`

**Key Functions**: `createEnhancedMemorySystem`, `getRequiredWorldSeed`, `createDefaultMemoryConfig`

---

### memory/src/memory-versioning-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 240 | **Modified**: 165 days ago

**Staleness Indicators**:
  - Not modified in 165 days (over 3 months)

**Description**: Implements memory versioning by managing namespaces tied to world seeds. Enforces isolation through per-seed memory contexts and tracks active namespaces.

**Classes**: `MemoryVersioningManager`

---

### memory/src/neuroscience-consolidation-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 547 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: memory: Provides an adaptive neuroscience-inspired memory system that consolidates chunks using vector DB, cognitive map tracking, and scheduled decay for efficient learning and retention in the conscious-bot architecture.

**Classes**: `NeuroscienceConsolidationManager`

---

### memory/src/provenance/audit-trail.ts

**Staleness**: `stable` (0.20) | **Lines**: 522 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Implements audit logging for decision actions within the conscious-bot framework, storing each decision in a structured trail for traceability and accountability. Manages indexed storage by action type, actor, and decision context using a Map-based system.

**Classes**: `AuditTrail`

---

### memory/src/provenance/decision-tracker.ts

**Staleness**: `stable` (0.20) | **Lines**: 750 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Contextures decision records and stores them across memory layers using a domain and importance-based index. Manages decision lifecycle stages and tags for efficient retrieval and tracking.

**Classes**: `DecisionTracker`

---

### memory/src/provenance/evidence-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 574 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements evidence storage with time-stamped entries, supports type-based and source-based querying, ensures deduplication and enforces configuration-driven retention settings for the conscious-bot's knowledge provenance.

**Classes**: `EvidenceManager`

---

### memory/src/provenance/explanation-generator.ts

**Staleness**: `stable` (0.20) | **Lines**: 775 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Contextualizes decision-making by synthesizing decision records and retrieving supporting evidence using the configured ExplanationGenerator. Integrates with the decision tracker and evidence manager to produce clear, detailed explanations tailored to user preferences.

**Classes**: `ExplanationGenerator`

---

### memory/src/provenance/provenance-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 838 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements a unified provenance system for the conscious-bot, capturing decision logs, evidence, audit entries, and explanations to ensure transparent, traceable, and explainable agent behavior.

**Classes**: `ProvenanceSystem`

---

### memory/src/provenance/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 456 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Defines structured types for tracking decision provenance in the conscious-bot's memory system. Provides DecisionRecord and related enums to represent the lifecycle and attributes of each decision made by the bot.

---

### memory/src/reflection-memory.ts

**Staleness**: `active` (0.00) | **Lines**: 1023 | **Modified**: 3 days ago

**Description**: * Reflection Memory System * * Manages self-reflection, lessons learned, narrative development, and * metacognitive processes. Supports the agent's ability to reflect on * experiences, learn from them, and develop a coherent sense of self.

**Classes**: `ReflectionMemoryManager`

---

### memory/src/self-narrative-constructor.ts

**Staleness**: `stable` (0.20) | **Lines**: 708 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: * Self-Narrative Constructor * * Generates coherent narrative summaries of the agent's experiences at * milestones (every 10-24 game days) to reinforce identity and values * over time. Integrates with emotional memories to create meaningful * self-stories that persist and evolve.

**Classes**: `SelfNarrativeConstructor`

---

### memory/src/semantic/graph-rag.ts

**Staleness**: `stable` (0.20) | **Lines**: 633 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Implements graph-enhanced retrieval for the conscious-bot's memory system. Processes user queries to extract entities and relationships, then performs knowledge graph lookups to augment language model responses.

**Classes**: `GraphRAG`

---

### memory/src/semantic/knowledge-graph-core.ts

**Staleness**: `stable` (0.20) | **Lines**: 1221 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: * Knowledge graph core implementation. * * Manages entities, relationships, and factual knowledge with efficient * graph operations and semantic reasoning capabilities.

**Classes**: `KnowledgeGraphCore`

---

### memory/src/semantic/query-engine.ts

**Staleness**: `stable` (0.20) | **Lines**: 502 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: Provides a semantic querying mechanism for the conscious-bot's memory. Integrates with the knowledge graph and GraphRAG for context-aware retrieval.

**Classes**: `QueryEngine`

---

### memory/src/semantic/relationship-extractor.ts

**Staleness**: `stable` (0.20) | **Lines**: 582 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Provides entity and relationship extraction to populate the bot's knowledge graph from text inputs for reflection memory.

**Classes**: `RelationshipExtractor`

---

### memory/src/semantic/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 375 | **Modified**: 126 days ago

**Staleness Indicators**:
  - Not modified in 126 days (over 3 months)

**Description**: Provides type definitions for entities, relationships, and property values used in the conscious-bot's semantic memory. Defines enums for entity types and relationship metadata to support structured storage in the vector memory system.

---

### memory/src/server.ts

**Staleness**: `active` (0.00) | **Lines**: 1544 | **Modified**: 1 days ago

**Description**: Provides a REST API for the enhanced memory system in the conscious-bot architecture. Manages episodic, semantic, working, and provenance memory stores through defined endpoints.

**Key Functions**: `getEnhancedMemorySystem`, `broadcastMemoryUpdate`

---

### memory/src/sharp-wave-ripple-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 730 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: , the SharpWaveRippleManager in conscious-bot uses sharp wave ripple events to trigger awake tagging of important memories before consolidation during sleep phase.

**Classes**: `SharpWaveRippleManager`

---

### memory/src/skills/SkillRegistry.ts

**Staleness**: `active` (0.00) | **Lines**: 846 | **Modified**: 1 days ago

**Description**: methods for registering, composing, and tracking reusable skills in the skill hierarchy, integrating pre/post conditions and metadata for safe execution and performance monitoring in the conscious-bot system

**Classes**: `SkillRegistry`

---

### memory/src/social-memory-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 667 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements social memory retrieval using a vector database and hybrid search. Manages and stores social interactions, relationships, and entity reputations for context-aware reasoning.

**Classes**: `SocialMemoryManager`

---

### memory/src/social/social-memory-demo.ts

**Staleness**: `stable` (0.20) | **Lines**: 483 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements SocialMemory storage for the bot's recollection of player/villager encounters. Maintains entity facts with time-based decay and confidence scoring.

**Classes**: `SocialMemoryDemo`

**Key Functions**: `runSocialMemoryDemo`

---

### memory/src/social/social-memory-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 664 | **Modified**: 136 days ago

**Staleness Indicators**:
  - Not modified in 136 days (over 3 months)

**Description**: Implements memory management for social entities in the conscious-bot architecture. Maintains entity relationships, encodes interaction history, and applies redaction-based forgetting for realism.

**Classes**: `SocialMemoryManager`, `as`

---

### memory/src/spatial-memory-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 864 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements spatial path management for the conscious-bot by storing and querying connections between locations. Maintains directed paths using start and end location IDs with waypoint support.

**Classes**: `SpatialMemoryManager`

---

### memory/src/tool-efficiency-examples.ts

**Staleness**: `active` (0.00) | **Lines**: 685 | **Modified**: 8 days ago

**Description**: * Tool Efficiency Memory System Examples * * Comprehensive examples showing how the tool efficiency memory system integrates * with behavior trees, cognitive processing, and planning systems to learn * optimal tool usage patterns and improve bot performance. * * @author @darianrosebrook

**Key Functions**: `toolUsageTrackingExample`, `cognitivePatternLearningExample`, `planningStrategyLearningExample`, `adaptiveToolSelectionExample`, `behaviorTreeEvolutionExample`

---

### memory/src/tool-efficiency-memory.ts

**Staleness**: `stable` (0.20) | **Lines**: 919 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements a Tool Usage Memory storage interface within the conscious-bot's memory system. Stores and analyzes tool usage records for efficiency metrics and context awareness.

**Classes**: `ToolEfficiencyMemoryManager`

---

### memory/src/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 739 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Provides typed definitions for Experience objects representing significant events stored in the conscious-bot's episodic memory system. Implements unique identifiers and structure for organizing experiences with key metadata.

---

### memory/src/utils/experience-normalizer.ts

**Staleness**: `stable` (0.20) | **Lines**: 83 | **Modified**: 158 days ago

**Staleness Indicators**:
  - Not modified in 158 days (over 3 months)

**Description**: Provides mapping from raw experience type strings to standardized ExperienceType values in the memory module, supporting natural language and enum-based normalization. Maintains original input as a note for traceability and context.

**Key Functions**: `normalizeExperienceType`

---

### memory/src/vector-database.ts

**Staleness**: `active` (0.00) | **Lines**: 1435 | **Modified**: 3 days ago

**Description**: Provides an optimized PostgreSQL vector database using pgvector, supporting hybrid search and enhanced metadata with entity graphs. Integrates decay profiles and provenance tracking for memory management.

**Classes**: `EnhancedVectorDatabase`

---

### memory/src/working/attention-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 714 | **Modified**: 166 days ago

**Staleness Indicators**:
  - Not modified in 166 days (over 3 months)

**Description**: Manages cognitive attention distribution across memory streams using strategies for load balancing and prioritization to maintain optimal performance and prevent overload in the conscious-bot's working memory.

**Classes**: `AttentionManager`

---

### memory/src/working/central-executive.ts

**Staleness**: `stable` (0.20) | **Lines**: 914 | **Modified**: 137 days ago

**Staleness Indicators**:
  - Not modified in 137 days (over 3 months)

**Description**: Implements a centralized working memory manager that dynamically allocates attention and resources across phonological, visuospatial, and episodic buffers. Coordinates real-time updates and enforces decay and rehearsal policies for memory retention.

**Classes**: `CentralExecutive`

---

### memory/src/working/context-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 316 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: context manager for the bot's working memory, responsible for maintaining and updating active context frames including spatial awareness, ensuring efficient retrieval and prioritization of relevant memory for cognitive tasks.

**Classes**: `ContextManager`

---

### memory/src/working/goal-tracker.ts

**Staleness**: `stable` (0.20) | **Lines**: 372 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Implements goal management in the working memory of conscious-bot by tracking descriptions, priorities, deadlines, subgoals, and dependencies for active goals. Maintains a list of current goals and supports prioritization and status queries.

**Classes**: `GoalTracker`

---

### memory/src/working/memory-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 518 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Implements memory integration by linking working memory with episodic and semantic memories, using the CentralExecutive for insertion and managing associations. Facilitates coherent workspace by orchestrating retrieval and merging information from various memory stores.

**Classes**: `MemoryIntegration`

---

### memory/src/working/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 318 | **Modified**: 168 days ago

**Staleness Indicators**:
  - Not modified in 168 days (over 3 months)

**Description**: Provides type definitions for the working memory system of conscious-bot, modeling states for attention, active goals, and their associated metadata used in cognitive processing and memory management.

---

### memory/vitest.config.ts

**Staleness**: `stable` (0.20) | **Lines**: 20 | **Modified**: 162 days ago

**Staleness Indicators**:
  - Not modified in 162 days (over 3 months)

**Description**: Provides a lightweight in-memory test harness for the conscious-bot's memory module, enabling unit testing of vector DB operations and reflection memory usage without requiring actual external storage.

---

## World state, observation queue

### world/src/navigation/cost-calculator.ts

**Staleness**: `stable` (0.20) | **Lines**: 563 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: update movement costs using environmental hazards, mob density, and lighting context from the world state, providing real-time cost feedback for navigation decisions in the cognitive module of conscious-bot.

**Classes**: `DynamicCostCalculator`

---

### world/src/navigation/dstar-lite-core.ts

**Staleness**: `stable` (0.20) | **Lines**: 664 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides the priority queue core for the D* Lite pathfinding algorithm in the conscious-bot navigation system. Manages insertion, extraction of nodes, and key updates to maintain efficient vertex processing order.

**Classes**: `PriorityQueue`, `DStarLiteCore`

---

### world/src/navigation/navigation-graph.ts

**Staleness**: `stable` (0.20) | **Lines**: 673 | **Modified**: 170 days ago

**Staleness Indicators**:
  - Not modified in 170 days (over 3 months)

**Description**: Implements spatial navigation by constructing a block-based graph where each walkable node is indexed for fast neighbor lookup. dynamically updates the graph when the world changes, ensuring current paths reflect valid terrain.

**Classes**: `NavigationGraph`

---

### world/src/navigation/navigation-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 650 | **Modified**: 127 days ago

**Staleness Indicators**:
  - Not modified in 127 days (over 3 months)

**Description**: * Navigation System - Integrated D* Lite pathfinding with dynamic replanning * * Main coordination system that integrates D* Lite algorithm, navigation graph, * dynamic cost calculation, and movement execution for intelligent navigation. * * @author @darianrosebrook

**Classes**: `NavigationSystem`

---

### world/src/navigation/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 676 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides the graph nodes used by the conscious-bot navigation system. Implements type definitions for position, cost, hazardLevel, and neighbor relationships.

**Key Functions**: `euclideanDistance`, `manhattanDistance`, `areAdjacent`, `positionToNodeId`, `nodeIdToPosition`

---

### world/src/perception/confidence-tracker.ts

**Staleness**: `stable` (0.20) | **Lines**: 496 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Age observations by assigning initial confidence and integrating them into the perceptual memory system.

**Classes**: `ConfidenceTracker`

---

### world/src/perception/object-recognition.ts

**Staleness**: `stable` (0.20) | **Lines**: 756 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: objectRecognition class provides real-time identification and classification of visible Minecraft blocks and entities, tracking object confidence and behavioral changes, and emitting events for recognized objects and entity behavior detection within 

**Classes**: `ObjectRecognition`

---

### world/src/perception/perception-integration.ts

**Staleness**: `stable` (0.20) | **Lines**: 900 | **Modified**: 164 days ago

**Staleness Indicators**:
  - Not modified in 164 days (over 3 months)

**Description**: Provides unified coordination of vision modules—ray casting, object recognition, confidence tracking, and attention—by aggregating and validating perception data before updating the world state in the conscious-bot's observation queue.

**Classes**: `PerceptionIntegration`

---

### world/src/perception/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 603 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides definitions for representing the agent's visual field within the conscious-bot perception system. Implements a FieldOfView structure using a 2D array for spatial awareness.

**Key Functions**: `angularDistance`, `degreesToRadians`, `isInVisionCone`, `calculateAcuity`

---

### world/src/perception/visual-field-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 443 | **Modified**: 170 days ago

**Staleness Indicators**:
  - Not modified in 170 days (over 3 months)

**Description**: * Visual Field Manager - Human-like field of view and attention management * * Simulates human visual perception with central focus, peripheral vision, * and dynamic attention allocation based on stimuli and goals. * * @author @darianrosebrook

**Classes**: `VisualFieldManager`

---

### world/src/place-graph/place-graph-core.ts

**Staleness**: `stable` (0.20) | **Lines**: 809 | **Modified**: 169 days ago

**Staleness Indicators**:
  - Not modified in 169 days (over 3 months)

**Description**: Implements the core structure of the place graph for the conscious-bot world state. Maintains hierarchical relationships and spatial connections between places using node and edge management.

**Classes**: `PlaceGraphCore`

**Key Functions**: `if`

---

### world/src/place-graph/place-memory.ts

**Staleness**: `stable` (0.20) | **Lines**: 695 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: /** * Retrieve memories by placeId * Returns the most relevant memory entries for a given place */ getMemories(placeId: string, options: MemoryRecallOptions = {}): Promise<PlaceMemoryEntry[]> { const

**Classes**: `PlaceMemory`

---

### world/src/place-graph/spatial-navigator.ts

**Staleness**: `stable` (0.20) | **Lines**: 506 | **Modified**: 159 days ago

**Staleness Indicators**:
  - Not modified in 159 days (over 3 months)

**Description**: Implements A* pathfinding using the place graph structure. Computes optimal routes between places for the navigator.

**Classes**: `PriorityQueue`, `SpatialNavigator`

---

### world/src/place-graph/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 365 | **Modified**: 169 days ago

**Staleness Indicators**:
  - Not modified in 169 days (over 3 months)

**Description**: Provides type definitions for the place graph system used by the conscious-bot's world state and observation queue.

---

### world/src/sensing/observed-resources-index.ts

**Staleness**: `stable` (0.20) | **Lines**: 449 | **Modified**: 170 days ago

**Staleness Indicators**:
  - Not modified in 170 days (over 3 months)

**Description**: Implements a chunk-based spatial index for the observed resources in the world state. Stores block observations with confidence decay and supports efficient nearest-neighbor lookups.

**Classes**: `ObservedResourcesIndex`

---

### world/src/sensing/raycast-engine.ts

**Staleness**: `active` (0.00) | **Lines**: 732 | **Modified**: 7 days ago

**Description**: Implements efficient visible-only raycasting with occlusion culling and transparent block support. Manages a traversal algorithm to ensure accurate visibility checks in the world state.

**Classes**: `RaycastEngine`

---

### world/src/sensing/visible-sensing.ts

**Staleness**: `stable` (0.20) | **Lines**: 426 | **Modified**: 170 days ago

**Staleness Indicators**:
  - Not modified in 170 days (over 3 months)

**Description**: Provides the main coordination of visible sensing for the conscious-bot, orchestrating ray casting and spatial index queries to track visible resources while managing confidence and performance monitoring.

**Classes**: `PerformanceTracker`, `VisibleSensing`

---

### world/src/sensorimotor/motor-controller.ts

**Staleness**: `stable` (0.20) | **Lines**: 1030 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: * Motor Controller - Core embodied motor control system * * Translates high-level action intentions into precise, coordinated physical * movements with real-time feedback integration and emergency response. * * @author @darianrosebrook

**Classes**: `MotorController`

---

### world/src/sensorimotor/sensorimotor-system.ts

**Staleness**: `stable` (0.20) | **Lines**: 638 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: * Sensorimotor System - Integrated embodied motor control and feedback * * Main coordination system that integrates motor control, sensory feedback, * and predictive learning for responsive embodied intelligence. * * @author @darianrosebrook

**Classes**: `SensorimotorSystem`

---

### world/src/sensorimotor/sensory-feedback-processor.ts

**Staleness**: `stable` (0.20) | **Lines**: 1026 | **Modified**: 165 days ago

**Staleness Indicators**:
  - Not modified in 165 days (over 3 months)

**Description**: Implements real-time sensory data ingestion and adaptive learning from bot's actions.

**Classes**: `SensoryFeedbackProcessor`

---

### world/src/sensorimotor/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 798 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides type definitions for the conscious-bot's sensorimotor system, defining motor actions and precise 3D movement schemas for real-time navigation and manipulation in the Minecraft environment. Implements structured enums and coordinate types to model locomotion and object interaction commands.

**Key Functions**: `calculateDistance`, `normalize`, `calculateActionPriority`, `estimateActionDuration`, `actionsConflict`

---

### world/src/server.ts

**Staleness**: `active` (0.00) | **Lines**: 547 | **Modified**: 7 days ago

**Description**: Provides a persistent storage for the conscious-bot's world state using a Map. Maintains and updates the BotState object for each active agent.

**Key Functions**: `fetchWorldStateFromPlanning`, `updateWorldState`, `startWorldPolling`, `getWorldState`

---

### world/src/types.ts

**Staleness**: `stable` (0.20) | **Lines**: 613 | **Modified**: 167 days ago

**Staleness Indicators**:
  - Not modified in 167 days (over 3 months)

**Description**: Provides the type definitions for the conscious-bot's observation schema, specifically for raycast and DDA sensor outputs. Defines structured types for block IDs, positions, direction, orientation, light levels, and confidence scores in observations.

**Key Functions**: `worldToChunkKey`, `worldToBlockKey`, `distance`, `normalize`, `orientationToDirection`

---

### world/vitest.config.ts

**Staleness**: `stable` (0.20) | **Lines**: 19 | **Modified**: 163 days ago

**Staleness Indicators**:
  - Not modified in 163 days (over 3 months)

**Description**: , the vitest config module in the world package configures testing for the conscious-bot by setting up global variables, timeouts, and file resolution for test execution within the monorepo.

---

## Summary Statistics

- **Total Modules**: 612

### By Staleness Level

- **active**: 405
- **stable**: 207

### By Legacy Status

- **Active**: 405
- **Stable**: 207
- **Total Lines of Code**: 278,598

### TODO Priority Breakdown

- **Untagged TODOs**: 28
- **Total TODOs**: 28
# Conscious-Bot Core Map of Content

**Author**: @darianrosebrook
**Generated**: 2026-02-02 20:44:05

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

**Description**: * Thought-to-Action Audit Logger * * Captures the complete pipeline from need identification through action execution * for debugging and validation purposes. * * @author @darianrosebrook

**Classes**: `ThoughtActionAuditLogger`

**Key Functions**: `startTwoMinuteAudit`, `startQuickAudit`

---

### cognition/src/bot-state-cache.ts

**Staleness**: `active` (0.00) | **Lines**: 162 | **Modified**: 0 days ago

**Description**: * Bot State Cache — Cognition-Side Versioned State Singleton * * The periodic thought loop already fetches GET /state from minecraft-interface * every 60s and constructs ThoughtContext.currentState. This module promotes that * to a module-level versioned cache so all cognition surfaces (social chat, etc.) * can read grounded state without additional HTTP calls.

**Key Functions**: `buildInventoryMap`, `updateBotStateCache`, `getBotStateCache`, `isCompletePosition`, `patchBotStateCache`

---

### cognition/src/cognition-state.ts

**Staleness**: `active` (0.00) | **Lines**: 40 | **Modified**: 0 days ago

**Description**: * Cognition Mutable State Container * * Replaces closure-scoped mutable variables with an explicit state * object. Server.ts creates a single instance and passes specific * fields by reference or via accessor functions to router factories.

**Key Functions**: `createInitialState`

---

### cognition/src/cognitive-core/context-optimizer.ts

**Staleness**: `stable` (0.20) | **Lines**: 612 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: * Context optimization system for advanced memory integration. * * Provides sophisticated context building, memory retrieval, * and token optimization for LLM interactions.

**Classes**: `ContextOptimizer`

---

### cognition/src/cognitive-core/conversation-manager.ts

**Staleness**: `stable` (0.20) | **Lines**: 718 | **Modified**: 133 days ago

**Staleness Indicators**:
  - Not modified in 133 days (over 3 months)

**Description**: * Conversation flow management system. * * Manages conversation state, topic tracking, and communication style * adaptation for natural and coherent social interactions.

**Classes**: `ConversationManager`

---

## Summary Statistics

- **Total Modules**: 5

### By Staleness Level

- **active**: 3
- **stable**: 2

### By Legacy Status

- **Active**: 3
- **Stable**: 2
- **Total Lines of Code**: 1,981

### TODO Priority Breakdown

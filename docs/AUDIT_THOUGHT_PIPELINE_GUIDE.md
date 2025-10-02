# Thought-to-Action Pipeline Audit Guide

**Date**: 2025-10-02  
**Author**: @darianrosebrook  
**Purpose**: Capture and audit the complete thought-to-action pipeline for debugging

## Overview

The Thought-to-Action Audit Logger captures the entire pipeline from need identification through action execution, creating a timeline of events that can be reviewed after running the bot.

## Quick Start

### 1. Start a 2-Minute Audit

```bash
# Using the npm script (once configured)
npm run audit:thought-pipeline

# Or with custom duration (30 seconds)
npm run audit:thought-pipeline -- --duration 30
```

### 2. Alternatively, Enable in Code

```typescript
import { startTwoMinuteAudit } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

// Start a 2-minute audit session (auto-ends)
const sessionId = await startTwoMinuteAudit();

// Or start a quick 30-second test
import { startQuickAudit } from '@conscious-bot/cognition/audit/thought-action-audit-logger';
const sessionId = await startQuickAudit();
```

### 3. Review Logs

After the audit completes, check:
```bash
./logs/audit/audit-<timestamp>.txt   # Human-readable format
./logs/audit/audit-<timestamp>.json  # Machine-readable format
```

## Output Example

### Text Format (audit-*.txt)
```
================================================================================
THOUGHT-TO-ACTION AUDIT LOG
================================================================================

Session ID: audit-1696287654321-abc123
Start Time: 2025-10-02T15:30:00.000Z
End Time: 2025-10-02T15:32:00.000Z
Duration: 120.00s

SUMMARY:
  Total Entries: 23
  Successful: 18
  Failed: 2
  Average Duration: 145.32ms
  Stages Completed: need_identified, thought_generated, tool_selected, tool_executed
  Stages Failed: tool_executed

================================================================================
PIPELINE TRACE (23 entries)
================================================================================

[+0.123s] (+0.123s) 🔵 NEED_IDENTIFIED
  Need: "low_health"
  Priority: 0.8

[+0.245s] (+0.122s) ✅ THOUGHT_GENERATED [89ms]
  Thought: "I notice my health is getting low. I should find food to eat before continuing mining..."
  Type: survival

[+0.567s] (+0.322s) 🔵 THOUGHT_PROCESSED
  Action: "find_food"

[+0.789s] (+0.222s) ✅ ACTION_PLANNED [156ms]
  Task: "Find and consume food"
  Priority: high

[+1.234s] (+0.445s) ✅ TOOL_SELECTED [198ms]
  Tool: query_inventory
  Args: {"filter":"food"}

[+1.456s] (+0.222s) ✅ TOOL_EXECUTED [167ms]
  Tool: query_inventory
  Result: found 3 items

[+1.678s] (+0.222s) ✅ ACTION_COMPLETED [45ms]
  Success: true
  Health: 15 → 20

[+1.890s] (+0.212s) ✅ FEEDBACK_RECEIVED
  Feedback: "Consumed food successfully"

--- CHAIN 2 ---

[+5.234s] (+3.344s) 🔵 NEED_IDENTIFIED
  Need: "resource_needed"
  Resource: iron_ore
...
```

## Integration Points

To capture the full pipeline, add audit logging at these key points:

### 1. Need Identification
```typescript
// In homeostasis-monitor.ts or need-generator.ts
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

function detectNeed(state: any) {
  const need = identifyNeed(state);
  
  if (need) {
    auditLogger.log('need_identified', {
      need: need.type,
      priority: need.priority,
      trigger: need.trigger,
      healthLevel: state.health,
      hungerLevel: state.food,
    }, { success: true });
  }
  
  return need;
}
```

### 2. Thought Generation
```typescript
// In thought-generator.ts or intrusive-thought-processor.ts
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function generateThought(context: any) {
  const startTime = Date.now();
  const thought = await llm.generateThought(context);
  const duration = Date.now() - startTime;
  
  auditLogger.log('thought_generated', {
    thoughtContent: thought.content,
    thoughtType: thought.type,
    thoughtCategory: thought.category,
    trigger: context.trigger,
  }, { 
    success: true,
    duration,
  });
  
  return thought;
}
```

### 3. Thought Processing
```typescript
// In cognitive-thought-processor.ts
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function processThought(thought: CognitiveThought) {
  auditLogger.log('thought_processed', {
    thoughtId: thought.id,
    thoughtContent: thought.content.substring(0, 100),
    action: extractedAction?.type,
    confidence: thought.confidence,
  }, { success: true });
  
  // ... processing logic
}
```

### 4. Action Planning
```typescript
// In task-bootstrapper.ts or planner
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function planAction(thought: any) {
  const startTime = Date.now();
  const task = await createTask(thought);
  const duration = Date.now() - startTime;
  
  auditLogger.log('action_planned', {
    taskTitle: task.title,
    taskType: task.type,
    taskId: task.id,
    priority: task.priority,
    steps: task.steps?.length,
  }, { 
    success: true,
    duration,
  });
  
  return task;
}
```

### 5. Tool Selection
```typescript
// In ReActArbiter.ts
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function reason(context: ReActContext) {
  const startTime = Date.now();
  
  try {
    const response = await this.callLLM(prompt);
    const step = this.parseReActResponse(response.text);
    const duration = Date.now() - startTime;
    
    auditLogger.log('tool_selected', {
      selectedTool: step.selectedTool,
      args: step.args,
      thoughts: step.thoughts?.substring(0, 100),
      taskContext: context.task?.title,
    }, { 
      success: !!step.selectedTool,
      duration,
    });
    
    return step;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    auditLogger.log('tool_selected', {
      taskContext: context.task?.title,
    }, { 
      success: false,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    throw error;
  }
}
```

### 6. Tool Execution
```typescript
// In modular-server.ts (toolExecutor)
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function execute(tool: string, args: Record<string, any>) {
  const startTime = Date.now();
  
  try {
    const mappedAction = mapBTActionToMinecraft(normalizedTool, args);
    const result = await executeActionWithBotCheck(mappedAction, signal);
    const duration = Date.now() - startTime;
    
    auditLogger.log('tool_executed', {
      originalTool: tool,
      normalizedTool,
      mappedAction: mappedAction.type,
      resultOk: result.ok,
      resultData: result.data,
    }, { 
      success: result.ok,
      duration,
      error: result.error,
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    auditLogger.log('tool_executed', {
      originalTool: tool,
      normalizedTool,
    }, { 
      success: false,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    throw error;
  }
}
```

### 7. Action Completion
```typescript
// In task executor or behavior tree runner
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

async function completeAction(task: any, result: any) {
  auditLogger.log('action_completed', {
    taskId: task.id,
    taskTitle: task.title,
    success: result.ok,
    finalState: result.data,
    progressBefore: task.progress,
    progressAfter: result.progress,
  }, { 
    success: result.ok,
    duration: result.duration,
    error: result.error,
  });
}
```

### 8. Feedback Received
```typescript
// In feedback or observation system
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

function receiveFeedback(feedback: any) {
  auditLogger.log('feedback_received', {
    feedbackType: feedback.type,
    feedbackContent: feedback.content,
    relatedTaskId: feedback.taskId,
    sentiment: feedback.sentiment,
  }, { success: true });
}
```

## Usage Patterns

### Pattern 1: Manual Session Management

```typescript
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

// Start when bot starts
const sessionId = auditLogger.startSession();

// ... bot runs and logs entries ...

// End when ready to review
const session = await auditLogger.endSession();
console.log(`Captured ${session.entries.length} entries`);
```

### Pattern 2: Timed Session (Recommended)

```typescript
import { startTwoMinuteAudit } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

// Automatically starts and ends after 2 minutes
await startTwoMinuteAudit();

// Bot continues running, logs are saved automatically
```

### Pattern 3: Multiple Sessions

```typescript
import { auditLogger } from '@conscious-bot/cognition/audit/thought-action-audit-logger';

// Start named sessions
const session1 = auditLogger.startSession('mining-test');
// ... perform mining task ...
await auditLogger.endSession('mining-test');

const session2 = auditLogger.startSession('combat-test');
// ... perform combat task ...
await auditLogger.endSession('combat-test');
```

## Analysis Workflow

1. **Start audit session** (2 minutes recommended)
2. **Run the bot** - let it identify needs and take actions
3. **Review logs automatically saved** to `./logs/audit/`
4. **Analyze the pipeline**:
   - Are all stages being reached?
   - Where are failures occurring?
   - What are the timing characteristics?
   - Is tool selection working correctly?

## Troubleshooting

### No Logs Generated

**Problem**: Audit session runs but no files created

**Solution**:
- Check that `./logs/audit/` directory exists (created automatically)
- Ensure session is ended: `await auditLogger.endSession()`
- Check file permissions

### Missing Pipeline Stages

**Problem**: Some stages don't appear in logs

**Solution**:
- Add audit logging at that integration point (see above)
- Verify the code path is actually being executed
- Check that audit logger is enabled: `auditLogger.setEnabled(true)`

### Too Much/Too Little Detail

**Problem**: Logs have wrong level of detail

**Solution**:
- Adjust what data you pass to `auditLogger.log()`
- For sensitive data, sanitize before logging
- Use abbreviated strings for long content

## NPM Script Setup

Add to `package.json`:

```json
{
  "scripts": {
    "audit:thought-pipeline": "tsx scripts/audit-thought-pipeline.ts",
    "audit:quick": "tsx scripts/audit-thought-pipeline.ts -- --duration 30"
  }
}
```

## Environment Variables

```bash
# Disable audit logging in production
export AUDIT_LOGGING_ENABLED=false

# Change output directory
export AUDIT_LOG_DIR=./custom/audit/path
```

## Next Steps

1. Add audit logging to key integration points (see above)
2. Run a test audit session
3. Review the output logs
4. Iterate on what data to capture
5. Use for debugging tool selection issues

## Related Files

- `packages/cognition/src/audit/thought-action-audit-logger.ts` - Core logger
- `scripts/audit-thought-pipeline.ts` - CLI script
- `docs/TOOL_SELECTION_ANALYSIS.md` - Problem analysis
- `docs/TOOL_SELECTION_FIXES.md` - Implementation fixes

---

**Status**: Ready to integrate. Add audit logging calls at key pipeline points to start capturing data.


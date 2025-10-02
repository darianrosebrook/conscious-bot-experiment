# Tool Selection & Execution Fixes

**Date**: 2025-10-02  
**Author**: @darianrosebrook  
**Related**: [TOOL_SELECTION_ANALYSIS.md](./TOOL_SELECTION_ANALYSIS.md)

## Summary

Implemented comprehensive fixes to address critical issues preventing the bot from selecting and executing tools. The bot was sitting idle due to multiple failures in the tool selection pipeline.

## Changes Implemented

### 1. Improved LLM Response Parsing (ReActArbiter)

**File**: `packages/cognition/src/react-arbiter/ReActArbiter.ts`

**Changes**:
- Added **multiple parsing strategies** with fallbacks:
  1. JSON parsing (preferred)
  2. Line-by-line keyword matching (original)
  3. Fuzzy tool name extraction from text
- Improved prompt to request structured JSON output
- Added extensive logging for debugging

**Impact**: Parser now handles various LLM response formats gracefully

```typescript
// Strategy 1: Try JSON parsing first
const jsonMatch = responseText.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.tool || parsed.action || parsed.selectedTool) {
      return {
        thoughts: parsed.thoughts || parsed.reasoning || '',
        selectedTool: parsed.tool || parsed.action || parsed.selectedTool || '',
        args: parsed.args || parsed.parameters || {},
      };
    }
  } catch (e) {
    console.warn('[ReActArbiter] JSON parsing failed, trying fallback methods');
  }
}

// Strategy 3: Fuzzy tool name extraction
if (!selectedTool) {
  const toolNames = Array.from(this.toolRegistry.keys());
  for (const toolName of toolNames) {
    const regex = new RegExp(`\\b${toolName}\\b`, 'i');
    if (regex.test(responseText)) {
      selectedTool = toolName;
      console.log(`[ReActArbiter] Fuzzy matched tool: ${toolName}`);
      break;
    }
  }
}
```

### 2. Added Fallback Mechanisms

**File**: `packages/cognition/src/react-arbiter/ReActArbiter.ts`

**Changes**:
- When no tool selected → fallback to `chat` tool with explanation
- When unknown tool → attempt fuzzy matching, then fallback to `chat`
- When reasoning fails → return safe default instead of throwing
- All fallbacks provide context about the failure

**Impact**: Bot no longer stops on parsing failures

```typescript
// Validate that we have at most one tool call
if (!step.selectedTool) {
  console.warn('[ReActArbiter] No tool selected, using fallback');
  return {
    thoughts: step.thoughts || 'Unable to parse tool selection',
    selectedTool: 'chat',
    args: {
      channel: 'system',
      message: `I'm having trouble selecting the right tool. Context: ${context.task?.title || 'unknown'}`,
    },
  };
}

// Validate tool exists in registry - use fuzzy matching as fallback
if (!this.toolRegistry.has(step.selectedTool)) {
  console.warn(`[ReActArbiter] Unknown tool: ${step.selectedTool}, attempting fuzzy match`);
  
  const availableTools = Array.from(this.toolRegistry.keys());
  const closeMatch = availableTools.find(
    (tool) =>
      tool.toLowerCase().includes(step.selectedTool.toLowerCase()) ||
      step.selectedTool.toLowerCase().includes(tool.toLowerCase())
  );

  if (closeMatch) {
    console.log(`[ReActArbiter] Fuzzy matched ${step.selectedTool} to ${closeMatch}`);
    step.selectedTool = closeMatch;
  } else {
    // Fallback to chat with helpful error message
    return { ... };
  }
}
```

### 3. Fixed Tool Namespace Mismatch

**File**: `packages/planning/src/modular-server.ts`

**Changes**:
- Removed strict `minecraft.` prefix requirement
- Added automatic prefix normalization
- Tools can now be called with or without `minecraft.` prefix

**Impact**: ReActArbiter tools (without prefix) now work correctly

**Before**:
```typescript
if (!tool.startsWith('minecraft.')) {
  return {
    ok: false,
    error: 'Unsupported tool namespace',
    // ... rejection
  };
}
```

**After**:
```typescript
// Normalize tool name: add minecraft. prefix if not present
const normalizedTool = tool.startsWith('minecraft.') ? tool : `minecraft.${tool}`;

console.log(`[toolExecutor] Executing tool: ${tool} (normalized: ${normalizedTool}) with args:`, args);
```

### 4. Enhanced MCP_ONLY Feedback

**File**: `packages/planning/src/modular-server.ts`

**Changes**:
- Improved warning message with actionable guidance
- Added hint in metadata about how to fix
- Changed from `console.log` to `console.warn` with emoji

**Impact**: Clearer feedback when tools are blocked by configuration

```typescript
if (MCP_ONLY) {
  console.warn(
    '⚠️ [toolExecutor] MCP_ONLY=true; toolExecutor will not use direct /action fallback. Set MCP_ONLY=false to enable direct execution.'
  );
  return {
    ok: false,
    error: 'Direct action disabled (MCP_ONLY) — use MCP option execution or set MCP_ONLY=false',
    metadata: { 
      reason: 'mcp_only_disabled',
      hint: 'Set environment variable MCP_ONLY=false to enable direct execution',
    },
  };
}
```

### 5. Improved Tool Discovery

**File**: `packages/planning/src/modules/mcp-integration.ts`

**Changes**:
- Lowered relevance threshold from 0.3 to 0.2 (configurable)
- Added detailed logging of matched tools
- Warning when no tools match with list of available tools
- Log tools with low relevance for debugging

**Impact**: More tools discovered, better visibility into matching process

```typescript
// Lower threshold for better tool discovery (was 0.3)
const relevanceThreshold = this.config.toolRelevanceThreshold ?? 0.2;

if (relevance > relevanceThreshold) {
  matches.push({ ... });
} else if (relevance > 0.1) {
  // Log tools that are close but didn't match
  console.log(
    `[MCP] Tool "${tool.name}" has low relevance (${relevance.toFixed(2)}) for goal: ${goalDescription}`
  );
}

// Enhanced logging
if (matchedTools.length === 0) {
  console.warn(
    `[MCP] ⚠️ No tools matched for goal. Available tools: ${availableTools.map((t) => t.name).join(', ')}`
  );
} else {
  console.log(
    `[MCP] Top matched tools: ${matchedTools.slice(0, 3).map((m) => `${m.tool.name} (${m.relevance.toFixed(2)})`).join(', ')}`
  );
}
```

### 6. Enhanced Prompt Structure

**File**: `packages/cognition/src/react-arbiter/ReActArbiter.ts`

**Changes**:
- Added explicit format instructions to LLM prompt
- Requested JSON as preferred format
- Provided fallback text format example
- Emphasized selecting ONE tool from available list

**Impact**: LLM responses are more consistent and parseable

```typescript
return `You are a Minecraft bot using ReAct reasoning to accomplish tasks.

Available Tools:
${tools}

Current Task: ${context.task?.title || 'No task'}
...

Instructions:
1. Think step by step about what needs to be done
2. Choose the most appropriate tool for the current situation
3. Provide clear reasoning for your choice
4. Respond in one of these formats:

Format 1 (Preferred - JSON):
{
  "thoughts": "step by step reasoning",
  "tool": "tool_name",
  "args": { "param1": "value1" }
}

Format 2 (Fallback - Text):
Tool: tool_name
Args: {"param1": "value1"}
Thoughts: step by step reasoning

Choose ONE tool from the available tools list above and format your response correctly.`;
```

## Testing Recommendations

1. **Verify tool selection success rate**:
   - Monitor logs for `[ReActArbiter] Selected tool:`
   - Check how often fallbacks are triggered
   - Measure LLM response parsing success

2. **Test various LLM response formats**:
   - JSON format responses
   - Text format responses
   - Malformed responses
   - Responses with unknown tools

3. **Confirm namespace handling**:
   - Call tools with `minecraft.` prefix
   - Call tools without prefix
   - Verify both work correctly

4. **Check MCP_ONLY behavior**:
   - Test with `MCP_ONLY=true`
   - Test with `MCP_ONLY=false`
   - Verify appropriate execution path

5. **Monitor tool discovery**:
   - Check which tools are matched for various goals
   - Verify relevance scores are reasonable
   - Ensure appropriate tools are selected

## Expected Improvements

### Before Fixes
- ❌ Bot sits idle without executing actions
- ❌ LLM response parsing fails frequently
- ❌ Tool namespace mismatch causes immediate rejection
- ❌ No recovery from parsing failures
- ❌ Limited visibility into what's failing

### After Fixes
- ✅ Bot attempts execution even if parsing is imperfect
- ✅ Multiple parsing strategies increase success rate
- ✅ Tool namespace handled automatically
- ✅ Graceful fallbacks prevent complete failures
- ✅ Comprehensive logging for debugging
- ✅ Bot communicates when it encounters issues

## Monitoring & Metrics

Key metrics to track:
- **Tool selection success rate**: Percentage of successful tool selections
- **Parsing strategy used**: Which parsing method succeeded
- **Fallback trigger rate**: How often fallbacks are needed
- **Tool execution success**: Percentage of executed tools that succeed
- **Average tool discovery time**: Performance of tool matching

## Configuration Options

New/updated configuration:
- `toolRelevanceThreshold`: Minimum relevance score for tool matching (default: 0.2)
- `MCP_ONLY`: When true, disables direct action execution (use cautiously)

## Rollback Plan

If issues arise:
1. Monitor logs for new error patterns
2. Check if fallbacks are triggering too frequently
3. Adjust `toolRelevanceThreshold` if needed
4. Revert specific commits if critical issues found

## Next Steps

1. Monitor bot behavior in production
2. Collect metrics on tool selection success
3. Tune relevance threshold based on data
4. Consider adding semantic similarity for tool matching
5. Implement A/B testing for different prompting strategies

## Related Issues

- Original issue: Bot unable to select/execute tools
- Root causes: Namespace mismatch, brittle parsing, no fallbacks
- Impact: Bot sitting idle, no actions executed
- Resolution: Multiple fixes across parsing, validation, and execution

## Files Modified

1. `packages/cognition/src/react-arbiter/ReActArbiter.ts` - Parsing & fallbacks
2. `packages/planning/src/modular-server.ts` - Namespace normalization
3. `packages/planning/src/modules/mcp-integration.ts` - Tool discovery improvements
4. `docs/TOOL_SELECTION_ANALYSIS.md` - Analysis documentation (new)
5. `docs/TOOL_SELECTION_FIXES.md` - This document (new)


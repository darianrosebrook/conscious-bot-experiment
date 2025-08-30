# Cognitive Stream Filtering Fix

## Problem
The cognitive stream was displaying system logs like:
- "Memory system updated with 0 memories"
- "Bot state updated: Status refreshed"

These system events were being converted into "reflection" thoughts, cluttering the cognitive stream with non-cognitive content.

## Root Cause
The dashboard's main page (`packages/dashboard/src/app/page.tsx`) was converting all events from the `/api/events` endpoint into thoughts with `type: 'reflection'`, including system events that should not appear in the cognitive stream.

## Solution
Added filtering logic in three places where events are converted to thoughts:

### 1. Events Processing (lines 775-795)
```typescript
// Filter out system events that shouldn't appear in cognitive stream
const isSystemEvent = 
  event.type === 'memory_state' ||
  event.type === 'bot_state' ||
  event.content?.includes('Memory system updated') ||
  event.content?.includes('Bot state updated') ||
  event.content?.includes('Status refreshed');

if (!existingThoughtIds.has(event.id) && !isSystemEvent) {
  addThought({
    id: event.id,
    ts: event.timestamp,
    text: event.content,
    type: 'reflection',
  });
}
```

### 2. Memories Processing (lines 760-775)
```typescript
// Filter out system memories that shouldn't appear in cognitive stream
const isSystemMemory = 
  memory.content?.includes('Memory system updated') ||
  memory.content?.includes('Bot state updated') ||
  memory.content?.includes('Status refreshed') ||
  memory.type === 'system' ||
  memory.type === 'telemetry';

if (!existingThoughtIds.has(memory.id) && !isSystemMemory) {
  addThought({
    id: memory.id,
    ts: memory.timestamp,
    text: memory.content,
    type: 'reflection',
  });
}
```

### 3. Notes Processing (lines 800-820)
```typescript
// Filter out system notes that shouldn't appear in cognitive stream
const isSystemNote = 
  note.content?.includes('Memory system updated') ||
  note.content?.includes('Bot state updated') ||
  note.content?.includes('Status refreshed') ||
  note.type === 'system' ||
  note.type === 'telemetry';

if (!existingThoughtIds.has(note.id) && !isSystemNote) {
  addThought({
    id: note.id,
    ts: note.timestamp,
    text: note.content,
    type: 'reflection',
  });
}
```

## Filtering Criteria
System events are filtered out based on:
1. **Event type**: `memory_state`, `bot_state`
2. **Content patterns**: 
   - "Memory system updated"
   - "Bot state updated" 
   - "Status refreshed"
3. **Memory/Note types**: `system`, `telemetry`

## Result
- ✅ System logs no longer appear in cognitive stream
- ✅ Legitimate cognitive events still appear (episodic memories, task completions, etc.)
- ✅ Cognitive stream now shows only actual bot thoughts and meaningful reflections
- ✅ Memory system updates and bot state updates are handled separately in the dashboard

## Testing
Created and ran a test script that verified:
- 4 input events (2 system, 2 cognitive)
- 2 system events filtered out
- 2 cognitive events converted to thoughts
- Filtering logic works correctly

## Files Modified
- `packages/dashboard/src/app/page.tsx` - Added filtering logic for events, memories, and notes processing

## Impact
The cognitive stream now provides a cleaner, more focused view of the bot's actual thoughts and cognitive processes, without being cluttered by system status updates that belong in other dashboard sections.

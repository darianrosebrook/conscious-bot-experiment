# Message Parser Utility

## Overview

The Message Parser Utility (`src/lib/message-parser.ts`) provides functions to convert raw JSON and technical messages from the bot systems into human-readable descriptions for the dashboard interface.

## Problem Solved

Previously, the dashboard displayed raw JSON output like:
- `mine: {"depth":5,"resource":"stone"}`
- `farm: {"crop":"wheat","area":3}`
- `explore: {"distance":5,"direction":"forward"}`

This was not user-friendly and made it difficult to understand what the bot was doing.

## Solution

The message parser converts these raw messages into readable descriptions:
- `mine: {"depth":5,"resource":"stone"}` → `Mine stone at depth 5`
- `farm: {"crop":"wheat","area":3}` → `Plant wheat in 3x3 area`
- `explore: {"distance":5,"direction":"forward"}` → `Explore 5 blocks forward`

## Functions

### `parsePlannerAction(action, parameters)`

Converts planner action types and parameters into human-readable descriptions.

**Supported Actions:**
- `mine` - Mining operations
- `farm` - Farming operations  
- `explore` - Exploration tasks
- `craft` - Crafting items
- `build` - Building structures
- `move` - Movement actions
- `turn` - Rotation actions
- `gather` - Resource gathering
- `search` - Search operations
- `defend` - Defensive actions
- `rest` - Resting actions
- `eat` - Eating actions

**Example:**
```typescript
parsePlannerAction('mine', { depth: 5, resource: 'stone' })
// Returns: "Mine stone at depth 5"
```

### `parseTaskDescription(task)`

Converts task objects into readable descriptions, prioritizing:
1. `description` field if available
2. Parsed action type and parameters
3. Capitalized action type
4. "Unknown Task" as fallback

### `parseStepDescription(step)`

Converts step objects into readable descriptions, prioritizing:
1. `label` field if available
2. `description` field if available
3. Parsed action and parameters
4. Capitalized action
5. "Unknown Step" as fallback

### `parseGoalDescription(goal)`

Converts goal objects into readable descriptions, prioritizing:
1. `description` field if available
2. `name` field if available
3. Parsed type and parameters
4. Capitalized type
5. "Unknown Goal" as fallback

### `parseCurrentAction(action)`

Handles various action formats:
- JSON strings (parses and formats)
- Plain strings (returns as-is)
- Objects with type/parameters
- Objects with description property

### `formatTaskStatus(status, progress)`

Converts task status and progress into human-readable status:
- `completed` → "Completed"
- `failed` → "Failed"
- `blocked` → "Blocked"
- `in_progress` → "In Progress"
- `pending` → "Pending"
- Progress-based fallbacks for unknown status

### `formatPriority(priority)`

Converts numeric priority (0-1) into readable levels:
- 0.9+ → "Critical"
- 0.7+ → "High"
- 0.5+ → "Medium"
- 0.3+ → "Low"
- <0.3 → "Very Low"

## Usage in APIs

The message parser is used in:

1. **Tasks API** (`/api/tasks`) - Converts planner tasks and goals into readable descriptions
2. **Chain of Thought API** (`/api/ws/cot`) - Converts current actions into readable descriptions

## Benefits

1. **Improved User Experience** - Users can understand what the bot is doing at a glance
2. **Consistent Formatting** - All action descriptions follow the same pattern
3. **Fallback Handling** - Graceful degradation when data is missing or malformed
4. **Extensible** - Easy to add new action types and parameter handling

## Future Enhancements

- Add support for more action types
- Include contextual information (location, time, etc.)
- Add localization support
- Include action icons or visual indicators

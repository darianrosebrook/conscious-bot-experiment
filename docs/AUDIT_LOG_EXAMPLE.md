# Example Audit Log Output

This document shows what a complete thought-to-action audit log looks like after running the bot for 2 minutes.

## Simplified Timeline View

```
T+0.000s → NEED_IDENTIFIED: low_health (priority: 0.8)
T+0.123s → THOUGHT_GENERATED: "My health is low, I should eat" [89ms] ✅
T+0.245s → THOUGHT_PROCESSED: action=find_food
T+0.567s → ACTION_PLANNED: "Find and consume food" [156ms] ✅
T+0.789s → TOOL_SELECTED: query_inventory(filter="food") [198ms] ✅
T+1.012s → TOOL_EXECUTED: query_inventory → found 3 items [167ms] ✅
T+1.234s → TOOL_SELECTED: consume_food(item="bread") [45ms] ✅
T+1.456s → TOOL_EXECUTED: consume_food → health: 15→20 [234ms] ✅
T+1.678s → ACTION_COMPLETED: success=true [12ms] ✅
T+1.890s → FEEDBACK_RECEIVED: "Feeling better after eating"

[Gap of 3.2 seconds]

T+5.090s → NEED_IDENTIFIED: resource_needed (resource: iron_ore)
T+5.212s → THOUGHT_GENERATED: "I need iron ore for tools" [102ms] ✅
T+5.334s → THOUGHT_PROCESSED: action=mine_resource
T+5.556s → ACTION_PLANNED: "Mine 5 iron ore" [178ms] ✅
T+5.778s → TOOL_SELECTED: find_blocks(type="iron_ore") [156ms] ✅
T+6.000s → TOOL_EXECUTED: find_blocks → found 12 blocks [445ms] ✅
T+6.445s → TOOL_SELECTED: pathfind(to={x:120,y:64,z:45}) [89ms] ✅
T+6.534s → TOOL_EXECUTED: pathfind → arrived [2134ms] ✅
T+8.668s → TOOL_SELECTED: dig(pos={x:120,y:64,z:45}) [67ms] ✅
T+8.735s → TOOL_EXECUTED: dig → success [1456ms] ✅
T+10.191s → ACTION_COMPLETED: collected 1/5 iron ore ✅
T+10.303s → FEEDBACK_RECEIVED: "Mining progress: 1/5"

[Continues for 2 minutes...]
```

## Full Text Log Example

```
================================================================================
THOUGHT-TO-ACTION AUDIT LOG
================================================================================

Session ID: audit-1696287654321-xyz789
Start Time: 2025-10-02T15:30:00.000Z
End Time: 2025-10-02T15:32:00.000Z
Duration: 120.00s

SUMMARY:
  Total Entries: 127
  Successful: 112
  Failed: 8
  Average Duration: 347.23ms
  Stages Completed: need_identified, thought_generated, thought_processed, action_planned, tool_selected, tool_executed, action_completed, feedback_received
  Stages Failed: tool_executed

================================================================================
PIPELINE TRACE (127 entries)
================================================================================

[+0.000s] (+0.000s) 🔵 NEED_IDENTIFIED
  Need: low_health
  Priority: 0.8
  HealthLevel: 6
  HungerLevel: 12
  Trigger: homeostasis_monitor

[+0.123s] (+0.123s) ✅ THOUGHT_GENERATED [89ms]
  Thought: "I notice my health is getting quite low at only 6 hearts. This is concerning because if I take any damage, I might die. I should find some food to eat before continuing with any dangerous activities like mining or combat. Let me check my inventory for food items..."
  Type: survival
  Category: self-preservation
  Trigger: health_warning

[+0.245s] (+0.122s) 🔵 THOUGHT_PROCESSED
  ThoughtId: thought-1696287654000-abc123
  ThoughtContent: "I notice my health is getting quite low at only 6 hearts. This is concerning because if I take..."
  Action: find_food
  Confidence: 0.85

[+0.567s] (+0.322s) ✅ ACTION_PLANNED [156ms]
  TaskTitle: Find and consume food
  TaskType: survival
  TaskId: task-health-recovery-001
  Priority: high
  Steps: 3

[+0.789s] (+0.222s) ✅ TOOL_SELECTED [198ms]
  SelectedTool: query_inventory
  Args: {"filter":"food"}
  Thoughts: "First, I should check what food I have available in my inventory. Then I can choose the best option..."
  TaskContext: Find and consume food

[+1.012s] (+0.223s) ✅ TOOL_EXECUTED [167ms]
  OriginalTool: query_inventory
  NormalizedTool: minecraft.query_inventory
  MappedAction: query_inventory
  ResultOk: true
  ResultData: {"items":[{"type":"bread","count":3},{"type":"cooked_beef","count":1},{"type":"apple","count":5}]}

[+1.234s] (+0.222s) ✅ TOOL_SELECTED [45ms]
  SelectedTool: consume_food
  Args: {"item":"cooked_beef"}
  Thoughts: "Cooked beef provides the most saturation, so I'll eat that first..."
  TaskContext: Find and consume food

[+1.456s] (+0.222s) ✅ TOOL_EXECUTED [234ms]
  OriginalTool: consume_food
  NormalizedTool: minecraft.consume_food
  MappedAction: consume_item
  ResultOk: true
  ResultData: {"health":{"before":6,"after":10},"hunger":{"before":12,"after":20}}

[+1.678s] (+0.222s) ✅ ACTION_COMPLETED [12ms]
  TaskId: task-health-recovery-001
  TaskTitle: Find and consume food
  Success: true
  FinalState: {"health":10,"hunger":20}
  ProgressBefore: 0.33
  ProgressAfter: 1.0

[+1.890s] (+0.212s) ✅ FEEDBACK_RECEIVED
  FeedbackType: success
  FeedbackContent: Health recovered from 6 to 10 hearts
  RelatedTaskId: task-health-recovery-001
  Sentiment: positive

--- CHAIN 2 ---

[+5.090s] (+3.200s) 🔵 NEED_IDENTIFIED
  Need: resource_needed
  Resource: iron_ore
  Priority: 0.6
  CurrentInventory: {"iron_ore":0,"iron_ingot":2}
  Trigger: task_requirement

[+5.212s] (+0.122s) ✅ THOUGHT_GENERATED [102ms]
  Thought: "I need iron ore to craft more tools. I have a couple of iron ingots but no raw ore. I should go mining to find some. Iron ore typically generates between Y levels 0-64, with the highest concentration around Y level 16. Let me find a good mining location..."
  Type: planning
  Category: resource-gathering
  Trigger: inventory_check

[+5.334s] (+0.122s) 🔵 THOUGHT_PROCESSED
  ThoughtId: thought-1696287659000-def456
  ThoughtContent: "I need iron ore to craft more tools. I have a couple of iron ingots but no raw ore..."
  Action: mine_resource
  Confidence: 0.78

[+5.556s] (+0.222s) ✅ ACTION_PLANNED [178ms]
  TaskTitle: Mine 5 iron ore
  TaskType: resource_gathering
  TaskId: task-mine-iron-002
  Priority: medium
  Steps: 5

[+5.778s] (+0.222s) ✅ TOOL_SELECTED [156ms]
  SelectedTool: find_blocks
  Args: {"type":"iron_ore","radius":64}
  Thoughts: "I need to locate iron ore blocks nearby. Let me scan the area for exposed ore first..."
  TaskContext: Mine 5 iron ore

[+6.000s] (+0.222s) ✅ TOOL_EXECUTED [445ms]
  OriginalTool: find_blocks
  NormalizedTool: minecraft.find_blocks
  MappedAction: scan_environment
  ResultOk: true
  ResultData: {"blocks_found":12,"nearest":{"x":120,"y":64,"z":45,"distance":34.2}}

[+6.445s] (+0.445s) ✅ TOOL_SELECTED [89ms]
  SelectedTool: pathfind
  Args: {"to":{"x":120,"y":64,"z":45},"safe":true}
  Thoughts: "Found iron ore 34 blocks away. I'll pathfind there safely..."
  TaskContext: Mine 5 iron ore

[+6.534s] (+0.089s) ✅ TOOL_EXECUTED [2134ms]
  OriginalTool: pathfind
  NormalizedTool: minecraft.pathfind
  MappedAction: move_to
  ResultOk: true
  ResultData: {"arrived":true,"distance_traveled":36.7,"path_length":42}

[+8.668s] (+2.134s) ✅ TOOL_SELECTED [67ms]
  SelectedTool: dig
  Args: {"pos":{"x":120,"y":64,"z":45},"block_id":"iron_ore"}
  Thoughts: "Now I'll dig the iron ore block..."
  TaskContext: Mine 5 iron ore

[+8.735s] (+0.067s) ✅ TOOL_EXECUTED [1456ms]
  OriginalTool: dig
  NormalizedTool: minecraft.dig
  MappedAction: dig_block
  ResultOk: true
  ResultData: {"block_broken":"iron_ore","items_collected":["raw_iron"],"count":1}

[+10.191s] (+1.456s) ✅ ACTION_COMPLETED [23ms]
  TaskId: task-mine-iron-002
  TaskTitle: Mine 5 iron ore
  Success: false
  FinalState: {"iron_ore_collected":1}
  ProgressBefore: 0.0
  ProgressAfter: 0.2

[+10.303s] (+0.112s) ✅ FEEDBACK_RECEIVED
  FeedbackType: progress
  FeedbackContent: Mining progress: 1/5 iron ore collected
  RelatedTaskId: task-mine-iron-002
  Sentiment: neutral

[+10.425s] (+0.122s) ✅ TOOL_SELECTED [78ms]
  SelectedTool: find_blocks
  Args: {"type":"iron_ore","radius":64}
  Thoughts: "I need to find more iron ore to complete the task..."
  TaskContext: Mine 5 iron ore

[Continues for remaining time...]

--- CHAIN 3 ---

[+45.678s] (+35.253s) 🔵 NEED_IDENTIFIED
  Need: hostile_detected
  EntityType: zombie
  Distance: 8.3
  Priority: 0.9
  Trigger: threat_perception

[+45.800s] (+0.122s) ✅ THOUGHT_GENERATED [95ms]
  Thought: "There's a zombie approaching! It's only 8 blocks away. I need to either fight it or retreat to safety. Since my health is decent at 10 hearts, I'll prepare for combat..."
  Type: reactive
  Category: self-defense
  Trigger: hostile_entity_detected

[+45.922s] (+0.122s) 🔵 THOUGHT_PROCESSED
  ThoughtId: thought-1696287699800-ghi789
  ThoughtContent: "There's a zombie approaching! It's only 8 blocks away. I need to either fight it or retreat..."
  Action: defend_self
  Confidence: 0.82

[+46.144s] (+0.222s) ❌ ACTION_PLANNED [12ms]
  ERROR: Failed to create task - combat planning not fully implemented

[+46.266s] (+0.122s) ✅ TOOL_SELECTED [134ms]
  SelectedTool: sense_hostiles
  Args: {"radius":20}
  Thoughts: "Let me check if there are more hostiles nearby before deciding on a strategy..."
  TaskContext: Defend against zombie

[+46.388s] (+0.122s) ✅ TOOL_EXECUTED [89ms]
  OriginalTool: sense_hostiles
  NormalizedTool: minecraft.sense_hostiles
  MappedAction: scan_entities
  ResultOk: true
  ResultData: {"hostiles":[{"type":"zombie","distance":7.1,"health":20}],"total":1}

[+46.510s] (+0.122s) ✅ TOOL_SELECTED [156ms]
  SelectedTool: chat
  Args: {"channel":"system","message":"Hostile zombie detected, preparing to engage"}
  Thoughts: "Only one zombie, I can handle this..."
  TaskContext: Defend against zombie

[+46.632s] (+0.122s) ✅ TOOL_EXECUTED [23ms]
  OriginalTool: chat
  NormalizedTool: minecraft.chat
  MappedAction: send_chat
  ResultOk: true
  ResultData: {"message_sent":true}

[Continues...]

================================================================================
END OF AUDIT LOG
================================================================================
```

## Key Insights from This Example

### Success Patterns
1. **Complete chains**: Health recovery (chain 1) shows full pipeline execution
2. **Tool selection working**: 100% success rate for tool selection in chains 1-2
3. **Proper fallbacks**: Chat tool used when combat planning failed
4. **Good timing**: Average 347ms per operation

### Failure Points
1. **Action planning**: Failed for combat scenario (chain 3)
2. **Incomplete tasks**: Mining task only 20% complete (1/5 ore)
3. **Long gaps**: 3.2s gap between chains suggests idle time

### Recommendations
1. Implement combat planning system
2. Optimize pathfinding (2.1s seems long)
3. Reduce idle time between tasks
4. Add retry logic for partially completed tasks

## How to Read the Logs

- **[+X.XXXs]**: Elapsed time since session start
- **(+X.XXXs)**: Delta from previous entry
- **🔵**: Info/in-progress
- **✅**: Success
- **❌**: Failure
- **[XXms]**: Duration of operation


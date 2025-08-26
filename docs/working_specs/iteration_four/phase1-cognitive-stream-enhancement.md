# Phase 1: Cognitive Stream Enhancement

## Overview
**Status: 🚧 IN PROGRESS**  
**Objective**: Fix cognitive stream data generation, eliminate "No content available" messages, and implement meaningful thought generation with proper context.

## Current Issues

### 1. Empty Reflections
- **Problem**: "No content available" messages appearing in cognitive stream
- **Root Cause**: Thought generator not handling idle states properly
- **Impact**: Poor user experience, no meaningful insights

### 2. Out of Sync Messages
- **Problem**: Timestamps and content not properly synchronized
- **Root Cause**: Multiple data sources not coordinated
- **Impact**: Confusing timeline, unreliable data

### 3. Intrusive Thought Injection Not Working
- **Problem**: Thoughts don't trigger bot responses
- **Root Cause**: No connection between thought injection and planning system
- **Impact**: No user influence on bot behavior

### 4. Poor Data Quality
- **Problem**: Generic system messages instead of meaningful insights
- **Root Cause**: No context-aware thought generation
- **Impact**: Dashboard not providing valuable information

## Implementation Steps

### Step 1.1: Fix Cognitive Stream Data Generation

#### 1.1.1 Enhanced Thought Generator
**File**: `packages/cognition/src/thought-generator.ts`

```typescript
/**
 * Enhanced thought generator with context-aware content
 * @author @darianrosebrook
 */
export class EnhancedThoughtGenerator {
  private lastThoughtTime: number = 0;
  private thoughtInterval: number = 30000; // 30 seconds between thoughts
  
  async generateThought(context: ThoughtContext): Promise<CognitiveThought | null> {
    const now = Date.now();
    
    // Prevent too frequent thoughts
    if (now - this.lastThoughtTime < this.thoughtInterval) {
      return null;
    }
    
    this.lastThoughtTime = now;
    
    // Always generate meaningful content
    if (!context.currentTasks.length && !context.recentEvents.length) {
      return this.generateIdleThought(context);
    }
    
    // Generate context-aware thoughts
    return this.generateContextualThought(context);
  }
  
  private generateIdleThought(context: ThoughtContext): CognitiveThought {
    const idleThoughts = [
      "Monitoring environment for opportunities and potential threats...",
      "Processing recent experiences and updating survival strategies...",
      "Maintaining awareness of surroundings while conserving energy...",
      "Consolidating memories and planning next exploration phase...",
      "Evaluating current position and considering resource needs...",
      "Scanning for nearby resources and safe locations...",
      "Reflecting on recent decisions and their outcomes...",
      "Preparing for potential encounters or environmental changes..."
    ];
    
    const selectedThought = idleThoughts[Math.floor(Math.random() * idleThoughts.length)];
    
    return {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'reflection',
      content: selectedThought,
      timestamp: Date.now(),
      context: {
        emotionalState: context.emotionalState || 'neutral',
        confidence: 0.6,
        cognitiveSystem: 'idle-monitoring'
      },
      metadata: {
        thoughtType: 'idle-reflection',
        trigger: 'time-based',
        context: 'environmental-monitoring'
      }
    };
  }
  
  private async generateContextualThought(context: ThoughtContext): Promise<CognitiveThought> {
    // Prioritize task-related thoughts
    if (context.currentTasks.length > 0) {
      return this.generateTaskThought(context.currentTasks[0], context);
    }
    
    // Generate event-related thoughts
    if (context.recentEvents.length > 0) {
      return this.generateEventThought(context.recentEvents[0], context);
    }
    
    // Fallback to idle thought
    return this.generateIdleThought(context);
  }
}
```

#### 1.1.2 Context-Aware Thought Generation
**File**: `packages/cognition/src/contextual-thought-generator.ts`

```typescript
/**
 * Context-aware thought generation based on bot state
 * @author @darianrosebrook
 */
export class ContextualThoughtGenerator {
  async generateTaskThought(task: Task, context: ThoughtContext): Promise<CognitiveThought> {
    const progress = task.progress || 0;
    const steps = task.steps || [];
    
    if (progress === 0) {
      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'planning',
        content: `Starting task: ${task.title}. Breaking down into ${steps.length} steps.`,
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          step: 0,
          emotionalState: context.emotionalState || 'focused',
          confidence: 0.7
        },
        metadata: {
          thoughtType: 'task-initiation',
          taskType: task.type,
          priority: task.priority
        }
      };
    }
    
    if (progress === 1) {
      return {
        id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'reflection',
        content: `Completed task: ${task.title}. Evaluating results and planning next actions.`,
        timestamp: Date.now(),
        context: {
          taskId: task.id,
          completed: true,
          emotionalState: context.emotionalState || 'satisfied',
          confidence: 0.8
        },
        metadata: {
          thoughtType: 'task-completion',
          taskType: task.type,
          duration: task.duration
        }
      };
    }
    
    const currentStep = steps.find(s => !s.done);
    const completedSteps = steps.filter(s => s.done).length;
    
    return {
      id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'observation',
      content: `Working on: ${currentStep?.label || task.title}. Progress: ${Math.round(progress * 100)}% (${completedSteps}/${steps.length} steps)`,
      timestamp: Date.now(),
      context: {
        taskId: task.id,
        step: completedSteps,
        emotionalState: context.emotionalState || 'focused',
        confidence: 0.6
      },
      metadata: {
        thoughtType: 'task-progress',
        taskType: task.type,
        currentStep: currentStep?.id
      }
    };
  }
  
  async generateEventThought(event: Event, context: ThoughtContext): Promise<CognitiveThought> {
    const eventType = event.type;
    const eventData = event.data;
    
    switch (eventType) {
      case 'damage_taken':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'reflection',
          content: `Took damage from ${eventData.source}. Need to be more careful and find safety.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'cautious',
            confidence: 0.8
          },
          metadata: {
            thoughtType: 'damage-reflection',
            damageAmount: eventData.amount,
            source: eventData.source
          }
        };
        
      case 'resource_gathered':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Gathered ${eventData.amount} ${eventData.resource}. This will be useful for ${eventData.usage || 'survival'}.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'satisfied',
            confidence: 0.7
          },
          metadata: {
            thoughtType: 'resource-gathering',
            resourceType: eventData.resource,
            amount: eventData.amount
          }
        };
        
      case 'entity_encountered':
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Encountered ${eventData.entityType} at distance ${eventData.distance}. ${eventData.hostile ? 'Need to be cautious.' : 'Could be useful.'}`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: eventData.hostile ? 'alert' : 'curious',
            confidence: 0.6
          },
          metadata: {
            thoughtType: 'entity-encounter',
            entityType: eventData.entityType,
            hostile: eventData.hostile,
            distance: eventData.distance
          }
        };
        
      default:
        return {
          id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'observation',
          content: `Noticed ${eventType}: ${eventData.description || 'Something happened'}.`,
          timestamp: Date.now(),
          context: {
            eventId: event.id,
            emotionalState: 'neutral',
            confidence: 0.5
          },
          metadata: {
            thoughtType: 'general-event',
            eventType: eventType
          }
        };
    }
  }
}
```

### Step 1.2: Fix Intrusive Thought Injection

#### 1.2.1 Enhanced Intrusive Thought Processor
**File**: `packages/cognition/src/intrusive-thought-processor.ts`

```typescript
/**
 * Enhanced intrusive thought processing with action parsing
 * @author @darianrosebrook
 */
export class IntrusiveThoughtProcessor {
  private planningSystem: PlanningSystem;
  private taskGenerator: TaskGenerator;
  
  constructor(planningSystem: PlanningSystem, taskGenerator: TaskGenerator) {
    this.planningSystem = planningSystem;
    this.taskGenerator = taskGenerator;
  }
  
  async processIntrusiveThought(thought: string): Promise<BotResponse> {
    try {
      // Parse the thought for actionable content
      const action = this.parseActionFromThought(thought);
      
      if (action) {
        // Create a new task from the intrusive thought
        const task = await this.createTaskFromThought(thought, action);
        
        // Update the planning system
        await this.planningSystem.addTask(task);
        
        return {
          accepted: true,
          response: `Processing thought: "${thought}". Creating task: ${task.title}`,
          taskId: task.id,
          task: task
        };
      }
      
      // Even if no action, record the thought
      return {
        accepted: true,
        response: `Thought recorded: "${thought}". No immediate action required.`,
        recorded: true
      };
      
    } catch (error) {
      console.error('Failed to process intrusive thought:', error);
      return {
        accepted: false,
        response: `Failed to process thought: "${thought}". Error: ${error.message}`,
        error: error.message
      };
    }
  }
  
  private parseActionFromThought(thought: string): Action | null {
    const actionPatterns = {
      craft: {
        pattern: /craft\s+(.+)/i,
        priority: 'high',
        category: 'crafting'
      },
      mine: {
        pattern: /mine\s+(.+)/i,
        priority: 'medium',
        category: 'mining'
      },
      explore: {
        pattern: /explore\s+(.+)/i,
        priority: 'medium',
        category: 'exploration'
      },
      build: {
        pattern: /build\s+(.+)/i,
        priority: 'high',
        category: 'building'
      },
      gather: {
        pattern: /gather\s+(.+)/i,
        priority: 'medium',
        category: 'gathering'
      },
      find: {
        pattern: /find\s+(.+)/i,
        priority: 'medium',
        category: 'search'
      },
      go: {
        pattern: /go\s+(.+)/i,
        priority: 'medium',
        category: 'movement'
      }
    };
    
    for (const [actionType, config] of Object.entries(actionPatterns)) {
      const match = thought.match(config.pattern);
      if (match) {
        return {
          type: actionType,
          target: match[1].trim(),
          priority: config.priority,
          category: config.category
        };
      }
    }
    
    return null;
  }
  
  private async createTaskFromThought(thought: string, action: Action): Promise<Task> {
    const taskTitle = this.generateTaskTitle(action);
    const taskDescription = this.generateTaskDescription(action, thought);
    
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: taskTitle,
      description: taskDescription,
      type: action.category,
      priority: action.priority,
      source: 'intrusive-thought',
      progress: 0,
      status: 'active',
      steps: this.generateTaskSteps(action),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        originalThought: thought,
        action: action,
        confidence: 0.7
      }
    };
    
    return task;
  }
  
  private generateTaskTitle(action: Action): string {
    const titles = {
      craft: `Craft ${action.target}`,
      mine: `Mine ${action.target}`,
      explore: `Explore ${action.target}`,
      build: `Build ${action.target}`,
      gather: `Gather ${action.target}`,
      find: `Find ${action.target}`,
      go: `Go to ${action.target}`
    };
    
    return titles[action.type] || `Perform ${action.type} on ${action.target}`;
  }
  
  private generateTaskDescription(action: Action, originalThought: string): string {
    return `Task created from intrusive thought: "${originalThought}". ${action.type} ${action.target}.`;
  }
  
  private generateTaskSteps(action: Action): TaskStep[] {
    const baseSteps = [
      {
        id: `step-${Date.now()}-1`,
        label: `Prepare for ${action.type}`,
        done: false,
        order: 1
      },
      {
        id: `step-${Date.now()}-2`,
        label: `Locate ${action.target}`,
        done: false,
        order: 2
      },
      {
        id: `step-${Date.now()}-3`,
        label: `Perform ${action.type} on ${action.target}`,
        done: false,
        order: 3
      },
      {
        id: `step-${Date.now()}-4`,
        label: `Complete ${action.type} task`,
        done: false,
        order: 4
      }
    ];
    
    return baseSteps;
  }
}
```

#### 1.2.2 Enhanced API Endpoint
**File**: `packages/dashboard/src/app/api/intrusive/route.ts`

```typescript
/**
 * Enhanced intrusive thought API endpoint
 * @author @darianrosebrook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, tags, strength } = body;
    
    if (!text || text.trim().length === 0) {
      return Response.json(
        { error: 'Thought content is required' },
        { status: 400 }
      );
    }
    
    // Send to cognition system for processing
    const cognitionResponse = await fetch('http://localhost:3003/intrusive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        tags: tags || [],
        strength: strength || 1.0,
        timestamp: Date.now()
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!cognitionResponse.ok) {
      throw new Error(`Cognition system responded with ${cognitionResponse.status}`);
    }
    
    const result = await cognitionResponse.json();
    
    // Also add to cognitive stream for immediate display
    const streamResponse = await fetch('http://localhost:3000/api/ws/cognitive-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'intrusive',
        content: text.trim(),
        attribution: 'external',
        context: {
          emotionalState: 'neutral',
          confidence: 0.8,
          source: 'user-injection'
        },
        metadata: {
          tags: tags || [],
          strength: strength || 1.0,
          processed: result.accepted
        }
      })
    });
    
    return Response.json({
      success: true,
      accepted: result.accepted,
      response: result.response,
      taskId: result.taskId,
      task: result.task
    });
    
  } catch (error) {
    console.error('Failed to process intrusive thought:', error);
    return Response.json(
      { 
        error: 'Failed to process intrusive thought',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
```

### Step 1.3: Add Thought Categorization and Filtering

#### 1.3.1 Thought Categories
**File**: `packages/cognition/src/types/thoughts.ts`

```typescript
/**
 * Enhanced thought types and categories
 * @author @darianrosebrook
 */
export interface CognitiveThought {
  id: string;
  type: ThoughtType;
  content: string;
  timestamp: number;
  context: ThoughtContext;
  metadata: ThoughtMetadata;
  category?: ThoughtCategory;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
}

export type ThoughtType = 
  | 'reflection'
  | 'observation'
  | 'planning'
  | 'decision'
  | 'memory'
  | 'intrusive'
  | 'emotional'
  | 'sensory';

export type ThoughtCategory =
  | 'task-related'
  | 'environmental'
  | 'survival'
  | 'exploration'
  | 'crafting'
  | 'combat'
  | 'social'
  | 'idle'
  | 'meta-cognitive';

export interface ThoughtContext {
  emotionalState?: string;
  confidence?: number;
  cognitiveSystem?: string;
  taskId?: string;
  eventId?: string;
  memoryId?: string;
  position?: Position;
  health?: number;
  inventory?: InventoryItem[];
}

export interface ThoughtMetadata {
  thoughtType: string;
  trigger?: string;
  context?: string;
  duration?: number;
  intensity?: number;
  relatedThoughts?: string[];
}
```

#### 1.3.2 Thought Filtering System
**File**: `packages/dashboard/src/components/thought-filter.tsx`

```typescript
/**
 * Thought filtering component for dashboard
 * @author @darianrosebrook
 */
interface ThoughtFilterProps {
  onFilterChange: (filters: ThoughtFilters) => void;
  filters: ThoughtFilters;
}

export function ThoughtFilter({ onFilterChange, filters }: ThoughtFilterProps) {
  const thoughtTypes: ThoughtType[] = [
    'reflection', 'observation', 'planning', 'decision', 
    'memory', 'intrusive', 'emotional', 'sensory'
  ];
  
  const thoughtCategories: ThoughtCategory[] = [
    'task-related', 'environmental', 'survival', 'exploration',
    'crafting', 'combat', 'social', 'idle', 'meta-cognitive'
  ];
  
  return (
    <div className="flex flex-col gap-4 p-4 bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold text-white">Filter Thoughts</h3>
      
      {/* Type Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Thought Types
        </label>
        <div className="flex flex-wrap gap-2">
          {thoughtTypes.map(type => (
            <button
              key={type}
              onClick={() => {
                const newTypes = filters.types.includes(type)
                  ? filters.types.filter(t => t !== type)
                  : [...filters.types, type];
                onFilterChange({ ...filters, types: newTypes });
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                filters.types.includes(type)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      
      {/* Category Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Categories
        </label>
        <div className="flex flex-wrap gap-2">
          {thoughtCategories.map(category => (
            <button
              key={category}
              onClick={() => {
                const newCategories = filters.categories.includes(category)
                  ? filters.categories.filter(c => c !== category)
                  : [...filters.categories, category];
                onFilterChange({ ...filters, categories: newCategories });
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                filters.categories.includes(category)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      
      {/* Time Range Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Time Range
        </label>
        <select
          value={filters.timeRange}
          onChange={(e) => onFilterChange({ ...filters, timeRange: e.target.value })}
          className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600"
        >
          <option value="all">All Time</option>
          <option value="1h">Last Hour</option>
          <option value="6h">Last 6 Hours</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
        </select>
      </div>
      
      {/* Priority Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Priority
        </label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map(priority => (
            <button
              key={priority}
              onClick={() => {
                const newPriorities = filters.priorities.includes(priority)
                  ? filters.priorities.filter(p => p !== priority)
                  : [...filters.priorities, priority];
                onFilterChange({ ...filters, priorities: newPriorities });
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                filters.priorities.includes(priority)
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {priority}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Success Criteria

### ✅ Step 1.1: Fix Cognitive Stream Data Generation
- [ ] No more "No content available" messages
- [ ] Consistent thought generation every 30 seconds
- [ ] Meaningful idle thoughts when no active tasks
- [ ] Proper timestamp synchronization

### ✅ Step 1.2: Implement Meaningful Thought Generation
- [ ] Context-aware thoughts based on current state
- [ ] Task-related thoughts with progress updates
- [ ] Event-related thoughts with proper categorization
- [ ] Emotional state integration in thoughts

### 🚧 Step 1.3: Fix Intrusive Thought Injection
- [ ] Intrusive thoughts trigger actual bot responses
- [ ] Action parsing from natural language
- [ ] Task creation from actionable thoughts
- [ ] Proper integration with planning system

### 🚧 Step 1.4: Add Thought Categorization and Filtering
- [ ] Thought categorization system
- [ ] Dashboard filtering interface
- [ ] Time-based filtering
- [ ] Priority-based filtering

## Testing Strategy

### Unit Tests
- Test thought generation with various contexts
- Test action parsing from different thought formats
- Test filtering system with different criteria

### Integration Tests
- Test end-to-end thought injection flow
- Test thought generation with real bot state
- Test dashboard filtering with live data

### User Acceptance Tests
- Verify no empty thoughts appear in stream
- Test intrusive thought injection and response
- Validate thought categorization accuracy

## Performance Considerations

### Thought Generation
- Limit thought frequency to prevent spam
- Cache context data to avoid repeated fetches
- Use efficient data structures for thought storage

### Filtering
- Implement efficient filtering algorithms
- Use pagination for large thought histories
- Cache filtered results when appropriate

### Real-time Updates
- Optimize WebSocket message size
- Batch updates when possible
- Implement proper cleanup for old thoughts

---

**Author**: @darianrosebrook  
**Status**: 🚧 **IN PROGRESS**

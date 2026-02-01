/**
 * Thought-to-task conversion: extract action type, title, and parameters
 * from cognitive stream thoughts. Actionable-word filtering and LLM fallback.
 *
 * @author @darianrosebrook
 */

import type { Task } from '../types/task';
import type { CognitiveStreamThought } from '../modules/cognitive-stream-client';
import { parseRequiredQuantityFromTitle } from '../modules/requirements';

export function extractActionTitle(
  content: string,
  actionType: string
): string {
  const sentences = content.split(/[.!?]/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(actionType)) {
      return sentence.trim();
    }
  }
  return content;
}

export function extractResourceType(content: string): string {
  if (content.includes('wood') || content.includes('log')) return 'oak_log';
  if (content.includes('iron')) return 'iron_ore';
  if (content.includes('stone')) return 'cobblestone';
  if (content.includes('diamond')) return 'diamond_ore';
  if (content.includes('food')) return 'bread';
  return 'oak_log';
}

export function extractItemType(content: string): string {
  if (content.includes('pickaxe')) return 'wooden_pickaxe';
  if (content.includes('sword')) return 'wooden_sword';
  if (content.includes('axe')) return 'wooden_axe';
  if (content.includes('shovel')) return 'wooden_shovel';
  if (content.includes('table')) return 'crafting_table';
  if (content.includes('planks') || content.includes('plank'))
    return 'oak_planks';
  if (content.includes('stick')) return 'stick';
  return 'oak_planks';
}

export function extractBlockType(content: string): string {
  if (content.includes('iron')) return 'iron_ore';
  if (content.includes('coal')) return 'coal_ore';
  if (content.includes('stone')) return 'stone';
  if (content.includes('diamond')) return 'diamond_ore';
  return 'stone';
}

export function calculateTaskPriority(thought: CognitiveStreamThought): number {
  let priority = 0.5;
  priority += thought.context.confidence * 0.3;
  if (thought.metadata.llmConfidence) {
    priority += thought.metadata.llmConfidence * 0.2;
  }
  if (thought.context.emotionalState === 'urgent') {
    priority += 0.2;
  } else if (thought.context.emotionalState === 'excited') {
    priority += 0.1;
  }
  return Math.min(1.0, priority);
}

export function calculateTaskUrgency(thought: CognitiveStreamThought): number {
  let urgency = 0.3;
  if (thought.context.emotionalState === 'urgent') {
    urgency = 0.8;
  } else if (thought.context.emotionalState === 'excited') {
    urgency = 0.6;
  } else if (thought.context.emotionalState === 'focused') {
    urgency = 0.5;
  }
  urgency += thought.context.confidence * 0.2;
  return Math.min(1.0, urgency);
}

const VALID_TARGETS = new Set([
  'oak_log',
  'birch_log',
  'spruce_log',
  'iron_ore',
  'cobblestone',
  'diamond_ore',
  'coal_ore',
  'stone',
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'crafting_table',
  'wooden_axe',
  'wooden_sword',
  'furnace',
  'chest',
  'oak_planks',
  'stick',
]);

/**
 * Extract structured intent from ambiguous thought text via local LLM.
 * Returns null on failure or when MLX sidecar is unavailable.
 */
export async function extractStructuredIntent(content: string): Promise<{
  kind: 'collect' | 'mine' | 'craft' | 'build';
  target: string;
  quantity: number;
} | null> {
  const VALID_KINDS = new Set(['collect', 'mine', 'craft', 'build']);

  type StructuredIntent = {
    kind: 'collect' | 'mine' | 'craft' | 'build';
    target: string;
    quantity: number;
  };
  const validateParsed = (parsed: any): StructuredIntent | null => {
    if (!parsed.kind || !parsed.target) return null;
    const normalizedTarget = String(parsed.target)
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')
      .replace(/\s+/g, '_');
    if (!VALID_KINDS.has(parsed.kind)) return null;
    if (!VALID_TARGETS.has(normalizedTarget)) return null;
    const qty =
      typeof parsed.quantity === 'number' && parsed.quantity > 0
        ? parsed.quantity
        : 1;
    return { kind: parsed.kind, target: normalizedTarget, quantity: qty };
  };

  try {
    const { LLMInterface } = await import('@conscious-bot/cognition');
    const llm = new LLMInterface({
      temperature: 0.1,
      maxTokens: 80,
      timeout: 3000,
      retries: 0,
    });
    const response = await llm.generateResponse(
      `Extract the Minecraft goal from this thought. Reply with ONLY valid JSON, nothing else.
Valid kinds: collect, mine, craft, build
Valid targets: ${[...VALID_TARGETS].join(', ')}

Thought: "${content}"

Reply with exactly: {"kind":"...","target":"...","quantity":N}`
    );
    const text = (response.text || '').trim();
    try {
      const result = validateParsed(JSON.parse(text));
      if (result) return result;
    } catch {
      const match = text.match(/\{[^}]+\}/);
      if (match) {
        try {
          const result = validateParsed(JSON.parse(match[0]));
          if (result) return result;
        } catch {
          /* malformed */
        }
      }
    }
  } catch {
    /* MLX sidecar unavailable */
  }
  return null;
}

export interface ConvertThoughtToTaskDeps {
  addTask: (taskData: Partial<Task>) => Promise<Task>;
  markThoughtAsProcessed: (thoughtId: string) => Promise<void>;
  seenThoughtIds: Set<string>;
  trimSeenThoughtIds: () => void;
}

/**
 * Convert a cognitive thought to a planning task.
 * Applies actionable-word filtering and dedup; returns null if skipped.
 */
export async function convertThoughtToTask(
  thought: CognitiveStreamThought,
  deps: ConvertThoughtToTaskDeps
): Promise<Task | null> {
  try {
    if (thought.processed) return null;

    const lower = thought.content.trim().toLowerCase();
    if (
      lower.startsWith('health:') ||
      lower.startsWith('hunger:') ||
      /observing\s+environment\s+and\s+deciding/.test(lower) ||
      /^\d+%\.?\s*(health|hunger|observing)/.test(lower) ||
      /is complete\.\s*i have \d+ other tasks/.test(lower)
    ) {
      return null;
    }

    if (deps.seenThoughtIds.has(thought.id)) return null;
    deps.seenThoughtIds.add(thought.id);
    if (deps.seenThoughtIds.size > 500) {
      deps.trimSeenThoughtIds();
    }

    const content = thought.content.toLowerCase();
    const tail = thought.content.slice(-100);
    const goalMatch = tail.match(
      /\[GOAL:\s*(collect|mine|craft|build)\s+([\w]+)(?:\s+(\d+))?\]/i
    );

    let actionType = 'general';
    let taskTitle = thought.content;
    let taskDescription = thought.content;

    if (goalMatch) {
      const [, kind] = goalMatch;
      const kindLower = (kind || '').toLowerCase() as
        | 'collect'
        | 'mine'
        | 'craft'
        | 'build';
      const kindToType: Record<string, string> = {
        collect: 'gathering',
        mine: 'mining',
        craft: 'crafting',
        build: 'building',
      };
      actionType = kindToType[kindLower] || 'general';
      taskTitle = extractActionTitle(content, kindLower);
    }

    if (!goalMatch) {
      if (
        content.includes('gather') ||
        content.includes('collect') ||
        content.includes('wood') ||
        content.includes('log')
      ) {
        actionType = 'gathering';
        taskTitle = extractActionTitle(content, 'gather');
      } else if (
        content.includes('craft') ||
        content.includes('build') ||
        content.includes('make') ||
        content.includes('create')
      ) {
        actionType = 'crafting';
        taskTitle = extractActionTitle(content, 'craft');
      } else if (
        content.includes('mine') ||
        content.includes('dig') ||
        content.includes('ore')
      ) {
        actionType = 'mining';
        taskTitle = extractActionTitle(content, 'mine');
      } else if (
        content.includes('explore') ||
        content.includes('search') ||
        content.includes('scout')
      ) {
        actionType = 'exploration';
        taskTitle = extractActionTitle(content, 'explore');
      } else if (
        content.includes('farm') ||
        content.includes('plant') ||
        content.includes('harvest')
      ) {
        actionType = 'farming';
        taskTitle = extractActionTitle(content, 'farm');
      } else {
        taskTitle = thought.content;
      }
    }

    const parameters: Record<string, any> = {
      thoughtContent: thought.content,
      thoughtId: thought.id,
      thoughtType: thought.metadata.thoughtType,
      confidence: thought.context.confidence,
      cognitiveSystem: thought.context.cognitiveSystem,
      llmConfidence: thought.metadata.llmConfidence,
      model: thought.metadata.model,
    };

    if (actionType === 'gathering') {
      parameters.resourceType = extractResourceType(content);
    } else if (actionType === 'crafting') {
      parameters.itemType = extractItemType(content);
    } else if (actionType === 'mining') {
      parameters.blockType = extractBlockType(content);
    }

    if (actionType === 'crafting') {
      const itemName = extractItemType(content);
      if (itemName) {
        parameters.requirementCandidate = {
          kind: 'craft',
          outputPattern: itemName,
          quantity: 1,
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'gathering') {
      const resource = extractResourceType(content);
      if (resource) {
        parameters.requirementCandidate = {
          kind: 'collect',
          outputPattern: resource,
          quantity: parseRequiredQuantityFromTitle(taskTitle, 8),
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'mining') {
      const blockType = extractBlockType(content);
      if (blockType) {
        parameters.requirementCandidate = {
          kind: 'mine',
          outputPattern: blockType,
          quantity: parseRequiredQuantityFromTitle(taskTitle, 3),
          extractionMethod: 'thought-content',
        };
      }
    } else if (actionType === 'building') {
      parameters.requirementCandidate = {
        kind: 'build',
        outputPattern: 'basic_shelter_5x5',
        quantity: 1,
        extractionMethod: 'thought-content',
      };
    }

    if (goalMatch) {
      const [, kind, target, qtyStr] = goalMatch;
      const kindLower = (kind || '').toLowerCase();
      const qty = qtyStr ? parseInt(qtyStr, 10) : undefined;
      parameters.requirementCandidate = {
        kind: kindLower,
        outputPattern: (target || '').toLowerCase(),
        quantity:
          qty || (kindLower === 'mine' ? 3 : kindLower === 'collect' ? 8 : 1),
        extractionMethod: 'goal-tag',
      };
    }

    if (actionType === 'general' && !goalMatch) {
      const structured = await extractStructuredIntent(thought.content);
      if (structured) {
        const kindToType: Record<string, string> = {
          collect: 'gathering',
          mine: 'mining',
          craft: 'crafting',
          build: 'building',
        };
        actionType = kindToType[structured.kind] || actionType;
        taskTitle = extractActionTitle(content, structured.kind);
        parameters.requirementCandidate = {
          kind: structured.kind,
          outputPattern: structured.target,
          quantity: structured.quantity,
          extractionMethod: 'llm-structured',
        };
      }
    }

    const extractionMethod =
      parameters.requirementCandidate?.extractionMethod || actionType;
    const contentHash = Array.from(thought.content.slice(0, 80))
      .reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
      .toString(36)
      .replace('-', 'n');

    const task: Task = {
      id: `cognitive-task-${thought.id}-${extractionMethod}-${contentHash}`,
      title: taskTitle,
      description: taskDescription,
      type: actionType,
      priority: calculateTaskPriority(thought),
      urgency: calculateTaskUrgency(thought),
      progress: 0,
      status: 'pending',
      source: 'autonomous',
      steps: [],
      parameters,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        childTaskIds: [],
        tags: ['cognitive', 'autonomous', thought.metadata.thoughtType],
        category: actionType,
      },
    };

    const addedTask = await deps.addTask(task);
    await deps.markThoughtAsProcessed(thought.id);
    return addedTask;
  } catch (error) {
    console.error('Error converting thought to task:', error);
    return null;
  }
}

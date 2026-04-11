/**
 * ReAct Arbiter - Implements reason↔act loop for grounded cognition
 *
 * Orchestrates a ReAct loop that interleaves short reasoning with single tool calls;
 * selects goals, decides next option/skill, reads environment feedback, and iterates.
 *
 * @author @darianrosebrook
 */

import { z } from 'zod';
import { LLMInterface } from '../cognitive-core/llm-interface';
import { auditLogger } from '../audit/thought-action-audit-logger';
import { createServerLogger } from '../server-utils/server-logger';

const reactLogger = createServerLogger({ subsystem: 'react-arbiter' });

// ============================================================================
// Types
// ============================================================================

// Missing type definitions
interface Entity {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  hostile: boolean;
}

interface Block {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
}

interface InventoryItem {
  id: string;
  type: string;
  count: number;
}

interface ArmorItem {
  id: string;
  type: string;
  slot: string;
}

interface ToolItem {
  id: string;
  type: string;
  durability: number;
}

interface ToolDefinition {
  name: string;
  description: string;
  argsSchema: any;
}

interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  retries: number;
}

export interface ReActStep {
  thoughts: string;
  selectedTool: string;
  args: Record<string, any>;
  guardrails?: string[];
  followupGoal?: string;
}

export interface ReActContext {
  snapshot: WorldSnapshot;
  inventory: InventoryState;
  goalStack: Goal[];
  memorySummaries: MemorySummary[];
  lastToolResult?: ToolResult;
  reflexionHints?: ReflexionHint[];
  task?: { title: string; description: string; type: string };
}

export interface WorldSnapshot {
  stateId: string;
  position: { x: number; y: number; z: number };
  biome: string;
  time: number;
  light: number;
  hazards: string[];
  nearbyEntities: Entity[];
  nearbyBlocks: Block[];
  weather: string;
}

export interface InventoryState {
  stateId: string;
  items: InventoryItem[];
  armor: ArmorItem[];
  tools: ToolItem[];
}

export interface Goal {
  id: string;
  type: string;
  description: string;
  priority: number;
  utility: number;
  source: 'drive' | 'user' | 'curriculum';
}

export interface MemorySummary {
  type: 'episodic' | 'semantic' | 'reflexion';
  content: string;
  relevance: number;
}

export interface ToolResult {
  ok: boolean;
  data?: any;
  error?: string;
  environmentDeltas?: any;
}

export interface ReflexionHint {
  situation: string;
  failure?: string;
  lesson: string;
  guardrail?: Record<string, any>;
  relevance?: number;
}

// ============================================================================
// ReAct Arbiter Implementation
// ============================================================================

export class ReActArbiter {
  private llmConfig: LLMConfig;
  private toolRegistry: Map<string, ToolDefinition> = new Map();
  private reflexionBuffer: ReflexionHint[] = [];
  private llm: LLMInterface;

  constructor(config: LLMConfig) {
    this.llmConfig = config;
    this.llm = new LLMInterface({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeout: config.timeout,
      retries: config.retries,
    });
    this.initializeToolRegistry();
  }

  /**
   * Execute a single ReAct reasoning step
   * Always yields at most one tool call; subsequent state must include prior tool's result
   */
  async reason(context: ReActContext): Promise<ReActStep> {
    const startTime = Date.now();
    const prompt = this.buildReActPrompt(context);

    try {
      const response = await this.callLLM(prompt, {
        temperature: 0.3, // Low temperature for operational decisions
        maxTokens: 500,
      });

      const step = this.parseReActResponse(response.text);

      // Validate that we have at most one tool call
      if (!step.selectedTool) {
        reactLogger.warn('No tool selected, using fallback', {
          event: 'react_arbiter_no_tool_selected',
          tags: ['react-arbiter', 'fallback', 'warn'],
          fields: {
            taskTitle: context.task?.title,
            thoughtsSnippet: step.thoughts?.slice(0, 200),
          },
        });
        // Fallback to safe default action
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
        reactLogger.warn('Unknown tool, attempting fuzzy match', {
          event: 'react_arbiter_unknown_tool',
          tags: ['react-arbiter', 'fuzzy-match', 'warn'],
          fields: {
            requestedTool: step.selectedTool,
          },
        });

        // Try to find closest matching tool
        const availableTools = Array.from(this.toolRegistry.keys());
        const closeMatch = availableTools.find(
          (tool) =>
            tool.toLowerCase().includes(step.selectedTool.toLowerCase()) ||
            step.selectedTool.toLowerCase().includes(tool.toLowerCase())
        );

        if (closeMatch) {
          console.log(
            `[ReActArbiter] Fuzzy matched ${step.selectedTool} to ${closeMatch}`
          );
          step.selectedTool = closeMatch;
        } else {
          reactLogger.warn('No fuzzy match found, falling back to chat', {
            event: 'react_arbiter_no_fuzzy_match',
            tags: ['react-arbiter', 'fallback', 'warn'],
            fields: {
              requestedTool: step.selectedTool,
              availableToolCount: availableTools.length,
            },
          });
          return {
            thoughts: step.thoughts,
            selectedTool: 'chat',
            args: {
              channel: 'system',
              message: `I tried to use tool "${step.selectedTool}" but it's not available. Available tools: ${availableTools.join(', ')}`,
            },
          };
        }
      }

      console.log(
        `[ReActArbiter] Selected tool: ${step.selectedTool} with args:`,
        step.args
      );

      // Log tool selection for audit trail
      auditLogger.log(
        'tool_selected',
        {
          selectedTool: step.selectedTool,
          args: step.args,
          thoughts: step.thoughts?.substring(0, 100),
          taskContext: context.task?.title,
          taskDescription: context.task?.description,
          inventoryItems: context.inventory?.items?.length || 0,
          inventorySummary: this.summarizeInventory(context.inventory),
          nearbyBlocks: context.snapshot?.nearbyBlocks?.length || 0,
          nearbyBlockSummary: this.summarizeNearbyBlocks(context.snapshot?.nearbyBlocks),
          hostileEntities:
            context.snapshot?.nearbyEntities?.filter((e) => e.hostile)
              ?.length || 0,
        },
        {
          success: true,
          duration: Date.now() - startTime,
        }
      );

      return step;
    } catch (error) {
      reactLogger.error('ReAct reasoning failed', {
        event: 'react_arbiter_reason_failed',
        tags: ['react-arbiter', 'reason', 'error'],
        fields: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          taskTitle: context.task?.title,
        },
      });

      // Fallback: return safe default instead of throwing
      return {
        thoughts: `Error during reasoning: ${error instanceof Error ? error.message : 'unknown error'}`,
        selectedTool: 'chat',
        args: {
          channel: 'system',
          message:
            'I encountered an error while trying to reason about the next action.',
        },
      };
    }
  }

  /**
   * Generate Reflexion-style verbal self-feedback
   * Invoked automatically on failure or success boundary
   */
  async reflect(
    episodeTrace: any[],
    outcome: 'success' | 'failure',
    errors?: string[]
  ): Promise<ReflexionHint> {
    const prompt = this.buildReflectionPrompt(episodeTrace, outcome, errors);

    try {
      const response = await this.callLLM(prompt, {
        temperature: 0.7, // Higher temperature for creative reflection
        maxTokens: 300,
      });

      const reflection = this.parseReflectionResponse(response.text);

      // Store in reflexion buffer for future reference
      this.reflexionBuffer.push(reflection);

      return reflection;
    } catch (error) {
      reactLogger.error('Reflection generation failed', {
        event: 'react_arbiter_reflection_failed',
        tags: ['react-arbiter', 'reflection', 'error'],
        fields: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          outcome,
        },
      });
      throw error;
    }
  }

  /**
   * Get reflexion hints relevant to current situation
   */
  getRelevantReflexionHints(situation: string): ReflexionHint[] {
    return this.reflexionBuffer
      .filter((hint) => hint.situation.includes(situation))
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 3); // Return top 3 most relevant hints
  }

  /**
   * Generate task steps using LLM directly
   * This is used for task decomposition outside of the ReAct loop
   */
  async generateTaskSteps(task: any): Promise<string> {
    const prompt = `
Turn this into 3–6 steps I can do in the world, in order.

Task: ${task.title}
${task.description ? `Context: ${task.description}` : ''}

Write a numbered list. Each step must be a concrete action (move/look/collect/mine/craft/build/use), not planning talk. Keep steps short.
`.trim();

    try {
      const response = await this.llm.generateResponse(prompt, undefined, {
        temperature: 0.3,
        maxTokens: 300,
      });
      return response.text;
    } catch (error) {
      reactLogger.error('Task step generation failed', {
        event: 'react_arbiter_task_steps_failed',
        tags: ['react-arbiter', 'task-steps', 'error'],
        fields: {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          taskTitle: task?.title,
        },
      });
      throw error;
    }
  }

  /**
   * Call LLM with prompt and options.
   *
   * Note: this wrapper DOES NOT log on rejection. Every caller of
   * `callLLM` has its own try/catch that logs a domain-specific event
   * (`react_arbiter_reason_failed`, `react_arbiter_reflection_failed`)
   * with richer context (task title, outcome, etc.) than a generic
   * "LLM call failed" could provide. An inner log here would just
   * duplicate the outer caller's log for the same root cause — a
   * "dual-log cascade" that inflates grep noise without adding signal.
   *
   * If you add a new caller of `callLLM`, you MUST add an outer
   * try/catch in that caller and log the failure there. Do not
   * reintroduce the inner log as a "safety net" — the rethrow path
   * is the contract.
   */
  private async callLLM(prompt: string, options?: any): Promise<any> {
    return await this.llm.generateResponse(prompt, undefined, options);
  }

  /**
   * Build reflection prompt for learning from experience
   */
  private buildReflectionPrompt(
    episodeTrace: any[],
    outcome: 'success' | 'failure',
    errors?: string[]
  ): string {
    const traceSummary = episodeTrace
      .map(
        (step, i) =>
          `${i + 1}. ${step.thoughts} -> ${step.selectedTool}(${JSON.stringify(step.args)})`
      )
      .join('\n');

    const errorInfo = errors?.length
      ? `\nErrors encountered:\n${errors.map((e) => `- ${e}`).join('\n')}`
      : '';

    return `Reflect on the following completed episode.

Episode Trace:
${traceSummary}

Outcome: ${outcome}${errorInfo}

Please provide a brief reflection on what went well and what could be improved. Focus on:
1. What worked effectively
2. What could be done better next time
3. Any important lessons learned

Keep your reflection concise and actionable.`;
  }

  /**
   * Parse ReAct response to extract thoughts and tool selection
   * Uses multiple parsing strategies with fallbacks
   */
  private parseReActResponse(responseText: string): ReActStep {
    // Strategy 1: Try JSON parsing first
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.tool || parsed.action || parsed.selectedTool) {
          return {
            thoughts: parsed.thoughts || parsed.reasoning || '',
            selectedTool:
              parsed.tool || parsed.action || parsed.selectedTool || '',
            args: parsed.args || parsed.parameters || {},
          };
        }
      } catch (e) {
        reactLogger.warn(
          'ReAct JSON parsing failed, trying fallback methods',
          {
            event: 'react_arbiter_json_parse_failed',
            tags: ['react-arbiter', 'parse', 'warn'],
            fields: {
              error: e instanceof Error ? e.message : String(e),
              responseSnippet: jsonMatch[0].slice(0, 200),
            },
          }
        );
      }
    }

    // Strategy 2: Line-by-line keyword matching (original approach)
    const lines = responseText.split('\n');
    let thoughts = '';
    let selectedTool = '';
    let args: Record<string, any> = {};

    // Anchored label regexes (fix for the prose-substring matching bug).
    // Prior code used `trimmed.toLowerCase().includes('tool:')` which
    // would falsely match any prose line containing the substring
    // "tool:" — e.g. "I think I should use a good tool: the axe" would
    // be treated as a Tool: label line and "the axe" would be extracted
    // as the selected tool. Anchoring to line start (after trim) with
    // `^tool:` or `^action:` makes the matcher reject prose and only
    // fire on actual labeled lines. Same fix applies to args/parameters.
    const TOOL_LABEL_RE = /^(tool|action):/i;
    const ARGS_LABEL_RE = /^(args|parameters):/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (TOOL_LABEL_RE.test(trimmed)) {
        // Same colon-split caveat as the args parser below: split(':')
        // splits on every colon, so a tool name like `mcp:filesystem:write`
        // (namespaced MCP tool names are legal) would silently truncate
        // to `mcp` and fall through to fuzzy-match. Take everything
        // after the FIRST colon so the full label reaches the registry.
        const toolColonIdx = trimmed.indexOf(':');
        selectedTool =
          toolColonIdx >= 0 ? trimmed.slice(toolColonIdx + 1).trim() : '';
      } else if (ARGS_LABEL_RE.test(trimmed)) {
        try {
          // Take everything after the FIRST colon, not split on every
          // colon — JSON objects contain colons between keys and values
          // (e.g. {"x": 1}), and splitting on all colons would truncate
          // the payload at the first key boundary and fail to parse
          // every non-trivial args line.
          const colonIdx = trimmed.indexOf(':');
          const argsText = colonIdx >= 0
            ? trimmed.slice(colonIdx + 1).trim() || '{}'
            : '{}';
          args = JSON.parse(argsText);
        } catch (e) {
          reactLogger.warn('ReAct failed to parse args from line', {
            event: 'react_arbiter_args_parse_failed',
            tags: ['react-arbiter', 'parse', 'warn'],
            fields: {
              error: e instanceof Error ? e.message : String(e),
              line: trimmed.slice(0, 200),
            },
          });
        }
      } else if (trimmed && !selectedTool) {
        thoughts += trimmed + ' ';
      }
    }

    // Strategy 3: Fuzzy tool name extraction from response text
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

    return {
      thoughts: thoughts.trim() || responseText.substring(0, 100),
      selectedTool,
      args,
    };
  }

  /**
   * Parse reflection response to extract learning
   */
  private parseReflectionResponse(responseText: string): ReflexionHint {
    return {
      situation: 'general',
      lesson: responseText.trim(),
      relevance: 0.5,
    };
  }

  /**
   * Build ReAct prompt for reasoning with structured output format
   */
  private buildReActPrompt(context: ReActContext): string {
    const tools = Array.from(this.toolRegistry.values())
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    const reflexionHints = context.reflexionHints?.length
      ? `\nReflexion Hints:\n${context.reflexionHints.map((h) => `- ${h.lesson}`).join('\n')}`
      : '';

    return `Using ReAct (Reasoning + Acting), analyze the current situation and select an appropriate action.

Available Tools:
${tools}

Current Task: ${context.task?.title || 'No task'}
Task Description: ${context.task?.description || 'No description provided'}
Task Type: ${context.task?.type || 'general'}

Current Context:
- Player Position: ${JSON.stringify(context.snapshot?.position || {})}
- Inventory: ${this.summarizeInventory(context.inventory)}
- Nearby Blocks: ${this.summarizeNearbyBlocks(context.snapshot?.nearbyBlocks)}
- Hostile Entities: ${context.snapshot?.nearbyEntities?.filter((e) => e.hostile)?.length || 0} entities${reflexionHints}

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
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Compact inventory summary for prompt context.
   * Merges tools into items, aggregates by type, shows top 8 by count.
   */
  private summarizeInventory(inventory: InventoryState): string {
    const items = inventory?.items;
    if (!items || items.length === 0) {
      const tools = inventory?.tools;
      if (!tools || tools.length === 0) return 'empty';
    }

    const allItems: Array<{ type: string; count: number }> = [
      ...(inventory.items ?? []),
      ...(inventory.tools ?? []).map((t) => ({ type: t.type, count: 1 })),
    ];

    if (allItems.length === 0) return 'empty';

    const counts = new Map<string, number>();
    for (const item of allItems) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + item.count);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted
      .slice(0, 8)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');
    const remaining = sorted.length - 8;
    return remaining > 0 ? `${top} (+${remaining} more)` : top;
  }

  /**
   * Compact nearby block summary for prompt context.
   * Aggregates by block type, shows top 5 types by count.
   */
  private summarizeNearbyBlocks(blocks: Block[]): string {
    if (!blocks || blocks.length === 0) return 'none';

    const counts = new Map<string, number>();
    for (const block of blocks) {
      counts.set(block.type, (counts.get(block.type) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted
      .slice(0, 5)
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    const remaining = sorted.length - 5;
    return remaining > 0 ? `${top} (+${remaining} more types)` : top;
  }

  private initializeToolRegistry(): void {
    // Register the narrow, composable tools as specified
    const tools = [
      {
        name: 'find_blocks',
        description: 'Find blocks of specified type within radius',
      },
      {
        name: 'pathfind',
        description: 'Pathfind to destination with safety options',
      },
      { name: 'dig', description: 'Dig block at position with hostile guards' },
      {
        name: 'place',
        description: 'Place item at position or adjacent to block',
      },
      { name: 'craft', description: 'Craft item using recipe and quantity' },
      { name: 'smelt', description: 'Smelt input using fuel and quantity' },
      { name: 'query_inventory', description: 'Query inventory with filter' },
      {
        name: 'waypoint',
        description: 'Set waypoint with name, position, and type',
      },
      { name: 'sense_hostiles', description: 'Sense hostiles within radius' },
      { name: 'chat', description: 'Send chat message on expressive channel' },
    ];

    tools.forEach((tool) => {
      this.toolRegistry.set(tool.name, {
        name: tool.name,
        description: tool.description,
        argsSchema: this.getToolArgsSchema(tool.name),
      });
    });
  }

  private getToolArgsSchema(toolName: string): any {
    // Define argument schemas for each tool
    const schemas: Record<string, any> = {
      find_blocks: z.object({
        type: z.string(),
        radius: z.number().min(1).max(100),
      }),
      pathfind: z.object({
        to: z.object({ x: z.number(), y: z.number(), z: z.number() }),
        safe: z.boolean().default(true),
        max_cost: z.number().optional(),
      }),
      dig: z.object({
        block_id: z.string().optional(),
        pos: z
          .object({ x: z.number(), y: z.number(), z: z.number() })
          .optional(),
        guard: z
          .object({
            abort_on_hostiles: z.number().optional(),
          })
          .optional(),
      }),
      place: z.object({
        item: z.string(),
        pos: z
          .object({ x: z.number(), y: z.number(), z: z.number() })
          .optional(),
        adjacent_to: z
          .object({ x: z.number(), y: z.number(), z: z.number() })
          .optional(),
      }),
      craft: z.object({
        recipe: z.string(),
        qty: z.number().min(1),
      }),
      smelt: z.object({
        input: z.string(),
        fuel: z.string(),
        qty: z.number().min(1),
      }),
      query_inventory: z.object({
        filter: z.string().optional(),
      }),
      waypoint: z.object({
        name: z.string(),
        pos: z.object({ x: z.number(), y: z.number(), z: z.number() }),
        type: z.string(),
      }),
      sense_hostiles: z.object({
        radius: z.number().min(1).max(50),
      }),
      chat: z.object({
        channel: z.string(),
        message: z.string(),
      }),
    };

    return schemas[toolName] || z.object({});
  }
}

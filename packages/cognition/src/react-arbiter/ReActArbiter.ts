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
        console.warn('[ReActArbiter] No tool selected, using fallback');
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
        console.warn(
          `[ReActArbiter] Unknown tool: ${step.selectedTool}, attempting fuzzy match`
        );

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
          console.warn(
            `[ReActArbiter] No match found for ${step.selectedTool}, falling back to chat`
          );
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
          nearbyBlocks: context.snapshot?.nearbyBlocks?.length || 0,
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
      console.error('[ReActArbiter] ReAct reasoning failed:', error);

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
      console.error('Reflection generation failed:', error);
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
    const prompt = `Generate specific, actionable steps for the following task:

TASK: ${task.title}
DESCRIPTION: ${task.description || 'No description provided'}
TYPE: ${task.type || 'general'}

Generate 3-6 specific steps that break down this task into actionable components. Each step should be:
- Specific and actionable
- In the order they should be performed
- Realistic for a Minecraft bot to execute

Format your response as a numbered list, like:
1. First step description
2. Second step description
3. Third step description
...etc.

Focus on the actual actions needed, not generic planning steps.`;

    try {
      const response = await this.llm.generateResponse(prompt, undefined, {
        temperature: 0.3,
        maxTokens: 300,
      });
      return response.text;
    } catch (error) {
      console.error('Task step generation failed:', error);
      throw error;
    }
  }

  /**
   * Call LLM with prompt and options
   */
  private async callLLM(prompt: string, options?: any): Promise<any> {
    try {
      const response = await this.llm.generateResponse(
        prompt,
        undefined,
        options
      );
      return response;
    } catch (error) {
      console.error('LLM call failed:', error);
      throw error;
    }
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
        console.warn(
          '[ReActArbiter] JSON parsing failed, trying fallback methods'
        );
      }
    }

    // Strategy 2: Line-by-line keyword matching (original approach)
    const lines = responseText.split('\n');
    let thoughts = '';
    let selectedTool = '';
    let args: Record<string, any> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.toLowerCase().includes('tool:') ||
        trimmed.toLowerCase().includes('action:')
      ) {
        selectedTool = trimmed.split(':')[1]?.trim() || '';
      } else if (
        trimmed.toLowerCase().includes('args:') ||
        trimmed.toLowerCase().includes('parameters:')
      ) {
        try {
          const argsText = trimmed.split(':')[1]?.trim() || '{}';
          args = JSON.parse(argsText);
        } catch (e) {
          console.warn(
            '[ReActArbiter] Failed to parse args from line:',
            trimmed
          );
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
- Inventory Items: ${context.inventory?.items?.length || 0} items
- Nearby Blocks: ${context.snapshot?.nearbyBlocks?.length || 0} blocks
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

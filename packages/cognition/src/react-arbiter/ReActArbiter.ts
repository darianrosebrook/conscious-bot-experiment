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

// ============================================================================
// Types
// ============================================================================

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
    const prompt = this.buildReActPrompt(context);

    try {
      const response = await this.callLLM(prompt, {
        temperature: 0.3, // Low temperature for operational decisions
        maxTokens: 500,
      });

      const step = this.parseReActResponse(response.text);

      // Validate that we have at most one tool call
      if (!step.selectedTool) {
        throw new Error('ReAct step must select exactly one tool');
      }

      // Validate tool exists in registry
      if (!this.toolRegistry.has(step.selectedTool)) {
        throw new Error(`Unknown tool: ${step.selectedTool}`);
      }

      return step;
    } catch (error) {
      console.error('ReAct reasoning failed:', error);
      throw error;
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

  private buildReActPrompt(context: ReActContext): string {
    const tools = Array.from(this.toolRegistry.values())
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    const reflexionHints = context.reflexionHints?.length
      ? `\nReflexion Hints:\n${context.reflexionHints.map((h) => `- ${h.lesson}`).join('\n')}`
      : '';

    const lastResult = context.lastToolResult
      ? `\nLast Tool Result: ${context.lastToolResult.ok ? 'SUCCESS' : 'FAILED'} - ${context.lastToolResult.error || JSON.stringify(context.lastToolResult.data)}`
      : '';

    return `You are a ReAct agent in Minecraft. You must reason step-by-step and choose exactly ONE tool to call.

Current State:
- Position: ${context.snapshot.position.x}, ${context.snapshot.position.y}, ${context.snapshot.position.z}
- Biome: ${context.snapshot.biome}
- Time: ${context.snapshot.time}
- Light: ${context.snapshot.light}
- Hazards: ${context.snapshot.hazards.join(', ')}
- Nearby entities: ${context.snapshot.nearbyEntities.length}
- Nearby blocks: ${context.snapshot.nearbyBlocks.length}
- Weather: ${context.snapshot.weather}

Inventory: ${context.inventory.items.map((i) => `${i.name}(${i.quantity})`).join(', ')}

Active Goals: ${context.goalStack.map((g) => `${g.type}: ${g.description}`).join(', ')}

Available Tools:
${tools}${reflexionHints}${lastResult}

Reason step-by-step about what to do next, then choose exactly one tool to call.

Response format:
THOUGHTS: [your reasoning]
TOOL: [tool_name]
ARGS: [JSON arguments]
GUARDRAILS: [optional safety considerations]
FOLLOWUP_GOAL: [optional next goal]`;
  }

  private buildReflectionPrompt(
    episodeTrace: any[],
    outcome: 'success' | 'failure',
    errors?: string[]
  ): string {
    const trace = episodeTrace.slice(-5); // Last 5 steps
    const errorInfo = errors?.length
      ? `\nErrors encountered: ${errors.join(', ')}`
      : '';

    return `You are reflecting on a Minecraft episode that ended with ${outcome.toUpperCase()}.

Episode trace (last 5 steps):
${trace.map((step, i) => `${i + 1}. ${step.action} -> ${step.result}`).join('\n')}${errorInfo}

Generate a reflection that includes:
1. What situation you were in
2. What went wrong (if failure) or what worked well (if success)
3. A specific lesson learned
4. Optional guardrails for future attempts

Response format:
SITUATION: [describe the context]
FAILURE: [what went wrong, if applicable]
LESSON: [specific actionable lesson]
GUARDRAIL: [optional safety rule]`;
  }

  private async callLLM(
    prompt: string,
    options: { temperature: number; maxTokens: number }
  ): Promise<{ text: string }> {
    try {
      const response = await this.llm.generateResponse(prompt, undefined, {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });

      return {
        text: response.text,
      };
    } catch (error) {
      console.error('LLM call failed:', error);

      // Fallback responses that parse correctly and don't contaminate consciousness testing
      if (prompt.includes('reflecting on a Minecraft episode')) {
        return {
          text: 'SITUATION: general_situation\nFAILURE: unknown_error\nLESSON: learned_something\nGUARDRAIL: {"pre":"safety_first"}',
        };
      } else {
        return {
          text: 'THOUGHTS: Processing situation...\nTOOL: query_inventory\nARGS: {"filter": "tools"}\nGUARDRAILS: Stay alert\nFOLLOWUP_GOAL: Continue current objective',
        };
      }
    }
  }

  private parseReActResponse(response: string): ReActStep {
    const lines = response.split('\n');
    const step: ReActStep = {
      thoughts: '',
      selectedTool: '',
      args: {},
    };

    for (const line of lines) {
      if (line.startsWith('THOUGHTS:')) {
        step.thoughts = line.replace('THOUGHTS:', '').trim();
      } else if (line.startsWith('TOOL:')) {
        step.selectedTool = line.replace('TOOL:', '').trim();
      } else if (line.startsWith('ARGS:')) {
        try {
          step.args = JSON.parse(line.replace('ARGS:', '').trim());
        } catch (e) {
          console.warn('Failed to parse tool args:', e);
        }
      } else if (line.startsWith('GUARDRAILS:')) {
        step.guardrails = [line.replace('GUARDRAILS:', '').trim()];
      } else if (line.startsWith('FOLLOWUP_GOAL:')) {
        step.followupGoal = line.replace('FOLLOWUP_GOAL:', '').trim();
      }
    }

    return step;
  }

  private parseReflectionResponse(response: string): ReflexionHint {
    const lines = response.split('\n');
    const hint: ReflexionHint = {
      situation: '',
      lesson: '',
    };

    for (const line of lines) {
      if (line.startsWith('SITUATION:')) {
        hint.situation = line.replace('SITUATION:', '').trim();
      } else if (line.startsWith('FAILURE:')) {
        hint.failure = line.replace('FAILURE:', '').trim();
      } else if (line.startsWith('LESSON:')) {
        hint.lesson = line.replace('LESSON:', '').trim();
      } else if (line.startsWith('GUARDRAIL:')) {
        try {
          hint.guardrail = JSON.parse(line.replace('GUARDRAIL:', '').trim());
        } catch (e) {
          console.warn('Failed to parse guardrail:', e);
        }
      }
    }

    // Ensure we have at least situation and lesson
    if (!hint.situation) {
      hint.situation = 'general_situation';
    }
    if (!hint.lesson) {
      hint.lesson = 'learned_something';
    }

    return hint;
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
}

interface ToolDefinition {
  name: string;
  description: string;
  argsSchema: any;
}

interface Entity {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  hostile: boolean;
}

interface Block {
  type: string;
  position: { x: number; y: number; z: number };
  hardness: number;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  durability?: number;
}

interface ArmorItem {
  slot: string;
  item: InventoryItem;
}

interface ToolItem {
  type: string;
  item: InventoryItem;
}

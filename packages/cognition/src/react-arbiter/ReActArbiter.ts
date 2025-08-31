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

  /**
   * Generate task steps using LLM directly
   * This is used for task decomposition outside of the ReAct loop
   */
  async generateTaskSteps(task: any): Promise<string> {
    const prompt = `You are a Minecraft bot planning system. Generate specific, actionable steps for the following task:

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

    return `You are a Minecraft bot reflecting on a completed episode.

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
   */
  private parseReActResponse(responseText: string): ReActStep {
    // Simple parsing - in a real implementation, this would be more sophisticated
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
          console.warn('Failed to parse args:', e);
        }
      } else if (trimmed && !selectedTool) {
        thoughts += trimmed + ' ';
      }
    }

    return {
      thoughts: thoughts.trim(),
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
   * Build ReAct prompt for reasoning
   */
  private buildReActPrompt(context: ReActContext): string {
    const tools = Array.from(this.toolRegistry.values())
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    const reflexionHints = context.reflexionHints?.length
      ? `\nReflexion Hints:\n${context.reflexionHints.map((h) => `- ${h.lesson}`).join('\n')}`
      : '';

    return `You are a Minecraft bot using ReAct reasoning to accomplish tasks.

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
4. Execute the tool with proper parameters

Let's start by analyzing the current situation and determining the next action.`;
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

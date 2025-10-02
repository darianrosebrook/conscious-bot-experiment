import { EnhancedEnvironmentIntegration } from '../environment-integration';
import { Goal, GoalStatus, GoalType } from '../types';
import { auditLogger } from '../../cognition/src/audit/thought-action-audit-logger';

import type { PlanningContext } from '../integrated-planning-coordinator';

export interface TaskBootstrapperConfig {
  memoryEndpoint?: string;
  llmEndpoint?: string | null;
  llmModel?: string;
  fetchImpl?: typeof fetch;
  memoryTimeoutMs?: number;
  llmTimeoutMs?: number;
  maxMemoryTasks?: number;
  maxLlmTasks?: number;
  explorationTaskCount?: number;
  environmentProvider?: EnvironmentProvider;
}

export interface BootstrapResult {
  goals: Goal[];
  source: 'memory' | 'llm' | 'exploration' | 'none';
  diagnostics: {
    latencyMs: number;
    memoryConsidered: number;
    llmConsidered: number;
    errors: string[];
  };
}

interface EnvironmentProvider {
  getEnvironmentData(): Promise<any>;
  getInventoryData(): Promise<any>;
}

interface MemoryAction {
  id: string;
  type?: string;
  description?: string;
  status?: string;
  priority?: number;
  urgency?: number;
  timestamp?: number;
  [key: string]: unknown;
}

interface LlmTaskSuggestion {
  id?: string;
  goalType?: string;
  type?: string;
  description?: string;
  priority?: number;
  urgency?: number;
  reasoning?: string;
  metadata?: Record<string, unknown>;
}

interface ContextSnapshot {
  locationLabel: string;
  inventory: Array<{ name: string; count: number }>;
  environmentSummary: string;
  threats: string[];
  opportunities: string[];
}

export class TaskBootstrapper {
  private readonly memoryEndpoint: string;
  private readonly llmEndpoint: string | null;
  private readonly llmModel: string;
  private readonly fetchImpl: typeof fetch;
  private readonly memoryTimeoutMs: number;
  private readonly llmTimeoutMs: number;
  private readonly maxMemoryTasks: number;
  private readonly maxLlmTasks: number;
  private readonly explorationTaskCount: number;
  private readonly environment: EnvironmentProvider | null;

  private llmFailureCount = 0;
  private llmCircuitOpenUntil = 0;

  constructor(config: TaskBootstrapperConfig = {}) {
    this.memoryEndpoint = (
      config.memoryEndpoint ||
      process.env.MEMORY_ENDPOINT ||
      'http://localhost:3001'
    ).replace(/\/$/, '');
    const endpoint = config.llmEndpoint ?? process.env.LLM_ENDPOINT ?? '';
    this.llmEndpoint = endpoint ? endpoint.replace(/\/$/, '') : null;
    this.llmModel = config.llmModel || process.env.LLM_MODEL || 'gpt-4';
    this.fetchImpl = config.fetchImpl || fetch;
    this.memoryTimeoutMs = config.memoryTimeoutMs ?? 1500;
    this.llmTimeoutMs = config.llmTimeoutMs ?? 4000;
    this.maxMemoryTasks = config.maxMemoryTasks ?? 3;
    this.maxLlmTasks = config.maxLlmTasks ?? 3;
    this.explorationTaskCount = config.explorationTaskCount ?? 2;

    this.environment =
      config.environmentProvider ||
      new EnhancedEnvironmentIntegration({ enableRealTimeUpdates: false });
  }

  async bootstrap(args: {
    context: PlanningContext;
    signals?: any[];
  }): Promise<BootstrapResult> {
    const start = Date.now();
    const errors: string[] = [];
    let memoryConsidered = 0;
    let llmConsidered = 0;

    try {
      const memoryResult = await this.recoverFromMemory();
      memoryConsidered = memoryResult.considered;
      if (memoryResult.goals.length > 0) {
        // Log action planning for audit trail
        memoryResult.goals.forEach((goal) => {
          auditLogger.log(
            'action_planned',
            {
              taskTitle: goal.title,
              taskType: goal.type,
              taskId: goal.id,
              priority: goal.priority,
              source: 'memory',
              goalCount: memoryResult.goals.length,
            },
            {
              success: true,
              duration: Date.now() - start,
            }
          );
        });

        return {
          goals: memoryResult.goals,
          source: 'memory',
          diagnostics: {
            latencyMs: Date.now() - start,
            memoryConsidered,
            llmConsidered: 0,
            errors,
          },
        };
      }
    } catch (error) {
      errors.push(`memory:${(error as Error).message}`);
    }

    try {
      const snapshot = await this.collectContextSnapshot(args.context);
      const llmResult = await this.synthesizeWithLlm(snapshot);
      llmConsidered = llmResult.considered;
      if (llmResult.goals.length > 0) {
        // Log action planning for audit trail
        llmResult.goals.forEach((goal) => {
          auditLogger.log(
            'action_planned',
            {
              taskTitle: goal.title,
              taskType: goal.type,
              taskId: goal.id,
              priority: goal.priority,
              source: 'llm',
              goalCount: llmResult.goals.length,
            },
            {
              success: true,
              duration: Date.now() - start,
            }
          );
        });

        return {
          goals: llmResult.goals,
          source: 'llm',
          diagnostics: {
            latencyMs: Date.now() - start,
            memoryConsidered,
            llmConsidered,
            errors,
          },
        };
      }
    } catch (error) {
      errors.push(`llm:${(error as Error).message}`);
    }

    try {
      const snapshot = await this.collectContextSnapshot(args.context);
      const fallbackGoals = this.buildExplorationFallback(snapshot);
      if (fallbackGoals.length > 0) {
        return {
          goals: fallbackGoals,
          source: 'exploration',
          diagnostics: {
            latencyMs: Date.now() - start,
            memoryConsidered,
            llmConsidered,
            errors,
          },
        };
      }
    } catch (error) {
      errors.push(`exploration:${(error as Error).message}`);
    }

    return {
      goals: [],
      source: 'none',
      diagnostics: {
        latencyMs: Date.now() - start,
        memoryConsidered,
        llmConsidered,
        errors,
      },
    };
  }

  private async recoverFromMemory(): Promise<{
    goals: Goal[];
    considered: number;
  }> {
    const url = `${this.memoryEndpoint}/state`;
    const response = await this.fetchWithTimeout(
      url,
      { method: 'GET' },
      this.memoryTimeoutMs
    );

    if (!response.ok) {
      throw new Error(`memory_status_${response.status}`);
    }

    const payload = (await response.json()) as any;
    const actions = Array.isArray(payload?.provenance?.recentActions)
      ? (payload.provenance.recentActions as MemoryAction[])
      : [];

    const unfinished = actions.filter((action) => {
      const status = String(action.status || '').toLowerCase();
      return status && !['completed', 'success', 'done'].includes(status);
    });

    const dedup = new Map<string, Goal>();
    for (const action of unfinished) {
      const goal = this.buildGoalFromMemoryAction(action);
      if (!goal) continue;
      if (!dedup.has(goal.id)) {
        dedup.set(goal.id, goal);
      }
      if (dedup.size >= this.maxMemoryTasks) {
        break;
      }
    }

    return { goals: Array.from(dedup.values()), considered: unfinished.length };
  }

  private buildGoalFromMemoryAction(action: MemoryAction): Goal | null {
    if (!action?.id) {
      return null;
    }

    const now = Date.now();
    const priority = this.clamp(
      typeof action.priority === 'number' ? action.priority : 0.7
    );
    const urgency = this.clamp(
      typeof action.urgency === 'number' ? action.urgency : 0.6
    );

    const goalType = this.mapStringToGoalType(
      action.type || action.description
    );
    const description =
      action.description ||
      `Resume task ${action.id} (${action.type || 'unspecified'})`;

    return {
      id: `memory-${action.id}`,
      type: goalType,
      priority,
      urgency,
      utility: this.clamp(priority + 0.1),
      description,
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      subGoals: [],
      metadata: {
        origin: 'memory',
        sourceId: action.id,
        actionType: action.type,
        status: action.status,
        reasoning:
          action.reasoning ||
          'Recovered from memory provenance as unfinished task',
      },
    };
  }

  private async collectContextSnapshot(
    context: PlanningContext
  ): Promise<ContextSnapshot> {
    const inventoryItems = await this.environment
      ?.getInventoryData()
      .catch(() => []);
    const environmentData = await this.environment
      ?.getEnvironmentData()
      .catch(() => null);

    const inventorySummary = Array.isArray(inventoryItems)
      ? inventoryItems.map((item: any) => ({
          name: item.name || item.type || 'unknown',
          count: Number(item.count || 1),
        }))
      : [];

    const locationLabel = this.deriveLocationLabel(context, environmentData);
    const { threats, opportunities } = this.deriveSituation(
      context,
      environmentData
    );

    const environmentSummary = JSON.stringify(
      {
        biome: environmentData?.biome,
        weather: environmentData?.weather,
        timeOfDay: environmentData?.timeOfDay,
        nearbyEntities: (environmentData?.nearbyEntities || [])
          .slice(0, 5)
          .map((entity: any) => ({
            type: entity.type,
            distance: entity.distance,
            hostile: entity.hostile,
          })),
        nearbyBlocks: (environmentData?.nearbyBlocks || [])
          .slice(0, 5)
          .map((block: any) => block.type),
      },
      null,
      0
    );

    return {
      locationLabel,
      inventory: inventorySummary,
      environmentSummary,
      threats,
      opportunities,
    };
  }

  private deriveLocationLabel(
    context: PlanningContext,
    environment: any
  ): string {
    if (environment?.biome) {
      return environment.biome;
    }
    if (context?.worldState?.locationName) {
      return String(context.worldState.locationName);
    }
    if (context?.worldState?.position) {
      const pos = context.worldState.position;
      if (typeof pos === 'object') {
        return `(${pos.x ?? '?'}, ${pos.y ?? '?'}, ${pos.z ?? '?'})`;
      }
    }
    return 'unknown';
  }

  private deriveSituation(
    context: PlanningContext,
    environment: any
  ): {
    threats: string[];
    opportunities: string[];
  } {
    const threats: string[] = [];
    const opportunities: string[] = [];

    if ((environment?.nearbyEntities || []).some((e: any) => e.hostile)) {
      threats.push('hostile_entities');
    }
    if ((environment?.weather || '').toLowerCase() === 'storm') {
      threats.push('storm_weather');
    }
    const curiosity = context?.currentState?.curiosity ?? 0;
    if (curiosity > 0.6) {
      opportunities.push('high_curiosity_state');
    }
    if (
      (environment?.nearbyBlocks || []).some((b: any) =>
        /ore|ruin/i.test(b.type)
      )
    ) {
      opportunities.push('valuable_blocks_detected');
    }
    if ((context?.availableResources || []).length === 0) {
      opportunities.push('restock_resources');
    }
    return { threats, opportunities };
  }

  private async synthesizeWithLlm(snapshot: ContextSnapshot): Promise<{
    goals: Goal[];
    considered: number;
  }> {
    if (!this.llmEndpoint) {
      return { goals: [], considered: 0 };
    }

    if (Date.now() < this.llmCircuitOpenUntil) {
      return { goals: [], considered: 0 };
    }

    const prompt = this.buildLlmPrompt(snapshot);
    const body = {
      model: this.llmModel,
      messages: [
        {
          role: 'system',
          content:
            'You are the planning cortex for an autonomous Minecraft agent. Return up to ' +
            `${this.maxLlmTasks} actionable task suggestions as JSON array. ` +
            'Each item MUST be an object with id, goalType, description, priority (0-1), urgency (0-1), reasoning. No prose.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    };

    const response = await this.fetchWithTimeout(
      this.llmEndpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      this.llmTimeoutMs
    );

    if (!response.ok) {
      this.recordLlmFailure();
      throw new Error(`llm_status_${response.status}`);
    }

    const payload = await response.json();
    const suggestions = this.parseLlmSuggestions(payload);
    if (suggestions.length === 0) {
      this.recordLlmSuccess();
      return { goals: [], considered: 0 };
    }

    const goals = suggestions
      .slice(0, this.maxLlmTasks)
      .map((suggestion) => this.buildGoalFromSuggestion(suggestion))
      .filter((goal): goal is Goal => goal !== null);

    this.recordLlmSuccess();
    return { goals, considered: suggestions.length };
  }

  private buildLlmPrompt(snapshot: ContextSnapshot): string {
    const inventory = snapshot.inventory
      .map((item) => `${item.name} x${item.count}`)
      .join(', ');
    const threats = snapshot.threats.join(', ') || 'none';
    const opportunities = snapshot.opportunities.join(', ') || 'none';

    return (
      `Location: ${snapshot.locationLabel}\n` +
      `Inventory: ${inventory || 'empty'}\n` +
      `Threats: ${threats}\n` +
      `Opportunities: ${opportunities}\n` +
      `Environment: ${snapshot.environmentSummary}`
    );
  }

  private parseLlmSuggestions(payload: any): LlmTaskSuggestion[] {
    if (!payload) return [];

    if (Array.isArray(payload)) {
      return payload as LlmTaskSuggestion[];
    }

    const content =
      payload?.choices?.[0]?.message?.content || payload?.message?.content;
    if (typeof content !== 'string') {
      return [];
    }

    const maybeJson = this.extractJsonArray(content);
    if (Array.isArray(maybeJson)) {
      return maybeJson as LlmTaskSuggestion[];
    }

    return [];
  }

  private extractJsonArray(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return [];

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]);
        } catch (error) {
          return [];
        }
      }

      const start = trimmed.indexOf('[');
      const end = trimmed.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch (error) {
          return [];
        }
      }
    }
    return [];
  }

  private buildGoalFromSuggestion(suggestion: LlmTaskSuggestion): Goal | null {
    if (!suggestion) return null;

    const now = Date.now();
    const description = suggestion.description || 'Investigate contextual task';
    const goalType = this.mapStringToGoalType(
      suggestion.goalType || suggestion.type || description
    );
    const priority = this.clamp(
      typeof suggestion.priority === 'number' ? suggestion.priority : 0.6
    );
    const urgency = this.clamp(
      typeof suggestion.urgency === 'number' ? suggestion.urgency : 0.5
    );

    const idSource =
      suggestion.id || description.replace(/\s+/g, '-').toLowerCase();

    return {
      id: `llm-${idSource}`,
      type: goalType,
      priority,
      urgency,
      utility: this.clamp(priority + 0.1),
      description,
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      subGoals: [],
      metadata: {
        origin: 'llm',
        reasoning:
          suggestion.reasoning ||
          'Generated from inventory/environment context',
        raw: suggestion,
      },
    };
  }

  private buildExplorationFallback(snapshot: ContextSnapshot): Goal[] {
    const now = Date.now();
    const tasks: Goal[] = [];

    if (this.explorationTaskCount <= 0) {
      return tasks;
    }

    const baseTask: Goal = {
      id: `exploration-survey-${now}`,
      type: GoalType.EXPLORATION,
      priority: 0.5,
      urgency: 0.4,
      utility: 0.55,
      description: `Survey surroundings near ${snapshot.locationLabel} and log notable resources`,
      preconditions: [],
      effects: [],
      status: GoalStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      subGoals: [],
      metadata: {
        origin: 'exploration',
        logging: true,
        instructions:
          'Capture observations into memory store for follow-up tasks',
      },
    };

    tasks.push(baseTask);

    if (this.explorationTaskCount > 1) {
      const secondary: Goal = {
        id: `exploration-resource-${now}`,
        type: snapshot.opportunities.includes('restock_resources')
          ? GoalType.RESOURCE_GATHERING
          : GoalType.CURIOSITY,
        priority: 0.45,
        urgency: 0.35,
        utility: 0.5,
        description: snapshot.opportunities.includes('restock_resources')
          ? 'Collect basic materials to replenish inventory'
          : 'Document points of interest for future plans',
        preconditions: [],
        effects: [],
        status: GoalStatus.PENDING,
        createdAt: now,
        updatedAt: now,
        subGoals: [],
        metadata: {
          origin: 'exploration',
          logging: true,
          instructions:
            'Store findings as episodic memories with resource tags',
        },
      };
      tasks.push(secondary);
    }

    return tasks.slice(0, this.explorationTaskCount);
  }

  private mapStringToGoalType(input?: string): GoalType {
    const text = (input || '').toLowerCase();
    if (/explore|scout|survey|map|discover/.test(text)) {
      return GoalType.EXPLORATION;
    }
    if (/gather|collect|mine|harvest|resource/.test(text)) {
      return GoalType.RESOURCE_GATHERING;
    }
    if (/build|construct|structure|shelter/.test(text)) {
      return GoalType.STRUCTURE_CONSTRUCTION;
    }
    if (/craft|forge|create|tool/.test(text)) {
      return GoalType.ACHIEVEMENT;
    }
    if (/combat|defend|threat|hostile/.test(text)) {
      return GoalType.SAFETY;
    }
    if (/organize|inventory|chest/.test(text)) {
      return GoalType.INVENTORY_ORGANIZATION;
    }
    if (/farm|plant|crop|agriculture/.test(text)) {
      return GoalType.AGRICULTURE_DEVELOPMENT;
    }
    return GoalType.CURIOSITY;
  }

  private clamp(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private recordLlmFailure(): void {
    this.llmFailureCount += 1;
    if (this.llmFailureCount >= 3) {
      this.llmCircuitOpenUntil = Date.now() + 60_000;
    }
  }

  private recordLlmSuccess(): void {
    this.llmFailureCount = 0;
    this.llmCircuitOpenUntil = 0;
  }
}

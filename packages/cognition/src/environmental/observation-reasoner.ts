import { LLMInterface, LLMResponse } from '../cognitive-core/llm-interface';
import { z } from 'zod';
import { auditLogger } from '../audit/thought-action-audit-logger';

const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const EntitySnapshotSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  displayName: z.string().optional(),
  kind: z.string().optional(),
  threatLevel: z.enum(['unknown', 'neutral', 'friendly', 'hostile']).optional(),
  distance: z.number().nonnegative().optional(),
  position: Vec3Schema.optional(),
  velocity: Vec3Schema.optional(),
});

const EventSnapshotSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  position: Vec3Schema.optional(),
  severity: z.string().optional(),
});

const ObservationPayloadSchema = z.object({
  observationId: z.string().optional(),
  category: z.enum(['entity', 'environment']),
  bot: z.object({
    position: Vec3Schema,
    health: z.number().nonnegative().optional(),
    food: z.number().nonnegative().optional(),
    dimension: z.string().optional(),
    gameMode: z.string().optional(),
  }),
  entity: EntitySnapshotSchema.optional(),
  event: EventSnapshotSchema.optional(),
  context: z.record(z.any()).optional(),
  timestamp: z.number().int().optional(),
});

const ObservationTaskSchema = z.object({
  description: z.string(),
  priority: z.number().min(0).max(1).default(0.5),
  urgency: z.number().min(0).max(1).default(0.5),
  source: z.enum(['llm', 'fallback']).default('llm'),
  metadata: z.record(z.any()).optional(),
});

const ObservationActionsSchema = z.object({
  shouldRespond: z.boolean(),
  response: z.string().min(1).optional(),
  shouldCreateTask: z.boolean(),
  tasks: z.array(ObservationTaskSchema).default([]),
});

const ObservationThoughtSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  categories: z.array(z.string()).optional(),
});

const ObservationInsightSchema = z.object({
  thought: ObservationThoughtSchema,
  actions: ObservationActionsSchema,
});

export type ObservationPayload = z.infer<typeof ObservationPayloadSchema>;
export type ObservationThought = z.infer<typeof ObservationThoughtSchema> & {
  source: 'llm' | 'fallback';
};
export type ObservationActions = z.infer<typeof ObservationActionsSchema>;
export type ObservationTask = z.infer<typeof ObservationTaskSchema>;

export interface ObservationInsight {
  observationId?: string;
  thought: ObservationThought;
  actions: ObservationActions;
  fallback: boolean;
  llmResponse?: LLMResponse | null;
  error?: string;
}

export interface ObservationReasonerOptions {
  disabled?: boolean;
  timeoutMs?: number;
  redactPrecision?: number;
}

interface SanitisedObservation {
  category: ObservationPayload['category'];
  observationId?: string;
  summary: string;
  details: any;
}

export class ObservationReasoner {
  private llm: LLMInterface;
  private disabled: boolean;
  private timeoutMs: number;
  private redactPrecision: number;

  constructor(llm: LLMInterface, options: ObservationReasonerOptions = {}) {
    this.llm = llm;
    this.disabled = options.disabled ?? false;
    this.timeoutMs = options.timeoutMs ?? 15000; // Increased timeout for better reliability
    this.redactPrecision = options.redactPrecision ?? 0.5;
  }

  async reason(payload: ObservationPayload): Promise<ObservationInsight> {
    const parsed = ObservationPayloadSchema.parse(payload);
    const observationId = parsed.observationId;

    console.log(
      `[ObservationReasoner] Processing observation: ${parsed.category} - ${observationId}`
    );

    if (
      this.disabled ||
      (typeof this.llm.isAvailable === 'function' && !this.llm.isAvailable())
    ) {
      console.log(
        `[ObservationReasoner] LLM disabled or unavailable, using fallback`
      );
      return this.createFallback(parsed, observationId, 'LLM disabled');
    }

    const sanitised = this.sanitiseObservation(parsed);
    const prompt = this.buildPrompt(sanitised);

    const startTime = Date.now();

    try {
      console.log(
        `[ObservationReasoner] Calling LLM with prompt: ${prompt.prompt.substring(0, 100)}...`
      );

      const llmResponse = await Promise.race<LLMResponse>([
        this.llm.generateResponse(prompt.prompt, undefined, {
          systemPrompt: prompt.system,
          temperature: 0.35,
          maxTokens: 512,
        }),
        new Promise<LLMResponse>((_, reject) =>
          setTimeout(
            () => reject(new Error('LLM observation reasoning timed out')),
            this.timeoutMs
          )
        ),
      ]);

      console.log(
        `[ObservationReasoner] LLM response received: ${llmResponse.text.substring(0, 100)}...`
      );

      const insight = this.parseLLMResponse(llmResponse.text);

      console.log(
        `[ObservationReasoner] Successfully parsed LLM response: ${insight.thought.text}`
      );

      // Log feedback received for audit trail
      auditLogger.log(
        'feedback_received',
        {
          observationId,
          feedbackType: 'environmental',
          feedbackContent: insight.thought.text,
          confidence: insight.thought.confidence ?? llmResponse.confidence,
          shouldRespond: insight.actions.shouldRespond,
          shouldCreateTask: insight.actions.shouldCreateTask,
          taskCount: insight.actions.tasks?.length || 0,
        },
        {
          success: true,
          duration: Date.now() - startTime,
        }
      );

      return {
        observationId,
        thought: {
          text: insight.thought.text,
          confidence: insight.thought.confidence ?? llmResponse.confidence,
          categories: insight.thought.categories ?? [],
          source: 'llm',
        },
        actions: {
          shouldRespond: insight.actions.shouldRespond,
          shouldCreateTask: insight.actions.shouldCreateTask,
          response: insight.actions.response?.trim() || undefined,
          tasks:
            insight.actions.tasks?.map((task) => ({
              ...task,
              source: task.source ?? 'llm',
            })) || [],
        },
        fallback: false,
        llmResponse,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown observation error';
      console.log(
        `[ObservationReasoner] LLM failed (${reason}), using fallback`
      );

      // Log the fallback response for debugging
      const fallbackThought = this.buildFallbackThought(parsed);
      console.log(
        `[ObservationReasoner] Fallback response: ${fallbackThought}`
      );

      return this.createFallback(parsed, observationId, reason);
    }
  }

  private parseLLMResponse(raw: string) {
    console.log(
      `[ObservationReasoner] Parsing LLM response: ${raw.substring(0, 200)}...`
    );

    let parsedJson: unknown;

    try {
      // First try to parse the entire response as JSON
      parsedJson = JSON.parse(raw.trim());
    } catch (error1) {
      try {
        // If that fails, try to extract JSON from within the response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in LLM response');
        }
        parsedJson = JSON.parse(jsonMatch[0]);
      } catch (error2) {
        console.error(
          `[ObservationReasoner] Failed to parse LLM response:`,
          raw
        );
        throw new Error(
          `LLM response parsing failed: ${error2 instanceof Error ? error2.message : 'unknown'}`
        );
      }
    }

    return ObservationInsightSchema.parse(parsedJson);
  }

  private createFallback(
    payload: ObservationPayload,
    observationId: string | undefined,
    reason: string
  ): ObservationInsight {
    const text = this.buildFallbackThought(payload);
    return {
      observationId,
      thought: {
        text,
        confidence: 0.35,
        categories: ['fallback'],
        source: 'fallback',
      },
      actions: {
        shouldRespond: false,
        shouldCreateTask: false,
        response: undefined,
        tasks: [],
      },
      fallback: true,
      llmResponse: null,
      error: reason,
    };
  }

  private buildFallbackThought(payload: ObservationPayload): string {
    if (payload.category === 'entity' && payload.entity) {
      const name = payload.entity.displayName || payload.entity.name;
      const distance =
        payload.entity.distance !== undefined
          ? `${payload.entity.distance.toFixed(1)} blocks`
          : 'nearby';
      const threat = payload.entity.threatLevel || 'unknown';
      return `I notice ${name} ${distance} away (threat: ${threat}). Staying alert.`;
    }

    if (payload.category === 'environment' && payload.event) {
      const descriptor = payload.event.description || payload.event.type;
      return `Environmental change detected: ${descriptor}. Monitoring situation.`;
    }

    return 'I remain aware of my surroundings and continue monitoring.';
  }

  private sanitiseObservation(
    payload: ObservationPayload
  ): SanitisedObservation {
    const round = (value: number | undefined) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      const precision = this.redactPrecision;
      return Math.round(value / precision) * precision;
    };

    const sanitiseVec3 = (vec?: { x: number; y: number; z: number }) =>
      vec
        ? {
            x: round(vec.x),
            y: round(vec.y),
            z: round(vec.z),
          }
        : undefined;

    const details: Record<string, any> = {
      bot: {
        health: payload.bot.health,
        food: payload.bot.food,
        dimension: payload.bot.dimension,
      },
      timestamp: payload.timestamp,
    };

    if (payload.entity) {
      details.entity = {
        name: payload.entity.name,
        displayName: payload.entity.displayName,
        threatLevel: payload.entity.threatLevel,
        distance: payload.entity.distance,
      };
    }

    if (payload.event) {
      details.event = {
        type: payload.event.type,
        description: payload.event.description,
        severity: payload.event.severity,
      };
    }

    const summaryParts: string[] = [];
    if (payload.category === 'entity' && payload.entity) {
      summaryParts.push(
        `Entity ${payload.entity.displayName || payload.entity.name} at distance ${
          payload.entity.distance !== undefined
            ? `${payload.entity.distance.toFixed(1)} blocks`
            : 'unknown'
        }`
      );
    }
    if (payload.category === 'environment' && payload.event) {
      summaryParts.push(
        `Event ${payload.event.type}: ${payload.event.description ?? 'no description'}`
      );
    }

    return {
      category: payload.category,
      observationId: payload.observationId,
      summary: summaryParts.join(' | ') || 'General environmental awareness',
      details: {
        ...details,
        botPosition: sanitiseVec3(payload.bot.position),
        entityPosition: sanitiseVec3(payload.entity?.position),
        eventPosition: sanitiseVec3(payload.event?.position),
      },
    };
  }

  private buildPrompt(sanitised: SanitisedObservation) {
    const system = `You are the cognition module for a Minecraft agent. Analyse observations and respond with a strict JSON object.

The JSON MUST match this exact format:
{
  "thought": {
    "text": "Your first-person observation (be concise, max 120 chars)",
    "confidence": 0.8,
    "categories": ["environmental", "entity", "social"]
  },
  "actions": {
    "shouldRespond": false,
    "shouldCreateTask": false,
    "response": null,
    "tasks": []
  }
}

Example responses:
- For rabbits nearby: {"thought": {"text": "I notice rabbits nearby", "confidence": 0.7, "categories": ["environmental"]}, "actions": {"shouldRespond": false, "shouldCreateTask": false}}
- For dangerous mobs: {"thought": {"text": "Hostile mob detected", "confidence": 0.9, "categories": ["threat"]}, "actions": {"shouldRespond": false, "shouldCreateTask": true, "tasks": [{"description": "Monitor hostile mob"}]}}
- For interesting events: {"thought": {"text": "Environmental change observed", "confidence": 0.6, "categories": ["environmental"]}, "actions": {"shouldRespond": false, "shouldCreateTask": false}}

Rules:
- Always respond with valid JSON
- Use first-person perspective for thoughts
- Keep thoughts concise (<= 120 characters)
- Only set shouldRespond=true for social interactions
- Only create tasks when concrete action is needed
- Do not include any text outside the JSON`;

    const prompt = `Observation: ${sanitised.summary}
Details: ${JSON.stringify(sanitised.details, null, 2)}

Generate your JSON response:`;

    return { system, prompt };
  }
}

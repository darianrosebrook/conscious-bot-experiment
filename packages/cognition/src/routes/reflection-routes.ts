/**
 * Reflection generation routes.
 *
 * Implements the contract defined in reflection-generation-contract.ts.
 * Generates LLM-powered reflections for death-respawn and sleep-wake events.
 * Feature-gated via ENABLE_REFLECTION_GENERATION (default: enabled).
 *
 * @author @darianrosebrook
 */

import { Router } from 'express';
import type { LLMInterface } from '../cognitive-core/llm-interface';
import { getLLMConfig } from '../config/llm-token-config';
import type {
  ReflectionGenerationRequest,
  ReflectionGenerationResponse,
} from './reflection-generation-contract';
import { REFLECTION_PROMPT_TEMPLATE } from './reflection-generation-contract';

// ============================================================================
// Dependencies
// ============================================================================

export interface ReflectionRouteDeps {
  llmInterface: LLMInterface;
}

// ============================================================================
// Output parsing
// ============================================================================

interface ParsedReflection {
  reflection: string;
  insights: string[];
  lessons: string[];
  mood: number;
}

/**
 * Parse structured LLM output into reflection fields.
 *
 * Expected format:
 *   REFLECTION: <text>
 *   INSIGHTS: <comma-separated list, or "none">
 *   LESSONS: <comma-separated list, or "none">
 *   MOOD: <number from -1.0 to 1.0>
 *
 * If parsing fails, the entire raw text becomes the reflection
 * with empty insights/lessons and neutral mood.
 */
export function parseReflectionOutput(raw: string): ParsedReflection {
  const reflectionMatch = raw.match(/REFLECTION:\s*(.+?)(?=\n(?:INSIGHTS|LESSONS|MOOD):|$)/s);
  const insightsMatch = raw.match(/INSIGHTS:\s*(.+?)(?=\n(?:LESSONS|MOOD):|$)/s);
  const lessonsMatch = raw.match(/LESSONS:\s*(.+?)(?=\n(?:MOOD):|$)/s);
  const moodMatch = raw.match(/MOOD:\s*([-\d.]+)/);

  const reflection = reflectionMatch?.[1]?.trim() || raw.trim();

  const parseList = (match: RegExpMatchArray | null): string[] => {
    const text = match?.[1]?.trim();
    if (!text || text.toLowerCase() === 'none') return [];
    return text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const insights = parseList(insightsMatch);
  const lessons = parseList(lessonsMatch);

  let mood = 0;
  if (moodMatch?.[1]) {
    const parsed = parseFloat(moodMatch[1]);
    if (!isNaN(parsed)) mood = Math.max(-1, Math.min(1, parsed));
  }

  return { reflection, insights, lessons, mood };
}

// ============================================================================
// Placeholder factory
// ============================================================================

function createPlaceholderResponse(
  request: ReflectionGenerationRequest
): ReflectionGenerationResponse {
  const isDeathTrigger = request.trigger === 'death-respawn';

  // Improved static fallback that includes available context
  const locationStr = request.context.location
    ? `at (${Math.floor(request.context.location.x)}, ${Math.floor(request.context.location.y)}, ${Math.floor(request.context.location.z)})`
    : '';

  const content = isDeathTrigger
    ? `Died${request.context.deathCause ? ` from ${request.context.deathCause}` : ''} ${locationStr}. Need to review what went wrong and be more careful.`.trim()
    : `Completed day ${request.context.gameDay ?? '?'}. Consolidating recent experiences and assessing goal progress.`;

  return {
    generated: false,
    type: isDeathTrigger ? 'failure' : 'narrative',
    content,
    isPlaceholder: true,
    insights: [],
    lessons: isDeathTrigger ? ['Review what caused the death'] : [],
    emotionalValence: 0,
    confidence: 0.5,
    provenance: {
      model: 'placeholder',
      tokensUsed: 0,
      latencyMs: 0,
      schemaVersion: 1,
    },
    dedupeKey: request.dedupeKey,
  };
}

// ============================================================================
// Route
// ============================================================================

const REFLECTION_TIMEOUT_MS = 10_000;

export function createReflectionRoutes(deps: ReflectionRouteDeps): Router {
  const router = Router();

  router.post('/generate-reflection', async (req, res) => {
    const enabled =
      process.env.ENABLE_REFLECTION_GENERATION !== 'false'; // default: enabled

    const request: ReflectionGenerationRequest = req.body;

    if (!request?.trigger || !request?.dedupeKey) {
      return res.status(400).json({
        error: 'Missing required fields: trigger, dedupeKey',
      });
    }

    if (!enabled) {
      return res.json(createPlaceholderResponse(request));
    }

    const startTime = Date.now();

    try {
      // Select prompt template by trigger type
      const template =
        request.trigger === 'sleep-wake'
          ? REFLECTION_PROMPT_TEMPLATE.sleepWake
          : REFLECTION_PROMPT_TEMPLATE.deathRespawn;

      const userPrompt = template.userTemplate(
        request.context,
        request.recentMemories ?? []
      );

      const tokenConfig = getLLMConfig('react_reflection');

      // Call LLM with timeout — never block the caller
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REFLECTION_TIMEOUT_MS
      );

      let llmResponse;
      try {
        llmResponse = await deps.llmInterface.generateResponse(
          userPrompt,
          undefined, // no LLMContext needed
          {
            systemPrompt: template.system,
            temperature: tokenConfig.temperature,
            maxTokens: tokenConfig.maxTokens,
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(timeout);
      }

      const parsed = parseReflectionOutput(llmResponse.text);

      const response: ReflectionGenerationResponse = {
        generated: true,
        type: request.trigger === 'sleep-wake' ? 'narrative' : 'failure',
        content: parsed.reflection,
        isPlaceholder: false,
        insights: parsed.insights,
        lessons: parsed.lessons,
        emotionalValence: parsed.mood,
        confidence: llmResponse.confidence ?? 0.7,
        provenance: {
          model: llmResponse.model || 'unknown',
          tokensUsed: llmResponse.tokensUsed || 0,
          latencyMs: Date.now() - startTime,
          schemaVersion: 1,
        },
        dedupeKey: request.dedupeKey,
      };

      res.json(response);
    } catch (error) {
      // LLM timeout, unavailable, or parse error — fall back to placeholder
      console.log(
        `[reflection-routes] LLM generation failed (${Date.now() - startTime}ms):`,
        error instanceof Error ? error.message : String(error)
      );
      res.json(createPlaceholderResponse(request));
    }
  });

  return router;
}

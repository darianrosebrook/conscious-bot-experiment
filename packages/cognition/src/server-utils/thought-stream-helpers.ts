/**
 * Thought stream helpers: sending thoughts to the cognitive stream and
 * running the intrusion consideration step.
 */

import { resilientFetch, TTSClient } from '@conscious-bot/core';
import { LLMInterface } from '../cognitive-core/llm-interface';
import { GOAL_TAG_STRIP, TTS_EXCLUDED_TYPES, TTS_STATUS_LIKE } from './constants';
import { getInteroState } from '../interoception-store';
import { buildStressContext } from '../stress-axis-computer';
import { broadcastThought } from '../routes/cognitive-stream-routes';
import { createServerLogger } from './server-logger';
import { isUsableForTTS } from './tts-usable-content';

export interface ThoughtStreamDeps {
  dashboardUrl: string;
  ttsClient: TTSClient;
  llmInterface: LLMInterface;
}

const thoughtStreamLogger = createServerLogger({ subsystem: 'thought-stream' });

export function createThoughtStreamHelpers(deps: ThoughtStreamDeps) {
  async function sendThoughtToCognitiveStream(thought: any) {
    try {
      const response = await resilientFetch(
        `${deps.dashboardUrl}/api/ws/cognitive-stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          silent: true,
          body: JSON.stringify({
            payloadVersion: 2,
            type: thought.type || 'reflection',
            content: thought.content, // raw sanitized text (may contain failed tags)
            displayContent: (thought.content || '') // UI-safe version: strip any residual tags
              .replace(GOAL_TAG_STRIP, '')
              .trim(),
            extractedGoal: thought.metadata?.extractedGoal || null, // structured goal for routing
            sanitizationFlags: thought.metadata?.sanitizationFlags || null,
            attribution: 'self',
            context: {
              emotionalState: thought.context?.emotionalState || 'neutral',
              confidence: thought.context?.confidence || 0.5,
              cognitiveSystem: thought.context?.cognitiveSystem || 'generator',
            },
            metadata: {
              thoughtType: thought.metadata?.thoughtType || thought.type,
              ...thought.metadata,
            },
          }),
        }
      );

      // Broadcast to all connected SSE clients
      const displayContent = (thought.content || '')
        .replace(GOAL_TAG_STRIP, '')
        .trim();
      broadcastThought({
        id: thought.id || `thought-${Date.now()}`,
        type: thought.type || 'reflection',
        content: thought.content,
        displayContent,
        attribution: 'self',
        timestamp: thought.timestamp || Date.now(),
        metadata: thought.metadata,
      });

      if (response?.ok) {
        thoughtStreamLogger.info('Thought sent to cognitive stream', {
          event: 'thought_stream_send_ok',
          tags: ['thought', 'stream', 'send'],
          fields: { preview: thought.content?.substring(0, 50) ?? '' },
        });

        // Speak only genuine thoughts via TTS; exclude status/system/environmental
        const thoughtType =
          thought.type ?? thought.metadata?.thoughtType ?? 'reflection';
        const displayText = (thought.content || '')
          .replace(GOAL_TAG_STRIP, '')
          .trim();
        const isExcludedType = TTS_EXCLUDED_TYPES.has(String(thoughtType));
        const looksLikeStatus = TTS_STATUS_LIKE.test(displayText);
        if (
          deps.ttsClient.isEnabled &&
          !isExcludedType &&
          !looksLikeStatus &&
          isUsableForTTS(displayText)
        ) {
          deps.ttsClient.speak(displayText);
        }
      } else {
        thoughtStreamLogger.error('Failed to send thought to cognitive stream', {
          event: 'thought_stream_send_failed',
          tags: ['thought', 'stream', 'error'],
        });
      }
    } catch (error) {
      thoughtStreamLogger.error('Error sending thought to cognitive stream', {
        event: 'thought_stream_send_error',
        tags: ['thought', 'stream', 'error'],
        fields: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /** Consideration step: ask bot to accept or resist thought; bias default accept. */
  async function runConsiderationStep(
    content: string,
    llm: LLMInterface
  ): Promise<'accept' | 'resist'> {
    const stressCtx = buildStressContext(getInteroState().stressAxes);
    const contextLine = stressCtx ? `\nCurrent situation: ${stressCtx}` : '';
    const prompt = `You had the thought: ${content.slice(0, 500)}.${contextLine} Do you want to act on it (accept) or dismiss it (resist)? Reply with only one word: accept or resist. If unsure, reply accept.`;
    try {
      const response = await llm.generateResponse(prompt, undefined, {
        maxTokens: 32,
        temperature: 0.3,
      });
      const text = (
        response?.text ??
        (response as { content?: string })?.content ??
        ''
      )
        .trim()
        .toLowerCase();
      if (/resist/.test(text) && !/accept/.test(text)) return 'resist';
      if (/resist/.test(text) && /accept/.test(text)) {
        const resistPos = text.indexOf('resist');
        const acceptPos = text.indexOf('accept');
        return resistPos < acceptPos ? 'resist' : 'accept';
      }
      return 'accept';
    } catch {
      return 'accept';
    }
  }

  return { sendThoughtToCognitiveStream, runConsiderationStep };
}

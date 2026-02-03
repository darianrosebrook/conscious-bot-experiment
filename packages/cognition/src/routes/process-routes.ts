/**
 * Process routes: the mega POST /process route handling intrusion,
 * environmental_awareness, social_interaction, environmental_event,
 * and external_chat.
 */

import { Router } from 'express';
import { resilientFetch } from '@conscious-bot/core';
import { LLMInterface } from '../cognitive-core/llm-interface';
import {
  ObservationReasoner,
  ObservationPayload,
  ObservationInsight,
} from '../environmental/observation-reasoner';
import {
  applySaliencyEnvelope,
  type BeliefStreamEnvelope,
} from '../environmental/saliency-reasoner';
import { IntrusiveThoughtProcessor } from '../intrusive-thought-processor';
import { ReActArbiter } from '../react-arbiter/ReActArbiter';
import type { EnhancedThoughtGenerator } from '../thought-generator';
import type { CognitionMutableState } from '../cognition-state';
import { GOAL_TAG_STRIP } from '../server-utils/constants';
import {
  buildObservationPayload,
  redactPositionForLog,
} from '../server-utils/observation-helpers';
import {
  updateBotStateCache,
  patchBotStateCache,
  getBotStateCache,
  botStateCacheAgeMs,
  STALE_THRESHOLD_MS,
  isCompletePosition,
} from '../bot-state-cache';
import { logStressAtBoundary } from '../stress-boundary-logger';
import { updateStressFromIntrusion } from '../interoception-store';

export interface ProcessRouteDeps {
  state: CognitionMutableState;
  intrusiveThoughtProcessor: IntrusiveThoughtProcessor;
  llmInterface: LLMInterface;
  observationReasoner: ObservationReasoner;
  saliencyState: any;
  enhancedThoughtGenerator: EnhancedThoughtGenerator;
  reactArbiter: ReActArbiter;
  sendThoughtToCognitiveStream: (thought: any) => Promise<void>;
  runConsiderationStep: (content: string, llm: LLMInterface) => Promise<'accept' | 'resist'>;
  enqueueObservation: (obs: ObservationPayload) => Promise<ObservationInsight>;
  logObservation: (message: string, payload?: unknown) => void;
}

export function createProcessRoutes(deps: ProcessRouteDeps): Router {
  const router = Router();

  // Process cognitive task
  router.post('/process', async (req, res) => {
    try {
      const { type, content, metadata } = req.body;

      deps.logObservation(`Processing ${type} request`, { content, metadata });

      if (type === 'intrusion') {
        const considerationEnabled =
          process.env.ENABLE_CONSIDERATION_STEP === 'true';
        if (considerationEnabled) {
          const decision = await deps.runConsiderationStep(content, deps.llmInterface);
          if (decision === 'resist') {
            logStressAtBoundary('intrusion_resist', {
              thoughtSummary: 'Dismissed',
            });
            res.json({
              processed: false,
              type: 'intrusion',
              response: 'Dismissed',
              thought: null,
              timestamp: Date.now(),
              recorded: true,
            });
            return;
          }
        }

        // Use enhanced intrusive thought processor to generate internal thought
        const result =
          await deps.intrusiveThoughtProcessor.processIntrusiveThought(content);

        updateStressFromIntrusion({
          accepted: result.accepted,
          task: result.task,
        });

        logStressAtBoundary(
          result.accepted ? 'intrusion_accept' : 'intrusion_resist',
          {
            thoughtSummary: result.response?.slice(0, 200),
          }
        );
        if (result.accepted && result.task) {
          logStressAtBoundary('task_selected', {
            actionSummary: result.task.title?.slice(0, 200),
          });
        }

        // Send the generated internal thought to the cognitive stream with self attribution
        if (result.thought) {
          try {
            const cognitiveStreamUrl = process.env.DASHBOARD_ENDPOINT
              ? `${process.env.DASHBOARD_ENDPOINT}/api/ws/cognitive-stream`
              : 'http://localhost:3000/api/ws/cognitive-stream';
            const cognitiveStreamResponse = await resilientFetch(
              cognitiveStreamUrl,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  payloadVersion: 2,
                  type: result.thought.type || 'reflection',
                  content: result.thought.content,
                  displayContent: (result.thought.content || '')
                    .replace(GOAL_TAG_STRIP, '')
                    .trim(),
                  extractedGoal: result.thought.metadata?.extractedGoal || null,
                  sanitizationFlags:
                    result.thought.metadata?.sanitizationFlags || null,
                  attribution: 'self',
                  context: result.thought.context,
                  metadata: {
                    ...result.thought.metadata,
                    thoughtType: 'intrusive',
                    provenance: 'intrusion',
                  },
                  id: result.thought.id,
                  timestamp: result.thought.timestamp,
                  processed: true,
                }),
              }
            );

            if (cognitiveStreamResponse?.ok) {
              console.log(
                '[Cognition] Intrusive thought processed and sent to cognitive stream'
              );
            } else if (cognitiveStreamResponse) {
              const errBody = await cognitiveStreamResponse.text();
              console.error(
                '[Cognition] Failed to send intrusive thought to cognitive stream:',
                cognitiveStreamResponse.status,
                errBody
              );
            }
          } catch (error) {
            console.error(
              '[Cognition] Error sending intrusive thought to cognitive stream:',
              error
            );
          }
        }

        res.json({
          processed: result.accepted,
          type: 'intrusion',
          response: result.response,
          thought: result.thought,
          timestamp: Date.now(),
        });
      } else if (type === 'environmental_awareness') {
        // Route belief-stream envelopes to saliency reasoner (no per-entity LLM call)
        if (req.body?.request_version === 'saliency_delta') {
          try {
            const envelope = req.body as BeliefStreamEnvelope;
            const insight = applySaliencyEnvelope(envelope, deps.saliencyState);

            if (!insight.processed) {
              res.json({
                processed: false,
                type: 'environmental_awareness',
                reason: 'out_of_order',
                timestamp: Date.now(),
              });
              return;
            }

            // Stream non-empty awareness to dashboard
            if (insight.thought.text !== 'No significant entities nearby.') {
              const dashboardUrl =
                process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
              const internalThought = {
                type: 'environmental',
                content: insight.thought.text,
                attribution: 'self',
                context: {
                  emotionalState: insight.actions.shouldRespond
                    ? 'alert'
                    : 'aware',
                  confidence: insight.thought.confidence,
                  cognitiveSystem: 'saliency-reasoner',
                },
                metadata: {
                  thoughtType: 'environmental',
                  source: 'saliency',
                  trackCount: insight.trackCount,
                  deltaCount: insight.deltaCount,
                },
                id: `thought-${Date.now()}-sal-${envelope.seq}`,
                timestamp: Date.now(),
                processed: true,
              };

              await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(internalThought),
                label: 'dashboard/cognitive-stream-saliency',
              });
            }

            res.json({
              processed: true,
              type: 'environmental_awareness',
              thought: insight.thought,
              actions: insight.actions,
              fallback: false,
              shouldRespond: insight.actions.shouldRespond,
              response: insight.actions.response ?? '',
              shouldCreateTask: false,
              taskSuggestion: undefined,
              trackCount: insight.trackCount,
              deltaCount: insight.deltaCount,
              timestamp: Date.now(),
            });
            return;
          } catch (error) {
            console.error('[SaliencyReasoner] Error processing envelope:', error);
            res.json({
              processed: false,
              type: 'environmental_awareness',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: Date.now(),
            });
            return;
          }
        }

        // Legacy path: per-entity observation processing
        deps.logObservation('Processing environmental awareness', {
          content,
          metadata,
        });

        try {
          const rawObservation = req.body as any;
          const observation = buildObservationPayload(
            rawObservation,
            rawObservation?.metadata
          );

          if (observation) {
            console.log('cognition.observation.llm_request', {
              observationId: observation.observationId,
              category: observation.category,
            });

            const insight = await deps.enqueueObservation(observation);

            if (insight.fallback) {
              console.warn('cognition.observation.fallback', {
                observationId: observation.observationId,
                reason: insight.error,
              });
            }

            const sanitizedBotPosition = redactPositionForLog(
              observation.bot.position
            );
            const sanitizedEntityPosition = redactPositionForLog(
              observation.entity?.position
            );

            const internalThought = {
              type: 'environmental',
              content: insight.thought.text,
              attribution: 'self',
              context: {
                emotionalState: insight.fallback ? 'cautious' : 'curious',
                confidence: insight.thought.confidence ?? 0.75,
                cognitiveSystem:
                  insight.thought.source === 'llm'
                    ? 'environmental-llm'
                    : 'environmental-fallback',
                observationId: observation.observationId,
              },
              metadata: {
                thoughtType: 'environmental',
                source: observation.category,
                observationId: observation.observationId,
                fallback: insight.fallback,
                entity: observation.entity
                  ? {
                      name:
                        observation.entity.displayName || observation.entity.name,
                      threatLevel: observation.entity.threatLevel,
                      distance: observation.entity.distance,
                      position: sanitizedEntityPosition,
                    }
                  : undefined,
                event: observation.event
                  ? {
                      type: observation.event.type,
                      description: observation.event.description,
                      severity: observation.event.severity,
                      position: redactPositionForLog(observation.event.position),
                    }
                  : undefined,
                botPosition: sanitizedBotPosition,
                timestamp: observation.timestamp,
              },
              id: `thought-${Date.now()}-env-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
              timestamp: Date.now(),
              processed: true,
            };

            const isGenericFallback =
              insight.fallback &&
              insight.thought.text ===
                ObservationReasoner.GENERIC_FALLBACK_THOUGHT;
            if (!isGenericFallback) {
              const dashboardUrl =
                process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
              const cognitiveStreamResponse = await resilientFetch(
                `${dashboardUrl}/api/ws/cognitive-stream`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(internalThought),
                  label: 'dashboard/cognitive-stream',
                }
              );
              if (!cognitiveStreamResponse?.ok) {
                console.warn(
                  '❌ Failed to send observation thought to cognitive stream'
                );
              }
            }

            const primaryTask = insight.actions.tasks?.[0];

            res.json({
              processed: true,
              type: 'environmental_awareness',
              observationId: observation.observationId,
              thought: insight.thought,
              actions: insight.actions,
              fallback: insight.fallback,
              error: insight.error,
              shouldRespond: insight.actions.shouldRespond,
              response: insight.actions.response ?? '',
              shouldCreateTask: insight.actions.shouldCreateTask,
              taskSuggestion: primaryTask?.description,
              internalThought,
              timestamp: Date.now(),
            });
            return;
          }

          // Fallback to minimal processing when observation payload missing
          const fallbackThought = {
            type: 'environmental',
            content: content || 'Maintaining awareness of surroundings.',
            attribution: 'self',
            context: {
              emotionalState: 'alert',
              confidence: 0.5,
              cognitiveSystem: 'environmental-fallback',
            },
            metadata: {
              thoughtType: 'environmental',
              source: 'legacy-content',
              fallback: true,
              botPosition: redactPositionForLog(metadata?.botPosition),
              entityType: metadata?.entityType,
              distance: metadata?.distance,
            },
            id: `thought-${Date.now()}-env-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            processed: true,
          };

          const dashboardUrl =
            process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
          await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackThought),
            label: 'dashboard/cognitive-stream',
          });

          res.json({
            processed: true,
            type: 'environmental_awareness',
            observationId: fallbackThought.id,
            thought: {
              text: fallbackThought.content,
              confidence: 0.5,
              categories: ['fallback'],
              source: 'fallback',
            },
            actions: {
              shouldRespond: false,
              response: undefined,
              shouldCreateTask: false,
              tasks: [],
            },
            fallback: true,
            shouldRespond: false,
            response: '',
            shouldCreateTask: false,
            taskSuggestion: undefined,
            internalThought: fallbackThought,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('❌ Error processing environmental awareness:', error);
          res.json({
            processed: false,
            type: 'environmental_awareness',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          });
        }
      } else if (type === 'social_interaction') {
        deps.logObservation('Processing social interaction', { content, metadata });

        try {
          patchBotStateCache({
            health: metadata?.botHealth,
            food: metadata?.botFood,
            position: metadata?.botPosition,
          });

          const stateForChat = getBotStateCache();
          if (botStateCacheAgeMs() > STALE_THRESHOLD_MS) {
            const mcUrl =
              process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';
            resilientFetch(`${mcUrl}/state`, { label: 'mc/state-social' })
              .then(async (freshRes) => {
                if (freshRes?.ok) {
                  const freshBot = (await freshRes.json()) as any;
                  const rawState = freshBot?.data || {};
                  const innerData = rawState.data || {};
                  const rawInventory = innerData.inventory;
                  const inventory = Array.isArray(rawInventory)
                    ? rawInventory
                    : Array.isArray(rawInventory?.items)
                      ? rawInventory.items
                      : [];
                  const gameMode = rawState.worldState?.player?.gameMode;
                  const freshState = { ...innerData, inventory, gameMode };
                  updateBotStateCache(freshState);
                }
              })
              .catch(() => {
                /* Non-blocking — stale cache is acceptable */
              });
          }

          const cachedPos = stateForChat?.state?.position;
          const derivedBotPosition =
            (isCompletePosition(metadata?.botPosition)
              ? metadata.botPosition
              : undefined) ??
            (isCompletePosition(cachedPos)
              ? { x: cachedPos.x, y: cachedPos.y, z: cachedPos.z }
              : undefined);

          const internalThought = {
            type: 'social',
            content: `Social interaction: ${content}`,
            attribution: 'self',
            context: {
              emotionalState: 'interested',
              confidence: 0.9,
              cognitiveSystem: 'social-processor',
              sender: metadata?.sender,
              message: metadata?.message,
            },
            metadata: {
              ...metadata,
              thoughtType: 'social',
              source: 'player-chat',
              sender: metadata?.sender,
              message: metadata?.message,
              environment: metadata?.environment,
              botPosition: derivedBotPosition,
            },
            id: `thought-${Date.now()}-social-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            processed: false,
          };

          const dashboardUrl =
            process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
          await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(internalThought),
            label: 'dashboard/cognitive-stream',
          });

          let shouldRespond = false;
          let response = '';
          let shouldCreateTask = false;
          let taskSuggestion = '';

          const message = metadata?.message?.toLowerCase() || '';
          const sender = metadata?.sender || 'unknown';

          if (message.includes('danger') || message.includes('threat')) {
            shouldRespond = true;
            response = 'On it -- checking the area now.';
            shouldCreateTask = true;
            taskSuggestion = `Address safety concern from ${sender}`;
          } else if (message.includes('?')) {
            shouldRespond = true;
            shouldCreateTask = true;
            taskSuggestion = `Answer question from ${sender}: "${message}"`;
            try {
              const llmResult = await deps.llmInterface.generateSocialResponse(
                metadata?.message || message,
                { sender, botState: stateForChat }
              );
              response = llmResult.text || 'Hmm, let me think about that...';
            } catch {
              response = 'Hmm, let me think about that...';
            }
          } else if (message.includes('help') || message.includes('assist')) {
            shouldRespond = true;
            shouldCreateTask = true;
            taskSuggestion = `Provide assistance requested by ${sender}`;
            try {
              const llmResult = await deps.llmInterface.generateSocialResponse(
                metadata?.message || message,
                { sender, botState: stateForChat }
              );
              response = llmResult.text || 'Sure, what do you need?';
            } catch {
              response = 'Sure, what do you need?';
            }
          } else if (
            message.length < 15 &&
            (message.includes('hello') ||
              message.includes('hi') ||
              message.includes('hey'))
          ) {
            shouldRespond = Math.random() < 0.6;
            if (shouldRespond) {
              const greetingTemplates = [
                `Hey ${sender}!`,
                'Oh, hi there!',
                "Hey! What's going on?",
                `Yo ${sender}.`,
                "Oh hey, didn't see you there.",
              ];
              const useLLM = Math.random() < 0.5;
              if (useLLM) {
                try {
                  const llmResult = await deps.llmInterface.generateSocialResponse(
                    metadata?.message || message,
                    { sender, botState: stateForChat }
                  );
                  response =
                    llmResult.text ||
                    greetingTemplates[
                      Math.floor(Math.random() * greetingTemplates.length)
                    ];
                } catch {
                  response =
                    greetingTemplates[
                      Math.floor(Math.random() * greetingTemplates.length)
                    ];
                }
              } else {
                response =
                  greetingTemplates[
                    Math.floor(Math.random() * greetingTemplates.length)
                  ];
              }
            }
            shouldCreateTask = false;
          }

          res.json({
            processed: true,
            type: 'social_interaction',
            shouldRespond,
            response,
            shouldCreateTask,
            taskSuggestion,
            internalThought,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('❌ Error processing social interaction:', error);
          res.json({
            processed: false,
            type: 'social_interaction',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          });
        }
      } else if (type === 'environmental_event') {
        deps.logObservation('Processing environmental event', { content, metadata });

        try {
          const internalThought = {
            type: 'environmental',
            content: `Environmental observation: ${content}`,
            attribution: 'self',
            context: {
              emotionalState: 'observant',
              confidence: 0.8,
              cognitiveSystem: 'environmental-processor',
              eventType: metadata?.eventType,
              eventData: metadata?.eventData,
            },
            metadata: {
              thoughtType: 'environmental',
              source: 'environmental-event',
              eventType: metadata?.eventType,
              eventData: metadata?.eventData,
              botPosition: metadata?.botPosition,
              ...metadata,
            },
            id: `thought-${Date.now()}-env-event-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            processed: false,
          };

          const dashboardUrl =
            process.env.DASHBOARD_ENDPOINT || 'http://localhost:3000';
          await resilientFetch(`${dashboardUrl}/api/ws/cognitive-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(internalThought),
            label: 'dashboard/cognitive-stream',
          });

          let shouldRespond = false;
          let response = '';
          let shouldCreateTask = false;
          let taskSuggestion = '';

          const eventType = metadata?.eventType || '';
          const eventData = metadata?.eventData || {};

          if (eventType === 'health_loss' && eventData.damage > 5) {
            shouldRespond = true;
            response = `That hurt! I should be more careful in this area.`;
            shouldCreateTask = true;
            taskSuggestion = `Investigate and avoid the source of damage`;
          } else if (
            eventType === 'block_break' &&
            eventData.oldBlock &&
            eventData.oldBlock !== 'air'
          ) {
            shouldRespond = Math.random() < 0.2;
            if (shouldRespond) {
              response = `Interesting environmental change detected.`;
            }
            shouldCreateTask = false;
          }

          res.json({
            processed: true,
            type: 'environmental_event',
            shouldRespond,
            response,
            shouldCreateTask,
            taskSuggestion,
            internalThought,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('❌ Error processing environmental event:', error);
          res.json({
            processed: false,
            type: 'environmental_event',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          });
        }
      } else if (type === 'external_chat') {
        deps.logObservation('Processing external chat message', { content, metadata });

        try {
          let actualInventory = { items: [] as any[], armor: [] as any[], tools: [] as any[] };
          try {
            const mcUrl =
              process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005';
            const inventoryResponse = await resilientFetch(`${mcUrl}/inventory`, {
              label: 'mc/inventory',
            });
            if (inventoryResponse?.ok) {
              const inventoryData = await inventoryResponse.json();
              actualInventory = (await (inventoryData as any).data) || {
                items: [],
                armor: [],
                tools: [],
              };
            }
          } catch (error) {
            console.error('Failed to fetch actual inventory:', error);
          }

          const arbiterResponse = await deps.reactArbiter.reason({
            snapshot: {
              stateId: 'chat-response',
              position: { x: 0, y: 64, z: 0 },
              biome: 'unknown',
              time: 6000,
              light: 15,
              hazards: ['none'],
              nearbyEntities: [],
              nearbyBlocks: [],
              weather: 'clear',
            },
            inventory: {
              stateId: 'chat-inventory',
              items: actualInventory.items || [],
              armor: actualInventory.armor || [],
              tools: actualInventory.tools || [],
            },
            goalStack: [
              {
                id: 'chat-response-goal',
                type: 'social',
                description: 'Respond to player message',
                priority: 0.8,
                utility: 0.9,
                source: 'user',
              },
            ],
            memorySummaries: [],
          });

          const responseText = arbiterResponse.thoughts || `What now?`;

          const cognitiveThought = await deps.enhancedThoughtGenerator.generateThought(
            {
              currentState: {
                position: { x: 0, y: 64, z: 0 },
                health: 20,
                inventory: [],
              },
              currentTasks: [
                {
                  id: 'chat-response',
                  title: 'Respond to player message',
                  progress: 0.5,
                  status: 'active',
                  type: 'social',
                },
              ],
              recentEvents: [
                {
                  id: 'chat-event',
                  type: 'player_message',
                  timestamp: Date.now(),
                  data: { sender: metadata?.sender, content },
                },
              ],
              emotionalState: metadata?.emotion || 'neutral',
              memoryContext: {},
            }
          );

          const cognitiveThoughts = cognitiveThought ? [cognitiveThought] : [];

          res.json({
            processed: true,
            type: 'external_chat',
            response: responseText,
            cognitiveThoughts: cognitiveThoughts,
            metadata: {
              sender: metadata?.sender,
              messageType: metadata?.messageType,
              intent: metadata?.intent,
              emotion: metadata?.emotion,
              requiresResponse: metadata?.requiresResponse,
              responsePriority: metadata?.responsePriority,
            },
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('Error processing external chat:', error);

          res.json({
            processed: false,
            type: 'external_chat',
            response: `I received your message: "${content}". I'm having trouble processing it right now, but I'll try to help!`,
            cognitiveThoughts: [],
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now(),
          });
        }
      } else {
        const result = {
          processed: true,
          type,
          content,
          context: req.body.context,
          timestamp: Date.now(),
        };

        res.json(result);
      }
    } catch (error) {
      console.error('Error processing cognitive task:', error);
      res.status(500).json({ error: 'Failed to process cognitive task' });
    }
  });

  return router;
}

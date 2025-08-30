/**
 * Cognitive Stream API
 * Streams genuine cognitive events (internal reflection, social analysis, observations).
 */

import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface CognitiveThought {
  id: string;
  timestamp: number;
  type: string;
  content: string;
  attribution: string;
  context: {
    currentTask?: string;
    emotionalState?: string;
    confidence?: number;
    cognitiveSystem?: string;
  };
  metadata: {
    llmConfidence?: number;
    thoughtType?: string;
    sender?: string;
    messageType?: string;
    intent?: string;
    emotion?: string;
    requiresResponse?: boolean;
    responsePriority?: number;
    originalMessageId?: string;
    processingFailed?: boolean;
    error?: string;
  };
  processed?: boolean;
}

const thoughtHistory: CognitiveThought[] = [];
const MAX_THOUGHTS = 1000;
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10;

function addThought(
  thought: Omit<CognitiveThought, 'id' | 'timestamp' | 'processed'>
): CognitiveThought {
  const newThought = {
    ...thought,
    id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    processed: false,
  };
  thoughtHistory.push(newThought);
  if (thoughtHistory.length > MAX_THOUGHTS) {
    thoughtHistory.splice(0, thoughtHistory.length - MAX_THOUGHTS);
  }
  return newThought;
}

async function fetchState(path: string): Promise<any> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(3000),
  });
  return res.ok ? res.json() : null;
}

async function generateThoughts(): Promise<CognitiveThought[]> {
  const [state, plan] = await Promise.all([
    fetchState('http://localhost:3005/state'),
    fetchState('http://localhost:3002/state'),
  ]);

  if (!state || !plan) return [];

  const context = {
    currentGoals: plan.goalFormulation?.currentGoals || [],
    currentState: {
      position: state.data?.position,
      health: state.data?.vitals?.health,
      inventory: state.data?.inventory,
      currentTasks: plan.goalFormulation?.currentTasks || [],
    },
    emotional: 'neutral',
    urgency: 0.3,
  };

  const resp = await fetch('http://localhost:3003/generate-thoughts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      situation: 'environment',
      context,
      thoughtTypes: ['reflection', 'observation', 'planning'],
    }),
    signal: AbortSignal.timeout(3000), // Reduced from 5s to 3s to prevent hanging
  });

  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.thoughts || []).flatMap((t: any) => {
    const dup = thoughtHistory.find(
      (old) => old.content === t.content && Date.now() - old.timestamp < 60000
    );
    if (dup) return [];
    return [
      addThought({
        type: t.type || 'internal',
        content: t.content,
        attribution: 'self',
        context: {
          currentTask: context.currentState.currentTasks[0]?.description,
          emotionalState: t.emotionalState,
          confidence: t.confidence,
          cognitiveSystem: 'llm-core',
        },
        metadata: { llmConfidence: t.confidence, thoughtType: t.type },
      }),
    ];
  });
}

async function processExternalChat(): Promise<CognitiveThought[]> {
  // Check for external chat messages in the thought history
  const externalChatMessages = thoughtHistory.filter(
    (thought) => thought.type === 'external_chat_in' && !thought.processed
  );

  if (externalChatMessages.length === 0) {
    return [];
  }

  const processedThoughts: CognitiveThought[] = [];

  for (const chatMessage of externalChatMessages) {
    try {
      // Mark as processed to avoid duplicate processing
      chatMessage.processed = true;

      // Send to cognitive core for processing
      const cognitiveResponse = await fetch('http://localhost:3003/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'external_chat',
          content: chatMessage.content,
          metadata: {
            sender: chatMessage.metadata?.sender,
            messageType: chatMessage.metadata?.messageType,
            intent: chatMessage.metadata?.intent,
            emotion: chatMessage.metadata?.emotion,
            requiresResponse: chatMessage.metadata?.requiresResponse,
            responsePriority: chatMessage.metadata?.responsePriority,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (cognitiveResponse.ok) {
        const response = await cognitiveResponse.json();

        // Add the bot's response as a thought
        if (response.response) {
          const botResponseThought = addThought({
            type: 'external_chat_out',
            content: response.response,
            attribution: 'self',
            context: {
              emotionalState: 'responsive',
              confidence: 0.8,
              cognitiveSystem: 'llm-core',
            },
            metadata: {
              thoughtType: 'external_chat_out',
              intent: 'response',
              originalMessageId: chatMessage.id,
            },
          });
          processedThoughts.push(botResponseThought);

          // Send the response to the minecraft server
          try {
            const minecraftResponse = await fetch(
              'http://localhost:3005/chat',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: response.response,
                  target: chatMessage.metadata?.sender, // Optional: send as private message
                }),
                signal: AbortSignal.timeout(15000),
              }
            );

            if (minecraftResponse.ok) {
              console.log('✅ Bot response sent to minecraft server');
            } else {
              console.error(
                '❌ Failed to send bot response to minecraft server'
              );
            }
          } catch (error) {
            console.error(
              '❌ Error sending bot response to minecraft server:',
              error
            );
          }
        }

        // Add any cognitive thoughts generated from the chat
        if (response.cognitiveThoughts) {
          for (const cognitiveThought of response.cognitiveThoughts) {
            const thought = addThought({
              type: 'reflection',
              content: cognitiveThought.content,
              attribution: 'self',
              context: {
                emotionalState: cognitiveThought.emotionalState || 'neutral',
                confidence: cognitiveThought.confidence || 0.7,
                cognitiveSystem: 'llm-core',
              },
              metadata: {
                thoughtType: 'reflection',
                originalMessageId: chatMessage.id,
              },
            });
            processedThoughts.push(thought);
          }
        }
      } else {
        // If cognitive processing fails, add a simple acknowledgment thought
        const acknowledgmentThought = addThought({
          type: 'reflection',
          content: `Received message from ${chatMessage.metadata?.sender || 'someone'}: "${chatMessage.content}"`,
          attribution: 'self',
          context: {
            emotionalState: 'neutral',
            confidence: 0.5,
            cognitiveSystem: 'llm-core',
          },
          metadata: {
            thoughtType: 'reflection',
            originalMessageId: chatMessage.id,
            processingFailed: true,
          },
        });
        processedThoughts.push(acknowledgmentThought);
      }
    } catch (error) {
      console.error('Error processing external chat message:', error);

      // Add error acknowledgment thought
      const errorThought = addThought({
        type: 'reflection',
        content: `Failed to process message: "${chatMessage.content}"`,
        attribution: 'self',
        context: {
          emotionalState: 'confused',
          confidence: 0.3,
          cognitiveSystem: 'llm-core',
        },
        metadata: {
          thoughtType: 'reflection',
          originalMessageId: chatMessage.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      processedThoughts.push(errorThought);
    }
  }

  return processedThoughts;
}

async function processBotResponses(): Promise<CognitiveThought[]> {
  // Placeholder for bot response processing
  // In a full implementation, this would process bot actions and responses
  return [];
}

export const GET = async (req: NextRequest) => {
  if (activeConnections.size >= MAX_CONNECTIONS) {
    return new Response('Too many connections', { status: 429 });
  }

  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log(
      'GET /api/ws/cognitive-stream: New connection, total connections:',
      activeConnections.size
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      activeConnections.add(controller);
      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(
          'GET /api/ws/cognitive-stream: Connection added, total connections:',
          activeConnections.size
        );
      }

      // Send initial data with existing thoughts
      const initialData = {
        type: 'cognitive_stream_init',
        timestamp: Date.now(),
        data: { thoughts: thoughtHistory.slice(-50) },
      };

      // Only log in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log(
          'Sending initial data with',
          thoughtHistory.length,
          'thoughts'
        );
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`)
      );

      const sendUpdates = async () => {
        try {
          const thoughts = (
            Math.random() < 0.05 ? await generateThoughts() : []
          ) // Reduced from 0.15 to 0.05 to prevent spam
            .concat(await processExternalChat(), await processBotResponses());

          if (thoughts.length > 0) {
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
              console.log(
                'Sending',
                thoughts.length,
                'new thoughts to',
                activeConnections.size,
                'connections'
              );
            }
            const updateData = {
              type: 'cognitive_thoughts',
              timestamp: Date.now(),
              data: { thoughts },
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(updateData)}\n\n`)
            );
          }
        } catch (error) {
          console.error('Error in sendUpdates:', error);
        }
      };

      const interval = setInterval(sendUpdates, 30000); // Reduced from 15s to 30s to prevent spam

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        activeConnections.delete(controller);
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log(
            'GET /api/ws/cognitive-stream: Connection removed, total connections:',
            activeConnections.size
          );
        }
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { type, content, attribution, context, metadata } = body;

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('POST /api/ws/cognitive-stream received:', {
        type,
        content,
        attribution,
      });
    }

    if (!content || content.trim().length === 0) {
      return new Response('Thought content is required', { status: 400 });
    }

    // Add the thought to the history
    const newThought = addThought({
      type: type || 'intrusive',
      content: content.trim(),
      attribution: attribution || 'external',
      context: context || {
        emotionalState: 'neutral',
        confidence: 0.5,
      },
      metadata: {
        ...metadata,
        thoughtType: type || 'intrusive', // Ensure thoughtType is set
      },
    });

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('New thought added to history:', newThought);
    }

    // Broadcast to all connected clients
    const message = JSON.stringify({
      type: 'cognitive_thoughts',
      timestamp: Date.now(),
      data: { thoughts: [newThought] },
    });

    // Only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(
        'Broadcasting message to',
        activeConnections.size,
        'connections:',
        message
      );
    }

    activeConnections.forEach((controller) => {
      try {
        controller.enqueue(new TextEncoder().encode(`data: ${message}\n\n`));
        // Only log in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Message sent to connection');
        }
      } catch (error) {
        // Only log errors in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Error sending to connection:', error);
        }
        // Remove dead connections
        activeConnections.delete(controller);
      }
    });

    return new Response(
      JSON.stringify({ success: true, thought: newThought }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('POST /api/ws/cognitive-stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};

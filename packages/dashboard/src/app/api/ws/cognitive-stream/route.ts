/**
 * Authentic Cognitive Stream
 *
 * Integrates with actual cognitive systems to generate real thoughts:
 * - Internal dialogue system with LLM integration
 * - Theory of mind for social cognition
 * - Constitutional filtering for ethical reasoning
 * - Self-model for identity and reflection
 *
 * Provides a genuine consciousness flow using the bot's actual cognitive architecture
 *
 * @author @darianrosebrook
 */

import { NextRequest } from 'next/server';

// Fix for Next.js 15 SSE issues
export const runtime = 'nodejs';
export const maxDuration = 60;

// Persistent thought storage (in production, this would be a database)
const thoughtHistory: CognitiveThought[] = [];
const MAX_THOUGHTS = 1000;

// Track active connections
const activeConnections = new Set<ReadableStreamDefaultController>();
const MAX_CONNECTIONS = 10;

export interface CognitiveThought {
  id: string;
  timestamp: number;
  type:
    | 'internal'
    | 'external_chat_in'
    | 'external_chat_out'
    | 'intrusive'
    | 'reflection'
    | 'decision'
    | 'observation'
    | 'social'
    | 'ethical';
  content: string;
  sender?: string;
  attribution: 'self' | 'external' | 'intrusive';
  context?: {
    currentTask?: string;
    currentGoal?: string;
    emotionalState?: string;
    confidence?: number;
    cognitiveSystem?: string; // Which cognitive system generated this
  };
  metadata?: {
    messageType?: string;
    intent?: string;
    emotion?: string;
    requiresResponse?: boolean;
    responsePriority?: string;
    llmConfidence?: number;
    thoughtType?: string;
  };
}

/**
 * Add a thought to the persistent history
 */
function addThought(
  thought: Omit<CognitiveThought, 'id' | 'timestamp'>
): CognitiveThought {
  const newThought: CognitiveThought = {
    ...thought,
    id: `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  thoughtHistory.push(newThought);

  // Keep only the most recent thoughts
  if (thoughtHistory.length > MAX_THOUGHTS) {
    thoughtHistory.splice(0, thoughtHistory.length - MAX_THOUGHTS);
  }

  return newThought;
}

/**
 * Generate authentic thoughts using the cognition system
 */
async function generateAuthenticThoughts(): Promise<CognitiveThought[]> {
  const newThoughts: CognitiveThought[] = [];

  try {
    // Get current bot state for context
    const minecraftResponse = await fetch('http://localhost:3005/state', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    const planningResponse = await fetch('http://localhost:3002/state', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (minecraftResponse.ok && planningResponse.ok) {
      const minecraftData = await minecraftResponse.json();
      const planningData = await planningResponse.json();

      // Build context for cognitive processing
      const context = {
        currentGoals: planningData.goalFormulation?.currentGoals || [],
        currentState: {
          position: minecraftData.data?.position,
          health: minecraftData.data?.vitals?.health,
          inventory: minecraftData.data?.inventory,
          currentTasks: planningData.goalFormulation?.currentTasks || [],
        },
        recentEvents: [], // TODO: Track recent events
        emotionalState: 'neutral',
        urgency: 0.3,
      };

      // Generate thoughts using the cognition system
      const cognitionResponse = await fetch(
        'http://localhost:3003/generate-thoughts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            situation: 'Current bot state and environment',
            context,
            thoughtTypes: ['reflection', 'observation', 'planning'],
          }),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (cognitionResponse.ok) {
        const cognitionData = await cognitionResponse.json();

        // Process thoughts from the cognition system
        for (const thought of cognitionData.thoughts || []) {
          // Check for duplicates
          const existingThought = thoughtHistory.find(
            (t) =>
              t.content === thought.content && Date.now() - t.timestamp < 60000 // Within last minute
          );

          if (!existingThought) {
            newThoughts.push(
              addThought({
                type: thought.type || 'internal',
                content: thought.content,
                attribution: 'self',
                context: {
                  currentTask:
                    context.currentState.currentTasks[0]?.description,
                  emotionalState: thought.emotionalState || 'neutral',
                  confidence: thought.confidence || 0.7,
                  cognitiveSystem: 'internal-dialogue',
                },
                metadata: {
                  llmConfidence: thought.confidence,
                  thoughtType: thought.type,
                },
              })
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Error generating authentic thoughts:', error);
  }

  return newThoughts;
}

/**
 * Process external chat messages and generate social cognition thoughts
 */
async function processExternalChat(): Promise<CognitiveThought[]> {
  const newThoughts: CognitiveThought[] = [];

  try {
    // Fetch recent chat messages
    const chatResponse = await fetch('http://localhost:3005/chat', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      const recentMessages = chatData.data?.slice(-5) || [];

      // Process messages from other players
      for (const msg of recentMessages) {
        // Skip bot's own messages
        if (
          msg.sender === 'SimpleBot' ||
          msg.sender === 'ConsciousBot' ||
          msg.sender === 'unknown'
        ) {
          continue;
        }

        // Check for duplicates
        const existingThought = thoughtHistory.find(
          (t) =>
            t.type === 'external_chat_in' &&
            t.content === msg.message &&
            t.sender === msg.sender
        );

        if (!existingThought) {
          // Add the external message
          newThoughts.push(
            addThought({
              type: 'external_chat_in',
              content: msg.message,
              sender: msg.sender,
              attribution: 'external',
              metadata: {
                messageType: 'chat',
                intent: 'communication',
              },
            })
          );

          // Generate social cognition thoughts about the message
          try {
            const socialResponse = await fetch(
              'http://localhost:3003/process-social',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: msg.message,
                  sender: msg.sender,
                  context: {
                    currentGoals: [],
                    currentState: {},
                    emotionalState: 'neutral',
                  },
                }),
                signal: AbortSignal.timeout(3000),
              }
            );

            if (socialResponse.ok) {
              const socialData = await socialResponse.json();

              if (socialData.thoughts) {
                for (const thought of socialData.thoughts) {
                  newThoughts.push(
                    addThought({
                      type: 'social',
                      content: thought.content,
                      attribution: 'self',
                      context: {
                        emotionalState: thought.emotionalState || 'neutral',
                        confidence: thought.confidence || 0.6,
                        cognitiveSystem: 'social-cognition',
                      },
                      metadata: {
                        llmConfidence: thought.confidence,
                        thoughtType: 'social-analysis',
                      },
                    })
                  );
                }
              }
            }
          } catch (error) {
            console.error('Error processing social cognition:', error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing external chat:', error);
  }

  return newThoughts;
}

/**
 * Process bot's own responses
 */
async function processBotResponses(): Promise<CognitiveThought[]> {
  const newThoughts: CognitiveThought[] = [];

  try {
    const chatResponse = await fetch('http://localhost:3005/chat', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      const recentMessages = chatData.data?.slice(-5) || [];

      for (const msg of recentMessages) {
        if (msg.sender === 'SimpleBot' || msg.sender === 'ConsciousBot') {
          const existingThought = thoughtHistory.find(
            (t) => t.type === 'external_chat_out' && t.content === msg.message
          );

          if (!existingThought) {
            newThoughts.push(
              addThought({
                type: 'external_chat_out',
                content: msg.message,
                sender: msg.sender,
                attribution: 'self',
                metadata: {
                  messageType: 'response',
                  intent: 'communication',
                },
              })
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing bot responses:', error);
  }

  return newThoughts;
}

export const GET = async (req: NextRequest) => {
  try {
    // Check connection limit
    if (activeConnections.size >= MAX_CONNECTIONS) {
      console.log(
        `Cognitive stream connection limit reached (${MAX_CONNECTIONS}), rejecting new connection`
      );
      return new Response('Too many connections', { status: 429 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let isConnected = true;

        // Track this connection
        activeConnections.add(controller);
        console.log(
          `Cognitive stream connection established. Total connections: ${activeConnections.size}`
        );

        // Send initial thought history
        const sendInitialThoughts = () => {
          const initialData = {
            type: 'cognitive_stream_init',
            timestamp: Date.now(),
            data: {
              thoughts: thoughtHistory.slice(-50),
              totalThoughts: thoughtHistory.length,
            },
          };

          const data = `data: ${JSON.stringify(initialData)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        // Send new thoughts
        const sendNewThoughts = async () => {
          if (!isConnected) return;

          try {
            const newThoughts: CognitiveThought[] = [];

            // Generate authentic thoughts using cognition system (less frequently)
            if (Math.random() < 0.15) {
              // 15% chance each cycle
              const authenticThoughts = await generateAuthenticThoughts();
              newThoughts.push(...authenticThoughts);
            }

            // Process external chat
            const chatThoughts = await processExternalChat();
            newThoughts.push(...chatThoughts);

            // Process bot responses
            const responseThoughts = await processBotResponses();
            newThoughts.push(...responseThoughts);

            // Send new thoughts if any
            if (newThoughts.length > 0) {
              const thoughtData = {
                type: 'cognitive_thoughts',
                timestamp: Date.now(),
                data: {
                  thoughts: newThoughts,
                  count: newThoughts.length,
                },
              };

              const data = `data: ${JSON.stringify(thoughtData)}\n\n`;
              controller.enqueue(encoder.encode(data));

              console.log(
                `🧠 Sent ${newThoughts.length} authentic cognitive thoughts`
              );
            }
          } catch (error) {
            console.error('Error in cognitive stream:', error);
          }
        };

        // Send initial thoughts immediately
        sendInitialThoughts();

        // Set up periodic updates
        const intervalId = setInterval(sendNewThoughts, 15000); // Every 15 seconds

        // Handle client disconnect
        const cleanup = () => {
          isConnected = false;
          if (intervalId) {
            clearInterval(intervalId);
          }
          activeConnections.delete(controller);
          console.log(
            `Cognitive stream connection closed. Total connections: ${activeConnections.size}`
          );
          try {
            controller.close();
          } catch (error) {
            // Controller already closed
          }
        };

        // Listen for abort signal
        req.signal.addEventListener('abort', cleanup);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('Error creating cognitive stream:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

// API endpoint to manually add thoughts (for testing)
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { type, content, sender, attribution, context, metadata } = body;

    const thought = addThought({
      type: type || 'internal',
      content,
      sender,
      attribution: attribution || 'self',
      context,
      metadata,
    });

    // Broadcast to all connected clients
    const thoughtData = {
      type: 'cognitive_thoughts',
      timestamp: Date.now(),
      data: {
        thoughts: [thought],
        count: 1,
      },
    };

    const encoder = new TextEncoder();
    const data = `data: ${JSON.stringify(thoughtData)}\n\n`;

    // Clean up disconnected controllers
    const disconnectedControllers: ReadableStreamDefaultController[] = [];

    for (const controller of activeConnections) {
      try {
        controller.enqueue(encoder.encode(data));
      } catch (error) {
        // Mark for removal
        disconnectedControllers.push(controller);
      }
    }

    // Remove disconnected controllers
    for (const controller of disconnectedControllers) {
      activeConnections.delete(controller);
    }

    return new Response(JSON.stringify({ success: true, thought }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error adding thought:', error);
    return new Response(JSON.stringify({ error: 'Failed to add thought' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

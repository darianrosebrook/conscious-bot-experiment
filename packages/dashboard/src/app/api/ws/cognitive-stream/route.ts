/**
 * Enhanced Cognitive Stream
 * 
 * Provides a realistic consciousness flow showing:
 * - Internal thoughts and reflections
 * - External chat messages (from/to other players)
 * - Intrusive thoughts (with proper attribution)
 * - Cognitive processing and decision-making
 * - Persistent thought history
 * 
 * Integrates with existing cognitive systems for authentic consciousness simulation
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

export interface CognitiveThought {
  id: string;
  timestamp: number;
  type: 'internal' | 'external_chat_in' | 'external_chat_out' | 'intrusive' | 'reflection' | 'decision' | 'observation';
  content: string;
  sender?: string; // For chat messages
  attribution: 'self' | 'external' | 'intrusive';
  context?: {
    currentTask?: string;
    currentGoal?: string;
    emotionalState?: string;
    confidence?: number;
  };
  metadata?: {
    messageType?: string;
    intent?: string;
    emotion?: string;
    requiresResponse?: boolean;
    responsePriority?: string;
  };
}

/**
 * Add a thought to the persistent history
 */
function addThought(thought: Omit<CognitiveThought, 'id' | 'timestamp'>): CognitiveThought {
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
 * Generate internal thoughts based on current state
 */
async function generateInternalThoughts(): Promise<CognitiveThought[]> {
  const newThoughts: CognitiveThought[] = [];
  
  try {
    // Fetch current bot state
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
      
      // Generate contextual thoughts based on current state
      const currentTasks = planningData.goalFormulation?.currentTasks || [];
      const completedTasks = planningData.goalFormulation?.completedTasks || [];
      
      // Thought about current activities
      if (currentTasks.length > 0) {
        const currentTask = currentTasks[0];
        newThoughts.push(addThought({
          type: 'internal',
          content: `I'm currently working on: ${currentTask.description}`,
          attribution: 'self',
          context: {
            currentTask: currentTask.description,
            confidence: 0.8,
          },
        }));
      }
      
      // Reflection on recent progress
      if (completedTasks.length > 0) {
        const recentTask = completedTasks[completedTasks.length - 1];
        newThoughts.push(addThought({
          type: 'reflection',
          content: `I just completed: ${recentTask.description}. That went well.`,
          attribution: 'self',
          context: {
            currentGoal: recentTask.goal,
            emotionalState: 'satisfied',
            confidence: 0.7,
          },
        }));
      }
      
      // Environmental observation
      if (minecraftData.data?.position) {
        const pos = minecraftData.data.position;
        newThoughts.push(addThought({
          type: 'observation',
          content: `I'm at position (${pos.x}, ${pos.y}, ${pos.z}). The area looks interesting.`,
          attribution: 'self',
          context: {
            emotionalState: 'curious',
            confidence: 0.9,
          },
        }));
      }
    }
  } catch (error) {
    console.error('Error generating internal thoughts:', error);
  }
  
  return newThoughts;
}

/**
 * Process external chat messages
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
    
    const processedMessagesResponse = await fetch('http://localhost:3005/processed-messages', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    
    if (chatResponse.ok && processedMessagesResponse.ok) {
      const chatData = await chatResponse.json();
      const processedData = await processedMessagesResponse.json();
      
      // Process recent chat messages
      const recentMessages = chatData.data?.slice(-5) || [];
      const processedMessages = processedData.data?.slice(-5) || [];
      
      // Add incoming chat messages
      for (const msg of recentMessages) {
        // Check if this message is already in our history
        const existingThought = thoughtHistory.find(t => 
          t.type === 'external_chat_in' && 
          t.content === msg.message &&
          t.sender === msg.sender
        );
        
        if (!existingThought && msg.sender !== 'SimpleBot') {
          newThoughts.push(addThought({
            type: 'external_chat_in',
            content: msg.message,
            sender: msg.sender,
            attribution: 'external',
            metadata: {
              messageType: 'chat',
              intent: 'communication',
            },
          }));
        }
      }
      
      // Add processed message analysis
      for (const processedMsg of processedMessages) {
        if (processedMsg.sender !== 'SimpleBot') {
          newThoughts.push(addThought({
            type: 'internal',
            content: `I heard "${processedMsg.content}" from ${processedMsg.sender}. ${processedMsg.messageType === 'greeting' ? 'They seem friendly.' : processedMsg.messageType === 'request' ? 'They need something from me.' : 'I should consider how to respond.'}`,
            attribution: 'self',
            context: {
              emotionalState: processedMsg.emotion || 'neutral',
              confidence: 0.6,
            },
            metadata: {
              messageType: processedMsg.messageType,
              intent: processedMsg.intent,
              emotion: processedMsg.emotion,
              requiresResponse: processedMsg.requiresResponse,
            },
          }));
        }
      }
    }
  } catch (error) {
    console.error('Error processing external chat:', error);
  }
  
  return newThoughts;
}

/**
 * Process bot's own chat responses
 */
async function processBotResponses(): Promise<CognitiveThought[]> {
  const newThoughts: CognitiveThought[] = [];
  
  try {
    // Fetch recent chat messages to find bot's own responses
    const chatResponse = await fetch('http://localhost:3005/chat', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    
    if (chatResponse.ok) {
      const chatData = await chatResponse.json();
      const recentMessages = chatData.data?.slice(-5) || [];
      
      // Find bot's own messages
      for (const msg of recentMessages) {
        if (msg.sender === 'SimpleBot') {
          // Check if this response is already in our history
          const existingThought = thoughtHistory.find(t => 
            t.type === 'external_chat_out' && 
            t.content === msg.message
          );
          
          if (!existingThought) {
            newThoughts.push(addThought({
              type: 'external_chat_out',
              content: msg.message,
              sender: 'SimpleBot',
              attribution: 'self',
              metadata: {
                messageType: 'response',
                intent: 'communication',
              },
            }));
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
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        let isConnected = true;
        let intervalId: NodeJS.Timeout;
        
        // Track this connection
        activeConnections.add(controller);
        console.log(`Cognitive stream connection established. Total connections: ${activeConnections.size}`);
        
        // Send initial thought history
        const sendInitialThoughts = () => {
          const initialData = {
            type: 'cognitive_stream_init',
            timestamp: Date.now(),
            data: {
              thoughts: thoughtHistory.slice(-50), // Send last 50 thoughts
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
            
            // Generate internal thoughts (less frequently)
            if (Math.random() < 0.3) { // 30% chance each cycle
              const internalThoughts = await generateInternalThoughts();
              newThoughts.push(...internalThoughts);
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
              
              console.log(`🧠 Sent ${newThoughts.length} new cognitive thoughts`);
            }
          } catch (error) {
            console.error('Error in cognitive stream:', error);
          }
        };
        
        // Send initial thoughts immediately
        sendInitialThoughts();
        
        // Set up periodic updates
        intervalId = setInterval(sendNewThoughts, 5000); // Every 5 seconds
        
        // Handle client disconnect
        req.signal.addEventListener('abort', () => {
          isConnected = false;
          activeConnections.delete(controller);
          clearInterval(intervalId);
          console.log(`Cognitive stream connection closed. Total connections: ${activeConnections.size}`);
        });
      },
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
    
    for (const controller of activeConnections) {
      try {
        controller.enqueue(encoder.encode(data));
      } catch (error) {
        // Remove disconnected controllers
        activeConnections.delete(controller);
      }
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

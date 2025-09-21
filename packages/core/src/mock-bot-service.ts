/**
 * Mock Bot Service
 *
 * Provides minimal bot connectivity for the planning system to execute tasks.
 * Simulates a connected Minecraft bot for testing purposes.
 *
 * @author @darianrosebrook
 */

import express from 'express';
import cors from 'cors';

const app: express.Application = express();
app.use(cors());
app.use(express.json());

const port = 3005;

// Mock bot state
let botState = {
  connected: true,
  position: { x: 100, y: 70, z: 200 },
  health: 20,
  inventory: [
    { name: 'wooden_pickaxe', count: 1 },
    { name: 'oak_log', count: 8 },
    { name: 'cobblestone', count: 32 },
  ],
  status: 'connected',
  botStatus: { connected: true },
  vitals: { health: 20 },
  data: {
    position: { x: 100, y: 70, z: 200 },
    inventory: [
      { name: 'wooden_pickaxe', count: 1 },
      { name: 'oak_log', count: 8 },
      { name: 'cobblestone', count: 32 },
    ],
  },
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'connected',
    botStatus: { connected: true },
    timestamp: Date.now(),
  });
});

// Bot status endpoint
app.get('/status', (req, res) => {
  res.json({
    connected: true,
    position: botState.position,
    health: botState.health,
    inventory: botState.inventory,
    status: 'connected',
    botStatus: { connected: true },
  });
});

// State endpoint
app.get('/state', (req, res) => {
  res.json({
    status: 'connected',
    data: botState.data,
    timestamp: Date.now(),
  });
});

// Connect endpoint
app.post('/connect', (req, res) => {
  botState.connected = true;
  botState.status = 'connected';
  res.json({ success: true, message: 'Bot connected successfully' });
});

// Disconnect endpoint
app.post('/disconnect', (req, res) => {
  botState.connected = false;
  botState.status = 'disconnected';
  res.json({ success: true, message: 'Bot disconnected successfully' });
});

// Execute task endpoint (mock)
app.post('/execute', (req, res) => {
  const { task } = req.body;
  console.log(`🤖 [MOCK BOT] Executing task: ${task?.title || 'Unknown task'}`);

  // Simulate task execution
  setTimeout(() => {
    res.json({
      success: true,
      message: 'Task executed successfully (mock)',
      result: { progress: 1.0 },
    });
  }, 1000);
});

// Chat endpoint
app.post('/chat', (req, res) => {
  const { message, target } = req.body;
  console.log(`💬 [MOCK BOT] Chat: ${message}`);
  res.json({ success: true, message: 'Chat message sent (mock)' });
});

// Get inventory endpoint
app.get('/inventory', (req, res) => {
  res.json({
    success: true,
    inventory: botState.inventory,
    timestamp: Date.now(),
  });
});

app.listen(port, () => {
  console.log(`✅ Mock Bot Service running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🤖 Bot status: http://localhost:${port}/status`);
  console.log(`🔧 Connect bot: curl -X POST http://localhost:${port}/connect`);
});

export default app;

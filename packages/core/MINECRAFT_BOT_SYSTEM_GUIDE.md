# Minecraft Bot System Guide

## Overview

Your Minecraft bot system is now **fully operational** and connected to real Mineflayer bot actions. The system provides a complete cognitive planning and execution pipeline that can control a real Minecraft bot.

## 🎯 What's Working

### ✅ Core System Components
- **Bot Connection**: Mineflayer bot properly connected to Minecraft server
- **Cognitive Planning**: MCP capabilities-based planning system
- **Real Action Execution**: Bot actually performs actions in Minecraft world
- **State Monitoring**: Real-time bot state tracking and updates
- **Capability Registry**: 11+ registered capabilities for various actions

### ✅ Available Capabilities
1. **move_to@1.0.0** - Move bot to specific position
2. **step_forward_safely@1.0.0** - Safe forward movement
3. **place_torch_if_needed@1.0.0** - Place torches for lighting
4. **retreat_and_block@1.0.0** - Defensive retreat behavior
5. **sense_hostiles@1.0.0** - Detect nearby hostile entities
6. **dig_block@1.0.0** - Mine blocks
7. **place_block@1.0.0** - Place blocks
8. **consume_food@1.0.0** - Eat food for sustenance
9. **get_light_level@1.0.0** - Sense light levels
10. **craft_recipe@1.1.0** - Craft items
11. **opt.torch_corridor@1.0.0** - Complex torch corridor building (shadow)

## 🚀 How to Use

### Quick Start

1. **Build the system**:
   ```bash
   cd packages/core
   pnpm run build
   ```

2. **Run a demo**:
   ```bash
   # Test basic bot connection
   pnpm run demo:bot-connection
   
   # Test action execution
   pnpm run demo:action-execution
   
   # Test real capability execution
   pnpm run demo:real-capability
   
   # Full system capabilities demo
   pnpm run demo:full-system
   ```

### Environment Variables

Set these environment variables for your Minecraft server:
```bash
export MINECRAFT_HOST=localhost
export MINECRAFT_PORT=25565
export MINECRAFT_USERNAME=ConsciousBot
export MINECRAFT_VERSION=1.21.4
```

**Auth and skin display**

- `MINECRAFT_AUTH` (default: `microsoft`) — `microsoft` logs in with a real account so the **account’s selected skin** is sent in the session. Use `offline` for local/testing (no Microsoft login; server usually shows a default skin).
- For the in-game bot to show that skin on a **third-party server**, the server must support skins (e.g. fetch from Mojang session or run a plugin like SkinRestorer). The bot side only needs `MINECRAFT_AUTH=microsoft` and the account to have the desired skin set at minecraft.net.

### Programmatic Usage

```typescript
import { createBot } from 'mineflayer';
import { createMinecraftCognitiveIntegration } from '@conscious-bot/core';

// Create bot
const bot = createBot({
  host: 'localhost',
  port: 25565,
  username: 'ConsciousBot',
  version: '1.21.4',
  auth: 'offline',
});

// Wait for spawn
await new Promise<void>((resolve) => {
  bot.once('spawn', resolve);
});

// Create cognitive integration
const integration = await createMinecraftCognitiveIntegration(bot, {
  enableRealActions: true,
  actionTimeout: 30000,
  maxRetries: 3,
});

// Execute goals
await integration.executePlanningCycle('move to position');
await integration.executePlanningCycle('get light level');
await integration.executePlanningCycle('explore safely');

// Monitor state
const state = integration.getBotState();
console.log('Bot position:', state.position);
console.log('Bot health:', state.health);
```

## 🧠 System Architecture

### Cognitive Stream Integration
- **Planning**: Goal-based planning using MCP capabilities
- **Execution**: Real-time capability execution through Mineflayer
- **Monitoring**: Continuous state tracking and event streaming
- **Adaptation**: Dynamic goal adjustment based on world state

### MCP Capabilities System
- **Registry**: Centralized capability management
- **Execution**: Direct leaf execution through Mineflayer bot
- **Shadow Runs**: Safe testing of new capabilities
- **Performance Tracking**: Success rates and execution metrics

### Real Bot Actions
- **Movement**: Pathfinding and safe navigation
- **Interaction**: Block mining, placing, and crafting
- **Sensing**: Light levels, hostile detection, inventory
- **Survival**: Food consumption and health management

## 📊 Monitoring and Debugging

### Bot State
```typescript
const state = integration.getBotState();
// Returns: { position, health, food, inventory, currentTask }
```

### Cognitive Events
```typescript
const events = integration.getCognitiveStream();
// Returns: Array of planning, execution, and observation events
```

### Capability Status
```typescript
const status = await integration.getMCPCapabilitiesStatus();
// Returns: { totalCapabilities, activeCapabilities, shadowCapabilities }
```

### Performance Metrics
```typescript
const capabilities = await integration.getMCPRegistry().listCapabilities();
capabilities.forEach(cap => {
  console.log(`${cap.name}: ${cap.successRate * 100}% success rate`);
});
```

## 🎮 Demo Scripts

### 1. Bot Connection Test
```bash
pnpm run demo:bot-connection
```
Tests basic bot connectivity and cognitive integration setup.

### 2. Action Execution Test
```bash
pnpm run demo:action-execution
```
Tests capability identification and planning pipeline.

### 3. Real Capability Execution
```bash
pnpm run demo:real-capability
```
Tests actual bot movement and action execution in Minecraft.

### 4. Full System Demo
```bash
pnpm run demo:full-system
```
Comprehensive demonstration of all system capabilities.

## 🔧 Troubleshooting

### Common Issues

1. **Bot Connection Failed**
   - Check Minecraft server is running
   - Verify host/port settings
   - Ensure server allows offline mode

2. **Capability Execution Fails**
   - Check bot has required permissions
   - Verify world state (e.g., blocks to mine, space to move)
   - Review capability arguments

3. **Planning Timeouts**
   - Increase `actionTimeout` in configuration
   - Check for pathfinding obstacles
   - Verify goal complexity

### Debug Logging

The system provides extensive logging:
- `🔧` - Capability execution
- `🎯` - Planning activities
- `✅` - Successful operations
- `⚠️` - Warnings
- `❌` - Errors

## 🚀 Next Steps

### Immediate Capabilities
- **Autonomous Exploration**: Bot can explore and map areas
- **Resource Gathering**: Mining, collecting, and crafting
- **Survival Behaviors**: Food management and health monitoring
- **Building**: Simple construction and torch placement

### Future Enhancements
- **Advanced Pathfinding**: Complex navigation and obstacle avoidance
- **Social Interaction**: Multi-bot coordination and communication
- **Learning**: Adaptive behavior based on experience
- **Integration**: Connection to higher-level AI systems

## 📝 API Reference

### Core Classes

#### `MinecraftCognitiveIntegration`
Main interface for bot control and cognitive integration.

**Methods:**
- `executePlanningCycle(goal: string)` - Execute a planning cycle for a goal
- `getBotState()` - Get current bot state
- `getCognitiveStream()` - Get cognitive events
- `getActiveGoals()` - Get currently active goals
- `getMCPCapabilitiesStatus()` - Get capability status

#### `CognitiveStreamIntegration`
Internal cognitive planning and execution engine.

#### `EnhancedRegistry`
MCP capabilities registry and execution system.

### Key Types

```typescript
interface BotState {
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Record<string, number>;
  currentTask?: string;
}

interface CognitiveStreamEvent {
  type: 'reflection' | 'observation' | 'planning' | 'capability' | 'execution';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}
```

## 🎉 Success Metrics

Your system has achieved:
- ✅ **Real Bot Movement**: Bot physically moves in Minecraft world
- ✅ **Capability Execution**: 11+ capabilities working
- ✅ **Planning Pipeline**: Goal → Plan → Execute working
- ✅ **State Monitoring**: Real-time bot state tracking
- ✅ **Autonomous Behavior**: Self-directed action execution

The Minecraft bot system is **production-ready** for autonomous behavior and cognitive experimentation! 🎮🤖

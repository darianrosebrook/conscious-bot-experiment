# Memory Versioning System

Seed-based memory isolation for Minecraft world context management.

## Overview

The Memory Versioning System provides automatic memory isolation based on Minecraft world seeds, ensuring that the bot's memories and experiences are properly separated between different worlds. This prevents cross-contamination of knowledge and enables world-specific learning.

## Key Features

### 🌱 Seed-Based Isolation
- **Automatic Namespace Creation**: Creates unique memory namespaces based on world seeds
- **Deterministic Separation**: Same seed always maps to the same namespace
- **Fallback Support**: Uses world names when seeds aren't available
- **Session Tracking**: Combines seed with session ID for complete isolation

### 📦 Namespace Management
- **Active Namespace Switching**: Automatically switches when connecting to different worlds
- **Memory Count Tracking**: Monitors memory usage per namespace
- **Cleanup Automation**: Removes inactive namespaces to prevent memory bloat
- **Statistics Reporting**: Provides detailed usage statistics

### 🔄 Integration
- **Automatic Activation**: Memory namespaces activate when bot connects
- **HTTP API Endpoints**: RESTful interface for memory operations
- **Error Handling**: Graceful fallback when memory service is unavailable
- **Configuration**: Environment variable support for world identification

## Architecture

### Memory Versioning Manager
```typescript
class MemoryVersioningManager {
  // Creates and manages memory namespaces
  createNamespace(context: MemoryContext): MemoryNamespace
  
  // Activates namespace for current session
  activateNamespace(context: MemoryContext): MemoryNamespace
  
  // Provides statistics and monitoring
  getStats(): VersioningStats
}
```

### Memory Integration Service
```typescript
class MemoryIntegrationService {
  // Activates memory namespace for current world
  activateWorldMemory(): Promise<boolean>
  
  // Stores memories in current namespace
  storeMemory(memory: any): Promise<boolean>
  
  // Retrieves memories from current namespace
  retrieveMemories(query: any): Promise<any[]>
}
```

## Configuration

### Environment Variables
```bash
# World identification
WORLD_SEED=12345          # Minecraft world seed
WORLD_NAME="My World"     # World name for identification

# Memory service configuration
MEMORY_SERVICE_URL=http://localhost:3001
```

### Bot Configuration
```typescript
const botConfig: BotConfig = {
  // ... other config
  worldSeed: process.env.WORLD_SEED,
  worldName: process.env.WORLD_NAME,
};
```

## Usage Examples

### Basic Usage
```typescript
// Create memory integration service
const memoryIntegration = new MemoryIntegrationService(botConfig);

// Activate namespace for current world
await memoryIntegration.activateWorldMemory();

// Store a memory
await memoryIntegration.storeMemory({
  type: 'exploration',
  description: 'Found a village',
  location: { x: 100, y: 64, z: 200 },
  timestamp: Date.now(),
  salienceScore: 0.8,
});

// Retrieve memories
const memories = await memoryIntegration.retrieveMemories({
  type: 'exploration',
});
```

### Multiple Worlds
```typescript
// World 1: Plains (Seed: 12345)
const plainsConfig = { ...botConfig, worldSeed: '12345' };
const plainsMemory = new MemoryIntegrationService(plainsConfig);
await plainsMemory.activateWorldMemory();

// World 2: Mountains (Seed: 67890)
const mountainConfig = { ...botConfig, worldSeed: '67890' };
const mountainMemory = new MemoryIntegrationService(mountainConfig);
await mountainMemory.activateWorldMemory();

// Each world now has separate memory context
```

## API Endpoints

### Memory Service Endpoints
- `POST /versioning/activate` - Activate namespace for world
- `GET /versioning/active` - Get current active namespace
- `GET /versioning/namespaces` - List all namespaces
- `GET /versioning/stats` - Get versioning statistics

### Minecraft Interface Endpoints
- `GET /memory/status` - Get memory integration status
- `GET /memory/namespace` - Get current namespace info
- `POST /memory/store` - Store a memory
- `POST /memory/retrieve` - Retrieve memories

## Namespace ID Format

### Seed-Based Namespaces
```
seed_{worldSeed}_{sessionId}
```
Example: `seed_12345_session_1703123456789_abc123def`

### World Name Fallback
```
world_{worldName}_{sessionId}
```
Example: `world_My World_session_1703123456789_abc123def`

### Default Namespace
```
default_{sessionId}
```
Example: `default_session_1703123456789_abc123def`

## Benefits

### 🎯 Focused Learning
- Bot learns world-specific patterns and strategies
- No interference from experiences in other worlds
- Contextual knowledge retention

### 🔒 Memory Safety
- Prevents cross-contamination between worlds
- Maintains clean separation of experiences
- Enables controlled experimentation

### 📊 Better Analytics
- Track learning progress per world
- Compare performance across different seeds
- Identify world-specific challenges

### 🚀 Scalability
- Support for unlimited worlds
- Automatic cleanup of inactive namespaces
- Efficient memory usage

## Testing

Run the memory versioning tests:
```bash
cd packages/memory
pnpm test memory-versioning.test.ts
```

Run the demo script:
```bash
cd packages/minecraft-interface
pnpm tsx bin/memory-versioning-demo.ts
```

## Future Enhancements

### Planned Features
- **Memory Migration**: Transfer memories between worlds
- **Cross-World Learning**: Selective knowledge sharing
- **Memory Compression**: Efficient storage for large worlds
- **Backup/Restore**: Persist memory namespaces to disk

### Advanced Isolation
- **Biome-Based Separation**: Separate memories by biome type
- **Difficulty-Based Isolation**: Different memory contexts per difficulty
- **Time-Based Versioning**: Memory snapshots at different time points

## Troubleshooting

### Common Issues

**Memory namespace not activating**
- Check memory service is running on port 3001
- Verify WORLD_SEED environment variable is set
- Check network connectivity between services

**Cross-contamination between worlds**
- Ensure different WORLD_SEED values for different worlds
- Verify namespace activation is successful
- Check memory service logs for errors

**Memory service unavailable**
- System continues without memory integration
- Bot operates with local memory only
- Check memory service health endpoint

### Debug Commands
```bash
# Check memory service status
curl http://localhost:3001/health

# Get active namespace
curl http://localhost:3001/versioning/active

# Get memory statistics
curl http://localhost:3001/stats
```

---

**Author**: @darianrosebrook

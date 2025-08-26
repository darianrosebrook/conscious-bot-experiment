# Bot Testing Guide

Comprehensive testing framework for the Minecraft bot's capabilities including movement, mining, building, crafting, and other interactions.

## Overview

The bot testing framework provides multiple ways to test the bot's capabilities:

1. **Automated Test Suite** - Comprehensive testing of all bot actions
2. **Manual Testing** - Interactive testing of individual actions
3. **Command Line Testing** - Quick curl-based testing
4. **Individual Action Testing** - Direct API calls

## Prerequisites

Before running tests, ensure:

1. **Minecraft Server** is running and accessible
2. **Bot Server** is running on port 3005 (default)
3. **Bot is Connected** to the Minecraft server

### Quick Setup

```bash
# Start the bot server
cd packages/minecraft-interface
pnpm dev:server

# In another terminal, connect the bot
curl -X POST http://localhost:3005/connect

# Check bot status
curl -s http://localhost:3005/status | jq '.'
```

## Testing Tools

### 1. Automated Test Suite

The comprehensive test suite runs all available bot actions and generates detailed reports.

#### Usage

```bash
# Run all tests
pnpm test:bot

# Run tests and save results
pnpm test:bot:save

# Run tests with custom output file
pnpm test:bot:all
```

#### Test Suites

The automated test suite includes:

- **Movement & Navigation** - Walking, turning, jumping, pathfinding
- **Mining & Resource Gathering** - Breaking blocks, collecting items
- **Building & Construction** - Placing blocks, finding shelter
- **Crafting & Item Creation** - 2x2 and 3x3 crafting
- **Interaction & Communication** - Chat, entity interaction
- **Exploration & Discovery** - Environmental scanning
- **Survival & Sustenance** - Food consumption, health management

#### Output

The test suite generates:
- Console output with real-time results
- JSON file with detailed test results
- Markdown report with summary and analysis

### 2. Manual Testing

Interactive testing tool for testing individual actions with a menu interface.

#### Usage

```bash
# Start interactive tester
pnpm test:manual

# Use custom bot URL
pnpm test:manual http://localhost:3005
```

#### Features

- Menu-driven interface
- Real-time action execution
- Detailed result display
- Connection status checking

### 3. Command Line Testing

Quick curl-based testing for rapid action verification.

#### Usage

```bash
# Show all available curl commands
pnpm test:curl

# Run quick basic tests
pnpm test:curl:quick

# Use custom bot URL
./bin/test-curl.sh http://localhost:3005
```

#### Quick Examples

```bash
# Test movement
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"move_forward","parameters":{"distance":3}}' | jq '.'

# Test chat
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"chat","parameters":{"message":"Hello!"}}' | jq '.'

# Test mining
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"mine_block","parameters":{"position":"current","blockType":"dirt"}}' | jq '.'
```

## Available Actions

### Movement Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `move_forward` | Move forward | `distance` (number) |
| `turn_left` | Turn left | None |
| `turn_right` | Turn right | None |
| `jump` | Jump | None |
| `navigate` | Pathfind to position | `target` (Vec3), `range` (number) |
| `look_at` | Look in direction | `direction` (string) or `target` (Vec3) |

### Mining Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `mine_block` | Mine specific block | `position` (Vec3), `blockType` (string), `tool` (string) |
| `dig_blocks` | General digging | `position` (string), `tool` (string) |
| `collect_items` | Pick up items | `radius` (number) |

### Building Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `place_block` | Place block | `block_type` (string), `count` (number), `placement` (string) |
| `find_shelter` | Find/build shelter | `shelter_type` (string), `light_sources` (boolean), `search_radius` (number) |

### Crafting Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `craft_item` | Craft item | `item` (string), `quantity` (number) |
| `craft` | Craft with table | `item` (string), `amount` (number), `useCraftingTable` (boolean) |

### Interaction Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `chat` | Send message | `message` (string) |
| `attack_entity` | Attack entity | `target` (string) |
| `harvest_crops` | Harvest crops | `position` (string), `tool` (string) |

### Survival Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `consume_food` | Eat food | `food_type` (string), `amount` (number) |
| `experiment_with_item` | Test item | `item_type` (string), `action` (string) |
| `explore_item_properties` | Analyze item | `item_type` (string), `properties_to_test` (array) |

### Exploration Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `scan_for_trees` | Find trees | None |
| `scan_for_animals` | Find animals | None |
| `analyze_biome_resources` | Analyze biome | None |
| `scan_tree_structure` | Analyze tree | None |

## Testing Scenarios

### Basic Movement Test

```bash
# Test basic movement capabilities
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"move_forward","parameters":{"distance":5}}'

curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"turn_left","parameters":{}}'

curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"jump","parameters":{}}'
```

### Mining Test

```bash
# Test mining capabilities
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"mine_block","parameters":{"position":"current","blockType":"dirt"}}'

curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"mine_block","parameters":{"position":"current","blockType":"stone","tool":"pickaxe"}}'
```

### Building Test

```bash
# Test building capabilities
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"place_block","parameters":{"block_type":"dirt","count":1,"placement":"around_player"}}'

curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"place_block","parameters":{"block_type":"torch","count":1,"placement":"around_player"}}'
```

### Crafting Test

```bash
# Test crafting capabilities
curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"craft_item","parameters":{"item":"stick","quantity":4}}'

curl -X POST http://localhost:3005/action \
  -H 'Content-Type: application/json' \
  -d '{"type":"craft_item","parameters":{"item":"wooden_pickaxe","quantity":1}}'
```

## Troubleshooting

### Common Issues

1. **Bot not connected**
   ```bash
   # Check connection status
   curl -s http://localhost:3005/status | jq '.'
   
   # Connect bot if needed
   curl -X POST http://localhost:3005/connect
   ```

2. **Action fails with timeout**
   - Check if the bot has necessary items in inventory
   - Verify the target position is reachable
   - Ensure the bot has appropriate tools

3. **Server not responding**
   ```bash
   # Check if server is running
   curl -s http://localhost:3005/health
   
   # Restart server if needed
   pnpm dev:server
   ```

### Debug Information

```bash
# Get detailed bot state
curl -s http://localhost:3005/state | jq '.'

# Get inventory contents
curl -s http://localhost:3005/inventory | jq '.'

# Get telemetry data
curl -s http://localhost:3005/telemetry | jq '.'
```

## Advanced Testing

### Custom Test Scripts

You can create custom test scripts using the BotTestSuite class:

```typescript
import BotTestSuite from './src/bot-test-suite';

const testSuite = new BotTestSuite('http://localhost:3005');

// Run specific test suites
const results = await testSuite.runTestSuite(testSuite.getMovementTests());

// Save results
await testSuite.saveResults(results, 'custom-test-results.json');
```

### Integration with CI/CD

The test suite can be integrated into continuous integration:

```yaml
# Example GitHub Actions workflow
- name: Test Bot Capabilities
  run: |
    cd packages/minecraft-interface
    pnpm test:bot:all
```

## Performance Testing

### Load Testing

```bash
# Test multiple actions rapidly
for i in {1..10}; do
  curl -X POST http://localhost:3005/action \
    -H 'Content-Type: application/json' \
    -d '{"type":"move_forward","parameters":{"distance":1}}' &
done
wait
```

### Stress Testing

```bash
# Run comprehensive test suite multiple times
for i in {1..5}; do
  echo "Test run $i"
  pnpm test:bot:save --output="stress-test-$i.json"
done
```

## Best Practices

1. **Always check bot status** before running tests
2. **Use appropriate timeouts** for different action types
3. **Test in isolated environments** to avoid interference
4. **Save test results** for analysis and debugging
5. **Test both success and failure scenarios**
6. **Verify bot inventory** before testing crafting actions
7. **Use the manual tester** for interactive debugging

## Contributing

To add new test cases:

1. Add action templates to the appropriate test suite method
2. Update the action translator if needed
3. Add corresponding curl commands to the test script
4. Update this documentation

## Support

For issues with the testing framework:

1. Check the bot server logs
2. Verify Minecraft server connectivity
3. Review the action translator implementation
4. Check the bot's current state and inventory

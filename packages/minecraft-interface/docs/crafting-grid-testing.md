# Crafting Grid Testing System

## Overview

The crafting grid testing system validates the bot's ability to experiment with 2x2 and 3x3 crafting grids in Minecraft. This system tests the bot's capacity for recipe discovery, crafting table usage, and systematic experimentation.

## Features

### Grid Size Testing
- **2x2 Grid**: Basic crafting without external tools
- **3x3 Grid**: Advanced crafting requiring crafting table
- **Mixed Testing**: Comprehensive testing of both grid sizes

### Experimentation Capabilities
- Recipe discovery and learning
- Material optimization
- Crafting table integration
- Systematic experimentation approaches
- Learning progress tracking

### Test Scenarios

#### 1. Basic Crafting Grid Experiment (`crafting-grid-basic.yaml`)
- **Tier**: 1 (Beginner)
- **Focus**: Fundamental crafting mechanics
- **Duration**: 45 seconds
- **Complexity**: Low

**Experiments**:
- Planks from logs (2x2)
- Crafting table creation (2x2)
- Furnace creation (3x3)

#### 2. Standard Crafting Grid Experiment (`crafting-grid-experiment.yaml`)
- **Tier**: 2 (Intermediate)
- **Focus**: Recipe discovery and crafting table usage
- **Duration**: 60 seconds
- **Complexity**: Medium

**Experiments**:
- Planks, sticks, torches (2x2)
- Crafting table, furnace, iron pickaxe (3x3)

#### 3. Advanced Crafting Grid Experiment (`crafting-grid-advanced.yaml`)
- **Tier**: 3 (Advanced)
- **Focus**: Comprehensive experimentation and learning
- **Duration**: 90 seconds
- **Complexity**: High

**Experiments**:
- 9 different recipes across both grid sizes
- Complex recipes like beds and glass panes
- Systematic learning progression

## Test Scripts

### 1. Basic Test Runner (`test-crafting-grid.ts`)
```bash
npm run test:crafting:basic
```

**Features**:
- Basic scenario validation
- Simple success/failure reporting
- Precondition checking

### 2. Advanced Test Runner (`test-crafting-grid-advanced.ts`)
```bash
npm run test:crafting:advanced
```

**Features**:
- Comprehensive experimentation tracking
- Detailed learning progress monitoring
- Material usage analysis
- Phase-based testing
- Advanced success metrics

### 3. Interactive Demo (`demo-crafting-grid.ts`)
```bash
npm run demo:crafting
```

**Features**:
- Real-time experimentation display
- Interactive inventory monitoring
- Learning progress visualization
- Success rate calculation

## Usage

### Running Tests

1. **Basic Test**:
   ```bash
   cd packages/minecraft-interface
   npm run test:crafting:basic
   ```

2. **Advanced Test**:
   ```bash
   npm run test:crafting:advanced
   ```

3. **Interactive Demo**:
   ```bash
   npm run demo:crafting
   ```

4. **Custom Scenario**:
   ```bash
   npx tsx bin/test-crafting-grid-advanced.ts path/to/custom-scenario.yaml
   ```

### Prerequisites

Before running tests, ensure the bot has the required materials:

**Basic Test Requirements**:
- Bot health: ≥ 15
- Logs: ≥ 2
- Cobblestone: ≥ 4

**Advanced Test Requirements**:
- Bot health: ≥ 18
- Logs: ≥ 8
- Sticks: ≥ 4
- Cobblestone: ≥ 16
- Iron ingots: ≥ 6
- Coal: ≥ 3
- String: ≥ 2
- Wool: ≥ 1
- Glass: ≥ 1

## Test Structure

### Scenario Format

Each scenario is defined in YAML format with the following structure:

```yaml
name: "Scenario Name"
description: "Scenario description"
timeout: 90000
tags: ["tier3", "crafting", "experimentation"]

preconditions:
  bot_spawned: true
  bot_health: ">= 18"
  inventory_logs: ">= 8"

success_conditions:
  crafting_experiments_completed: ">= 5"
  recipes_discovered: ">= 4"
  crafting_table_used: true

crafting_experiments:
  - name: "experiment_name"
    recipe: "item_name"
    input_items:
      - item: "material"
        count: 1
    output_item: "result"
    output_count: 4
    uses_crafting_table: false
    grid_size: "2x2"
    difficulty: "easy"

experiment_phases:
  phase_1:
    name: "Phase Name"
    description: "Phase description"
    experiments: ["experiment_name"]
    success_criteria:
      completed_experiments: ">= 1"
```

### Learning Objectives

The system tracks progress on various learning objectives:

- **2x2 Grid Understanding**: Mastery of basic crafting mechanics
- **3x3 Grid Understanding**: Advanced crafting patterns
- **Crafting Table Usage**: Infrastructure utilization
- **Recipe Discovery**: Learning new crafting patterns
- **Resource Optimization**: Efficient material usage
- **Systematic Experimentation**: Methodical approach to discovery

## Success Metrics

### Quantitative Metrics
- Number of experiments completed
- Number of recipes discovered
- Execution time
- Success rate percentage
- Resource efficiency

### Qualitative Metrics
- Grid size understanding
- Crafting table integration
- Learning progression
- Experimentation quality
- Problem-solving approach

## Error Handling

The system handles various failure scenarios:

- **Insufficient Materials**: Missing required crafting ingredients
- **Crafting Table Not Found**: No crafting table for 3x3 recipes
- **Recipe Not Found**: Unknown or invalid recipes
- **Execution Timeout**: Operations taking too long
- **Bot Health Issues**: Low health preventing safe operation

## Integration with Planning System

The crafting grid testing integrates with the broader planning system:

1. **Goal Formulation**: Planning system generates crafting goals
2. **Action Translation**: Converts high-level goals to Minecraft actions
3. **Execution Monitoring**: Tracks progress and success
4. **Learning Integration**: Updates knowledge base with discovered recipes

## Future Enhancements

### Planned Features
- **Recipe Database**: Persistent storage of discovered recipes
- **Pattern Recognition**: Learning crafting patterns automatically
- **Advanced Materials**: Testing with complex material combinations
- **Multi-Player Testing**: Collaborative crafting scenarios
- **Performance Optimization**: Faster execution and better resource management

### Research Areas
- **Cognitive Load Analysis**: Understanding bot's learning capacity
- **Error Recovery**: Improving failure handling and recovery
- **Adaptive Difficulty**: Dynamic scenario adjustment based on performance
- **Cross-Scenario Learning**: Knowledge transfer between different scenarios

## Troubleshooting

### Common Issues

1. **Bot Not Connecting**:
   - Check Minecraft server is running
   - Verify host/port configuration
   - Ensure bot username is available

2. **Missing Materials**:
   - Check inventory requirements in scenario
   - Ensure bot has gathered necessary resources
   - Verify material names match Minecraft items

3. **Crafting Table Issues**:
   - Ensure crafting table is placed nearby
   - Check bot can reach the crafting table
   - Verify crafting table is not obstructed

4. **Recipe Failures**:
   - Check recipe names match Minecraft items
   - Verify material combinations are correct
   - Ensure bot has required crafting permissions

### Debug Mode

Enable verbose logging for detailed debugging:

```bash
npm run test:crafting:advanced -- --verbose
```

## Contributing

To add new crafting scenarios:

1. Create a new YAML scenario file
2. Define experiments and success criteria
3. Add appropriate test scripts
4. Update documentation
5. Test thoroughly before submission

## References

- [Minecraft Crafting Guide](https://minecraft.fandom.com/wiki/Crafting)
- [Mineflayer Documentation](https://github.com/PrismarineJS/mineflayer)
- [Conscious Bot Planning System](../planning/README.md)

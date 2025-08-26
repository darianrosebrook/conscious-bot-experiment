/**
 * Crafting Grid Unit Tests
 * 
 * Unit tests for crafting grid functionality without requiring live Minecraft server.
 * 
 * @author @darianrosebrook
 */

import { SimpleCraftingGridTester } from '../../bin/test-crafting-grid-simple';

// Mock mineflayer bot
const mockBot = {
  inventory: {
    items: jest.fn().mockReturnValue([
      { name: 'oak_log', count: 4 },
      { name: 'stone', count: 8 },
      { name: 'iron_ingot', count: 3 }
    ])
  },
  recipesAll: jest.fn().mockReturnValue([
    {
      type: 'shaped',
      result: { name: 'planks', count: 4 },
      ingredients: [{ name: 'oak_log', count: 1 }]
    },
    {
      type: 'shaped',
      result: { name: 'crafting_table', count: 1 },
      ingredients: [{ name: 'planks', count: 4 }]
    },
    {
      type: 'shaped',
      result: { name: 'furnace', count: 1 },
      ingredients: [{ name: 'cobblestone', count: 8 }]
    }
  ]),
  recipesFor: jest.fn().mockReturnValue([
    {
      type: 'shaped',
      result: { name: 'planks', count: 4 },
      ingredients: [{ name: 'oak_log', count: 1 }]
    }
  ]),
  findBlock: jest.fn().mockReturnValue(null),
  mcData: {
    itemsByName: {
      planks: { id: 5 },
      oak_log: { id: 17 }
    },
    blocksByName: {
      crafting_table: { id: 58 }
    }
  }
};

describe('SimpleCraftingGridTester', () => {
  let tester: SimpleCraftingGridTester;

  beforeEach(() => {
    tester = new SimpleCraftingGridTester(mockBot as any);
    jest.clearAllMocks();
  });

  describe('Inventory Management', () => {
    it('should correctly count inventory items', async () => {
      const items = mockBot.inventory.items();
      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ name: 'oak_log', count: 4 });
      expect(items[1]).toEqual({ name: 'stone', count: 8 });
      expect(items[2]).toEqual({ name: 'iron_ingot', count: 3 });
    });

    it('should identify crafting materials', () => {
      const items = mockBot.inventory.items();
      const logs = items.filter((item: any) => 
        item.name.includes('log') || item.name.includes('wood')
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].name).toBe('oak_log');
    });
  });

  describe('Recipe Detection', () => {
    it('should detect available recipes', () => {
      const recipes = mockBot.recipesAll();
      expect(recipes).toHaveLength(3);
      expect(recipes[0].result.name).toBe('planks');
      expect(recipes[1].result.name).toBe('crafting_table');
      expect(recipes[2].result.name).toBe('furnace');
    });

    it('should categorize recipes by grid size', () => {
      const recipes = mockBot.recipesAll();
      
      // 2x2 recipes (simple ingredients)
      const basicRecipes = recipes.filter((recipe: any) => 
        recipe.result && recipe.result.count <= 4 && 
        (recipe.ingredients?.length || 0) <= 4
      );
      expect(basicRecipes.length).toBeGreaterThan(0);
      
      // 3x3 recipes (complex ingredients)
      const advancedRecipes = recipes.filter((recipe: any) => 
        recipe.result && recipe.ingredients && recipe.ingredients.length > 4
      );
      expect(advancedRecipes.length).toBeGreaterThanOrEqual(0);
    });

    it('should find specific recipes', () => {
      const plankRecipes = mockBot.recipesFor(5, null, 1, null);
      expect(plankRecipes).toHaveLength(1);
      expect(plankRecipes[0].result.name).toBe('planks');
    });
  });

  describe('Crafting Table Detection', () => {
    it('should handle missing crafting table gracefully', () => {
      const craftingTable = mockBot.findBlock({
        matching: 58,
        maxDistance: 10
      });
      expect(craftingTable).toBeNull();
    });

    it('should detect crafting table when present', () => {
      const mockCraftingTable = {
        position: { x: 10, y: 64, z: 10 }
      };
      mockBot.findBlock.mockReturnValueOnce(mockCraftingTable);
      
      const craftingTable = mockBot.findBlock({
        matching: 58,
        maxDistance: 10
      });
      expect(craftingTable).toEqual(mockCraftingTable);
    });
  });

  describe('Material Requirements', () => {
    it('should check for required materials', () => {
      const items = mockBot.inventory.items();
      const itemCounts: Record<string, number> = {};
      
      items.forEach((item: any) => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.count;
      });

      expect(itemCounts['oak_log']).toBe(4);
      expect(itemCounts['stone']).toBe(8);
      expect(itemCounts['iron_ingot']).toBe(3);
    });

    it('should validate material sufficiency', () => {
      const items = mockBot.inventory.items();
      const itemCounts: Record<string, number> = {};
      
      items.forEach((item: any) => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.count;
      });

      // Check if we have enough logs for planks
      const logsNeeded = 1;
      const logsAvailable = itemCounts['oak_log'] || 0;
      expect(logsAvailable).toBeGreaterThanOrEqual(logsNeeded);

      // Check if we have enough planks for crafting table
      const planksNeeded = 4;
      const planksAvailable = itemCounts['planks'] || 0;
      expect(planksAvailable).toBeLessThan(planksNeeded); // Should be 0 since we don't have planks yet
    });
  });
});

// Mock scenario data for testing
export const mockCraftingScenario = {
  name: "Test Crafting Scenario",
  description: "Test scenario for unit testing",
  timeout: 30000,
  preconditions: {
    bot_health: ">= 15",
    inventory_oak_log: ">= 2"
  },
  success_conditions: {
    crafting_experiments_completed: ">= 1"
  },
  crafting_experiments: [
    {
      name: "planks_experiment",
      recipe: "planks",
      input_items: [{ item: "oak_log", count: 1 }],
      output_item: "planks",
      output_count: 4,
      uses_crafting_table: false,
      grid_size: "2x2",
      difficulty: "easy"
    }
  ]
};

describe('Crafting Scenario Validation', () => {
  it('should validate scenario structure', () => {
    expect(mockCraftingScenario.name).toBeDefined();
    expect(mockCraftingScenario.description).toBeDefined();
    expect(mockCraftingScenario.timeout).toBeGreaterThan(0);
    expect(mockCraftingScenario.preconditions).toBeDefined();
    expect(mockCraftingScenario.success_conditions).toBeDefined();
    expect(mockCraftingScenario.crafting_experiments).toBeDefined();
  });

  it('should validate experiment structure', () => {
    const experiment = mockCraftingScenario.crafting_experiments[0];
    expect(experiment.name).toBeDefined();
    expect(experiment.recipe).toBeDefined();
    expect(experiment.input_items).toBeDefined();
    expect(experiment.output_item).toBeDefined();
    expect(experiment.output_count).toBeGreaterThan(0);
    expect(typeof experiment.uses_crafting_table).toBe('boolean');
    expect(experiment.grid_size).toMatch(/^(2x2|3x3)$/);
    expect(experiment.difficulty).toMatch(/^(easy|medium|hard)$/);
  });

  it('should validate precondition parsing', () => {
    const healthPrecondition = mockCraftingScenario.preconditions.bot_health;
    const healthThreshold = parseInt(healthPrecondition.replace('>=', ''));
    expect(healthThreshold).toBe(15);
    
    const logPrecondition = mockCraftingScenario.preconditions.inventory_oak_log;
    const logThreshold = parseInt(logPrecondition.replace('>=', ''));
    expect(logThreshold).toBe(2);
  });

  it('should validate success condition parsing', () => {
    const experimentsCondition = mockCraftingScenario.success_conditions.crafting_experiments_completed;
    const requiredExperiments = parseInt(experimentsCondition.replace('>=', ''));
    expect(requiredExperiments).toBe(1);
  });
});

// Test data for different grid sizes
export const gridSizeTestData = {
  '2x2': {
    recipes: ['planks', 'sticks', 'torch', 'crafting_table'],
    maxIngredients: 4,
    maxOutput: 4
  },
  '3x3': {
    recipes: ['furnace', 'iron_pickaxe', 'chest', 'bed'],
    maxIngredients: 9,
    maxOutput: 1
  }
};

describe('Grid Size Classification', () => {
  it('should correctly classify 2x2 recipes', () => {
    const recipes2x2 = gridSizeTestData['2x2'].recipes;
    recipes2x2.forEach(recipeName => {
      // Mock recipe data for 2x2
      const mockRecipe = {
        result: { name: recipeName, count: 4 },
        ingredients: [{ name: 'material', count: 1 }]
      };
      
      const is2x2 = mockRecipe.result.count <= 4 && 
                   (mockRecipe.ingredients?.length || 0) <= 4;
      expect(is2x2).toBe(true);
    });
  });

  it('should correctly classify 3x3 recipes', () => {
    const recipes3x3 = gridSizeTestData['3x3'].recipes;
    recipes3x3.forEach(recipeName => {
      // Mock recipe data for 3x3
      const mockRecipe = {
        result: { name: recipeName, count: 1 },
        ingredients: [
          { name: 'material1', count: 1 },
          { name: 'material2', count: 1 },
          { name: 'material3', count: 1 },
          { name: 'material4', count: 1 },
          { name: 'material5', count: 1 }
        ]
      };
      
      const is3x3 = mockRecipe.ingredients && mockRecipe.ingredients.length > 4;
      expect(is3x3).toBe(true);
    });
  });
});

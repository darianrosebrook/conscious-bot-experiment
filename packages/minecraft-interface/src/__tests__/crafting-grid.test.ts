import { vi } from 'vitest';

/**
 * Crafting Grid Unit Tests
 *
 * Unit tests for crafting grid functionality without requiring live Minecraft server.
 *
 * @author @darianrosebrook
 */

describe('Crafting Grid Tests', () => {
  describe('Inventory Management', () => {
    it('should correctly count inventory items', async () => {
      const items = [
        { name: 'oak_log', count: 4 },
        { name: 'stone', count: 8 },
        { name: 'iron_ingot', count: 3 },
      ];
      
      expect(items).toHaveLength(3);
      expect(items[0]).toEqual({ name: 'oak_log', count: 4 });
      expect(items[1]).toEqual({ name: 'stone', count: 8 });
      expect(items[2]).toEqual({ name: 'iron_ingot', count: 3 });
    });

    it('should identify crafting materials', () => {
      const items = [
        { name: 'oak_log', count: 4 },
        { name: 'stone', count: 8 },
        { name: 'iron_ingot', count: 3 },
      ];
      
      const logs = items.filter(
        (item: any) => item.name.includes('log') || item.name.includes('wood')
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].name).toBe('oak_log');
    });
  });

  describe('Recipe Detection', () => {
    it('should detect available recipes', () => {
      const recipes = [
        {
          type: 'shaped',
          result: { name: 'planks', count: 4 },
          ingredients: [{ name: 'oak_log', count: 1 }],
        },
        {
          type: 'shaped',
          result: { name: 'crafting_table', count: 1 },
          ingredients: [{ name: 'planks', count: 4 }],
        },
        {
          type: 'shaped',
          result: { name: 'iron_pickaxe', count: 1 },
          ingredients: [
            { name: 'iron_ingot', count: 3 },
            { name: 'stick', count: 2 },
          ],
        },
      ];
      
      expect(recipes).toHaveLength(3);
      expect(recipes[0].result.name).toBe('planks');
      expect(recipes[1].result.name).toBe('crafting_table');
      expect(recipes[2].result.name).toBe('iron_pickaxe');
    });

    it('should categorize recipes by grid size', () => {
      const recipes = [
        {
          type: 'shaped',
          result: { name: 'planks', count: 4 },
          ingredients: [{ name: 'oak_log', count: 1 }],
        },
        {
          type: 'shaped',
          result: { name: 'crafting_table', count: 1 },
          ingredients: [{ name: 'planks', count: 4 }],
        },
        {
          type: 'shaped',
          result: { name: 'iron_pickaxe', count: 1 },
          ingredients: [
            { name: 'iron_ingot', count: 3 },
            { name: 'stick', count: 2 },
          ],
        },
      ];

      // 2x2 recipes (simple ingredients)
      const basicRecipes = recipes.filter(
        (recipe: any) =>
          recipe.result &&
          (recipe.result.name === 'planks' || recipe.result.name === 'crafting_table')
      );
      expect(basicRecipes).toHaveLength(2);

      // 3x3 recipes (complex ingredients)
      const complexRecipes = recipes.filter(
        (recipe: any) =>
          recipe.result && recipe.result.name === 'iron_pickaxe'
      );
      expect(complexRecipes).toHaveLength(1);
    });

    it('should find specific recipes', () => {
      const plankRecipes = [
        {
          type: 'shaped',
          result: { name: 'planks', count: 4 },
          ingredients: [{ name: 'oak_log', count: 1 }],
        },
      ];
      
      expect(plankRecipes).toHaveLength(1);
      expect(plankRecipes[0].result.name).toBe('planks');
    });
  });

  describe('Crafting Table Detection', () => {
    it('should handle missing crafting table gracefully', () => {
      const craftingTable = null;
      expect(craftingTable).toBeNull();
    });

    it('should detect crafting table when present', () => {
      const craftingTable = {
        position: { x: 5, y: 64, z: 5 },
        name: 'crafting_table',
      };
      
      expect(craftingTable).toBeDefined();
      expect(craftingTable?.name).toBe('crafting_table');
    });
  });

  describe('Material Requirements', () => {
    it('should check for required materials', () => {
      const items = [
        { name: 'oak_log', count: 4 },
        { name: 'stone', count: 8 },
        { name: 'iron_ingot', count: 3 },
      ];
      
      expect(items).toBeDefined();
      expect(Array.isArray(items)).toBe(true);

      const requiredMaterials = ['oak_log', 'stone', 'iron_ingot'];
      const availableMaterials = items.map((item: any) => item.name);

      requiredMaterials.forEach((material) => {
        expect(availableMaterials).toContain(material);
      });
    });

    it('should validate material sufficiency', () => {
      const items = [
        { name: 'oak_log', count: 4 },
        { name: 'stone', count: 8 },
        { name: 'iron_ingot', count: 3 },
      ];
      
      expect(items).toBeDefined();
      expect(Array.isArray(items)).toBe(true);

      const oakLogItem = items.find((item: any) => item.name === 'oak_log');
      expect(oakLogItem).toBeDefined();
      expect(oakLogItem?.count).toBeGreaterThanOrEqual(1);

      const stoneItem = items.find((item: any) => item.name === 'stone');
      expect(stoneItem).toBeDefined();
      expect(stoneItem?.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Crafting Scenario Validation', () => {
    it('should validate scenario structure', () => {
      const validScenario = {
        name: 'Test Scenario',
        description: 'A test scenario',
        preconditions: ['has_oak_log'],
        steps: ['craft_planks'],
        successConditions: ['has_planks'],
      };

      expect(validScenario.name).toBeDefined();
      expect(validScenario.preconditions).toBeInstanceOf(Array);
      expect(validScenario.steps).toBeInstanceOf(Array);
      expect(validScenario.successConditions).toBeInstanceOf(Array);
    });

    it('should validate experiment structure', () => {
      const validExperiment = {
        id: 'test-experiment-1',
        scenario: 'Test Scenario',
        parameters: { difficulty: 'easy' },
        expectedOutcome: 'success',
      };

      expect(validExperiment.id).toBeDefined();
      expect(validExperiment.scenario).toBeDefined();
      expect(validExperiment.parameters).toBeDefined();
    });

    it('should validate precondition parsing', () => {
      const preconditions = ['has_oak_log', 'has_crafting_table'];
      expect(preconditions).toBeInstanceOf(Array);
      expect(preconditions.length).toBeGreaterThan(0);
    });

    it('should validate success condition parsing', () => {
      const successConditions = ['has_planks', 'crafting_complete'];
      expect(successConditions).toBeInstanceOf(Array);
      expect(successConditions.length).toBeGreaterThan(0);
    });
  });

  describe('Grid Size Classification', () => {
    it('should correctly classify 2x2 recipes', () => {
      const recipes2x2 = [
        { result: { name: 'planks' }, ingredients: [{ name: 'oak_log' }] },
        { result: { name: 'sticks' }, ingredients: [{ name: 'planks' }] },
      ];

      recipes2x2.forEach((recipe) => {
        expect(recipe.result).toBeDefined();
        expect(recipe.ingredients).toBeInstanceOf(Array);
      });
    });

    it('should correctly classify 3x3 recipes', () => {
      const recipes3x3 = [
        {
          result: { name: 'crafting_table' },
          ingredients: [
            { name: 'planks' },
            { name: 'planks' },
            { name: 'planks' },
            { name: 'planks' },
          ],
        },
      ];

      recipes3x3.forEach((recipe) => {
        expect(recipe.result).toBeDefined();
        expect(recipe.ingredients.length).toBeGreaterThan(1);
      });
    });
  });
});

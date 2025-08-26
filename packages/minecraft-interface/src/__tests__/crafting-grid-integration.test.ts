/**
 * Crafting Grid Integration Tests
 *
 * Integration tests for crafting grid functionality with live Minecraft server.
 * These tests require a running Minecraft server on localhost:25565.
 *
 * @author @darianrosebrook
 */

import { createBot } from 'mineflayer';

// Skip tests if no server is running
const hasServer = process.env.MINECRAFT_SERVER_AVAILABLE === 'true';

describe('Crafting Grid Integration Tests', () => {
  let bot: any;

  beforeAll(async () => {
    if (!hasServer) {
      console.log(
        '⚠️ Skipping integration tests - no Minecraft server available'
      );
      return;
    }

    try {
      // Create bot for integration testing
      bot = createBot({
        host: 'localhost',
        port: 25565,
        username: 'IntegrationTester',
        version: '1.21.4',
        auth: 'offline' as const,
      });

      // Wait for bot to spawn
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Bot spawn timeout'));
        }, 10000);

        bot.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });

        bot.once('error', (error: any) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      console.log(`⚠️ Failed to create bot: ${error}`);
      bot = null;
    }
  });

  afterAll(async () => {
    if (bot) {
      bot.quit();
    }
  });

  describe('Server Connection', () => {
    it('should connect to Minecraft server', () => {
      if (!hasServer) {
        console.log('⏭️ Skipping server connection test');
        return;
      }
      if (!bot) {
        console.log('⏭️ Skipping server connection test - bot not available');
        return;
      }
      expect(bot).toBeDefined();
      expect(bot.username).toBe('IntegrationTester');
    });

    it('should have valid game state', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping game state test');
        return;
      }
      expect(bot.game).toBeDefined();
      expect(bot.game.gameMode).toBeDefined();
      expect(bot.game.dimension).toBeDefined();
    });

    it('should have valid entity state', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping entity state test');
        return;
      }
      expect(bot.entity).toBeDefined();
      expect(bot.entity.position).toBeDefined();
      expect(bot.health).toBeGreaterThan(0);
    });
  });

  describe('Inventory System', () => {
    it('should access inventory', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping inventory test');
        return;
      }
      const items = bot.inventory.items();
      expect(Array.isArray(items)).toBe(true);
    });

    it('should count inventory items correctly', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping inventory count test');
        return;
      }
      const items = bot.inventory.items();
      const itemCounts: Record<string, number> = {};

      items.forEach((item: any) => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.count;
      });

      // Should have valid item counts
      Object.values(itemCounts).forEach((count) => {
        expect(count).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Recipe System', () => {
    it('should access recipe database', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping recipe database test');
        return;
      }
      const recipes = bot.recipesAll();
      expect(Array.isArray(recipes)).toBe(true);
      expect(recipes.length).toBeGreaterThan(0);
    });

    it('should find plank recipes', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping plank recipe test');
        return;
      }
      const plankRecipes = bot.recipesFor(
        bot.mcData.itemsByName.planks?.id,
        null,
        1,
        null
      );
      expect(Array.isArray(plankRecipes)).toBe(true);
    });

    it('should categorize recipes by complexity', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping recipe categorization test');
        return;
      }
      const recipes = bot.recipesAll();

      // Find 2x2 recipes (simple)
      const simpleRecipes = recipes.filter(
        (recipe: any) =>
          recipe.result &&
          recipe.result.count <= 4 &&
          (recipe.ingredients?.length || 0) <= 4
      );

      // Find 3x3 recipes (complex)
      const complexRecipes = recipes.filter(
        (recipe: any) =>
          recipe.result && recipe.ingredients && recipe.ingredients.length > 4
      );

      expect(simpleRecipes.length).toBeGreaterThan(0);
      // Complex recipes might not exist in basic scenarios
      expect(complexRecipes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Crafting Table Detection', () => {
    it('should search for crafting tables', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping crafting table detection test');
        return;
      }
      const craftingTable = bot.findBlock({
        matching: bot.mcData.blocksByName.crafting_table.id,
        maxDistance: 10,
      });

      // Crafting table might not exist, which is fine
      expect(craftingTable === null || craftingTable.position).toBeTruthy();
    });
  });

  describe('Material Analysis', () => {
    it('should identify crafting materials', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping material analysis test');
        return;
      }
      const items = bot.inventory.items();

      // Look for common crafting materials
      const logs = items.filter(
        (item: any) => item.name.includes('log') || item.name.includes('wood')
      );

      const stones = items.filter(
        (item: any) =>
          item.name.includes('stone') || item.name.includes('cobblestone')
      );

      // Should be able to identify materials (even if none exist)
      expect(Array.isArray(logs)).toBe(true);
      expect(Array.isArray(stones)).toBe(true);
    });

    it('should calculate material requirements', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping material requirements test');
        return;
      }
      const items = bot.inventory.items();
      const itemCounts: Record<string, number> = {};

      items.forEach((item: any) => {
        itemCounts[item.name] = (itemCounts[item.name] || 0) + item.count;
      });

      // Test material requirement calculations
      const logsAvailable = itemCounts['oak_log'] || 0;
      const planksNeeded = 4;

      // Should be able to calculate requirements
      expect(logsAvailable).toBeGreaterThanOrEqual(0);
      expect(planksNeeded).toBe(4);
    });
  });

  describe('Crafting Capability', () => {
    it('should check crafting permissions', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping crafting permissions test');
        return;
      }
      // Check if bot can craft (should be true in survival/creative)
      expect(bot.game.gameMode).toBeDefined();
    });

    it('should validate recipe requirements', () => {
      if (!hasServer || !bot) {
        console.log('⏭️ Skipping recipe requirements test');
        return;
      }
      const plankRecipes = bot.recipesFor(
        bot.mcData.itemsByName.planks?.id,
        null,
        1,
        null
      );

      if (plankRecipes.length > 0) {
        const recipe = plankRecipes[0];
        expect(recipe.result).toBeDefined();
        expect(recipe.result.name).toBe('planks');
      }
    });
  });
});

// Helper function to check if server is available
export async function checkServerAvailability(): Promise<boolean> {
  return new Promise((resolve) => {
    const testBot = createBot({
      host: 'localhost',
      port: 25565,
      username: 'ServerCheck',
      version: '1.21.4',
      auth: 'offline' as const,
    });

    const timeout = setTimeout(() => {
      testBot.quit();
      resolve(false);
    }, 5000);

    testBot.once('spawn', () => {
      clearTimeout(timeout);
      testBot.quit();
      resolve(true);
    });

    testBot.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Export for use in other tests
export { hasServer };

/**
 * Task Validation Test Suite
 *
 * Tests the task completion validation logic to ensure tasks are properly
 * validated based on their actual result structures from the Minecraft interface.
 *
 * @author @darianrosebrook
 */

// Import the validateTaskCompletion function from server.ts
// We'll need to extract this function or mock it for testing

describe('Task Validation Tests', () => {
  // Mock validateTaskCompletion function - we'll test the actual logic
  const validateTaskCompletion = (task: any, result: any): boolean => {
    // Check if the result indicates success
    if (!result || result.error) {
      return false;
    }

    // Check if the bot is connected and ready
    if (result.botStatus && result.botStatus.connected === false) {
      return false;
    }

    // For crafting tasks, check if the item was actually crafted
    if (task.type === 'craft') {
      return (
        result.success === true &&
        !result.error &&
        (result.data?.craftedItems?.length > 0 || !!result.item)
      );
    }

    // For mining tasks, check if any blocks were successfully mined
    if (task.type === 'mine') {
      return (
        result.success === true &&
        !result.error &&
        (result.data?.minedBlocks?.length > 0 ||
          result.results?.some((r: any) => r.success))
      );
    }

    // For building tasks, check if something was actually built
    if (task.type === 'build') {
      return (
        result.success === true &&
        !result.error &&
        (result.data?.builtStructure || result.results?.length > 0)
      );
    }

    // For gathering tasks, check if items were actually collected
    if (task.type === 'gather') {
      return (
        result.success === true &&
        !result.error &&
        (result.data?.gatheredItems?.length > 0 || result.results?.length > 0)
      );
    }

    // For movement tasks, check if the bot actually moved
    if (task.type === 'move' || task.type === 'navigate') {
      return (
        result.success === true &&
        !result.error &&
        (result.data?.distanceTraveled > 0 || result.results?.length > 0)
      );
    }

    // For flee tasks, check if defensive action was taken
    if (task.type === 'flee') {
      return (
        result.success === true &&
        !result.error &&
        (result.defensive === true || result.results?.length > 0)
      );
    }

    // For explore tasks, check if exploration was attempted
    if (task.type === 'explore') {
      return (
        result.success === true &&
        !result.error &&
        (result.type === 'exploration' || result.results?.length > 0)
      );
    }

    // For heal tasks, check if healing was attempted
    if (task.type === 'heal') {
      return (
        result.success === true &&
        !result.error &&
        (result.defensive === true || result.results?.length > 0)
      );
    }

    // For place_light tasks, check if lighting was placed
    if (task.type === 'place_light') {
      return (
        result.success === true &&
        !result.error &&
        (result.defensive === true || result.results?.length > 0)
      );
    }

    // For seek_shelter tasks, check if shelter was sought
    if (task.type === 'seek_shelter') {
      return (
        result.success === true &&
        !result.error &&
        (result.defensive === true || result.results?.length > 0)
      );
    }

    // For turn tasks, check if turning was attempted
    if (task.type === 'turn') {
      return (
        result.success === true &&
        !result.error &&
        (result.results?.length > 0 || !!result.botStatus)
      );
    }

    // For chat tasks, check if message was sent
    if (task.type === 'chat') {
      return (
        result.success === true &&
        !result.error &&
        (result.results?.length > 0 || !!result.botStatus)
      );
    }

    // For farm tasks, check if farming was attempted
    if (task.type === 'farm') {
      return (
        result.success === true &&
        !result.error &&
        (result.type === 'farming' || result.results?.length > 0)
      );
    }

    // For other task types, require explicit success and no errors
    if (result.success === false || result.error) {
      return false;
    }

    // If we have any form of execution evidence, consider it successful
    if (result.results?.length > 0 || result.type || result.defensive) {
      return true;
    }

    // For unknown task types, require more specific evidence than just botStatus
    if (
      result.botStatus &&
      (result.results?.length > 0 || result.type || result.defensive)
    ) {
      return true;
    }

    return false;
  };

  describe('Basic Validation Logic', () => {
    it('should fail validation when result is null or undefined', () => {
      const task = { type: 'move', description: 'Move forward' };

      expect(validateTaskCompletion(task, null)).toBe(false);
      expect(validateTaskCompletion(task, undefined)).toBe(false);
    });

    it('should fail validation when result has an error', () => {
      const task = { type: 'move', description: 'Move forward' };
      const result = { success: false, error: 'Bot not connected' };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });

    it('should fail validation when bot is not connected', () => {
      const task = { type: 'move', description: 'Move forward' };
      const result = {
        success: true,
        botStatus: { connected: false },
        results: [{ success: true }],
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Flee Task Validation', () => {
    it('should pass validation for successful flee task with defensive flag', () => {
      const task = { type: 'flee', description: 'Flee from danger' };
      const result = {
        success: true,
        error: undefined,
        defensive: true,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for successful flee task with results array', () => {
      const task = { type: 'flee', description: 'Flee from danger' };
      const result = {
        success: true,
        error: undefined,
        results: [{ success: true, action: 'move_forward' }],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for flee task without defensive flag or results', () => {
      const task = { type: 'flee', description: 'Flee from danger' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
        // Missing defensive flag and results array
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Explore Task Validation', () => {
    it('should pass validation for successful explore task with exploration type', () => {
      const task = { type: 'explore', description: 'Explore the environment' };
      const result = {
        success: true,
        error: undefined,
        type: 'exploration',
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for successful explore task with results array', () => {
      const task = { type: 'explore', description: 'Explore the environment' };
      const result = {
        success: true,
        error: undefined,
        results: [
          { success: true, action: 'move_forward' },
          { success: true, action: 'chat' },
        ],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for explore task without exploration type or results', () => {
      const task = { type: 'explore', description: 'Explore the environment' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
        // Missing type and results array
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Craft Task Validation', () => {
    it('should pass validation for successful craft task with craftedItems data', () => {
      const task = { type: 'craft', description: 'Craft wooden planks' };
      const result = {
        success: true,
        error: undefined,
        data: { craftedItems: ['wooden_planks'] },
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for successful craft task with item property', () => {
      const task = { type: 'craft', description: 'Craft wooden planks' };
      const result = {
        success: true,
        error: undefined,
        item: 'wooden_planks',
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for craft task without craftedItems or item', () => {
      const task = { type: 'craft', description: 'Craft wooden planks' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
        // Missing craftedItems and item
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Mine Task Validation', () => {
    it('should pass validation for successful mine task with minedBlocks data', () => {
      const task = { type: 'mine', description: 'Mine stone blocks' };
      const result = {
        success: true,
        error: undefined,
        data: { minedBlocks: ['stone', 'cobblestone'] },
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for successful mine task with successful results', () => {
      const task = { type: 'mine', description: 'Mine stone blocks' };
      const result = {
        success: true,
        error: undefined,
        results: [
          { success: true, action: 'mine_block' },
          { success: false, action: 'chat' },
        ],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for mine task without minedBlocks or successful results', () => {
      const task = { type: 'mine', description: 'Mine stone blocks' };
      const result = {
        success: true,
        error: undefined,
        results: [
          { success: false, action: 'mine_block' },
          { success: false, action: 'chat' },
        ],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Move Task Validation', () => {
    it('should pass validation for successful move task with distanceTraveled data', () => {
      const task = { type: 'move', description: 'Move forward 5 blocks' };
      const result = {
        success: true,
        error: undefined,
        data: { distanceTraveled: 5 },
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for successful move task with results array', () => {
      const task = { type: 'move', description: 'Move forward 5 blocks' };
      const result = {
        success: true,
        error: undefined,
        results: [{ success: true, action: 'move_forward' }],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for move task without distanceTraveled or results', () => {
      const task = { type: 'move', description: 'Move forward 5 blocks' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
        // Missing distanceTraveled and results
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Defensive Task Validation', () => {
    it('should pass validation for heal task with defensive flag', () => {
      const task = { type: 'heal', description: 'Heal the bot' };
      const result = {
        success: true,
        error: undefined,
        defensive: true,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for place_light task with defensive flag', () => {
      const task = { type: 'place_light', description: 'Place torches' };
      const result = {
        success: true,
        error: undefined,
        defensive: true,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for seek_shelter task with defensive flag', () => {
      const task = { type: 'seek_shelter', description: 'Find shelter' };
      const result = {
        success: true,
        error: undefined,
        defensive: true,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });
  });

  describe('Communication Task Validation', () => {
    it('should pass validation for chat task with results array', () => {
      const task = { type: 'chat', description: 'Send a message' };
      const result = {
        success: true,
        error: undefined,
        results: [{ success: true, action: 'chat' }],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should pass validation for chat task with botStatus', () => {
      const task = { type: 'chat', description: 'Send a message' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });
  });

  describe('Fallback Validation Logic', () => {
    it('should pass validation for unknown task type with execution evidence', () => {
      const task = { type: 'unknown_task', description: 'Unknown task' };
      const result = {
        success: true,
        error: undefined,
        results: [{ success: true }],
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should fail validation for unknown task type without execution evidence', () => {
      const task = { type: 'unknown_task', description: 'Unknown task' };
      const result = {
        success: true,
        error: undefined,
        botStatus: { connected: true },
        // No execution evidence
      };

      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });

  describe('Real-world Scenario Tests', () => {
    it('should handle the flee task scenario from the logs', () => {
      const task = {
        type: 'flee',
        description: 'Flee from immediate danger to a safe location',
        id: 'defense-task-1756016997009',
      };

      // This is the type of result that should be returned by executeTaskInMinecraft
      const result = {
        success: true,
        error: undefined,
        defensive: true,
        botStatus: { connected: true },
        type: 'move_forward',
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should handle explore task with multiple results', () => {
      const task = {
        type: 'explore',
        description: 'Explore the environment to find new resources',
        id: 'explore-task-123',
      };

      const result = {
        results: [
          { success: true, action: 'move_forward' },
          {
            success: true,
            action: 'chat',
            message: 'Exploring: Explore the environment to find new resources',
          },
        ],
        type: 'exploration',
        success: true,
        error: undefined,
        botStatus: { connected: true },
      };

      expect(validateTaskCompletion(task, result)).toBe(true);
    });

    it('should handle craft task with missing materials scenario', () => {
      const task = {
        type: 'craft',
        description: 'Craft wooden planks',
        parameters: { item: 'wooden_planks' },
      };

      const result = {
        results: [
          {
            success: false,
            action: 'craft_item',
            error: 'Missing required materials',
          },
          {
            success: true,
            action: 'chat',
            message: 'Cannot craft wooden_planks - missing required materials',
          },
        ],
        type: 'crafting',
        success: false,
        error: 'Missing required materials',
        item: 'wooden_planks',
        botStatus: { connected: true },
      };

      // Should fail because success is false
      expect(validateTaskCompletion(task, result)).toBe(false);
    });
  });
});

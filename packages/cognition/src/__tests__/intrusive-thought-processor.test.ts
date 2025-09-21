import { describe, it, expect, beforeEach } from 'vitest';
import { IntrusiveThoughtProcessor } from '../intrusive-thought-processor';

/**
 * Test suite for IntrusiveThoughtProcessor
 *
 * @author @darianrosebrook
 */
describe('IntrusiveThoughtProcessor', () => {
  let processor: IntrusiveThoughtProcessor;

  beforeEach(() => {
    processor = new IntrusiveThoughtProcessor({
      planningEndpoint: 'http://localhost:3002',
      minecraftEndpoint: 'http://localhost:3006',
      enablePlanningIntegration: false, // Disable for testing
    });
  });

  describe('Player Interaction Thoughts', () => {
    it('should parse player interaction thoughts correctly', async () => {
      const thought =
        "There's another player in front of me, I should ask if they have any of the resources I'm looking for";

      const result = await processor.processIntrusiveThought(thought);

      expect(result.accepted).toBe(true);
      expect(result.response).toContain('Created task');
      expect(result.task).toBeDefined();
      expect(result.task?.title).toContain('Ask');
      expect(result.task?.type).toBe('social');
    });

    it('should handle ask player for resources', async () => {
      const thought = 'I should ask the player for some wood';

      const result = await processor.processIntrusiveThought(thought);

      expect(result.accepted).toBe(true);
      expect(result.task?.title).toContain('Ask');
      expect(result.task?.type).toBe('social');
    });

    it('should handle talk to player thoughts', async () => {
      const thought = 'I need to talk to that player about trading';

      const result = await processor.processIntrusiveThought(thought);

      expect(result.accepted).toBe(true);
      expect(result.task?.title).toContain('Talk');
      expect(result.task?.type).toBe('social');
    });

    it('should handle chat with player thoughts', async () => {
      const thought = 'I should chat with the player to see if they need help';

      const result = await processor.processIntrusiveThought(thought);

      expect(result.accepted).toBe(true);
      expect(result.task?.title).toContain('Chat');
      expect(result.task?.type).toBe('social');
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      // Mock a processor that will throw an error
      const errorProcessor = new IntrusiveThoughtProcessor({
        planningEndpoint: 'http://invalid-endpoint',
        enablePlanningIntegration: true,
      });

      const thought = 'Test thought';

      const result = await errorProcessor.processIntrusiveThought(thought);

      expect(result.accepted).toBe(false);
      expect(result.response).toContain('Failed to process');
      expect(result.error).toBeDefined();
    });
  });

  describe('Action Parsing', () => {
    it('should parse ask actions correctly', () => {
      const thought = 'ask player for help';

      // Access the private method for testing
      const action = (processor as any).parseActionFromThought(thought);

      expect(action).toBeDefined();
      expect(action.type).toBe('ask');
      expect(action.target).toBe('player for help');
      expect(action.category).toBe('social');
    });

    it('should parse player interaction questions', () => {
      const thought = 'should I ask the player for resources?';

      const action = (processor as any).parseQuestionAsAction(thought);

      expect(action).toBeDefined();
      expect(action.type).toBe('ask');
      expect(action.target).toBe('player for resources or assistance');
      expect(action.category).toBe('social');
    });
  });
});

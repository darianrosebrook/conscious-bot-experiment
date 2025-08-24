/**
 * Debug test for Behavior Tree Runner import
 */

import { BehaviorTreeRunner } from '../BehaviorTreeRunner';

describe('Debug Import Test', () => {
  it('should import BehaviorTreeRunner correctly', () => {
    expect(BehaviorTreeRunner).toBeDefined();
    expect(typeof BehaviorTreeRunner).toBe('function');

    // Check if it's a class
    expect(BehaviorTreeRunner.prototype).toBeDefined();

    // Check if methods exist
    const mockExecutor = {
      async execute() {
        return { ok: true, data: {}, environmentDeltas: {} };
      },
    };

    const runner = new BehaviorTreeRunner(mockExecutor);
    expect(runner).toBeDefined();
    expect(typeof runner.runOption).toBe('function');
    expect(typeof runner.cancel).toBe('function');
    expect(typeof runner.getActiveRuns).toBe('function');
  });
});

/**
 * Basic Task Parser Tests
 *
 * Simple test suite to verify basic functionality of the task parser.
 *
 * @author @darianrosebrook
 */

describe('Task Parser - Basic Functionality', () => {
  test('should be able to import task parser', async () => {
    // This test verifies that the module can be imported without errors
    expect(() => {
      import('../task-parser');
    }).not.toThrow();
  });

  test('should be able to import dual-channel prompting', async () => {
    // This test verifies that the dual-channel prompting module can be imported
    expect(() => {
      import('../dual-channel-prompting');
    }).not.toThrow();
  });

  test('should be able to import creative paraphrasing', async () => {
    // This test verifies that the creative paraphrasing module can be imported
    expect(() => {
      import('../creative-paraphrasing');
    }).not.toThrow();
  });

  test('should have proper exports', async () => {
    const taskParser = await import('../task-parser');
    const dualChannel = await import('../dual-channel-prompting');
    const creativeParaphrasing = await import('../creative-paraphrasing');

    // Check that main classes are exported
    expect(taskParser.TaskParser).toBeDefined();
    expect(dualChannel.DualChannelPrompting).toBeDefined();
    expect(creativeParaphrasing.CreativeParaphrasing).toBeDefined();

    // Check that default configurations are exported
    expect(taskParser.DEFAULT_TASK_PARSER_CONFIG).toBeDefined();
    expect(dualChannel.DEFAULT_DUAL_CHANNEL_CONFIG).toBeDefined();
    expect(
      creativeParaphrasing.DEFAULT_CREATIVE_PARAPHRASING_CONFIG
    ).toBeDefined();
  });
});

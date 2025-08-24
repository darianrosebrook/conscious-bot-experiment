/**
 * Basic Enhanced Task Parser Tests
 * 
 * Simple test suite to verify basic functionality of the enhanced task parser.
 * 
 * @author @darianrosebrook
 */

describe('Enhanced Task Parser - Basic Functionality', () => {
  test('should be able to import enhanced task parser', () => {
    // This test verifies that the module can be imported without errors
    expect(() => {
      require('../enhanced-task-parser');
    }).not.toThrow();
  });

  test('should be able to import dual-channel prompting', () => {
    // This test verifies that the dual-channel prompting module can be imported
    expect(() => {
      require('../dual-channel-prompting');
    }).not.toThrow();
  });

  test('should be able to import creative paraphrasing', () => {
    // This test verifies that the creative paraphrasing module can be imported
    expect(() => {
      require('../creative-paraphrasing');
    }).not.toThrow();
  });

  test('should have proper exports', () => {
    const enhancedParser = require('../enhanced-task-parser');
    const dualChannel = require('../dual-channel-prompting');
    const creativeParaphrasing = require('../creative-paraphrasing');

    // Check that main classes are exported
    expect(enhancedParser.EnhancedTaskParser).toBeDefined();
    expect(dualChannel.DualChannelPrompting).toBeDefined();
    expect(creativeParaphrasing.CreativeParaphrasing).toBeDefined();

    // Check that default configurations are exported
    expect(enhancedParser.DEFAULT_ENHANCED_TASK_PARSER_CONFIG).toBeDefined();
    expect(dualChannel.DEFAULT_DUAL_CHANNEL_CONFIG).toBeDefined();
    expect(creativeParaphrasing.DEFAULT_CREATIVE_PARAPHRASING_CONFIG).toBeDefined();
  });
});

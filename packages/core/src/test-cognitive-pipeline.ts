/**
 * Cognitive Thought to Action Pipeline Test
 *
 * End-to-end test of the complete cognitive processing pipeline:
 * 1. Generate cognitive thoughts
 * 2. Convert to behavior tree signals
 * 3. Execute via behavior tree
 * 4. Verify integration
 *
 * NOTE: This test is disabled due to cross-package dependencies with planning package
 * TODO: Move to appropriate test directory when package structure is resolved
 *
 * @author @darianrosebrook
 */

/**
 * Test the complete cognitive thought to behavior tree pipeline
 * NOTE: This test is disabled due to cross-package dependencies
 * TODO: Move to appropriate test directory when package structure is resolved
 */
async function testCognitivePipeline() {
  console.log(
    '🧪 [COGNITIVE PIPELINE TEST] Test disabled - imports from planning package not allowed in core'
  );
  return;
}

// Execute the test
testCognitivePipeline()
  .then(() => {
    console.log('🧪 [COGNITIVE PIPELINE TEST] Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('🧪 [COGNITIVE PIPELINE TEST] Test failed:', error);
    process.exit(1);
  });

export { testCognitivePipeline };

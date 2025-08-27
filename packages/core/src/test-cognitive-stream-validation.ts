/**
 * Comprehensive Test for Cognitive Stream Integration
 * Validates that implementation matches iteration two specification
 *
 * @author @darianrosebrook
 */

import { CognitiveStreamIntegration } from './cognitive-stream-integration.js';

/**
 * Test suite for validating cognitive stream integration
 */
class CognitiveStreamValidationTest {
  private integration: CognitiveStreamIntegration;
  private testResults: Map<string, boolean> = new Map();
  private testDetails: Map<string, string> = new Map();

  constructor() {
    this.integration = new CognitiveStreamIntegration();

    // Set up event listeners before initialization to capture all events
    this.integration.on('capabilityRegistered', (event) => {
      // Store capability events for later validation
      if (!this.capabilityEvents) this.capabilityEvents = [];
      this.capabilityEvents.push(event);
    });
  }

  private capabilityEvents: any[] = [];

  /**
   * Run all validation tests
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Cognitive Stream Integration Validation Tests\n');

    await this.testCapabilityRegistration();
    await this.testGoalIdentification();
    await this.testPlanningExecution();
    await this.testEventStreaming();
    await this.testMCPIntegration();
    await this.testSafetyFeatures();

    this.printResults();
  }

  /**
   * Test 1: Capability Registration
   * Validates that MCP capabilities can be registered and listed
   */
  private async testCapabilityRegistration(): Promise<void> {
    console.log('📋 Test 1: Capability Registration');

    try {
      // Initialize the integration
      await this.integration.initialize();

      // Check if capabilities were registered
      const capabilities = await this.integration.getMCPCapabilities();
      const hasCapabilities = capabilities.length > 0;

      this.testResults.set('capability_registration', hasCapabilities);
      this.testDetails.set(
        'capability_registration',
        hasCapabilities
          ? `✅ Registered ${capabilities.length} capabilities`
          : '❌ No capabilities registered'
      );

      // Check for specific torch corridor capability
      const torchCapability = capabilities.find(
        (cap: any) => cap.name === 'opt.torch_corridor'
      );
      this.testResults.set('torch_capability', !!torchCapability);
      this.testDetails.set(
        'torch_capability',
        torchCapability
          ? `✅ Torch corridor capability found: ${torchCapability.name}@${torchCapability.version}`
          : '❌ Torch corridor capability not found'
      );
    } catch (error) {
      this.testResults.set('capability_registration', false);
      this.testDetails.set('capability_registration', `❌ Error: ${error}`);
    }
  }

  /**
   * Test 2: Goal Identification
   * Validates that the system can identify goals from bot state changes
   */
  private async testGoalIdentification(): Promise<void> {
    console.log('📋 Test 2: Goal Identification');

    try {
      // Simulate bot state changes that should trigger goals
      const events: any[] = [];

      this.integration.on('goalIdentified', (event) => {
        events.push(event);
      });

      // Simulate underground exploration (should trigger torch goal)
      await this.integration.updateBotState({
        position: { x: 0, y: 45, z: 0 },
        health: 18,
        food: 15,
        inventory: { torch: 8, cobblestone: 20 },
        currentTask: 'mining underground',
      });

      // Simulate low health (should trigger health goal)
      await this.integration.updateBotState({
        position: { x: 0, y: 45, z: 0 },
        health: 5,
        food: 8,
        inventory: { torch: 6, cobblestone: 20 },
        currentTask: 'surviving underground',
      });

      // Wait for goal identification
      await new Promise((resolve) => setTimeout(resolve, 100));

      const hasGoals = events.length > 0;
      this.testResults.set('goal_identification', hasGoals);
      this.testDetails.set(
        'goal_identification',
        hasGoals
          ? `✅ Identified ${events.length} goals from state changes`
          : '❌ No goals identified from state changes'
      );

      // Check for specific goal types
      const torchGoal = events.find((e) => e.content.includes('torch'));
      const healthGoal = events.find((e) => e.content.includes('health'));

      this.testResults.set('torch_goal', !!torchGoal);
      this.testResults.set('health_goal', !!healthGoal);
    } catch (error) {
      this.testResults.set('goal_identification', false);
      this.testDetails.set('goal_identification', `❌ Error: ${error}`);
    }
  }

  /**
   * Test 3: Planning Execution
   * Validates that planning cycles can be executed for identified goals
   */
  private async testPlanningExecution(): Promise<void> {
    console.log('📋 Test 3: Planning Execution');

    try {
      const events: any[] = [];

      this.integration.on('planGenerated', (event) => {
        events.push(event);
      });

      this.integration.on('planExecuted', (event) => {
        events.push(event);
      });

      // Trigger planning for a goal
      await this.integration.executePlanningCycle(
        'torch the mining corridor safely'
      );

      // Wait for planning events
      await new Promise((resolve) => setTimeout(resolve, 100));

      const hasPlanning = events.length > 0;
      this.testResults.set('planning_execution', hasPlanning);
      this.testDetails.set(
        'planning_execution',
        hasPlanning
          ? `✅ Generated and executed ${events.length} planning events`
          : '❌ No planning events generated'
      );

      // Check for MCP capabilities approach
      const mcpPlanning = events.find(
        (e) => e.metadata?.approach === 'mcp-capabilities'
      );
      this.testResults.set('mcp_planning', !!mcpPlanning);
      this.testDetails.set(
        'mcp_planning',
        mcpPlanning
          ? '✅ MCP capabilities planning approach used'
          : '❌ MCP capabilities planning not used'
      );
    } catch (error) {
      this.testResults.set('planning_execution', false);
      this.testDetails.set('planning_execution', `❌ Error: ${error}`);
    }
  }

  /**
   * Test 4: Event Streaming
   * Validates that events are properly streamed through the cognitive system
   */
  private async testEventStreaming(): Promise<void> {
    console.log('📋 Test 4: Event Streaming');

    try {
      const events: any[] = [];

      this.integration.on('observation', (event) => {
        events.push(event);
      });

      this.integration.on('capabilityRegistered', (event) => {
        events.push(event);
      });

      // Trigger some events
      await this.integration.updateBotState({
        position: { x: 0, y: 70, z: 0 },
        health: 20,
        food: 20,
        inventory: { torch: 10, cobblestone: 20 },
        currentTask: 'exploring surface',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const hasEvents = events.length > 0;
      this.testResults.set('event_streaming', hasEvents);
      this.testDetails.set(
        'event_streaming',
        hasEvents
          ? `✅ Streamed ${events.length} events through cognitive system`
          : '❌ No events streamed'
      );

      // Check event types
      const hasObservations = events.some((e) => e.type === 'observation');
      const hasCapabilities = this.capabilityEvents.length > 0;

      this.testResults.set('observation_events', hasObservations);
      this.testResults.set('capability_events', hasCapabilities);
    } catch (error) {
      this.testResults.set('event_streaming', false);
      this.testDetails.set('event_streaming', `❌ Error: ${error}`);
    }
  }

  /**
   * Test 5: MCP Integration
   * Validates that MCP capabilities are properly integrated
   */
  private async testMCPIntegration(): Promise<void> {
    console.log('📋 Test 5: MCP Integration');

    try {
      // Check MCP registry status
      const capabilities = await this.integration.getMCPCapabilities();
      const activeCapabilities = capabilities.filter(
        (cap: any) => cap.status === 'active'
      );
      const shadowCapabilities = capabilities.filter(
        (cap: any) => cap.status === 'shadow'
      );

      this.testResults.set('mcp_registry', capabilities.length > 0);
      this.testDetails.set(
        'mcp_registry',
        `✅ MCP Registry: ${capabilities.length} total, ${activeCapabilities.length} active, ${shadowCapabilities.length} shadow`
      );

      // Check leaf factory
      const leaves = await this.integration.getMCPLeaves();
      this.testResults.set('leaf_factory', leaves.length > 0);
      this.testDetails.set(
        'leaf_factory',
        `✅ Leaf Factory: ${leaves.length} leaves registered`
      );

      // Check for required leaves
      const requiredLeaves = [
        'move_to',
        'sense_hostiles',
        'retreat_and_block',
        'place_torch_if_needed',
        'step_forward_safely',
      ];
      const missingLeaves = requiredLeaves.filter(
        (leaf) => !leaves.find((l: any) => l.name === leaf)
      );

      this.testResults.set('required_leaves', missingLeaves.length === 0);
      this.testDetails.set(
        'required_leaves',
        missingLeaves.length === 0
          ? '✅ All required leaves registered'
          : `❌ Missing leaves: ${missingLeaves.join(', ')}`
      );
    } catch (error) {
      this.testResults.set('mcp_integration', false);
      this.testDetails.set('mcp_integration', `❌ Error: ${error}`);
    }
  }

  /**
   * Test 6: Safety Features
   * Validates that safety features are properly implemented
   */
  private async testSafetyFeatures(): Promise<void> {
    console.log('📋 Test 6: Safety Features');

    try {
      // Check if safety goals are identified
      const events: any[] = [];

      this.integration.on('goalIdentified', (event) => {
        events.push(event);
      });

      // Simulate dangerous situation
      await this.integration.updateBotState({
        position: { x: 0, y: 45, z: 0 },
        health: 3,
        food: 2,
        inventory: { torch: 1, cobblestone: 5 },
        currentTask: 'critical survival',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const safetyGoals = events.filter(
        (e) =>
          e.content.includes('safely') ||
          e.content.includes('health') ||
          e.content.includes('food')
      );

      this.testResults.set('safety_goals', safetyGoals.length > 0);
      this.testDetails.set(
        'safety_goals',
        safetyGoals.length > 0
          ? `✅ Identified ${safetyGoals.length} safety-related goals`
          : '❌ No safety goals identified'
      );

      // Check for emergency response
      const emergencyGoals = events.filter(
        (e) =>
          e.content.includes('emergency') ||
          e.content.includes('critical') ||
          e.content.includes('restore health')
      );

      this.testResults.set('emergency_response', emergencyGoals.length > 0);
      this.testDetails.set(
        'emergency_response',
        emergencyGoals.length > 0
          ? `✅ Emergency response goals identified`
          : '❌ No emergency response goals'
      );
    } catch (error) {
      this.testResults.set('safety_features', false);
      this.testDetails.set('safety_features', `❌ Error: ${error}`);
    }
  }

  /**
   * Print test results summary
   */
  private printResults(): void {
    console.log('\n📊 Test Results Summary');
    console.log('='.repeat(50));

    const totalTests = this.testResults.size;
    const passedTests = Array.from(this.testResults.values()).filter(
      (result) => result
    ).length;
    const failedTests = totalTests - passedTests;

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(
      `Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`
    );

    console.log('\n📋 Detailed Results:');
    console.log('-'.repeat(50));

    for (const [testName, passed] of this.testResults) {
      const status = passed ? '✅ PASS' : '❌ FAIL';
      const detail = this.testDetails.get(testName) || '';
      console.log(`${status} ${testName.replace(/_/g, ' ').toUpperCase()}`);
      console.log(`   ${detail}`);
      console.log('');
    }

    if (failedTests === 0) {
      console.log(
        '🎉 All tests passed! Cognitive Stream Integration is working correctly.'
      );
    } else {
      console.log(
        `⚠️ ${failedTests} test(s) failed. Review the implementation.`
      );
    }

    console.log('\n🔍 Iteration Two Compliance Check:');
    console.log('-'.repeat(50));

    const complianceChecks = [
      {
        name: 'MCP Capabilities Integration',
        passed: this.testResults.get('mcp_integration'),
      },
      {
        name: 'Goal Identification System',
        passed: this.testResults.get('goal_identification'),
      },
      {
        name: 'Planning Execution Flow',
        passed: this.testResults.get('planning_execution'),
      },
      {
        name: 'Event Streaming',
        passed: this.testResults.get('event_streaming'),
      },
      {
        name: 'Safety Features',
        passed: this.testResults.get('safety_features'),
      },
    ];

    for (const check of complianceChecks) {
      const status = check.passed ? '✅' : '❌';
      console.log(`${status} ${check.name}`);
    }
  }
}

// Run the validation test
async function main() {
  const test = new CognitiveStreamValidationTest();
  await test.runAllTests();
}

// Run the test if this file is executed directly
main().catch(console.error);

export { CognitiveStreamValidationTest };

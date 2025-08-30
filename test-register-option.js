/**
 * Test Registering Safe Tree Chopping Option
 *
 * This script tests registering the Safe Tree Chopping option manually
 * to see if the MCP integration can handle it.
 *
 * @author @darianrosebrook
 */

import axios from 'axios';

async function testRegisterOption() {
  console.log('🧪 Testing Option Registration\n');

  try {
    // Define the Safe Tree Chopping option
    const option = {
      id: 'opt.chop_tree_safe',
      name: 'Safe Tree Chopping',
      description: 'Gather N logs from target species with safety checks',
      btDefinition: {
        id: 'opt.chop_tree_safe',
        name: 'Safe Tree Chopping',
        description: 'Gather N logs from target species with safety checks',
        root: {
          type: 'sequence',
          children: [
            {
              type: 'action',
              name: 'check_tools',
              action: 'sense_tools',
              args: { required: ['axe'], light_threshold: 7 },
            },
            {
              type: 'selector',
              name: 'find_tree',
              children: [
                {
                  type: 'action',
                  name: 'find_nearby_tree',
                  action: 'scan_for_trees',
                  args: { radius: 50, species: 'target_species' },
                },
                {
                  type: 'action',
                  name: 'pathfind_to_tree',
                  action: 'pathfind',
                  args: { target: 'nearest_tree', avoid_water: true },
                },
              ],
            },
            {
              type: 'sequence',
              name: 'chop_tree',
              children: [
                {
                  type: 'action',
                  name: 'scan_canopy',
                  action: 'scan_tree_structure',
                  args: { method: 'top_down' },
                },
                {
                  type: 'action',
                  name: 'chop_logs',
                  action: 'dig_blocks',
                  args: { pattern: 'tree_logs_top_down', tool: 'axe' },
                },
                {
                  type: 'action',
                  name: 'collect_drops',
                  action: 'collect_items',
                  args: { radius: 3 },
                },
              ],
            },
            {
              type: 'action',
              name: 'verify_logs',
              action: 'sense_inventory',
              args: { item: 'logs', min_count: 'target_amount' },
            },
          ],
        },
        metadata: {
          timeout: 45000,
          retries: 2,
          priority: 'medium',
          interruptible: true,
        },
      },
      permissions: ['movement', 'dig', 'sense'],
    };

    // Register the option
    console.log('1. Registering Safe Tree Chopping option...');
    const registerResponse = await axios.post(
      'http://localhost:3002/mcp/register-option',
      option
    );
    console.log('✅ Register response:', registerResponse.data);

    // List options to see if it was registered
    console.log('\n2. Listing available options...');
    const optionsResponse = await axios.get(
      'http://localhost:3002/mcp/options'
    );
    console.log('✅ Available options:', optionsResponse.data);

    // Try to run the option
    console.log('\n3. Testing option execution...');
    const runResponse = await axios.post(
      'http://localhost:3002/mcp/run-option',
      {
        optionId: 'opt.chop_tree_safe',
      }
    );
    console.log('✅ Run response:', runResponse.data);

    console.log('\n🎉 Option registration test completed successfully!');
  } catch (error) {
    console.error(
      '❌ Option registration test failed:',
      error.response?.data || error.message
    );
  }
}

// Run the test
testRegisterOption().catch(console.error);

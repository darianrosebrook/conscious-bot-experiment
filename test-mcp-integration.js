/**
 * Test MCP Integration and Task Discovery
 * 
 * This script tests the MCP server integration to see if it can discover
 * and execute tasks properly.
 * 
 * @author @darianrosebrook
 */

import axios from 'axios';

async function testMCPIntegration() {
  console.log('🧪 Testing MCP Integration and Task Discovery\n');

  try {
    // Test 1: Check MCP status
    console.log('1. Checking MCP status...');
    const statusResponse = await axios.get('http://localhost:3002/mcp/status');
    console.log('✅ MCP Status:', statusResponse.data);

    // Test 2: List available options
    console.log('\n2. Listing available MCP options...');
    const optionsResponse = await axios.get('http://localhost:3002/mcp/options');
    console.log('✅ Available options:', optionsResponse.data);

    // Test 3: Try to run the Safe Tree Chopping option
    console.log('\n3. Testing Safe Tree Chopping option...');
    const runResponse = await axios.post('http://localhost:3002/mcp/run-option', {
      optionId: 'opt.chop_tree_safe'
    });
    console.log('✅ Run option response:', runResponse.data);

    // Test 4: Check if there are any tools available
    console.log('\n4. Checking available tools...');
    const toolsResponse = await axios.get('http://localhost:3002/mcp/tools');
    console.log('✅ Available tools:', toolsResponse.data);

    console.log('\n🎉 MCP Integration test completed successfully!');

  } catch (error) {
    console.error('❌ MCP Integration test failed:', error.response?.data || error.message);
  }
}

// Run the test
testMCPIntegration().catch(console.error);

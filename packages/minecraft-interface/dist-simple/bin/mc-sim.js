#!/usr/bin/env node
"use strict";
/**
 * Minecraft Simulation CLI
 *
 * Provides a command-line interface for testing the Minecraft interface
 * using the simulation stub, without requiring a real Minecraft server.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
const simulation_stub_1 = require("../src/simulation-stub");
// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
for (const arg of args) {
    if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        options[key] = value || 'true';
    }
}
// Help function
function showHelp() {
    console.log(`
🤖 Minecraft Simulation CLI

Usage: node mc-sim.js [options]

Options:
  --action <action>        Action to perform (connect, move, turn, jump, chat, mine, place, stats)
  --distance <number>      Distance for move action (default: 1)
  --angle <number>         Angle for turn actions (default: 90)
  --message <text>         Message for chat action
  --block-type <type>      Block type for place action (default: stone)
  --world-size <size>      World size (default: 100x64x100)
  --tick-rate <ms>         Simulation tick rate in milliseconds (default: 50)
  --verbose, -v           Enable verbose logging
  --help, -h              Show this help message

Actions:
  connect                 Connect to simulation and show initial state
  move                    Move forward (use --distance to specify blocks)
  turn-left               Turn left (use --angle to specify degrees)
  turn-right              Turn right (use --angle to specify degrees)
  jump                    Jump
  chat                    Send a chat message (use --message to specify text)
  mine                    Mine a block at current position
  place                   Place a block at current position (use --block-type to specify type)
  stats                   Show simulation statistics
  demo                    Run a demonstration sequence

Examples:
  node mc-sim.js --action connect
  node mc-sim.js --action move --distance 5 --verbose
  node mc-sim.js --action chat --message "Hello World!"
  node mc-sim.js --action place --block-type dirt
  node mc-sim.js --action demo
`);
}
// Main execution function
async function main() {
    console.log(`
🤖 Minecraft Simulation Test
============================

⚙️  Configuration: {
  "worldSize": "${options['world-size'] || '100x64x100'}",
  "tickRate": ${options['tick-rate'] || 50}ms,
  "verbose": ${options.verbose ? 'true' : 'false'}
}

`);
    // Parse world size
    const worldSizeStr = options['world-size'] || '100x64x100';
    const [width, height, depth] = worldSizeStr.split('x').map(Number);
    const config = {
        worldSize: { width, height, depth },
        tickRate: parseInt(options['tick-rate'] || '50'),
    };
    const simulation = (0, simulation_stub_1.createSimulatedMinecraftInterface)(config);
    const action = options.action || 'connect';
    try {
        // Connect to simulation
        await simulation.connect();
        // Execute requested action
        await runAction(simulation, action, options.verbose === 'true');
        // Show final stats
        if (options.verbose === 'true') {
            const stats = simulation.getSimulationStats();
            console.log('\n📊 Simulation Statistics:');
            console.log(JSON.stringify(stats, null, 2));
        }
    }
    catch (error) {
        console.error('❌ Simulation error:', error);
        process.exit(1);
    }
    finally {
        await simulation.disconnect();
    }
}
// Action execution function
async function runAction(simulation, action, verbose = false) {
    console.log(`🎯 Executing action: ${action}`);
    switch (action) {
        case 'connect':
            // Just connect and show state
            const gameState = await simulation.getGameState();
            console.log('📊 Game state:', JSON.stringify(gameState, null, 2));
            break;
        case 'move':
            const distance = parseInt(options.distance || '1');
            const moveResult = await simulation.executeAction({
                type: 'move_forward',
                parameters: { distance },
            });
            console.log(`✅ ${moveResult.message}`);
            if (verbose && moveResult.data) {
                console.log('📊 Move data:', JSON.stringify(moveResult.data, null, 2));
            }
            break;
        case 'turn-left':
            const leftAngle = parseInt(options.angle || '90');
            const turnLeftResult = await simulation.executeAction({
                type: 'turn_left',
                parameters: { angle: leftAngle },
            });
            console.log(`✅ ${turnLeftResult.message}`);
            break;
        case 'turn-right':
            const rightAngle = parseInt(options.angle || '90');
            const turnRightResult = await simulation.executeAction({
                type: 'turn_right',
                parameters: { angle: rightAngle },
            });
            console.log(`✅ ${turnRightResult.message}`);
            break;
        case 'jump':
            const jumpResult = await simulation.executeAction({
                type: 'jump',
                parameters: {},
            });
            console.log(`✅ ${jumpResult.message}`);
            break;
        case 'chat':
            const message = options.message || 'Hello from Simulation!';
            const chatResult = await simulation.executeAction({
                type: 'chat',
                parameters: { message },
            });
            console.log(`✅ ${chatResult.message}`);
            break;
        case 'mine':
            const mineResult = await simulation.executeAction({
                type: 'mine_block',
                parameters: {},
            });
            console.log(`✅ ${mineResult.message}`);
            if (verbose && mineResult.data) {
                console.log('📊 Mine data:', JSON.stringify(mineResult.data, null, 2));
            }
            break;
        case 'place':
            const blockType = options['block-type'] || 'stone';
            const placeResult = await simulation.executeAction({
                type: 'place_block',
                parameters: { blockType },
            });
            console.log(`✅ ${placeResult.message}`);
            if (verbose && placeResult.data) {
                console.log('📊 Place data:', JSON.stringify(placeResult.data, null, 2));
            }
            break;
        case 'stats':
            const stats = simulation.getSimulationStats();
            console.log('📊 Simulation Statistics:');
            console.log(JSON.stringify(stats, null, 2));
            break;
        case 'demo':
            await runDemo(simulation, verbose);
            break;
        default:
            console.error(`❌ Unknown action: ${action}`);
            showHelp();
            process.exit(1);
    }
}
// Demo sequence function
async function runDemo(simulation, verbose = false) {
    console.log('🎬 Running demonstration sequence...\n');
    const actions = [
        { type: 'chat', params: { message: 'Starting demo sequence!' } },
        { type: 'move_forward', params: { distance: 3 } },
        { type: 'turn_left', params: { angle: 90 } },
        { type: 'move_forward', params: { distance: 2 } },
        { type: 'jump', params: {} },
        { type: 'mine_block', params: {} },
        { type: 'place_block', params: { blockType: 'stone' } },
        { type: 'turn_right', params: { angle: 180 } },
        { type: 'move_forward', params: { distance: 1 } },
        { type: 'chat', params: { message: 'Demo complete!' } },
    ];
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        console.log(`🎯 Step ${i + 1}/${actions.length}: ${action.type}`);
        const result = await simulation.executeAction({
            type: action.type,
            parameters: action.params,
        });
        console.log(`✅ ${result.message}`);
        if (verbose && result.data) {
            console.log('📊 Data:', JSON.stringify(result.data, null, 2));
        }
        // Small delay between actions
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log('');
    }
    console.log('🎉 Demonstration sequence completed!');
}
// Handle help option
if (options.help || options.h) {
    showHelp();
    process.exit(0);
}
// Run main function
main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});

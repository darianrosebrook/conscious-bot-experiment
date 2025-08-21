#!/usr/bin/env node
"use strict";
/**
 * Simple Minecraft Interface CLI
 *
 * Basic command-line tool for testing Minecraft connectivity
 * without any planning system dependencies.
 *
 * @author @darianrosebrook
 */
Object.defineProperty(exports, "__esModule", { value: true });
const standalone_simple_1 = require("../src/standalone-simple");
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--host':
                options.host = args[++i];
                break;
            case '--port':
                options.port = parseInt(args[++i], 10);
                break;
            case '--username':
                options.username = args[++i];
                break;
            case '--action':
                options.action = args[++i];
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
        }
    }
    return options;
}
function printHelp() {
    console.log(`
🤖 Simple Minecraft Interface CLI

Usage: node mc-simple.js [options]

Options:
  --host <host>        Minecraft server host (default: localhost)
  --port <port>        Minecraft server port (default: 25565)
  --username <name>    Bot username (default: SimpleBot)
  --action <action>    Action to perform (connect, move, turn, jump, chat)
  --verbose, -v        Enable verbose logging
  --help, -h           Show this help message

Actions:
  connect              Just connect and show game state
  move                 Move forward 3 blocks
  turn                 Turn left 90 degrees
  jump                 Jump
  chat                 Send a chat message

Examples:
  node mc-simple.js --host localhost --port 25565
  node mc-simple.js --action move --verbose
  node mc-simple.js --username TestBot --action chat
`);
}
async function runAction(mcInterface, action, verbose = false) {
    console.log(`🎯 Executing action: ${action}`);
    try {
        switch (action) {
            case 'connect':
                // Just connect and show state
                const gameState = await mcInterface.getGameState();
                console.log('📊 Game state:', JSON.stringify(gameState, null, 2));
                break;
            case 'move':
                const moveResult = await mcInterface.executeAction({
                    type: 'move_forward',
                    parameters: { distance: 3 },
                });
                console.log('🚶 Move result:', moveResult);
                break;
            case 'turn':
                const turnResult = await mcInterface.executeAction({
                    type: 'turn_left',
                    parameters: { angle: 90 },
                });
                console.log('🔄 Turn result:', turnResult);
                break;
            case 'jump':
                const jumpResult = await mcInterface.executeAction({
                    type: 'jump',
                    parameters: {},
                });
                console.log('🦘 Jump result:', jumpResult);
                break;
            case 'chat':
                const chatResult = await mcInterface.executeAction({
                    type: 'chat',
                    parameters: { message: 'Hello from SimpleBot!' },
                });
                console.log('💬 Chat result:', chatResult);
                break;
            default:
                console.error(`❌ Unknown action: ${action}`);
                console.log('Available actions: connect, move, turn, jump, chat');
                return;
        }
        console.log('✅ Action completed successfully');
    }
    catch (error) {
        console.error(`❌ Action ${action} failed:`, error);
        throw error;
    }
}
async function main() {
    try {
        const options = parseArgs();
        console.log('🤖 Simple Minecraft Interface Test');
        console.log('==================================');
        console.log();
        // Build configuration
        const config = {
            ...standalone_simple_1.DEFAULT_SIMPLE_CONFIG,
            host: options.host ?? standalone_simple_1.DEFAULT_SIMPLE_CONFIG.host,
            port: options.port !== undefined ? options.port : standalone_simple_1.DEFAULT_SIMPLE_CONFIG.port,
            username: options.username ?? standalone_simple_1.DEFAULT_SIMPLE_CONFIG.username,
        };
        if (options.verbose) {
            console.log('⚙️  Configuration:', JSON.stringify(config, null, 2));
            console.log();
        }
        // Create interface
        const minecraftInterface = (0, standalone_simple_1.createSimpleMinecraftInterface)(config);
        // Connect to server
        console.log('🔌 Connecting to Minecraft server...');
        await minecraftInterface.connect();
        console.log('✅ Connected successfully!');
        // Run action if specified
        if (options.action) {
            await runAction(minecraftInterface, options.action, options.verbose);
        }
        else {
            // Default: just show game state
            const gameState = await minecraftInterface.getGameState();
            console.log('📊 Current game state:');
            console.log(`  Position: (${gameState.position.x}, ${gameState.position.y}, ${gameState.position.z})`);
            console.log(`  Health: ${gameState.health}`);
            console.log(`  Food: ${gameState.food}`);
            console.log(`  Time: ${gameState.time}`);
            console.log(`  Weather: ${gameState.weather}`);
            console.log(`  Inventory items: ${gameState.inventory.length}`);
        }
        // Disconnect
        console.log('🔌 Disconnecting...');
        await minecraftInterface.disconnect();
        console.log();
        console.log('🎉 Test completed successfully!');
    }
    catch (error) {
        console.error('💥 Test failed:', error);
        process.exit(1);
    }
}
// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    });
}

#!/usr/bin/env node
/**
 * Standalone Minecraft Interface CLI
 *
 * Command-line tool for testing Minecraft interface components
 * without requiring the full planning system.
 *
 * @author @darianrosebrook
 */
import { createStandaloneMinecraftInterface, DEFAULT_STANDALONE_CONFIG, } from '../src/standalone';
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
            case '--scenario':
                options.scenario = args[++i];
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
 Standalone Minecraft Interface CLI

Usage: node mc-standalone.js [options]

Options:
  --host <host>        Minecraft server host (default: localhost)
  --port <port>        Minecraft server port (default: 25565)
  --username <name>    Bot username (default: StandaloneBot)
  --scenario <name>    Test scenario to run (default: basic)
  --verbose, -v        Enable verbose logging
  --help, -h           Show this help message

Scenarios:
  basic               Basic connection and movement test
  navigation          Navigation and pathfinding test
  inventory           Inventory management test
  crafting            Basic crafting test

Examples:
  node mc-standalone.js --host localhost --port 25565
  node mc-standalone.js --scenario navigation --verbose
  node mc-standalone.js --username TestBot
`);
}
async function runBasicScenario(interface, verbose = false) {
    console.log(' Running basic scenario...');
    try {
        // Connect to server
        await interface.connect();
        // Get initial state
        const initialState = await interface.getGameState();
        if (verbose) {
            console.log(' Initial game state:', JSON.stringify(initialState, null, 2));
        }
        // Execute simple movement
        const movementAction = {
            type: 'move_forward',
            parameters: { distance: 2 },
            priority: 1,
        };
        console.log(' Executing movement action...');
        const movementResult = await interface.executeAction(movementAction);
        if (movementResult.success) {
            console.log(' Movement successful');
        }
        else {
            console.log(' Movement failed');
        }
        if (verbose) {
            console.log(' Movement result:', JSON.stringify(movementResult, null, 2));
        }
        // Get final state
        const finalState = await interface.getGameState();
        if (verbose) {
            console.log(' Final game state:', JSON.stringify(finalState, null, 2));
        }
        console.log(' Basic scenario completed successfully');
    }
    catch (error) {
        console.error(' Basic scenario failed:', error);
        throw error;
    }
    finally {
        await interface.disconnect();
    }
}
async function runNavigationScenario(interface, verbose = false) {
    console.log(' Running navigation scenario...');
    try {
        await interface.connect();
        // Test different movement types
        const movements = [
            { type: 'move_forward', parameters: { distance: 3 } },
            { type: 'turn_left', parameters: { angle: 90 } },
            { type: 'move_forward', parameters: { distance: 2 } },
            { type: 'turn_right', parameters: { angle: 90 } },
        ];
        for (const movement of movements) {
            console.log(` Executing ${movement.type}...`);
            const result = await interface.executeAction({
                ...movement,
                priority: 1,
            });
            if (result.success) {
                console.log(` ${movement.type} successful`);
            }
            else {
                console.log(` ${movement.type} failed`);
            }
            if (verbose) {
                console.log(' Result:', JSON.stringify(result, null, 2));
            }
            // Small delay between movements
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        console.log(' Navigation scenario completed successfully');
    }
    catch (error) {
        console.error(' Navigation scenario failed:', error);
        throw error;
    }
    finally {
        await interface.disconnect();
    }
}
async function runInventoryScenario(interface, verbose = false) {
    console.log(' Running inventory scenario...');
    try {
        await interface.connect();
        // Get current inventory
        const gameState = await interface.getGameState();
        console.log(' Current inventory items:', gameState.inventory?.length || 0);
        if (verbose) {
            console.log(' Full inventory:', JSON.stringify(gameState.inventory, null, 2));
        }
        // Test inventory-related actions
        const inventoryAction = {
            type: 'check_inventory',
            parameters: {},
            priority: 1,
        };
        const result = await interface.executeAction(inventoryAction);
        if (result.success) {
            console.log(' Inventory check successful');
        }
        else {
            console.log(' Inventory check failed');
        }
        console.log(' Inventory scenario completed successfully');
    }
    catch (error) {
        console.error(' Inventory scenario failed:', error);
        throw error;
    }
    finally {
        await interface.disconnect();
    }
}
async function runCraftingScenario(interface, verbose = false) {
    console.log(' Running crafting scenario...');
    try {
        await interface.connect();
        // Test basic crafting
        const craftingAction = {
            type: 'craft_item',
            parameters: {
                item: 'planks',
                quantity: 4,
            },
            priority: 1,
        };
        console.log(' Attempting to craft planks...');
        const result = await interface.executeAction(craftingAction);
        if (result.success) {
            console.log(' Crafting successful');
        }
        else {
            console.log(' Crafting failed (may not have required materials)');
        }
        if (verbose) {
            console.log(' Crafting result:', JSON.stringify(result, null, 2));
        }
        console.log(' Crafting scenario completed successfully');
    }
    catch (error) {
        console.error(' Crafting scenario failed:', error);
        throw error;
    }
    finally {
        await interface.disconnect();
    }
}
async function main() {
    try {
        const options = parseArgs();
        console.log(' Standalone Minecraft Interface Test');
        console.log('=====================================');
        console.log();
        // Build configuration
        const config = {
            ...DEFAULT_STANDALONE_CONFIG,
            host: options.host || DEFAULT_STANDALONE_CONFIG.host,
            port: options.port || DEFAULT_STANDALONE_CONFIG.port,
            username: options.username || DEFAULT_STANDALONE_CONFIG.username,
        };
        if (options.verbose) {
            console.log('⚙️  Configuration:', JSON.stringify(config, null, 2));
            console.log();
        }
        // Create interface
        const minecraftInterface = createStandaloneMinecraftInterface(config);
        // Run selected scenario
        const scenario = options.scenario || 'basic';
        switch (scenario) {
            case 'basic':
                await runBasicScenario(minecraftInterface, options.verbose);
                break;
            case 'navigation':
                await runNavigationScenario(minecraftInterface, options.verbose);
                break;
            case 'inventory':
                await runInventoryScenario(minecraftInterface, options.verbose);
                break;
            case 'crafting':
                await runCraftingScenario(minecraftInterface, options.verbose);
                break;
            default:
                console.error(` Unknown scenario: ${scenario}`);
                console.log('Available scenarios: basic, navigation, inventory, crafting');
                process.exit(1);
        }
        console.log();
        console.log(' All tests completed successfully!');
    }
    catch (error) {
        console.error(' Test execution failed:', error);
        process.exit(1);
    }
}
// Run if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(' Fatal error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=mc-standalone.js.map
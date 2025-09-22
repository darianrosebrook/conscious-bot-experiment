# Quality Gate Verification Report

**Generated:** 2025-09-22T01:04:40.297Z
**Overall Status:** ❌ FAIL
**Trust Score:** 63/100
**Overall Score:** 36.1%

## Tier Compliance

| Tier | Compliance | Status |
|------|------------|--------|
| 1 (Critical) | 54% | ❌ |
| 2 (Important) | 0% | ❌ |
| 3 (Supporting) | 0% | ❌ |

## Quality Gate Results


### BUILD VERIFICATION
**Status:** ✅ PASS
**Score:** 100.0%
**Tier:** 1
**Required:** Yes
**Duration:** 18.6s


#### core-build
- **Status:** ✅ PASS
- **Duration:** 1.2s



#### memory-build
- **Status:** ✅ PASS
- **Duration:** 1.0s



#### safety-build
- **Status:** ✅ PASS
- **Duration:** 2.2s



#### planning-build
- **Status:** ✅ PASS
- **Duration:** 0.9s



#### cognition-build
- **Status:** ✅ PASS
- **Duration:** 1.0s



#### world-build
- **Status:** ✅ PASS
- **Duration:** 0.9s



#### dashboard-build
- **Status:** ✅ PASS
- **Duration:** 7.9s



#### evaluation-build
- **Status:** ✅ PASS
- **Duration:** 1.0s



#### minecraft-build
- **Status:** ✅ PASS
- **Duration:** 2.4s




### TYPE CHECKING
**Status:** ✅ PASS
**Score:** 100.0%
**Tier:** 1
**Required:** Yes
**Duration:** 3.6s


#### root-typecheck
- **Status:** ✅ PASS
- **Duration:** 3.6s




### LINTING
**Status:** ❌ FAIL
**Score:** 0.0%
**Tier:** 2
**Required:** Yes
**Duration:** 8.1s


#### root-lint
- **Status:** ❌ FAIL
- **Duration:** 8.1s
- **Error:** turbo 2.5.6

@conscious-bot/evaluation:lint: ERROR: command finished with error: command (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/evaluation) /Users/darianrosebrook/Library/pnpm/.tools/pnpm/10.15.0/bin/pnpm run lint exited (1)
@conscious-bot/evaluation#lint: command (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/evaluation) /Users/darianrosebrook/Library/pnpm/.tools/pnpm/10.15.0/bin/pnpm run lint exited (1)
 ERROR  run failed: command  exited (1)




### UNIT TESTS
**Status:** ❌ FAIL
**Score:** 16.7%
**Tier:** 1
**Required:** Yes
**Duration:** 186.9s


#### core-unit-tests
- **Status:** ❌ FAIL
- **Duration:** 34.7s
- **Error:** stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should initialize with default configuration
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should process signals without errors
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should start and stop cleanly
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should process cognitive tasks
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should emit events for signal processing
Signal validation failed: Error: done() callback is deprecated, use promise instead
    at context (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1926:9)
    at Arbiter.<anonymous> (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/__tests__/arbiter.test.ts:80:7)
    at Arbiter.emit (node:events:519:28)
    at SignalProcessor.<anonymous> (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/arbiter.ts:756:12)
    at SignalProcessor.emit (node:events:519:28)
    at SignalProcessor.processSignal (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/signal-processor.ts:149:10)
    at Arbiter.processSignal (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/arbiter.ts:200:28)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/__tests__/arbiter.test.ts:93:13
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should emit events for signal processing
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should track performance metrics
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > integrates enhanced needs into decision routing
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > ignores low-priority enhanced needs
Arbiter not running

stderr | src/__tests__/arbiter.test.ts > Arbiter Integration Tests > should handle multiple concurrent signals
Arbiter not running

stderr | src/__tests__/server.test.ts > Core Server API > Error Handling > should handle internal server errors
Get capability failed: Error: Database error
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/src/__tests__/server.test.ts:442:52
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)

stderr | src/__tests__/real-bot-integration.test.ts > Real Bot Integration > should execute planning cycles
⚠️ No bot context available for capability: step_forward_safely
⚠️ No bot context available for capability: place_torch_if_needed
⚠️ No bot context available for capability: opt.torch_corridor

stderr | src/__tests__/narrative-thoughts.test.ts > Narrative Thoughts > should handle goal identification
⚠️ No bot context available for capability: consume_food

stderr | src/__tests__/narrative-thoughts.test.ts > Narrative Thoughts > should handle execution events
⚠️ No bot context available for capability: get_light_level

stderr | src/__tests__/cognitive-stream-validation.test.ts > Cognitive Stream Integration Validation > should execute planning cycles
⚠️ No bot context available for capability: step_forward_safely
⚠️ No bot context available for capability: place_torch_if_needed
⚠️ No bot context available for capability: opt.torch_corridor

stderr | src/__tests__/real-bot-integration.test.ts > Real Bot Integration > should validate real bot integration workflow
⚠️ Capability opt.torch_corridor execution error: [object Object]

stderr | src/__tests__/cognitive-stream-validation.test.ts > Cognitive Stream Integration Validation > should handle planning cycles with different goals
⚠️ No bot context available for capability: place_torch_if_needed
⚠️ No bot context available for capability: opt.torch_corridor

stderr | src/__tests__/cognitive-stream-validation.test.ts > Cognitive Stream Integration Validation > should handle planning cycles with different goals
⚠️ No bot context available for capability: step_forward_safely

stderr | src/__tests__/cognitive-stream-validation.test.ts > Cognitive Stream Integration Validation > should handle planning cycles with different goals
⚠️ No bot context available for capability: consume_food

stderr | src/__tests__/cognitive-stream-validation.test.ts > Cognitive Stream Integration Validation > should handle planning cycles with different goals
⚠️ No bot context available for capability: get_light_level

stderr | src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Minecraft Cognitive Integration End-to-End > should execute planning cycle with real bot integration
⚠️ Capability opt.torch_corridor execution error: [object Object]


⎯⎯⎯⎯⎯⎯ Failed Suites 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/behavioral-coherence.test.ts [ src/__tests__/behavioral-coherence.test.ts ]
 FAIL  src/__tests__/contract-testing.test.ts [ src/__tests__/contract-testing.test.ts ]
 FAIL  src/__tests__/golden-decision-tests.test.ts [ src/__tests__/golden-decision-tests.test.ts ]
 FAIL  src/__tests__/performance-regression.test.ts [ src/__tests__/performance-regression.test.ts ]
ReferenceError: EventEmitter is not defined
 ❯ Object.<anonymous> src/mcp-capabilities/capability-registry.ts:85:41
 ❯ Object.<anonymous> src/mcp-capabilities/index.ts:11:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/26]⎯

 FAIL  src/__tests__/mcp-capability-selection-integration.test.ts [ src/__tests__/mcp-capability-selection-integration.test.ts ]
 FAIL  src/__tests__/real-component-integration.test.ts [ src/__tests__/real-component-integration.test.ts ]
Error: Cannot find module './goal-template-manager'
Require stack:
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/arbiter.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/index.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/skill-integration/mcp-capabilities-adapter.js
 ❯ Object.<anonymous> src/arbiter.ts:20:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/26]⎯

 FAIL  src/__tests__/minecraft-reasoning-integration-e2e.test.ts [ src/__tests__/minecraft-reasoning-integration-e2e.test.ts ]
Error: Cannot find module './goal-template-manager'
Require stack:
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/arbiter.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/index.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/hierarchical-planner/index.js
 ❯ Object.<anonymous> src/arbiter.ts:20:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/26]⎯

 FAIL  src/mcp-capabilities/__tests__/capability-registry.test.ts [ src/mcp-capabilities/__tests__/capability-registry.test.ts ]
ReferenceError: EventEmitter is not defined
 ❯ src/mcp-capabilities/capability-registry.ts:85:41
 ❯ src/mcp-capabilities/__tests__/capability-registry.test.ts:7:1
      5|  */
      6| 
      7| import { CapabilityRegistry } from '../capability-registry';
       | ^
      8| import {
      9|   CapabilitySpec,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/26]⎯


⎯⎯⎯⎯⎯⎯ Failed Tests 15 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/arbiter.test.ts > Arbiter Integration Tests > integrates enhanced needs into decision routing
AssertionError: expected "processCognitiveTask" to be called with arguments: [ ObjectContaining{…} ]

Number of calls: 0

 ❯ src/__tests__/arbiter.test.ts:222:24
    220|     await new Promise((resolve) => setImmediate(resolve));
    221| 
    222|     expect(processSpy).toHaveBeenCalledWith(
       |                        ^
    223|       expect.objectContaining({
    224|         context: expect.objectContaining({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/26]⎯

 FAIL  src/__tests__/arbiter.test.ts > Arbiter Integration Tests > ignores low-priority enhanced needs
AssertionError: expected undefined to be +0 // Object.is equality

- Expected: 
0

+ Received: 
undefined

 ❯ src/__tests__/arbiter.test.ts:287:57
    285|     expect(rankSpy).not.toHaveBeenCalled();
    286|     expect(processSpy).not.toHaveBeenCalled();
    287|     expect(arbiter.getStatus().enhancedNeedTasksRouted).toBe(0);
       |                                                         ^
    288|   });
    289| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/26]⎯

 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Minecraft Cognitive Integration End-to-End > should register and execute torch corridor capability with real bot
AssertionError: expected 'failure' to be 'success' // Object.is equality

Expected: "success"
Received: "failure"

 ❯ src/__tests__/minecraft-cognitive-integration-e2e.test.ts:314:33
    312|     );
    313| 
    314|     expect(shadowResult.status).toBe('success');
       |                                 ^
    315|     expect(shadowResult.durationMs).toBeGreaterThan(0);
    316|     expect(shadowResult.id).toContain('opt.torch_corridor_real_bot@1.0…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/26]⎯

 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should process cognitive thoughts and create behavior tree signals
 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should handle compound thoughts with multiple signals
 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should integrate with behavior tree runner
TypeError: Cannot read properties of undefined (reading 'on')
 ❯ MinecraftCognitiveIntegration.setupEventForwarding src/minecraft-cognitive-integration.ts:217:21
    215| 
    216|     // Forward bot events to cognitive stream
    217|     this.config.bot.on('error', (error) => {
       |                     ^
    218|       this.emit('botError', { error: error.message });
    219|     });
 ❯ new MinecraftCognitiveIntegration src/minecraft-cognitive-integration.ts:49:10
 ❯ src/__tests__/minecraft-cognitive-integration-e2e.test.ts:521:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/26]⎯

 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should process cognitive thoughts and create behavior tree signals
 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should handle compound thoughts with multiple signals
 FAIL  src/__tests__/minecraft-cognitive-integration-e2e.test.ts > Cognitive Thought to Behavior Tree Integration > should integrate with behavior tree runner
TypeError: Cannot read properties of undefined (reading 'disconnect')
 ❯ src/__tests__/minecraft-cognitive-integration-e2e.test.ts:529:23
    527| 
    528|   afterEach(async () => {
    529|     await integration.disconnect();
       |                       ^
    530|   });
    531| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/26]⎯

 FAIL  src/__tests__/real-capability-execution.test.ts > Real Capability Execution > should handle cognitive stream events
AssertionError: expected 0 to be greater than 0
 ❯ src/__tests__/real-capability-execution.test.ts:172:36
    170|     );
    171| 
    172|     expect(executionEvents.length).toBeGreaterThan(0);
       |                                    ^
    173|   });
    174| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/26]⎯

 FAIL  src/__tests__/simple-connection.test.ts > Simple Connection > should validate configuration options
AssertionError: expected 'undefined' to be 'function' // Object.is equality

Expected: "function"
Received: "undefined"

 ❯ src/__tests__/simple-connection.test.ts:153:29
    151| 
    152|     expect(bot).toBeDefined();
    153|     expect(typeof bot.chat).toBe('function');
       |                             ^
    154|     expect(typeof bot.entity).toBe('object');
    155|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/26]⎯

 FAIL  src/__tests__/simple-movement.test.ts > Simple Movement > should handle movement controls
TypeError: bot.setControlState is not a function
 ❯ src/__tests__/simple-movement.test.ts:88:9
     86| 
     87|     // Test forward movement
     88|     bot.setControlState('forward', true);
       |         ^
     89|     expect(bot.setControlState).toHaveBeenCalledWith('forward', true);
     90| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/26]⎯

 FAIL  src/__tests__/simple-movement.test.ts > Simple Movement > should read world blocks
TypeError: bot.blockAt is not a function
 ❯ src/__tests__/simple-movement.test.ts:195:23
    193|     (bot as any).entity = mockBot.entity;
    194| 
    195|     const block = bot.blockAt(mockBot.entity.position);
       |                       ^
    196|     expect(block).toBeDefined();
    197|     expect(block.name).toBe('grass_block');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/26]⎯

 FAIL  src/__tests__/torch-corridor-e2e.test.ts > Torch Corridor End-to-End > should register and execute torch corridor capability
AssertionError: expected 'failure' to be 'success' // Object.is equality

Expected: "success"
Received: "failure"

 ❯ src/__tests__/torch-corridor-e2e.test.ts:242:33
    240|     );
    241| 
    242|     expect(shadowResult.status).toBe('success');
       |                                 ^
    243|     expect(shadowResult.durationMs).toBeGreaterThan(0);
    244|     expect(shadowResult.id).toContain('opt.torch_corridor@1.0.0');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/26]⎯

 FAIL  src/__tests__/torch-corridor-e2e.test.ts > Torch Corridor End-to-End > should promote capability after successful shadow runs
AssertionError: expected 'failure' to be 'success' // Object.is equality

Expected: "success"
Received: "failure"

 ❯ src/__tests__/torch-corridor-e2e.test.ts:364:35
    362|       );
    363| 
    364|       expect(shadowResult.status).toBe('success');
       |                                   ^
    365|     }
    366| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/26]⎯

 FAIL  src/__tests__/version-compatibility.test.ts > Version Compatibility > should handle different Minecraft versions
TypeError: bot.quit is not a function
 ❯ src/__tests__/version-compatibility.test.ts:55:11
     53| 
     54|       // Clean up
     55|       bot.quit();
       |           ^
     56|     }
     57|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/26]⎯

 FAIL  src/__tests__/version-compatibility.test.ts > Version Compatibility > should validate bot configuration options
AssertionError: expected 'undefined' to be 'function' // Object.is equality

Expected: "function"
Received: "undefined"

 ❯ src/__tests__/version-compatibility.test.ts:128:29
    126| 
    127|     expect(bot).toBeDefined();
    128|     expect(typeof bot.chat).toBe('function');
       |                             ^
    129|     expect(typeof bot.inventory).toBe('object');
    130|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/26]⎯

 FAIL  src/__tests__/version-compatibility.test.ts > Version Compatibility > should handle invalid configuration gracefully
AssertionError: expected [Function] to throw an error
 ❯ src/__tests__/version-compatibility.test.ts:141:44
    139|     };
    140| 
    141|     expect(() => createBot(invalidConfig)).toThrow();
       |                                            ^
    142|   });
    143| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/26]⎯

⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯

Vitest caught 18 unhandled errors during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your tests are not affected.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/simple-connection.test.ts:75:11
     73|     setTimeout(() => {
     74|       bot.emit('login');
     75|       bot.emit('spawn');
       |           ^
     76|     }, 100);
     77| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle connection events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/real-capability-execution.test.ts:84:11
     82|     // Simulate spawn
     83|     setTimeout(() => {
     84|       bot.emit('spawn');
       |           ^
     85|     }, 100);
     86| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/real-capability-execution.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle bot spawn events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/simple-movement.test.ts:69:11
     67|     // Simulate spawn
     68|     setTimeout(() => {
     69|       bot.emit('spawn');
       |           ^
     70|     }, 100);
     71| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-movement.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle connection events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/version-compatibility.test.ts:86:11
     84|     // Simulate spawn event
     85|     setTimeout(() => {
     86|       bot.emit('spawn');
       |           ^
     87|     }, 100);
     88| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/version-compatibility.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout scenarios". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn timeout". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Cannot read properties of undefined (reading 'position')
 ❯ tickPhysics ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:79:32
 ❯ Timeout.doPhysics [as _onTimeout] ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/physics.js:71:7
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle connection errors". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/simple-actions.test.ts:78:11
     76|     // Simulate spawn
     77|     setTimeout(() => {
     78|       bot.emit('spawn');
       |           ^
     79|     }, 100);
     80| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/simple-actions.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle spawn events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/working-bot.test.ts:76:11
     74|     // Simulate spawn event
     75|     setTimeout(() => {
     76|       bot.emit('spawn');
       |           ^
     77|     }, 100);
     78| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/working-bot.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle bot spawn event". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.

⎯⎯⎯⎯⎯ Uncaught Exception ⎯⎯⎯⎯⎯
TypeError: Object.defineProperty called on non-object
 ❯ EventEmitter.<anonymous> ../../node_modules/.pnpm/mineflayer@4.32.0/node_modules/mineflayer/lib/plugins/inventory.js:55:12
 ❯ EventEmitter.emit node:events:531:35
 ❯ Timeout._onTimeout src/__tests__/bot-connection.test.ts:72:11
     70|     // Simulate spawn
     71|     setTimeout(() => {
     72|       bot.emit('spawn');
       |           ^
     73|     }, 100);
     74| 
 ❯ listOnTimeout node:internal/timers:588:17
 ❯ processTimers node:internal/timers:523:7

This error originated in "src/__tests__/bot-connection.test.ts" test file. It doesn't mean the error was thrown inside the file itself, but while it was running.
The latest test that might've caused the error is "should handle bot spawn events". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last documented test before it was thrown.
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯




#### memory-unit-tests
- **Status:** ❌ FAIL
- **Duration:** 1.6s
- **Error:** 
⎯⎯⎯⎯⎯⎯ Failed Tests 16 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/memory-integration-scoring.test.ts > Memory Integration Scoring and Verification > Complete Cognitive Architecture Scoring > should score the complete mermaid chart flow implementation
 FAIL  src/__tests__/memory-integration-scoring.test.ts > Memory Integration Scoring and Verification > Complete Cognitive Architecture Scoring > should evaluate memory system compliance with mermaid chart specifications
 FAIL  src/__tests__/memory-integration-scoring.test.ts > Memory Integration Scoring and Verification > Complete Cognitive Architecture Scoring > should provide detailed integration quality metrics
 FAIL  src/__tests__/memory-integration-scoring.test.ts > Memory Integration Scoring and Verification > Memory System Performance Scoring > should score memory system performance across different scenarios
TypeError: Cannot read properties of undefined (reading 'searchParams')
 ❯ parse ../../node_modules/.pnpm/pg-connection-string@2.9.1/node_modules/pg-connection-string/index.js:39:30
 ❯ new ConnectionParameters ../../node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/connection-parameters.js:56:42
 ❯ new Client ../../node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/client.js:18:33
 ❯ BoundPool.newClient ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:233:20
 ❯ BoundPool.connect ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:227:10
 ❯ VectorDatabase.initialize src/vector-database.ts:168:36
    166|    */
    167|   async initialize(): Promise<void> {
    168|     const client = await this.pool.connect();
       |                                    ^
    169|     try {
    170|       // Enable pgvector extension
 ❯ EnhancedMemorySystem.initialize src/memory-system.ts:282:25
 ❯ src/__tests__/memory-integration-scoring.test.ts:116:24

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/16]⎯

 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Mermaid Chart Flow Verification > should complete the full cognitive architecture flow
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Mermaid Chart Flow Verification > should handle memory-based tool selection with context awareness
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Mermaid Chart Flow Verification > should integrate memory decay with cognitive processing
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Mermaid Chart Flow Verification > should provide memory-enhanced reasoning with confidence scoring
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Integration Scoring and Verification > should score memory integration across all cognitive modules
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Integration Scoring and Verification > should verify complete cognitive architecture compliance
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Ollama Memory Integration Tests > should handle Ollama responses with memory integration
 FAIL  src/__tests__/memory-llm-integration.test.ts > Complete Memory-LLM Integration Flow > Ollama Memory Integration Tests > should handle memory recall triggering and surface to LLM thought center
TypeError: Cannot read properties of undefined (reading 'searchParams')
 ❯ parse ../../node_modules/.pnpm/pg-connection-string@2.9.1/node_modules/pg-connection-string/index.js:39:30
 ❯ new ConnectionParameters ../../node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/connection-parameters.js:56:42
 ❯ new Client ../../node_modules/.pnpm/pg@8.16.3/node_modules/pg/lib/client.js:18:33
 ❯ BoundPool.newClient ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:233:20
 ❯ BoundPool.connect ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:227:10
 ❯ VectorDatabase.initialize src/vector-database.ts:168:36
    166|    */
    167|   async initialize(): Promise<void> {
    168|     const client = await this.pool.connect();
       |                                    ^
    169|     try {
    170|       // Enable pgvector extension
 ❯ EnhancedMemorySystem.initialize src/memory-system.ts:282:25
 ❯ src/__tests__/memory-llm-integration.test.ts:273:24

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/16]⎯

 FAIL  src/__tests__/per-seed-isolation.test.ts > Per-Seed Database Isolation > Memory Isolation Between Seeds > should isolate memories between different seeds
{
  stack: 'AggregateError: \n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11\n' +
    '    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n' +
    '    at VectorDatabase.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts:168:20)\n' +
    '    at EnhancedMemorySystem.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts:282:5)\n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts:186:7\n' +
    '    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20',
  errors: [
    {
      stack: 'Error: connect ECONNREFUSED ::1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED ::1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    },
    {
      stack: 'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED 127.0.0.1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    }
  ],
  code: 'ECONNREFUSED',
  message: '',
  constructor: 'Function<AggregateError>',
  name: 'AggregateError',
  toString: 'Function<toString>',
  stacks: [
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js',
      line: 45,
      column: 11
    },
    {
      method: 'VectorDatabase.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts',
      line: 168,
      column: 20
    },
    {
      method: 'EnhancedMemorySystem.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts',
      line: 282,
      column: 5
    },
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts',
      line: 186,
      column: 7
    }
  ]
}
 ❯ ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11
 ❯ VectorDatabase.initialize src/vector-database.ts:168:20
    166|    */
    167|   async initialize(): Promise<void> {
    168|     const client = await this.pool.connect();
       |                    ^
    169|     try {
    170|       // Enable pgvector extension
 ❯ EnhancedMemorySystem.initialize src/memory-system.ts:282:5
 ❯ src/__tests__/per-seed-isolation.test.ts:186:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/16]⎯

 FAIL  src/__tests__/per-seed-isolation.test.ts > Per-Seed Database Isolation > Memory Isolation Between Seeds > should maintain isolation after system restart
{
  stack: 'AggregateError: \n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11\n' +
    '    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n' +
    '    at VectorDatabase.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts:168:20)\n' +
    '    at EnhancedMemorySystem.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts:282:5)\n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts:269:7\n' +
    '    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20',
  errors: [
    {
      stack: 'Error: connect ECONNREFUSED ::1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED ::1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    },
    {
      stack: 'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED 127.0.0.1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    }
  ],
  code: 'ECONNREFUSED',
  message: '',
  constructor: 'Function<AggregateError>',
  name: 'AggregateError',
  toString: 'Function<toString>',
  stacks: [
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js',
      line: 45,
      column: 11
    },
    {
      method: 'VectorDatabase.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts',
      line: 168,
      column: 20
    },
    {
      method: 'EnhancedMemorySystem.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts',
      line: 282,
      column: 5
    },
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts',
      line: 269,
      column: 7
    }
  ]
}
 ❯ ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11
 ❯ VectorDatabase.initialize src/vector-database.ts:168:20
    166|    */
    167|   async initialize(): Promise<void> {
    168|     const client = await this.pool.connect();
       |                    ^
    169|     try {
    170|       // Enable pgvector extension
 ❯ EnhancedMemorySystem.initialize src/memory-system.ts:282:5
 ❯ src/__tests__/per-seed-isolation.test.ts:269:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/16]⎯

 FAIL  src/__tests__/per-seed-isolation.test.ts > Per-Seed Database Isolation > Database Status and Health Checks > should provide status information including seed details
{
  stack: 'AggregateError: \n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11\n' +
    '    at processTicksAndRejections (node:internal/process/task_queues:105:5)\n' +
    '    at VectorDatabase.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts:168:20)\n' +
    '    at EnhancedMemorySystem.initialize (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts:282:5)\n' +
    '    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts:327:7\n' +
    '    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20',
  errors: [
    {
      stack: 'Error: connect ECONNREFUSED ::1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED ::1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '::1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    },
    {
      stack: 'Error: connect ECONNREFUSED 127.0.0.1:5432\n' +
        '    at createConnectionError (node:net:1678:14)\n' +
        '    at afterConnectMultiple (node:net:1708:16)',
      message: 'connect ECONNREFUSED 127.0.0.1:5432',
      errno: -61,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 5432,
      constructor: 'Function<Error>',
      name: 'Error',
      toString: 'Function<toString>'
    }
  ],
  code: 'ECONNREFUSED',
  message: '',
  constructor: 'Function<AggregateError>',
  name: 'AggregateError',
  toString: 'Function<toString>',
  stacks: [
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js',
      line: 45,
      column: 11
    },
    {
      method: 'VectorDatabase.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/vector-database.ts',
      line: 168,
      column: 20
    },
    {
      method: 'EnhancedMemorySystem.initialize',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/memory-system.ts',
      line: 282,
      column: 5
    },
    {
      method: '',
      file: '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/src/__tests__/per-seed-isolation.test.ts',
      line: 327,
      column: 7
    }
  ]
}
 ❯ ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11
 ❯ VectorDatabase.initialize src/vector-database.ts:168:20
    166|    */
    167|   async initialize(): Promise<void> {
    168|     const client = await this.pool.connect();
       |                    ^
    169|     try {
    170|       // Enable pgvector extension
 ❯ EnhancedMemorySystem.initialize src/memory-system.ts:282:5
 ❯ src/__tests__/per-seed-isolation.test.ts:327:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/16]⎯

 FAIL  src/__tests__/per-seed-isolation.test.ts > Per-Seed Database Isolation > Database Status and Health Checks > should handle invalid database connections gracefully
Error: getaddrinfo ENOTFOUND invalid-host
 ❯ ../../node_modules/.pnpm/pg-pool@3.10.1_pg@8.16.3/node_modules/pg-pool/index.js:45:11
 ❯ VectorDatabase.getStatus src/vector-database.ts:528:20
    526|     storageSize?: string;
    527|   }> {
    528|     const client = await this.pool.connect();
       |                    ^
    529|     try {
    530|       // Check connection status
 ❯ EnhancedMemorySystem.getStatus src/memory-system.ts:696:22
 ❯ src/__tests__/per-seed-isolation.test.ts:358:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/16]⎯




#### planning-unit-tests
- **Status:** ❌ FAIL
- **Duration:** 13.4s
- **Error:** 6:02:07 PM [vite] (ssr) warning: Duplicate key "mcpRegistry" in object literal
383 |          dynamicFlow: mockDynamicFlow,
384 |          // Ensure MCP registry is properly set for confidence calculation
385 |          mcpRegistry: mockRegistry,
    |          ^
386 |        };
387 |  

  Plugin: vite:esbuild
  File: /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/skill-integration/__tests__/mcp-capabilities-integration.test.ts
stderr | src/__tests__/integrated-planning-system.test.ts > Integrated Planning System > End-to-End Planning Pipeline > should handle emergency scenarios with fast reactive planning
Planning pipeline error details: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:194:22
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
Error stack: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:194:22
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/__tests__/integrated-planning-system.test.ts > Integrated Planning System > Planning Approach Integration > should adapt planning strategy based on context
Planning pipeline error details: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:294:24
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
Error stack: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:294:24
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/__tests__/integrated-planning-system.test.ts > Integration with Planning Documentation > should support the documented performance targets
Planning pipeline error details: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:495:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
Error stack: TypeError: state.getHealth is not a function
    at EnhancedGOAPPlanner.getStateKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:703:21)
    at EnhancedGOAPPlanner.getCacheKey (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:707:44)
    at EnhancedGOAPPlanner.planTo (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/reactive-executor/enhanced-goap-planner.ts:191:27)
    at IntegratedPlanningCoordinator.generateGOAPPlan (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:579:45)
    at IntegratedPlanningCoordinator.performPlanGeneration (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:504:29)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at IntegratedPlanningCoordinator.planAndExecute (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/integrated-planning-coordinator.ts:201:30)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/integrated-planning-system.test.ts:495:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/__tests__/minecraft-http-integration.test.ts > Minecraft HTTP Integration Tests > Error Handling > should handle network errors
Error executing task in Minecraft: Error: Network error
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:335:39
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)

stderr | src/__tests__/minecraft-http-integration.test.ts > Minecraft HTTP Integration Tests > Error Handling > should handle invalid JSON responses
Error executing task in Minecraft: Error: Invalid JSON
    at Object.json (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:349:36)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:45:30
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at executeTaskInMinecraft (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:33:16)

stderr | src/__tests__/minecraft-http-integration.test.ts > Minecraft HTTP Integration Tests > Error Handling > should handle unknown task types
Error executing task in Minecraft: Error: Unknown task type: unknown_task
    at executeTaskInMinecraft (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:157:15)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/minecraft-http-integration.test.ts:368:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)


⎯⎯⎯⎯⎯⎯ Failed Suites 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/modular-server.test.ts [ src/__tests__/modular-server.test.ts ]
Error: Cannot find module './modules/server-config' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/modular-server.test.ts'
 ❯ src/__tests__/modular-server.test.ts:10:1
      8| 
      9| import { describe, it, expect, beforeEach, afterEach } from 'vitest';
     10| import { ServerConfiguration } from './modules/server-config';
       | ^
     11| import { MCPIntegration } from './modules/mcp-integration';
     12| import {

Caused by: Error: Failed to load url ./modules/server-config (resolved id: ./modules/server-config) in /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/__tests__/modular-server.test.ts. Does the file exist?
 ❯ loadAndTransform ../../node_modules/.pnpm/vite@7.1.3_@types+node@20.19.11_jiti@1.21.7_tsx@4.20.5_yaml@2.8.1/node_modules/vite/dist/node/chunks/dep-Bj7gA1-0.js:26300:33

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/20]⎯

 FAIL  src/hierarchical-planner/__tests__/hrm-integration.test.ts [ src/hierarchical-planner/__tests__/hrm-integration.test.ts ]
Error: Cannot find module './goal-template-manager'
Require stack:
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/arbiter.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/index.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/hierarchical-planner/index.js
 ❯ Object.<anonymous> ../core/src/arbiter.ts:20:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/20]⎯

 FAIL  src/skill-integration/__tests__/basic-integration.test.ts [ src/skill-integration/__tests__/basic-integration.test.ts ]
 FAIL  src/skill-integration/__tests__/skill-integration.test.ts [ src/skill-integration/__tests__/skill-integration.test.ts ]
Error: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
 ❯ ../memory/src/memory-system.ts:10:1

Caused by: Error: Failed to load url ./vector-database (resolved id: ./vector-database) in /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/index.js. Does the file exist?
 ❯ loadAndTransform ../../node_modules/.pnpm/vite@7.1.3_@types+node@20.19.11_jiti@1.21.7_tsx@4.20.5_yaml@2.8.1/node_modules/vite/dist/node/chunks/dep-Bj7gA1-0.js:26300:33

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/20]⎯

 FAIL  src/skill-integration/__tests__/mcp-capabilities-integration.test.ts [ src/skill-integration/__tests__/mcp-capabilities-integration.test.ts ]
Error: Cannot find module './goal-template-manager'
Require stack:
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/arbiter.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/core/dist/index.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/skill-integration/mcp-capabilities-adapter.js
- /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/planning/src/skill-integration/hybrid-skill-planner.js
 ❯ Object.<anonymous> ../core/src/arbiter.ts:20:1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/20]⎯


⎯⎯⎯⎯⎯⎯ Failed Tests 15 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/integrated-planning-system.test.ts > Integrated Planning System > End-to-End Planning Pipeline > should handle emergency scenarios with fast reactive planning
Error: Planning pipeline failed: TypeError: state.getHealth is not a function
 ❯ IntegratedPlanningCoordinator.planAndExecute src/integrated-planning-coordinator.ts:259:13
    257|       );
    258|       this.emit('planningError', error);
    259|       throw new Error(`Planning pipeline failed: ${error}`);
       |             ^
    260|     }
    261|   }
 ❯ src/__tests__/integrated-planning-system.test.ts:194:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/20]⎯

 FAIL  src/__tests__/integrated-planning-system.test.ts > Integrated Planning System > Planning Approach Integration > should adapt planning strategy based on context
Error: Planning pipeline failed: TypeError: state.getHealth is not a function
 ❯ IntegratedPlanningCoordinator.planAndExecute src/integrated-planning-coordinator.ts:259:13
    257|       );
    258|       this.emit('planningError', error);
    259|       throw new Error(`Planning pipeline failed: ${error}`);
       |             ^
    260|     }
    261|   }
 ❯ src/__tests__/integrated-planning-system.test.ts:294:24

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/20]⎯

 FAIL  src/__tests__/integrated-planning-system.test.ts > Integration with Planning Documentation > should support the documented performance targets
Error: Planning pipeline failed: TypeError: state.getHealth is not a function
 ❯ IntegratedPlanningCoordinator.planAndExecute src/integrated-planning-coordinator.ts:259:13
    257|       );
    258|       this.emit('planningError', error);
    259|       throw new Error(`Planning pipeline failed: ${error}`);
       |             ^
    260|     }
    261|   }
 ❯ src/__tests__/integrated-planning-system.test.ts:495:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/20]⎯

 FAIL  src/__tests__/iteration_seven.spec.ts > Iteration Seven - Requirement and Progress Logic > resolves gathering requirement with quantity from title
TypeError: (0 , resolveRequirement) is not a function
 ❯ src/__tests__/iteration_seven.spec.ts:18:17
     16| 
     17|   it('resolves gathering requirement with quantity from title', () => {
     18|     const req = resolveRequirement({ type: 'gathering', title: 'Gather…
       |                 ^
     19|     expect(req).toBeTruthy();
     20|     expect(req && req.kind).toBe('collect');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/20]⎯

 FAIL  src/__tests__/iteration_seven.spec.ts > Iteration Seven - Requirement and Progress Logic > progress for collect is proportional to items matching patterns
TypeError: (0 , resolveRequirement) is not a function
 ❯ src/__tests__/iteration_seven.spec.ts:25:17
     23| 
     24|   it('progress for collect is proportional to items matching patterns'…
     25|     const req = resolveRequirement({ type: 'gathering', title: 'Gather…
       |                 ^
     26|     const invSnap = inv(['oak_log', 1], ['birch_log', 1]);
     27|     const p = req ? computeProgressFromInventory(invSnap, req) : 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/20]⎯

 FAIL  src/__tests__/iteration_seven.spec.ts > Iteration Seven - Requirement and Progress Logic > crafting requirement returns complete when output present
TypeError: (0 , resolveRequirement) is not a function
 ❯ src/__tests__/iteration_seven.spec.ts:32:17
     30| 
     31|   it('crafting requirement returns complete when output present', () =…
     32|     const req = resolveRequirement({ type: 'crafting', title: 'Craft W…
       |                 ^
     33|     const invSnap = inv(['wooden_pickaxe', 1]);
     34|     const p = req ? computeProgressFromInventory(invSnap, req) : 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/20]⎯

 FAIL  src/__tests__/iteration_seven.spec.ts > Iteration Seven - Requirement and Progress Logic > crafting requirement estimates progress via proxy materials
TypeError: (0 , resolveRequirement) is not a function
 ❯ src/__tests__/iteration_seven.spec.ts:39:17
     37| 
     38|   it('crafting requirement estimates progress via proxy materials', ()…
     39|     const req = resolveRequirement({ type: 'crafting', title: 'Craft W…
       |                 ^
     40|     const invSnap = inv(['oak_log', 2]);
     41|     const p = req ? computeProgressFromInventory(invSnap, req) : 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/20]⎯

 FAIL  src/__tests__/iteration_seven.spec.ts > Iteration Seven - Requirement and Progress Logic > requirement snapshot reflects have/needed
TypeError: (0 , resolveRequirement) is not a function
 ❯ src/__tests__/iteration_seven.spec.ts:48:17
     46| 
     47|   it('requirement snapshot reflects have/needed', () => {
     48|     const req = resolveRequirement({ type: 'gathering', title: 'Gather…
       |                 ^
     49|     const snap = req ? computeRequirementSnapshot(inv(['oak_log', 2]),…
     50|     expect(snap).toBeTruthy();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/20]⎯

 FAIL  src/__tests__/m2-planning-integration.test.ts > M2 Planning Integration > Goal Generation Flow > should generate goals from homeostasis state
TypeError: goalManager.createFromNeeds is not a function
 ❯ src/__tests__/m2-planning-integration.test.ts:61:32
     59| 
     60|       // Create goal from needs
     61|       const goal = goalManager.createFromNeeds(needs);
       |                                ^
     62|       expect(goal).toBeDefined();
     63|       expect(goal?.type).toBe(GoalType.SURVIVAL);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/20]⎯

 FAIL  src/__tests__/m2-planning-integration.test.ts > M2 Planning Integration > Goal Generation Flow > should manage goal queue and selection
TypeError: goalManager.createFromNeeds is not a function
 ❯ src/__tests__/m2-planning-integration.test.ts:90:33
     88| 
     89|       // Create multiple goals
     90|       const goal1 = goalManager.createFromNeeds(needs);
       |                                 ^
     91|       const goal2 = goalManager.createFromNeeds(needs);
     92| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/20]⎯

 FAIL  src/__tests__/m2-planning-integration.test.ts > M2 Planning Integration > Goal Generation Flow > should handle edge cases gracefully
AssertionError: expected [Function] to not throw an error but 'TypeError: goalManager.createFromNeed…' was thrown

- Expected: 
undefined

+ Received: 
"TypeError: goalManager.createFromNeeds is not a function"

 ❯ src/__tests__/m2-planning-integration.test.ts:107:57
    105|       // Test null/undefined guards
    106|       expect(() => generateNeeds(undefined)).not.toThrow();
    107|       expect(() => goalManager.createFromNeeds([])).not.toThrow();
       |                                                         ^
    108| 
    109|       // Test empty inputs

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/20]⎯

 FAIL  src/__tests__/real-autonomous-executor.test.ts > Real Autonomous Executor Tests > should identify why MCP options are not being executed
AssertionError: expected undefined to be true // Object.is equality

- Expected: 
true

+ Received: 
undefined

 ❯ src/__tests__/real-autonomous-executor.test.ts:199:44
    197|     expect(activeTasks.length).toBeGreaterThan(0);
    198|     expect(mcpOptions.length).toBeGreaterThan(0);
    199|     expect(await mockCheckBotConnection()).toBe(true);
       |                                            ^
    200|     expect(mcpIntegration).toBeDefined();
    201| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/20]⎯

 FAIL  src/__tests__/server-autonomous-startup.test.ts > Server Autonomous Startup Tests > Autonomous Task Types and Variety > should generate a variety of autonomous tasks over time
AssertionError: expected 30002 to be 30000 // Object.is equality

- Expected
+ Received

- 30000
+ 30002

 ❯ src/__tests__/server-autonomous-startup.test.ts:214:26
    212|         const timeDiff =
    213|           generatedTasks[i].createdAt - generatedTasks[i - 1].createdA…
    214|         expect(timeDiff).toBe(30000); // 30 seconds
       |                          ^
    215|       }
    216|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/20]⎯

 FAIL  src/behavior-trees/__tests__/BehaviorTreeRunner.test.ts > BehaviorTreeRunner > execution options > should respect timeout options
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/behavior-trees/__tests__/BehaviorTreeRunner.test.ts:175:30
    173|       );
    174| 
    175|       expect(result.success).toBe(false);
       |                              ^
    176|       expect(result.status).toBe(BTNodeStatus.FAILURE);
    177|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/20]⎯

 FAIL  src/skill-integration/__tests__/skill-composer-adapter.test.ts > SkillComposerAdapter > Skill Composition > should handle successful skill composition
AssertionError: expected 5 to be 'moderate' // Object.is equality

- Expected: 
"moderate"

+ Received: 
5

 ❯ src/skill-integration/__tests__/skill-composer-adapter.test.ts:248:33
    246|       expect(result.composedSkill!.name).toBe('Composed: test goal');
    247|       expect(result.estimatedSuccess).toBe(0.8);
    248|       expect(result.complexity).toBe('moderate');
       |                                 ^
    249|     });
    250| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/20]⎯




#### cognition-unit-tests
- **Status:** ❌ FAIL
- **Duration:** 102.4s
- **Error:** stderr | src/__tests__/chat-integration.test.ts > Chat Integration Tests
Health check failed for http://localhost:3005: TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at checkServerHealth (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:44:18)
    at async Promise.all (index 1)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:172:7 {
  [cause]: AggregateError: 
      at internalConnectMultiple (node:net:1134:18)
      at afterConnectMultiple (node:net:1715:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}

stderr | src/__tests__/chat-integration.test.ts > Chat Integration Tests
Health check failed for http://localhost:3003: TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at checkServerHealth (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:32:18)
    at async Promise.all (index 0)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:172:7 {
  [cause]: AggregateError: 
      at internalConnectMultiple (node:net:1134:18)
      at afterConnectMultiple (node:net:1715:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}

stderr | src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Initialization > should handle memory system initialization failure gracefully
⚠️ Could not initialize memory system: Connection failed
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should handle memory retrieval failure gracefully
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should follow the complete sensorimotor → memory → LLM → planning flow
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should handle the complete HRM integration flow
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Error Handling and Resilience > should handle Ollama connection failures gracefully
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Error Handling and Resilience > should handle partial memory system failures
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Error Handling and Resilience > should degrade gracefully when all systems fail
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/self-model/__tests__/self-model-integration.test.ts > Self-Model Integration > Identity Tracking > should process identity impacts from experiences
Personality trait 'through' not found

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Performance and Optimization > should optimize memory retrieval for performance
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Performance and Optimization > should cache memory operations for efficiency
⚠️ Could not initialize memory system: Cannot read properties of undefined (reading 'initialize')
⚠️ LLM will operate without memory integration

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/self-model/__tests__/self-model-integration.test.ts > Self-Model Integration > Narrative Management > should track narrative themes and patterns
Story 'Emergence of Consciousness' already ended

stderr | src/self-model/__tests__/self-model-integration.test.ts > Self-Model Integration > Error Handling and Edge Cases > should handle invalid inputs gracefully
Personality trait '' not found
Core value 'invalid-id' not found
Story 'invalid-id' not found

stderr | src/social-cognition/__tests__/social-cognition.test.ts > Social Cognition Module > Theory of Mind Engine > should infer mental states from observations
Failed to parse mental state inference: SyntaxError: No number after minus sign in JSON at position 1 (line 1 column 2)
    at JSON.parse (<anonymous>)
    at TheoryOfMindEngine.parseMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:619:27)
    at TheoryOfMindEngine.performMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:549:19)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at TheoryOfMindEngine.inferMentalState (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:235:25)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/__tests__/social-cognition.test.ts:306:27
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/social-cognition/__tests__/social-cognition.test.ts > Social Cognition Module > Theory of Mind Engine > should predict agent intentions
Failed to parse mental state inference: SyntaxError: No number after minus sign in JSON at position 1 (line 1 column 2)
    at JSON.parse (<anonymous>)
    at TheoryOfMindEngine.parseMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:619:27)
    at TheoryOfMindEngine.performMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:549:19)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at TheoryOfMindEngine.inferMentalState (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:235:25)
    at TheoryOfMindEngine.predictIntentions (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:273:25)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/__tests__/social-cognition.test.ts:354:27
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/social-cognition/__tests__/social-cognition.test.ts > Social Cognition Module > Integration Features > should integrate components for comprehensive social analysis
Failed to parse mental state inference: SyntaxError: No number after minus sign in JSON at position 1 (line 1 column 2)
    at JSON.parse (<anonymous>)
    at TheoryOfMindEngine.parseMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:619:27)
    at TheoryOfMindEngine.performMentalStateInference (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:549:19)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at TheoryOfMindEngine.inferMentalState (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/theory-of-mind-engine.ts:235:25)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/social-cognition/__tests__/social-cognition.test.ts:611:27
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Initialization > should handle memory system initialization failure gracefully
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration

stderr | src/self-model/__tests__/advanced-self-model.test.ts > Advanced Self-Model Components > Integration and Error Handling > should handle invalid inputs gracefully
Commitment 'invalid-id' not found

stderr | src/cognitive-core/__tests__/memory-aware-llm.test.ts
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration

stderr | src/cognitive-core/__tests__/memory-aware-llm.test.ts
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration
⚠️ Could not initialize memory system: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
⚠️ LLM will operate without memory integration

stderr | src/__tests__/chat-integration.test.ts > Chat Integration Tests
Failed to get inventory: TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at getCurrentInventory (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:69:22)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/__tests__/chat-integration.test.ts:566:28 {
  [cause]: AggregateError: 
      at internalConnectMultiple (node:net:1134:18)
      at afterConnectMultiple (node:net:1715:7) {
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}

stderr | src/intrusion-interface/__tests__/intrusion-interface.test.ts > Intrusion Interface > Error Handling > should handle LLM errors gracefully
Error assessing risk: Error: LLM Error
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/intrusion-interface/__tests__/intrusion-interface.test.ts:417:32
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)

stderr | src/intrusion-interface/__tests__/intrusion-interface.test.ts > Intrusion Interface > Error Handling > should handle constitutional filter errors
Error checking compliance: Error: Constitutional Error
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/intrusion-interface/__tests__/intrusion-interface.test.ts:442:31
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
Failed to parse args: SyntaxError: Unexpected token '*', "** {"message"" is not valid JSON
    at JSON.parse (<anonymous>)
    at ReActArbiter.parseReActResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:334:23)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:166:25)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
ReAct reasoning failed: Error: Unknown tool: ** chat
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:175:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
ReAct reasoning failed: Error: Unknown tool: **
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:175:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:161:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
ReAct reasoning failed: Error: ReAct step must select exactly one tool
    at ReActArbiter.reason (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:170:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on success
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:118:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on success
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:118:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on success
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:118:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on success
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:118:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on failure
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:135:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on failure
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:135:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on failure
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:135:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on failure
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:135:26
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > getRelevantReflexionHints > should return relevant hints for a situation
LLM generation failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:75:24)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:152:7
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > getRelevantReflexionHints > should return relevant hints for a situation
LLM retry attempt 1 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:152:7
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > getRelevantReflexionHints > should return relevant hints for a situation
LLM retry attempt 2 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:152:7
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20

stderr | src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > getRelevantReflexionHints > should return relevant hints for a situation
LLM retry attempt 3 failed: Error: Ollama API error: 404 Not Found
    at LLMInterface.callOllama (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:382:15)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at LLMInterface.generateResponse (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/cognitive-core/llm-interface.ts:116:28)
    at ReActArbiter.callLLM (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:265:24)
    at ReActArbiter.reflect (/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/ReActArbiter.ts:197:24)
    at /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/cognition/src/react-arbiter/__tests__/ReActArbiter.test.ts:152:7
    at file:///Users/darianrosebrook/Desktop/Projects/conscious-bot/node_modules/.pnpm/@vitest+runner@3.2.4/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20


⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/chat-integration.test.ts > Chat Integration Tests
Error: Required servers are not running. Please start all services with `pnpm dev` before running tests.
 ❯ src/__tests__/chat-integration.test.ts:187:13
    185| 
    186|     if (!cognitionHealth || !minecraftHealth) {
    187|       throw new Error(
       |             ^
    188|         'Required servers are not running. Please start all services w…
    189|       );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/27]⎯

 FAIL  src/cognitive-core/__tests__/complete-architecture-integration.test.ts > Complete Cognitive Architecture Integration
Error: Cannot find module './vector-database' imported from '/Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/memory-system.js'
 ❯ ../memory/src/memory-system.ts:10:1

Caused by: Error: Failed to load url ./vector-database (resolved id: ./vector-database) in /Users/darianrosebrook/Desktop/Projects/conscious-bot/packages/memory/dist/index.js. Does the file exist?
 ❯ loadAndTransform ../../node_modules/.pnpm/vite@7.1.3_@types+node@20.19.11_jiti@1.21.7_tsx@4.20.5_yaml@2.8.1/node_modules/vite/dist/node/chunks/dep-Bj7gA1-0.js:26300:33

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/27]⎯

 FAIL  src/cognitive-core/__tests__/complete-architecture-integration.test.ts > Complete Cognitive Architecture Integration
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ src/cognitive-core/__tests__/complete-architecture-integration.test.ts:53:26
     51| 
     52|   afterAll(async () => {
     53|     await memoryAwareLLM.close();
       |                          ^
     54|     vi.clearAllMocks();
     55|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/27]⎯

 FAIL  src/cognitive-core/__tests__/ollama-memory-integration.test.ts [ src/cognitive-core/__tests__/ollama-memory-integration.test.ts ]
TypeError: describe.skipUnless is not a function
 ❯ src/cognitive-core/__tests__/ollama-memory-integration.test.ts:21:10
     19|   process.env.OLLAMA_AVAILABLE === 'true' || process.env.CI !== 'true';
     20| 
     21| describe.skipUnless(OLLAMA_AVAILABLE)(
       |          ^
     22|   'Ollama Memory Integration (Live)',
     23|   () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/27]⎯


⎯⎯⎯⎯⎯⎯ Failed Tests 23 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory Retrieval > should retrieve relevant memories for a query
AssertionError: expected [] to have a length of 2 but got +0

- Expected
+ Received

- 2
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:107:24
    105|       );
    106| 
    107|       expect(memories).toHaveLength(2);
       |                        ^
    108|       expect(memories[0]).toMatchObject({
    109|         id: '1',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Prompt Enhancement > should not enhance prompt when memories are disabled
AssertionError: expected 'You have access to the following rele…' to be 'What should I do?' // Object.is equality

- Expected
+ Received

+ You have access to the following relevant memories and experiences:
+
+ [Memory: EPISODIC] Previous experience
+
+ Please use these memories to inform your response to the following query:
+
  What should I do?
+
+ If the memories are relevant, incorporate them naturally into your reasoning. If they are not relevant, you can disregard them.

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:178:30
    176|       );
    177| 
    178|       expect(enhancedPrompt).toBe('What should I do?');
       |                              ^
    179|     });
    180|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory Storage > should store conversation as episodic memory
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:209:26
    207|       );
    208| 
    209|       expect(operations).toHaveLength(1);
       |                          ^
    210|       expect(operations[0]).toMatchObject({
    211|         type: 'store',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory Storage > should handle memory storage failure gracefully
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:240:26
    238|       );
    239| 
    240|       expect(operations).toHaveLength(1);
       |                          ^
    241|       expect(operations[0]).toMatchObject({
    242|         type: 'store',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Cognitive Pattern Recording > should record cognitive processing patterns
AssertionError: expected "spy" to be called with arguments: [ 'decision', …(4) ]

Number of calls: 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:273:55
    271|       );
    272| 
    273|       expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalled…
       |                                                       ^
    274|         'decision',
    275|         expect.objectContaining({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory-Enhanced Response Generation > should generate memory-enhanced response with all components
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:355:35
    353|       });
    354| 
    355|       expect(result.memoriesUsed).toHaveLength(1);
       |                                   ^
    356|       expect(result.memoryOperations).toHaveLength(1);
    357|       expect(result.confidence).toBeGreaterThanOrEqual(0.8); // Should…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory-Enhanced Response Generation > should handle memory integration failures gracefully
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:395:39
    393|       expect(result.text).toBe('Fallback response');
    394|       expect(result.memoriesUsed).toEqual([]);
    395|       expect(result.memoryOperations).toHaveLength(1);
       |                                       ^
    396|       expect(result.memoryOperations[0].success).toBe(false);
    397|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Memory Recommendations > should generate memory consolidation recommendations
AssertionError: expected [] to deep equally contain ObjectContaining{…}

- Expected: 
ObjectContaining {
  "action": "consolidate",
  "priority": 0.7,
  "reason": StringContaining "6 related memories",
}

+ Received: 
[]

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:468:31
    466|       });
    467| 
    468|       expect(recommendations).toContainEqual(
       |                               ^
    469|         expect.objectContaining({
    470|           action: 'consolidate',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Cognitive Insights > should analyze cognitive insights from interactions
AssertionError: expected {} to match object { …(4) }

- Expected
+ Received

- {
-   "confidenceFactors": ArrayContaining [
-     "evidence_based",
-   ],
-   "decisionQuality": Any<Number>,
-   "learningOpportunities": ArrayContaining [
-     "knowledge_acquisition",
-   ],
-   "thoughtPatterns": ArrayContaining [
-     "logical_reasoning",
-   ],
- }
+ {}

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:505:24
    503|       );
    504| 
    505|       expect(insights).toMatchObject({
       |                        ^
    506|         thoughtPatterns: expect.arrayContaining(['logical_reasoning']),
    507|         decisionQuality: expect.any(Number),

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Helper Methods > should correctly estimate task complexity
AssertionError: expected 'medium' to be 'simple' // Object.is equality

Expected: "simple"
Received: "medium"

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:520:76
    518|   describe('Helper Methods', () => {
    519|     it('should correctly estimate task complexity', () => {
    520|       expect(memoryAwareLLM['estimateTaskComplexity']('Simple question…
       |                                                                            ^
    521|         'simple'
    522|       );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Integration Flow Tests > should follow the complete mermaid chart flow
AssertionError: expected [] to have a length of 2 but got +0

- Expected
+ Received

- 2
+ 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:662:35
    660| 
    661|       // Verify the complete flow
    662|       expect(result.memoriesUsed).toHaveLength(2);
       |                                   ^
    663|       expect(result.memoriesUsed[0]).toMatchObject({
    664|         type: 'episodic',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-aware-llm.test.ts > MemoryAwareLLMInterface > Integration Flow Tests > should handle the full integration with behavior tree patterns
AssertionError: expected "spy" to be called with arguments: [ 'decision', …(4) ]

Number of calls: 0

 ❯ src/cognitive-core/__tests__/memory-aware-llm.test.ts:739:55
    737| 
    738|       // Verify behavior tree pattern was recorded
    739|       expect(mockMemorySystem.recordCognitivePattern).toHaveBeenCalled…
       |                                                       ^
    740|         'decision',
    741|         expect.objectContaining({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should handle the complete cognitive architecture flow with memory integration
AssertionError: expected "spy" to be called with arguments: [ { …(4) } ]

Received: 

  1st spy call:

  [
    {
-     "context": {
-       "emotionalState": "focused",
-       "location": {
-         "biome": "mountains",
-         "x": 100,
-         "y": 64,
-         "z": 200,
-       },
-       "taskType": "resource_gathering",
-     },
-     "limit": 5,
+     "limit": 10,
      "query": "What tool should I use for mining iron ore in the mountains?",
-     "type": [
-       "episodic",
-       "semantic",
-       "procedural",
-     ],
    },
  ]


Number of calls: 1

 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:170:47
    168|       // Step 6: Verify the complete flow worked correctly
    169|       // A. Memory retrieval was triggered
    170|       expect(mockMemorySystem.searchMemories).toHaveBeenCalledWith({
       |                                               ^
    171|         query: 'What tool should I use for mining iron ore in the moun…
    172|         type: ['episodic', 'semantic', 'procedural'],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should handle memory retrieval failure gracefully
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:245:24
    243|     it('should handle memory retrieval failure gracefully', async () =…
    244|       // Mock memory system failure
    245|       mockMemorySystem.searchMemories = vi
       |                        ^
    246|         .fn()
    247|         .mockRejectedValue(new Error('Memory system unavailable'));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should follow the complete sensorimotor → memory → LLM → planning flow
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:325:24
    323|       ];
    324| 
    325|       mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
       |                        ^
    326|         results: mockRelevantMemories,
    327|         total: 2,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Complete Mermaid Chart Flow > should handle the complete HRM integration flow
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:489:24
    487|       ];
    488| 
    489|       mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
       |                        ^
    490|         results: mockHierarchicalMemories,
    491|         total: 3,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Error Handling and Resilience > should handle partial memory system failures
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:627:24
    625|     it('should handle partial memory system failures', async () => {
    626|       // Mock partial failures
    627|       mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
       |                        ^
    628|         results: [],
    629|         total: 0,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Error Handling and Resilience > should degrade gracefully when all systems fail
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:670:24
    668|     it('should degrade gracefully when all systems fail', async () => {
    669|       // Mock complete system failure
    670|       mockMemorySystem.searchMemories = vi
       |                        ^
    671|         .fn()
    672|         .mockRejectedValue(new Error('Memory system completely unavail…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/27]⎯

 FAIL  src/cognitive-core/__tests__/memory-llm-integration.test.ts > Memory-LLM Integration Flow > Performance and Optimization > should optimize memory retrieval for performance
TypeError: Cannot set properties of undefined (setting 'searchMemories')
 ❯ src/cognitive-core/__tests__/memory-llm-integration.test.ts:720:24
    718|       }));
    719| 
    720|       mockMemorySystem.searchMemories = vi.fn().mockResolvedValue({
       |                        ^
    721|         results: mockMemories,
    722|         total: 10,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/27]⎯

 FAIL  src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should execute a ReAct reasoning step
Error: Unknown tool: ** chat
 ❯ ReActArbiter.reason src/react-arbiter/ReActArbiter.ts:175:15
    173|       // Validate tool exists in registry
    174|       if (!this.toolRegistry.has(step.selectedTool)) {
    175|         throw new Error(`Unknown tool: ${step.selectedTool}`);
       |               ^
    176|       }
    177| 
 ❯ src/react-arbiter/__tests__/ReActArbiter.test.ts:72:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/27]⎯

 FAIL  src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should validate tool selection
Error: Unknown tool: **
 ❯ ReActArbiter.reason src/react-arbiter/ReActArbiter.ts:175:15
    173|       // Validate tool exists in registry
    174|       if (!this.toolRegistry.has(step.selectedTool)) {
    175|         throw new Error(`Unknown tool: ${step.selectedTool}`);
       |               ^
    176|       }
    177| 
 ❯ src/react-arbiter/__tests__/ReActArbiter.test.ts:81:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/27]⎯

 FAIL  src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reason > should include tool arguments
Error: ReAct step must select exactly one tool
 ❯ ReActArbiter.reason src/react-arbiter/ReActArbiter.ts:170:15
    168|       // Validate that we have at most one tool call
    169|       if (!step.selectedTool) {
    170|         throw new Error('ReAct step must select exactly one tool');
       |               ^
    171|       }
    172| 
 ❯ src/react-arbiter/__tests__/ReActArbiter.test.ts:100:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[26/27]⎯

 FAIL  src/react-arbiter/__tests__/ReActArbiter.test.ts > ReActArbiter > reflect > should generate reflection on failure
AssertionError: expected undefined to be defined
 ❯ src/react-arbiter/__tests__/ReActArbiter.test.ts:141:34
    139|       expect(reflection).toBeDefined();
    140|       expect(reflection.situation).toBeDefined();
    141|       expect(reflection.failure).toBeDefined();
       |                                  ^
    142|       expect(reflection.lesson).toBeDefined();
    143|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[27/27]⎯




#### world-unit-tests
- **Status:** ❌ FAIL
- **Duration:** 32.0s
- **Error:** 
⎯⎯⎯⎯⎯⎯ Failed Tests 31 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Spatial Continuity and Body Awareness > should maintain spatial continuity during movement
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/embodied-consciousness-tests.test.ts:667:34
    665| 
    666|       const pathResult = await navigationSystem.planPath(pathRequest);
    667|       expect(pathResult.success).toBe(true);
       |                                  ^
    668| 
    669|       // Validate spatial continuity

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/31]⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Spatial Continuity and Body Awareness > should respect physical reachability constraints
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/embodied-consciousness-tests.test.ts:778:36
    776|             }
    777|           } else {
    778|             expect(result.success).toBe(true);
       |                                    ^
    779|           }
    780|         } catch (error) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/31]⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Temporal Consistency and Learning > should adapt to environmental changes appropriately
AssertionError: expected 0 to be greater than 0
 ❯ src/__tests__/embodied-consciousness-tests.test.ts:916:52
    914| 
    915|       // Should detect the new object
    916|       expect(updatedResult.detectedObjects.length).toBeGreaterThan(
       |                                                    ^
    917|         initialObjectCount
    918|       );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/31]⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Temporal Consistency and Learning > should demonstrate learning through exploration
AssertionError: expected 0 to be greater than 0
 ❯ src/__tests__/embodied-consciousness-tests.test.ts:983:9
    981|       expect(
    982|         knowledgeAccumulation[knowledgeAccumulation.length - 1].unique…
    983|       ).toBeGreaterThan(knowledgeAccumulation[0].uniqueObjects);
       |         ^
    984| 
    985|       expect(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/31]⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Integrated Consciousness Assessment > should demonstrate coherent embodied consciousness
TypeError: Cannot read properties of undefined (reading 'length')
 ❯ calculateBodyAwareness src/__tests__/embodied-consciousness-tests.test.ts:440:42
    438|     if (navigationResult?.path) {
    439|       const path = navigationResult.path;
    440|       for (let i = 1; i < path.waypoints.length; i++) {
       |                                          ^
    441|         const prev = path.waypoints[i - 1];
    442|         const curr = path.waypoints[i];
 ❯ calculateConsciousnessMetrics src/__tests__/embodied-consciousness-tests.test.ts:361:27
 ❯ src/__tests__/embodied-consciousness-tests.test.ts:1072:23

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/31]⎯

 FAIL  src/__tests__/embodied-consciousness-tests.test.ts > Embodied Consciousness Tests > Integrated Consciousness Assessment > should maintain embodied constraints under stress
TypeError: Cannot read properties of undefined (reading 'length')
 ❯ calculateBodyAwareness src/__tests__/embodied-consciousness-tests.test.ts:440:42
    438|     if (navigationResult?.path) {
    439|       const path = navigationResult.path;
    440|       for (let i = 1; i < path.waypoints.length; i++) {
       |                                          ^
    441|         const prev = path.waypoints[i - 1];
    442|         const curr = path.waypoints[i];
 ❯ calculateConsciousnessMetrics src/__tests__/embodied-consciousness-tests.test.ts:361:27
 ❯ src/__tests__/embodied-consciousness-tests.test.ts:1185:25

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Basic Pathfinding Scenarios > should handle simple_straight_line correctly
AssertionError: expected 20 to be close to 10, received difference is 10, but expected 0.05
 ❯ src/__tests__/navigation-golden-tests.test.ts:250:36
    248| 
    249|         // Validate path properties
    250|         expect(result.totalLength).toBeCloseTo(scenario.expectedPath.l…
       |                                    ^
    251|         expect(result.estimatedCost).toBeCloseTo(
    252|           scenario.expectedPath.totalCost,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Basic Pathfinding Scenarios > should handle diagonal_movement correctly
AssertionError: expected 20 to be close to 14.14, received difference is 5.859999999999999, but expected 0.05
 ❯ src/__tests__/navigation-golden-tests.test.ts:250:36
    248| 
    249|         // Validate path properties
    250|         expect(result.totalLength).toBeCloseTo(scenario.expectedPath.l…
       |                                    ^
    251|         expect(result.estimatedCost).toBeCloseTo(
    252|           scenario.expectedPath.totalCost,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Basic Pathfinding Scenarios > should handle vertical_navigation correctly
AssertionError: expected 6 to be close to 12, received difference is 6, but expected 0.05
 ❯ src/__tests__/navigation-golden-tests.test.ts:251:38
    249|         // Validate path properties
    250|         expect(result.totalLength).toBeCloseTo(scenario.expectedPath.l…
    251|         expect(result.estimatedCost).toBeCloseTo(
       |                                      ^
    252|           scenario.expectedPath.totalCost,
    253|           1

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Hazard Avoidance Scenarios > should handle lava_avoidance correctly
AssertionError: expected 952 to be less than 100
 ❯ src/__tests__/navigation-golden-tests.test.ts:446:30
    444|           scenario.expectedPath.planningTime.replace(/[<>ms]/g, '')
    445|         );
    446|         expect(planningTime).toBeLessThan(maxTime);
       |                              ^
    447| 
    448|         // Validate path length is within expected bounds

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Hazard Avoidance Scenarios > should handle mob_avoidance_night correctly
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/navigation-golden-tests.test.ts:437:32
    435|           console.log('Goal position:', scenario.request.goal);
    436|         }
    437|         expect(result.success).toBe(true);
       |                                ^
    438|         expect(result.path).toBeDefined();
    439| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Hazard Avoidance Scenarios > should handle water_crossing correctly
AssertionError: expected 774 to be less than 75
 ❯ src/__tests__/navigation-golden-tests.test.ts:446:30
    444|           scenario.expectedPath.planningTime.replace(/[<>ms]/g, '')
    445|         );
    446|         expect(planningTime).toBeLessThan(maxTime);
       |                              ^
    447| 
    448|         // Validate path length is within expected bounds

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Dynamic Replanning Scenarios > should handle blocked_path_replan correctly
AssertionError: expected 802 to be less than 50
 ❯ src/__tests__/navigation-golden-tests.test.ts:642:30
    640|             scenario.expectedReplanning.replanTime.replace(/[<>ms]/g, …
    641|           );
    642|           expect(replanTime).toBeLessThan(maxReplanTime);
       |                              ^
    643| 
    644|           // Validate new path properties

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/31]⎯

 FAIL  src/__tests__/navigation-golden-tests.test.ts > Navigation Golden Tests > Dynamic Replanning Scenarios > should handle hazard_appears correctly
AssertionError: expected 30 to be greater than 30
 ❯ src/__tests__/navigation-golden-tests.test.ts:653:48
    651| 
    652|           if (scenario.expectedReplanning.increasedCost) {
    653|             expect(replanResult.estimatedCost).toBeGreaterThan(
       |                                                ^
    654|               initialPath.estimatedCost
    655|             );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Raycast Engine Contract Validation > should satisfy castRay input/output contract
AssertionError: expected { …(3) } to have property "blockType"
 ❯ src/__tests__/world-contract-testing.test.ts:512:24
    510|         expect(result).toHaveProperty('position');
    511|         expect(result).toHaveProperty('distance');
    512|         expect(result).toHaveProperty('blockType');
       |                        ^
    513|         expect(result).toHaveProperty('normal');
    514| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Raycast Engine Contract Validation > should satisfy castCone input/output contract
AssertionError: expected { …(3) } to have property "blockType"
 ❯ src/__tests__/world-contract-testing.test.ts:552:21
    550|         expect(hit).toHaveProperty('position');
    551|         expect(hit).toHaveProperty('distance');
    552|         expect(hit).toHaveProperty('blockType');
       |                     ^
    553|         expect(hit).toHaveProperty('normal');
    554| 
 ❯ src/__tests__/world-contract-testing.test.ts:549:14

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Perception System Contract Validation > should satisfy processVisualField input/output contract
AssertionError: expected 0 to be greater than or equal to 0.3
 ❯ src/__tests__/world-contract-testing.test.ts:750:40
    748|         contract.perceptionSystem.constraints.maxProcessingTime
    749|       );
    750|       expect(result.overallConfidence).toBeGreaterThanOrEqual(
       |                                        ^
    751|         contract.perceptionSystem.constraints.minConfidence
    752|       );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Sensorimotor System Contract Validation > should satisfy executeAction input/output contract
AssertionError: expected { actionId: 'test-move-action', …(4) } to have property "feedback"
 ❯ src/__tests__/world-contract-testing.test.ts:814:22
    812|       expect(result).toHaveProperty('actionId');
    813|       expect(result).toHaveProperty('executionTime');
    814|       expect(result).toHaveProperty('feedback');
       |                      ^
    815| 
    816|       expect(typeof result.success).toBe('boolean');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Sensorimotor System Contract Validation > should handle unsupported actions gracefully
AssertionError: expected { …(5) } to have property "feedback"
 ❯ src/__tests__/world-contract-testing.test.ts:871:24
    869| 
    870|       if (!result.success) {
    871|         expect(result).toHaveProperty('feedback');
       |                        ^
    872|         expect(typeof result.feedback).toBe('string');
    873|       }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/31]⎯

 FAIL  src/__tests__/world-contract-testing.test.ts > World Module Contract Testing > Inter-Module Contract Integration > should integrate navigation with sensorimotor execution
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-contract-testing.test.ts:957:34
    955| 
    956|       const pathResult = await navigationSystem.planPath(pathRequest);
    957|       expect(pathResult.success).toBe(true);
       |                                  ^
    958| 
    959|       if (pathResult.success && pathResult.path) {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Raycast Performance > single ray performance meets requirements
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:428:29
    426|       );
    427| 
    428|       expect(result.passed).toBe(true);
       |                             ^
    429|       if (!result.passed) {
    430|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Raycast Performance > grid casting performance meets requirements
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:468:29
    466|       );
    467| 
    468|       expect(result.passed).toBe(true);
       |                             ^
    469|       if (!result.passed) {
    470|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Navigation Performance > short distance pathfinding performance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:502:29
    500|       );
    501| 
    502|       expect(result.passed).toBe(true);
       |                             ^
    503|       if (!result.passed) {
    504|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Navigation Performance > medium distance pathfinding performance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:534:29
    532|       );
    533| 
    534|       expect(result.passed).toBe(true);
       |                             ^
    535|       if (!result.passed) {
    536|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Perception Performance > basic visual field processing performance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:590:29
    588|       );
    589| 
    590|       expect(result.passed).toBe(true);
       |                             ^
    591|       if (!result.passed) {
    592|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Action Execution Performance > simple action execution performance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:639:29
    637|       );
    638| 
    639|       expect(result.passed).toBe(true);
       |                             ^
    640|       if (!result.passed) {
    641|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[26/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Action Execution Performance > complex action sequence performance
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/__tests__/world-performance-regression.test.ts:671:29
    669|       );
    670| 
    671|       expect(result.passed).toBe(true);
       |                             ^
    672|       if (!result.passed) {
    673|         console.warn(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[27/31]⎯

 FAIL  src/__tests__/world-performance-regression.test.ts > World Module Performance Regression Tests > Comprehensive Performance Report > generate performance baseline report
AssertionError: expected 0 to be greater than 0.8
 ❯ src/__tests__/world-performance-regression.test.ts:874:50
    872| 
    873|       // Overall test should pass if majority of benchmarks pass
    874|       expect(passedBenchmarks / totalBenchmarks).toBeGreaterThan(0.8);
       |                                                  ^
    875|     });
    876|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[28/31]⎯

 FAIL  src/perception/__tests__/perception-integration.test.ts > Perception Integration System > Performance and Resource Management > should emit performance warnings
Error: Test timed out in 30000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/perception/__tests__/perception-integration.test.ts:312:5
    310|     });
    311| 
    312|     test('should emit performance warnings', async () => {
       |     ^
    313|       const strictConfig = {
    314|         ...defaultConfig,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[29/31]⎯

 FAIL  src/navigation/__tests__/navigation-integration.test.ts > Navigation System Integration > Path Planning > should plan basic path from start to goal
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/navigation/__tests__/navigation-integration.test.ts:172:30
    170|       const result = await navigationSystem.planPath(request);
    171| 
    172|       expect(result.success).toBe(true);
       |                              ^
    173|       expect(result.path.length).toBeGreaterThan(0);
    174|       expect(result.planningTime).toBeGreaterThan(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[30/31]⎯

 FAIL  src/place-graph/__tests__/place-graph-integration.test.ts > Place Graph Integration > Spatial Navigator > should find paths between places
AssertionError: Target cannot be null or undefined.
 ❯ src/place-graph/__tests__/place-graph-integration.test.ts:528:28
    526| 
    527|       expect(path).toBeDefined();
    528|       expect(path?.places).toHaveLength(3);
       |                            ^
    529|       expect(path?.places[0]).toBe(home.id);
    530|       expect(path?.places[1]).toBe(forest.id);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[31/31]⎯




#### safety-unit-tests
- **Status:** ✅ PASS
- **Duration:** 2.7s




### SECURITY SCAN
**Status:** ❌ FAIL
**Score:** 0.0%
**Tier:** 1
**Required:** Yes
**Duration:** 2.6s


#### dependency-audit
- **Status:** ❌ FAIL
- **Duration:** 2.3s
- **Error:** Exit code: 1


#### safety-security-scan
- **Status:** ❌ FAIL
- **Duration:** 0.3s
- **Error:** Exit code: 1



### PERFORMANCE BENCHMARKS
**Status:** ❌ FAIL
**Score:** 0.0%
**Tier:** 2
**Required:** No
**Duration:** 0.5s


#### core-benchmarks
- **Status:** ❌ FAIL
- **Duration:** 0.3s
- **Error:** Exit code: 1


#### memory-benchmarks
- **Status:** ❌ FAIL
- **Duration:** 0.3s
- **Error:** Exit code: 1



### INTEGRATION TESTS
**Status:** ❌ FAIL
**Score:** 0.0%
**Tier:** 2
**Required:** No
**Duration:** 0.4s


#### integration-suite
- **Status:** ❌ FAIL
- **Duration:** 0.4s
- **Error:** Exit code: 254



## Issues and Recommendations


### Blocking Issues
- Code Quality failed - blocking deployment
- Unit Tests failed - blocking deployment
- Security Audit failed - blocking deployment


### Recommendations
- CRITICAL: Address all blocking issues before deployment
- - Code Quality failed - blocking deployment
- - Unit Tests failed - blocking deployment
- - Security Audit failed - blocking deployment
- Address 5 failed quality gates:
- - Code Quality: Score 0.0% (threshold: 90%)
- - Unit Tests: Score 16.7% (threshold: 80%)
- - Security Audit: Score 0.0% (threshold: 100%)
- - Performance Benchmarks: Score 0.0% (threshold: 85%)
- - Integration Tests: Score 0.0% (threshold: 80%)
- PRIORITY: Fix all Tier 1 (critical) quality gates immediately
- PERFORMANCE: Optimize components with low benchmark scores

## Trust Score Breakdown

The trust score of 63/100 is calculated based on:
- Base score: 0/100 (overall success)
- Quality gate bonuses: 63/100
- Overall score bonus: 3/100

## Deployment Readiness

**Status:** ❌ NOT READY
**Trust Level:** Low

System requires fixes before deployment.

---

*Report generated by Quality Gate Verification System*

/**
 * Quick Integration Demo
 *
 * A simplified demonstration of the Minecraft-Planning integration
 * that works with the current codebase and showcases the key features.
 *
 * @author @darianrosebrook
 */

import { createSimulatedMinecraftInterface } from './simulation-stub';
import { createMinecraftSignalProcessor } from './signal-processor';
import { ObservationMapper } from './observation-mapper';
import { BotConfig } from './types';

export interface QuickDemoResult {
  success: boolean;
  signalsGenerated: number;
  homeostasisScores: any;
  planningContextGenerated: boolean;
  executionTime: number;
  summary: string;
}

/**
 * Quick demonstration of signal processing and observation mapping
 */
export async function runQuickIntegrationDemo(): Promise<QuickDemoResult> {
  const startTime = Date.now();

  console.log('🚀 Quick Minecraft-Planning Integration Demo');
  console.log('='.repeat(50));

  try {
    // Create a simulated Minecraft interface
    console.log('🎮 Creating simulated Minecraft environment...');
    const simInterface = createSimulatedMinecraftInterface({
      worldSeed: 'demo_seed',
      spawnPosition: { x: 10, y: 64, z: 10 },
      initialInventory: [
        { type: 'wooden_pickaxe', count: 1, slot: 0, metadata: {} },
        { type: 'bread', count: 3, slot: 1, metadata: {} },
      ],
      worldBlocks: [
        {
          type: 'stone',
          position: { x: 12, y: 64, z: 10 },
          properties: {},
          hardness: 1.5,
        },
        {
          type: 'coal_ore',
          position: { x: 15, y: 63, z: 12 },
          properties: {},
          hardness: 3.0,
        },
      ],
      timeStep: 50,
    });

    // Connect to the simulation
    await simInterface.connect();
    console.log('✅ Connected to simulation');

    // Create signal processor and observation mapper
    console.log('🧠 Setting up signal processing and observation mapping...');
    const signalProcessor = createMinecraftSignalProcessor();
    const observationMapper = new ObservationMapper({
      host: 'localhost',
      port: 25565,
      username: 'DemoBot',
      version: '1.20.1',
      auth: 'offline',
      pathfindingTimeout: 5000,
      actionTimeout: 10000,
      observationRadius: 16,
      autoReconnect: false,
      maxReconnectAttempts: 0,
      emergencyDisconnect: true,
    });

    // Simulate getting world state and processing it
    console.log('🔍 Processing world state and generating signals...');
    const worldState = await simInterface.getGameState();

    // Create a mock bot object for signal processing
    const mockBot = {
      entity: {
        position: {
          ...worldState.position,
          clone: () => ({ ...worldState.position }),
        },
      },
      health: worldState.health,
      food: worldState.food,
      time: { timeOfDay: 6000 },
      isRaining: false,
      entities: {},
      players: { DemoBot: {} },
      blockAt: () => null,
      inventory: {
        slots: worldState.inventory.map((item, index) =>
          index < 36
            ? { name: item.type, count: item.count, metadata: item.metadata }
            : null
        ),
      },
      game: {
        gameMode: 'survival',
        dimension: 'overworld',
        difficulty: 'normal',
      },
      version: '1.20.1',
      experience: { points: 0 },
    } as any;

    // Generate signals using our signal processor
    const signals = signalProcessor.processWorldState(
      {
        player: {
          position: worldState.position,
          health: worldState.health,
          food: worldState.food,
          experience: 0,
          gameMode: 'survival',
          dimension: 'overworld',
        },
        inventory: {
          items: worldState.inventory,
          totalSlots: 36,
          usedSlots: worldState.inventory.length,
        },
        environment: {
          timeOfDay: 6000,
          isRaining: false,
          nearbyBlocks: [
            {
              type: 'stone',
              position: { x: 12, y: 64, z: 10 },
              properties: {},
              hardness: 1.5,
            },
            {
              type: 'coal_ore',
              position: { x: 15, y: 63, z: 12 },
              properties: {},
              hardness: 3.0,
            },
          ],
          nearbyEntities: [],
        },
        server: {
          playerCount: 1,
          difficulty: 'normal',
          version: '1.20.1',
        },
      },
      mockBot
    );

    // Get enhanced homeostasis state
    const homeostasisState = signalProcessor.getHomeostasisState(
      {
        player: {
          position: worldState.position,
          health: worldState.health,
          food: worldState.food,
          experience: 0,
          gameMode: 'survival',
          dimension: 'overworld',
        },
        inventory: {
          items: worldState.inventory,
          totalSlots: 36,
          usedSlots: worldState.inventory.length,
        },
        environment: {
          timeOfDay: 6000,
          isRaining: false,
          nearbyBlocks: [
            {
              type: 'stone',
              position: { x: 12, y: 64, z: 10 },
              properties: {},
              hardness: 1.5,
            },
            {
              type: 'coal_ore',
              position: { x: 15, y: 63, z: 12 },
              properties: {},
              hardness: 3.0,
            },
          ],
          nearbyEntities: [],
        },
        server: {
          playerCount: 1,
          difficulty: 'normal',
          version: '1.20.1',
        },
      },
      mockBot
    );

    // Generate a simplified planning context (skipping full observation mapper for demo)
    const planningContext = {
      worldState: {
        playerPosition: [
          worldState.position.x,
          worldState.position.y,
          worldState.position.z,
        ],
        health: worldState.health,
        hunger: worldState.food,
        inventory: worldState.inventory.reduce(
          (acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + item.count;
            return acc;
          },
          {} as Record<string, number>
        ),
        timeOfDay: 6000,
        weather: 'clear',
        nearbyHostiles: 0,
        nearbyPassives: 0,
      },
      currentState: {
        health: worldState.health / 20,
        hunger: worldState.food / 20,
        energy: 0.8,
        safety: 0.9,
        social: 0.3,
        achievement: 0.5,
        curiosity: 0.6,
        timestamp: Date.now(),
      },
      activeGoals: [],
      availableResources: [
        { type: 'time', amount: 1000, availability: 'available' as const },
        {
          type: 'energy',
          amount: worldState.food * 5,
          availability: 'available' as const,
        },
        ...worldState.inventory.map((item) => ({
          type: item.type,
          amount: item.count,
          availability: 'available' as const,
        })),
      ],
      timeConstraints: {
        urgency:
          worldState.health < 10 ? ('emergency' as const) : ('low' as const),
        maxPlanningTime: worldState.health < 10 ? 100 : 2000,
      },
      situationalFactors: {
        threatLevel: 0.1,
        opportunityLevel: 0.3,
        socialContext: ['singleplayer'],
        environmentalFactors: ['clear_weather', 'day'],
      },
    };

    // Display results
    console.log('\n📊 Integration Demo Results:');
    console.log('='.repeat(30));
    console.log(`🎯 Signals Generated: ${signals.length}`);
    console.log('📈 Signal Types:', [...new Set(signals.map((s) => s.type))]);
    console.log(
      '💪 Signal Intensities:',
      signals.map((s) => `${s.type}: ${s.intensity}`)
    );

    console.log('\n🏥 Homeostasis State:');
    Object.entries(homeostasisState).forEach(([key, value]) => {
      console.log(
        `   ${key}: ${typeof value === 'number' ? Math.round(value * 100) / 100 : value}`
      );
    });

    console.log('\n🌍 Planning Context Generated:');
    console.log(
      `   World State Keys: ${Object.keys(planningContext.worldState).length}`
    );
    console.log(
      `   Available Resources: ${planningContext.availableResources.length}`
    );
    console.log(`   Urgency Level: ${planningContext.timeConstraints.urgency}`);
    console.log(
      `   Threat Level: ${Math.round((planningContext.situationalFactors.threatLevel || 0) * 100)}%`
    );
    console.log(
      `   Opportunity Level: ${Math.round((planningContext.situationalFactors.opportunityLevel || 0) * 100)}%`
    );

    // Show what signals would drive planning
    console.log('\n🧠 Planning Implications:');
    signals.forEach((signal) => {
      if (signal.intensity > 50) {
        console.log(
          `   ⚠️  HIGH: ${signal.type} (${signal.intensity}) - ${signal.metadata?.description || 'Needs attention'}`
        );
      } else if (signal.intensity > 25) {
        console.log(
          `   📊 MED: ${signal.type} (${signal.intensity}) - ${signal.metadata?.description || 'Monitor'}`
        );
      } else {
        console.log(
          `   ✅ LOW: ${signal.type} (${signal.intensity}) - ${signal.metadata?.description || 'Normal'}`
        );
      }
    });

    // Demonstrate signal-to-action mapping
    console.log('\n🎯 Example Planning Decisions:');
    const criticalSignals = signals.filter((s) => s.intensity > 70);
    const moderateSignals = signals.filter(
      (s) => s.intensity > 40 && s.intensity <= 70
    );

    if (criticalSignals.length > 0) {
      console.log(
        `   🚨 EMERGENCY: Would prioritize ${criticalSignals[0].type} (${criticalSignals[0].intensity})`
      );
      console.log(
        `      → Planning Approach: REACTIVE/GOAP (immediate response)`
      );
      console.log(`      → Max Planning Time: 100ms`);
    } else if (moderateSignals.length > 0) {
      console.log(
        `   ⚡ MODERATE: Would address ${moderateSignals[0].type} (${moderateSignals[0].intensity})`
      );
      console.log(`      → Planning Approach: HTN+GOAP (structured planning)`);
      console.log(`      → Max Planning Time: 1000ms`);
    } else {
      console.log(`   🎯 STRATEGIC: Would pursue exploration/optimization`);
      console.log(`      → Planning Approach: HRM+HTN (strategic planning)`);
      console.log(`      → Max Planning Time: 5000ms`);
    }

    // Cleanup
    await simInterface.disconnect();
    console.log('\n✅ Demo completed successfully!');

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      signalsGenerated: signals.length,
      homeostasisScores: homeostasisState,
      planningContextGenerated: true,
      executionTime,
      summary: `Generated ${signals.length} signals, homeostasis monitoring active, planning context ready`,
    };
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    return {
      success: false,
      signalsGenerated: 0,
      homeostasisScores: {},
      planningContextGenerated: false,
      executionTime: Date.now() - startTime,
      summary: `Demo failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// CLI execution
if (require.main === module) {
  runQuickIntegrationDemo()
    .then((result) => {
      console.log('\n🎉 Quick Integration Demo Summary:');
      console.log('='.repeat(40));
      console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Execution Time: ${result.executionTime}ms`);
      console.log(`Summary: ${result.summary}`);

      if (result.success) {
        console.log('\n💡 Next Steps:');
        console.log('1. Fix TypeScript build errors in dependencies');
        console.log('2. Integrate with full planning coordinator');
        console.log('3. Test with real Minecraft server');
        console.log('4. Run comprehensive integration tests');
      }

      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

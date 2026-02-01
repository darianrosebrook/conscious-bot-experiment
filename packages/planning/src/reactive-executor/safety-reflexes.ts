/**
 * Safety Reflexes — reactive veto/pause for emergency responses.
 *
 * These are NOT deliberative planning. Reflexes may veto, pause, or insert
 * a small fixed sequence, but they do NOT search. If a reflex needs search,
 * it's a planning capability and belongs in Sterling.
 *
 * @pivot 5 — Safety reflexes depend on minimal ExecutionSnapshot, not GOAP-era WorldState.
 *
 * @author @darianrosebrook
 */

// ---------------------------------------------------------------------------
// Minimal execution snapshot (Pivot 5)
// ---------------------------------------------------------------------------

/**
 * Minimal bot state required by safety reflexes.
 * Does NOT depend on GOAP-era WorldState.
 */
export interface ExecutionSnapshot {
  health: number;
  hunger: number;
  threatLevel: number;
  hostileCount: number;
  nearLava: boolean;
  lavaDistance?: number;
  lightLevel?: number;
  airLevel?: number;
  position?: { x: number; y: number; z: number };
  /** Whether the bot has food in inventory. */
  hasFood?: boolean;
}

// ---------------------------------------------------------------------------
// Safety action types
// ---------------------------------------------------------------------------

export interface SafetyAction {
  type:
    | 'emergency_eat'
    | 'emergency_retreat'
    | 'emergency_light'
    | 'emergency_surface';
  priority: number;
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP bus subset needed by reflexes
// ---------------------------------------------------------------------------

export interface ReflexMCPBus {
  mineflayer: {
    consume: (foodType: string) => Promise<unknown>;
  };
  navigation: {
    pathTo: (position: { x: number; y: number; z: number }, options?: { priority: string }) => Promise<unknown>;
    swimToSurface: () => Promise<unknown>;
  };
  state: {
    position: { x: number; y: number; z: number };
  };
}

// ---------------------------------------------------------------------------
// Safety Reflexes
// ---------------------------------------------------------------------------

/**
 * Reactive safety system for emergency responses.
 * Pure reactive — no search, no scoring, no deliberation.
 *
 * @pivot 5 — Depends on ExecutionSnapshot, not planner-era types.
 */
export class SafetyReflexes {
  /**
   * Check if any safety reflex should fire given current snapshot.
   * Returns the highest-priority reflex, or null if none needed.
   */
  checkReflexes(snapshot: ExecutionSnapshot): SafetyAction | null {
    // Health critical — immediate eat or flee
    if (snapshot.health < 20 && snapshot.hasFood) {
      return { type: 'emergency_eat', priority: 1000 };
    }

    // Lava/void danger — immediate retreat
    if (snapshot.nearLava && (snapshot.lavaDistance ?? Infinity) < 3) {
      return { type: 'emergency_retreat', priority: 1000 };
    }

    // Multiple hostiles — seek light/height advantage
    if (snapshot.hostileCount > 2 && (snapshot.lightLevel ?? 15) < 8) {
      return { type: 'emergency_light', priority: 800 };
    }

    // Drowning — surface immediately
    if ((snapshot.airLevel ?? 300) < 50) {
      return { type: 'emergency_surface', priority: 900 };
    }

    return null;
  }

  /**
   * Execute a safety reflex immediately. These are small fixed sequences, not plans.
   */
  async executeReflex(reflex: SafetyAction, mcp: ReflexMCPBus): Promise<{ success: boolean; error?: string }> {
    try {
      switch (reflex.type) {
        case 'emergency_eat':
          await mcp.mineflayer.consume('any_food');
          break;

        case 'emergency_retreat': {
          const pos = mcp.state.position;
          const safePos = { x: pos.x - 10, y: pos.y, z: pos.z };
          await mcp.navigation.pathTo(safePos, { priority: 'immediate' });
          break;
        }

        case 'emergency_light': {
          const pos = mcp.state.position;
          const lightPos = { x: pos.x + 10, y: pos.y, z: pos.z };
          await mcp.navigation.pathTo(lightPos, { priority: 'immediate' });
          break;
        }

        case 'emergency_surface':
          await mcp.navigation.swimToSurface();
          break;
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

import { EventEmitter } from 'events';
import { POLL_TIMEOUT_MS } from '../modules/timeout-policy';
import { isSystemReady } from '../startup-barrier';

type Vec3 = { x: number; y: number; z: number };

export type CachedInventoryItem = {
  name?: string | null;
  displayName?: string;
  type?: string | number | null;
  count?: number;
  slot?: number;
};

export type WorldStateSnapshot = {
  ts: number;
  connected: boolean;
  agentPosition?: Vec3;
  agentHealth?: number;
  inventory?: CachedInventoryItem[];
  nearbyEntities?: Array<{ type: string; position: Vec3; distance: number }>;
  timeOfDay?: number;
  weather?: 'clear' | 'rain' | 'thunder';
  dimension?: string;
  biome?: string;
  dangerLevel?: number;
};

export class WorldStateManager extends EventEmitter {
  private baseUrl: string;
  private snapshot: WorldStateSnapshot = { ts: 0, connected: false };
  private pollHandle?: NodeJS.Timeout;
  private lastNotReadyLogAt = 0;

  constructor(baseUrl: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getSnapshot(): WorldStateSnapshot {
    return { ...this.snapshot };
  }

  getInventory(): CachedInventoryItem[] | undefined {
    return this.snapshot.inventory ? [...this.snapshot.inventory] : undefined;
  }

  startPolling(intervalMs = 30000): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = setInterval(
      () => this.pollOnce().catch(() => {}),
      intervalMs
    );
    // Kick immediately
    this.pollOnce().catch(() => {});
  }

  stopPolling(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = undefined;
  }

  async pollOnce(): Promise<void> {
    if (!isSystemReady()) {
      const now = Date.now();
      if (now - this.lastNotReadyLogAt > 5000) {
        console.log(
          'WorldStateManager waiting for system readiness; poll skipped'
        );
        this.lastNotReadyLogAt = now;
      }
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      const res = await fetch(`${this.baseUrl}/state`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn(`WorldStateManager: poll got HTTP ${res.status} — stale snapshot preserved`);
        return;
      }
      const json = (await res.json()) as any;
      const data = json?.data || {};
      const worldState = data.worldState || {};
      const player = worldState.player || {};

      // Extract inventory items
      const inv = Array.isArray(data.inventory)
        ? (data.inventory as CachedInventoryItem[])
        : Array.isArray(worldState.inventory?.items)
          ? (worldState.inventory.items as CachedInventoryItem[])
          : [];

      const prev = this.snapshot;
      this.snapshot = {
        ts: Date.now(),
        connected: json?.status === 'connected' || json?.isAlive === true,
        agentPosition: data.position || player.position,
        agentHealth: data.health || player.health,
        inventory: inv,
        nearbyEntities: worldState.nearbyEntities || [],
        timeOfDay: worldState.timeOfDay,
        weather: worldState.weather,
        dimension: player.dimension || worldState.dimension,
        biome: worldState.biome,
        dangerLevel: 0, // Calculate based on environment
      };

      // Debug logging
      console.log('WorldStateManager poll result:', {
        connected: this.snapshot.connected,
        hasPosition: !!this.snapshot.agentPosition,
        position: this.snapshot.agentPosition,
        health: this.snapshot.agentHealth,
        inventoryCount: this.snapshot.inventory?.length || 0,
      });

      if (this.hasMeaningfulChange(prev, this.snapshot)) {
        console.log('WorldStateManager emitting update');
        this.emit('updated', this.getSnapshot());
      } else {
        console.log('WorldStateManager no meaningful change');
      }
    } catch (e) {
      // Stale-while-revalidate: previous snapshot is intentionally preserved
      // on fetch failure so downstream consumers always have *some* data.
      console.warn('WorldStateManager poll failed (stale snapshot preserved):', (e as any)?.message || e);
    }
  }

  applyEffects(
    effects: Array<
      | {
          type: string;
          item?: string;
          quantity?: number;
          change?: string;
          metadata?: any;
        }
      | any
    >
  ): void {
    if (!effects || effects.length === 0) return;
    let changed = false;
    for (const eff of effects) {
      // Inventory effects from capability result
      if (eff.type === 'inventory' || eff.change?.startsWith('inventory_')) {
        const itemName = String(
          eff.item || eff.metadata?.item || ''
        ).toLowerCase();
        const qtyRaw = Number(eff.quantity ?? eff.metadata?.quantity ?? 0);
        const qty =
          eff.change === 'inventory_removed'
            ? -Math.abs(qtyRaw)
            : Math.abs(qtyRaw);
        if (!this.snapshot.inventory) this.snapshot.inventory = [];
        const idx = this.snapshot.inventory.findIndex((it) =>
          String(it.name || it.displayName || it.type || '')
            .toLowerCase()
            .includes(itemName)
        );
        if (idx >= 0) {
          const current = this.snapshot.inventory[idx].count || 0;
          this.snapshot.inventory[idx].count = Math.max(0, current + qty);
        } else if (qty > 0) {
          this.snapshot.inventory.push({ name: itemName, count: qty });
        }
        changed = true;
      }
      // Additional effect types could be handled here (lighting, structure, etc.)
    }
    if (changed) {
      this.snapshot.ts = Date.now();
      this.emit('updated', this.getSnapshot());
    }
  }

  private hasMeaningfulChange(
    a: WorldStateSnapshot,
    b: WorldStateSnapshot
  ): boolean {
    if (a.connected !== b.connected) return true;
    if (!!a.inventory !== !!b.inventory) return true;
    if ((a.inventory?.length || 0) !== (b.inventory?.length || 0)) return true;

    // Check for position changes
    if (a.agentPosition !== b.agentPosition) {
      if (!a.agentPosition && b.agentPosition) return true;
      if (a.agentPosition && !b.agentPosition) return true;
      if (a.agentPosition && b.agentPosition) {
        const dx = Math.abs(
          (a.agentPosition.x || 0) - (b.agentPosition.x || 0)
        );
        const dy = Math.abs(
          (a.agentPosition.y || 0) - (b.agentPosition.y || 0)
        );
        const dz = Math.abs(
          (a.agentPosition.z || 0) - (b.agentPosition.z || 0)
        );
        // Consider position change meaningful if any coordinate changed by more than 0.1
        if (dx > 0.1 || dy > 0.1 || dz > 0.1) return true;
      }
    }

    // Check for health changes
    if (a.agentHealth !== b.agentHealth) return true;

    // Check for environmental changes
    if (a.timeOfDay !== b.timeOfDay) return true;
    if (a.weather !== b.weather) return true;
    if (a.biome !== b.biome) return true;

    return false;
  }
}

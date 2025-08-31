import { EventEmitter } from 'events';

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

  startPolling(intervalMs = 2000): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = setInterval(() => this.pollOnce().catch(() => {}), intervalMs);
    // Kick immediately
    this.pollOnce().catch(() => {});
  }

  stopPolling(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = undefined;
  }

  async pollOnce(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/state`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return;
      const json = (await res.json()) as any;
      const data = json?.data || {};
      const worldState = data.worldState || {};
      const inv = Array.isArray(worldState.inventory?.items)
        ? (worldState.inventory.items as CachedInventoryItem[])
        : [];
      const prev = this.snapshot;
      this.snapshot = {
        ts: Date.now(),
        connected: json?.status === 'connected' || json?.isAlive === true,
        agentPosition: data.agentPosition || worldState.agentPosition,
        agentHealth: data.agentHealth || worldState.agentHealth,
        inventory: inv,
        nearbyEntities: worldState.nearbyEntities || [],
        timeOfDay: worldState.timeOfDay,
        weather: worldState.weather,
        dimension: worldState.dimension,
        biome: worldState.biome,
        dangerLevel: worldState.dangerLevel,
      };
      if (this.hasMeaningfulChange(prev, this.snapshot)) {
        this.emit('updated', this.getSnapshot());
      }
    } catch (e) {
      // Silent fail; snapshot remains
    }
  }

  applyEffects(
    effects: Array<
      { type: string; item?: string; quantity?: number; change?: string; metadata?: any } | any
    >
  ): void {
    if (!effects || effects.length === 0) return;
    let changed = false;
    for (const eff of effects) {
      // Inventory effects from capability result
      if (eff.type === 'inventory' || eff.change?.startsWith('inventory_')) {
        const itemName = String(eff.item || eff.metadata?.item || '').toLowerCase();
        const qtyRaw = Number(eff.quantity ?? eff.metadata?.quantity ?? 0);
        const qty = eff.change === 'inventory_removed' ? -Math.abs(qtyRaw) : Math.abs(qtyRaw);
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

  private hasMeaningfulChange(a: WorldStateSnapshot, b: WorldStateSnapshot): boolean {
    if (a.connected !== b.connected) return true;
    if (!!a.inventory !== !!b.inventory) return true;
    if ((a.inventory?.length || 0) !== (b.inventory?.length || 0)) return true;
    return false;
  }
}

import { WorldStateManager, WorldStateSnapshot } from './world-state-manager';
import {
  createSemanticMemory,
  EntityType,
  RelationType,
  PropertyType,
  KnowledgeSource,
} from '@conscious-bot/memory';

function normalizeItemName(item: any): string {
  return String(
    item?.name || item?.displayName || (typeof item?.type === 'string' ? item?.type : '') || ''
  )
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export class WorldKnowledgeIntegrator {
  private wsm: WorldStateManager;
  private lastCounts: Map<string, number> = new Map();
  private kg = createSemanticMemory({
    knowledgeGraph: {
      persistToStorage: true,
      storageDirectory: process.env.MEMORY_DIR || 'memory-storage',
      autoSaveInterval: 15000,
    },
  }).knowledgeGraphCore;

  constructor(wsm: WorldStateManager) {
    this.wsm = wsm;
  }

  handleWorldUpdate(snapshot: WorldStateSnapshot): void {
    if (!snapshot.connected) return;
    this.captureInventoryDeltas(snapshot);
    this.captureEnvironmentHints(snapshot);
  }

  private captureInventoryDeltas(snapshot: WorldStateSnapshot): void {
    const inv = snapshot.inventory || [];
    const current = new Map<string, number>();
    for (const it of inv) {
      const key = normalizeItemName(it);
      if (!key) continue;
      const count = Number(it?.count || 0);
      current.set(key, (current.get(key) || 0) + count);
    }

    // Compare with last counts to find positive deltas
    for (const [key, count] of current.entries()) {
      const prev = this.lastCounts.get(key) || 0;
      if (count > prev) {
        const gained = count - prev;
        this.recordResourceObserved(key, gained);
      }
    }

    // Update last counts (only for keys we see now to avoid noise)
    this.lastCounts = current;
  }

  private recordResourceObserved(name: string, quantity: number): void {
    const now = Date.now();
    // Create or update item/resource entity
    const entity = this.kg.upsertEntity({
      type: EntityType.RESOURCE,
      name,
      description: `Observed resource: ${name}`,
      properties: {
        last_seen: {
          confidence: 0.8,
          timestamp: now,
          type: PropertyType.DATE,
          source: KnowledgeSource.OBSERVATION,
          value: new Date(now).toISOString(),
        },
        observed_quantity: {
          confidence: 0.6,
          timestamp: now,
          type: PropertyType.NUMBER,
          source: KnowledgeSource.OBSERVATION,
          value: quantity,
          unit: 'items',
        },
      },
      tags: ['resource', 'observed'],
      confidence: 0.6,
      source: KnowledgeSource.OBSERVATION,
    });

    // Approximate location entity (do not encode precise world state)
    const pos = this.wsm.getSnapshot().agentPosition || { x: 0, y: 64, z: 0 };
    const locName = `approx_${Math.round(pos.x)}_${Math.round(pos.y)}_${Math.round(pos.z)}_r8`;
    const place = this.kg.upsertEntity({
      type: EntityType.PLACE,
      name: locName,
      description: 'Approximate location near agent when resource observed',
      properties: {
        radius: {
          confidence: 0.7,
          timestamp: now,
          type: PropertyType.NUMBER,
          source: KnowledgeSource.INFERENCE,
          value: 8,
          unit: 'blocks',
        },
      },
      tags: ['approximate', 'observation_context'],
      confidence: 0.5,
      source: KnowledgeSource.INFERENCE,
    });

    // Link resource to place with NEAR relationship
    this.kg.upsertRelationship({
      type: RelationType.NEAR,
      sourceId: entity.id,
      targetId: place.id,
      properties: {
        confidence_hint: {
          confidence: 0.6,
          timestamp: now,
          type: PropertyType.NUMBER,
          source: KnowledgeSource.INFERENCE,
          value: 0.6,
        },
      },
      bidirectional: false,
      confidence: 0.6,
      source: KnowledgeSource.INFERENCE,
    });
  }

  private captureEnvironmentHints(snapshot: WorldStateSnapshot): void {
    const now = Date.now();
    // Infer time-of-day category (day/night)
    if (typeof snapshot.timeOfDay === 'number') {
      const tod = snapshot.timeOfDay;
      const category = tod > 12000 ? 'night' : 'day';
      const place = this.kg.upsertEntity({
        type: EntityType.CONCEPT,
        name: `time_of_day_${category}`,
        description: `Observed ${category} conditions`,
        properties: {
          last_observed: {
            confidence: 0.7,
            timestamp: now,
            type: PropertyType.DATE,
            source: KnowledgeSource.OBSERVATION,
            value: new Date(now).toISOString(),
          },
        },
        tags: ['environment', 'time_of_day'],
        confidence: 0.6,
        source: KnowledgeSource.OBSERVATION,
      });
      // Link place observation to current approximate location
      const pos = this.wsm.getSnapshot().agentPosition || { x: 0, y: 64, z: 0 };
      const locName = `approx_${Math.round(pos.x)}_${Math.round(pos.y)}_${Math.round(pos.z)}_r8`;
      const loc = this.kg.upsertEntity({
        type: EntityType.PLACE,
        name: locName,
        description: 'Approximate observation area',
        properties: {},
        tags: ['approximate'],
        confidence: 0.5,
        source: KnowledgeSource.INFERENCE,
      });
      this.kg.upsertRelationship({
        type: RelationType.LOCATED_AT,
        sourceId: place.id,
        targetId: loc.id,
        properties: {},
        bidirectional: false,
        confidence: 0.5,
        source: KnowledgeSource.OBSERVATION,
      });
    }
  }
}


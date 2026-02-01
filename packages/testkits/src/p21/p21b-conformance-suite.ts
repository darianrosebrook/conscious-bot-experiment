/**
 * P21-B Conformance Suite — Emission Protocol Invariants
 *
 * Parameterized test factory for the 4 emission-layer invariants.
 * These govern how deltas are packaged into envelopes, not how
 * tracks are maintained (that's P21-A).
 *
 * Import in test files:
 *   import { runP21BConformanceSuite } from '@conscious-bot/testkits/src/p21';
 */

import { describe, it, expect } from 'vitest';
import type {
  P21EmissionAdapter,
} from '../../../planning/src/sterling/primitives/p21/p21-capsule-types';
import { makeItem, batch } from './helpers';

// ── Config ──────────────────────────────────────────────────────────

export interface P21BConformanceConfig {
  name: string;
  createEmissionAdapter: () => P21EmissionAdapter;
  riskLabel: string;
  deltaCap: number;
  snapshotIntervalTicks: number;
}

// ── Suite ───────────────────────────────────────────────────────────

export function runP21BConformanceSuite(config: P21BConformanceConfig) {
  const {
    name,
    createEmissionAdapter,
    riskLabel,
    deltaCap,
    snapshotIntervalTicks,
  } = config;

  describe(`P21-B Conformance: ${name}`, () => {
    // B1: delta_budget — emitted events per envelope <= deltaCap
    it('B1 delta_budget: saliency events per envelope <= declared deltaCap', () => {
      const adapter = createEmissionAdapter();

      // Flood with many entities to produce many deltas
      const items = [];
      for (let i = 0; i < deltaCap + 10; i++) {
        items.push(
          makeItem({
            entityId: i + 100,
            classLabel: riskLabel,
            proximityBucket: 3,
            posBucketX: i * 10,
          }),
        );
      }

      // Ingest enough to produce deltas
      adapter.ingestAndTick(batch(1, items));
      adapter.ingestAndTick(batch(2, items));

      // Build envelope and check delta count
      const envelope = adapter.buildEnvelope(1);
      expect(envelope.saliency_events.length).toBeLessThanOrEqual(deltaCap);
    });

    // B2: envelope_determinism — identical inputs → byte-identical envelope JSON
    // Canonicalization boundary: this test uses Node JSON.stringify with stable
    // object construction order. Determinism is proven within a single runtime
    // (same Node version, same construction path). Cross-runtime transport
    // determinism would require an explicit canonical encoder (sorted keys,
    // stable float formatting). That is not claimed here.
    it('B2 envelope_determinism: identical inputs produce byte-identical envelope JSON', () => {
      const adapterA = createEmissionAdapter();
      const adapterB = createEmissionAdapter();

      const items = [
        makeItem({ entityId: 100, classLabel: riskLabel, proximityBucket: 3 }),
        makeItem({ entityId: 200, classLabel: riskLabel, proximityBucket: 5, classEnum: 2 }),
      ];

      // Same input sequence to both adapters
      for (let t = 1; t <= 5; t++) {
        adapterA.ingestAndTick(batch(t, items));
        adapterB.ingestAndTick(batch(t, items));
      }

      const envA = adapterA.buildEnvelope(1);
      const envB = adapterB.buildEnvelope(1);

      expect(JSON.stringify(envA)).toBe(JSON.stringify(envB));
    });

    // B3: producer_validation — every new_threat in emitted envelope has .track
    it('B3 producer_validation: every new_threat event in envelope includes .track', () => {
      const adapter = createEmissionAdapter();

      const items = [
        makeItem({ entityId: 100, classLabel: riskLabel, proximityBucket: 3 }),
      ];

      // Ingest enough to produce new_threat deltas
      adapter.ingestAndTick(batch(1, items));
      adapter.ingestAndTick(batch(2, items));

      const envelope = adapter.buildEnvelope(1);
      const newThreats = envelope.saliency_events.filter(
        (e) => e.type === 'new_threat',
      );

      for (const event of newThreats) {
        expect(event.track).toBeDefined();
      }
    });

    // B4: snapshot_cadence — snapshot appears within declared interval
    it(`B4 snapshot_cadence: snapshot appears within ${snapshotIntervalTicks} ticks`, () => {
      const adapter = createEmissionAdapter();

      const items = [
        makeItem({ entityId: 100, classLabel: riskLabel, proximityBucket: 3 }),
      ];

      // Run for enough ticks to trigger at least one snapshot
      for (let t = 1; t <= snapshotIntervalTicks + 2; t++) {
        adapter.ingestAndTick(batch(t, items));
      }

      // Build envelopes for each tick and check snapshot presence
      let snapshotFound = false;
      for (let seq = 1; seq <= snapshotIntervalTicks + 2; seq++) {
        const envelope = adapter.buildEnvelope(seq);
        if (envelope.snapshot) {
          snapshotFound = true;
          break;
        }
      }

      expect(snapshotFound).toBe(true);
    });
  });
}

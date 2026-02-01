/**
 * P21 Contract Equivalence — YAML <-> Capsule Shape Drift Detector
 *
 * Loads contracts/cognition-observation.yaml and asserts that the capsule
 * type vocabulary matches the YAML schema. When the YAML or capsule changes,
 * this test breaks — forcing explicit reconciliation.
 *
 * Field name mapping (YAML rig names -> capsule domain-agnostic names):
 *   distBucket   -> proximityBucket
 *   threatLevel  -> riskLevel
 *   kind         -> classLabel
 *   kindEnum     -> classEnum
 *   engineId     -> entityId
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { RISK_LEVEL_ORDER } from './p21-capsule-types';

describe('P21 contract equivalence: YAML <-> capsule types', () => {
  const yamlPath = resolve(__dirname, '../../../../../../contracts/cognition-observation.yaml');
  const spec = parse(readFileSync(yamlPath, 'utf-8'));

  it('SaliencyDeltaRequest required fields match P21Envelope', () => {
    const required: string[] = spec.components.schemas.SaliencyDeltaRequest.required;
    expect(required).toContain('bot_id');
    expect(required).toContain('stream_id');
    expect(required).toContain('seq');
    expect(required).toContain('tick_id');
    expect(required).toContain('saliency_events');
    expect(required).toContain('request_version');
    expect(required).toContain('type');
  });

  it('SaliencyDelta type enum matches P21DeltaType', () => {
    const yamlEnum: string[] = spec.components.schemas.SaliencyDelta.properties.type.enum;
    expect(yamlEnum).toEqual(
      expect.arrayContaining(['new_threat', 'track_lost', 'reclassified', 'movement_bucket_change']),
    );
    expect(yamlEnum).toHaveLength(4);
  });

  it('threatLevel enum matches riskLevel vocabulary', () => {
    const yamlEnum: string[] = spec.components.schemas.SaliencyDelta.properties.threatLevel.enum;
    const capsuleKeys = Object.keys(RISK_LEVEL_ORDER);
    expect(new Set(yamlEnum)).toEqual(new Set(capsuleKeys));
  });

  it('LineOfSight enum matches capsule LOS vocabulary', () => {
    const yamlEnum: string[] = spec.components.schemas.LineOfSight.enum;
    expect(new Set(yamlEnum)).toEqual(new Set(['visible', 'occluded', 'unknown']));
  });

  it('TrackSummary required fields are superset of capsule P21TrackSummary', () => {
    const yamlRequired: string[] = spec.components.schemas.TrackSummary.required;
    // Map rig names -> capsule names and assert the YAML declares all of them
    const expectedYamlFields = [
      'trackId',
      'classLabel',
      'visibility',
      'threatLevel',     // capsule: riskLevel
      'confidence',
      'distBucket',      // capsule: proximityBucket
      'firstSeenTick',
      'lastSeenTick',
      'kindEnum',        // capsule: classEnum
      'posBucketX',
      'posBucketY',
      'posBucketZ',
    ];
    for (const yamlField of expectedYamlFields) {
      expect(yamlRequired).toContain(yamlField);
    }
  });

  it('new_threat track field is documented as required', () => {
    const trackProp = spec.components.schemas.SaliencyDelta.properties.track;
    expect(trackProp.description).toContain('Required for new_threat');
  });
});

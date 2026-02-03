/**
 * Tests for Scenario Loader
 *
 * Validates JSONL loading and schema validation.
 *
 * @author @darianrosebrook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { ScenarioLoader, type EvalScenario } from '../harness/scenario-loader';

describe('ScenarioLoader', () => {
  let loader: ScenarioLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new ScenarioLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-test-'));
  });

  describe('loadSuite', () => {
    it('should load a valid JSONL file', () => {
      const scenario: EvalScenario = {
        scenario_id: 'test-1',
        stimulus: {
          kind: 'low_stimulus_stable',
          strength: 0.1,
          action_affordance: 'discouraged',
        },
        frame: {
          facts: {
            bot: {
              position: { x: 0, y: 64, z: 0 },
              health: 20,
              hunger: 20,
              inventorySummary: [],
              timeOfDay: 'day',
            },
            world: {
              biome: 'plains',
              nearbyEntities: [],
            },
          },
          deltas: [],
          memory: { episodic: [], semantic: [] },
        },
        oracle: { oracle_version: 'v1' },
      };

      const filePath = path.join(tempDir, 'test.jsonl');
      fs.writeFileSync(filePath, JSON.stringify(scenario) + '\n');

      const result = loader.loadSuite(filePath);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios[0].scenario_id).toBe('test-1');
      expect(result.lineCount).toBe(1);
      expect(result.sha256).toHaveLength(64);
    });

    it('should report line-addressable errors for invalid scenarios', () => {
      const validScenario = {
        scenario_id: 'valid-1',
        stimulus: { kind: 'low_stimulus_stable', strength: 0.1, action_affordance: 'discouraged' },
        frame: {
          facts: {
            bot: { position: { x: 0, y: 64, z: 0 }, health: 20, hunger: 20, inventorySummary: [], timeOfDay: 'day' },
            world: { biome: 'plains', nearbyEntities: [] },
          },
          deltas: [],
          memory: { episodic: [], semantic: [] },
        },
        oracle: { oracle_version: 'v1' },
      };

      // Invalid: missing required fields
      const invalidScenario = {
        scenario_id: 'invalid-1',
        stimulus: { kind: 'invalid_kind' }, // missing strength, action_affordance
      };

      const filePath = path.join(tempDir, 'mixed.jsonl');
      fs.writeFileSync(filePath, [
        JSON.stringify(validScenario),
        JSON.stringify(invalidScenario),
      ].join('\n'));

      const result = loader.loadSuite(filePath);

      expect(result.success).toBe(false);
      expect(result.scenarios).toHaveLength(1); // Only valid one
      expect(result.errors.size).toBe(1);
      expect(result.errors.has(2)).toBe(true); // Line 2 has errors
    });

    it('should handle JSON parse errors', () => {
      const filePath = path.join(tempDir, 'invalid-json.jsonl');
      fs.writeFileSync(filePath, '{ invalid json }\n');

      const result = loader.loadSuite(filePath);

      expect(result.success).toBe(false);
      expect(result.errors.has(1)).toBe(true);
      expect(result.errors.get(1)?.[0].message).toContain('JSON parse error');
    });

    it('should compute stable SHA-256 hash', () => {
      const scenario = {
        scenario_id: 'hash-test',
        stimulus: { kind: 'low_stimulus_stable', strength: 0.5, action_affordance: 'allowed' },
        frame: {
          facts: {
            bot: { position: { x: 0, y: 64, z: 0 }, health: 20, hunger: 20, inventorySummary: [], timeOfDay: 'day' },
            world: { biome: 'plains', nearbyEntities: [] },
          },
          deltas: [],
          memory: { episodic: [], semantic: [] },
        },
        oracle: { oracle_version: 'v1' },
      };

      const filePath = path.join(tempDir, 'hash-test.jsonl');
      fs.writeFileSync(filePath, JSON.stringify(scenario) + '\n');

      const result1 = loader.loadSuite(filePath);
      const result2 = loader.loadSuite(filePath);

      expect(result1.sha256).toBe(result2.sha256);
      expect(result1.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('loadSuiteOrThrow', () => {
    it('should throw on invalid suite', () => {
      const filePath = path.join(tempDir, 'invalid.jsonl');
      fs.writeFileSync(filePath, '{ "scenario_id": "x" }\n');

      expect(() => loader.loadSuiteOrThrow(filePath)).toThrow();
    });
  });

  describe('validateScenarioObject', () => {
    it('should return empty array for valid scenario', () => {
      const scenario: EvalScenario = {
        scenario_id: 'valid',
        stimulus: { kind: 'nightfall', strength: 0.6, action_affordance: 'allowed' },
        frame: {
          facts: {
            bot: { position: { x: 0, y: 64, z: 0 }, health: 20, hunger: 20, inventorySummary: [], timeOfDay: 'sunset' },
            world: { biome: 'plains', nearbyEntities: [] },
          },
          deltas: [],
          memory: { episodic: [], semantic: [] },
        },
        oracle: { oracle_version: 'v1' },
      };

      const errors = loader.validateScenarioObject(scenario);
      expect(errors).toHaveLength(0);
    });

    it('should return errors for invalid scenario', () => {
      const invalid = {
        scenario_id: 'x',
        // Missing required fields
      };

      const errors = loader.validateScenarioObject(invalid);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

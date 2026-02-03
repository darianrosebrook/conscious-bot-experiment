/**
 * Scenario Loader for Eval Harness
 *
 * Loads and validates scenario JSONL files using Ajv schema validation.
 * Provides line-addressable error reporting for invalid scenarios.
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

import scenarioLineSchema from '../schemas/scenario_line.schema.json';

// ============================================================================
// Types
// ============================================================================

/**
 * A parsed scenario from the JSONL file.
 */
export interface EvalScenario {
  scenario_id: string;
  stimulus: {
    kind: string;
    strength: number;
    action_affordance: 'discouraged' | 'allowed' | 'expected';
    notes?: string;
  };
  frame: {
    facts: {
      bot: {
        position: { x: number; y: number; z: number };
        health: number;
        hunger: number;
        inventorySummary: Array<{ item: string; count: number }>;
        timeOfDay: 'dawn' | 'day' | 'sunset' | 'night' | 'unknown';
        threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
      };
      world: {
        biome: string;
        nearbyEntities: Array<{
          kind: string;
          count: number;
          distanceMin: number;
          hostile?: boolean;
        }>;
      };
    };
    deltas: Array<{
      type: string;
      value: unknown;
    }>;
    memory: {
      episodic: Array<{ timestampMs: number; text: string }>;
      semantic: Array<{ key: string; text: string }>;
    };
  };
  oracle: {
    oracle_version: string;
    notes?: string;
  };
  tags?: string[];
}

/**
 * Result of loading a scenario suite.
 */
export interface SuiteLoadResult {
  success: boolean;
  /** Path to the suite file */
  path: string;
  /** SHA-256 hash of the file contents */
  sha256: string;
  /** Number of lines in the file */
  lineCount: number;
  /** Successfully parsed scenarios */
  scenarios: EvalScenario[];
  /** Validation errors by line number */
  errors: Map<number, ValidationError[]>;
}

/**
 * A validation error for a specific line.
 */
export interface ValidationError {
  keyword?: string;
  instancePath?: string;
  message?: string;
}

// ============================================================================
// Scenario Loader Class
// ============================================================================

/**
 * Loads and validates scenario JSONL files.
 */
export class ScenarioLoader {
  private ajv: Ajv;
  private validateScenario: ReturnType<Ajv['compile']>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);

    // Compile the schema
    this.validateScenario = this.ajv.compile(scenarioLineSchema);
  }

  /**
   * Load a scenario suite from a JSONL file.
   *
   * @param suitePath - Path to the JSONL file
   * @returns Load result with scenarios and any errors
   */
  loadSuite(suitePath: string): SuiteLoadResult {
    const absolutePath = path.resolve(suitePath);

    // Read the file
    let content: string;
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
    } catch (err) {
      return {
        success: false,
        path: absolutePath,
        sha256: '',
        lineCount: 0,
        scenarios: [],
        errors: new Map([[0, [{ message: `Failed to read file: ${(err as Error).message}` }]]]),
      };
    }

    // Compute SHA-256 hash
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');

    // Split into lines
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    const lineCount = lines.length;

    const scenarios: EvalScenario[] = [];
    const errors = new Map<number, ValidationError[]>();

    // Parse each line
    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1; // 1-indexed for human readability
      const line = lines[i];

      try {
        const parsed = JSON.parse(line);

        // Validate against schema
        const valid = this.validateScenario(parsed);

        if (valid) {
          scenarios.push(parsed as EvalScenario);
        } else {
          // Collect validation errors
          const lineErrors = this.formatErrors(this.validateScenario.errors);
          errors.set(lineNumber, lineErrors);
        }
      } catch (parseErr) {
        // JSON parse error
        errors.set(lineNumber, [{ message: `JSON parse error: ${(parseErr as Error).message}` }]);
      }
    }

    return {
      success: errors.size === 0,
      path: absolutePath,
      sha256,
      lineCount,
      scenarios,
      errors,
    };
  }

  /**
   * Load a suite and throw if any errors.
   *
   * @param suitePath - Path to the JSONL file
   * @returns Loaded scenarios
   * @throws Error if any scenarios fail validation
   */
  loadSuiteOrThrow(suitePath: string): EvalScenario[] {
    const result = this.loadSuite(suitePath);

    if (!result.success) {
      const errorMessages: string[] = [];
      for (const [lineNumber, lineErrors] of result.errors) {
        const messages = lineErrors.map(e => e.message || 'Unknown error').join('; ');
        errorMessages.push(`Line ${lineNumber}: ${messages}`);
      }
      throw new Error(`Failed to load suite ${suitePath}:\n${errorMessages.join('\n')}`);
    }

    return result.scenarios;
  }

  /**
   * Validate a single scenario object.
   *
   * @param scenario - Scenario to validate
   * @returns Validation errors (empty if valid)
   */
  validateScenarioObject(scenario: unknown): ValidationError[] {
    const valid = this.validateScenario(scenario);
    if (valid) return [];
    return this.formatErrors(this.validateScenario.errors);
  }

  /**
   * Format Ajv errors for reporting.
   */
  private formatErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
    if (!errors) return [];

    return errors.map(err => ({
      keyword: err.keyword,
      instancePath: err.instancePath,
      message: err.message,
    }));
  }
}

// ============================================================================
// Suite Discovery
// ============================================================================

/**
 * Discover all suite files in a directory.
 *
 * @param suitesDir - Directory containing suite JSONL files
 * @returns Array of suite file paths
 */
export function discoverSuites(suitesDir: string): string[] {
  const absoluteDir = path.resolve(suitesDir);

  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const files = fs.readdirSync(absoluteDir);
  return files
    .filter(file => file.endsWith('.jsonl'))
    .map(file => path.join(absoluteDir, file))
    .sort();
}

/**
 * Get the suite ID from a suite file path.
 *
 * @param suitePath - Path to the suite file
 * @returns Suite ID (filename without extension)
 */
export function getSuiteId(suitePath: string): string {
  return path.basename(suitePath, '.jsonl');
}

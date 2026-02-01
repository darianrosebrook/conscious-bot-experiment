/**
 * Stress Boundary Logger
 *
 * Logs stress vector (and optional thought/action) at decision boundaries
 * for post-hoc correlation: observation thought, intrusion accept/resist,
 * task selected. Writes JSON lines to a dedicated file or console with prefix.
 *
 * @author @darianrosebrook
 */

import * as fs from 'fs';
import { getInteroState, InteroState } from './interoception-store';

export type StressBoundaryEventType =
  | 'observation_thought'
  | 'intrusion_accept'
  | 'intrusion_resist'
  | 'task_selected';

export interface StressBoundaryLogEntry {
  timestamp: number;
  event: StressBoundaryEventType;
  intero: InteroState;
  axisVector: [number, number, number, number, number, number];
  thoughtSummary?: string;
  actionSummary?: string;
}

const LOG_PREFIX = '[STRESS_BOUNDARY]';
const DEFAULT_LOG_PATH =
  process.env.STRESS_BOUNDARY_LOG_PATH || 'stress-boundary.log';

function formatLine(entry: StressBoundaryLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

function writeToFile(path: string, line: string): void {
  try {
    fs.appendFileSync(path, line);
  } catch {
    console.log(LOG_PREFIX, line.trim());
  }
}

/**
 * Log stress at a decision boundary. Call from observation reasoner (thought
 * produced), after intrusive-thought result (accept/resist), and when a task
 * is selected.
 */
export function logStressAtBoundary(
  event: StressBoundaryEventType,
  options?: { thoughtSummary?: string; actionSummary?: string }
): void {
  const intero = getInteroState();
  const axes = intero.stressAxes;
  const entry: StressBoundaryLogEntry = {
    timestamp: Date.now(),
    event,
    intero,
    axisVector: [
      axes.time,
      axes.situational,
      axes.healthHunger,
      axes.resource,
      axes.protection,
      axes.locationDistance,
    ],
    thoughtSummary: options?.thoughtSummary,
    actionSummary: options?.actionSummary,
  };
  const line = formatLine(entry);
  writeToFile(DEFAULT_LOG_PATH, line);
}

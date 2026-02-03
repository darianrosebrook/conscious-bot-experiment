/**
 * Task Utilities
 *
 * Shared helper for mapping planning-system task shapes to the
 * dashboard Task type used by the store and UI.
 *
 * @author @darianrosebrook
 */

import type { Task } from '@/types';

interface RawPlanningTask {
  id: string;
  title?: string;
  priority?: number;
  progress?: number;
  source?: string;
  steps?: { id: string; label?: string; done?: boolean }[];
  requirement?: unknown;
  metadata?: { titleDisplay?: string; [key: string]: unknown };
}

const SOURCE_MAP: Record<
  string,
  'planner' | 'goal' | 'reflection' | 'intrusion' | 'system'
> = {
  planner: 'planner',
  goal: 'goal',
  intrusive: 'intrusion',
  autonomous: 'system',
  manual: 'system',
};

export function mapPlanningTaskToDashboard(raw: RawPlanningTask): Task {
  const r = raw.requirement as
    | {
        kind?: string;
        quantity?: number;
        have?: number;
        needed?: number;
        patterns?: string[];
        outputPattern?: string;
        proxyPatterns?: string[];
        proxyHave?: number;
      }
    | undefined;

  const requirement: Task['requirement'] =
    r &&
    ['collect', 'mine', 'craft'].includes(r.kind ?? '') &&
    typeof r.quantity === 'number' &&
    typeof r.have === 'number' &&
    typeof r.needed === 'number'
      ? {
          kind: r.kind as 'collect' | 'mine' | 'craft',
          quantity: r.quantity,
          have: r.have,
          needed: r.needed,
          patterns: r.patterns,
          outputPattern: r.outputPattern,
          proxyPatterns: r.proxyPatterns,
          proxyHave: r.proxyHave,
        }
      : undefined;

  return {
    id: raw.id,
    title: raw.metadata?.titleDisplay ?? raw.title ?? 'Task',
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    progress: typeof raw.progress === 'number' ? raw.progress : 0,
    source: SOURCE_MAP[raw.source ?? ''] ?? 'system',
    steps: Array.isArray(raw.steps)
      ? raw.steps.map((s) => ({
          id: s.id,
          label: s.label ?? s.id,
          done: !!s.done,
        }))
      : undefined,
    requirement,
  };
}

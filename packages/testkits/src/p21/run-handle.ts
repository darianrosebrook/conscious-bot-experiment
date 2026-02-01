export type InvariantStatus = 'pass' | 'fail' | 'not_started';

export interface P21RunHandle {
  readonly surfaceName: string;
  readonly status: Readonly<Record<string, InvariantStatus>>;
  passedIds(): Set<string>;
  /** Called by suite it() wrappers. Runs fn, records result, rethrows on fail. Promise-aware. */
  record(invId: string, fn: () => unknown | Promise<unknown>): Promise<void>;
}

export function createRunHandle(surfaceName: string, invariantIds: string[]): P21RunHandle {
  const status: Record<string, InvariantStatus> = {};
  for (const id of invariantIds) status[id] = 'not_started';
  return {
    surfaceName,
    status,
    passedIds() {
      const s = new Set<string>();
      for (const [id, v] of Object.entries(status)) if (v === 'pass') s.add(id);
      return s;
    },
    async record(invId, fn) {
      try {
        const result = fn();
        if (result instanceof Promise) {
          await result;
        }
        status[invId] = 'pass';
      } catch (err) {
        status[invId] = 'fail';
        throw err;
      }
    },
  };
}

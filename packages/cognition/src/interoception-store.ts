/**
 * Interoception Store
 *
 * In-memory store for interoceptive state (stress axes, focus, curiosity) used
 * by cognition. Stress is modelled as 6 axes computed from world state; a
 * weighted composite maintains backward compatibility. All values clamped 0-100.
 *
 * @author @darianrosebrook
 */

const MIN = 0;
const MAX = 100;

export interface StressAxes {
  time: number; // urgency, time since rest/progress
  situational: number; // immediate threats, unexpected events
  healthHunger: number; // low health or food
  resource: number; // scarcity of key items, inventory pressure
  protection: number; // armor, shelter, exposure
  locationDistance: number; // distance from bed/spawn
}

export interface InteroState {
  stress: number; // composite: weighted mean of axes (backward compat)
  focus: number;
  curiosity: number;
  stressAxes: StressAxes;
}

const AXIS_WEIGHTS: Record<keyof StressAxes, number> = {
  situational: 0.25,
  healthHunger: 0.2,
  time: 0.15,
  resource: 0.15,
  protection: 0.15,
  locationDistance: 0.1,
};

const AXIS_DEFAULTS: StressAxes = {
  time: 15,
  situational: 10,
  healthHunger: 10,
  resource: 20,
  protection: 15,
  locationDistance: 10,
};

const DEFAULTS = {
  stress: 20,
  focus: 80,
  curiosity: 75,
} as const;

function clamp(v: number): number {
  return Math.max(MIN, Math.min(MAX, Math.round(v)));
}

function computeComposite(axes: StressAxes): number {
  let sum = 0;
  for (const key of Object.keys(AXIS_WEIGHTS) as (keyof StressAxes)[]) {
    sum += axes[key] * AXIS_WEIGHTS[key];
  }
  return clamp(sum);
}

function makeDefaultState(): InteroState {
  const axes = { ...AXIS_DEFAULTS };
  return {
    stress: computeComposite(axes),
    focus: DEFAULTS.focus,
    curiosity: DEFAULTS.curiosity,
    stressAxes: axes,
  };
}

let state: InteroState = makeDefaultState();

/**
 * Returns the current interoception state (read-only copy).
 */
export function getInteroState(): InteroState {
  return { ...state, stressAxes: { ...state.stressAxes } };
}

/**
 * Set a single stress axis and recompute composite.
 */
export function setStressAxis(axis: keyof StressAxes, value: number): void {
  state.stressAxes[axis] = clamp(value);
  state.stress = computeComposite(state.stressAxes);
}

/**
 * Bulk-set stress axes from world state computation and recompute composite.
 */
export function setStressAxes(partial: Partial<StressAxes>): void {
  for (const key of Object.keys(partial) as (keyof StressAxes)[]) {
    if (typeof partial[key] === 'number') {
      state.stressAxes[key] = clamp(partial[key]);
    }
  }
  state.stress = computeComposite(state.stressAxes);
}

/**
 * Natural per-cycle decay: multiply each axis by rate.
 */
export function decayStressAxes(rate = 0.97): void {
  for (const key of Object.keys(state.stressAxes) as (keyof StressAxes)[]) {
    state.stressAxes[key] = clamp(state.stressAxes[key] * rate);
  }
  state.stress = computeComposite(state.stressAxes);
}

/**
 * Updates stress by a delta (positive = increase, negative = decrease).
 * Targets the situational axis for backward compatibility; recomputes composite.
 */
export function updateStress(delta: number): void {
  state.stressAxes.situational = clamp(state.stressAxes.situational + delta);
  state.stress = computeComposite(state.stressAxes);
}

/**
 * Sets stress to a specific value (clamped).
 * Targets the situational axis for backward compatibility.
 */
export function setStress(value: number): void {
  state.stressAxes.situational = clamp(value);
  state.stress = computeComposite(state.stressAxes);
}

/**
 * Updates focus by a delta. Clamped to 0-100.
 */
export function updateFocus(delta: number): void {
  state.focus = clamp(state.focus + delta);
}

/**
 * Updates curiosity by a delta. Clamped to 0-100.
 */
export function updateCuriosity(delta: number): void {
  state.curiosity = clamp(state.curiosity + delta);
}

/**
 * Resets all axes to defaults.
 */
export function resetIntero(): void {
  state = makeDefaultState();
}

/**
 * Restore intero state from a persisted snapshot (startup).
 * Composite stress is recomputed from axes (not trusted from snapshot).
 */
export function restoreInteroState(snapshot: {
  focus?: number;
  curiosity?: number;
  stressAxes?: Partial<StressAxes>;
}): void {
  if (snapshot.stressAxes) {
    for (const key of Object.keys(AXIS_DEFAULTS) as (keyof StressAxes)[]) {
      if (typeof snapshot.stressAxes[key] === 'number') {
        state.stressAxes[key] = clamp(snapshot.stressAxes[key]!);
      }
    }
  }
  state.stress = computeComposite(state.stressAxes);
  if (typeof snapshot.focus === 'number') state.focus = clamp(snapshot.focus);
  if (typeof snapshot.curiosity === 'number') state.curiosity = clamp(snapshot.curiosity);
}

/**
 * Halve all 6 axes after sleep/respawn. Time and healthHunger get
 * a stronger reset (0.3x) since sleep directly addresses those.
 * Focus and curiosity get a recovery boost.
 */
export function halveStressAxes(): void {
  state.stressAxes.time = clamp(state.stressAxes.time * 0.3);
  state.stressAxes.healthHunger = clamp(state.stressAxes.healthHunger * 0.3);
  state.stressAxes.situational = clamp(state.stressAxes.situational * 0.5);
  state.stressAxes.resource = clamp(state.stressAxes.resource * 0.5);
  state.stressAxes.protection = clamp(state.stressAxes.protection * 0.5);
  state.stressAxes.locationDistance = clamp(
    state.stressAxes.locationDistance * 0.5
  );
  state.stress = computeComposite(state.stressAxes);
  state.focus = clamp(state.focus * 0.5 + 50);
  state.curiosity = clamp(state.curiosity * 0.5 + 50);
}

/** Minimal intrusion result for stress update (avoids coupling to processor). */
export interface IntrusionResultForStress {
  accepted: boolean;
  task?: {
    metadata?: { bucket?: string; category?: string; [key: string]: unknown };
  };
}

const STRESS_RESIST_DECREASE = 8;
const STRESS_ACCEPT_DETRIMENTAL_INCREASE = 6;
const STRESS_ACCEPT_BENEFICIAL_DECREASE = 4;

/**
 * Updates stress from intrusive-thought outcome: resist → decrease;
 * accept + detrimental → increase; accept + beneficial → decrease or hold.
 * Targets the situational axis; recomputes composite.
 */
export function updateStressFromIntrusion(
  result: IntrusionResultForStress
): void {
  if (result.accepted === false) {
    state.stressAxes.situational = clamp(
      state.stressAxes.situational - STRESS_RESIST_DECREASE
    );
    state.stress = computeComposite(state.stressAxes);
    return;
  }
  const bucket = result.task?.metadata?.bucket;
  const category = result.task?.metadata?.category;
  const detrimental =
    typeof bucket === 'string' &&
    (bucket.toLowerCase().includes('risk') ||
      bucket.toLowerCase().includes('threat'));
  const beneficial =
    typeof category === 'string' &&
    (category.toLowerCase().includes('goal') ||
      category.toLowerCase().includes('task'));
  if (detrimental) {
    state.stressAxes.situational = clamp(
      state.stressAxes.situational + STRESS_ACCEPT_DETRIMENTAL_INCREASE
    );
  } else if (beneficial) {
    state.stressAxes.situational = clamp(
      state.stressAxes.situational - STRESS_ACCEPT_BENEFICIAL_DECREASE
    );
  }
  state.stress = computeComposite(state.stressAxes);
}

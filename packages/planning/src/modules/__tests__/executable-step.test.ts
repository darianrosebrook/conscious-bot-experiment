import { describe, it, expect } from 'vitest';
import { normalizeStepExecutability, isExecutableStep } from '../executable-step';

describe('normalizeStepExecutability', () => {
  it('defaults meta.executable to true when leaf is present', () => {
    const step = { meta: { leaf: 'dig_block' } };
    normalizeStepExecutability(step);
    expect(step.meta.executable).toBe(true);
  });

  it('does not override explicit executable false', () => {
    const step = { meta: { leaf: 'dig_block', executable: false } };
    normalizeStepExecutability(step);
    expect(step.meta.executable).toBe(false);
  });
});

describe('isExecutableStep', () => {
  it('returns true when executable is true regardless of authority', () => {
    const step = { meta: { executable: true, authority: 'manual' } };
    expect(isExecutableStep(step)).toBe(true);
  });

  it('returns false when executable is false', () => {
    const step = { meta: { executable: false } };
    expect(isExecutableStep(step)).toBe(false);
  });
});

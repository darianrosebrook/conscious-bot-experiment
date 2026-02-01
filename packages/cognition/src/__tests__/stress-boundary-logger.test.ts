import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { resetIntero, setStressAxes } from '../interoception-store';

/**
 * Tests for stress-boundary-logger: verifies axisVector is present and correct.
 *
 * @author @darianrosebrook
 */

// Mock fs.appendFileSync to capture what gets written
vi.mock('fs', () => ({
  appendFileSync: vi.fn(),
}));

// Import after mocking
import { logStressAtBoundary } from '../stress-boundary-logger';

describe('stress-boundary-logger', () => {
  beforeEach(() => {
    resetIntero();
    vi.clearAllMocks();
  });

  it('writes a JSON line with axisVector containing 6 values', () => {
    logStressAtBoundary('observation_thought', { thoughtSummary: 'test' });

    expect(fs.appendFileSync).toHaveBeenCalledOnce();
    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());

    expect(entry.axisVector).toBeDefined();
    expect(entry.axisVector).toHaveLength(6);
    expect(entry.axisVector.every((v: unknown) => typeof v === 'number')).toBe(true);
  });

  it('axisVector matches order: [time, situational, healthHunger, resource, protection, locationDistance]', () => {
    setStressAxes({
      time: 10,
      situational: 20,
      healthHunger: 30,
      resource: 40,
      protection: 50,
      locationDistance: 60,
    });

    logStressAtBoundary('intrusion_accept');

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());

    expect(entry.axisVector).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('includes intero with stressAxes in the entry', () => {
    logStressAtBoundary('task_selected', { actionSummary: 'mine stone' });

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());

    expect(entry.intero).toBeDefined();
    expect(entry.intero.stressAxes).toBeDefined();
    expect(entry.intero.stress).toEqual(expect.any(Number));
    expect(entry.intero.stressAxes.time).toEqual(expect.any(Number));
  });

  it('includes event type and timestamp', () => {
    const before = Date.now();
    logStressAtBoundary('intrusion_resist', { thoughtSummary: 'dismissed' });
    const after = Date.now();

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());

    expect(entry.event).toBe('intrusion_resist');
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
    expect(entry.thoughtSummary).toBe('dismissed');
  });

  it('axisVector reflects current state after axis changes', () => {
    setStressAxes({ time: 99, situational: 88 });
    logStressAtBoundary('observation_thought');

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());

    expect(entry.axisVector[0]).toBe(99); // time
    expect(entry.axisVector[1]).toBe(88); // situational
  });
});

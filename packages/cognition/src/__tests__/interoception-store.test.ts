import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInteroState,
  setStressAxis,
  setStressAxes,
  decayStressAxes,
  updateStress,
  setStress,
  updateFocus,
  updateCuriosity,
  halveStressAxes,
  updateStressFromIntrusion,
  resetIntero,
  type StressAxes,
} from '../interoception-store';

/**
 * Tests for interoception-store: 6-axis stress model, composite computation,
 * and backward-compatible API.
 *
 * @author @darianrosebrook
 */
describe('interoception-store', () => {
  beforeEach(() => {
    resetIntero();
  });

  describe('defaults', () => {
    it('returns default intero state with stressAxes', () => {
      const state = getInteroState();
      expect(state.focus).toBe(80);
      expect(state.curiosity).toBe(75);
      expect(state.stressAxes).toBeDefined();
      expect(state.stressAxes.time).toBe(15);
      expect(state.stressAxes.situational).toBe(10);
      expect(state.stressAxes.healthHunger).toBe(10);
      expect(state.stressAxes.resource).toBe(20);
      expect(state.stressAxes.protection).toBe(15);
      expect(state.stressAxes.locationDistance).toBe(10);
    });

    it('composite stress is computed from default axes (weighted mean)', () => {
      const state = getInteroState();
      // Weighted mean: sit*0.25 + hh*0.20 + time*0.15 + res*0.15 + prot*0.15 + loc*0.10
      // = 10*0.25 + 10*0.20 + 15*0.15 + 20*0.15 + 15*0.15 + 10*0.10 = 12.5 → 13
      const expected = Math.round(
        10 * 0.25 +  // situational
        10 * 0.20 +  // healthHunger
        15 * 0.15 +  // time
        20 * 0.15 +  // resource
        15 * 0.15 +  // protection
        10 * 0.10    // locationDistance
      );
      expect(state.stress).toBe(expected);
    });

    it('returns a copy, not a reference', () => {
      const a = getInteroState();
      const b = getInteroState();
      a.stressAxes.time = 99;
      expect(b.stressAxes.time).toBe(15);
    });
  });

  describe('setStressAxis', () => {
    it('sets a single axis and recomputes composite', () => {
      setStressAxis('situational', 80);
      const state = getInteroState();
      expect(state.stressAxes.situational).toBe(80);
      // composite should increase since situational has highest weight (0.25)
      expect(state.stress).toBeGreaterThan(13);
    });

    it('clamps to 0-100', () => {
      setStressAxis('time', 150);
      expect(getInteroState().stressAxes.time).toBe(100);
      setStressAxis('time', -20);
      expect(getInteroState().stressAxes.time).toBe(0);
    });
  });

  describe('setStressAxes', () => {
    it('bulk-sets multiple axes', () => {
      setStressAxes({ time: 50, resource: 60, locationDistance: 80 });
      const axes = getInteroState().stressAxes;
      expect(axes.time).toBe(50);
      expect(axes.resource).toBe(60);
      expect(axes.locationDistance).toBe(80);
      // untouched axes remain at defaults
      expect(axes.situational).toBe(10);
      expect(axes.healthHunger).toBe(10);
      expect(axes.protection).toBe(15);
    });

    it('recomputes composite after bulk set', () => {
      const stressBefore = getInteroState().stress;
      setStressAxes({ situational: 100, healthHunger: 100 });
      expect(getInteroState().stress).toBeGreaterThan(stressBefore);
    });
  });

  describe('decayStressAxes', () => {
    it('decays all axes by rate', () => {
      setStressAxes({ time: 100, situational: 100, healthHunger: 100, resource: 100, protection: 100, locationDistance: 100 });
      decayStressAxes(0.5);
      const axes = getInteroState().stressAxes;
      expect(axes.time).toBe(50);
      expect(axes.situational).toBe(50);
      expect(axes.healthHunger).toBe(50);
      expect(axes.resource).toBe(50);
      expect(axes.protection).toBe(50);
      expect(axes.locationDistance).toBe(50);
    });

    it('uses default rate 0.97 when no argument', () => {
      setStressAxis('time', 100);
      decayStressAxes();
      expect(getInteroState().stressAxes.time).toBe(97);
    });
  });

  describe('updateStress (backward compat)', () => {
    it('positive delta increases situational axis', () => {
      const before = getInteroState().stressAxes.situational;
      updateStress(15);
      expect(getInteroState().stressAxes.situational).toBe(before + 15);
    });

    it('negative delta decreases situational axis', () => {
      setStressAxis('situational', 50);
      updateStress(-20);
      expect(getInteroState().stressAxes.situational).toBe(30);
    });

    it('clamps to 0', () => {
      updateStress(-999);
      expect(getInteroState().stressAxes.situational).toBe(0);
    });
  });

  describe('setStress (backward compat)', () => {
    it('sets situational axis to exact value', () => {
      setStress(75);
      expect(getInteroState().stressAxes.situational).toBe(75);
    });
  });

  describe('halveStressAxes', () => {
    it('halves general axes by 0.5', () => {
      setStressAxes({ situational: 80, resource: 60, protection: 40, locationDistance: 100 });
      halveStressAxes();
      const axes = getInteroState().stressAxes;
      expect(axes.situational).toBe(40);
      expect(axes.resource).toBe(30);
      expect(axes.protection).toBe(20);
      expect(axes.locationDistance).toBe(50);
    });

    it('applies stronger 0.3x reset to time and healthHunger', () => {
      setStressAxes({ time: 100, healthHunger: 100 });
      halveStressAxes();
      const axes = getInteroState().stressAxes;
      expect(axes.time).toBe(30);
      expect(axes.healthHunger).toBe(30);
    });

    it('recovers focus and curiosity', () => {
      resetIntero();
      // focus default 80: 80*0.5+50 = 90
      halveStressAxes();
      const state = getInteroState();
      expect(state.focus).toBe(90);
      expect(state.curiosity).toBeGreaterThanOrEqual(75);
    });
  });

  describe('updateStressFromIntrusion', () => {
    it('resist decreases situational by 8', () => {
      setStressAxis('situational', 50);
      updateStressFromIntrusion({ accepted: false });
      expect(getInteroState().stressAxes.situational).toBe(42);
    });

    it('accept detrimental increases situational by 6', () => {
      setStressAxis('situational', 50);
      updateStressFromIntrusion({
        accepted: true,
        task: { metadata: { bucket: 'risk_assessment' } },
      });
      expect(getInteroState().stressAxes.situational).toBe(56);
    });

    it('accept beneficial decreases situational by 4', () => {
      setStressAxis('situational', 50);
      updateStressFromIntrusion({
        accepted: true,
        task: { metadata: { category: 'goal_pursuit' } },
      });
      expect(getInteroState().stressAxes.situational).toBe(46);
    });

    it('accept neutral does not change situational', () => {
      setStressAxis('situational', 50);
      updateStressFromIntrusion({
        accepted: true,
        task: { metadata: { bucket: 'general', category: 'misc' } },
      });
      expect(getInteroState().stressAxes.situational).toBe(50);
    });
  });

  describe('resetIntero', () => {
    it('resets everything to defaults', () => {
      setStressAxes({ time: 99, situational: 99, healthHunger: 99, resource: 99, protection: 99, locationDistance: 99 });
      updateFocus(-50);
      updateCuriosity(-50);
      resetIntero();
      const state = getInteroState();
      expect(state.focus).toBe(80);
      expect(state.curiosity).toBe(75);
      expect(state.stressAxes.time).toBe(15);
      expect(state.stressAxes.situational).toBe(10);
    });
  });

  describe('composite stress is content-addressed', () => {
    it('same axes produce same composite', () => {
      setStressAxes({ time: 40, situational: 60, healthHunger: 30, resource: 50, protection: 20, locationDistance: 70 });
      const a = getInteroState().stress;
      resetIntero();
      setStressAxes({ time: 40, situational: 60, healthHunger: 30, resource: 50, protection: 20, locationDistance: 70 });
      const b = getInteroState().stress;
      expect(a).toBe(b);
    });

    it('different axes produce different composite', () => {
      setStressAxes({ situational: 10 });
      const a = getInteroState().stress;
      setStressAxes({ situational: 90 });
      const b = getInteroState().stress;
      expect(a).not.toBe(b);
    });
  });
});

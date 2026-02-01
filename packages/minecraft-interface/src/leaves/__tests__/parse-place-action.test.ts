/**
 * parsePlaceAction unit tests
 *
 * @author @darianrosebrook
 */

import { describe, it, expect } from 'vitest';
import { parsePlaceAction } from '../crafting-leaves';

describe('parsePlaceAction', () => {
  it('parses place:crafting_table', () => {
    expect(parsePlaceAction('place:crafting_table')).toBe('crafting_table');
  });

  it('parses place:furnace', () => {
    expect(parsePlaceAction('place:furnace')).toBe('furnace');
  });

  it('parses place:blast_furnace', () => {
    expect(parsePlaceAction('place:blast_furnace')).toBe('blast_furnace');
  });

  it('parses place:stone (non-workstation items are still valid parses)', () => {
    expect(parsePlaceAction('place:stone')).toBe('stone');
  });

  it('rejects two colons (tp:craft:furnace)', () => {
    expect(parsePlaceAction('tp:craft:furnace')).toBeNull();
  });

  it('rejects empty item (place:)', () => {
    expect(parsePlaceAction('place:')).toBeNull();
  });

  it('rejects undefined', () => {
    expect(parsePlaceAction(undefined)).toBeNull();
  });

  it('rejects wrong prefix (mine:stone)', () => {
    expect(parsePlaceAction('mine:stone')).toBeNull();
  });

  it('rejects no colon (placestone)', () => {
    expect(parsePlaceAction('placestone')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parsePlaceAction('')).toBeNull();
  });
});

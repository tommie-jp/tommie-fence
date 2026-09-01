import { describe, expect, test } from 'vitest';
import { isThreeLead, isTwoLead, placeableNames, splitPartType } from './types.ts';

describe('splitPartType', () => {
  test('reads a bare type', () => {
    expect(splitPartType('resistor')).toEqual({ type: 'resistor', variant: null, problem: null });
  });

  test('reads a type with a package after the slash', () => {
    expect(splitPartType('capacitor/ceramic')).toEqual({
      type: 'capacitor', variant: 'ceramic', problem: null,
    });
  });

  test('folds a short form into the full name, so only full names come out', () => {
    // 出口 (図・エラー・部品リスト) に略記を出さない。circuit / breadboard と同じ方式。
    expect(splitPartType('r').type).toBe('resistor');
    expect(splitPartType('ec')).toEqual({ type: 'capacitor', variant: 'electrolytic', problem: null });
  });

  test('takes upper case', () => {
    expect(splitPartType('LED').type).toBe('led');
  });

  test('says why a package it cannot draw is refused, instead of drawing the wrong shape', () => {
    const { type, variant, problem } = splitPartType('resistor/ceramic');

    expect(type).toBe('resistor');
    expect(variant).toBeNull();
    expect(problem).toContain('ceramic');
  });

  test('refuses an empty type', () => {
    expect(splitPartType('').problem).not.toBeNull();
  });
});

describe('isTwoLead', () => {
  test('knows the parts it can place', () => {
    expect(isTwoLead('resistor')).toBe(true);
    expect(isTwoLead('led')).toBe(true);
    expect(isTwoLead('capacitor')).toBe(true);
  });

  test('keeps three-lead parts out of the two-lead set', () => {
    expect(isTwoLead('transistor')).toBe(false);
    expect(isTwoLead('dip8')).toBe(false);
  });

  test('lists the names it knows, for the "did you mean" hint', () => {
    expect(placeableNames()).toContain('resistor');
    expect(placeableNames()).toContain('transistor');
    expect(placeableNames().length).toBeGreaterThan(5);
  });
});

describe('isThreeLead', () => {
  test('knows the parts whose three legs are written out', () => {
    expect(isThreeLead('transistor')).toBe(true);
    expect(isThreeLead('potentiometer')).toBe(true);
  });

  test('does not claim two-lead parts', () => {
    expect(isThreeLead('resistor')).toBe(false);
  });
});

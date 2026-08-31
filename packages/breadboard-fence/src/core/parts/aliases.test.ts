import { describe, expect, test } from 'vitest';
import { aliasNames, resolveAlias } from './aliases.ts';

describe('resolveAlias', () => {
  test('folds the one letter shorthands into the full type name', () => {
    expect(resolveAlias('r')).toBe('resistor');
    expect(resolveAlias('c')).toBe('capacitor');
    expect(resolveAlias('l')).toBe('inductor');
    expect(resolveAlias('d')).toBe('diode');
  });

  test('folds a shorthand that carries a look with it', () => {
    expect(resolveAlias('ec')).toBe('capacitor/electrolytic');
    expect(resolveAlias('ecap')).toBe('capacitor/electrolytic');
  });

  test('folds the names circuit-fence uses for the sensors', () => {
    expect(resolveAlias('ldr')).toBe('photoresistor');
    expect(resolveAlias('ntc')).toBe('thermistor-ntc');
    expect(resolveAlias('ptc')).toBe('thermistor-ptc');
  });

  test('keeps the name published in 0.2.0 working as a shorthand', () => {
    expect(resolveAlias('pushbutton')).toBe('button');
    expect(resolveAlias('btn')).toBe('button');
  });

  test('leaves a full type name alone', () => {
    expect(resolveAlias('resistor')).toBeNull();
    expect(resolveAlias('button')).toBeNull();
  });

  test('does not read a shorthand off Object.prototype', () => {
    expect(resolveAlias('constructor')).toBeNull();
    expect(resolveAlias('toString')).toBeNull();
  });

  test('does not offer a shorthand for something the board cannot draw', () => {
    // gnd / op / dc / ac は畳む先の型が無い (レール・device・dipN の領分)。
    for (const name of ['gnd', 'op', 'dc', 'ac', 'v', 'i', 'bat', 'sw']) {
      expect(resolveAlias(name)).toBeNull();
    }
  });
});

describe('aliasNames', () => {
  test('lists the shorthands so a typo can be matched against them', () => {
    expect(aliasNames()).toContain('pot');
    expect(aliasNames()).toContain('xtal');
    expect(aliasNames()).toContain('scr');
  });
});

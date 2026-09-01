import { describe, expect, test } from 'vitest';
import { drawGlyph, glyphOf } from './mapGlyphs.ts';
import { partTypeNames } from '../parts.ts';

describe('glyphOf', () => {
  test('gives the common passives their own shape', () => {
    expect(glyphOf('resistor').name).toBe('resistor');
    expect(glyphOf('capacitor').name).toBe('capacitor');
    expect(glyphOf('inductor').name).toBe('inductor');
  });

  test('folds a family onto one shape, so the table stays small', () => {
    // 電解も可変容量も「コンデンサ」に見えれば掴める。描き分けは図の仕事。
    expect(glyphOf('ecap').name).toBe('capacitor');
    expect(glyphOf('varicap').name).toBe('capacitor');
    expect(glyphOf('led').name).toBe('diode');
    expect(glyphOf('zener').name).toBe('diode');
  });

  test('draws every meter as one circle, told apart by the letter inside', () => {
    expect(glyphOf('ammeter')).toEqual({ name: 'meter', mark: 'A' });
    expect(glyphOf('voltmeter')).toEqual({ name: 'meter', mark: 'V' });
    expect(glyphOf('ohmmeter')).toEqual({ name: 'meter', mark: 'Ω' });
  });

  test('falls back to a box, so a type with no shape still shows up', () => {
    // 名前は箱の中に出るので、どの部品かは分かる。
    expect(glyphOf('npn').name).toBe('box');
    expect(glyphOf('opamp').name).toBe('box');
    expect(glyphOf('nonsuch').name).toBe('box');
  });

  test('has a shape for every part type the fence accepts', () => {
    // 箱に落ちるのは構わない。**落ちる先が無い**のが困る。
    for (const type of partTypeNames()) {
      expect(() => drawGlyph(glyphOf(type).name)).not.toThrow();
    }
  });
});

describe('drawGlyph', () => {
  test('draws around the origin, so the caller can place and rotate it', () => {
    expect(drawGlyph('resistor')).toContain('x="-10"');
  });

  test('draws nothing for a short, which is only a line', () => {
    expect(drawGlyph('short')).toBe('');
  });
});

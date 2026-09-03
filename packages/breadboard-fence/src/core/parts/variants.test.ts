import { describe, expect, test } from 'vitest';
import { isPolarVariant, splitPartType, typesWithVariants, variantsOf } from './variants.ts';

describe('splitPartType', () => {
  test('splits the look off the type', () => {
    expect(splitPartType('capacitor/ceramic')).toEqual({ type: 'capacitor', variant: 'ceramic', problem: null });
  });

  test('leaves a type written without a look alone', () => {
    expect(splitPartType('capacitor')).toEqual({ type: 'capacitor', variant: null, problem: null });
  });

  test('keeps a half written token whole, so it is reported as an unknown type', () => {
    // ここで拾って「見た目が空です」と言うより、種類の名前として丸ごと見せたほうが直しやすい。
    expect(splitPartType('capacitor/')).toEqual({ type: 'capacitor/', variant: null, problem: null });
    expect(splitPartType('/ceramic')).toEqual({ type: '/ceramic', variant: null, problem: null });
  });

  test('keeps everything after the first slash as the look', () => {
    expect(splitPartType('capacitor/ceramic/x')).toEqual({ type: 'capacitor', variant: 'ceramic/x', problem: null });
  });

  test('folds a shorthand into the full type name', () => {
    expect(splitPartType('r')).toEqual({ type: 'resistor', variant: null, problem: null });
    expect(splitPartType('pushbutton')).toEqual({ type: 'button', variant: null, problem: null });
  });

  test('keeps the look written after a shorthand', () => {
    expect(splitPartType('c/ceramic')).toEqual({ type: 'capacitor', variant: 'ceramic', problem: null });
  });

  test('opens a shorthand that carries a look into both halves', () => {
    expect(splitPartType('ec')).toEqual({ type: 'capacitor', variant: 'electrolytic', problem: null });
  });

  test('reports a look written after a shorthand that already carries one', () => {
    const split = splitPartType('ec/tantalum');

    // 黙ってどちらかを勝たせない。ec は電解の略なので、姿はもう決まっている。
    expect(split.problem).toContain('ec');
    expect(split.problem).toContain('capacitor/electrolytic');
  });
});

describe('variantsOf', () => {
  test('lists the looks a capacitor can be drawn as', () => {
    expect(variantsOf('capacitor')).toEqual(['ceramic', 'film', 'electrolytic', 'tantalum']);
  });

  test('lists the looks of the parts whose package differs by size', () => {
    expect(variantsOf('led')).toEqual(['3mm', '5mm']);
    // 面実装は変換基板に載せて差すので、姿は「変換基板ごと 1 つの部品」。
    expect(variantsOf('transistor')).toEqual(['to92', 'to220', 'sot23-dip']);
  });

  test('gives the thyristor and the triac the same packages as the transistor', () => {
    expect(variantsOf('thyristor')).toEqual(['to92', 'to220']);
    expect(variantsOf('triac')).toEqual(['to92', 'to220']);
  });

  test('is empty for a type that is only drawn one way', () => {
    expect(variantsOf('resistor')).toEqual([]);
  });

  test('does not read a look off Object.prototype', () => {
    expect(variantsOf('constructor')).toEqual([]);
    expect(variantsOf('toString')).toEqual([]);
  });
});

describe('isPolarVariant', () => {
  test('knows the electrolytic and the tantalum have a polarity', () => {
    expect(isPolarVariant('electrolytic')).toBe(true);
    expect(isPolarVariant('tantalum')).toBe(true);
  });

  test('knows the ceramic and the film do not', () => {
    expect(isPolarVariant('ceramic')).toBe(false);
    expect(isPolarVariant('film')).toBe(false);
    expect(isPolarVariant('to220')).toBe(false);
  });
});

describe('typesWithVariants', () => {
  test('names the types whose look can be chosen', () => {
    expect(typesWithVariants()).toEqual(['capacitor', 'led', 'transistor', 'thyristor', 'triac']);
  });
});

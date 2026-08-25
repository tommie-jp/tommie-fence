import { describe, expect, test } from 'vitest';
import { isPolarVariant, splitPartType, typesWithVariants, variantsOf } from './variants.ts';

describe('splitPartType', () => {
  test('splits the look off the type', () => {
    expect(splitPartType('capacitor/ceramic')).toEqual({ type: 'capacitor', variant: 'ceramic' });
  });

  test('leaves a type written without a look alone', () => {
    expect(splitPartType('capacitor')).toEqual({ type: 'capacitor', variant: null });
  });

  test('keeps a half written token whole, so it is reported as an unknown type', () => {
    // ここで拾って「見た目が空です」と言うより、種類の名前として丸ごと見せたほうが直しやすい。
    expect(splitPartType('capacitor/')).toEqual({ type: 'capacitor/', variant: null });
    expect(splitPartType('/ceramic')).toEqual({ type: '/ceramic', variant: null });
  });

  test('keeps everything after the first slash as the look', () => {
    expect(splitPartType('capacitor/ceramic/x')).toEqual({ type: 'capacitor', variant: 'ceramic/x' });
  });
});

describe('variantsOf', () => {
  test('lists the looks a capacitor can be drawn as', () => {
    expect(variantsOf('capacitor')).toEqual(['ceramic', 'film', 'electrolytic', 'tantalum']);
  });

  test('lists the looks of the parts whose package differs by size', () => {
    expect(variantsOf('led')).toEqual(['3mm', '5mm']);
    expect(variantsOf('transistor')).toEqual(['to92', 'to220']);
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
    expect(typesWithVariants()).toEqual(['capacitor', 'led', 'transistor']);
  });
});

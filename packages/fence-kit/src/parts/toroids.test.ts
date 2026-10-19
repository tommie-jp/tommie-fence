import { describe, expect, test } from 'vitest';
import { REAL_INK } from './ink.ts';
import { bodySize, drawBody, transformerCore } from './bodies.ts';
import { TOROID_CORES, lookupToroid, tappedTransformerPins, toroidBody, toroidDiameter } from './toroids.ts';

describe('トロイダルコアの表', () => {
  test('finds a core by its model, ignoring case', () => {
    expect(lookupToroid('ft37-43')?.material).toBe('ferrite');
    expect(lookupToroid(' T37-2 ')?.material).toBe('iron-powder');
  });

  test('returns null for an unknown or missing model', () => {
    expect(lookupToroid('FT99-43')).toBeNull();
    expect(lookupToroid(null)).toBeNull();
    expect(lookupToroid(undefined)).toBeNull();
  });

  test('keeps the model spelled in upper case and unique', () => {
    const models = TOROID_CORES.map((entry) => entry.model);
    expect(new Set(models).size).toBe(models.length);
    for (const model of models) expect(model).toBe(model.toUpperCase());
  });

  test('says FT is ferrite and T is iron powder, so the table cannot drift from the naming', () => {
    for (const entry of TOROID_CORES) {
      expect(entry.material).toBe(entry.model.startsWith('FT') ? 'ferrite' : 'iron-powder');
      expect(entry.outerMm).toBeGreaterThan(entry.innerMm);
    }
  });

  test('sizes the diameter from the outer millimetres and the hole pitch', () => {
    // 穴の間隔 10 px のとき、FT37 は外径 9.5 mm = 2.54 mm の 3.74 個ぶん = 37.4 px、T50 は 5 個ぶん = 50 px。
    expect(toroidDiameter(lookupToroid('FT37-43'), 10)).toBeCloseTo(37.4, 1);
    expect(toroidDiameter(lookupToroid('T50-2'), 10)).toBeCloseTo(50, 1);
    expect(toroidDiameter(null, 10)).toBeNull();
  });
});

describe('ドーナツの絵', () => {
  test('punches the hole with an even-odd ring, so the board shows through', () => {
    const svg = toroidBody(40, lookupToroid('FT37-43'), REAL_INK);

    expect(svg).toContain('fill-rule="evenodd"');
  });

  test('paints iron powder mix 2 red and ferrite grey', () => {
    const red = toroidBody(40, lookupToroid('T37-2'), REAL_INK);
    const grey = toroidBody(40, lookupToroid('FT37-43'), REAL_INK);

    expect(red).toContain('#b8382c');
    expect(grey).toContain('#4a4f57');
    expect(toroidBody(40, null, REAL_INK)).toContain('#4a4f57');
  });

  test('winds the copper wire as spokes around the ring', () => {
    const svg = toroidBody(40, null, REAL_INK);

    expect(svg.match(/<line /g)?.length).toBe(14);
  });

  test('runs the colours through the ink, so a black-and-white figure can swap them', () => {
    const svg = toroidBody(40, null, { paint: () => '#000001' });

    expect(svg).not.toContain('#4a4f57');
    expect(svg).toContain('#000001');
  });
});

describe('中点タップ付きトランスのピン', () => {
  test('orders the pins as primary first, then secondary, with the tap in the middle', () => {
    expect(tappedTransformerPins('transformer-ct')).toEqual(['A1', 'A2', 'B1', 'CT', 'B2']);
    expect(tappedTransformerPins('transformer-ct2')).toEqual(['A1', 'ACT', 'A2', 'B1', 'BCT', 'B2']);
  });

  test('knows nothing about other types', () => {
    expect(tappedTransformerPins('transformer')).toBeNull();
  });
});

describe('トロイダルの姿を胴の描画に通す', () => {
  const part = (type: string, variant: string | null) =>
    ({ type, value: null, variant, pins: [{ name: '' }, { name: '' }] });

  test('draws a donut for inductor/toroid and sizes it from the hole span', () => {
    const svg = drawBody(part('inductor', 'toroid'), 60);

    expect(svg).toContain('fill-rule="evenodd"');
    expect(bodySize(part('inductor', 'toroid'), 60).width).toBeCloseTo(33, 0);
    expect(drawBody(part('inductor', null), 60)).not.toContain('evenodd');
  });

  test('draws transformer/toroid as a donut sized and coloured by the model', () => {
    const red = transformerCore(30, 50, REAL_INK, { variant: 'toroid', model: 'T50-2', pitch: 10 });

    expect(red).toContain('#b8382c');
    expect(red).toContain('evenodd');
    // 型番を知らなければ FT37 の大きさ (3.7 ピッチ) の灰色。
    expect(transformerCore(30, 50, REAL_INK, { variant: 'toroid', pitch: 10 })).toContain('#4a4f57');
  });

  test('keeps the laminated body for a transformer with no variant', () => {
    const svg = transformerCore(30, 50, REAL_INK);

    expect(svg).not.toContain('evenodd');
    expect(svg).toContain('<rect');
  });
});

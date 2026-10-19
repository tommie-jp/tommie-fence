import { describe, expect, test } from 'vitest';
import { REAL_INK } from './ink.ts';
import { bodySize, drawBody, transformerCore } from './bodies.ts';
import {
  TOROID_CORES, formatInductance, lookupToroid, parseToroidValue, tappedTransformerPins, toroidBody, toroidDiameter,
  toroidInductanceNh, toroidWindingNotes,
} from './toroids.ts';

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

describe('AL の表 (Amidon の資料の値)', () => {
  test('holds the datasheet AL of each core', () => {
    const al = Object.fromEntries(TOROID_CORES.map((entry) => [entry.model, entry.alNh]));

    expect(al).toEqual({ 'FT37-43': 350, 'FT37-61': 55, 'T37-2': 4.0, 'T50-2': 4.9 });
  });

  test('carries the ferrite tolerance the datasheet states, and none for iron powder, where it states none', () => {
    expect(lookupToroid('FT37-43')?.tolerancePercent).toBe(25);
    expect(lookupToroid('T37-2')?.tolerancePercent).toBeNull();
  });
});

describe('値の読み取り (型番 + 巻数)', () => {
  test('reads a model alone, with one turns word, and with primary:secondary', () => {
    expect(parseToroidValue('FT37-43')).toMatchObject({ turns: null, problem: null });
    expect(parseToroidValue('FT37-43 10t')?.turns).toEqual([10]);
    expect(parseToroidValue('ft37-43 10T:20t')?.turns).toEqual([10, 20]);
  });

  test('is silent about a value that is not a toroid model, such as an inductance', () => {
    expect(parseToroidValue('4u7')).toBeNull();
    expect(parseToroidValue('巻線10回')).toBeNull();
    expect(parseToroidValue(null)).toBeNull();
  });

  test('refuses turns it cannot read and says how to write them', () => {
    for (const bad of ['FT37-43 10', 'FT37-43 ten', 'FT37-43 0t', 'FT37-43 1t:2t:3t', 'FT37-43 10t 20t']) {
      expect(parseToroidValue(bad)?.problem, bad).toContain('10t');
    }
  });
});

describe('L = AL × 巻数²', () => {
  test('matches the numbers the workbook computes by hand', () => {
    // 4-14: 10 回巻き。教科書の表は 35 µH・5.5 µH・0.40 µH。8-8 (バラン) は FT37-61 を 6 回で 2.0 µH。
    expect(toroidInductanceNh(lookupToroid('FT37-43')!, 10)).toBe(35000);
    expect(toroidInductanceNh(lookupToroid('FT37-61')!, 10)).toBe(5500);
    expect(toroidInductanceNh(lookupToroid('T37-2')!, 10)).toBe(400);
    expect(toroidInductanceNh(lookupToroid('FT37-61')!, 6)).toBe(1980);
  });

  test('formats to three significant digits in µH, and mH from 1000 µH', () => {
    expect(formatInductance(35000)).toBe('35 µH');
    expect(formatInductance(400)).toBe('0.4 µH');
    expect(formatInductance(1980)).toBe('1.98 µH');
    expect(formatInductance(35_000_000)).toBe('35 mH');
  });
});

describe('L の目安の一文', () => {
  test('says the inductance of a coil with the AL, the tolerance and that it is a rough figure', () => {
    const note = toroidWindingNotes('inductor', 'FT37-43 10t');

    expect(note).toContain('10 回で約 35 µH');
    expect(note).toContain('AL 350');
    expect(note).toContain('±25 %');
    expect(note).toContain('目安');
  });

  test('says primary and secondary separately for a transformer, one turns word serving both', () => {
    expect(toroidWindingNotes('transformer', 'FT37-43 10t')).toContain('1 次 10 回で約 35 µH、2 次 10 回で約 35 µH');
    expect(toroidWindingNotes('transformer', 'FT37-43 10t:20t')).toContain('2 次 20 回で約 140 µH');
  });

  test('says a centre tap halves the turns, so a quarter of the inductance', () => {
    expect(toroidWindingNotes('transformer-ct2', 'FT37-43 10t')).toContain('L は 1/4');
    expect(toroidWindingNotes('transformer', 'FT37-43 10t')).not.toContain('1/4');
  });

  test('does not claim a tolerance for iron powder, where the datasheet gives none', () => {
    const note = toroidWindingNotes('inductor', 'T37-2 10t');

    expect(note).toContain('実物はずれる');
    expect(note).not.toContain('±');
  });

  test('says nothing for a model alone or a non-toroid value, and reports unreadable turns', () => {
    expect(toroidWindingNotes('transformer', 'FT37-43')).toBeNull();
    expect(toroidWindingNotes('inductor', '4u7')).toBeNull();
    expect(toroidWindingNotes('transformer', 'FT37-43 10')).toContain('10t');
  });

  test('refuses more turns than the part has windings', () => {
    expect(toroidWindingNotes('inductor', 'FT37-43 10t:20t')).toContain('巻線は 1 つ');
  });
});

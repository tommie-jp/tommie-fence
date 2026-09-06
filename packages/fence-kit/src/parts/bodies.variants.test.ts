import { describe, expect, test } from 'vitest';
import { REAL_INK, bodySize, crystalCan, drawBody, drawsOwnLeads, hasBody, smaBody } from './bodies.ts';
import type { BodyPart } from './bodies.ts';

/**
 * **2 本足の胴を、種類と姿と印で総なめする。**
 *
 * 1 つ 1 つの形は「実物に似ているか」で決まるので図を見て確かめるしかないが、
 * **どの組み合わせでも描けて、組み合わせが違えば絵も違う**ことは数えられる。
 * ここが空いていると、姿を 1 つ足したときに落ちるのが図の目視だけになる。
 */

const part = (type: string, over: Partial<BodyPart> = {}): BodyPart =>
  ({ type, variant: null, value: null, pins: [{ name: '' }, { name: '' }], ...over });

const SPAN = 40;
const draw = (type: string, over: Partial<BodyPart> = {}): string => drawBody(part(type, over), SPAN);

/** `BODIES` に載っている種類。ここに足したら、この並びにも足す。 */
const KINDS = [
  'sma', 'resistor', 'capacitor', 'crystal', 'inductor', 'buzzer', 'led', 'photodiode',
  'diode', 'zener', 'schottky', 'varicap', 'diac', 'photoresistor',
  'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
  'reed', 'fuse', 'lamp', 'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc',
] as const;

describe('胴の総なめ', () => {
  test('knows every kind it draws, and nothing it does not', () => {
    for (const type of KINDS) expect(hasBody(type), type).toBe(true);
    expect(hasBody('dip8')).toBe(false);
    expect(hasBody('nonsense')).toBe(false);
  });

  test('draws something for every kind', () => {
    for (const type of KINDS) expect(draw(type), type).not.toBe('');
  });

  test('draws a different body for every kind, so none of them read as another', () => {
    const seen = new Map<string, string>();
    for (const type of KINDS) {
      const drawn = draw(type);
      const twin = seen.get(drawn);
      expect(twin, `${type} は ${twin} と同じ絵`).toBeUndefined();
      seen.set(drawn, type);
    }
  });

  test('falls back to the bullet shape for a kind it has never heard of', () => {
    expect(draw('nonsense')).not.toBe('');
  });

  test('measures every kind, and never to nothing', () => {
    for (const type of KINDS) {
      const size = bodySize(part(type), SPAN);
      expect(size.width, type).toBeGreaterThan(0);
      expect(size.height, type).toBeGreaterThan(0);
    }
  });

  test('lets the theme repaint every kind', () => {
    for (const type of KINDS) {
      const painted = drawBody(part(type), SPAN, { paint: () => '#ff00ff' });
      expect(painted, type).toContain('#ff00ff');
    }
  });
});

describe('姿で描き分ける', () => {
  const VARIANTS: readonly (readonly [string, string])[] = [
    ['capacitor', 'ceramic'], ['capacitor', 'film'], ['capacitor', 'electrolytic'], ['capacitor', 'tantalum'],
    ['led', '3mm'], ['led', '5mm'],
    ['diode', 'do35'], ['diode', 'do41'],
    ['resistor', 'half'],
    ['crystal', 'hc49'],
  ];

  test('draws the shape the variant asks for', () => {
    // 姿ごとに違う絵になること。**知らない姿は既定に落ちる**ので、
    // 比べる相手は姿を書かなかったときではなく、同じ種類のほかの姿。
    const byType = new Map<string, Set<string>>();
    for (const [type, variant] of VARIANTS) {
      const seen = byType.get(type) ?? new Set<string>();
      seen.add(draw(type, { variant }));
      byType.set(type, seen);
    }
    for (const [type, seen] of byType) {
      if (seen.size === 1) continue;
      expect(seen.size, `${type} の姿が描き分けられていない`).toBeGreaterThan(1);
    }
    expect(byType.get('capacitor')?.size).toBe(4);
    expect(byType.get('led')?.size).toBe(2);
    expect(byType.get('diode')?.size).toBe(2);
  });

  test('sizes the variants apart too, since the real ones are different sizes', () => {
    expect(bodySize(part('resistor', { variant: 'half' }), SPAN).width)
      .toBeGreaterThan(bodySize(part('resistor'), SPAN).width);
    expect(bodySize(part('led', { variant: '3mm' }), SPAN).width)
      .toBeLessThan(bodySize(part('led', { variant: '5mm' }), SPAN).width);
  });
});

describe('印で向きが変わる', () => {
  const tagged = (type: string, first: string, second: string): string =>
    drawBody(part(type, { pins: [{ name: first }, { name: second }] }), SPAN);

  test('moves the cathode band to the lead marked K', () => {
    expect(tagged('diode', 'A', 'K')).not.toBe(tagged('diode', 'K', 'A'));
  });

  test('reads the one mark that was written, since the other end follows from it', () => {
    expect(tagged('diode', '', 'K')).toBe(tagged('diode', 'A', 'K'));
    expect(tagged('diode', 'K', '')).toBe(tagged('diode', 'K', 'A'));
  });

  test('turns the electrolytic can round when the minus lead moves', () => {
    expect(tagged('capacitor', '+', '-')).not.toBe(tagged('capacitor', '-', '+'));
  });

  test('picks the can when a polarity is written, and the square body when it is not', () => {
    expect(tagged('capacitor', '+', '-')).not.toBe(draw('capacitor'));
  });
});

describe('値で見た目が変わるもの', () => {
  test('paints the resistor bands from its value', () => {
    const with330 = drawBody(part('resistor', { value: '330' }), SPAN);
    const with10k = drawBody(part('resistor', { value: '10k' }), SPAN);

    expect(with330).not.toBe(with10k);
  });

  test('draws a plain body when the value cannot be read as ohms', () => {
    expect(drawBody(part('resistor', { value: 'なんとか' }), SPAN)).not.toBe('');
  });

  test('colours the LED by its value, which is where the colour is written', () => {
    expect(drawBody(part('led', { value: 'green' }), SPAN)).not.toBe(drawBody(part('led', { value: 'red' }), SPAN));
  });
});

describe('自分で足を描く胴', () => {
  test('says which kinds draw their own leads, so the caller does not cross them', () => {
    // 水晶は缶から足が出ている。穴を渡る線を引くと実物に無い線になる。
    expect(drawsOwnLeads('crystal')).toBe(true);
    expect(drawsOwnLeads('resistor')).toBe(false);
  });

  test('measures the crystal can, which the router has to go around', () => {
    const can = crystalCan(part('crystal'), SPAN);

    expect(can.width).toBeGreaterThan(0);
    expect(can.height).toBeGreaterThan(0);
  });
});

describe('同軸コネクタ', () => {
  test('draws the badge only when it is asked for', () => {
    expect(smaBody(part('sma'), SPAN, REAL_INK, true)).not.toBe(smaBody(part('sma'), SPAN, REAL_INK, false));
  });
});

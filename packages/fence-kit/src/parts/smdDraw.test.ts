import { describe, expect, test } from 'vitest';
import { bodySize, drawBody } from './bodies.ts';
import type { BodyPart } from './bodies.ts';
import { drawPackage, packageHalfWidth, packageReach } from './packages.ts';
import type { PackageShape } from './packages.ts';
import { dipChip } from './chips.ts';
import type { ChipInk } from './chips.ts';
import { SMD_PX_PER_MM, smdLook } from './smd.ts';
import { lookupPinout } from './pinouts.ts';
import { drawDipAdapter, drawDirectSot, drawSipAdapter, drawSmdBody, smdBodySize, sotGlyph, sotMountOf } from './smdDraw.ts';

/**
 * 面実装の姿。**寸法は表の実寸**なので、見張るのは「姿ごとに絵が違う」
 * 「ピンの間隔で伸び縮みしない」「向きの印が書いたピンに従う」の 3 つ。
 */
const part = (type: string, variant: string | null, over: Partial<BodyPart> = {}): BodyPart =>
  ({ type, variant, value: null, pins: [{ name: '' }, { name: '' }], ...over });

const INK: ChipInk = {
  body: '#2b2f36', pin: '#c0c4cc', chipText: '#f0f0f0', plate: '#2c7a4b',
  outside: '#111', halo: '#fff', haloWidth: 3,
};

describe('直付けの 2 ピン', () => {
  test('draws every chip size differently, and none of them as the through-hole body', () => {
    const drawn = ['1608', '2012', '3216'].map((size) => drawBody(part('resistor', size), 40));
    expect(new Set(drawn).size).toBe(3);
    expect(drawn).not.toContain(drawBody(part('resistor', null), 40));
  });

  test('keeps the real size whatever the span', () => {
    // ピンを遠くへ書いても胴は伸びない (実物の寸法)。
    expect(bodySize(part('resistor', '2012'), 20)).toEqual(bodySize(part('resistor', '2012'), 200));
    expect(bodySize(part('resistor', '2012'), 20).width).toBeCloseTo(2.0 * SMD_PX_PER_MM);
  });

  test('grows with the size name', () => {
    const width = (size: string): number => smdBodySize(part('capacitor', size))?.width ?? 0;
    expect(width('1608')).toBeLessThan(width('2012'));
    expect(width('2012')).toBeLessThan(width('3216'));
  });

  test('reaches two holes with the DO-214AC, and stays inside one gap with the SOD-323', () => {
    // 2 穴 (40px) のピン先に届く。SOD-323 は隣の穴 (20px) に収まる。
    expect(smdBodySize(part('diode', 'do214ac'))?.width).toBeGreaterThan(39);
    expect(smdBodySize(part('diode', 'sod323'))?.width).toBeLessThan(20);
  });

  test('tells a resistor chip from a capacitor chip from an LED chip', () => {
    const drawn = ['resistor', 'capacitor', 'led'].map((type) => drawBody(part(type, '2012'), 20));
    expect(new Set(drawn).size).toBe(3);
  });

  test('puts the cathode mark on the side the pins say', () => {
    const plain = drawSmdBody(part('diode', 'sod123'));
    const turned = drawSmdBody(part('diode', 'sod123', { pins: [{ name: 'K' }, { name: 'A' }] }));
    expect(plain).not.toBe(turned);
    const led = drawSmdBody(part('led', '1608', { value: 'green' }));
    expect(led).toContain('#37b34a');
  });

  test('lets the theme repaint it', () => {
    expect(drawSmdBody(part('resistor', '2012'), { paint: () => '#ff00ff' })).toContain('#ff00ff');
  });

  test('leaves the through-hole shapes alone', () => {
    expect(drawSmdBody(part('resistor', 'half'))).toBeNull();
    expect(smdBodySize(part('transistor', 'sot346'))).toBeNull(); // 3 ピンは別の道
  });
});

describe('SOT の胴', () => {
  const spec = (key: string) => {
    const found = smdLook(`${key}-dip`)?.spec;
    if (found?.kind !== 'sot') throw new Error(key);
    return found;
  };

  test('draws S-Mini wider than SOT-23', () => {
    expect(sotGlyph(spec('sot346'))).not.toBe(sotGlyph(spec('sot23')));
  });

  test('gives the SOT-89 its tab', () => {
    // 3 本のピン + タブ + 胴。
    expect(sotGlyph(spec('sot89')).match(/<rect/g)?.length).toBe(5);
    expect(sotGlyph(spec('sot23')).match(/<rect/g)?.length).toBe(4);
  });

  test('sits halfway between the two rows when soldered in a triangle', () => {
    // 1 番 (0,0)・2 番 (20,0)・3 番 (0,20) — 胴は 2 つの行の真ん中。
    const mount = sotMountOf([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }], spec('sot346'));
    expect(mount?.cx).toBeCloseTo(10);
    expect(mount?.cy).toBeCloseTo(10);
    expect(mount?.upright).toBe(true);
    // ピン先は両方の行に届く (1 行 = 20px)。
    expect(mount?.tips[0]?.y).toBeCloseTo(10 - (2.8 * SMD_PX_PER_MM) / 2);
    expect(mount?.tips[2]?.y).toBeCloseTo(10 + (2.8 * SMD_PX_PER_MM) / 2);
  });

  test('turns over when the third leg is on the other side', () => {
    const mount = sotMountOf([{ x: 0, y: 20 }, { x: 20, y: 20 }, { x: 0, y: 0 }], spec('sot23'));
    expect(mount?.upright).toBe(false);
    expect(mount?.cy).toBeCloseTo(10);
  });

  test('draws solder from each foot to its hole, under the body', () => {
    const drawn = drawDirectSot({
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }], variant: 'sot346', lead: '#abcdef',
    });
    expect(drawn.match(/stroke="#abcdef"/g)?.length).toBe(3);
    expect(drawn.indexOf('<line')).toBeLessThan(drawn.indexOf('<g'));
  });

  test('draws nothing for a shape that is not a SOT', () => {
    expect(drawDirectSot({ points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }], variant: '2012', lead: '#000' }))
      .toBe('');
    expect(sotMountOf([{ x: 0, y: 0 }], spec('sot23'))).toBeNull();
  });
});

describe('3 ピンの変換基板', () => {
  const shape: PackageShape = { cx: 100, cy: 50, reach: 21, halfWidth: 28, side: 1, plate: '#2c7a4b', chipBody: '#222' };
  const board = (variant: string): BodyPart => ({ type: 'transistor', variant, value: null, pins: [] });

  test('draws what sits on the adapter, so S-Mini and SOT-23 differ', () => {
    const drawn = ['sot23-dip', 'sot346-dip', 'sot89-dip'].map((variant) => drawPackage(board(variant), shape));
    expect(new Set(drawn).size).toBe(3);
  });

  test('gives every adapter the same board', () => {
    expect(packageReach(board('sot346-dip'), 20)).toBe(packageReach(board('sot23-dip'), 20));
    expect(packageHalfWidth(board('sot89-dip'), 20)).toBe(packageHalfWidth(board('sot23-dip'), 20));
  });

  test('turns the chip over when the header is at the bottom', () => {
    expect(drawPackage(board('sot346-dip'), { ...shape, side: -1 })).toContain('scale(1 -1)');
    expect(drawPackage(board('sot346-dip'), shape)).not.toContain('scale(1 -1)');
  });
});

describe('DIP 化した変換基板', () => {
  const points = [
    { x: 0, y: 60 }, { x: 20, y: 60 }, { x: 40, y: 60 }, { x: 60, y: 60 },
    { x: 60, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 },
  ];
  const options = { points, names: ['1', '2', '3', '4', '5', '6', '7', '8'], pinOne: 0, pitch: 20, caption: 'U1', scale: 1, ink: INK };

  test('draws an SOP on a board, not a DIP', () => {
    const drawn = drawDipAdapter({ ...options, variant: 'sop' });
    expect(drawn).not.toBe(dipChip(options));
    expect(drawn).toContain('#1f6b45'); // 変換基板の緑
  });

  test('tells SOP from TSSOP by the chip', () => {
    expect(drawDipAdapter({ ...options, variant: 'sop' })).not.toBe(drawDipAdapter({ ...options, variant: 'tssop' }));
  });

  test('marks pin 1 at the end the pins say', () => {
    expect(drawDipAdapter({ ...options, variant: 'sop' }))
      .not.toBe(drawDipAdapter({ ...options, variant: 'sop', pinOne: 4 }));
  });

  test('draws the same adapter standing up', () => {
    const upright = points.map((point) => ({ x: point.y, y: point.x }));
    expect(drawDipAdapter({ ...options, points: upright, variant: 'sop' })).toContain('rotate(-90)');
  });

  test('falls back to the DIP resin for a shape it does not know', () => {
    expect(drawDipAdapter({ ...options, variant: 'sot23' })).toBe(dipChip(options));
  });
});

describe('型番が胴を決める面実装 (3SK291) の変換基板', () => {
  const chip = lookupPinout('3SK291', 4)!.chip!;
  const names = ['G1', 'G2', 'D', 'S'];
  // 2 列: 1・2 番が下の行、3・4 番が上の行 (ピンの並びは 1 番から巡る)。行は 3 ピッチ離れる。
  const dip = [{ x: 100, y: 160 }, { x: 120, y: 160 }, { x: 120, y: 100 }, { x: 100, y: 100 }];
  const dipOptions = { points: dip, names, pinOne: 0, pitch: 20, caption: 'Q1 3SK291', scale: 1, ink: INK, chip, label: 'Q1' };
  const sip = [0, 1, 2, 3].map((at) => ({ x: 100 + at * 20, y: 100 }));
  const sipOptions = { points: sip, names, pitch: 20, caption: 'Q1 3SK291', scale: 1, nameSide: 1 as const, ink: INK, chip, label: 'Q1' };

  test('draws the body at its real size on a board, with the marking instead of the model', () => {
    // Act
    const drawn = drawDipAdapter(dipOptions);

    // Assert
    expect(drawn).toContain('#1f6b45'); // 変換基板の緑
    expect(drawn).toContain(`width="${(2.9 * SMD_PX_PER_MM).toFixed(2)}"`);
    expect(drawn).toContain('>U.F<');
    expect(drawn).not.toContain('3SK291');
  });

  test('names every pin and the part', () => {
    const drawn = drawDipAdapter(dipOptions);

    for (const text of [...names, 'Q1']) expect(drawn).toContain(`>${text}<`);
  });

  test('draws one lead wider than the other three', () => {
    const drawn = drawDipAdapter(dipOptions);
    const count = (width: number): number => drawn.split(`width="${(width * SMD_PX_PER_MM).toFixed(2)}"`).length - 1;

    expect(count(0.4)).toBe(3);
    expect(count(0.6)).toBe(1);
  });

  test('moves the pin names off the board when the rows are too close for them', () => {
    // ブレッドボードの溝をまたぐ 2 行は近い。シルクの白ではなく、基板の外の字で出る。
    const close = dip.map((point) => ({ x: point.x, y: point.y === 160 ? 136 : 100 }));

    const drawn = drawDipAdapter({ ...dipOptions, points: close });

    expect(drawn).toContain('>G1<');
    expect(drawn).toContain(`fill="${INK.outside}"`);
  });

  test('draws the single row board with the same body, the header and the names outside', () => {
    const drawn = drawSipAdapter(sipOptions);

    expect(drawn).toContain('#1f6b45');
    expect(drawn).toContain('>U.F<');
    for (const text of [...names, 'Q1']) expect(drawn).toContain(`>${text}<`);
  });

  test('hangs the single row board away from the side the names are on', () => {
    const below = drawSipAdapter(sipOptions);
    const above = drawSipAdapter({ ...sipOptions, nameSide: -1 });

    expect(below).not.toBe(above);
  });
});

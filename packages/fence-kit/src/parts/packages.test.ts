import { describe, expect, test } from 'vitest';
import { drawPackage, packageExtent, packageHalfWidth, packageReach } from './packages.ts';
import { REAL_INK } from './bodies.ts';
import type { BodyPart } from './bodies.ts';
import type { PackageShape } from './packages.ts';

/**
 * **ピンが 3 本以上ある部品のパッケージの姿**。基板に依らないので breadboard と
 * perfboard が共有する — だから**どちらのテストからも見えない場所**にあり、
 * ここで見張らないと誰も見ていないことになる。
 *
 * 見るのは**形が種類と姿で変わること**。線の 1 本 1 本ではなく、
 * 実物を見分けられる印 (D 形の弦・放熱タブ・つまみの溝) が出ているか。
 */

const part = (type: string, variant: string | null = null): BodyPart =>
  ({ type, variant, value: null, pins: [{ name: 'B' }, { name: 'C' }, { name: 'E' }] });

const shape = (over: Partial<PackageShape> = {}): PackageShape => ({
  cx: 100, cy: 50, reach: 12, halfWidth: 12, side: 1, plate: '#2c7a4b', chipBody: '#2b2f36', ...over,
});

const PITCH = 18;

describe('パッケージの大きさ', () => {
  test('grows the body for the packages that are bigger in real life', () => {
    // ピッチに対する比で持つ。基板が変わっても同じ大きさに見える。
    // TO-220 は放熱タブのぶん、半固定抵抗はつまみのぶん、TO-92 より大きい。
    expect(packageReach(part('transistor'), PITCH)).toBeLessThan(packageReach(part('transistor', 'to220'), PITCH));
    expect(packageReach(part('potentiometer'), PITCH)).toBeGreaterThan(packageReach(part('transistor'), PITCH));
    // スライドスイッチは薄い — 縦は TO-92 より小さく、横に広い。
    expect(packageReach(part('slide-switch'), PITCH)).toBeLessThan(packageReach(part('transistor'), PITCH));
  });

  test('makes the adapter board wider than tall, the way the real one is', () => {
    const adapter = part('transistor', 'sot23-dip');

    expect(packageHalfWidth(adapter, PITCH)).toBeGreaterThan(packageReach(adapter, PITCH));
  });

  test('keeps the knob round, and spreads the bare potentiometer sideways', () => {
    const knob = part('potentiometer', 'knob');
    const bare = part('potentiometer');

    expect(packageHalfWidth(knob, PITCH)).toBe(packageReach(knob, PITCH));
    expect(packageHalfWidth(bare, PITCH)).toBeGreaterThan(packageReach(bare, PITCH));
  });

  test('spreads the slide switch sideways, since the lever needs room to run', () => {
    const lever = part('slide-switch');

    expect(packageHalfWidth(lever, PITCH)).toBeGreaterThan(packageReach(lever, PITCH));
  });
});

describe('パッケージの姿', () => {
  test('draws the TO-92 as a D, not a circle, so the flat face is visible', () => {
    // 丸だけで描くと**どちらが平らな面か分からず**、実物を差すときに裏返せる。
    const drawn = drawPackage(part('transistor'), shape());

    expect(drawn).toContain('<path');
    expect(drawn).toContain(' A ');
  });

  test('turns the flat face over when the caption sits on the other side', () => {
    const down = drawPackage(part('transistor'), shape({ side: 1 }));
    const up = drawPackage(part('transistor'), shape({ side: -1 }));

    expect(down).not.toBe(up);
  });

  test('gives the TO-220 a tab, which is how it is told from the TO-92', () => {
    const drawn = drawPackage(part('transistor', 'to220'), shape());

    // 角い胴 + 放熱タブ + ねじ穴の 3 つ。
    expect(drawn.match(/<rect/g)?.length).toBeGreaterThanOrEqual(2);
    expect(drawn).toContain('<circle');
  });

  test('stands the TO-220 on its pins, tab up, whichever side the caption takes', () => {
    const down = drawPackage(part('transistor', 'to220'), shape({ side: 1 }));
    const up = drawPackage(part('transistor', 'to220'), shape({ side: -1 }));
    const ys = [...down.matchAll(/<rect[^>]* y="([\d.-]+)"[^>]* height="([\d.-]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);

    // 胴は向きに依らず、ピンの点 (cy = 50) から上へだけ伸びる。
    expect(up).toBe(down);
    for (const [y, height] of ys) expect(y! + height!).toBeLessThanOrEqual(50);
    // 放熱タブは胴の一番上。
    expect(Math.min(...ys.map(([y]) => y!))).toBe(ys[1]![0]);
    expect(packageExtent(part('transistor', 'to220'), PITCH).down).toBe(0);
    expect(packageExtent(part('transistor', 'to220'), PITCH).up).toBeGreaterThan(2 * packageReach(part('transistor', 'to220'), PITCH));
    expect(packageExtent(part('transistor'), PITCH)).toEqual({ up: packageReach(part('transistor'), PITCH), down: packageReach(part('transistor'), PITCH) });
  });

  test('draws the adapter as a board with a small chip on it, not as a TO-92', () => {
    const adapter = drawPackage(part('transistor', 'sot23-dip'), shape());

    // 変換基板そのもの (緑の基板) + 載っている SOT-23 の胴 + ピンヘッダ。
    expect(adapter.match(/<rect/g)?.length).toBeGreaterThanOrEqual(3);
    expect(adapter).not.toBe(drawPackage(part('transistor'), shape()));
  });

  test('punches the TO-220 screw hole in the board colour, so it does not read as a pin', () => {
    const drawn = drawPackage(part('transistor', 'to220'), shape({ plate: '#123456' }));

    expect(drawn).toContain('#123456');
  });

  test('draws the potentiometer with a slot to turn, and the knob without one', () => {
    const bare = drawPackage(part('potentiometer'), shape());
    const knob = drawPackage(part('potentiometer', 'knob'), shape());

    expect(bare).not.toBe(knob);
    expect(bare.length).toBeGreaterThan(0);
    expect(knob).toContain('<circle');
  });

  test('draws the slide switch with a lever that can sit at either end', () => {
    const drawn = drawPackage(part('slide-switch'), shape());

    expect(drawn.match(/<rect/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('falls back to the TO-92 for a package it does not know', () => {
    const unknown = drawPackage(part('thyristor'), shape());

    expect(unknown).toBe(drawPackage(part('transistor'), shape()));
  });

  test('lets the theme repaint it, since the map draws the same parts in its own colours', () => {
    const plain = drawPackage(part('transistor'), shape(), REAL_INK);
    const painted = drawPackage(part('transistor'), shape(), { paint: () => '#ff00ff' });

    expect(painted).toContain('#ff00ff');
    expect(painted).not.toBe(plain);
  });
});

describe('型番の刻み', () => {
  const named = (type: string, variant: string | null, value: string | null): BodyPart =>
    ({ type, variant, value, pins: [{ name: 'in' }, { name: 'gnd' }, { name: 'out' }] });
  const engraved = (drawn: string): { text: string; size: number } | null => {
    const match = /font-size="([\d.]+)"[^>]*>([^<]+)<\/text>/.exec(drawn);
    return match === null ? null : { text: match[2]!, size: Number(match[1]) };
  };

  test('engraves the value of a regulator and an ic3 in the TO-220 plastic', () => {
    expect(engraved(drawPackage(named('regulator', 'to220', '7805'), shape()))?.text).toBe('7805');
    expect(engraved(drawPackage(named('ic3', 'to220', 'LM317'), shape()))?.text).toBe('LM317');
  });

  test('engraves it in the TO-92 as well', () => {
    expect(engraved(drawPackage(named('regulator', null, '78L05'), shape()))?.text).toBe('78L05');
  });

  test('engraves nothing without a value, and nothing on a transistor', () => {
    expect(engraved(drawPackage(named('regulator', 'to220', null), shape()))).toBeNull();
    expect(engraved(drawPackage(named('regulator', 'to220', '  '), shape()))).toBeNull();
    expect(engraved(drawPackage(named('transistor', 'to220', 'TIP31'), shape()))).toBeNull();
  });

  test('shrinks a long value so it stays inside the plastic', () => {
    const short = engraved(drawPackage(named('regulator', 'to220', '7805'), shape()))!;
    const long = engraved(drawPackage(named('regulator', 'to220', 'AMS1117-3.3-ADJ'), shape()))!;

    expect(long.size).toBeLessThan(short.size);
  });

  test('uses the ink it is given', () => {
    expect(drawPackage(named('regulator', 'to220', '7805'), shape({ chipText: '#abcdef' }))).toContain('#abcdef');
  });
});

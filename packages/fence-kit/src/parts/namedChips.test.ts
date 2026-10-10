import { describe, expect, test } from 'vitest';
import { drawNamedChip, lookupNamedChip, namedChipBox, namedChipLooks, namedChipTypes } from './namedChips.ts';

/**
 * ピンに名前のある DIP 型の部品 (52 の docs/66 の段 3)。**DIP のピンの位置のうち、
 * ピンのある所に名前が付いた物**として 3 つのフェンスが同じ表を読む。
 * ピンの並びは実物のデータシート (段 0 で確かめた)。
 */

describe('名前つきの DIP 型の表', () => {
  test('knows the relay, the photocoupler and the seven-segment display', () => {
    expect(namedChipTypes()).toEqual(['relay', 'photocoupler', 'photocoupler6', 'seg7', 'seg7x4', 'dip-switch4', 'dip-switch8']);
    expect(namedChipLooks('relay')).toEqual(['g5v-2']);
  });

  test('puts the G5V-2 on eight of the sixteen DIP places, across three holes', () => {
    const relay = lookupNamedChip('relay', null);

    expect(relay).toMatchObject({ name: 'G5V-2', positions: 16, rowSpan: 3 });
    expect(relay?.pins).toEqual([
      { at: 1, name: 'A1' }, { at: 4, name: 'COM1' }, { at: 6, name: 'NC1' }, { at: 8, name: 'NO1' },
      { at: 9, name: 'NO2' }, { at: 11, name: 'NC2' }, { at: 13, name: 'COM2' }, { at: 16, name: 'A2' },
    ]);
  });

  test('puts the PC817 on a DIP4 and the 5161AS on two rows six holes apart', () => {
    expect(lookupNamedChip('photocoupler', 'pc817')?.pins.map((pin) => pin.name)).toEqual(['A', 'K', 'E', 'C']);
    const display = lookupNamedChip('seg7', null);
    expect(display).toMatchObject({ positions: 10, rowSpan: 6 });
    expect(display?.pins.map((pin) => pin.name)).toEqual(['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g']);
  });

  test('puts the 4N35 on a DIP6: anode, cathode, NC, emitter, collector, base', () => {
    const opto = lookupNamedChip('photocoupler6', null);
    expect(opto).toMatchObject({ name: '4N35', kindName: 'フォトカプラ', prefix: 'U', positions: 6, rowSpan: 3 });
    expect(opto?.pins.map((pin) => `${pin.at}${pin.name}`)).toEqual(['1A', '2K', '3NC', '4E', '5C', '6B']);
  });

  test('puts a DIP switch on every place of a DIP, one switch between the facing legs', () => {
    const four = lookupNamedChip('dip-switch4', null);
    expect(four).toMatchObject({ kindName: 'DIP スイッチ', prefix: 'SW', positions: 8, rowSpan: 3, body: 'switch' });
    // k 番のスイッチは k 番のピン (Ak) と、向かいのピン (Bk) の間。
    expect(four?.pins.map((pin) => pin.name)).toEqual(['A1', 'A2', 'A3', 'A4', 'B4', 'B3', 'B2', 'B1']);

    const eight = lookupNamedChip('dip-switch8', null);
    expect(eight).toMatchObject({ positions: 16, rowSpan: 3 });
    expect(eight?.pins[0]).toEqual({ at: 1, name: 'A1' });
    expect(eight?.pins[15]).toEqual({ at: 16, name: 'B1' });
    expect(eight?.pins[8]).toEqual({ at: 9, name: 'B8' });
  });

  test('puts the OSL40562-LR on two rows of six, six holes apart, with the digits common to each digit', () => {
    const display = lookupNamedChip('seg7x4', null);
    expect(display).toMatchObject({
      look: 'osl40562', name: 'OSL40562-LR', kindName: '4 桁 7 セグメント LED', prefix: 'DS',
      positions: 12, rowSpan: 6, body: 'display', digits: 4,
    });
    // OptoSupply のデータシート 2 ページめの図。1 番が左下、12 番が左上。
    expect(display?.pins.map((pin) => `${pin.at}${pin.name}`)).toEqual([
      '1e', '2d', '3dp', '4c', '5g', '6DIG4', '7b', '8DIG3', '9DIG2', '10f', '11a', '12DIG1',
    ]);
    expect(lookupNamedChip('seg7x4', 'osl40562')).toBe(display);
    // 1 桁の 5161AS は 1 桁のまま (書かなければ 1)。
    expect(lookupNamedChip('seg7', null)?.digits).toBeUndefined();
  });

  test('answers null for a kind or a look it does not know, and for inherited names', () => {
    expect(lookupNamedChip('relay', 'g5v-1')).toBeNull();
    expect(lookupNamedChip('dip8', null)).toBeNull();
    expect(lookupNamedChip('constructor', null)).toBeNull();
    expect(namedChipLooks('toString')).toEqual([]);
  });
});

describe('名前つきの DIP 型の絵', () => {
  const INK = { body: '#222', pin: '#ccc', chipText: '#fff', plate: '#eee', outside: '#000', halo: '#fff', haloWidth: 2 };
  const row = (y: number, count: number) => Array.from({ length: count }, (_, index) => ({ x: 100 + index * 20, y }));

  test('names the pins and prints the part name on a relay', () => {
    const chip = lookupNamedChip('relay', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(100, 4), ...row(160, 4)], names: ['A1', 'COM1', 'NC1', 'NO1', 'NO2', 'NC2', 'COM2', 'A2'],
      pitch: 20, caption: 'G5V-2', scale: 1, ink: INK,
    });

    expect(svg).toContain('COM1');
    expect(svg).toContain('G5V-2');
    // 名前の外側に DIP の番号も刷る (52 の docs/95 の決め 2)。COM1 は 4 番、NO2 は 9 番。
    expect(svg).toMatch(/>4<\/text>/);
    expect(svg).toMatch(/>9<\/text>/);
  });

  test('prints the numbers of a photocoupler too, but not on the face of a display', () => {
    const coupler = lookupNamedChip('photocoupler', null)!;
    const svg = drawNamedChip({
      chip: coupler, points: [...row(100, 2), ...row(160, 2)], names: ['A', 'K', 'E', 'C'],
      pitch: 20, caption: 'PC817', scale: 1, ink: INK,
    });
    expect(svg).toMatch(/>1<\/text>/);
    expect(svg).toMatch(/>K<\/text>/);

    const display = drawNamedChip({
      chip: lookupNamedChip('seg7', null)!, points: [...row(100, 5), ...row(220, 5).reverse()],
      names: ['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g'],
      pitch: 20, caption: '5161AS', scale: 1, ink: INK,
    });
    expect(display).not.toMatch(/>3<\/text>/);
  });

  test('draws one slider per switch on a DIP switch, with the numbers and the names of the legs', () => {
    const chip = lookupNamedChip('dip-switch4', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(160, 4), ...row(100, 4).reverse()], names: chip.pins.map((pin) => pin.name),
      pitch: 20, caption: 'DIP SW', scale: 1, ink: INK,
    });

    expect(svg.match(/class="dip-switch-slot"/g)).toHaveLength(4);
    expect(svg.match(/class="dip-switch-knob"/g)).toHaveLength(4);
    // 品名は胴に刷らない (つまみの置き場)。部品リストとキャプションに出る。
    expect(svg).not.toContain('DIP SW');
    expect(svg).toMatch(/>A1<\/text>/);
    expect(svg).toMatch(/>8<\/text>/);
  });

  test('draws four faces inside the long body of a four-digit display, one per five pitches', () => {
    const chip = lookupNamedChip('seg7x4', null)!;
    // 1〜6 番が下の列 (y = 220) を左から、7〜12 番が上の列 (y = 100) を右から。
    const points = [...row(220, 6), ...row(100, 6).reverse()];
    const svg = drawNamedChip({
      chip, points, names: chip.pins.map((pin) => pin.name), pitch: 20, caption: 'OSL40562-LR', scale: 1, ink: INK,
    });

    const faces = [...svg.matchAll(/translate\(([\d.-]+) ([\d.-]+)\) rotate\(([\d.-]+)\)/g)];
    expect(faces).toHaveLength(4);
    // 桁の中心は 1 番と 6 番の列の間の 5 ピッチおき。DIG1 が左 (1 番の側)。
    expect(faces.map((face) => Number(face[1]))).toEqual([0, 100, 200, 300]);
    expect(faces.every((face) => Number(face[2]) === 160 && face[3] === '0')).toBe(true);
    expect(svg).not.toContain('OSL40562-LR');
    expect(svg).toMatch(/>DIG1<\/text>/);
    // 隣り合う DIG2 (9 番) と DIG3 (8 番) は字がつながらないよう 1 段ずらす。
    const yOf = (name: string): number => Number(new RegExp(`y="([\\d.]+)"[^>]*>${name}<`).exec(svg)?.[1]);
    expect(yOf('DIG2')).not.toBe(yOf('DIG3'));
    expect(Number.isFinite(yOf('DIG1'))).toBe(true);
    expect(yOf('DIG1')).toBe(yOf('a'));

    // 胴は外形どおり 50.30 mm (19.8 ピッチ) の横長で、4 つの桁を収める。
    const box = namedChipBox(chip, points, 20);
    expect(box.width).toBeCloseTo((50.3 / 2.54) * 20, 5);
    expect(box.x + box.width / 2).toBeCloseTo(150, 5);
    expect(box.x).toBeLessThan(0 - 30);
    expect(box.x + box.width).toBeGreaterThan(300 + 30);
  });

  test('keeps the box of a one-digit display and of the other chips the same as a DIP', () => {
    const points = [...row(220, 5), ...row(100, 5).reverse()];
    const box = namedChipBox(lookupNamedChip('seg7', null)!, points, 20);
    expect(box).toEqual({ x: 91, y: 95, width: 98, height: 130 });
  });

  test('draws the face of the display instead of its name', () => {
    const chip = lookupNamedChip('seg7', null)!;
    const svg = drawNamedChip({
      chip, points: [...row(100, 5), ...row(220, 5).reverse()],
      names: ['e', 'd', 'COM1', 'c', 'dp', 'b', 'a', 'COM2', 'f', 'g'],
      pitch: 20, caption: '5161AS', scale: 1, ink: INK,
    });

    expect(svg).not.toContain('5161AS');
    // 桁の上は 6〜10 番の列 (y = 220 の側) — 下向きなので 180 度回る。
    expect(svg).toContain('rotate(180)');
  });
});

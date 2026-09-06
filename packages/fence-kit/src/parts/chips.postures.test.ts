import { describe, expect, test } from 'vitest';
import { boardBox, boardChip, chipAlongX, dipBox, dipChip, sipBox, sipHeader } from './chips.ts';
import type { ChipInk, ChipPoint } from './chips.ts';
import { boardPartNames, lookupBoardPart } from './boards.ts';

/**
 * **パッケージの姿を、置き方ごとに総なめする。**
 *
 * 描画と当たり判定が同じ形を使う約束 (perfboard の CLAUDE.md の 9) を守るには、
 * `dipBox` / `sipBox` / `boardBox` が絵と揃っている必要がある。ここでは
 * **どの向きに置いても描けて、印 (切り欠き・USB) が 1 番ピンの側に付く**ことを見る。
 */

const INK: ChipInk = {
  body: '#23272e', pin: '#c9ced6', chipText: '#f2f2f2', plate: '#f2efe6',
  outside: '#3f4650', halo: '#ffffff', haloWidth: 3,
};

const PITCH = 20;

/** 横に寝た DIP の足 (上の列を左から、下の列を右から — 実物の番号の巡り)。 */
const dipPoints = (count: number): readonly ChipPoint[] => {
  const half = count / 2;
  const top = Array.from({ length: half }, (_, index) => ({ x: index * PITCH, y: 0 }));
  const bottom = Array.from({ length: half }, (_, index) => ({ x: (half - 1 - index) * PITCH, y: 3 * PITCH }));
  return [...top, ...bottom];
};

/** 縦に立てた DIP。 */
const dipDown = (count: number): readonly ChipPoint[] =>
  dipPoints(count).map((one) => ({ x: one.y, y: one.x }));

const row = (count: number): readonly ChipPoint[] =>
  Array.from({ length: count }, (_, index) => ({ x: index * PITCH, y: 0 }));

const column = (count: number): readonly ChipPoint[] =>
  Array.from({ length: count }, (_, index) => ({ x: 0, y: index * PITCH }));

const names = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => String(index + 1));

describe('足の列の向き', () => {
  test('reads the row from the first two legs, which are always neighbours', () => {
    expect(chipAlongX(row(4))).toBe(true);
    expect(chipAlongX(column(4))).toBe(false);
  });

  test('says nothing sensible for no legs at all, without throwing', () => {
    expect(() => chipAlongX([])).not.toThrow();
  });
});

describe('DIP', () => {
  test('draws nothing when it has no legs, rather than an empty box', () => {
    expect(dipChip({ points: [], names: [], pinOne: 0, pitch: PITCH, caption: '', scale: 1, ink: INK })).toBe('');
  });

  test('wraps the legs in a body, in both postures', () => {
    for (const points of [dipPoints(8), dipDown(8)]) {
      const box = dipBox(points, PITCH);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test('marks pin one, so the chip cannot be read in upside down', () => {
    const points = dipPoints(8);
    const first = dipChip({ points, names: names(8), pinOne: 0, pitch: PITCH, caption: '', scale: 1, ink: INK });
    const other = dipChip({ points, names: names(8), pinOne: 4, pitch: PITCH, caption: '', scale: 1, ink: INK });

    expect(first).not.toBe(other);
  });

  test('draws the standing chip differently from the lying one', () => {
    const lying = dipChip({ points: dipPoints(8), names: names(8), pinOne: 0, pitch: PITCH, caption: '', scale: 1, ink: INK });
    const standing = dipChip({ points: dipDown(8), names: names(8), pinOne: 0, pitch: PITCH, caption: '', scale: 1, ink: INK });

    expect(lying).not.toBe(standing);
  });

  test('puts the caption on the body, cut to fit rather than spilling out', () => {
    const short = dipChip({ points: dipPoints(8), names: names(8), pinOne: 0, pitch: PITCH, caption: 'NE555', scale: 1, ink: INK });
    const long = dipChip({
      points: dipPoints(8), names: names(8), pinOne: 0, pitch: PITCH, scale: 1, ink: INK,
      caption: 'とても長い日本語のラベルをわざと書いた',
    });

    expect(short).toContain('NE555');
    expect(long).not.toBe(short);
  });

  test('marks pin one at the other end of the standing chip as well', () => {
    const points = dipDown(8);
    const first = dipChip({ points, names: names(8), pinOne: 0, pitch: PITCH, caption: 'A', scale: 1, ink: INK });
    const other = dipChip({ points, names: names(8), pinOne: 4, pitch: PITCH, caption: 'A', scale: 1, ink: INK });

    expect(first).not.toBe(other);
  });

  test('boxes the standing chip the other way round', () => {
    const lying = dipBox(dipPoints(8), PITCH);
    const standing = dipBox(dipDown(8), PITCH);

    expect(standing.width).toBeCloseTo(lying.height);
    expect(standing.height).toBeCloseTo(lying.width);
  });

  test('draws every size the palette offers', () => {
    for (const pins of [4, 6, 8, 14, 16, 20, 28, 40]) {
      const drawn = dipChip({
        points: dipPoints(pins), names: names(pins), pinOne: 0, pitch: PITCH, caption: '', scale: 1, ink: INK,
      });
      expect(drawn, `dip${pins}`).not.toBe('');
    }
  });
});

describe('SIP', () => {
  test('draws nothing when it has no legs', () => {
    expect(sipHeader({ points: [], names: [], pitch: PITCH, caption: '', scale: 1, nameSide: 1, ink: INK })).toBe('');
  });

  test('keeps the same margin either way round, since the bar is square in section', () => {
    expect(sipBox(row(4), PITCH).height).toBe(sipBox(column(4), PITCH).width);
  });

  test('puts the names outside the bar, on the side it was told', () => {
    const below = sipHeader({ points: row(4), names: names(4), pitch: PITCH, caption: '', scale: 1, nameSide: 1, ink: INK });
    const above = sipHeader({ points: row(4), names: names(4), pitch: PITCH, caption: '', scale: 1, nameSide: -1, ink: INK });

    expect(below).not.toBe(above);
  });

  test('draws the standing bar differently from the lying one', () => {
    const lying = sipHeader({ points: row(4), names: names(4), pitch: PITCH, caption: '', scale: 1, nameSide: 1, ink: INK });
    const standing = sipHeader({ points: column(4), names: names(4), pitch: PITCH, caption: '', scale: 1, nameSide: 1, ink: INK });

    expect(lying).not.toBe(standing);
  });

  test('draws every size the palette offers', () => {
    for (const pins of [2, 3, 4, 5, 6, 8, 10, 20, 40]) {
      const drawn = sipHeader({
        points: row(pins), names: names(pins), pitch: PITCH, caption: '', scale: 1, nameSide: 1, ink: INK,
      });
      expect(drawn, `sip${pins}`).not.toBe('');
    }
  });
});

describe('マイコンボード', () => {
  const pins = 40;

  test('draws nothing when it has no legs', () => {
    expect(boardChip({ points: [], names: [], definition: null, pitch: PITCH, scale: 1, ink: INK })).toBe('');
  });

  test('draws every board the palette offers, with its own pin names', () => {
    for (const name of boardPartNames()) {
      const definition = lookupBoardPart(name);
      const drawn = boardChip({
        points: dipPoints(pins), names: names(pins), definition, pitch: PITCH, scale: 1, ink: INK,
      });
      expect(drawn, name).not.toBe('');
    }
  });

  test('puts the USB on the pin one end, so it reads like the real pinout', () => {
    const definition = lookupBoardPart(boardPartNames()[0] ?? '');
    const start = boardChip({ points: dipPoints(pins), names: names(pins), definition, pinOne: 0, pitch: PITCH, scale: 1, ink: INK });
    const other = boardChip({ points: dipPoints(pins), names: names(pins), definition, pinOne: 20, pitch: PITCH, scale: 1, ink: INK });

    expect(start).not.toBe(other);
  });

  test('still draws when the board is not one it knows', () => {
    const drawn = boardChip({
      points: dipPoints(pins), names: names(pins), definition: null, pitch: PITCH, scale: 1, ink: INK,
    });

    expect(drawn).not.toBe('');
  });

  test('draws the standing board differently from the lying one', () => {
    const definition = lookupBoardPart(boardPartNames()[0] ?? '');
    const lying = boardChip({ points: dipPoints(pins), names: names(pins), definition, pitch: PITCH, scale: 1, ink: INK });
    const standing = boardChip({ points: dipDown(pins), names: names(pins), definition, pitch: PITCH, scale: 1, ink: INK });

    expect(lying).not.toBe(standing);
  });

  test('puts the USB at the other end of the standing board too', () => {
    const definition = lookupBoardPart(boardPartNames()[0] ?? '');
    const start = boardChip({ points: dipDown(pins), names: names(pins), definition, pinOne: 0, pitch: PITCH, scale: 1, ink: INK });
    const other = boardChip({ points: dipDown(pins), names: names(pins), definition, pinOne: 20, pitch: PITCH, scale: 1, ink: INK });

    expect(start).not.toBe(other);
  });

  test('boxes the standing board the other way round', () => {
    const lying = boardBox(dipPoints(pins), PITCH);
    const standing = boardBox(dipDown(pins), PITCH);

    expect(standing.width).toBeCloseTo(lying.height);
    expect(standing.height).toBeCloseTo(lying.width);
  });

  test('boxes the board around all of its legs', () => {
    const box = boardBox(dipPoints(pins), PITCH);

    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from 'vitest';
import { regulatorShapeTex, sipShapeName, sipShapeTex, smaShapeTex } from './shapes.ts';

/**
 * ピンヘッダの記号。**circuitikz に無いので自分で宣言する** — その宣言が
 * 足の数だけアンカーを持ち、輪郭と足の線を描くことを見る。
 */
describe('sipShapeTex', () => {
  test('declares a shape named after the pin count, matching the part symbol', () => {
    expect(sipShapeName(4)).toBe('sip4');
    expect(sipShapeTex(4).join('\n')).toContain('\\pgfdeclareshape{sip4}');
  });

  test('gives every leg two anchors: the tip to wire to, and the edge to write on', () => {
    const tex = sipShapeTex(4).join('\n');

    for (const at of [1, 2, 3, 4]) {
      expect(tex).toContain(`\\anchor{pin ${at}}`);
      expect(tex).toContain(`\\anchor{bpin ${at}}`);
    }
    expect(tex).not.toContain('\\anchor{pin 5}');
  });

  test('numbers the legs from the top, as the packages do', () => {
    const lines = sipShapeTex(4);
    const yOf = (name: string): number =>
      Number(/\{(-?[\d.]+)cm\}\}$/.exec(lines.find((line) => line.includes(`{${name}}`)) ?? '')?.[1] ?? NaN);

    expect(yOf('pin 1')).toBeGreaterThan(yOf('pin 4'));
  });

  test('draws the outline and one lead per leg', () => {
    const tex = sipShapeTex(4).join('\n');

    expect(tex).toContain('\\pgfpathrectanglecorners');
    expect((tex.match(/\\pgfpathmoveto/g) ?? []).length).toBe(4);
  });

  test('grows with the pin count, so the legs never crowd', () => {
    const heightOf = (pins: number): number =>
      Number(/rectanglecorners\{\\pgfpoint\{-?[\d.]+cm\}\{(-?[\d.]+)cm\}\}/
        .exec(sipShapeTex(pins).join('\n'))?.[1] ?? NaN);

    expect(Math.abs(heightOf(8))).toBeGreaterThan(Math.abs(heightOf(4)));
  });
});

describe('regulatorShapeTex / smaShapeTex', () => {
  test('gives the regulator three legs on three sides, as the schematic draws it', () => {
    const tex = regulatorShapeTex().join('\n');

    for (const at of [1, 2, 3]) expect(tex).toContain(`\\anchor{pin ${at}}`);
    expect(tex).toContain('\\anchor{south}');
  });

  test('draws the coax connector as a circle with the core in the middle', () => {
    // 実機で「SMA コネクタの回路図が正しくない」。素の箱ではなく、丸の中に
    // 中心導体、外周が外皮という慣習どおりの形にした。
    const tex = smaShapeTex().join('\n');

    expect(tex).toContain('\\pgfpathcircle');
    // 中心導体は塗り潰した点。
    expect(tex).toContain('\\pgfusepath{fill}');
    // 1 が中心導体 (左)、2 が外皮 (下)。
    expect(tex).toContain('\\anchor{pin 1}');
    expect(tex).toContain('\\anchor{pin 2}');
  });

  test('declares the edge anchors, so a value can hang off the symbol', () => {
    // 宣言しないと `at (U.south)` が中心に落ちる (実機で気づいた)。
    for (const shape of [regulatorShapeTex(), smaShapeTex(), sipShapeTex(4)]) {
      const tex = shape.join('\n');
      for (const edge of ['north', 'south', 'east', 'west']) {
        expect(tex).toContain(`\\anchor{${edge}}`);
      }
    }
  });
});

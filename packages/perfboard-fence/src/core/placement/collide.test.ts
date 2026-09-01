import { describe, expect, test } from 'vitest';
import { checkFit } from './collide.ts';
import { createBoard, holeStrip } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { PlacedPart } from '../types.ts';

const layout = createLayout(createBoard({ cols: 14, rows: 8 }));
const at = (hole: string) => parseAddress(hole)!;

const part = (id: string, holes: readonly string[], type = 'resistor', line = 1): PlacedPart => ({
  id,
  type,
  variant: null,
  value: null,
  line,
  pins: holes.map((hole) => ({ address: at(hole), strip: holeStrip(at(hole)) })),
});

describe('当たり判定', () => {
  test('says nothing about parts that sit apart', () => {
    expect(checkFit([part('R1', ['b3', 'b7']), part('R2', ['d3', 'd7'])], layout)).toEqual([]);
  });

  test('names both parts when one lies across the other', () => {
    // 足は別の穴でも**胴が交差する**。47 の 06 で「Lcapy は並列部品を黙って
    // 重ねる」を弱点として挙げた以上、同じことをしては筋が通らない。
    const found = checkFit([part('R1', ['b3', 'b7']), part('R2', ['a5', 'c5'], 'resistor', 4)], layout);

    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('R1');
    expect(found[0]?.message).toContain('R2');
  });

  test('points at the later of the two lines, where the clash was written', () => {
    const found = checkFit([part('R1', ['b3', 'b7'], 'resistor', 3), part('R2', ['a5', 'c5'], 'resistor', 4)], layout);

    expect(found[0]?.line).toBe(4);
  });

  test('says it once per pair, not once per part', () => {
    const found = checkFit([part('R1', ['b3', 'b8']), part('R2', ['b6', 'b11'], 'resistor', 2)], layout);

    expect(found).toHaveLength(1);
  });

  test('is not fooled by a part that has only one end', () => {
    expect(checkFit([part('R1', ['b3']), part('R2', ['b3', 'b7'])], layout)).toEqual([]);
  });
});

describe('実寸の足の間隔', () => {
  test('says an axial part cannot go into two holes side by side', () => {
    // 抵抗やダイオードは胴の両端から足が出るので、胴そのものが 2.54mm より長い。
    const found = checkFit([part('R1', ['b3', 'b4'])], layout);

    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('R1');
    expect(found[0]?.message).toContain('b3');
    expect(found[0]?.message).toContain('b4');
    expect(found[0]?.line).toBe(1);
  });

  test('names the holes rather than claiming they are side by side', () => {
    // 斜めは隣り合ってはいない。**書いていない配置を名指さない。**
    const found = checkFit([part('R1', ['b3', 'c4'])], layout);

    expect(found[0]?.message).not.toContain('隣り合う');
    expect(found[0]?.message).toContain('c4');
  });

  test('says nothing once the holes are two apart', () => {
    expect(checkFit([part('R1', ['b3', 'b5'])], layout)).toEqual([]);
  });

  test('leaves radial parts alone, because their leads are 2.54mm apart to begin with', () => {
    expect(checkFit([part('D1', ['b3', 'b4'], 'led')], layout)).toEqual([]);
    expect(checkFit([part('C1', ['b3', 'b4'], 'capacitor')], layout)).toEqual([]);
  });

  test('does not call a stretched led a collision with its neighbour', () => {
    // 玉は足の間を跨がないので、遠くに足を置いても隣の部品とはぶつからない。
    expect(checkFit([part('D1', ['b1', 'b9'], 'led'), part('R1', ['a3', 'c3'])], layout)).toEqual([]);
  });

  test('measures a diagonal as the straight line between the holes', () => {
    expect(checkFit([part('R1', ['b3', 'c4'])], layout)).toHaveLength(1);
    expect(checkFit([part('R1', ['b3', 'd5'])], layout)).toEqual([]);
  });
});

describe('the findings themselves', () => {
  test('are notices: the fence was read and the drawing is faithful', () => {
    expect(checkFit([part('R1', ['b3', 'b4'])], layout).every((error) => error.notice === true)).toBe(true);
  });

  test('say nothing about an empty board', () => {
    expect(checkFit([], layout)).toEqual([]);
  });
});

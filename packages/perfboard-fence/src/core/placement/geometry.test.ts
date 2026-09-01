import { describe, expect, test } from 'vitest';
import { bodyRect, overlaps, spanOf } from './geometry.ts';
import { createBoard, holeStrip } from '../model/board.ts';
import { createLayout } from '../model/layout.ts';
import { parseAddress } from '../model/address.ts';
import type { PlacedPart } from '../types.ts';

const layout = createLayout(createBoard({ cols: 12, rows: 8 }));
const at = (hole: string) => parseAddress(hole)!;

const part = (holes: readonly string[], type = 'resistor'): PlacedPart => ({
  id: 'X',
  type,
  variant: null,
  value: null,
  line: null,
  pins: holes.map((hole) => ({ address: at(hole), strip: holeStrip(at(hole)) })),
});

describe('spanOf', () => {
  test('counts the holes between the two ends', () => {
    expect(spanOf(part(['b3', 'b7']))).toBe(4);
    expect(spanOf(part(['b3', 'b4']))).toBe(1);
  });

  test('measures a diagonal as the straight line between the holes', () => {
    // **胴が跨ぐのは足から足への直線**。行と列の大きいほうで数えると、
    // 斜めの間隔を実際より短く見積もる。
    expect(spanOf(part(['b3', 'd5']))).toBeCloseTo(Math.SQRT2 * 2);
    expect(spanOf(part(['b3', 'c4']))).toBeCloseTo(Math.SQRT2);
  });

  test('is null when the part has not got two ends', () => {
    expect(spanOf(part(['b3']))).toBeNull();
  });
});

describe('bodyRect', () => {
  test('gives a radial part the body it is drawn with, not the span of its leads', () => {
    // LED は足の間を胴が跨がない (丸い玉から足が 2 本出る)。描画は玉を
    // 決まった大きさで描くので、**当たり判定も同じ大きさで見る**。
    const stretched = bodyRect(part(['b1', 'b9'], 'led'), layout)!;
    const tight = bodyRect(part(['b1', 'b2'], 'led'), layout)!;

    expect(stretched.width).toBe(tight.width);
  });

  test('gives an axial part a body that grows with the span', () => {
    expect(bodyRect(part(['b1', 'b9']), layout)!.width)
      .toBeGreaterThan(bodyRect(part(['b1', 'b3']), layout)!.width);
  });

  test('centres the body between the two holes', () => {
    const rect = bodyRect(part(['b3', 'b7']), layout)!;
    const from = layout.point(at('b3'));
    const to = layout.point(at('b7'));

    expect(rect.cx).toBe((from.x + to.x) / 2);
    expect(rect.cy).toBe((from.y + to.y) / 2);
  });

  test('turns the body to follow the leads', () => {
    expect(bodyRect(part(['b3', 'b7']), layout)!.angle).toBe(0);
    expect(bodyRect(part(['b3', 'd5']), layout)!.angle).toBeCloseTo(Math.PI / 4);
  });

  test('is null for a part with no two ends', () => {
    expect(bodyRect(part(['b3']), layout)).toBeNull();
  });
});

describe('overlaps', () => {
  const rectOf = (holes: readonly string[], type?: string) => bodyRect(part(holes, type), layout)!;

  test('says two parts side by side do not touch', () => {
    expect(overlaps(rectOf(['b3', 'b7']), rectOf(['d3', 'd7']))).toBe(false);
  });

  test('says two parts on the same line but apart do not touch', () => {
    expect(overlaps(rectOf(['b1', 'b4']), rectOf(['b8', 'b11']))).toBe(false);
  });

  test('sees a part laid across another', () => {
    // 足は別の穴でも**胴が交差する**。実物では両方は挿せない。
    expect(overlaps(rectOf(['b3', 'b7']), rectOf(['a5', 'c5']))).toBe(true);
  });

  test('sees two parts laid along the same row, overlapping', () => {
    expect(overlaps(rectOf(['b3', 'b8']), rectOf(['b6', 'b11']))).toBe(true);
  });

  test('is the same either way round', () => {
    const a = rectOf(['b3', 'b7']);
    const b = rectOf(['a5', 'c5']);

    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });
});

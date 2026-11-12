import { describe, expect, test } from 'vitest';
import { placeLabels } from './labelPlace.ts';
import type { Box } from './labelPlace.ts';

const RECT = { x: 0, y: 0, width: 400, height: 300 };
const SIZE = { width: 60, height: 12 };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('placeLabels', () => {
  test('puts a lone label above its point', () => {
    const [placed] = placeLabels([{ x: 200, y: 150, ...SIZE }], RECT, []);
    expect(placed?.clash).toBe(false);
    expect((placed?.box.y ?? 0) + SIZE.height).toBeLessThan(150);
    expect(placed?.box.x).toBe(200 - SIZE.width / 2);
  });

  test('keeps the label inside the frame at a corner', () => {
    const [placed] = placeLabels([{ x: 0, y: 0, ...SIZE }], RECT, []);
    expect(placed?.clash).toBe(false);
    expect(placed?.box.x).toBeGreaterThanOrEqual(0);
    expect(placed?.box.y).toBeGreaterThanOrEqual(0);
    const [right] = placeLabels([{ x: 400, y: 300, ...SIZE }], RECT, []);
    expect((right?.box.x ?? 0) + SIZE.width).toBeLessThanOrEqual(400);
    expect((right?.box.y ?? 0) + SIZE.height).toBeLessThanOrEqual(300);
  });

  test('does not sit on the line through the point', () => {
    // 右上がりの線の途中の点。上 (中央) は線に掛かるので、線に触れない側へ逃げる。
    const line = [{ x: 100, y: 250 }, { x: 200, y: 150 }, { x: 300, y: 50 }];
    const [placed] = placeLabels([{ x: 200, y: 150, ...SIZE }], RECT, [line]);
    expect(placed?.clash).toBe(false);
    const box = placed?.box as Box;
    // 線 y = 350 - x の上に箱が掛からない。
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]] as const;
    const sides = corners.map(([x, y]) => Math.sign(y - (350 - x)));
    expect(new Set(sides).size).toBe(1);
  });

  test('keeps neighbouring labels apart', () => {
    const placed = placeLabels([{ x: 200, y: 150, ...SIZE }, { x: 215, y: 150, ...SIZE }, { x: 230, y: 150, ...SIZE }], RECT, []);
    expect(placed.every((one) => !one.clash)).toBe(true);
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) expect(overlap(placed[a]?.box as Box, placed[b]?.box as Box)).toBe(false);
    }
  });

  test('says clash when no place is free, and still stays in the frame', () => {
    const tiny = { x: 0, y: 0, width: 62, height: 20 };
    const placed = placeLabels([{ x: 30, y: 10, ...SIZE }, { x: 32, y: 10, ...SIZE }], tiny, []);
    expect(placed.some((one) => one.clash)).toBe(true);
    for (const one of placed) {
      expect(one.box.x).toBeGreaterThanOrEqual(0);
      expect(one.box.x + one.box.width).toBeLessThanOrEqual(62);
    }
  });

  test('keeps clear of the boxes it is told to avoid', () => {
    // 点の真上に箱 (spectrum のマーカーの ▽ と番号)。上は塞がっているので別の向きへ。
    const glyph = { x: 190, y: 120, width: 20, height: 30 };
    const [placed] = placeLabels([{ x: 200, y: 150, ...SIZE }], RECT, [], [glyph]);
    expect(placed?.clash).toBe(false);
    expect(overlap(placed?.box as Box, glyph)).toBe(false);
    // 箱を渡さなければ今までどおり上。
    expect(placeLabels([{ x: 200, y: 150, ...SIZE }], RECT, [])[0]?.box.x).toBe(200 - SIZE.width / 2);
  });

  test('gives the same answer every time', () => {
    const wanted = [{ x: 50, y: 50, ...SIZE }, { x: 90, y: 60, ...SIZE }];
    expect(placeLabels(wanted, RECT, [])).toEqual(placeLabels(wanted, RECT, []));
  });
});

import { describe, expect, test } from 'vitest';
import { drawModuleOutline, moduleBox, moduleSide } from './moduleOutline.ts';
import type { ModuleOutline } from './moduleOutline.ts';

/** 2.54 mm = 20 px の格子 (1 mm = 20/2.54 px)。 */
const PITCH = 20;
const MM = PITCH / 2.54;
const KIT: ModuleOutline = { along: 25.36, across: 15, inset: 1.27, jack: { along: 16, from: 2.5, to: 15 }, mark: 'RJ45' };
const row = (y: number, n = 8) => Array.from({ length: n }, (_, k) => ({ x: 100 + k * PITCH, y }));
const column = (x: number, n = 8) => Array.from({ length: n }, (_, k) => ({ x, y: 100 + k * PITCH }));

describe('モジュールの外形 (1 列のヘッダに載った基板とジャック)', () => {
  test('lies on the given side of a row of pins, centred along it, as large as the board and the jack in mm', () => {
    const points = row(200);
    const above = moduleBox(points, PITCH, -1, KIT);
    const below = moduleBox(points, PITCH, 1, KIT);

    expect(above.width).toBeCloseTo(25.36 * MM);
    // 胴の奥 (15 mm) が基板の奥の縁 (13.73 mm) を越えるので、手前の縁から 1.27 + 15 mm。
    expect(above.height).toBeCloseTo((1.27 + 15) * MM);
    // ヘッダの列は基板の縁から 1.27 mm 内側 (反対側へ 13.73 mm 広がる)。
    expect(above.y + above.height).toBeCloseTo(200 + 1.27 * MM);
    expect(below.y).toBeCloseTo(200 - 1.27 * MM);
    expect(above.x + above.width / 2).toBeCloseTo(100 + 3.5 * PITCH);
  });

  test('turns with an upright column: +1 is the right, -1 the left', () => {
    const points = column(300);
    const left = moduleBox(points, PITCH, -1, KIT);
    const right = moduleBox(points, PITCH, 1, KIT);

    expect(left.width).toBeCloseTo((1.27 + 15) * MM);
    expect(left.height).toBeCloseTo(25.36 * MM);
    expect(left.x + left.width).toBeCloseTo(300 + 1.27 * MM);
    expect(right.x).toBeCloseTo(300 - 1.27 * MM);
  });

  test('draws the board, the jack and its mark', () => {
    const svg = drawModuleOutline({ points: row(200), pitch: PITCH, side: -1, outline: KIT });

    expect(svg).toContain('class="module-board"');
    expect(svg).toContain('class="module-jack"');
    expect(svg).toContain('>RJ45<');
  });

  test('chooses the side nearer to the edge of the board, so the jack faces out', () => {
    const board = { x: 0, y: 0, width: 600, height: 400 };
    expect(moduleSide(column(10), board)).toBe(-1);
    expect(moduleSide(column(590), board)).toBe(1);
    expect(moduleSide(row(10), board)).toBe(-1);
    expect(moduleSide(row(390), board)).toBe(1);
    // 真ん中ならピンの名前の反対 (上か左)。
    expect(moduleSide(column(300), board)).toBe(-1);
  });
});

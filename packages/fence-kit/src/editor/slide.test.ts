import { describe, expect, it } from 'vitest';
import { slideBy, slideInto } from './slide.ts';

const ROWS = { least: 0, most: 9 };
const COLS = { least: 1, most: 30 };

describe('板の中へ寄せる量', () => {
  it('すでに載っていれば動かさない', () => {
    const slide = slideInto([{ row: 3, col: 5 }, { row: 6, col: 5 }], ROWS, COLS);

    expect(slide).toEqual({ row: 0, col: 0 });
  });

  it('上へはみ出した分だけ下へ寄せる', () => {
    const slide = slideInto([{ row: -2, col: 7 }, { row: 3, col: 7 }], ROWS, COLS);

    expect(slide).toEqual({ row: 2, col: 0 });
  });

  it('下へはみ出した分だけ上へ寄せる', () => {
    const slide = slideInto([{ row: 7, col: 7 }, { row: 12, col: 7 }], ROWS, COLS);

    expect(slide).toEqual({ row: -3, col: 0 });
  });

  it('左右も同じように寄せる', () => {
    const slide = slideInto([{ row: 4, col: -1 }, { row: 4, col: 2 }], ROWS, COLS);

    expect(slide).toEqual({ row: 0, col: 2 });
  });

  it('行と列の両方へ寄せる', () => {
    const slide = slideInto([{ row: -1, col: 31 }, { row: 2, col: 33 }], ROWS, COLS);

    expect(slide).toEqual({ row: 1, col: -3 });
  });

  it('回しても板に入らない形は null', () => {
    const slide = slideInto([{ row: 0, col: 5 }, { row: 11, col: 5 }], ROWS, COLS);

    expect(slide).toBeNull();
  });

  it('足が無ければ寄せる量も無い', () => {
    expect(slideInto([], ROWS, COLS)).toEqual({ row: 0, col: 0 });
  });
});

describe('寄せたあとの落ち先', () => {
  it('寄せる量ぶん平行移動する', () => {
    const moved = slideBy([{ row: -2, col: 7 }, { row: 3, col: 7 }], { row: 2, col: 0 });

    expect(moved).toEqual([{ row: 0, col: 7 }, { row: 5, col: 7 }]);
  });

  it('ほかの欄はそのまま持っていく', () => {
    const moved = slideBy([{ row: 1, col: 1, kind: 'hole' }], { row: 1, col: 1 });

    expect(moved).toEqual([{ row: 2, col: 2, kind: 'hole' }]);
  });

  it('入らなかった (null) ときは元のまま', () => {
    const landings = [{ row: 0, col: 5 }];

    expect(slideBy(landings, null)).toBe(landings);
  });

  it('動かす量が 0 なら同じものを返す', () => {
    const landings = [{ row: 0, col: 5 }];

    expect(slideBy(landings, { row: 0, col: 0 })).toBe(landings);
  });
});

import { describe, expect, test } from 'vitest';
import { KINDS, isKind, toKind } from './kinds.ts';

/**
 * 種類の綴り。**共有リンクの寿命がここに掛かっている** — リンクは種類を
 * 平文で載せているので、綴りを変えると配ってあるリンクが読めなくなる
 * (52 の docs/37)。別名の口はそのための保険。
 */
describe('種類の綴り', () => {
  test('いまの綴りはそのまま通る', () => {
    for (const kind of KINDS) expect(toKind(kind)).toBe(kind);
  });

  test('短い綴りも同じ種類として受ける', () => {
    // 52 の docs/08 で「短い綴りを正にして長い綴りを別名で残す」と決めてある。
    // **どちらの向きでも読める**ようにしておけば、正を入れ替える日に
    // 配ってあるリンクが切れない。
    expect(toKind('bread')).toBe('breadboard');
    expect(toKind('perf')).toBe('perfboard');
  });

  test('知らない綴りは null (黙って別の図にしない)', () => {
    expect(toKind('vector')).toBeNull();
    expect(toKind('board')).toBeNull();
    expect(toKind('')).toBeNull();
  });

  test('字でないものも null', () => {
    expect(toKind(undefined)).toBeNull();
    expect(toKind(7)).toBeNull();
    expect(toKind({ kind: 'circuit' })).toBeNull();
  });

  test('isKind は正の綴りだけ (画面と JSON はこちらで見る)', () => {
    // 別名を受けるのはリンクの読み口だけ。こちらまで緩めると、
    // 例の JSON や画面の状態に 2 通りの綴りが混ざる。
    expect(isKind('breadboard')).toBe(true);
    expect(isKind('bread')).toBe(false);
  });
});

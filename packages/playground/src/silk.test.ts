import { describe, expect, test } from 'vitest';
import { SILKS, silkOf, withSilk } from './silk.ts';
import { render } from './fences.ts';

describe('silk: を読む', () => {
  test('書いていなければ board (既定)', () => {
    expect(silkOf('board: 5x7cm\nparts:\n')).toBe('board');
    expect(silkOf('board:\n  size: 5x7cm\n')).toBe('board');
  });

  test('block 形の silk: を読む', () => {
    expect(silkOf('board:\n  size: 7x5cm\n  silk: alpha-rows\nparts:\n')).toBe('alpha-rows');
  });

  test('フロー形の silk: を読む', () => {
    expect(silkOf('board: {size: 5x7cm, silk: fence}\n')).toBe('fence');
  });

  test('知らない綴りは board とみなす (断るのは図を描くコアの役)', () => {
    expect(silkOf('board:\n  size: 5x7cm\n  silk: nonsense\n')).toBe('board');
  });
});

describe('silk: を書き換える', () => {
  test('1 行形の board: は block 形に直して silk: を足す', () => {
    expect(withSilk('board: 5x7cm\nparts:\n  R1: resistor c3 c7 10k\n', 'alpha-rows'))
      .toBe('board:\n  size: 5x7cm\n  silk: alpha-rows\nparts:\n  R1: resistor c3 c7 10k\n');
  });

  test('block 形で silk: が無ければ、block の最後に足す', () => {
    expect(withSilk('board:\n  size: 5x7cm\n  slots: on\nparts:\n', 'fence'))
      .toBe('board:\n  size: 5x7cm\n  slots: on\n  silk: fence\nparts:\n');
  });

  test('block 形で silk: があれば、その行だけ替える (字下げを保つ)', () => {
    expect(withSilk('board:\n    size: 5x7cm\n    silk: fence\nparts:\n', 'alpha-cols'))
      .toBe('board:\n    size: 5x7cm\n    silk: alpha-cols\nparts:\n');
  });

  test('board (既定) を選ぶと silk: の行を消す', () => {
    expect(withSilk('board:\n  size: 5x7cm\n  silk: fence\nparts:\n', 'board'))
      .toBe('board:\n  size: 5x7cm\nparts:\n');
  });

  test('既定を選んで元から silk: が無ければ何も変えない', () => {
    const source = 'board: 5x7cm\nparts:\n';
    expect(withSilk(source, 'board')).toBe(source);
  });

  test('フロー形は中の silk: を替える・足す・消す', () => {
    expect(withSilk('board: {size: 5x7cm, silk: fence}\n', 'alpha-rows')).toBe('board: {size: 5x7cm, silk: alpha-rows}\n');
    expect(withSilk('board: {size: 5x7cm}\n', 'fence')).toBe('board: {size: 5x7cm, silk: fence}\n');
    expect(withSilk('board: {size: 5x7cm, silk: fence}\n', 'board')).toBe('board: {size: 5x7cm}\n');
  });

  test('board: が無ければ null (どこにも書けない)', () => {
    expect(withSilk('parts:\n  R1: resistor c3 c7 10k\n', 'fence')).toBeNull();
  });

  test('同じ字をもう一度書き換えても変わらない', () => {
    const once = withSilk('board: 5x7cm\n', 'alpha-rows') ?? '';
    expect(withSilk(once, 'alpha-rows')).toBe(once);
  });

  test('字下げした board: (部品の中など) は拾わない', () => {
    expect(withSilk('parts:\n  U1:\n    board: x\n', 'fence')).toBeNull();
  });
});

describe('perf のコアが読める形になっている', () => {
  test.each(SILKS)('%s に書き換えた図が読める', (silk) => {
    const source = withSilk('board: 5x7cm\nparts:\n  R1: resistor c3 c7 10k\n', silk) ?? '';

    const output = render('perfboard', source);

    expect(output.broken).toBe(false);
    expect(silkOf(source)).toBe(silk);
  });

  test('シルクを替えると同じ番地が別の穴になり、図が変わる', () => {
    const base = 'board: 5x7cm\nparts:\n  R1: resistor c3 c7 10k\n';
    const a = render('perfboard', withSilk(base, 'fence') ?? '').svg;
    const b = render('perfboard', withSilk(base, 'alpha-rows') ?? '').svg;

    expect(a).not.toBe(b);
  });
});

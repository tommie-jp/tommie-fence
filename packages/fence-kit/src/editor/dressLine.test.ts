import { describe, expect, test } from 'vitest';
import { commentAt, dressLine } from './dressLine.ts';

describe('commentAt', () => {
  test('行末のコメントの位置を返す', () => {
    expect(commentAt('  R1: resistor a1 a3 # 分圧')).toBe(21);
  });

  test('コメントが無ければ -1', () => {
    expect(commentAt('  R1: resistor a1 a3')).toBe(-1);
  });

  // **引用の中の `#` はコメントではない。** 落とすと図に出る字が変わる。
  test('引用の中の # は数えない', () => {
    expect(commentAt('  - text b1: "R1: #1"')).toBe(-1);
  });

  test('引用が閉じたあとの # は数える', () => {
    expect(commentAt('  - text b1: "R1" # めも')).toBe(18);
  });

  // `#` は行頭か空白の直後だけがコメント (YAML の規則)。
  test('語の途中の # は数えない', () => {
    expect(commentAt('  R1: resistor a1 a3 10k#1')).toBe(-1);
  });
});

describe('dressLine', () => {
  test('書かれていた字下げを付ける', () => {
    expect(dressLine('    R1:  resistor a1 a3', 'R1: resistor a1 a5')).toBe('    R1: resistor a1 a5');
  });

  test('行末のコメントを残す', () => {
    expect(dressLine('  R1: resistor a1 a3  # めも', 'R1: resistor a1 a5')).toBe('  R1: resistor a1 a5 # めも');
  });

  test('コメントが無ければ足さない', () => {
    expect(dressLine('  R1: resistor a1 a3', 'R1: resistor a1 a5')).toBe('  R1: resistor a1 a5');
  });
});

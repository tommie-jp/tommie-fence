import { describe, expect, test } from 'vitest';
import { commentAt, dressLine, keepSpacing } from './dressLine.ts';

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

describe('keepSpacing', () => {
  // **桁を揃えて書く人がいる。** 値を 1 つ直しただけで揃えが崩れると、
  // 書き換えていない行との並びが狂う。
  test('語の数が同じなら、書かれた空白をそのまま使う', () => {
    expect(keepSpacing('R1:  resistor a1 a3 10k', 'R1: resistor a1 a3 22k'))
      .toBe('R1:  resistor a1 a3 22k');
  });

  test('語の数が変わったら、組み直した行をそのまま返す', () => {
    expect(keepSpacing('R1:  resistor a1 a3', 'R1: resistor a1 a3 10k'))
      .toBe('R1: resistor a1 a3 10k');
  });

  test('揃えていない行はそのまま', () => {
    expect(keepSpacing('R1: resistor a1 a3 10k', 'R1: resistor a1 a3 22k'))
      .toBe('R1: resistor a1 a3 22k');
  });
});

describe('dressLine', () => {
  test('書かれていた字下げと語の間の空白を付ける', () => {
    expect(dressLine('    R1:  resistor a1 a3', 'R1: resistor a1 a5')).toBe('    R1:  resistor a1 a5');
  });

  // コメントの前の空白も残す (コメントを縦に揃えて書く人がいる)。
  test('行末のコメントを、前の空白ごと残す', () => {
    expect(dressLine('  R1: resistor a1 a3  # めも', 'R1: resistor a1 a5')).toBe('  R1: resistor a1 a5  # めも');
  });

  test('コメントが無ければ足さない', () => {
    expect(dressLine('  R1: resistor a1 a3', 'R1: resistor a1 a5')).toBe('  R1: resistor a1 a5');
  });
});

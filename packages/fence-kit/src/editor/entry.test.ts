import { describe, expect, test } from 'vitest';
import { entryOf } from './entry.ts';

/** その項目の字。範囲が正しいかを字で見る (桁の数字より読みやすい)。 */
const written = (source: string, line: number, id: string, from = 0): string | null => {
  const lines = source.split('\n');
  const entry = entryOf(lines, line, id, from);
  return entry === null ? null : `${entry.flow ? 'flow' : 'block'}:${(lines[line - 1] ?? '').slice(entry.start, entry.end)}`;
};

describe('entryOf', () => {
  test('ブロック形式は、鍵から行の終わりまで (フロー形式ではない)', () => {
    expect(written('parts:\n  R1: resistor a1 a3 10k\n', 2, 'R1')).toBe('block:R1: resistor a1 a3 10k');
  });

  test('ブロック形式の行末コメントは入れない', () => {
    expect(written('parts:\n  R1: resistor a1 a3   # 電流制限\n', 2, 'R1')).toBe('block:R1: resistor a1 a3');
  });

  // **ブロック形式の値に `,` があっても、そこで切らない。** プレーンスカラーの字として読まれる。
  test('ブロック形式の値の , では切らない', () => {
    expect(written('parts:\n  R1: resistor a1 a3 1,000\n', 2, 'R1')).toBe('block:R1: resistor a1 a3 1,000');
  });

  test('1 行に並べた形は、, か } の手前まで', () => {
    const source = 'parts: {R1: resistor a1 a3 220, R2: led b1 b2}\n';
    expect(written(source, 1, 'R1')).toBe('flow:R1: resistor a1 a3 220');
    expect(written(source, 1, 'R2')).toBe('flow:R2: led b1 b2');
  });

  test('区切りの前の空白は入れない', () => {
    expect(written('parts: { R1: resistor a1 a3 , R2: led b1 b2 }\n', 1, 'R2')).toBe('flow:R2: led b1 b2');
  });

  test('鍵を次の行に書いた形 ({ のあと)', () => {
    expect(written('parts:\n  {R1: resistor a1 a3, R2: led b1 b2}\n', 2, 'R2')).toBe('flow:R2: led b1 b2');
  });

  // **行の頭にある鍵でも、前の行が , か { で終わればフロー形式の続き。**
  test('折り返した続きの行', () => {
    const source = 'parts: {R1: resistor a1 a3,\n  R2: led b1 b2}\n';
    expect(written(source, 2, 'R2')).toBe('flow:R2: led b1 b2');
  });

  test('{ だけの行のあとに 1 つずつ書いた形', () => {
    const source = 'parts: {\n  R1: resistor a1 a3,\n  # 表示\n\n  R2: led b1 b2\n}\n';
    expect(written(source, 2, 'R1')).toBe('flow:R1: resistor a1 a3');
    expect(written(source, 5, 'R2')).toBe('flow:R2: led b1 b2');
  });

  test('引用符の中の , と } では切らない', () => {
    expect(written('parts: {R1: resistor a1 a3 "1,0}", R2: led b1 b2}\n', 1, 'R1'))
      .toBe('flow:R1: resistor a1 a3 "1,0}"');
  });

  // **語の途中の ' は引用符ではない** (`R'` のラベル)。引用符と取ると , を飲み込む。
  test("語の途中の ' は引用符として扱わない", () => {
    expect(written("parts: {R1: resistor a1 a3 l=R', R2: led b1 b2}\n", 1, 'R1')).toBe("flow:R1: resistor a1 a3 l=R'");
  });

  test('入れ子の括弧の中の , では切らない', () => {
    expect(written('parts: {U1: dip8 [c3, e6], R2: led b1 b2}\n', 1, 'U1')).toBe('flow:U1: dip8 [c3, e6]');
  });

  test('フロー形式の後ろのコメントは入れない', () => {
    expect(written('parts: {R1: resistor a1 a3}  # 2 つめ, です\n', 1, 'R1')).toBe('flow:R1: resistor a1 a3');
  });

  // **名前の続きの字では鍵と見ない** (`XR1:` の中の `R1:`)。
  test('名前の一部に同じ字があっても、鍵だけを拾う', () => {
    expect(written('parts: {XR1: resistor a1 a3, R1: led b1 b2}\n', 1, 'R1')).toBe('flow:R1: led b1 b2');
  });

  test('値の中の R1:x は鍵ではない', () => {
    expect(written('parts: {R2: led b1 R1:x, R1: resistor a1 a3}\n', 1, 'R1')).toBe('flow:R1: resistor a1 a3');
  });

  test('from より前の鍵は見ない (同じ名前が 1 行に 2 つあるとき)', () => {
    const source = 'parts: {vcc: vcc a1, vcc: vcc b1}\n';
    expect(written(source, 1, 'vcc', 20)).toBe('flow:vcc: vcc b1');
  });

  test('鍵が無ければ null', () => {
    expect(written('parts:\n  R1: resistor a1 a3\n', 2, 'R2')).toBeNull();
    expect(written('parts:\n', 9, 'R1')).toBeNull();
  });
});

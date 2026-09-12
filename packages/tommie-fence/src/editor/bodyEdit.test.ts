import { describe, expect, test } from 'vitest';
import { bodyEdit } from './bodyEdit.ts';

/**
 * `replaceBody` の中身。**vscode を知らない形にして試験に掛ける**
 * (`vscodePort.ts` は vscode の型へ移すだけ)。
 */

/** 行の並びから、`bodyEdit` が要る文書の姿を作る。 */
const docOf = (lines: readonly string[]) => ({
  lineCount: lines.length,
  lengthOf: (line: number) => (lines[line] ?? '').length,
});

/** 普通の文書。本文は 3 行目から 2 行。 */
const DOC = docOf(['# 例', '', '```perfboard', 'board: 12x7', 'parts:', '```', '']);

describe('bodyEdit', () => {
  test('本文のある フェンスは、その範囲を入れ替える', () => {
    const edit = bodyEdit(DOC, 3, 2, ['board: 25x15'], '\n');

    expect(edit).toEqual({
      kind: 'replace',
      from: { line: 3, column: 0 },
      to: { line: 4, column: 'parts:'.length },
      text: 'board: 25x15',
    });
  });

  test('文書の改行で綴じる', () => {
    const edit = bodyEdit(DOC, 3, 2, ['a', 'b'], '\r\n');

    expect(edit?.text).toBe('a\r\nb');
  });

  // **本文が 0 行のフェンス。** 入れ替える範囲が無いので、閉じ記号の行頭へ足す。
  test('本文が 0 行なら、閉じ記号の行頭へ差し込む', () => {
    const empty = docOf(['```perfboard', '```', '']);
    const edit = bodyEdit(empty, 1, 0, ['board: 25x15'], '\n');

    expect(edit).toEqual({ kind: 'insert', at: { line: 1, column: 0 }, text: 'board: 25x15\n' });
  });

  /**
   * **閉じ記号の無いフェンスが最終行のとき。** 開き記号の次の行が無いので、
   * 行頭を指すと文書の外になる (vscode は行末へ丸めるので、開き記号の行の
   * 末尾に繋がって ` ```perfboardboard: 25x15 ` になっていた)。
   */
  test('閉じていないフェンスが最終行なら、その行の末尾へ足す', () => {
    const unclosed = docOf(['# 例', '```perfboard']);
    const edit = bodyEdit(unclosed, 2, 0, ['board: 25x15'], '\n');

    expect(edit).toEqual({
      kind: 'insert',
      at: { line: 1, column: '```perfboard'.length },
      text: '\nboard: 25x15',
    });
  });

  test('範囲の外は断る', () => {
    expect(bodyEdit(DOC, 3, -1, ['x'], '\n')).toBeNull();
    expect(bodyEdit(DOC, -1, 1, ['x'], '\n')).toBeNull();
    expect(bodyEdit(DOC, 3, 99, ['x'], '\n')).toBeNull();
    expect(bodyEdit(DOC, 99, 0, ['x'], '\n')).toBeNull();
  });

  // 改行だけを書き込むと、フェンスに空行が 1 つ増えるだけで何も足せていない。
  test('書く行が無ければ断る', () => {
    expect(bodyEdit(DOC, 3, 0, [], '\n')).toBeNull();
  });

  test('空の文書は断る', () => {
    expect(bodyEdit(docOf([]), 0, 0, ['x'], '\n')).toBeNull();
  });
});

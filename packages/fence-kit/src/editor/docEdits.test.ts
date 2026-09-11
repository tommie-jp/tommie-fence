import { describe, expect, test } from 'vitest';
import { bodyAfter, bodyFrom, changesForFence, changesOf, fenceBody } from './docEdits.ts';
import { indentOn } from './documentLike.ts';

const docOf = (lines: readonly string[]) => ({
  uri: 'file:///a.md',
  getText: () => lines.join('\n'),
  lineCount: lines.length,
  // vscode に合わせて範囲の外は投げる (偽物が空文字を返すと外れた呼びが隠れる)。
  lineAt: (line: number) => {
    const text = lines[line];
    if (text === undefined) throw new Error(`Illegal value for \`line\` (${line})`);
    return { text };
  },
});

describe('changesForFence', () => {
  test('shifts fence lines onto document lines by where the fence opens', () => {
    const document = docOf(['# t', '```circuit', 'parts:', '  R1: resistor a1 a3 10k', '```']);

    const [change] = changesForFence(document, 2, [{ line: 2, column: 15, length: 2, text: 'b1' }]);

    expect(change).toEqual({ line: 3, from: { column: 15, text: 'a1' }, to: { column: 15, text: 'b1' } });
  });

  test('adds the indent of an indented fence back onto the column', () => {
    // フェンスの取り出しは開き記号の字下げを本文から剥がす。足し戻さないと左へ寄る。
    const document = docOf(['- item', '', '  ```circuit', '  parts:', '    R1: resistor a1 a3 10k', '  ```']);

    const [change] = changesForFence(document, 3, [{ line: 2, column: 15, length: 2, text: 'b1' }]);

    expect(change?.from).toEqual({ column: 17, text: 'a1' });
  });

  test('remembers where text lands after an earlier change on the same line grows', () => {
    const document = docOf(['```circuit', 'parts:', '  R1: resistor a9 b9 10k', '```']);

    const changes = changesForFence(document, 1, [
      { line: 2, column: 15, length: 2, text: 'a10' },
      { line: 2, column: 18, length: 2, text: 'b10' },
    ]);

    expect(changes[1]).toEqual({ line: 2, from: { column: 18, text: 'b9' }, to: { column: 19, text: 'b10' } });
  });
});

describe('indentOn', () => {
  test('counts what the fence opening stripped from that line', () => {
    const document = docOf(['  ```circuit', '    R1: resistor a1 a3 10k', ' x: 1']);

    expect(indentOn(document, 1, 1)).toBe(2);
    // 開き記号より浅い行からは、剥がされた量も少ない。一律に足すと別の場所を書き換える。
    expect(indentOn(document, 1, 2)).toBe(1);
  });

  test('is zero for a fence at the margin', () => {
    expect(indentOn(docOf(['```circuit', 'parts:']), 1, 1)).toBe(0);
  });
});

describe('changesOf', () => {
  test('keeps both sides at the same column when nothing changes length', () => {
    const changes = changesOf([{ line: 4, column: 13, before: 'a1', after: 'b1' }]);

    expect(changes[0]).toEqual({ line: 4, from: { column: 13, text: 'a1' }, to: { column: 13, text: 'b1' } });
  });

  test('shifts what follows on the line when a spelling gets longer', () => {
    // `R1: resistor a9 b9` を a10 へ。当てたあと `b10` は 1 桁右にいる。
    const changes = changesOf([
      { line: 0, column: 13, before: 'a9', after: 'a10' },
      { line: 0, column: 16, before: 'b9', after: 'b10' },
    ]);

    expect(changes[1]?.from.column).toBe(16);
    expect(changes[1]?.to.column).toBe(17);
  });

  test('shifts back when a spelling gets shorter', () => {
    const changes = changesOf([
      { line: 0, column: 13, before: 'a10', after: 'a9' },
      { line: 0, column: 17, before: 'b10', after: 'b9' },
    ]);

    expect(changes[1]?.to.column).toBe(16);
  });

  test('does not let one line shift another', () => {
    const changes = changesOf([
      { line: 0, column: 13, before: 'a9', after: 'a10' },
      { line: 1, column: 13, before: 'b9', after: 'b10' },
    ]);

    expect(changes[1]?.to.column).toBe(13);
  });
});

describe('fenceBody', () => {
  test('reads the lines of the fence as they are written', () => {
    const document = docOf(['# t', '```circuit', 'parts:', '  R1: resistor a1 a3 10k', '```']);

    expect(fenceBody(document, 2, 'parts:\n  R1: resistor a1 a3 10k')).toEqual([
      'parts:', '  R1: resistor a1 a3 10k',
    ]);
  });

  test('keeps the indent, since the copy is written back as it is', () => {
    // 取り出した本文は字下げを剥がされている。控えは生の行で持つ。
    const document = docOf(['- item', '  ```circuit', '  parts:', '    R1: resistor a1 a3 10k', '  ```']);

    expect(fenceBody(document, 2, 'parts:\n  R1: resistor a1 a3 10k')).toEqual([
      '  parts:', '    R1: resistor a1 a3 10k',
    ]);
  });

  test('stops at the end of the document, for a fence left unclosed', () => {
    const document = docOf(['```circuit', 'parts:']);

    expect(fenceBody(document, 1, 'parts:\n')).toEqual(['parts:']);
  });

  test('stops before the closing marker, which is not part of the body', () => {
    // 取り出した本文は行ごとに改行が付いているので、数え方を間違えると
    // 閉じ記号まで控えに入る。入ると、元に戻すときにその行を書き換え、
    // 閉じ記号を直した人には「手で書き換えられています」と言って戻せなくなる。
    const document = docOf(['```circuit', 'parts:', '  R1: resistor a1 a3', '```', 'あと']);

    expect(fenceBody(document, 1, 'parts:\n  R1: resistor a1 a3\n')).toEqual([
      'parts:', '  R1: resistor a1 a3',
    ]);
  });
});

describe('bodyAfter', () => {
  const document = docOf(['- item', '  ```circuit', '  parts:', '    R1: resistor a1 a3', '  ```']);
  const source = 'parts:\n  R1: resistor a1 a3';
  const empty = { lost: [], gained: [] };

  test('replaces inside a line, giving back the indent the fence stripped', () => {
    const rewrite = { edits: [{ line: 2, column: 18, length: 2, text: 'b1' }], lines: [], diff: empty };

    expect(bodyAfter(document, 2, source, rewrite)).toEqual(['  parts:', '    R1: resistor a1 b1']);
  });

  test('takes a line out', () => {
    const rewrite = { edits: [], lines: [{ kind: 'delete' as const, line: 2 }], diff: empty };

    expect(bodyAfter(document, 2, source, rewrite)).toEqual(['  parts:']);
  });

  test('keeps one empty line when every line is taken out', () => {
    // 0 行の本文には書き戻す範囲が無い (戻すことも置くこともできなくなる)。
    const rewrite = { edits: [], lines: [{ kind: 'delete' as const, line: 1 }, { kind: 'delete' as const, line: 2 }], diff: empty };

    expect(bodyAfter(document, 2, source, rewrite)).toEqual(['']);
  });

  test('puts a new line in with the indent of the fence opening', () => {
    const rewrite = {
      edits: [],
      lines: [{ kind: 'insert' as const, line: 3, text: '  C1: capacitor b1 b3' }],
      diff: empty,
    };

    expect(bodyAfter(document, 2, source, rewrite)).toEqual([
      '  parts:', '    R1: resistor a1 a3', '    C1: capacitor b1 b3',
    ]);
  });

  test('applies the replacements before the lines move, since both count the old body', () => {
    const rewrite = {
      edits: [{ line: 2, column: 18, length: 2, text: 'b1' }],
      lines: [{ kind: 'insert' as const, line: 2, text: '  C1: capacitor b1 b3' }],
      diff: empty,
    };

    expect(bodyAfter(document, 2, source, rewrite)).toEqual([
      '  parts:', '    C1: capacitor b1 b3', '    R1: resistor a1 b1',
    ]);
  });
});

/**
 * **まとめて当てた本文を、文書の行に戻す** (`runAll`)。途中の本文しか無いので、
 * 元の本文と突き合わせて、変わっていない行は文書の行をそのまま使う。
 *
 * 前は剥がした本文をそのまま書き戻していて、2 つ踏んでいた (52 の docs/47):
 * 本文の末尾の改行のぶん**閉じ記号の前に空行が 1 つ増える**のと、
 * 箇条書きの中のフェンスで**字下げが消える**の。
 */
describe('bodyFrom', () => {
  const document = docOf(['- item', '  ```circuit', '  parts:', '    R1: resistor a1 a3  ', '    C1: capacitor a3 c3', '  ```']);
  const source = 'parts:\n  R1: resistor a1 a3  \n  C1: capacitor a3 c3\n';

  test('gives nothing past the last line, so no blank line lands before the closing fence', () => {
    expect(bodyFrom(document, 2, source, 'parts:\n  C1: capacitor a3 c3\n')).toEqual(['  parts:', '    C1: capacitor a3 c3']);
  });

  test('keeps a line that did not change exactly as the document has it', () => {
    // 行末の空白も、剥がした字下げも、そのまま。
    expect(bodyFrom(document, 2, source, 'parts:\n  R1: resistor a1 a3  \n')).toEqual(['  parts:', '    R1: resistor a1 a3  ']);
  });

  test('gives a new or changed line the indent of the fence opening', () => {
    expect(bodyFrom(document, 2, source, 'parts:\n  R1: resistor b1 b3\n  C1: capacitor a3 c3\n  R2: resistor d1 d3\n'))
      .toEqual(['  parts:', '    R1: resistor b1 b3', '    C1: capacitor a3 c3', '    R2: resistor d1 d3']);
  });

  test('keeps one empty line when everything is gone, so the fence still has a body to write into', () => {
    expect(bodyFrom(document, 2, source, '')).toEqual(['']);
  });

  test('matches lines in order, even when the same text is written twice', () => {
    const twice = docOf(['```circuit', '# x', 'a', '# x', 'b', '```']);

    expect(bodyFrom(twice, 1, '# x\na\n# x\nb\n', '# x\nb\n')).toEqual(['# x', 'b']);
  });
});

import { describe, expect, test } from 'vitest';
import { changesForFence, changesOf, fenceBody } from './docEdits.ts';
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
});

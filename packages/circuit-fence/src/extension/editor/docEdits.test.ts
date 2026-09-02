import { describe, expect, test } from 'vitest';
import { changesForFence } from './docEdits.ts';
import { indentOn } from './documentLike.ts';

const docOf = (lines: readonly string[]) => ({
  uri: 'file:///a.md',
  getText: () => lines.join('\n'),
  lineAt: (line: number) => ({ text: lines[line] ?? '' }),
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

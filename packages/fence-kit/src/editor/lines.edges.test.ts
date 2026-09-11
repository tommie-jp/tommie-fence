import { describe, expect, test } from 'vitest';
import {
  afterLastLine, appendUnderKey, applyRewrite, dropLines, indentOf, insertLines, isFlowKey, wireEndToken,
} from './lines.ts';

/**
 * 行の出し入れの**縁**。3 つのフェンスが同じものを使うので、ここが崩れると
 * どのフェンスでも同じ壊れ方をする — 図がまるごと消える種類の壊れ方なので、
 * 縁を 1 つずつ押さえる。
 */

describe('消す行', () => {
  test('sorts and de-duplicates, so the edits can be applied from the bottom up', () => {
    expect(dropLines([5, 2, 5])).toEqual([{ kind: 'delete', line: 2 }, { kind: 'delete', line: 5 }]);
  });

  test('drops line zero, which is the mark for no key at all', () => {
    expect(dropLines([0, 3])).toEqual([{ kind: 'delete', line: 3 }]);
  });
});

describe('足す行', () => {
  test('turns entries into inserts, in the order they were given', () => {
    expect(insertLines([{ line: 2, text: 'a' }, { line: 4, text: 'b' }]))
      .toEqual([{ kind: 'insert', line: 2, text: 'a' }, { kind: 'insert', line: 4, text: 'b' }]);
  });
});

describe('フロー形式', () => {
  test('spots a key that carries its contents on the same line', () => {
    expect(isFlowKey(['parts: {R1: resistor a1 a3}'], 'parts')).toBe(true);
  });

  test('says no for a key that opens a block', () => {
    expect(isFlowKey(['parts:', '  R1: resistor a1 a3'], 'parts')).toBe(false);
  });

  test('says no when the key is not there at all', () => {
    expect(isFlowKey(['wires:'], 'parts')).toBe(false);
  });
});

describe('字下げ', () => {
  test('copies the indent of the line it was pointed at', () => {
    expect(indentOf(['a', '    b'], 2)).toBe('    ');
  });

  test('keeps a zero indent as zero, because YAML allows it', () => {
    // 0 桁に 2 つ空けて足すと、足した行が前の値へ畳み込まれて図が消える。
    expect(indentOf(['parts:', 'R1: resistor a1 a3'], 2)).toBe('');
  });

  test('falls back to two spaces only when there is no line to copy from', () => {
    expect(indentOf(['a'], 9)).toBe('  ');
  });
});

describe('末尾', () => {
  test('points past the last line that has something on it', () => {
    expect(afterLastLine(['a', 'b', '', ''])).toBe(3);
  });

  test('points at the first line when everything is blank', () => {
    expect(afterLastLine(['', ''])).toBe(1);
  });
});

describe('鍵の下に 1 行足す', () => {
  test('adds the key as well when it is not there yet', () => {
    expect(appendUnderKey(['title: t', ''], 'wires', 0, '- a1 -- a3')).toEqual([
      { kind: 'insert', line: 2, text: 'wires:' },
      { kind: 'insert', line: 2, text: '  - a1 -- a3' },
    ]);
  });

  test('puts the first row right under the key', () => {
    expect(appendUnderKey(['wires:'], 'wires', 0, '- a1 -- a3'))
      .toEqual([{ kind: 'insert', line: 2, text: '  - a1 -- a3' }]);
  });

  test('copies the indent of the row above, so a hand-tidied block stays tidy', () => {
    const lines = ['wires:', '    - a1 -- a3'];

    expect(appendUnderKey(lines, 'wires', 2, '- b1 -- b3'))
      .toEqual([{ kind: 'insert', line: 3, text: '    - b1 -- b3' }]);
  });

  // **最後の行が入れ子の頭なら、中身の後ろに足す。** 頭の次に足すと中身が
  // 新しい行の続きに読まれ、フェンスがまるごと読めなくなる (52 の docs/51)。
  test('goes after a nested block, not between its head and its body', () => {
    const lines = ['parts:', '  BAT:', '    type: device', '    pins: [+, -]', 'wires:', '  - a1 -- a2'];

    expect(appendUnderKey(lines, 'parts', 2, 'R1: resistor e5 e10'))
      .toEqual([{ kind: 'insert', line: 5, text: '  R1: resistor e5 e10' }]);
  });

  test('steps over a blank line inside the block, but not the one after it', () => {
    const lines = ['parts:', '  BAT:', '    type: device', '', '    pins: [+, -]', '', 'wires:'];

    expect(appendUnderKey(lines, 'parts', 2, 'R1: resistor e5 e10'))
      .toEqual([{ kind: 'insert', line: 6, text: '  R1: resistor e5 e10' }]);
  });

  test('keeps a deeper comment at the end of the block with the block', () => {
    const lines = ['parts:', '  BAT:', '    type: device', '    # 予備', 'wires:'];

    expect(appendUnderKey(lines, 'parts', 2, 'R1: resistor e5 e10'))
      .toEqual([{ kind: 'insert', line: 5, text: '  R1: resistor e5 e10' }]);
  });

  test('stops at a comment as deep as the row, which heads the next group', () => {
    const lines = ['parts:', '  R1: resistor a1 a5', '  # ボード外', '  BAT:', '    type: device'];

    expect(appendUnderKey(lines, 'parts', 2, 'R2: resistor b1 b5'))
      .toEqual([{ kind: 'insert', line: 3, text: '  R2: resistor b1 b5' }]);
  });
});

describe('書き換えを丸ごと当てる', () => {
  test('takes the column edits first and the line edits after', () => {
    const source = 'a: 1\nb: 2\n';
    const done = applyRewrite(source, {
      edits: [{ line: 1, column: 3, length: 1, text: '9' }],
      lines: [{ kind: 'insert', line: 2, text: 'c: 3' }],
    });

    expect(done).toBe('a: 9\nc: 3\nb: 2\n');
  });

  test('takes either half on its own', () => {
    expect(applyRewrite('a\n', { lines: [{ kind: 'delete', line: 1 }] })).toBe('');
    expect(applyRewrite('ab\n', { edits: [{ line: 1, column: 0, length: 1, text: 'X' }] })).toBe('Xb\n');
  });

  test('evens out the newlines first, so a CRLF document is not doubled', () => {
    expect(applyRewrite('a\r\nb\r\n', {})).toBe('a\nb\n');
  });
});

describe('配線の端を字として見つける', () => {
  const OPERATORS = ['--', '-|', '|-'];

  test('finds either end of a plain wire', () => {
    expect(wireEndToken('  - a1 -- b2 red', OPERATORS, 'from')).toMatchObject({ text: 'a1' });
    expect(wireEndToken('  - a1 -- b2 red', OPERATORS, 'to')).toMatchObject({ text: 'b2' });
  });

  test('reads the longer operator first, so -| is not read as -', () => {
    expect(wireEndToken('  - a1 -| b2', OPERATORS, 'to')).toMatchObject({ text: 'b2' });
  });

  test('says nothing when the line has no operator on it', () => {
    expect(wireEndToken('  - a1 b2', OPERATORS, 'from')).toBeNull();
  });

  test('says nothing when one side of the operator is empty', () => {
    expect(wireEndToken('--  b2', OPERATORS, 'from')).toBeNull();
    expect(wireEndToken('a1 --', OPERATORS, 'to')).toBeNull();
  });
});

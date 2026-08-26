import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { parseCompactPart, parseNoteLine, parseNoteText, parseWireSpec } from './compact.ts';

const partOf = (text: string, id = 'R1') => {
  const result = parseCompactPart(id, text, 2);
  if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
  return result.value;
};

const messageOf = (text: string, id = 'R1') => {
  const result = parseCompactPart(id, text, 2);
  if (result.ok) throw new Error('読めてしまいました');
  return result.error;
};

describe('parseCompactPart', () => {
  test('reads a two terminal part with its value', () => {
    expect(partOf('resistor a1 a3 10k')).toEqual({
      kind: 'two-terminal',
      id: 'R1',
      type: 'resistor',
      from: { row: 0, col: 0 },
      to: { row: 0, col: 2 },
      value: '10k',
      line: 2,
    });
  });

  test('reads a two terminal part written without a value', () => {
    expect(partOf('capacitor a3 c3')).toMatchObject({ type: 'capacitor', value: null });
  });

  test('reads a one terminal part', () => {
    expect(partOf('port a1', 'IN')).toEqual({
      kind: 'one-terminal',
      id: 'IN',
      type: 'port',
      at: { row: 0, col: 0 },
      line: 2,
    });
  });

  test('reads a ground', () => {
    expect(partOf('ground c3', 'G1')).toMatchObject({ type: 'ground', at: { row: 2, col: 2 } });
  });

  test('reads the extra spaces a writer lines up columns with', () => {
    expect(partOf('resistor   a1   a3   10k')).toMatchObject({ value: '10k' });
  });

  test('names the part type it does not know and lists the ones it does', () => {
    const error = messageOf('resistr a1 a3');

    expect(error.line).toBe(2);
    expect(error.message).toContain('resistr');
    expect(error.message).toContain('resistor');
  });

  test('asks for two addresses when a two terminal part has only one', () => {
    expect(messageOf('resistor a1').message).toContain('番地 番地');
  });

  test('rejects a two terminal part with more words than it can use', () => {
    expect(messageOf('resistor a1 a3 10k extra').message).toContain('resistor');
  });

  test('rejects a one terminal part given two addresses', () => {
    expect(messageOf('ground c3 c5', 'G1').message).toContain('ground');
  });

  test('names the address it could not read', () => {
    const error = messageOf('resistor a1 z0');

    expect(error.message).toContain('z0');
    expect(error.message).toContain('番地');
  });

  test('rejects a value longer than the limit', () => {
    expect(messageOf(`resistor a1 a3 ${'9'.repeat(LIMITS.valueLength + 1)}`).message).toContain('値');
  });

  test('places a two terminal part along a slant', () => {
    expect(partOf('resistor a1 c4')).toMatchObject({ from: { row: 0, col: 0 }, to: { row: 2, col: 3 } });
  });

  test('rejects a part whose ends are the same cell, which has no direction', () => {
    expect(messageOf('resistor a1 a1').message).toContain('a1');
  });

  test('rejects an empty line', () => {
    expect(messageOf('').message).toContain('種類');
  });
});

const wireOf = (text: string) => {
  const result = parseWireSpec(text, 5);
  if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
  return result.value;
};

const wireMessageOf = (text: string) => {
  const result = parseWireSpec(text, 5);
  if (result.ok) throw new Error('読めてしまいました');
  return result.error;
};

describe('parseWireSpec', () => {
  test('reads a straight wire between two addresses', () => {
    expect(wireOf('a3 -- a4')).toEqual({
      from: { kind: 'cell', address: { row: 0, col: 2 } },
      to: { kind: 'cell', address: { row: 0, col: 3 } },
      operator: '--',
      line: 5,
    });
  });

  test('reads a wire written without spaces around the operator', () => {
    expect(wireOf('a3--a4')).toMatchObject({ to: { kind: 'cell', address: { row: 0, col: 3 } } });
  });

  test('reads a wire that turns across before down', () => {
    expect(wireOf('b3 -| c5')).toMatchObject({
      from: { kind: 'cell', address: { row: 1, col: 2 } },
      to: { kind: 'cell', address: { row: 2, col: 4 } },
      operator: '-|',
    });
  });

  test('reads a wire that turns down before across', () => {
    expect(wireOf('e3 |- f5')).toMatchObject({ operator: '|-' });
  });

  test('reads a straight wire as the straight operator', () => {
    expect(wireOf('a3 -- a4')).toMatchObject({ operator: '--' });
  });

  test('reads a bend written without spaces', () => {
    expect(wireOf('b3-|c5')).toMatchObject({ operator: '-|' });
  });

  test('reads a pin reference as an endpoint of its own', () => {
    expect(wireOf('U1.out -- c9')).toMatchObject({
      from: { kind: 'pin', part: 'U1', pin: 'out' },
      to: { kind: 'cell', address: { row: 2, col: 8 } },
    });
  });

  test('reads the short pin names a schematic uses', () => {
    expect(wireOf('Q1.B -- a1')).toMatchObject({ from: { kind: 'pin', part: 'Q1', pin: 'B' } });
    expect(wireOf('U1.+ -- a1')).toMatchObject({ from: { kind: 'pin', part: 'U1', pin: '+' } });
  });

  test('asks for the operator when the line has none', () => {
    expect(wireMessageOf('a3 a4').message).toContain('--');
  });

  test('rejects a wire with more than two endpoints', () => {
    expect(wireMessageOf('a1 -- a3 -- a5').message).toContain('--');
  });

  test('names the endpoint it could not read', () => {
    expect(wireMessageOf('a3 -- zz').message).toContain('zz');
  });

  test('rejects a wire that goes nowhere', () => {
    expect(wireMessageOf('a3 -- a3').message).toContain('a3');
  });

  test('draws a slanted wire straight between the two cells', () => {
    expect(wireOf('a3 -- b5')).toMatchObject({
      from: { kind: 'cell', address: { row: 0, col: 2 } },
      to: { kind: 'cell', address: { row: 1, col: 4 } },
    });
  });
});

describe('parseCompactPart の種類', () => {
  test('reads every two terminal type in the table', () => {
    for (const type of ['inductor', 'diode', 'led', 'zener', 'vsource', 'sine', 'isource', 'battery', 'switch', 'fuse', 'lamp']) {
      expect(partOf(`${type} a1 a3`)).toMatchObject({ kind: 'two-terminal', type });
    }
  });

  test('reads a value on any of them', () => {
    expect(partOf('inductor a1 a3 10m')).toMatchObject({ value: '10m' });
    expect(partOf('diode a1 a3 1N4148')).toMatchObject({ value: '1N4148' });
  });

  test('suggests the type behind a typo instead of listing them all', () => {
    const message = messageOf('resistr a1 a3').message;

    expect(message).toContain('resistor のことですか');
    expect(message).not.toContain('capacitor');
  });

  test('lists what is available when nothing is close', () => {
    const message = messageOf('relay a1 a3').message;

    expect(message).toContain('resistor');
    expect(message).toContain('lamp');
  });
});

const noteOf = (text: string) => {
  const result = parseNoteLine(text, 2);
  if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
  return result.value;
};

const noteProblem = (text: string) => {
  const result = parseNoteLine(text, 2);
  if (result.ok) throw new Error('読めてしまいました');
  return result.error;
};

const textNoteOf = (head: string, body: string) => {
  const result = parseNoteText(head, body, 2);
  if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
  return result.value;
};

const textNoteProblem = (head: string, body: string) => {
  const result = parseNoteText(head, body, 2);
  if (result.ok) throw new Error('読めてしまいました');
  return result.error;
};

describe('parseNoteLine', () => {
  test('reads a circle drawn around a part', () => {
    expect(noteOf('circle R1')).toEqual({ kind: 'circle', target: 'R1', color: 'red', line: 2 });
  });

  test('reads a circle drawn around a cell', () => {
    expect(noteOf('circle b3')).toMatchObject({ target: 'b3' });
  });

  // 指し先が部品か番地かは、部品の表を持っている model/circuit.ts が決める。
  test('leaves the target as written', () => {
    expect(noteOf('circle C1')).toMatchObject({ target: 'C1' });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('circle R1 blue')).toMatchObject({ color: 'blue' });
  });

  test('turns down a colour outside the palette', () => {
    expect(noteProblem('circle R1 rainbow').message).toContain('注釈の色');
  });

  test('turns down an unknown kind of note', () => {
    expect(noteProblem('arrow R1 to b3').message).toContain('注釈の種類');
  });

  test('shows how to write text when it is written as a plain line', () => {
    expect(noteProblem('text b1 ここ').message).toContain('text 番地');
  });

  test('turns down a target that could be neither an id nor a cell', () => {
    expect(noteProblem('circle U1.out').message).toContain('部品 ID にも番地にも');
  });

  test('turns down a line with more than a target and a colour', () => {
    expect(noteProblem('circle R1 red blue').message).toContain('circle は');
  });
});

describe('parseNoteText', () => {
  test('reads text written at a cell', () => {
    expect(textNoteOf('text b1', 'ここで分圧する')).toEqual({
      kind: 'text',
      at: { row: 1, col: 0 },
      text: 'ここで分圧する',
      color: null,
      line: 2,
    });
  });

  test('reads the colour when it is written', () => {
    expect(textNoteOf('text b1 blue', 'ここ')).toMatchObject({ color: 'blue' });
  });

  // 部品の書き方をそのまま写せるように、注釈だけは `:` を通す。
  test('takes a colon, which values may not hold', () => {
    expect(textNoteOf('text b1', 'R1: resistor a1 a3 10k')).toMatchObject({
      text: 'R1: resistor a1 a3 10k',
    });
  });

  test('takes Japanese whichever TeX it is drawn for', () => {
    expect(textNoteOf('text b1', '入力は 5 V まで')).toMatchObject({ text: '入力は 5 V まで' });
  });

  test('turns down a character that TeX would read as its own notation', () => {
    expect(textNoteProblem('text b1', 'gain = 10').message).toContain('使えない文字');
  });

  test('turns down text longer than the limit', () => {
    expect(textNoteProblem('text b1', 'あ'.repeat(LIMITS.noteLength + 1)).message).toContain('長すぎます');
  });

  test('turns down empty text', () => {
    expect(textNoteProblem('text b1', '   ').message).toContain('注釈の文字がありません');
  });

  test('turns down a place that is not a cell', () => {
    expect(textNoteProblem('text z0', 'ここ').message).toContain('番地の形');
  });

  test('shows how to write a circle when it is written with text', () => {
    expect(textNoteProblem('circle R1', 'ここ').message).toContain('circle は');
  });
});

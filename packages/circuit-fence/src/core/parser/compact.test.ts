import { describe, expect, test } from 'vitest';
import { LIMITS } from '../limits.ts';
import { parseCompactPart, parseNoteLine, parseNoteText, parseWireLine } from './compact.ts';

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
    expect(partOf('resistor 1,1 3,1 10k')).toEqual({
      kind: 'two-terminal',
      id: 'R1',
      type: 'resistor',
      from: { row: 0, col: 0 },
      to: { row: 0, col: 2 },
      value: '10k',
      current: null,
      currentReversed: false,
      voltage: null,
      voltageReversed: false,
      label: null,
      line: 2,
      // **書かれた綴りも持つ** — 書き戻すときに、番地の名前や種類の別名が
      // 化けないようにするため (52 の docs/54 の段 1)。
      spelling: ['1,1', '3,1'],
      written: 'resistor',
    });
  });

  test('reads a two terminal part written without a value', () => {
    expect(partOf('capacitor 3,1 3,3')).toMatchObject({ type: 'capacitor', value: null });
  });

  test('reads the current arrow written after the addresses', () => {
    expect(partOf('resistor 1,1 3,1 i=i')).toMatchObject({ value: null, current: 'i', voltage: null });
  });

  test('reads the voltage sign written after the addresses', () => {
    expect(partOf('capacitor 1,1 1,3 v=vC')).toMatchObject({ value: null, voltage: 'vC', current: null });
  });

  test('reads a value and a current arrow together, in either order', () => {
    expect(partOf('resistor 1,1 3,1 10k i=i1')).toMatchObject({ value: '10k', current: 'i1' });
    expect(partOf('resistor 1,1 3,1 i=i1 10k')).toMatchObject({ value: '10k', current: 'i1' });
  });

  // 極性のある部品は番地の順が極性で決まるので、矢だけを逆にしたいときに
  // 番地を入れ替えられない (ツェナーの逆電流など)。`<` を付けて向きを返す。
  test('reads the reversed forms of the arrows', () => {
    expect(partOf('zener 1,1 1,3 i<=IZ')).toMatchObject({ current: 'IZ', currentReversed: true });
    expect(partOf('capacitor 1,1 1,3 v<=vC')).toMatchObject({ voltage: 'vC', voltageReversed: true });
  });

  test('reads the plain forms as pointing from the address written first', () => {
    expect(partOf('resistor 1,1 3,1 i=I')).toMatchObject({ current: 'I', currentReversed: false });
  });

  test('rejects the same arrow written in both directions', () => {
    expect(messageOf('resistor 1,1 3,1 i=I i<=I').message).toContain('i');
  });

  test('names the key it does not know and lists the ones it does', () => {
    const error = messageOf('resistor 1,1 3,1 x=1');

    expect(error.line).toBe(2);
    expect(error.message).toContain('x=');
    expect(error.message).toContain('i=');
    expect(error.message).toContain('v=');
  });

  test('rejects the same key written twice', () => {
    expect(messageOf('resistor 1,1 3,1 i=i1 i=i2').message).toContain('i=');
  });

  test('rejects a key written without its label', () => {
    expect(messageOf('resistor 1,1 3,1 i=').message).toContain('i=');
  });

  test('rejects a voltage written together with a value (they land on the same side)', () => {
    const error = messageOf('capacitor 1,1 1,3 100u v=vC');

    expect(error.line).toBe(2);
    expect(error.message).toContain('v=');
  });

  test('rejects a voltage written together with a current (they land on the same side)', () => {
    expect(messageOf('resistor 1,1 3,1 i=i v=v').message).toContain('v=');
  });

  test('rejects a label longer than the limit', () => {
    expect(messageOf(`resistor 1,1 3,1 i=${'x'.repeat(LIMITS.valueLength + 1)}`).message).toContain('長すぎ');
  });

  test('reads a one terminal part', () => {
    expect(partOf('port 1,1', 'IN')).toEqual({
      kind: 'one-terminal',
      id: 'IN',
      type: 'port',
      at: { row: 0, col: 0 },
      turn: { rotate: 0, mirror: false },
      line: 2,
      spelling: ['1,1'],
      written: 'port',
    });
  });

  test('reads a ground', () => {
    expect(partOf('ground 3,3', 'G1')).toMatchObject({ type: 'ground', at: { row: 2, col: 2 } });
  });

  test('reads the extra spaces a writer lines up columns with', () => {
    expect(partOf('resistor   1,1   3,1   10k')).toMatchObject({ value: '10k' });
  });

  test('names the part type it does not know and lists the ones it does', () => {
    const error = messageOf('resistr 1,1 3,1');

    expect(error.line).toBe(2);
    expect(error.message).toContain('resistr');
    expect(error.message).toContain('resistor');
  });

  test('asks for two addresses when a two terminal part has only one', () => {
    expect(messageOf('resistor 1,1').message).toContain('番地 番地');
  });

  test('rejects a two terminal part with more words than it can use', () => {
    expect(messageOf('resistor 1,1 3,1 10k extra').message).toContain('resistor');
  });

  test('rejects a one terminal part given two addresses', () => {
    expect(messageOf('ground 3,3 5,3', 'G1').message).toContain('ground');
  });

  test('names the address it could not read', () => {
    const error = messageOf('resistor 1,1 z0');

    expect(error.message).toContain('z0');
    expect(error.message).toContain('番地');
  });

  test('rejects a value longer than the limit', () => {
    expect(messageOf(`resistor 1,1 3,1 ${'9'.repeat(LIMITS.valueLength + 1)}`).message).toContain('値');
  });

  test('places a two terminal part along a slant', () => {
    expect(partOf('resistor 1,1 4,3')).toMatchObject({ from: { row: 0, col: 0 }, to: { row: 2, col: 3 } });
  });

  test('rejects a part whose ends are the same cell, which has no direction', () => {
    expect(messageOf('resistor 1,1 1,1').message).toContain('1,1');
  });

  test('rejects an empty line', () => {
    expect(messageOf('').message).toContain('種類');
  });
});

const wiresOf = (text: string) => {
  const result = parseWireLine(text, 5);
  if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
  return result.value;
};

/** 1 本だけ書いた行。つないだ数が 1 でないと、取り違えたまま通ってしまう。 */
const wireOf = (text: string) => {
  const wires = wiresOf(text);
  if (wires.length !== 1) throw new Error(`1 本のはずが ${wires.length} 本でした`);
  return wires[0];
};

const wireMessageOf = (text: string) => {
  const result = parseWireLine(text, 5);
  if (result.ok) throw new Error('読めてしまいました');
  return result.error;
};

describe('parseWireLine', () => {
  test('reads a straight wire between two addresses', () => {
    expect(wireOf('3,1 -- 4,1')).toEqual({
      from: { kind: 'cell', address: { row: 0, col: 2 } },
      to: { kind: 'cell', address: { row: 0, col: 3 } },
      operator: '--',
      line: 5,
      // 書かれた端点の綴りも持つ (書き戻すときに名前が番地へ化けないように)。
      spelling: ['3,1', '4,1'],
    });
  });

  test('reads a wire written without spaces around the operator', () => {
    expect(wireOf('3,1--4,1')).toMatchObject({ to: { kind: 'cell', address: { row: 0, col: 3 } } });
  });

  test('reads a wire that turns across before down', () => {
    expect(wireOf('3,2 -| 5,3')).toMatchObject({
      from: { kind: 'cell', address: { row: 1, col: 2 } },
      to: { kind: 'cell', address: { row: 2, col: 4 } },
      operator: '-|',
    });
  });

  test('reads a wire that turns down before across', () => {
    expect(wireOf('3,5 |- 5,6')).toMatchObject({ operator: '|-' });
  });

  test('reads a straight wire as the straight operator', () => {
    expect(wireOf('3,1 -- 4,1')).toMatchObject({ operator: '--' });
  });

  test('reads a bend written without spaces', () => {
    expect(wireOf('3,2-|5,3')).toMatchObject({ operator: '-|' });
  });

  test('reads a pin reference as an endpoint of its own', () => {
    expect(wireOf('U1.out -- 9,3')).toMatchObject({
      from: { kind: 'pin', part: 'U1', pin: 'out' },
      to: { kind: 'cell', address: { row: 2, col: 8 } },
    });
  });

  test('reads the short pin names a schematic uses', () => {
    expect(wireOf('Q1.B -- 1,1')).toMatchObject({ from: { kind: 'pin', part: 'Q1', pin: 'B' } });
    expect(wireOf('U1.+ -- 1,1')).toMatchObject({ from: { kind: 'pin', part: 'U1', pin: '+' } });
  });

  test('asks for the operator when the line has none', () => {
    expect(wireMessageOf('3,1 4,1').message).toContain('--');
  });

  test('names the endpoint it could not read', () => {
    expect(wireMessageOf('3,1 -- zz').message).toContain('zz');
  });

  test('rejects a wire that goes nowhere', () => {
    expect(wireMessageOf('3,1 -- 3,1').message).toContain('3,1');
  });

  test('draws a slanted wire straight between the two cells', () => {
    expect(wireOf('3,1 -- 5,2')).toMatchObject({
      from: { kind: 'cell', address: { row: 0, col: 2 } },
      to: { kind: 'cell', address: { row: 1, col: 4 } },
    });
  });
});

describe('parseWireLine のつなぎ書き', () => {
  test('reads three endpoints as two segments', () => {
    const wires = wiresOf('1,1 -- 3,1 -- 5,1');

    expect(wires).toHaveLength(2);
    expect(wires[0]).toMatchObject({
      from: { kind: 'cell', address: { row: 0, col: 0 } },
      to: { kind: 'cell', address: { row: 0, col: 2 } },
    });
    expect(wires[1]).toMatchObject({
      from: { kind: 'cell', address: { row: 0, col: 2 } },
      to: { kind: 'cell', address: { row: 0, col: 4 } },
    });
  });

  test('keeps each operator with the segment it was written on', () => {
    // 1 行に別の演算子を混ぜられないと、経路として書く意味が薄い。
    const wires = wiresOf('1,2 -- 3,2 |- U1.+');

    expect(wires[0]).toMatchObject({ operator: '--' });
    expect(wires[1]).toMatchObject({ operator: '|-', to: { kind: 'pin', part: 'U1', pin: '+' } });
  });

  test('gives every segment the line the chain was written on', () => {
    // 帯に出る行は書いた 1 行。折り返した先を指しても直しに行けない。
    for (const wire of wiresOf('1,1 -- 3,1 -- 5,1 -- 5,3')) expect(wire.line).toBe(5);
  });

  test('reads a chain written without spaces', () => {
    expect(wiresOf('1,1--3,1|-5,3')).toHaveLength(2);
  });

  test('rejects a chain that ends with an operator', () => {
    expect(wireMessageOf('1,1 -- 3,1 --').message).toContain('端点');
  });

  test('names the endpoint it could not read in the middle of a chain', () => {
    expect(wireMessageOf('1,1 -- zz -- 5,1').message).toContain('zz');
  });

  test('rejects a segment that goes nowhere inside a chain', () => {
    // 通しで見ると a1 から c5 へ向かっているが、途中の 1 区間は向きが決まらない。
    expect(wireMessageOf('1,1 -- 3,1 -- 3,1 -- 5,3').message).toContain('3,1');
  });
});

describe('parseCompactPart の種類', () => {
  test('reads every two terminal type in the table', () => {
    for (const type of ['inductor', 'diode', 'led', 'zener', 'vsource', 'sine', 'isource', 'battery', 'switch', 'fuse', 'lamp']) {
      expect(partOf(`${type} 1,1 3,1`)).toMatchObject({ kind: 'two-terminal', type });
    }
  });

  test('reads a value on any of them', () => {
    expect(partOf('inductor 1,1 3,1 10m')).toMatchObject({ value: '10m' });
    expect(partOf('diode 1,1 3,1 1N4148')).toMatchObject({ value: '1N4148' });
  });

  test('reads a part written with its abbreviation', () => {
    expect(partOf('r 1,1 3,1 10k')).toMatchObject({ kind: 'two-terminal', type: 'resistor', value: '10k' });
    expect(partOf('ac 5,5 7,5 1', 'V2')).toMatchObject({ type: 'sine', value: '1' });
  });

  test('records the full name so the rest of the pipeline sees one spelling', () => {
    // 略記のまま流すと、グラウンドやオペアンプを名前で見分けている先が壊れる。
    expect(partOf('gnd 3,3', 'G1')).toMatchObject({ kind: 'one-terminal', type: 'ground' });
    expect(partOf('op 5,3 +up', 'U1')).toMatchObject({ kind: 'multi-terminal', type: 'opamp', orientation: '+up' });
  });

  /**
   * 向きの語。**回転と反転は別の語**で、1 行に回転 1 つと `mirror` 1 つまで
   * (順不同)。オペアンプの `+up` / `+down` は ± の入れ替えで、回転では書けない
   * 別の鍵なので併記できる。
   */
  describe('向き', () => {
    test('reads a rotation, clockwise the way the drawing turns', () => {
      expect(partOf('npn 3,3 r90', 'Q1')).toMatchObject({ turn: { rotate: 90, mirror: false } });
      expect(partOf('npn 3,3 r180', 'Q1')).toMatchObject({ turn: { rotate: 180, mirror: false } });
      expect(partOf('npn 3,3 r270', 'Q1')).toMatchObject({ turn: { rotate: 270, mirror: false } });
    });

    test('reads a mirror on its own', () => {
      expect(partOf('npn 3,3 mirror', 'Q1')).toMatchObject({ turn: { rotate: 0, mirror: true } });
    });

    test('reads a rotation and a mirror together, in either order', () => {
      const both = { rotate: 90, mirror: true };

      expect(partOf('npn 3,3 r90 mirror', 'Q1')).toMatchObject({ turn: both });
      expect(partOf('npn 3,3 mirror r90', 'Q1')).toMatchObject({ turn: both });
    });

    test('stands still when nothing is written', () => {
      expect(partOf('npn 3,3', 'Q1')).toMatchObject({ turn: { rotate: 0, mirror: false } });
    });

    test('keeps the value apart from the words, wherever it sits', () => {
      expect(partOf('npn 3,3 r90 2SC1815', 'Q1')).toMatchObject({ turn: { rotate: 90 }, value: '2SC1815' });
      expect(partOf('npn 3,3 2SC1815 r90', 'Q1')).toMatchObject({ turn: { rotate: 90 }, value: '2SC1815' });
    });

    test('carries the sign order of an op amp as its own key', () => {
      // ± の入れ替えは回転では書けない (別の鍵)。回転と併記できる。
      expect(partOf('opamp 5,3 +up r90', 'U1')).toMatchObject({ orientation: '+up', turn: { rotate: 90 } });
    });

    test('refuses two rotations, instead of letting the last one win', () => {
      const message = messageOf('npn 3,3 r90 r180', 'Q1').message;

      expect(message).toContain('向き');
      expect(messageOf('npn 3,3 r90 r180', 'Q1').line).toBe(2);
    });

    test('refuses two mirrors and two sign orders too', () => {
      expect(messageOf('npn 3,3 mirror mirror', 'Q1').message).toContain('向き');
      expect(messageOf('opamp 5,3 +up +down', 'U1').message).toContain('向き');
    });

    test('lets a one terminal part carry a turn, which ground needs', () => {
      expect(partOf('ground 3,3 r90', 'G1')).toMatchObject({ kind: 'one-terminal', turn: { rotate: 90 } });
    });

    test('still refuses a stray token on a one terminal part', () => {
      expect(messageOf('ground 3,3 huh', 'G1').message).toContain('「種類 番地」');
    });
  });

  test('reads a pin on a part written with its abbreviation', () => {
    expect(partOf('scr 1,4 5,4', 'T1')).toMatchObject({ type: 'thyristor' });
  });

  test('says what was written when an abbreviated line is wrong', () => {
    // 書いた行と照らせるよう、畳んだあとの正式名ではなく書いた綴りを出す。
    const message = messageOf('r 1,1').message;

    expect(message).toContain('r は');
    expect(message).not.toContain('resistor');
  });

  test('suggests the type behind a typo instead of listing them all', () => {
    const message = messageOf('resistr 1,1 3,1').message;

    expect(message).toContain('resistor のことですか');
    expect(message).not.toContain('capacitor');
  });

  test('lists what is available when nothing is close', () => {
    const message = messageOf('solenoid 1,1 3,1').message;

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
    // 書かれた語も持つ (色を書かなくても既定で埋まるので、書き戻しに要る)。
    expect(noteOf('circle R1')).toEqual({
      kind: 'circle', target: 'R1', color: 'red', line: 2, written: ['R1'],
    });
  });

  test('reads a circle drawn around a cell', () => {
    expect(noteOf('circle 3,2')).toMatchObject({ target: '3,2' });
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
    expect(noteProblem('star R1 3,2').message).toContain('注釈の種類');
  });

  test('shows how to write text when it is written as a plain line', () => {
    expect(noteProblem('text 1,2 ここ').message).toContain('text 番地');
  });

  test('turns down a target that could be neither an id nor a cell', () => {
    expect(noteProblem('circle U1.out').message).toContain('部品 ID にも番地にも');
  });

  test('turns down a line with more than a target and a colour', () => {
    expect(noteProblem('circle R1 red blue').message).toContain('circle は');
  });

  // 印には字が無いので、字の言葉 (大きさ・寄せ・太字) を書いても効かない。
  // 黙って捨てず、書ける言葉を伝える。
  test('turns down a word that only text can take', () => {
    expect(noteProblem('circle R1 huge').message).toContain('circle は');
  });
  // 罫線を引きたいときは実線のほうがよい (表の枠など)。既定は破線のまま。
  // 罫線を引くための直線。指し棒と同じ書き方で、先端の矢が付かないだけ。
  test('reads a line between two addresses', () => {
    expect(noteOf('line 1,1 5,1')).toEqual({
      kind: 'line',
      from: '1,1',
      to: '5,1',
      color: 'red',
      line: 2,
      written: ['1,1', '5,1'],
    });
  });

  test('reads the colour a line is drawn in', () => {
    expect(noteOf('line 1,1 5,1 ink')).toMatchObject({ kind: 'line', color: 'ink' });
  });

  test('rejects a line whose ends are written as something else', () => {
    expect(noteProblem('line 1,1').message).toContain('line');
  });

  test('reads the word that makes a box solid', () => {
    expect(noteOf('box 1,1 3,3 solid')).toMatchObject({ kind: 'box', solid: true });
    expect(noteOf('box 1,1 3,3 ink solid')).toMatchObject({ color: 'ink', solid: true });
    expect(noteOf('box 1,1 3,3 ink')).toMatchObject({ color: 'ink', solid: false });
  });

  test('reads those words in any order', () => {
    expect(noteOf('box 1,1 3,3 solid ink')).toMatchObject({ color: 'ink', solid: true });
  });

  test('keeps solid to boxes (the mark and the pointer have no line style)', () => {
    expect(noteProblem('circle R1 solid').message).toContain('solid');
  });

});

describe('parseNoteLine の box', () => {
  test('reads a box drawn around a range of cells', () => {
    expect(noteOf('box 1,1 3,3')).toEqual({
      kind: 'box',
      from: { row: 0, col: 0 },
      to: { row: 2, col: 2 },
      color: 'red',
      solid: false,
      line: 2,
      written: ['1,1', '3,3'],
    });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('box 1,1 3,3 blue')).toMatchObject({ color: 'blue' });
  });

  // 1 マスだけを囲むのは書き間違いではない (そこを目立たせたいということ)。
  test('takes the same cell twice as a box around one cell', () => {
    expect(noteOf('box 2,2 2,2')).toMatchObject({ from: { row: 1, col: 1 }, to: { row: 1, col: 1 } });
  });

  // 角に書けるのは番地だけ。`R1` のように番地としても読める ID は番地になる
  // (印と同じ決まり。字の注釈もそうしている)。
  test('turns down a corner that could not be a cell', () => {
    expect(noteProblem('box U1.out 3,3').message).toContain('番地の形');
  });

  test('turns down a box with only one corner', () => {
    expect(noteProblem('box 1,1').message).toContain('box は');
  });

  test('turns down a colour outside the palette', () => {
    expect(noteProblem('box 1,1 3,3 rainbow').message).toContain('注釈の色');
  });
});

describe('parseNoteLine の arrow', () => {
  test('reads an arrow drawn between two targets', () => {
    expect(noteOf('arrow 5,1 R1')).toEqual({
      kind: 'arrow', from: '5,1', to: 'R1', color: 'red', line: 2, written: ['5,1', 'R1'],
    });
  });

  // 起点も終点も、印と同じく部品 ID か番地。どちらかは circuit.ts が決める。
  test('leaves both ends as written', () => {
    expect(noteOf('arrow C1 3,2')).toMatchObject({ from: 'C1', to: '3,2' });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('arrow 5,1 R1 green')).toMatchObject({ color: 'green' });
  });

  test('turns down an arrow with only one end', () => {
    expect(noteProblem('arrow R1').message).toContain('arrow は');
  });

  test('turns down an end that could be neither an id nor a cell', () => {
    expect(noteProblem('arrow U1.out R1').message).toContain('部品 ID にも番地にも');
  });

  test('turns down a colour outside the palette', () => {
    expect(noteProblem('arrow 5,1 R1 rainbow').message).toContain('注釈の色');
  });
});

describe('parseNoteText', () => {
  test('reads text written at a cell', () => {
    expect(textNoteOf('text 1,2', 'ここで分圧する')).toEqual({
      kind: 'text',
      at: { row: 1, col: 0 },
      text: 'ここで分圧する',
      color: null,
      size: 'normal',
      align: 'left',
      bold: false,
      rotate: 0,
      line: 2,
      written: ['1,2'],
      bodyWritten: 'ここで分圧する',
    });
  });

  test('reads the colour when it is written', () => {
    expect(textNoteOf('text 1,2 blue', 'ここ')).toMatchObject({ color: 'blue' });
  });

  // 部品の書き方をそのまま写せるように、注釈だけは `:` を通す。
  test('takes a colon, which values may not hold', () => {
    expect(textNoteOf('text 1,2', 'R1: resistor a1 a3 10k')).toMatchObject({
      text: 'R1: resistor a1 a3 10k',
    });
  });

  test('takes Japanese whichever TeX it is drawn for', () => {
    expect(textNoteOf('text 1,2', '入力は 5 V まで')).toMatchObject({ text: '入力は 5 V まで' });
  });

  test('turns down a character that TeX would read as its own notation', () => {
    expect(textNoteProblem('text 1,2', 'gain = 10').message).toContain('使えない文字');
  });

  test('says which characters it turned down', () => {
    const message = textNoteProblem('text 1,2', 'a = $x$').message;

    expect(message).toContain('「=」');
    expect(message).toContain('「$」');
    expect(message).not.toContain('「a」');
  });

  test('takes a comma in the text (it sits inside the node braces, not in an option list)', () => {
    expect(textNoteOf('text 1,2', 'R1, R2 の点')).toMatchObject({ text: 'R1, R2 の点' });
    expect(textNoteOf('text 1,2', '1,1 の点')).toMatchObject({ text: '1,1 の点' });
  });

  test('turns down text longer than the limit', () => {
    expect(textNoteProblem('text 1,2', 'あ'.repeat(LIMITS.noteLength + 1)).message).toContain('長すぎます');
  });

  test('turns down empty text', () => {
    expect(textNoteProblem('text 1,2', '   ').message).toContain('注釈の文字がありません');
  });

  test('turns down a place that is not a cell', () => {
    expect(textNoteProblem('text z0', 'ここ').message).toContain('番地の形');
  });

  test('shows how to write a circle when it is written with text', () => {
    expect(textNoteProblem('circle R1', 'ここ').message).toContain('circle は');
  });

  // 表を素の `[名前]` で引くと、Object.prototype にある名前が当たってしまう。
  // 書き方でない値を、そのまま図の下の帯に出すことになる。
  test('treats a name from Object.prototype as an unknown kind', () => {
    const message = textNoteProblem('toString 1,1', 'ここ').message;

    expect(message).toContain('知りません');
    expect(message).not.toContain('native code');
  });

  // `- box a1: c3` は YAML がマップとして読む。知っている種類なのに
  // 「種類を知りません」と返すと、直す場所が分からない。
  test('shows how to write the other kinds when they are written with text', () => {
    for (const kind of ['box', 'arrow', 'source']) {
      const message = textNoteProblem(`${kind} 1,1`, '3,3').message;

      expect(message).toContain(`${kind} は`);
      expect(message).not.toContain('知りません');
    }
  });
});

describe('parseNoteText の見た目', () => {
  test('reads the size when it is written', () => {
    expect(textNoteOf('text 1,2 huge', 'ここ')).toMatchObject({ size: 'huge' });
  });

  test('reads the alignment when it is written', () => {
    expect(textNoteOf('text 1,2 right', 'ここ')).toMatchObject({ align: 'right' });
  });

  test('reads bold when it is written', () => {
    expect(textNoteOf('text 1,2 bold', 'ここ')).toMatchObject({ bold: true });
  });

  // 語ごとに読む場所を決めていないので、書いた順に縛られない。
  test('takes the words in any order', () => {
    const written = textNoteOf('text 1,2 bold center blue tiny', 'ここ');
    const reordered = textNoteOf('text 1,2 tiny blue center bold', 'ここ');

    // **読んだ見た目は同じ。** 書かれた語の控えだけが並び順を覚えている
    // (書き戻しで並びを変えないため)。
    expect({ ...written, written: [] }).toEqual({ ...reordered, written: [] });
    expect(written).toMatchObject({ color: 'blue', size: 'tiny', align: 'center', bold: true });
  });

  test('turns down a word that is neither a colour nor a look', () => {
    expect(textNoteProblem('text 1,2 enormous', 'ここ').message).toContain('注釈の言葉');
  });

  // 二重に書かれたら、後に書いたほうが黙って勝つのではなく理由を返す。
  test('turns down a size written twice', () => {
    expect(textNoteProblem('text 1,2 tiny huge', 'ここ').message).toContain('二重');
  });

  test('turns down a colour written twice', () => {
    expect(textNoteProblem('text 1,2 red blue', 'ここ').message).toContain('二重');
  });

  test('turns down an alignment written twice', () => {
    expect(textNoteProblem('text 1,2 left right', 'ここ').message).toContain('二重');
  });

  test('turns down bold written twice', () => {
    expect(textNoteProblem('text 1,2 bold bold', 'ここ').message).toContain('二重');
  });

  test('names the words that can be written', () => {
    const message = textNoteProblem('text 1,2 enormous', 'ここ').message;

    expect(message).toContain('huge');
    expect(message).toContain('center');
    expect(message).toContain('bold');
    expect(message).toContain('blue');
  });
});

describe('parseNoteLine の source', () => {
  test('reads a note that writes the fence out', () => {
    expect(noteOf('source 6,1')).toEqual({
      kind: 'source',
      at: { row: 0, col: 5 },
      color: null,
      size: 'normal',
      align: 'left',
      bold: false,
      rotate: 0,
      leading: null,
      line: 2,
      written: ['6,1'],
    });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('source 6,1 blue')).toMatchObject({ color: 'blue' });
  });

  // 書き出しは長くなりがちなので、小さく組めることに実利がある。
  test('takes the same looks the text notes take', () => {
    expect(noteOf('source 6,1 tiny bold')).toMatchObject({ size: 'tiny', bold: true });
  });

  test('turns down a place that is not a cell', () => {
    expect(noteProblem('source z0').message).toContain('番地の形');
  });

  test('turns down a word that is neither a colour nor a look', () => {
    expect(noteProblem('source 6,1 blue extra').message).toContain('注釈の言葉');
  });

  test('reads the leading when it is written', () => {
    expect(noteOf('source 6,1 tight')).toMatchObject({ leading: 'tight' });
    expect(noteOf('source 6,1 loose')).toMatchObject({ leading: 'loose' });
  });

  // 語ごとに読む場所を決めていないので、行送りも順を選ばない。
  test('takes the leading in any order among the other words', () => {
    expect(noteOf('source 6,1 tight blue tiny')).toMatchObject({
      leading: 'tight', color: 'blue', size: 'tiny',
    });
  });

  test('turns down a leading written twice', () => {
    expect(noteProblem('source 6,1 tight loose').message).toContain('二重');
  });

  test('names the leading among the words it knows', () => {
    const message = noteProblem('source 6,1 nope').message;

    expect(message).toContain('tight');
    expect(message).toContain('loose');
  });
});

// 行送りは何行も並ぶものにしか意味がない。字 1 行の注釈や印に書いても効かないので、
// 黙って捨てずに、どこに書けるかを添えて返す。
describe('行送りの語が書ける場所', () => {
  test('turns the leading down on a one-line text note', () => {
    const message = textNoteProblem('text 1,2 tight', 'ここ').message;

    expect(message).toContain('source');
  });

  test('turns the leading down on a mark', () => {
    for (const line of ['circle R1 tight', 'box 1,1 3,3 loose', 'arrow 1,1 R1 tight']) {
      expect(noteProblem(line).message).toContain('source');
    }
  });

  test('does not offer the leading to a note that cannot take it', () => {
    expect(textNoteProblem('text 1,2 nope', 'ここ').message).not.toContain('tight');
  });
});

describe('addresses between the cells', () => {
  test('places a part on an address written between two cells', () => {
    expect(partOf('resistor 1.5,1 3.5,1 10k')).toMatchObject({
      from: { row: 0, col: 0.5 },
      to: { row: 0, col: 2.5 },
    });
  });

  test('reads a wire that ends between two cells', () => {
    expect(wireOf('1,1.5 -- 3,1.5')).toEqual({
      from: { kind: 'cell', address: { row: 0.5, col: 0 } },
      to: { kind: 'cell', address: { row: 0.5, col: 2 } },
      operator: '--',
      line: 5,
      spelling: ['1,1.5', '3,1.5'],
    });
  });

  test('still reads a pin written with a number as a pin, not as an address', () => {
    expect(wireOf('U1.5 -| 4,5')).toMatchObject({ from: { kind: 'pin', part: 'U1', pin: '5' } });
    expect(wireOf('Q1.B -- 3,3')).toMatchObject({ from: { kind: 'pin', part: 'Q1', pin: 'B' } });
  });

  test('points to the separator when a decimal is written without one', () => {
    expect(messageOf('resistor a1.5 3,1').message).toContain('1.5,1');
  });

  test('says how to write a place when a fraction is written', () => {
    expect(messageOf('resistor a.1/4_2 3,1').message).toContain('2.5,1.25');
  });

  test('points to the plain spelling when the separator carries no decimal', () => {
    expect(messageOf('resistor a_1 3,1').message).toContain('1,1');
  });
});

describe('交点の間の番地を書ける場所', () => {
  const noteOf = (text: string) => {
    const result = parseNoteLine(text, 3);
    if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
    return result.value;
  };

  test('circles a cell between the crossings, which is an address like any other', () => {
    expect(noteOf('circle 1.5,1')).toMatchObject({ kind: 'circle', target: '1.5,1' });
  });

  test('points an arrow from and to a cell between the crossings', () => {
    expect(noteOf('arrow 1,1.5 R1')).toMatchObject({ kind: 'arrow', from: '1,1.5', to: 'R1' });
  });

  test('still refuses a target that is neither a part nor an address', () => {
    const result = parseNoteLine('circle a$1', 3);

    expect(result.ok).toBe(false);
  });
});

describe('電源レールの電圧', () => {
  test('reads a voltage after the address of a vcc rail and shows it with a plus sign', () => {
    expect(partOf('vcc 3,4 5V', 'VCC')).toMatchObject({ kind: 'one-terminal', type: 'vcc', supply: '+5V' });
    expect(partOf('vcc 3,4 3.3V', 'VCC')).toMatchObject({ supply: '+3.3V' });
  });

  test('shows a vee rail with a minus sign', () => {
    expect(partOf('vee 3,4 5V', 'VEE')).toMatchObject({ type: 'vee', supply: '-5V' });
  });

  test('leaves the rail without a voltage as it was', () => {
    expect(partOf('vcc 3,4', 'VCC')).not.toHaveProperty('supply');
  });

  test('refuses a bare number, because the unit decides what it means', () => {
    expect(messageOf('vcc 3,4 5', 'VCC').message).toContain('5V');
  });

  test('refuses a voltage on a symbol that is not a rail', () => {
    expect(messageOf('port 1,1 5V', 'IN').message).toContain('種類 番地');
  });
});

describe('x,y の番地と、取り違えやすい語', () => {
  test('reads a place between the crossings as a decimal', () => {
    expect(partOf('resistor 1.5,1 3,1.25')).toMatchObject({ from: { row: 0, col: 0.5 }, to: { row: 0.25, col: 2 } });
  });

  test('refuses the old spelling and hands back the one to write', () => {
    expect(messageOf('resistor a1f5 3,1').message).toBe('a1f5 は旧い綴りです。1.5,1.5 と書きます');
    expect(wireMessageOf('c5 -- 3,1').message).toBe('c5 は旧い綴りです。5,3 と書きます');
  });

  test('hands back the one spelling when a place is written with extra zeros', () => {
    expect(messageOf('resistor 2.50,1 3,1').message).toContain('2.5,1 と書きます');
  });

  test('reads a word that starts with a digit and holds a comma as a place, not as a pin', () => {
    // `2.555,1` を「部品 2 の 555,1 番ピン」と読むと、直しに行く先が無い。
    expect(wireMessageOf('2.555,1 -- 3,1').message).toContain('小数は 2 桁まで');
  });

  test('still reads a pin with a number after the dot as a pin', () => {
    expect(wireOf('U1.5 -- 3,1')).toMatchObject({ from: { kind: 'pin', part: 'U1', pin: '5' } });
  });

  test('refuses a comma in a value, where it would read as a place', () => {
    // 値の欄に `,` は書かない (`1,000` は `1k`)。番地の書き忘れで番地が値の欄へずれた形も、ここで止まる。
    expect(messageOf('resistor 1,1 3,1 1,000').message).toContain('1k');
    expect(messageOf('npn 3,3 2,2', 'Q1').message).toContain(',');
  });
});

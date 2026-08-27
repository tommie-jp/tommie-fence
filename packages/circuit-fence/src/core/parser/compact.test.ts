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

describe('parseWireLine のつなぎ書き', () => {
  test('reads three endpoints as two segments', () => {
    const wires = wiresOf('a1 -- a3 -- a5');

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
    const wires = wiresOf('b1 -- b3 |- U1.+');

    expect(wires[0]).toMatchObject({ operator: '--' });
    expect(wires[1]).toMatchObject({ operator: '|-', to: { kind: 'pin', part: 'U1', pin: '+' } });
  });

  test('gives every segment the line the chain was written on', () => {
    // 帯に出る行は書いた 1 行。折り返した先を指しても直しに行けない。
    for (const wire of wiresOf('a1 -- a3 -- a5 -- c5')) expect(wire.line).toBe(5);
  });

  test('reads a chain written without spaces', () => {
    expect(wiresOf('a1--a3|-c5')).toHaveLength(2);
  });

  test('rejects a chain that ends with an operator', () => {
    expect(wireMessageOf('a1 -- a3 --').message).toContain('端点');
  });

  test('names the endpoint it could not read in the middle of a chain', () => {
    expect(wireMessageOf('a1 -- zz -- a5').message).toContain('zz');
  });

  test('rejects a segment that goes nowhere inside a chain', () => {
    // 通しで見ると a1 から c5 へ向かっているが、途中の 1 区間は向きが決まらない。
    expect(wireMessageOf('a1 -- a3 -- a3 -- c5').message).toContain('a3');
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

  test('reads a part written with its abbreviation', () => {
    expect(partOf('r a1 a3 10k')).toMatchObject({ kind: 'two-terminal', type: 'resistor', value: '10k' });
    expect(partOf('ac e5 e7 1', 'V2')).toMatchObject({ type: 'sine', value: '1' });
  });

  test('records the full name so the rest of the pipeline sees one spelling', () => {
    // 略記のまま流すと、グラウンドやオペアンプを名前で見分けている先が壊れる。
    expect(partOf('gnd c3', 'G1')).toMatchObject({ kind: 'one-terminal', type: 'ground' });
    expect(partOf('op c5 +up', 'U1')).toMatchObject({ kind: 'multi-terminal', type: 'opamp', orientation: '+up' });
  });

  test('reads a pin on a part written with its abbreviation', () => {
    expect(partOf('scr d1 d5', 'T1')).toMatchObject({ type: 'thyristor' });
  });

  test('says what was written when an abbreviated line is wrong', () => {
    // 書いた行と照らせるよう、畳んだあとの正式名ではなく書いた綴りを出す。
    const message = messageOf('r a1').message;

    expect(message).toContain('r は');
    expect(message).not.toContain('resistor');
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
    expect(noteProblem('star R1 b3').message).toContain('注釈の種類');
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

  // 印には字が無いので、字の言葉 (大きさ・寄せ・太字) を書いても効かない。
  // 黙って捨てず、書ける言葉を伝える。
  test('turns down a word that only text can take', () => {
    expect(noteProblem('circle R1 huge').message).toContain('circle は');
  });
});

describe('parseNoteLine の box', () => {
  test('reads a box drawn around a range of cells', () => {
    expect(noteOf('box a1 c3')).toEqual({
      kind: 'box',
      from: { row: 0, col: 0 },
      to: { row: 2, col: 2 },
      color: 'red',
      line: 2,
    });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('box a1 c3 blue')).toMatchObject({ color: 'blue' });
  });

  // 1 マスだけを囲むのは書き間違いではない (そこを目立たせたいということ)。
  test('takes the same cell twice as a box around one cell', () => {
    expect(noteOf('box b2 b2')).toMatchObject({ from: { row: 1, col: 1 }, to: { row: 1, col: 1 } });
  });

  // 角に書けるのは番地だけ。`R1` のように番地としても読める ID は番地になる
  // (印と同じ決まり。字の注釈もそうしている)。
  test('turns down a corner that could not be a cell', () => {
    expect(noteProblem('box U1.out c3').message).toContain('番地の形');
  });

  test('turns down a box with only one corner', () => {
    expect(noteProblem('box a1').message).toContain('box は');
  });

  test('turns down a colour outside the palette', () => {
    expect(noteProblem('box a1 c3 rainbow').message).toContain('注釈の色');
  });
});

describe('parseNoteLine の arrow', () => {
  test('reads an arrow drawn between two targets', () => {
    expect(noteOf('arrow a5 R1')).toEqual({ kind: 'arrow', from: 'a5', to: 'R1', color: 'red', line: 2 });
  });

  // 起点も終点も、印と同じく部品 ID か番地。どちらかは circuit.ts が決める。
  test('leaves both ends as written', () => {
    expect(noteOf('arrow C1 b3')).toMatchObject({ from: 'C1', to: 'b3' });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('arrow a5 R1 green')).toMatchObject({ color: 'green' });
  });

  test('turns down an arrow with only one end', () => {
    expect(noteProblem('arrow R1').message).toContain('arrow は');
  });

  test('turns down an end that could be neither an id nor a cell', () => {
    expect(noteProblem('arrow U1.out R1').message).toContain('部品 ID にも番地にも');
  });

  test('turns down a colour outside the palette', () => {
    expect(noteProblem('arrow a5 R1 rainbow').message).toContain('注釈の色');
  });
});

describe('parseNoteText', () => {
  test('reads text written at a cell', () => {
    expect(textNoteOf('text b1', 'ここで分圧する')).toEqual({
      kind: 'text',
      at: { row: 1, col: 0 },
      text: 'ここで分圧する',
      color: null,
      size: 'normal',
      align: 'left',
      bold: false,
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

  // 表を素の `[名前]` で引くと、Object.prototype にある名前が当たってしまう。
  // 書き方でない値を、そのまま図の下の帯に出すことになる。
  test('treats a name from Object.prototype as an unknown kind', () => {
    const message = textNoteProblem('toString a1', 'ここ').message;

    expect(message).toContain('知りません');
    expect(message).not.toContain('native code');
  });

  // `- box a1: c3` は YAML がマップとして読む。知っている種類なのに
  // 「種類を知りません」と返すと、直す場所が分からない。
  test('shows how to write the other kinds when they are written with text', () => {
    for (const kind of ['box', 'arrow', 'source']) {
      const message = textNoteProblem(`${kind} a1`, 'c3').message;

      expect(message).toContain(`${kind} は`);
      expect(message).not.toContain('知りません');
    }
  });
});

describe('parseNoteText の見た目', () => {
  test('reads the size when it is written', () => {
    expect(textNoteOf('text b1 huge', 'ここ')).toMatchObject({ size: 'huge' });
  });

  test('reads the alignment when it is written', () => {
    expect(textNoteOf('text b1 right', 'ここ')).toMatchObject({ align: 'right' });
  });

  test('reads bold when it is written', () => {
    expect(textNoteOf('text b1 bold', 'ここ')).toMatchObject({ bold: true });
  });

  // 語ごとに読む場所を決めていないので、書いた順に縛られない。
  test('takes the words in any order', () => {
    const written = textNoteOf('text b1 bold center blue tiny', 'ここ');
    const reordered = textNoteOf('text b1 tiny blue center bold', 'ここ');

    expect(written).toEqual(reordered);
    expect(written).toMatchObject({ color: 'blue', size: 'tiny', align: 'center', bold: true });
  });

  test('turns down a word that is neither a colour nor a look', () => {
    expect(textNoteProblem('text b1 enormous', 'ここ').message).toContain('注釈の言葉');
  });

  // 二重に書かれたら、後に書いたほうが黙って勝つのではなく理由を返す。
  test('turns down a size written twice', () => {
    expect(textNoteProblem('text b1 tiny huge', 'ここ').message).toContain('二重');
  });

  test('turns down a colour written twice', () => {
    expect(textNoteProblem('text b1 red blue', 'ここ').message).toContain('二重');
  });

  test('turns down an alignment written twice', () => {
    expect(textNoteProblem('text b1 left right', 'ここ').message).toContain('二重');
  });

  test('turns down bold written twice', () => {
    expect(textNoteProblem('text b1 bold bold', 'ここ').message).toContain('二重');
  });

  test('names the words that can be written', () => {
    const message = textNoteProblem('text b1 enormous', 'ここ').message;

    expect(message).toContain('huge');
    expect(message).toContain('center');
    expect(message).toContain('bold');
    expect(message).toContain('blue');
  });
});

describe('parseNoteLine の source', () => {
  test('reads a note that writes the fence out', () => {
    expect(noteOf('source a6')).toEqual({
      kind: 'source',
      at: { row: 0, col: 5 },
      color: null,
      size: 'normal',
      align: 'left',
      bold: false,
      leading: null,
      line: 2,
    });
  });

  test('reads the colour when it is written', () => {
    expect(noteOf('source a6 blue')).toMatchObject({ color: 'blue' });
  });

  // 書き出しは長くなりがちなので、小さく組めることに実利がある。
  test('takes the same looks the text notes take', () => {
    expect(noteOf('source a6 tiny bold')).toMatchObject({ size: 'tiny', bold: true });
  });

  test('turns down a place that is not a cell', () => {
    expect(noteProblem('source z0').message).toContain('番地の形');
  });

  test('turns down a word that is neither a colour nor a look', () => {
    expect(noteProblem('source a6 blue extra').message).toContain('注釈の言葉');
  });

  test('reads the leading when it is written', () => {
    expect(noteOf('source a6 tight')).toMatchObject({ leading: 'tight' });
    expect(noteOf('source a6 loose')).toMatchObject({ leading: 'loose' });
  });

  // 語ごとに読む場所を決めていないので、行送りも順を選ばない。
  test('takes the leading in any order among the other words', () => {
    expect(noteOf('source a6 tight blue tiny')).toMatchObject({
      leading: 'tight', color: 'blue', size: 'tiny',
    });
  });

  test('turns down a leading written twice', () => {
    expect(noteProblem('source a6 tight loose').message).toContain('二重');
  });

  test('names the leading among the words it knows', () => {
    const message = noteProblem('source a6 nope').message;

    expect(message).toContain('tight');
    expect(message).toContain('loose');
  });
});

// 行送りは何行も並ぶものにしか意味がない。字 1 行の注釈や印に書いても効かないので、
// 黙って捨てずに、どこに書けるかを添えて返す。
describe('行送りの語が書ける場所', () => {
  test('turns the leading down on a one-line text note', () => {
    const message = textNoteProblem('text b1 tight', 'ここ').message;

    expect(message).toContain('source');
  });

  test('turns the leading down on a mark', () => {
    for (const line of ['circle R1 tight', 'box a1 c3 loose', 'arrow a1 R1 tight']) {
      expect(noteProblem(line).message).toContain('source');
    }
  });

  test('does not offer the leading to a note that cannot take it', () => {
    expect(textNoteProblem('text b1 nope', 'ここ').message).not.toContain('tight');
  });
});

describe('addresses between the cells', () => {
  test('places a part on an address written between two cells', () => {
    expect(partOf('resistor a_1.5 a_3.5 10k')).toMatchObject({
      from: { row: 0, col: 0.5 },
      to: { row: 0, col: 2.5 },
    });
  });

  test('reads a wire that ends between two cells', () => {
    expect(wireOf('a.5_1 -- a.5_3')).toEqual({
      from: { kind: 'cell', address: { row: 0.5, col: 0 } },
      to: { kind: 'cell', address: { row: 0.5, col: 2 } },
      operator: '--',
      line: 5,
    });
  });

  test('still reads a pin written with a number as a pin, not as an address', () => {
    expect(wireOf('U1.5 -| e4')).toMatchObject({ from: { kind: 'pin', part: 'U1', pin: '5' } });
    expect(wireOf('Q1.B -- c3')).toMatchObject({ from: { kind: 'pin', part: 'Q1', pin: 'B' } });
  });

  test('points to the separator when a decimal is written without one', () => {
    expect(messageOf('resistor a1.5 a3').message).toContain('a_1.5');
  });

  test('points to the decimal when a fraction is written', () => {
    expect(messageOf('resistor a.1/4_2 a3').message).toContain('.25');
  });

  test('points to the plain spelling when the separator carries no decimal', () => {
    expect(messageOf('resistor a_1 a3').message).toContain('a1');
  });
});

describe('交点の間の番地を書ける場所', () => {
  const noteOf = (text: string) => {
    const result = parseNoteLine(text, 3);
    if (!result.ok) throw new Error(`読めませんでした: ${result.error.message}`);
    return result.value;
  };

  test('circles a cell between the crossings, which is an address like any other', () => {
    expect(noteOf('circle a_1.5')).toMatchObject({ kind: 'circle', target: 'a_1.5' });
  });

  test('points an arrow from and to a cell between the crossings', () => {
    expect(noteOf('arrow a.5_1 R1')).toMatchObject({ kind: 'arrow', from: 'a.5_1', to: 'R1' });
  });

  test('still refuses a target that is neither a part nor an address', () => {
    const result = parseNoteLine('circle a$1', 3);

    expect(result.ok).toBe(false);
  });
});

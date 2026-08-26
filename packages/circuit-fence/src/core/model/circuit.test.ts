import { describe, expect, test } from 'vitest';
import { parseFence } from '../parser/parseFence.ts';
import { formatAddress } from './address.ts';
import { buildCircuit, resolveNoteTarget, wireContacts } from './circuit.ts';

const build = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return buildCircuit(doc);
};

describe('buildCircuit', () => {
  test('carries the parts and wires through when everything is readable', () => {
    const { circuit, errors } = build(
      'parts:',
      '  IN: port a1',
      '  R1: resistor a1 a3 10k',
      'wires:',
      '  - a3 -- a4',
    );

    expect(errors).toEqual([]);
    expect(circuit.parts).toHaveLength(2);
    expect(circuit.wires).toHaveLength(1);
  });

  test('points a value written in Japanese at the tex route instead of dropping it silently', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3 抵抗');

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('.tex');
    // 値だけを落として部品は描く (読めたところは捨てない)。
    expect(circuit.parts).toMatchObject([{ id: 'R1', value: null }]);
  });

  test('keeps a value written in Japanese when the target is the tex it points at', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3 抵抗\n');
    const { circuit, errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors).toEqual([]);
    expect(circuit.parts).toMatchObject([{ id: 'R1', value: '抵抗' }]);
  });

  test('points at the tex route only for text that route can actually draw', () => {
    // どちらでも通らない字を .tex に送っても直らない。使える字のほうを伝える。
    const { errors } = build('parts:', '  R1: resistor a1 a3 한글');

    expect(errors[0]?.message).not.toContain('--emit-tex');
    expect(errors[0]?.message).toContain('使えない文字');
  });

  test('takes either spelling of the unit signs a datasheet may use', () => {
    // µ も Ω も見た目が同じ字が 2 つある。片方だけ通すと目で見て直せない。
    for (const value of ['10µF', '10μF', '10kΩ', '10kΩ']) {
      const { errors } = build('parts:', `  R1: resistor a1 a3 ${value}`);

      expect(errors[0]?.message).toContain('--emit-tex');
    }
  });

  test('names the characters latex accepts, not the ones the fence accepts', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3 한글\n');
    const { errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors[0]?.message).toContain('日本語');
  });

  test('still refuses TeX syntax in a value when the target is latex', () => {
    // 通す字を広げても、任意の TeX を書かせないという約束は動かさない。
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3 \\draw\n');
    const { circuit, errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors[0]?.line).toBe(2);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('points at the line of the part it overlaps without writing it into the text', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3', '  R2: resistor a1 a3');

    // 相手の行を本文に埋めると、Markdown の行へずらすときに置き去りになる。
    expect(errors[0]).toMatchObject({ line: 3, related: 2 });
    expect(errors[0]?.message).not.toContain('行目');
  });

  test('leaves no hole in the message when nothing of the value can be shown', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3 抵抗');

    // safeToken は日本語を落とすので、そのまま挟むと「値  は…」と穴が空く。
    expect(errors[0]?.message).not.toMatch(/ {2}/u);
    expect(errors[0]?.message).toContain('部品 R1: 値はプレビューの TeX');
  });

  test('rejects a value that would let the writer build their own TeX', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3 \\draw');

    expect(errors[0]?.line).toBe(2);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('keeps a value made of the characters a schematic uses', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3 4.7k');

    expect(errors).toEqual([]);
    expect(circuit.parts).toMatchObject([{ value: '4.7k' }]);
  });

  test('reports every part whose value could not be drawn', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3 抵抗', '  R2: resistor b1 b3 抵抗');

    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.line)).toEqual([2, 3]);
  });

  test('keeps a part placed along a slant', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 c4');

    expect(errors).toEqual([]);
    expect(circuit.parts).toHaveLength(1);
  });
});

describe('wireContacts', () => {
  const contacts = (...rows: string[]) => {
    const { circuit } = build(...rows);
    return wireContacts(circuit).map((contact) => formatAddress(contact.cell));
  };

  test('finds a wire end that lands in the middle of another wire', () => {
    // b1 -- b5 の途中 (b3) に、もう 1 本の端が乗る = T 字。
    expect(contacts('parts:', '  R1: resistor a1 a3', 'wires:', '  - b1 -- b5', '  - a3 -- b3')).toContain('b3');
  });

  test('finds a part terminal that lands in the middle of a wire', () => {
    expect(contacts('parts:', '  R1: resistor b3 d3', 'wires:', '  - b1 -- b5')).toContain('b3');
  });

  test('leaves a plain crossing alone, which is not a connection', () => {
    // 縦と横が交わるだけで、どちらの端でもない。
    expect(contacts('parts:', '  R1: resistor a1 a3', 'wires:', '  - b1 -- b5', '  - a3 -- d3')).toEqual([]);
  });

  test('does not count an end that meets another end', () => {
    // 端どうしが同じ番地で会うのは、途中に乗ったのではない。
    expect(contacts('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -- a5')).toEqual([]);
  });

  test('follows both legs of a bent wire', () => {
    // a1 -| c5 は a5 で折れる。縦の脚 (a5〜c5) の途中 b5 に端が乗る。
    expect(contacts('parts:', '  R1: resistor b3 b5', 'wires:', '  - a1 -| c5')).toContain('b5');
  });

  test('finds an end that lands on a slanted wire', () => {
    expect(contacts('parts:', '  R1: resistor a5 b2', 'wires:', '  - a1 -- c3')).toContain('b2');
  });
});

describe('buildCircuit のピン参照', () => {
  test('accepts a pin the part actually has', () => {
    const { errors } = build(
      'parts:',
      '  Q1: npn c3',
      '  R1: resistor a1 a3',
      'wires:',
      '  - Q1.B -- a3',
    );

    expect(errors).toEqual([]);
  });

  test('accepts the anchor name spelled out', () => {
    const { errors } = build('parts:', '  Q1: npn c3', 'wires:', '  - Q1.collector -- a1');

    expect(errors).toEqual([]);
  });

  test('reports a pin on a part that was never written', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3', 'wires:', '  - U9.out -- a3');

    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('U9');
  });

  test('reports a pin the part does not have, and says which it does', () => {
    const { errors } = build('parts:', '  Q1: npn c3', 'wires:', '  - Q1.gate -- a1');

    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('gate');
    expect(errors[0]?.message).toContain('base');
  });

  test('reports a pin asked of a part that has none', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3', 'wires:', '  - R1.out -- b1');

    expect(errors[0]?.message).toContain('R1');
  });

  test('drops the wire it could not resolve but keeps the rest', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor a1 a3',
      'wires:',
      '  - U9.out -- a3',
      '  - a1 -- b1',
    );

    expect(errors).toHaveLength(1);
    expect(circuit.wires).toHaveLength(1);
  });
});

describe('足のある配線の上に見える端', () => {
  const warn = (...rows: string[]) => build(...rows).notices.map((notice) => notice.message);

  test('says it cannot judge a touch on a wire that runs to a pin', () => {
    // U1.out -- c9 は c7 の上を通って見えるが、足の位置は格子の上に無いので
    // つながっているかを決められない。黙って別のネットにしない。
    const messages = warn(
      'parts:',
      '  U1: opamp c5',
      '  R1: resistor d7 e7',
      'wires:',
      '  - U1.out -- c9',
      '  - d7 -- c7',
    );

    expect(messages.some((message) => message.includes('c7'))).toBe(true);
  });

  test('says nothing when no end sits on that line', () => {
    const { errors, notices } = build(
      'parts:',
      '  U1: opamp c5',
      '  R1: resistor e1 e3',
      'wires:',
      '  - U1.out -- c9',
    );

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says nothing once the connection is written as a shared end', () => {
    const { errors, notices } = build(
      'parts:',
      '  U1: opamp c5',
      '  R1: resistor d7 e7',
      'wires:',
      '  - U1.out -- c7',
      '  - c7 -- c9',
      '  - d7 -- c7',
    );

    expect([...errors, ...notices]).toEqual([]);
  });
});

describe('重なりの検出', () => {
  const messages = (...rows: string[]) => build(...rows).errors.map((error) => error.message);

  test('reports two parts drawn on the same pair of cells', () => {
    // Lcapy はここを黙って重ねて描く。見て気づくしかなくなる。
    const found = messages('parts:', '  R1: resistor a1 a3', '  R2: resistor a1 a3');

    expect(found.some((message) => message.includes('R1') && message.includes('R2'))).toBe(true);
  });

  test('reports it however the two were written round', () => {
    const found = messages('parts:', '  R1: resistor a1 a3', '  R2: resistor a3 a1');

    expect(found).toHaveLength(1);
  });

  test('reports two symbols placed on the same cell', () => {
    const found = messages('parts:', '  G1: ground c3', '  G2: ground c3');

    expect(found.some((message) => message.includes('G1'))).toBe(true);
  });

  test('leaves parts that only share one end alone, which is how they connect', () => {
    expect(messages('parts:', '  R1: resistor a1 a3', '  R2: resistor a3 a5')).toEqual([]);
  });

  test('leaves a symbol sitting on the end of a part alone', () => {
    expect(messages('parts:', '  R1: resistor a1 c3', '  G1: ground c3')).toEqual([]);
  });

  test('points at the line of the one written later', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3', '  R2: resistor a1 a3');

    expect(errors[0]?.line).toBe(3);
  });

  test('keeps both parts, since which one is wrong is the writer to say', () => {
    const { circuit } = build('parts:', '  R1: resistor a1 a3', '  R2: resistor a1 a3');

    expect(circuit.parts).toHaveLength(2);
  });
});

describe('レビューで見つかった穴', () => {
  test('checks the value of a multi terminal part too', () => {
    // 1 つでも素通りすると、そこから任意の TeX を書けてしまう。
    const { circuit, errors } = build('parts:', '  Q1: npn c3 }\\input{x}');

    expect(errors).toHaveLength(1);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('points a multi terminal value in Japanese at the tex route', () => {
    const { errors } = build('parts:', '  Q1: npn c3 抵抗');

    expect(errors[0]?.message).toContain('.tex');
  });

  test('refuses an orientation on a part that has none', () => {
    const { circuit, errors } = build('parts:', '  Q1: npn c3 +up');

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('opamp');
    expect(circuit.parts).toMatchObject([{ orientation: null }]);
  });

  test('settles every spelling of a pin on one anchor', () => {
    const { circuit } = build(
      'parts:',
      '  Q1: npn c3',
      '  R1: resistor a1 a3',
      'wires:',
      '  - Q1.B -- a3',
      '  - Q1.base -- a1',
    );

    expect(circuit.wires.map((wire) => wire.from)).toMatchObject([
      { kind: 'pin', pin: 'base' },
      { kind: 'pin', pin: 'base' },
    ]);
  });

  test('rejects a wire from a pin back to the same pin', () => {
    const { errors } = build('parts:', '  Q1: npn c3', 'wires:', '  - Q1.B -- Q1.base');

    expect(errors[0]?.message).toContain('同じ');
  });

  test('does not treat the cell a symbol sits on as a wire end', () => {
    // 記号の下を線が通っただけで T 字にはならない。
    const { circuit } = build(
      'parts:',
      '  Q1: npn c3',
      '  R1: resistor c1 a1',
      'wires:',
      '  - c1 -- c5',
    );

    expect(wireContacts(circuit)).toEqual([]);
  });

  test('reports two parts that lie along the same line and overlap', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a5', '  R2: resistor a1 a3');

    expect(errors[0]?.message).toContain('重なって');
  });

  test('leaves two parts in a row alone, which is how they connect', () => {
    expect(build('parts:', '  R1: resistor a1 a3', '  R2: resistor a3 a5').errors).toEqual([]);
  });

  test('keeps the netlist the same however the wires were laid out in YAML', () => {
    const block = build('parts:', '  R1: resistor b3 d3', 'wires:', '  - b1 -- b5', '  - a3 -- e3');
    const flow = build('parts:', '  R1: resistor b3 d3', 'wires: [b1 -- b5, a3 -- e3]');

    expect(wireContacts(flow.circuit)).toHaveLength(wireContacts(block.circuit).length);
  });
});

describe('部品の体の上に乗った端', () => {
  test('says an end landing on a part body is not a connection', () => {
    const { notices } = build('parts:', '  R1: resistor a1 a5', '  R2: resistor c3 e3', 'wires:', '  - c3 -- a3');

    expect(notices.some((notice) => notice.message.includes('R1'))).toBe(true);
  });

  test('leaves an end at the part end alone, which is how they connect', () => {
    const { errors, notices } = build('parts:', '  R1: resistor a1 a5', 'wires:', '  - a5 -- c5');

    expect([...errors, ...notices]).toEqual([]);
  });
});

describe('2 端子部品の足', () => {
  test('resolves the wiper of a potentiometer', () => {
    const { circuit, errors } = build(
      'parts:',
      '  P1: potentiometer a1 a3 10k',
      'wires:',
      '  - P1.w -- c2',
    );

    expect(errors).toEqual([]);
    expect(circuit.wires[0]?.from).toEqual({ kind: 'pin', part: 'P1', pin: 'wiper' });
  });

  test('says so when the part has no legs at all', () => {
    const { errors } = build('parts:', '  R1: resistor a1 a3', 'wires:', '  - R1.w -- c2');

    expect(errors.map((error) => error.message)).toEqual([
      '部品 R1 (resistor) に足の名前はありません',
    ]);
  });

  test('lists the legs it does have when the name is wrong', () => {
    const { errors } = build('parts:', '  T1: triac a1 a3', 'wires:', '  - T1.k -- c2');

    expect(errors[0]?.message).toBe('T1 に足 k はありません (g / gate)');
  });
});

describe('注釈の指し先', () => {
  test('finds the part the note points at', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3', 'notes:', '  - circle R1');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('reads a target that is not a part as a cell', () => {
    const byId = new Map();
    expect(resolveNoteTarget('b3', byId)).toEqual({ kind: 'cell', address: { row: 1, col: 2 } });
  });

  // 番地は大小どちらでも書けるので、`C1` は番地 c1 とも読めてしまう。
  // 印を付けたくなるのはたいてい部品なので、部品を先に見る。
  test('lets the part win when an id could also be read as a cell', () => {
    const { circuit } = build('parts:', '  C1: capacitor a1 a3', 'notes:', '  - circle C1');
    const anchor = resolveNoteTarget('C1', new Map(circuit.parts.map((part) => [part.id, part])));

    expect(anchor).toMatchObject({ kind: 'part' });
  });

  test('drops a note that points at nothing and says which line', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3', 'notes:', '  - circle Rload');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('注釈の指す先');
    expect(errors[0]?.line).toBe(4);
  });

  // `R9` は番地 r9 とも読める。部品が無ければ番地として通る (印が図の外に出るので
  // 書いた人には見える)。ここを黙って落とすと、番地への印が書けなくなる。
  test('reads an id shaped like a cell as a cell when no such part exists', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3', 'notes:', '  - circle R9');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('keeps text notes, which point at a cell that need not exist', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3', 'notes:', '  - text z9: ここ');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });
});

describe('フェンスの書き出し (source)', () => {
  test('keeps the note when every line can be drawn', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor a1 a3', 'notes:', '  - source b1');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  // 書き出すのは書き手の書いた YAML そのもの。TeX が記法として読む字が
  // 混じることがあるので、書き出しだけ落として**その字のある行**を返す。
  test('drops the note and points at the line TeX could not be trusted with', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor a1 a3',
      '# \\usepackage{}',
      'notes:',
      '  - source b1',
    );

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('書き出せない字');
  });

  test('draws the circuit even when the fence cannot be written out', () => {
    const { circuit } = build('parts:', '  R1: resistor a1 a3', '# $x$', 'notes:', '  - source b1');

    expect(circuit.parts).toHaveLength(1);
  });
});

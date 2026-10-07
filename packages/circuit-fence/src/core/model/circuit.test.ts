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
      '  IN: port 1,1',
      '  R1: resistor 1,1 3,1 10k',
      'wires:',
      '  - 3,1 -- 4,1',
    );

    expect(errors).toEqual([]);
    expect(circuit.parts).toHaveLength(2);
    expect(circuit.wires).toHaveLength(1);
  });

  test('points a value written in Japanese at the tex route instead of dropping it silently', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1 抵抗');

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('.tex');
    // 値だけを落として部品は描く (読めたところは捨てない)。
    expect(circuit.parts).toMatchObject([{ id: 'R1', value: null }]);
  });

  test('keeps a value written in Japanese when the target is the tex it points at', () => {
    const { doc } = parseFence('parts:\n  R1: resistor 1,1 3,1 抵抗\n');
    const { circuit, errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors).toEqual([]);
    expect(circuit.parts).toMatchObject([{ id: 'R1', value: '抵抗' }]);
  });

  test('points at the tex route only for text that route can actually draw', () => {
    // どちらでも通らない字を .tex に送っても直らない。使える字のほうを伝える。
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1 한글');

    expect(errors[0]?.message).not.toContain('--emit-tex');
    expect(errors[0]?.message).toContain('使えない文字');
  });

  test('takes either spelling of the unit signs a datasheet may use', () => {
    // µ も Ω も見た目が同じ字が 2 つある。片方だけ通すと目で見て直せない。
    for (const value of ['10µF', '10μF', '10kΩ', '10kΩ']) {
      const { errors } = build('parts:', `  R1: resistor 1,1 3,1 ${value}`);

      expect(errors[0]?.message).toContain('--emit-tex');
    }
  });

  test('names the characters latex accepts, not the ones the fence accepts', () => {
    const { doc } = parseFence('parts:\n  R1: resistor 1,1 3,1 한글\n');
    const { errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors[0]?.message).toContain('日本語');
  });

  test('still refuses TeX syntax in a value when the target is latex', () => {
    // 通す字を広げても、任意の TeX を書かせないという約束は動かさない。
    const { doc } = parseFence('parts:\n  R1: resistor 1,1 3,1 \\draw\n');
    const { circuit, errors } = buildCircuit(doc!, { target: 'latex' });

    expect(errors[0]?.line).toBe(2);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('points at the line of the part it overlaps without writing it into the text', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,1 3,1');

    // 相手の行を本文に埋めると、Markdown の行へずらすときに置き去りになる。
    expect(errors[0]).toMatchObject({ line: 3, related: 2 });
    expect(errors[0]?.message).not.toContain('行目');
  });

  test('leaves no hole in the message when nothing of the value can be shown', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1 抵抗');

    // safeToken は日本語を落とすので、そのまま挟むと「値  は…」と穴が空く。
    expect(errors[0]?.message).not.toMatch(/ {2}/u);
    expect(errors[0]?.message).toContain('部品 R1: 値はプレビューの TeX');
  });

  test('rejects a value that would let the writer build their own TeX', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1 \\draw');

    expect(errors[0]?.line).toBe(2);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('keeps a value made of the characters a schematic uses', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1 4.7k');

    expect(errors).toEqual([]);
    expect(circuit.parts).toMatchObject([{ value: '4.7k' }]);
  });

  test('reports every part whose value could not be drawn', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1 抵抗', '  R2: resistor 1,2 3,2 抵抗');

    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.line)).toEqual([2, 3]);
  });

  test('keeps a part placed along a slant', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 4,3');

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
    expect(contacts('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 1,2 -- 5,2', '  - 3,1 -- 3,2')).toContain('3,2');
  });

  test('finds a part terminal that lands in the middle of a wire', () => {
    expect(contacts('parts:', '  R1: resistor 3,2 3,4', 'wires:', '  - 1,2 -- 5,2')).toContain('3,2');
  });

  test('leaves a plain crossing alone, which is not a connection', () => {
    // 縦と横が交わるだけで、どちらの端でもない。
    expect(contacts('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 1,2 -- 5,2', '  - 3,1 -- 3,4')).toEqual([]);
  });

  test('does not count an end that meets another end', () => {
    // 端どうしが同じ番地で会うのは、途中に乗ったのではない。
    expect(contacts('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -- 5,1')).toEqual([]);
  });

  test('follows both legs of a bent wire', () => {
    // a1 -| c5 は a5 で折れる。縦の脚 (a5〜c5) の途中 b5 に端が乗る。
    expect(contacts('parts:', '  R1: resistor 3,2 5,2', 'wires:', '  - 1,1 -| 5,3')).toContain('5,2');
  });

  test('finds an end that lands on a slanted wire', () => {
    expect(contacts('parts:', '  R1: resistor 5,1 2,2', 'wires:', '  - 1,1 -- 3,3')).toContain('2,2');
  });
});

describe('buildCircuit のピン参照', () => {
  test('accepts a pin the part actually has', () => {
    const { errors } = build(
      'parts:',
      '  Q1: npn 3,3',
      '  R1: resistor 1,1 3,1',
      'wires:',
      '  - Q1.B -- 3,1',
    );

    expect(errors).toEqual([]);
  });

  test('accepts the anchor name spelled out', () => {
    const { errors } = build('parts:', '  Q1: npn 3,3', 'wires:', '  - Q1.collector -- 1,1');

    expect(errors).toEqual([]);
  });

  test('reports a pin on a part that was never written', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - U9.out -- 3,1');

    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('U9');
  });

  test('reports a pin the part does not have, and says which it does', () => {
    const { errors } = build('parts:', '  Q1: npn 3,3', 'wires:', '  - Q1.gate -- 1,1');

    expect(errors[0]?.line).toBe(4);
    expect(errors[0]?.message).toContain('gate');
    expect(errors[0]?.message).toContain('base');
  });

  test('reports a pin asked of a part that has none', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - R1.out -- 1,2');

    expect(errors[0]?.message).toContain('R1');
  });

  test('drops the wire it could not resolve but keeps the rest', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1',
      'wires:',
      '  - U9.out -- 3,1',
      '  - 1,1 -- 1,2',
    );

    expect(errors).toHaveLength(1);
    expect(circuit.wires).toHaveLength(1);
  });
});

describe('ピンのある配線の上に見える端', () => {
  const warn = (...rows: string[]) => build(...rows).notices.map((notice) => notice.message);

  test('says it cannot judge a touch on a wire that runs to a pin', () => {
    // U1.out -- c9 は c7 の上を通って見えるが、ピンの位置は格子の上に無いので
    // つながっているかを決められない。黙って別のネットにしない。
    const messages = warn(
      'parts:',
      '  U1: opamp 5,3',
      '  R1: resistor 7,4 7,5',
      'wires:',
      '  - U1.out -- 9,3',
      '  - 7,4 -- 7,3',
    );

    expect(messages.some((message) => message.includes('7,3'))).toBe(true);
  });

  test('says nothing when no end sits on that line', () => {
    const { errors, notices } = build(
      'parts:',
      '  U1: opamp 5,3',
      '  R1: resistor 1,5 3,5',
      'wires:',
      '  - U1.out -- 9,3',
    );

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says nothing once the connection is written as a shared end', () => {
    const { errors, notices } = build(
      'parts:',
      '  U1: opamp 5,3',
      '  R1: resistor 7,4 7,5',
      'wires:',
      '  - U1.out -- 7,3',
      '  - 7,3 -- 9,3',
      '  - 7,4 -- 7,3',
    );

    expect([...errors, ...notices]).toEqual([]);
  });
});

describe('注釈の指し先が部品 ID のとき', () => {
  test('takes the part and says nothing, since a part ID is never an address', () => {
    // 旧い綴りでは `C1` が番地 c1 とも読め、部品のほうを取ったと知らせていた。
    // 番地は数字で始まり `,` を含むので、もう取り違えようがない。
    const { errors, notices } = build(
      'parts:', '  C1: capacitor 1,1 3,1', '  R9: resistor 1,3 3,3', 'notes:', '  - circle C1', '  - arrow C1 1,3',
    );

    expect([...errors, ...notices]).toEqual([]);
  });
});

/**
 * 向きが書ける種類かどうかは**表で見る** (parts.ts の `orient`)。
 * 回転と反転を別の欄で見るのは、回せても反転すると字が鏡文字になる記号が
 * あるため (docs の実機の記録)。
 */
describe('書ける向きかどうか', () => {
  const errorsOf = (...rows: string[]) => build(...rows).errors.map((error) => error.message);

  test('turns a multi terminal part and a ground', () => {
    const { errors } = build('parts:', '  Q1: npn 3,3 r90', '  G1: ground 3,5 r180');

    expect(errors).toEqual([]);
  });

  test('mirrors a transistor, whose symbol carries no text', () => {
    expect(build('parts:', '  Q1: npn 3,3 mirror').errors).toEqual([]);
  });

  test('refuses to mirror a chip, naming the line', () => {
    // ピン番号も型番も鏡文字になる (実機で確認)。回転はできる。
    const { errors } = build('parts:', '  U1: dip8 3,3 mirror');

    expect(errors[0]?.message).toContain('mirror');
    expect(errors[0]?.line).toBe(2);
    expect(build('parts:', '  U1: dip8 3,3 r90').errors).toEqual([]);
  });

  test('refuses to turn a part whose upright pose is the meaning', () => {
    const messages = errorsOf('parts:', '  VCC: vcc 1,1 r90');

    expect(messages[0]).toContain('vcc');
    expect(messages).toHaveLength(1);
  });

  test('keeps the sign order to the op amp, as before', () => {
    expect(errorsOf('parts:', '  Q1: npn 3,3 +up')[0]).toContain('opamp');
    expect(build('parts:', '  U1: opamp 5,3 +up r90').errors).toEqual([]);
  });

  test('drops the turn it refused, so the drawing never sees it', () => {
    const { circuit } = build('parts:', '  U1: dip8 3,3 mirror');

    expect(circuit.parts[0]).toMatchObject({ turn: { rotate: 0, mirror: false } });
  });
});

describe('ピンへまっすぐ引いた配線', () => {
  const warn = (...rows: string[]) => build(...rows).notices.map((notice) => notice.message);

  test('says a -- into an off-centre pin comes in slanted', () => {
    // + は記号の中心線から外れた高さにあるので、まっすぐ引くと斜めに入る。
    const messages = warn('parts:', '  U1: opamp 5,3', 'wires:', '  - U1.+ -- 3,3');

    expect(messages.some((message) => message.includes('|-'))).toBe(true);
  });

  test('says nothing for a pin that sits on the symbol centre line', () => {
    // out は横の中心線に出るので、同じ行の番地へはまっすぐ引ける (04 の書き方)。
    const { errors, notices } = build('parts:', '  U1: opamp 5,3', 'wires:', '  - U1.out -- 7,3');

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says nothing for the vertical pins of a transistor', () => {
    const { errors, notices } = build(
      'parts:', '  Q1: npn 3,3', 'wires:', '  - Q1.C -- 3,1', '  - Q1.E -- 3,5', '  - Q1.B -- 1,3',
    );

    expect([...errors, ...notices]).toEqual([]);
  });

  test('turns the centre line with the symbol, so a rotated pin reads straight', () => {
    // r90 で base は左から**上**へ回るので、同じ列の番地からはまっすぐ入る。
    // 向きを見ずにピンの名前だけで決めると、正しく引いた線に口を出す。
    const { errors, notices } = build(
      'parts:', '  Q1: npn 5,3 r90', 'wires:', '  - Q1.B -- 5,1',
    );

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says a rotated pin slants when the wire keeps the old axis', () => {
    // 回す前ならまっすぐだった引き方。回したあとは斜めになる。
    const messages = warn('parts:', '  Q1: npn 5,3 r90', 'wires:', '  - Q1.B -- 1,3');

    expect(messages.some((message) => message.includes('|-'))).toBe(true);
  });

  test('turns the centre line for a mirrored symbol as well', () => {
    // 左右反転しても out は横の中心線のまま (辺は右から左へ移るだけ)。
    const { errors, notices } = build(
      'parts:', '  U1: opamp 5,3 mirror', 'wires:', '  - U1.out -- 3,3',
    );

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says a centre line pin still slants when the cell is off its axis', () => {
    // out は横の中心線に出るが、行が違えば斜めになる。ピンの名前だけでは決まらない。
    const messages = warn('parts:', '  U1: opamp 5,3', 'wires:', '  - U1.out -- 7,4');

    expect(messages).toHaveLength(1);
  });

  test('says nothing when the wire is drawn with a bend', () => {
    const { errors, notices } = build('parts:', '  U1: opamp 5,3', 'wires:', '  - U1.+ |- 3,3');

    expect([...errors, ...notices]).toEqual([]);
  });

  test('says nothing about the wiper of a two terminal part', () => {
    // ワイパーは記号の真上に出る。両端を番地で置く部品なので、
    // 中心線は置いた 1 つの交点では決まらない (当て推量で言わない)。
    const { errors, notices } = build(
      'parts:', '  P1: potentiometer 1,2 5,2', 'wires:', '  - P1.w -- 3,1',
    );

    expect([...errors, ...notices]).toEqual([]);
  });
});

describe('重なりの検出', () => {
  const messages = (...rows: string[]) => build(...rows).errors.map((error) => error.message);

  test('reports two parts drawn on the same pair of cells', () => {
    // Lcapy はここを黙って重ねて描く。見て気づくしかなくなる。
    const found = messages('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,1 3,1');

    expect(found.some((message) => message.includes('R1') && message.includes('R2'))).toBe(true);
  });

  test('reports it however the two were written round', () => {
    const found = messages('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 1,1');

    expect(found).toHaveLength(1);
  });

  test('reports two symbols placed on the same cell', () => {
    const found = messages('parts:', '  G1: ground 3,3', '  G2: ground 3,3');

    expect(found.some((message) => message.includes('G1'))).toBe(true);
  });

  test('leaves parts that only share one end alone, which is how they connect', () => {
    expect(messages('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1')).toEqual([]);
  });

  test('leaves a symbol sitting on the end of a part alone', () => {
    expect(messages('parts:', '  R1: resistor 1,1 3,3', '  G1: ground 3,3')).toEqual([]);
  });

  test('points at the line of the one written later', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,1 3,1');

    expect(errors[0]?.line).toBe(3);
  });

  test('keeps both parts, since which one is wrong is the writer to say', () => {
    const { circuit } = build('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 1,1 3,1');

    expect(circuit.parts).toHaveLength(2);
  });
});

describe('レビューで見つかった穴', () => {
  test('checks the value of a multi terminal part too', () => {
    // 1 つでも素通りすると、そこから任意の TeX を書けてしまう。
    const { circuit, errors } = build('parts:', '  Q1: npn 3,3 }\\input{x}');

    expect(errors).toHaveLength(1);
    expect(circuit.parts).toMatchObject([{ value: null }]);
  });

  test('points a multi terminal value in Japanese at the tex route', () => {
    const { errors } = build('parts:', '  Q1: npn 3,3 抵抗');

    expect(errors[0]?.message).toContain('.tex');
  });

  test('refuses an orientation on a part that has none', () => {
    const { circuit, errors } = build('parts:', '  Q1: npn 3,3 +up');

    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.message).toContain('opamp');
    expect(circuit.parts).toMatchObject([{ orientation: null }]);
  });

  test('settles every spelling of a pin on one anchor', () => {
    const { circuit } = build(
      'parts:',
      '  Q1: npn 3,3',
      '  R1: resistor 1,1 3,1',
      'wires:',
      '  - Q1.B -- 3,1',
      '  - Q1.base -- 1,1',
    );

    expect(circuit.wires.map((wire) => wire.from)).toMatchObject([
      { kind: 'pin', pin: 'base' },
      { kind: 'pin', pin: 'base' },
    ]);
  });

  test('rejects a wire from a pin back to the same pin', () => {
    const { errors } = build('parts:', '  Q1: npn 3,3', 'wires:', '  - Q1.B -- Q1.base');

    expect(errors[0]?.message).toContain('同じ');
  });

  test('does not treat the cell a symbol sits on as a wire end', () => {
    // 記号の下を線が通っただけで T 字にはならない。
    const { circuit } = build(
      'parts:',
      '  Q1: npn 3,3',
      '  R1: resistor 1,3 1,1',
      'wires:',
      '  - 1,3 -- 5,3',
    );

    expect(wireContacts(circuit)).toEqual([]);
  });

  test('reports two parts that lie along the same line and overlap', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 5,1', '  R2: resistor 1,1 3,1');

    expect(errors[0]?.message).toContain('重なって');
  });

  test('leaves two parts in a row alone, which is how they connect', () => {
    expect(build('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1').errors).toEqual([]);
  });

  test('keeps the netlist the same however the wires were laid out in YAML', () => {
    const block = build('parts:', '  R1: resistor 3,2 3,4', 'wires:', '  - 1,2 -- 5,2', '  - 3,1 -- 3,5');
    const flow = build('parts:', '  R1: resistor 3,2 3,4', 'wires: ["1,2 -- 5,2", "3,1 -- 3,5"]');

    expect(wireContacts(flow.circuit)).toHaveLength(wireContacts(block.circuit).length);
  });
});

describe('部品の体の上に乗った端', () => {
  test('says an end landing on a part body is not a connection', () => {
    const { notices } = build('parts:', '  R1: resistor 1,1 5,1', '  R2: resistor 3,3 3,5', 'wires:', '  - 3,3 -- 3,1');

    expect(notices.some((notice) => notice.message.includes('R1'))).toBe(true);
  });

  test('leaves an end at the part end alone, which is how they connect', () => {
    const { errors, notices } = build('parts:', '  R1: resistor 1,1 5,1', 'wires:', '  - 5,1 -- 5,3');

    expect([...errors, ...notices]).toEqual([]);
  });
});

describe('ピンのある線の上に見える交点', () => {
  const warn = (...rows: string[]) => build(...rows).notices.map((notice) => notice.message);
  const touched = (...rows: string[]) => warn(...rows).some((message) => message.includes('この線の上に見えます'));

  test('says it cannot tell when the leg sits on the symbol centre line', () => {
    // `out` は横の中心線に出るので、その線は交点の並びに乗る。c5 を通るのか
    // どうかは書き方でしか決まらない。
    expect(touched(
      'parts:', '  U1: opamp 3,3', '  G1: ground 5,3', '  R1: resistor 7,3 7,5',
      'wires:', '  - U1.out -- 7,3',
    )).toBe(true);
  });

  test('decides for itself when the leg is off the centre line', () => {
    // 実機で「判断できないか」と訊かれた回。**中心線から外れたピン**
    // (ボードの GP27) から出る辺は、記号の縁の半端な高さに出るので
    // 交点の並びに乗らない — どの交点も通らないと決められる。
    expect(touched(
      'parts:', '  U2: pico2-w 3,10', '  R2: resistor 7,10 7,12', '  R1: resistor 9,10 9,12',
      'wires:', '  - U2.GP26 -| 7,10', '  - U2.GP27 -| 9,10',
    )).toBe(false);
  });

  test('still looks at the leg that does run along the crossings', () => {
    // 折れた線の**交点の側の一辺**は並びに乗るので、そちらは見る。
    expect(touched(
      'parts:', '  U2: pico2-w 2,2', '  G1: ground 9,6', '  R1: resistor 9,8 9,10',
      'wires:', '  - U2.GP27 -| 9,8',
    )).toBe(true);
  });

  test('leaves the slanted case to the notice that already speaks', () => {
    // `--` で外れたピンへ引くと斜めに入る。重ねて言わない。
    const said = warn(
      'parts:', '  U2: pico2-w 3,10', '  R2: resistor 7,10 7,12', '  R1: resistor 9,10 9,12',
      'wires:', '  - U2.GP27 -- 9,10',
    );

    expect(said.some((message) => message.includes('斜めに入ります'))).toBe(true);
    expect(said.some((message) => message.includes('この線の上に見えます'))).toBe(false);
  });
});

describe('2 端子部品のピン', () => {
  test('resolves the wiper of a potentiometer', () => {
    const { circuit, errors } = build(
      'parts:',
      '  P1: potentiometer 1,1 3,1 10k',
      'wires:',
      '  - P1.w -- 2,3',
    );

    expect(errors).toEqual([]);
    expect(circuit.wires[0]?.from).toEqual({ kind: 'pin', part: 'P1', pin: 'wiper' });
  });

  test('says so when the part has no legs at all', () => {
    const { errors } = build('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - R1.w -- 2,3');

    expect(errors.map((error) => error.message)).toEqual([
      '部品 R1 (resistor) にピンの名前はありません',
    ]);
  });

  test('lists the legs it does have when the name is wrong', () => {
    const { errors } = build('parts:', '  T1: triac 1,1 3,1', 'wires:', '  - T1.k -- 2,3');

    expect(errors[0]?.message).toBe('T1 にピン k はありません (g / gate)');
  });
});

describe('注釈の指し先', () => {
  test('finds the part the note points at', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - circle R1');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('reads a target that is not a part as a cell', () => {
    const byId = new Map();
    expect(resolveNoteTarget('3,2', byId)).toEqual({ kind: 'cell', address: { row: 1, col: 2 } });
  });

  // 番地は大小どちらでも書けるので、`C1` は番地 c1 とも読めてしまう。
  // 印を付けたくなるのはたいてい部品なので、部品を先に見る。
  test('lets the part win when an id could also be read as a cell', () => {
    const { circuit } = build('parts:', '  C1: capacitor 1,1 3,1', 'notes:', '  - circle C1');
    const anchor = resolveNoteTarget('C1', new Map(circuit.parts.map((part) => [part.id, part])));

    expect(anchor).toMatchObject({ kind: 'part' });
  });

  test('drops a note that points at nothing and says which line', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - circle Rload');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('注釈の指す先');
    expect(errors[0]?.line).toBe(4);
  });

  // 旧い綴りでは `R9` が番地 r9 とも読めた。いまは番地ではないので、無い部品として断る。
  test('drops a part ID that names no part, even one the old spelling read as a cell', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - circle R9');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('注釈の指す先');
  });

  test('keeps text notes, which point at a cell that need not exist', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - text 9,26: ここ');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });
});

describe('フェンスの書き出し (source)', () => {
  test('keeps the note when every line can be drawn', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - source 1,2');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  // TeX が記法として読む字 (\ $ { } ^) は通すのではなく綴り直すので、
  // ラベルの数式 (`l=$\dot{E}$`) を書いたフェンスも書き出せる。
  test('keeps a source note even when the fence carries TeX notation', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1 l=$\\dot{E}$',
      'notes:',
      '  - source 1,2',
    );

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  // 書き出しに使えない字 (フォントに無い絵文字など) は今までどおり落として、
  // **その字のある行**を返す。
  test('drops the note and points at the line it cannot write out', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '# 😀',
      'notes:',
      '  - source 1,2',
    );

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.line).toBe(3);
    expect(errors[0]?.message).toContain('書き出せない字');
  });
});

describe('指し棒 (arrow) の指し先', () => {
  test('keeps an arrow whose ends both point at something', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - arrow 5,2 R1');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('drops an arrow whose start points at nothing and says which line', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - arrow Rload R1');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('注釈の指す先');
    expect(errors[0]?.line).toBe(4);
  });

  test('drops an arrow whose end points at nothing', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - arrow R1 Rload');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('注釈の指す先');
  });

  // 長さ 0 の矢印は向きが決まらない (どちらを向けても嘘になる)。
  test('drops an arrow that starts and ends at the same part', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - arrow R1 R1');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('起点と終点が同じ');
    expect(errors[0]?.line).toBe(4);
  });

  // 番地の名前 (`points:`) と番地は、書き方が違っても同じところを指す。
  test('drops an arrow whose ends are the same cell written differently', () => {
    const { circuit, errors } = build('points:', '  P: 2,2', 'parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - arrow 2,2 P');

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('起点と終点が同じ');
  });

  // 部品 ID と番地は書き方が違うだけで、同じ 1 点を指すことがある。
  // 字の見た目で比べると、この長さ 0 の矢印がすり抜ける。
  test('drops an arrow whose part and cell ends are the same place', () => {
    const { circuit, errors } = build(
      'parts:',
      '  G1: ground 3,3',
      'notes:',
      '  - arrow G1 3,3',
    );

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('起点と終点が同じ');
  });

  test('drops an arrow between two parts that sit on the same cell', () => {
    const { circuit, errors } = build(
      'parts:',
      '  G1: ground 3,3',
      '  IN: port 3,3',
      'notes:',
      '  - arrow G1 IN',
    );

    expect(circuit.notes).toEqual([]);
    expect(errors.some((error) => error.message.includes('起点と終点が同じ'))).toBe(true);
  });

  // 2 端子部品が指すのは記号の真ん中。その真ん中に当たる番地とは同じところ。
  test('drops an arrow from a two terminal part to the cell at its middle', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1',
      'notes:',
      '  - arrow R1 2,1',
    );

    expect(circuit.notes).toEqual([]);
    expect(errors[0]?.message).toContain('起点と終点が同じ');
  });

  test('keeps an arrow from a part to a cell that is somewhere else', () => {
    const { circuit, errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1',
      'notes:',
      '  - arrow R1 2,3',
    );

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('keeps a box, whose corners need not point at a part', () => {
    const { circuit, errors } = build('parts:', '  R1: resistor 1,1 3,1', 'notes:', '  - box 1,1 3,3');

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });
});

describe('番地の名前 (points)', () => {
  test('lets a note point at a named cell', () => {
    const { circuit, errors } = build(
      'points:', '  fb: 3,3',
      'parts:', '  R1: resistor 1,1 3,1',
      'notes:', '  - circle fb',
    );

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });

  test('carries the names through to the circuit', () => {
    const { circuit } = build('points:', '  fb: 3,3', 'parts:', '  R1: resistor 1,1 3,1');

    expect(circuit.points.get('fb')).toEqual({ row: 2, col: 2 });
  });

  test('resolves an arrow written with a name at both ends', () => {
    const { circuit, errors } = build(
      'points:', '  vin: 1,1', '  vout: 5,3',
      'parts:', '  R1: resistor 1,1 3,1',
      'notes:', '  - arrow vin vout',
    );

    expect(errors).toEqual([]);
    expect(circuit.notes).toHaveLength(1);
  });
});

describe('交点の間の番地とピンの読み分け', () => {
  // 番地から `.` が消えたので、ピン (`U1.5`) と番地が同じ綴りになる道はもう無い
  // (以前は `U_1.5` が番地 `u_1.5` としても読めたので、書き分けを頼んでいた)。
  test('points at the separator when a decimal is written without one in a wire', () => {
    const { errors } = build(
      'parts:',
      '  R1: resistor 1,1 3,1 1k',
      'wires:',
      '  - a1.5 -- 3,1',
    );

    expect(errors[0]?.message).toContain('1.5,1');
  });
});

describe('ic や DIP の箱のピンの線', () => {
  const said = (...rows: string[]) => build(...rows).notices.some((notice) => notice.message.includes('この線の上に見えます'));

  test('does not guess where the leg is from the anchor, because the box has many legs at other heights', () => {
    // ic のピン A0・A1 は箱の辺に並び、置いた交点 (アンカー) の行にはない。
    // アンカーで代用すると、別のピンの端子 (7,7) を「線の上に見える」と誤って言っていた。
    expect(said(
      'parts:', '  U1: ic 10,8 CD74HC283', '  A0: port 6,6', '  A1: port 6,7',
      'wires:', '  - U1.A0 -| 6,6', '  - U1.A1 -| 6,7',
    )).toBe(false);
  });

  test('still says it for a symbol with a few legs whose leg sits on the centre line', () => {
    expect(said(
      'parts:', '  U1: opamp 3,3', '  G1: ground 5,3', '  R1: resistor 7,3 7,5',
      'wires:', '  - U1.out -- 7,3',
    )).toBe(true);
  });
});

describe('7 セグなどの名前つきの箱のピンの線', () => {
  test('does not guess where the leg is from the anchor for a seven-segment box', () => {
    const notices = build(
      'parts:', '  DS1: seg7 12,8', '  P0: port 8,7', '  P1: port 8,8',
      'wires:', '  - DS1.a -| 8,7', '  - DS1.b -| 8,8',
    ).notices.map((notice) => notice.message);

    expect(notices.some((message) => message.includes('この線の上に見えます'))).toBe(false);
  });
});

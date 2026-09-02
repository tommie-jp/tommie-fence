import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { THEME } from './render/theme.ts';

describe('renderPerfboard', () => {
  test('returns a card instead of a drawing when the fence is empty', () => {
    const result = renderPerfboard('');

    expect(result.svg).toBe('');
    expect(result.errorHtml).toContain('perfboard-error-card');
    expect(result.errors[0]?.message).toContain('空');
  });

  test('reports a yaml syntax error with the line and the text of that line', () => {
    const result = renderPerfboard('parts:\n  R1: a: b: c\n');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.text).toBe('  R1: a: b: c');
  });

  test('normalises newlines without moving line numbers', () => {
    const result = renderPerfboard('parts:\r\n  R1: a: b: c\r\n');

    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[0]?.text).toBe('  R1: a: b: c');
  });

  test('does not throw on anything it is given', () => {
    for (const input of ['', ' ', 'board: 28x18', 'board: 0x0', '- 1', 'a: '.repeat(500)]) {
      expect(() => renderPerfboard(input)).not.toThrow();
    }
  });
  test('draws the board when the fence is well formed, and says nothing', () => {
    const result = renderPerfboard('board: 28x18\n');

    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('data-perfboard-fence');
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.errorHtml).toBe('');
  });

  test('draws one hole for every hole on the board', () => {
    const result = renderPerfboard('board: 6x4\n');

    expect(result.svg.match(/<circle /g)).toHaveLength(24);
  });

  test('puts an unreadable size through safeToken before naming it', () => {
    const result = renderPerfboard('board: "</span><img src=x>"\n');

    expect(result.errorHtml).not.toContain('<img');
    expect(result.errors[0]?.message).not.toContain('<');
  });

  test('cuts a size that is too long to name', () => {
    const result = renderPerfboard(`board: ${'x'.repeat(300)}\n`);

    expect(result.errors[0]?.message.length).toBeLessThan(200);
  });
  test('draws the parts on the board', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7 10k\n');

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('>R1 10k</text>');
    expect(result.svg).toContain('<line ');
  });

  test('keeps drawing the board when a part could not be read', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b99\n');

    // 板は描けている。読めなかったのは部品 1 つなので、帯で言う。
    expect(result.svg).toContain('<svg');
    expect(result.errorHtml).toContain('perfboard-errors');
    expect(result.errorHtml).not.toContain('perfboard-error-card');
    expect(result.errors[0]?.message).toContain('b99');
    expect(result.errors[0]?.text).toBe('  R1: resistor b3 b99');
  });
  test('lists what it could not read in the order it appears', () => {
    // 行順に並べないと、帯の打ち切り (8 件) で後ろの段の報告から先に消える。
    const result = renderPerfboard(
      'board: 10x6\nparts:\n  R1: resistor b3 b99\n  R2: resistr c1 c4\n',
    );

    expect(result.errors.map((e) => e.line)).toEqual([3, 4]);
  });
  test('draws the wires and derives the netlist', () => {
    const result = renderPerfboard([
      'board: 10x6',
      'points:',
      '  VCC: a1',
      'parts:',
      '  R1: resistor b3 b7 10k',
      '  D1: led c3 c7',
      'wires:',
      '  - b7 -- c3 red',
      '  - b3 -- VCC',
      '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.svg.match(/<line /g)?.length).toBeGreaterThanOrEqual(2);

    // R1.2 と D1.1 は配線 1 本で 1 つのネットになる。
    const joined = result.netlist.find((net) => net.refs.length === 2);
    expect([...(joined?.refs ?? [])].sort()).toEqual(['D1.1', 'R1.2']);
    // points: の名前がネットの名前になる。
    expect(result.netlist.map((net) => net.name)).toContain('VCC');
  });

  test('leaves every pin its own net when nothing is wired', () => {
    // **ここがブレッドボードとの分かれ目。** 全穴独立なので、挿しただけでは
    // 何もつながらない。
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7\n');

    expect(result.netlist).toHaveLength(2);
  });

  test('says nothing about a netlist when it could not read the fence', () => {
    expect(renderPerfboard('').netlist).toEqual([]);
  });
  test('does not hang on a row label no board could have', { timeout: 5000 }, () => {
    const long = `${'a'.repeat(300)}1`;

    expect(() => renderPerfboard(`board: 10x6\nwires:\n  - ${long} -- b3\n`)).not.toThrow();
    expect(() => renderPerfboard(`board: 10x6\npoints:\n  VCC: ${long}\n`)).not.toThrow();
    expect(() => renderPerfboard(`board: 10x6\nparts:\n  R1: resistor ${long} b3\n`)).not.toThrow();
  });

  test('gives a point that is off the board the line it was written on', () => {
    const result = renderPerfboard('board: 10x6\npoints:\n  VCC: z99\n');

    expect(result.errors[0]?.line).toBe(3);
    expect(result.errors[0]?.text).toBe('  VCC: z99');
  });
  test('says a pin no wire reaches is not connected, without calling the fence unreadable', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7\n');

    expect(result.errors).toEqual([]);
    // **部品ごとに 1 件**にまとめる (足 1 本ずつではない)。
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]?.line).toBe(3);
    expect(result.notices[0]?.message).toContain('R1.1');
    expect(result.notices[0]?.message).toContain('R1.2');
    expect(result.errorHtml).toContain('perfboard-notice');
    // 図は描けている。ERC が言うのは「そのとおりに組むと動かない」こと。
    expect(result.svg).toContain('<svg');
  });

  test('says nothing once every pin is wired', () => {
    const result = renderPerfboard([
      'board: 10x6',
      'points:',
      '  VCC: a1',
      '  GND: a10',
      'parts:',
      '  R1: resistor b3 b7',
      '  D1: led c3 c7',
      'wires:',
      '  - VCC -- b3',
      '  - b7 -- c3',
      '  - c7 -- GND',
      '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.errorHtml).toBe('');
  });

  test('says a part the wiring jumps over is shorted', () => {
    const result = renderPerfboard([
      'board: 10x6',
      'points:',
      '  VCC: a1',
      'parts:',
      '  R1: resistor b3 b7',
      'wires:',
      '  - VCC -- b3',
      '  - b3 -- b7',
      '',
    ].join('\n'));

    expect(result.notices.some((n) => n.message.includes('短絡') && n.line === 5)).toBe(true);
  });
  test('keeps the hard errors in the banner when ERC has a lot to say', () => {
    // お知らせが行順で先に来ると、帯の打ち切り (8 件) で**読めなかった行が
    // 消える**。直さないと図が出ないもののほうが先。
    const parts = Array.from({ length: 6 }, (_, i) => `  R${i}: resistor b${i + 1} c${i + 1}`);
    const result = renderPerfboard(
      ['board: 10x6', 'parts:', ...parts, 'wires:', '  - z99 -- b1', ''].join('\n'),
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errorHtml).toContain(result.errors[0]!.message);
  });

  test('does not run ERC while something could not be read', () => {
    // 落ちた配線を勘定に入れずに「つながっていません」と言うと、**書いた配線に
    // ついて書き忘れを指摘する**ことになる。
    const result = renderPerfboard([
      'board: 10x6',
      'parts:',
      '  R1: resistor b3 b7',
      'wires:',
      '  - b3 -- z99',
      '',
    ].join('\n'));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.notices.some((n) => n.message.includes('つながっていません'))).toBe(false);
    // 黙って掛けないのではなく、掛けていないと言う。
    expect(result.notices.some((n) => n.message.includes('ERC'))).toBe(true);
  });
  test('says two parts whose bodies cross cannot both be fitted', () => {
    const result = renderPerfboard([
      'board: 12x8',
      'points:',
      '  VCC: a1',
      'parts:',
      '  R1: resistor b3 b7',
      '  R2: resistor a5 c5',
      'wires:',
      '  - VCC -- b3',
      '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.notices.some((n) => n.message.includes('胴が重なっています') && n.line === 6)).toBe(true);
    // 図は描けている。言っているのは「実物では両方を挿せない」こと。
    expect(result.svg).toContain('<svg');
  });

  test('says an axial part will not go into two holes this close', () => {
    const result = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b4\n');

    expect(result.notices.some((n) => n.message.includes('間隔が狭すぎます') && n.line === 3)).toBe(true);
  });
  test('puts the title above the board and makes room for it', () => {
    const withTitle = renderPerfboard('board: 10x6\ntitle: 図01 ためし\n');
    const without = renderPerfboard('board: 10x6\n');

    expect(withTitle.svg).toContain('>図01 ためし</text>');
    expect(withTitle.errors).toEqual([]);
    // 題のぶんだけ画布が伸びる (板に重ねない)。
    expect(withTitle.svg.length).toBeGreaterThan(without.svg.length);
  });

  test('reports a second title: instead of letting the last one win', () => {
    const result = renderPerfboard('board: 10x6\ntitle: A\ntitle: B\n');

    expect(result.errors.some((e) => e.message.includes('2 つ') && e.line === 3)).toBe(true);
  });
  test('takes an empty title as no title, rather than reserving a blank band', () => {
    const empty = renderPerfboard('board: 10x6\ntitle: ""\n');
    const none = renderPerfboard('board: 10x6\n');

    expect(empty.svg).toBe(none.svg);
  });
  test('does not throw when two one-anchor parts overlap', () => {
    // **プレビューは try/catch を持たない。** ここで投げると Markdown 全体が
    // 真っ白になる。
    const fence = 'board: 12x8\nparts:\n  A: sip3 b3\n  B: sip3 b2\n';

    expect(() => renderPerfboard(fence)).not.toThrow();
    expect(renderPerfboard(fence).errors.length).toBeGreaterThan(0);
  });

  test('takes a part number that reads like an address on any part', () => {
    // 型番は番地とそっくり (`C1815` は c 行 1815 列)。**板に載らない桁数**なので
    // 足の書き間違いではありえない。
    for (const line of ['  Q1: transistor b3 b4 b5 C1815', '  Q2: transistor c3 c4 c5 A1015']) {
      expect(renderPerfboard(`board: 12x8\nparts:\n${line}\n`).errors).toEqual([]);
    }
  });

  test('still refuses an extra hole that could really be one', () => {
    const result = renderPerfboard('board: 12x8\nparts:\n  Q1: transistor b3 b4 b5 b6\n');

    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('says an ic has unwired pins once, not once per pin', () => {
    // DIP の余った足は普通のこと。1 本ずつ言うと**正しい図が毎回叱られる**。
    const result = renderPerfboard('board: 16x10\nparts:\n  U1: dip8 c4\n');
    const unwired = result.notices.filter((n) => n.message.includes('つながっていません'));

    expect(unwired).toHaveLength(1);
    expect(unwired[0]?.message).toContain('U1');
    expect(unwired[0]?.message).toContain('8');
  });

  test('draws a sip2 as a package, not as an axial part', () => {
    const svg = renderPerfboard('board: 12x8\nparts:\n  J1: sip2 b3\n').svg;

    // 箱で描く部品は胴の矩形が出る。2 本足の胴 (回転する g) にはならない。
    expect(svg).not.toContain('rotate(');
  });
  test('paints the theme that was written', () => {
    const dark = renderPerfboard('board: 10x6\nstyle: dark\n');

    expect(dark.errors).toEqual([]);
    expect(dark.svg).toContain('#1c4a31');
  });

  test('takes style as a mapping too', () => {
    const result = renderPerfboard('board: 10x6\nstyle:\n  theme: mono\n  stamp: true\n');

    expect(result.errors).toEqual([]);
    // 根の `data-perfboard-fence` は刻印を出さなくても必ずあるので、字のほうを見る。
    expect(result.svg).toMatch(/<text[^>]*>perfboard-fence /);
  });

  test('scales the canvas without moving the drawing', () => {
    const plain = renderPerfboard('board: 10x6\n');
    const wide = renderPerfboard('board: 10x6\nstyle:\n  width: 900\n');

    expect(wide.svg).toContain('width="900"');
    // viewBox は変わらない — 番地と実寸の対応が動かない。
    const box = /viewBox="([^"]+)"/.exec(plain.svg)?.[1];
    expect(wide.svg).toContain(`viewBox="${box}"`);
  });

  test('hides notices with debug off, but never the lines it could not read', () => {
    const fence = 'board: 10x6\nstyle:\n  debug: false\nparts:\n  R1: resistor b3 b7\n  R2: resistr c1 c4\n';
    const result = renderPerfboard(fence);

    expect(result.notices.length).toBeGreaterThan(0);
    // 数えるのはここまでで、伏せるのは出すところだけ。
    expect(result.errorHtml).not.toContain('perfboard-notice');
    expect(result.errorHtml).toContain('resistr');
  });

  test('names a style it cannot read, with the line', () => {
    const result = renderPerfboard('board: 10x6\nstyle: neon\n');

    expect(result.errors[0]?.message).toContain('neon');
    expect(result.errors[0]?.line).toBe(2);
  });
  test('draws the notes on top of everything', () => {
    const result = renderPerfboard([
      'board: 12x8',
      'points:',
      '  VCC: a1',
      'parts:',
      '  R1: resistor b3 b7 10k',
      'wires:',
      '  - VCC -- b3',
      'notes:',
      '  - mark b7 red',
      '  - box c2 e8 blue',
      '  - arrow g2 b7',
      '  - text f3 ここを直す',
      '',
    ].join('\n'));

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('>ここを直す</text>');
    expect(result.svg).toContain('<polyline');
    // 印は部品より後ろ (= 上) に出る。指したものが隠れると意味が無い。
    expect(result.svg.indexOf('R1 10k')).toBeLessThan(result.svg.indexOf('ここを直す'));
  });

  test('keeps drawing when a note cannot be placed', () => {
    const result = renderPerfboard('board: 10x6\nnotes:\n  - mark z99\n');

    expect(result.svg).toContain('<svg');
    expect(result.errors[0]?.line).toBe(3);
  });

  test('does not let a note into the netlist', () => {
    // 注釈は回路の一員ではない。
    const withNote = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7\nnotes:\n  - mark b3\n');
    const without = renderPerfboard('board: 10x6\nparts:\n  R1: resistor b3 b7\n');

    expect(withNote.netlist).toEqual(without.netlist);
  });

  test('escapes what a note says', () => {
    const result = renderPerfboard('board: 10x6\nnotes:\n  - text b3 "<img src=x>"\n');

    expect(result.svg).not.toContain('<img');
    expect(result.svg).toContain('&lt;img');
  });
});

describe('板の外の機器', () => {
  const fence = [
    'board: 12x8',
    'parts:',
    '  R1: resistor b3 b7 1k',
    '  BAT:',
    '    type: device',
    '    at: top',
    '    label: 電池 3V',
    '    pins: + -',
    'wires:',
    '  - BAT.+ -- b3',
    '  - BAT.- -- b7',
    '',
  ].join('\n');

  test('draws the device off the board and puts its pins on the netlist', () => {
    const result = renderPerfboard(fence);

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('電池 3V');
    expect(result.netlist.flatMap((net) => net.refs)).toContain('BAT.+');
  });

  test('joins the part to the device without drawing a wire onto the board', () => {
    const result = renderPerfboard(fence);
    const joined = result.netlist.find((net) => net.refs.includes('R1.1'));

    expect(joined?.refs).toContain('BAT.+');
  });

  test('says a device pin nothing reaches is unconnected', () => {
    const result = renderPerfboard(fence.replace('  - BAT.- -- b7\n', ''));
    const said = result.notices.map((one) => one.message).join('\n');

    expect(said).toContain('BAT.-');
    expect(said).toContain('板の外');
  });

  test('shows how to write a device when it is written on one line', () => {
    const result = renderPerfboard('board: 12x8\nparts:\n  BAT: device b3 b4\n');

    expect(result.errors[0]?.message).toContain('入れ子で書きます');
  });
});

describe('style: の報告の行', () => {
  test('points at the line the offending key was written on, with its caret', () => {
    // まとめて `style:` の行に返すと、3 行下の綴りを直しに行かせるうえ、
    // その行に無い語を探すことになってキャレットも消える。
    const result = renderPerfboard('board: 10x6\nstyle:\n  theme: mono\n  width: 5\n  bogus: 1\n');
    const width = result.errors.find((one) => one.message.includes('width'));
    const bogus = result.errors.find((one) => one.message.includes('bogus'));

    expect(width?.line).toBe(4);
    expect(bogus?.line).toBe(5);
    expect(bogus?.text).toBe('  bogus: 1');
  });

  test('reads on and off, which yaml itself hands over as text', () => {
    expect(renderPerfboard('board: 10x6\nstyle:\n  stamp: on\n').errors).toEqual([]);
    expect(renderPerfboard('board: 10x6\nstyle:\n  stamp: on\n').svg).toContain('perfboard-fence 0');
  });
});

describe('書き出し (notes: - source)', () => {
  const fence = 'board: 12x7\nparts:\n  R1: resistor b3 b6 1k\nwires:\n  - b3 -- b6\nnotes:\n  - source blue\n';

  test('writes the fence itself into the drawing, so it can be copied back', () => {
    const result = renderPerfboard(fence);

    expect(result.svg).toContain('R1: resistor b3 b6 1k');
    expect(result.svg).toContain('```perfboard');
    expect(result.errors).toEqual([]);
  });

  test('makes the drawing taller than the same fence without it', () => {
    const withSource = renderPerfboard(fence);
    const without = renderPerfboard(fence.replace('notes:\n  - source blue\n', ''));

    expect(withSource.svg.length).toBeGreaterThan(without.svg.length);
  });

  test('is not part of the circuit — it changes no net', () => {
    const withSource = renderPerfboard(fence);
    const without = renderPerfboard(fence.replace('notes:\n  - source blue\n', ''));

    expect(withSource.netlist).toEqual(without.netlist);
  });

  test('says so when a second one is written, rather than stacking the same listing twice', () => {
    const result = renderPerfboard(`${fence}  - source\n`);

    expect(result.notices.some((one) => one.message.includes('書き出し'))).toBe(true);
  });
});

describe('ERC の切り替え (style: check)', () => {
  // どこにもつながっていない抵抗。既定では ERC がこれを名指す。
  const loose = 'board: 12x7\nparts:\n  R1: resistor b3 b6 1k\n';

  test('runs by default, so a missing connection is not silent', () => {
    const result = renderPerfboard(loose);

    expect(result.notices.some((one) => one.message.includes('つながっていません'))).toBe(true);
  });

  test('stops checking when it is turned off, rather than only hiding what it found', () => {
    const result = renderPerfboard(`style:\n  check: off\n${loose}`);

    expect(result.notices).toEqual([]);
    expect(result.svg).toContain('<svg');
  });

  test('draws exactly the same picture either way — the switch is about what is said', () => {
    const on = renderPerfboard(`style:\n  check: on\n${loose}`);
    const off = renderPerfboard(`style:\n  check: off\n${loose}`);

    expect(off.svg).toBe(on.svg);
  });

  test('keeps reporting what could not be read, which is not the ERC talking', () => {
    const result = renderPerfboard(`style:\n  check: off\nboard: 12x7\nparts:\n  R1: resistor zz9 b6 1k\n`);

    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('半田面 (style: back)', () => {
  const fence = 'board: 12x7\nparts:\n  R1: resistor b3 b6 1k\nwires:\n  - b3 -- b6\n';

  // 板そのものは縁の色で数える (部品の胴も角丸の矩形なので、形では見分けられない)。
  // 板そのものは縁の色で数える (部品の胴も角丸の矩形なので、形では見分けられない)。
  const plates = (svg: string): number => svg.match(new RegExp(`stroke="${THEME.palette.plateEdge}"`, 'g'))?.length ?? 0;

  test('is not drawn unless it was asked for', () => {
    const result = renderPerfboard(fence);

    expect(result.svg).not.toContain('半田面');
    expect(plates(result.svg)).toBe(1);
  });

  test('adds a second board under the first, named so it cannot be mistaken', () => {
    const result = renderPerfboard(`style:\n  back: on\n${fence}`);

    expect(result.svg).toContain('半田面');
    expect(plates(result.svg)).toBe(2);
    expect(result.errors).toEqual([]);
  });

  test('turns the columns over, so column 1 comes out on the right', () => {
    const result = renderPerfboard(`style:\n  back: on\nboard: 4x2\n`);
    const [, panel = ''] = result.svg.split('<g transform="translate(0 ');
    const columns = [...panel.matchAll(/<text x="([0-9.]+)"[^>]*>([1-4])<\/text>/g)]
      .map(([, x = '0', label = '']) => ({ x: Number(x), label }));

    expect(columns.length).toBe(4);
    expect(columns.find((one) => one.label === '1')?.x)
      .toBeGreaterThan(columns.find((one) => one.label === '4')?.x ?? 0);
  });

  test('makes the canvas taller, so the second board is not cut off', () => {
    const plain = renderPerfboard(fence);
    const withBack = renderPerfboard(`style:\n  back: on\n${fence}`);
    const heightOf = (svg: string): number => Number(/viewBox="0 0 [0-9.]+ ([0-9.]+)/.exec(svg)?.[1] ?? 0);

    expect(heightOf(withBack.svg)).toBeGreaterThan(heightOf(plain.svg) * 1.8);
  });

  test('changes nothing about the circuit — the netlist is the same', () => {
    const plain = renderPerfboard(fence);
    const withBack = renderPerfboard(`style:\n  back: on\n${fence}`);

    expect(withBack.netlist).toEqual(plain.netlist);
  });
});

describe('板の外の番地', () => {
  test('wires to the slot copper, which sits one step outside the holes', () => {
    // 縁の銅箔は `0` 列。**電気的につながる**ので、ネットにもそう出る。
    const result = renderPerfboard(
      'board:\n  size: 12x7\n  slots: on\nparts:\n  R1: resistor c3 c6 1k\nwires:\n  - c3 -- c0\n  - c6 -- g6\n',
    );

    expect(result.errors).toEqual([]);
    expect(result.netlist.some((net) => net.refs.includes('R1.1'))).toBe(true);
  });

  test('grows the canvas so what is outside the board is not cut off', () => {
    const inside = renderPerfboard('board: 12x7\nparts:\n  R1: resistor c3 c6 1k\nwires:\n  - c3 -- a3\n');
    const outside = renderPerfboard('board: 12x7\nparts:\n  R1: resistor c3 c6 1k\nwires:\n  - c3 -- c-2\n');
    const widthOf = (svg: string): number => Number(/viewBox="0 0 ([0-9.]+)/.exec(svg)?.[1] ?? 0);

    expect(widthOf(outside.svg)).toBeGreaterThan(widthOf(inside.svg));
  });

  test('refuses an address far away from the board, which would stretch the canvas', () => {
    const result = renderPerfboard('board: 12x7\nwires:\n  - c3 -- c-40\n');

    expect(result.errors[0]?.message).toContain('離れすぎ');
  });
});

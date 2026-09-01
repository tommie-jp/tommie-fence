import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

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
});

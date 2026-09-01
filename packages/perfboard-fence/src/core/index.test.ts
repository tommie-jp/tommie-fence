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
    expect(result.notices).toHaveLength(2);
    expect(result.notices[0]?.line).toBe(3);
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
});

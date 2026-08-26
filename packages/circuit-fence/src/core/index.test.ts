import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

const lines = (...rows: string[]): string => `${rows.join('\n')}\n`;

describe('compileCircuit', () => {
  test('asks for a part when the fence is empty', () => {
    const result = compileCircuit('');

    expect(result.tex).toBeNull();
    expect(result.errors[0]?.message).toContain('parts');
  });

  test('asks for a part when the fence holds only blank lines', () => {
    const result = compileCircuit('\n  \n');

    expect(result.tex).toBeNull();
    expect(result.errors).toHaveLength(1);
  });

  test('does not add "no parts" on top of the reason the part could not be read', () => {
    // 部品は書かれている。足すと直しに行く先の無いエラーが増えるだけ。
    const result = compileCircuit(lines('parts:', '  IN: port a1 5V'));

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(2);
  });

  test('draws a fence written with abbreviations exactly like the full names', () => {
    // 略記は書く手数を減らすためだけのもの。図が 1 文字でも違うと約束が崩れる。
    const short = compileCircuit(
      lines('parts:', '  IN: port a1', '  R1: r a1 a3 10k', '  C1: c a3 c3 100n', '  G1: gnd c3'),
    );
    const full = compileCircuit(
      lines(
        'parts:',
        '  IN: port a1',
        '  R1: resistor a1 a3 10k',
        '  C1: capacitor a3 c3 100n',
        '  G1: ground c3',
      ),
    );

    expect(short.errors).toEqual([]);
    expect(short.tex).toBe(full.tex);
    // グラウンドは名前で見分けているので、畳み忘れるとここが GND でなくなる。
    expect(short.netlist?.map((net) => net.name)).toContain('GND');
  });

  test('refuses a value that would break the drawing engine', () => {
    // `,` は circuitikz のオプションの区切りとして読まれる。
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3 1,5k'));

    expect(result.errors[0]?.line).toBe(2);
    expect(result.tex).not.toContain('1,5k');
  });

  test('reports a YAML syntax error with the line it was written on', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', ' bad: indent'));

    expect(result.tex).toBeNull();
    expect(result.errors[0]?.line).toBe(3);
  });

  test('reports an unknown top level key without dropping the rest', () => {
    const result = compileCircuit(lines('wire:', '  - a1 -- a3'));

    expect(result.errors.some((error) => error.message.includes('wire'))).toBe(true);
  });

  test('returns no netlist while nothing could be drawn', () => {
    expect(compileCircuit('').netlist).toEqual([]);
  });

  test('turns a readable fence into TeX with nothing left to report', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3 10k'));

    expect(result.errors).toEqual([]);
    expect(result.tex).toContain('\\begin{circuitikz}');
    expect(result.tex).toContain('to[R,');
  });

  test('still draws the parts it could read when one line is broken', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', '  R2: resistr b1 b3'));

    expect(result.errors).toHaveLength(1);
    expect(result.tex).toContain('to[R,');
  });

  test('derives the netlist even before the drawing works', () => {
    const result = compileCircuit(
      lines('parts:', '  IN: port a1', '  R1: resistor a1 a3 10k', '  G1: ground a3'),
    );

    expect(result.netlist).toEqual([
      { name: 'IN', refs: ['IN', 'R1.1'] },
      { name: 'GND', refs: ['R1.2', 'G1'] },
    ]);
  });
});

describe('compileCircuit の style', () => {
  test('refuses a grid too wide to draw, and still draws the circuit', () => {
    // grid-to: z99 は 2574 点。描くと 10 秒を超え、描画は 1 枚ずつなので
    // 同じノートの他の図まで待たされる。
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style:', '  grid: on', '  grid-to: z99'),
    );

    expect(result.tex).toContain('to[R,');
    expect(result.tex).not.toContain('\\fill[gray, ');
    expect(result.notices.some((notice) => notice.message.includes('グリッドが広すぎます'))).toBe(true);
    // 図は描けているので、読めなかった扱いにはしない。
    expect(result.errors).toEqual([]);
  });

  test('draws a grid that fits', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', 'style:', '  grid: on'));

    expect(result.tex).toContain('\\fill[gray, ');
    expect(result.errors).toEqual([]);
  });

  test('says grid-to does nothing while the grid is off', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', 'style:', '  grid-to: e5'));

    expect(result.notices.some((notice) => notice.message.includes('grid-to'))).toBe(true);
  });

  test('keeps the paper colour the fence asked for, instead of following the editor', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style:', '  paper-color: "#ffffff"'),
    );

    expect(result.theme.paper).toBe('#ffffff');
    expect(result.theme.followsEditor).toBe(false);
  });

  test('follows the editor when neither theme nor paper colour was written', () => {
    expect(compileCircuit(lines('parts:', '  R1: resistor a1 a3')).theme.followsEditor).toBe(true);
  });

  test('layers a second style block on top of the first instead of dropping it', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style:', '  theme: dark', 'style:', '  grid: on'),
    );

    expect(result.theme.name).toBe('dark');
    expect(result.tex).toContain('\\fill[gray, ');
  });

  test('reads a style written as an alias of another block', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style: &base', '  theme: dark', 'style: *base'),
    );

    expect(result.theme.name).toBe('dark');
    expect(result.errors).toEqual([]);
  });

  test('reports the same style item written twice, on the line of the second one', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style:', '  theme: dark', '  theme: light'),
    );

    expect(result.errors[0]?.line).toBe(5);
    expect(result.errors[0]?.message).toContain('二重');
  });
});

describe('ネットリストに出る名前', () => {
  test('names a pin the way the writer wrote it, not the internal one', () => {
    // TikZ のノード名には接頭辞を付けているが、それは内部の都合。
    const result = compileCircuit(
      lines('parts:', '  U1: opamp c5', '  R1: resistor a1 a3', 'wires:', '  - U1.out -- a3'),
    );

    expect(result.netlist.flatMap((net) => net.refs)).toContain('U1.out');
    expect(JSON.stringify(result.netlist)).not.toContain('part-');
  });

  test('still keeps the prefix in the TeX, where the name could clash', () => {
    const result = compileCircuit(lines('parts:', '  U1: opamp c5', 'wires:', '  - U1.out -- a3'));

    expect(result.tex).toContain('(part-U1.out)');
  });
});

describe('compileCircuit の注釈', () => {
  test('hands the note texts out for the SVG to take', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3 10k', 'notes:', '  - text b1 red: ここで分圧する'),
    );

    expect(result.errors).toEqual([]);
    expect(result.notes).toEqual([
      { text: 'ここで分圧する', color: '#e5534b', mono: false, bold: false, align: 'left' },
    ]);
  });

  test('draws the circuit even when a note could not be read', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3 10k', 'notes:', '  - circle Rload'),
    );

    expect(result.tex).not.toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.line).toBe(4);
  });

  test('takes Japanese in a note even though a value may not hold it', () => {
    const note = compileCircuit(lines('parts:', '  R1: resistor a1 a3', 'notes:', '  - text b1: ここ'));
    const value = compileCircuit(lines('parts:', '  R1: resistor a1 a3 ここ'));

    expect(note.errors).toEqual([]);
    expect(value.errors).toHaveLength(1);
  });
});

describe('compileCircuit の書き出し (source)', () => {
  test('hands the fence out line by line, with the ``` around it', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', 'notes:', '  - source b1'));

    expect(result.errors).toEqual([]);
    expect(result.notes.map((note) => note.text)).toEqual([
      '```circuit',
      'parts:',
      '  R1: resistor a1 a3',
      'notes:',
      '  - source b1',
      '```',
    ]);
  });
});

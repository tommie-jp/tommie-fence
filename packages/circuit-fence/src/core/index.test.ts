import { describe, expect, test } from 'vitest';
import { compileCircuit } from './index.ts';

const lines = (...rows: string[]): string => `${rows.join('\n')}\n`;
/** 同じフェンスを Windows の改行 (CRLF) で書いたもの。 */
const crlf = (source: string): string => source.replace(/\n/g, '\r\n');
/** 同じフェンスを古い Mac の改行 (CR だけ) で書いたもの。 */
const cr = (source: string): string => source.replace(/\n/g, '\r');

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

  // debug は**お知らせを出すかどうか**だけの切り替え。core は off でも
  // 今までどおり数え上げて返す (消すのは出す側)。ホストが独自に拾えるように
  // しておかないと、握りつぶしになる (約束 5)。
  test('shows notices unless the fence says otherwise', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a3', 'style:', '  grid-to: e5'));

    expect(result.debug).toBe(true);
  });

  test('still works out the notices when debug is off', () => {
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'style:', '  grid-to: e5', '  debug: off'),
    );

    expect(result.debug).toBe(false);
    expect(result.notices.some((notice) => notice.message.includes('grid-to'))).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('keeps returning the errors when debug is off', () => {
    // 黙らせられるのはお知らせだけ。読めなかった行は必ず返す。
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', '  R2: resistr a2 a4', 'style:', '  debug: off'),
    );

    expect(result.errors).toHaveLength(1);
    expect(result.debug).toBe(false);
  });

  test('shows notices when the fence could not be read at all', () => {
    const result = compileCircuit(lines('parts:', '  IN: port a1 5V'));

    expect(result.debug).toBe(true);
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

// 改行の書き方は**書き手の間違いではない**。Windows で書いた `.md` も、
// 編集画面を通して保存されたノートも CRLF で来るので、入口で揃える。
describe('compileCircuit の改行', () => {
  const fence = lines('parts:', '  R1: resistor a1 a3 10k', 'notes:', '  - source b1');

  test('writes the fence out even when it was saved with CRLF', () => {
    // 行末の \r は図に書き出せない字なので、揃えないと source の注釈だけが落ちる。
    const result = compileCircuit(crlf(fence));

    expect(result.errors).toEqual([]);
    expect(result.notes.map((note) => note.text)).toEqual(
      compileCircuit(fence).notes.map((note) => note.text),
    );
  });

  test('draws a fence written with CRLF exactly like the same fence with LF', () => {
    expect(compileCircuit(crlf(fence)).tex).toBe(compileCircuit(fence).tex);
  });

  test('draws a fence written with CR alone exactly like the same fence with LF', () => {
    const result = compileCircuit(cr(fence));

    expect(result.errors).toEqual([]);
    expect(result.tex).toBe(compileCircuit(fence).tex);
  });

  test('keeps the line numbers of the broken lines when the fence came with CRLF', () => {
    // 揃えても行数は変わらない。ずれると図の下の帯が別の行を指す。
    const broken = lines('parts:', '  R1: resistor a1 a3', '  R2: resistr b1 b3');

    expect(compileCircuit(crlf(broken)).errors.map((error) => error.line)).toEqual(
      compileCircuit(broken).errors.map((error) => error.line),
    );
  });
});

describe('compileCircuit が返す行の中身', () => {
  test('attaches the line to every error, so the reader never has to count lines', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistr a1 a3'));

    expect(result.errors[0]?.text).toBe('  R1: resistr a1 a3');
  });

  test('points at the spelling it could not read', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistr a1 a3'));
    const [error] = result.errors;

    expect(error?.column).toBe(7);
    expect(error?.span).toBe(7);
  });

  test('points at the address it could not read', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistor a1 a9z'));
    const [error] = result.errors;

    expect(error?.text).toBe('  R1: resistor a1 a9z');
    expect(error?.column).toBe(19);
    expect(error?.span).toBe(3);
  });

  test('attaches the line to a notice as well, which is read the same way', () => {
    // お知らせも行番号で返るものなので、照らす先が要るのはエラーと同じ。
    const result = compileCircuit(
      lines(
        'parts:',
        '  R1: resistor a1 a5 10k',
        '  R2: resistor c1 c5 20k',
        'wires:',
        '  - a1 -- c1',
        '  - a3 -- c3',
        '  - a5 -- c5',
      ),
    );
    const [notice] = result.notices;

    expect(result.errors).toEqual([]);
    expect(notice?.line).toBe(2);
    expect(notice?.text).toBe('  R1: resistor a1 a5 10k');
  });

  test('never lets the raw spelling through to the output', () => {
    const result = compileCircuit(lines('parts:', '  R1: resistr a1 a3'));

    for (const error of result.errors) expect(error.token).toBeUndefined();
  });

  test('points at the column YAML itself reported, instead of hunting for a spelling', () => {
    // `: ` を引用符なしで書いた行。注釈に部品の書き方を写すと必ず踏む形。
    const result = compileCircuit(
      lines('parts:', '  R1: resistor a1 a3', 'notes:', '  - text b1: R1: resistor a1 a3'),
    );
    const [error] = result.errors;

    expect(error?.message).toContain('YAML');
    expect(error?.text).toBe('  - text b1: R1: resistor a1 a3');
    expect(error?.column).toBe(14);
  });

  test('leaves the content off when the line YAML points at has nothing on it', () => {
    // 閉じ忘れの `[` は、yaml が末尾 (中身の無い行) を指す。無い行は添えようがない。
    const result = compileCircuit(lines('parts:', '  R1: [a, b'));

    expect(result.errors[0]?.text).toBeUndefined();  });
});

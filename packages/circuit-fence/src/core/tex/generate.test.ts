import { describe, expect, test } from 'vitest';
import { buildCircuit } from '../model/circuit.ts';
import { parseFence } from '../parser/parseFence.ts';
import { noteWidth } from '../notes.ts';
import { VERSION } from '../version.ts';
import { generateTex, standaloneTex } from './generate.ts';

const generate = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return generateTex(buildCircuit(doc).circuit, { style: doc.style });
};

/** 書き出す `.tex` のほう。フェンスに無いフォントとパッケージが使える。 */
const generateLatex = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return generateTex(buildCircuit(doc, { target: 'latex' }).circuit, { style: doc.style, target: 'latex' });
};

const RC_LOWPASS = [
  'parts:',
  '  IN:  port a1',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  '  OUT: port a4',
  '  G1:  ground c3',
  'wires:',
  '  - a3 -- a4',
];

describe('generateTex', () => {
  test('writes the RC low pass exactly', () => {
    expect(generate(...RC_LOWPASS).tex).toBe(
      [
        '\\usepackage{circuitikz}',
        '\\usetikzlibrary{calc}',
        '\\begin{document}',
        '\\begin{circuitikz}[american, line width=0.8pt]',
        '\\ctikzset{bipoles/length=1.2cm}',
        '\\ctikzset{grounds/scale=1.36}',
        '\\coordinate (a1) at (0,0);',
        '\\coordinate (a3) at (4,0);',
        '\\coordinate (c3) at (4,-4);',
        '\\coordinate (a4) at (6,0);',
        '\\draw (a1) node[ocirc]{} node[above left]{IN}; % line 2',
        '\\draw (a1) to[R, l_=$R_{1}$, a^=$10\\,\\mathrm{k}\\Omega$] (a3); % line 3',
        '\\draw (a3) to[C, l_=$C_{1}$, a^=$100\\,\\mathrm{n}\\mathrm{F}$] (c3); % line 4',
        '\\draw (a4) node[ocirc]{} node[above left]{OUT}; % line 5',
        '\\node[ground] at (c3) {}; % line 6',
        '\\draw (a3) -- (a4); % line 8',
        '\\node[circ] at (a3) {};',
        '\\end{circuitikz}',
        '\\end{document}',
      ].join('\n'),
    );
  });

  test('maps each drawing line back to the line of YAML it came from', () => {
    const { lineMap } = generate(...RC_LOWPASS);

    // 定型が 6 行 (usepackage / calc / document / circuitikz / ctikzset 2 つ)、
    // そのあと座標 4 行。図はその次から。
    expect(lineMap.get(11)).toBe(2);
    expect(lineMap.get(12)).toBe(3);
    expect(lineMap.get(16)).toBe(8);
    // 定型と座標の行は YAML のどの行でもない。
    expect(lineMap.get(1)).toBeUndefined();
    expect(lineMap.get(7)).toBeUndefined();
  });

  test('puts the plus plate of an electrolytic capacitor on the address written first', () => {
    // cC は先に書いた側が平板 (+)。書き手が向きを決められるよう、
    // 番地の順をそのまま TeX の順にする。
    const tex = generate('parts:', '  C1: ecap a1 a3 100u').tex;

    expect(tex).toContain('\\draw (a1) to[cC, l_=$C_{1}$, a^=$100\\,\\mathrm{u}\\mathrm{F}$] (a3);');
  });

  test('leaves out the annotation when a part has no value', () => {
    expect(generate('parts:', '  R1: resistor a1 a3').tex).toContain('to[R, l_=$R_{1}$] (a3)');
  });

  test('writes a part placed along a slant between the two cells', () => {
    const tex = generate('parts:', '  R1: resistor a1 c4').tex;

    expect(tex).toContain('\\coordinate (c4) at (6,-4);');
    expect(tex).toContain('to[R, l_=$R_{1}$] (c4)');
  });

  test('writes a slanted wire as one straight line', () => {
    expect(generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -- c5').tex).toContain('\\draw (a3) -- (c5);');
  });

  test('subscripts everything after the first letter of the id', () => {
    const tex = generate('parts:', '  Rload: resistor a1 a3').tex;

    expect(tex).toContain('l_=$R_{load}$');
  });

  test('writes an id of one letter without a subscript', () => {
    expect(generate('parts:', '  R: resistor a1 a3').tex).toContain('l_=$R$');
  });

  test('escapes an id that carries a character TeX would read as its own', () => {
    expect(generate('parts:', '  R_1: resistor a1 a3').tex).toContain('l_=$R_{\\_1}$');
  });

  test('writes a value that carries its own unit as it was written', () => {
    expect(generate('parts:', '  R1: resistor a1 a3 1/2W').tex).toContain('a^=$\\mathrm{1/2W}$');
  });

  test('scales the coordinates with the pitch', () => {
    const tex = generateTex(
      buildCircuit(parseFence('parts:\n  R1: resistor a1 b3\n')!.doc!).circuit,
      { pitch: 1.5 },
    ).tex;

    expect(tex).toContain('\\coordinate (b3) at (3,-1.5);');
  });

  test('puts a dot where three or more ends meet', () => {
    // a3 は R1 の右端・C1 の上端・配線の端の 3 つが集まる。
    expect(generate(...RC_LOWPASS).tex).toContain('\\node[circ] at (a3) {};');
  });

  test('leaves two ends meeting without a dot, which is just a corner', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', '  C1: capacitor a3 c3');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('puts one dot per junction, however many meet there', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor a3 a5',
      '  R3: resistor a3 c3',
      '  R4: resistor a3 c1',
    );

    expect(tex.match(/\\node\[circ\]/g)).toHaveLength(1);
  });

  test('does not turn a wire written twice into a junction', () => {
    // 同じ 2 点を結ぶ線が 2 本あっても、集まっている端は 1 つ。
    const { tex } = generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -- a5', '  - a3 -- a5');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('counts a wire end toward the junction', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor a3 a5',
      'wires:',
      '  - a3 -- c3',
    );

    expect(tex).toContain('\\node[circ] at (a3) {};');
  });

  test('writes each cell once even when several parts share it', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', '  R2: resistor a3 a5');

    expect(tex.match(/\\coordinate \(a3\)/g)).toHaveLength(1);
  });
});

/**
 * 書き出す `.tex` は、フェンスの制約が強いる 3 点だけが違う。
 * ほかを変えるとプレビューで確かめた図と食い違うので、変わらないことも見る。
 */
describe('generateTex for latex', () => {
  test('spells a scaled value with siunitx, so micro comes out as µ', () => {
    // フェンスの TeX には siunitx が無く、u を字のまま出すしかない (実測)。
    expect(generateLatex('parts:', '  C1: ecap a1 a3 100u').tex).toContain('a^=\\qty{100}{\\micro\\farad}');
    expect(generateLatex('parts:', '  R1: resistor a1 a3 10k').tex).toContain('a^=\\qty{10}{\\kilo\\ohm}');
    expect(generateLatex('parts:', '  R1: resistor a1 a3 10k').tex).toContain('\\usepackage{siunitx}');
  });

  test('writes a value with no unit of its own the same way as the fence does', () => {
    expect(generateLatex('parts:', '  D1: diode a1 a3 1N4148').tex).toContain('a^=$\\mathrm{1N4148}$');
  });

  test('draws the real op amp, whose ± the fence TeX has no font for', () => {
    const tex = generateLatex('parts:', '  U1: opamp c3').tex;

    expect(tex).toContain('\\node[op amp] (part-U1) at (c3) {};');
    // 手描きの ± は要らなくなる。
    expect(tex).not.toContain('plain amp');
    expect(tex).not.toContain('.+)+(');
  });

  test('loads a font for the text the standard TeX fonts have no glyph for', () => {
    const tex = generateLatex('parts:', '  V1: vsource a1 a3 電池').tex;

    expect(tex).toContain('\\usepackage{fontspec}');
    expect(tex).toContain('\\newfontfamily\\circuitunicode{Noto Sans CJK JP}');
    expect(tex).toContain('a^=\\circuittext{電池}');
  });

  test('leaves the font out when every value is plain ascii', () => {
    // フォントの行はその 1 行だけが別の環境で落ちうる。要るときだけ書く。
    const tex = generateLatex('parts:', '  R1: resistor a1 a3 10k').tex;

    expect(tex).not.toContain('fontspec');
    expect(tex).not.toContain('circuitunicode');
  });

  test('keeps everything else the same as the fence, down to the coordinates', () => {
    const rows = ['parts:', '  R1: resistor a1 a3 10k', '  C1: capacitor a3 c3 100n', 'wires:', '  - a3 -- a5'];
    const fence = generate(...rows).tex.split('\n');
    const latex = generateLatex(...rows).tex.split('\n');

    // 違うのは値の綴りと足したパッケージだけ。座標も配線も黒丸も動かない。
    for (const row of fence) {
      if (row.includes('a^=')) continue;
      expect(latex).toContain(row);
    }
  });

  test('starts the standalone document with a border, so the figure is not flush to the edge', () => {
    expect(standaloneTex('\\usepackage{circuitikz}', 'latex')).toBe(
      '\\documentclass[border=2mm]{standalone}\n\\usepackage{circuitikz}',
    );
  });

  test('leaves the fence document as it was', () => {
    expect(standaloneTex('\\usepackage{circuitikz}', 'fence')).toBe(
      '\\documentclass{standalone}\n\\usepackage{circuitikz}',
    );
  });
});

describe('style', () => {
  const withStyle = (style: string[], parts: string[] = ['parts:', '  R1: resistor a1 a3']) =>
    generate(...parts, 'style:', ...style).tex;

  test('draws no grid unless it is asked for', () => {
    expect(generate('parts:', '  R1: resistor a1 a3').tex).not.toContain('\\fill[gray, ');
  });

  test('shows where parts can go, with breadboard row letters and column numbers', () => {
    const tex = withStyle(['  grid: on']);

    // 置ける位置の点
    expect(tex).toContain('\\fill[gray, ');
    // 列番号は上、行文字は左
    expect(tex).toContain('{1};');
    expect(tex).toContain('{a};');
  });

  // 点は位置の目安なので薄く、行英字と列数字は読むものなので濃く出す。
  // 同じ色を濃さで分けているので、grid-color の 1 つの指定でどちらも決まる。
  test('draws the dots fainter than the row letters and column numbers', () => {
    const tex = withStyle(['  grid: on']);

    expect(tex).toContain('\\fill[gray, opacity=0.35]');
    expect(tex).toContain('\\node[gray, font=\\scriptsize]');
  });

  test('covers the cells the drawing uses', () => {
    const tex = withStyle(['  grid: on'], ['parts:', '  R1: resistor a1 c3']);

    expect(tex).toContain('{c};');
    expect(tex).toContain('{3};');
    expect(tex).not.toContain('{d};');
  });

  test('reaches as far as grid-to asks, so there is room to move parts into', () => {
    const tex = withStyle(['  grid: on', '  grid-to: e5']);

    expect(tex).toContain('{e};');
    expect(tex).toContain('{5};');
  });

  test('draws the grid before the circuit, so the circuit sits on top', () => {
    const tex = withStyle(['  grid: on']);

    expect(tex.indexOf('\\fill[gray, ')).toBeLessThan(tex.indexOf('to[R,'));
  });

  test('leaves the grid out of the line map, since no line asked for it', () => {
    const { lineMap, tex } = generate('parts:', '  R1: resistor a1 a3', 'style:', '  grid: on');
    const gridLine = tex.split('\n').findIndex((row) => row.includes('\\fill[gray, ')) + 1;

    expect(lineMap.get(gridLine)).toBeUndefined();
  });

  test('spaces the grid with the pitch the drawing uses', () => {
    const tex = withStyle(['  grid: on', '  pitch: 1']);

    expect(tex).toContain('\\coordinate (a3) at (2,0);');
  });

  test('switches the symbols to the european standard', () => {
    expect(withStyle(['  standard: european'])).toContain('\\begin{circuitikz}[european,');
  });

  test('keeps american as the default, which the memo verified', () => {
    expect(generate('parts:', '  R1: resistor a1 a3').tex).toContain('[american,');
  });

  test('draws with the line width that was asked for', () => {
    expect(withStyle(['  wire-width: 1.6'])).toContain('line width=1.6pt');
  });
});

describe('折れた配線', () => {
  test('writes the operator the writer chose', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -| c5');

    expect(tex).toContain('\\draw (a3) -| (c5);');
  });

  test('gives the corner a coordinate so the drawing can reach it', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -| c5');

    // a3 -| c5 の曲がり角は a5 (先に横へ)。
    expect(tex).toContain('\\coordinate (a5) at (8,0);');
  });

  test('leaves a plain corner without a dot', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -| c5');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('puts a dot where something else ends on the corner', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a1 a3',
      '  R2: resistor a5 a7',
      'wires:',
      '  - a3 -| c5',
    );

    // 曲がり角 a5 に R2 の端が乗るので、そこは分岐。
    expect(tex).toContain('\\node[circ] at (a5) {};');
  });

  test('leaves a bend that never turns as a straight line', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3', 'wires:', '  - a3 -| a7');

    expect(tex).toContain('\\draw (a3) -| (a7);');
    expect(tex).not.toContain('\\node[circ]');
  });
});

describe('T 字の黒丸', () => {
  test('puts a dot where an end lands in the middle of a wire', () => {
    const { tex } = generate('parts:', '  R1: resistor b3 d3', 'wires:', '  - b1 -- b5');

    expect(tex).toContain('\\node[circ] at (b3) {};');
  });

  test('leaves a plain crossing without a dot', () => {
    const { tex } = generate('parts:', '  R1: resistor a3 c3', '  R2: resistor b1 b5');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('gives the touched cell a coordinate to put the dot on', () => {
    const { tex } = generate('parts:', '  R1: resistor b3 d3', 'wires:', '  - b1 -- b5');

    expect(tex).toContain('\\coordinate (b3)');
  });
});

describe('多端子部品', () => {
  test('places the symbol on the cell and names it after the part', () => {
    const { tex } = generate('parts:', '  Q1: npn c3');

    // 座標には番地の名前が付いているので、そのまま指せる。
    expect(tex).toContain('\\coordinate (c3) at (4,-4);');
    // ノード名には接頭辞を付ける (番地の座標と同じ名前空間なので)。
    expect(tex).toContain('\\node[npn] (part-Q1) at (c3) {};');
  });

  test('draws a wire to the anchor the pin names', () => {
    const { tex } = generate('parts:', '  Q1: npn c3', '  R1: resistor a1 a3', 'wires:', '  - Q1.B -- a3');

    // 足の綴りは circuitikz のアンカー名に揃える。
    expect(tex).toContain('\\draw (part-Q1.base) -- (a3);');
  });

  test('swaps the opamp for a symbol the fence TeX can draw', () => {
    const { tex } = generate('parts:', '  U1: opamp c5');

    // op amp はフォントが無くプロセスごと落ちる。plain amp に置き換える。
    expect(tex).toContain('\\node[plain amp] (part-U1)');
    expect(tex).not.toContain('op amp');
  });

  test('draws the plus and minus the plain symbol does not carry', () => {
    const { tex } = generate('parts:', '  U1: opamp c5');

    // 字では書かない。数式モードは別の字形になり、テキストの - は + に対して
    // 細くて短い。線なら太さも長さも揃う。
    expect(tex).not.toContain('{$-$}');
    expect(tex).not.toContain('{{-}}');
    // 横棒が 2 本 (+ と -) と、+ の縦棒が 1 本。
    expect(tex.match(/\\draw \(\$\(part-U1\./g)).toHaveLength(3);
  });

  test('gives the plus and minus the same bar, so they balance', () => {
    const { tex } = generate('parts:', '  U1: opamp c5');
    const bars = [...tex.matchAll(/-- \+\+\(([-\d.]+),0\);/g)].map((match) => match[1]);

    // 横棒どうしが同じ長さ。
    expect(new Set(bars).size).toBe(1);
  });

  test('turns the symbol the way the fence asked', () => {
    expect(generate('parts:', '  U1: opamp c5 +up').tex).toContain('plain amp, noinv input up');
  });

  test('writes the part number under the symbol', () => {
    expect(generate('parts:', '  Q1: npn c3 2SC1815').tex).toContain('2SC1815');
  });

  test('hangs the part number off the symbol border, not the middle of the symbol', () => {
    const { tex } = generate('parts:', '  Q1: npn c3 2SC1815');

    // label=below: は記号ではなくノードの (空の) 文字を基準にするので、
    // 記号の体の上に型番が乗る。南のアンカーに掛ければどの記号でも下に出る。
    expect(tex).toContain('\\node[font=\\scriptsize, anchor=north] at (part-Q1.south) {$\\mathrm{2SC1815}$};');
    expect(tex).not.toContain('label={');
  });

  test('hangs it off the border for the tall symbols too', () => {
    expect(generate('parts:', '  T1: transformer c5 1to1').tex).toContain('at (part-T1.south)');
    expect(generate('parts:', '  U1: opamp c5 LM358').tex).toContain('at (part-U1.south)');
  });

  test('pulls in calc, which the hand written plus and minus need', () => {
    expect(generate('parts:', '  U1: opamp c5').tex).toContain('\\usetikzlibrary{calc}');
  });
});

describe('丸い電源の記号', () => {
  test('swaps the round sources for the empty circle', () => {
    // circuitikz の V / sV / sqV / vsourcetri は**中身を 90 度回して**描く
    // (縦置き前提)。横に置くと - が縦棒になり、波形も寝る。
    for (const [type, symbol] of [['vsource', 'V'], ['sine', 'sV'], ['square', 'sqV'], ['triangle', 'vsourcetri']]) {
      const { tex } = generate('parts:', `  V1: ${type} a1 a3 5`);

      expect(tex).toContain('to[esource');
      expect(tex).not.toContain(`to[${symbol},`);
    }
  });

  test('draws the plus and minus of the dc source as lines', () => {
    const { tex } = generate('parts:', '  V1: vsource a1 a3 5');

    // オペアンプの ± と同じ理由で字では書かない (フェンスのフォントでは
    // $-$ が別の字形になり、テキストの - は + に対して細くて短い)。
    expect(tex).not.toContain('{$-$}');
    // 横棒が 2 本 (+ と -) と、+ の縦棒が 1 本。
    expect(tex.match(/^\\draw \([-\d.]+,[-\d.]+\) -- \+\+\(/gm)).toHaveLength(3);
  });

  test('puts the plus on the side of the address written first', () => {
    // ecap や battery と同じ約束。先に書いた番地が + 側。
    const { tex } = generate('parts:', '  V1: vsource a1 a3 5');
    const xs = [...tex.matchAll(/^\\draw \(([-\d.]+),[-\d.]+\) -- \+\+\([-\d.]+,0\);/gm)]
      .map((match) => Number(match[1]));

    // a1 は x=0、a3 は x=4。丸の真ん中 (x=2) より a1 寄りが + の横棒。
    expect(Math.min(...xs)).toBeLessThan(2);
    expect(Math.max(...xs)).toBeGreaterThan(2);
  });

  test('keeps the minus bar horizontal, which is what the circuitikz symbol does not', () => {
    const { tex } = generate('parts:', '  V1: vsource a1 a3 5');

    // - は横棒 1 本。縦棒は + のぶんの 1 本だけ。
    expect(tex.match(/-- \+\+\(0,[-\d.]+\);/g)).toHaveLength(1);
  });

  test('draws the waveform of the ac sources across the circle', () => {
    // 波形は figure の座標系に描く。斜めに置いても波は水平のままで、
    // 計器の straight instruments と同じ読み方になる。
    expect(generate('parts:', '  V1: sine a1 a3 5').tex).toContain(' sin ++(');
    expect(generate('parts:', '  V1: square a1 a3 5').tex).toMatch(/\(1\.82,0\) -- \+\+\(0,0\.18\)/);
    expect(generate('parts:', '  V1: triangle a1 a3 5').tex).toMatch(/\(1\.82,0\) -- \+\+\(0\.09,0\.135\)/);
  });

  test('draws the same symbol in the tex it writes out', () => {
    // フェンスの都合ではなく circuitikz の描き方の問題なので、
    // 書き出す .tex も同じ形にする (約束 7)。
    const { tex } = generateLatex('parts:', '  V1: vsource a1 a3 5');

    expect(tex).toContain('to[esource');
    expect(tex).not.toContain('to[V,');
  });

  test('keeps the id and the value on the symbol', () => {
    const { tex } = generate('parts:', '  V1: vsource a1 a3 5');

    expect(tex).toContain('l_=$V_{1}$');
    expect(tex).toContain('5\\,\\mathrm{V}');
  });
});

describe('電源レールの記号', () => {
  test('writes the id inside the rail symbol', () => {
    // 端子は白丸の横に名前を添えるが、レールは矢印の先に名前が出る。
    const { tex } = generate('parts:', '  V5: vcc a1', '  VN: vee c1');

    expect(tex).toContain('\\node[vcc] at (a1) {V5}; % line 2');
    expect(tex).toContain('\\node[vee] at (c1) {VN}; % line 3');
  });
});

describe('足のある 2 端子部品', () => {
  test('names the bipole so a wire can reach its leg', () => {
    const { tex } = generate('parts:', '  P1: potentiometer a1 a3 10k', 'wires:', '  - P1.w -- c2');

    expect(tex).toContain(
      '\\draw (a1) to[potentiometer, n=part-P1, l_=$P_{1}$, a^=$10\\,\\mathrm{k}\\Omega$] (a3); % line 2',
    );
    expect(tex).toContain('\\draw (part-P1.wiper) -- (c2); % line 4');
  });

  test('leaves the bipoles without legs unnamed', () => {
    // 名前を付けるのは足を指せる種類だけ。ほかは TeX を増やさない。
    const { tex } = generate('parts:', '  R1: resistor a1 a3');

    expect(tex).toContain('\\draw (a1) to[R, l_=$R_{1}$] (a3); % line 2');
  });
});

describe('DIP の IC', () => {
  test('writes the pin count into the symbol and the part number inside it', () => {
    const { tex } = generate('parts:', '  U1: dip8 c2 NE555', 'wires:', '  - U1.1 |- a1');

    expect(tex).toContain('\\node[dipchip, num pins=8, font=\\scriptsize] (part-U1) at (c2) {$\\mathrm{NE555}$}; % line 2');
    expect(tex).toContain('\\draw (part-U1.pin 1) |- (a1); % line 4');
  });

  test('keeps the box empty when no part number is written', () => {
    const { tex } = generate('parts:', '  U1: dip8 c2');

    expect(tex).toContain('\\node[dipchip, num pins=8, font=\\scriptsize] (part-U1) at (c2) {}; % line 2');
  });
});

describe('記号だけでは見分けが付かない部品', () => {
  test('writes the mark under the id as a second label line', () => {
    const { tex } = generate('parts:', '  R5: thermistor-ntc a1 a3 10k');

    expect(tex).toContain(
      '\\draw (a1) to[thR, l2_=$R_{5}$ and NTC, a^=$10\\,\\mathrm{k}\\Omega$] (a3); % line 2',
    );
  });

  test('carries the options a symbol needs into the bipole', () => {
    const { tex } = generate('parts:', '  M1: ohmmeter a1 a3');

    expect(tex).toContain('\\draw (a1) to[rmeter, t={$\\Omega$}, l_=$M_{1}$] (a3); % line 2');
  });
});

describe('記号の向きが版で違う部品', () => {
  test('turns the variable resistor arrow up in the fence', () => {
    // フェンスの circuitikz 1.0 だけ矢先が左下を向く。上下を返して直す。
    expect(generate('parts:', '  R2: resistor-var a1 a3 10k').tex)
      .toContain('\\draw (a1) to[vR, mirror, l_=$R_{2}$, a^=$10\\,\\mathrm{k}\\Omega$] (a3);');
  });

  test('leaves it alone in the tex it writes out', () => {
    // 手元の LaTeX (1.6.6) は最初から右上を向く。返すと逆に寝る。
    const { tex } = generateLatex('parts:', '  R2: resistor-var a1 a3 10k');

    expect(tex).toContain('to[vR, l_=$R_{2}$');
    expect(tex).not.toContain('mirror');
  });
});

/**
 * グラウンドの記号は、3 本の横棒の間隔が記号の側で決め打ちになっている。
 * 線を太くすると棒だけが太って間隔を食い潰し、**棒が 1 つの塊に見える**
 * (既定の 0.8pt で隙間が棒の 1/4 しか残らないと実測)。
 * 潰れない大きさまで記号を広げる。
 */
describe('グラウンドの記号の大きさ', () => {
  const GROUND = ['parts:', '  R1: resistor a1 c1', '  G1: ground c1'];

  test('widens the ground at the default line width', () => {
    const { tex } = generate(...GROUND);

    expect(tex).toContain('grounds/scale=');
  });

  test('leaves the ground alone when the lines are thin enough', () => {
    // 細い線なら記号の既定のままで隙間が残る。書き方を無条件には増やさない。
    const { tex } = generate(...GROUND, 'style:', '  wire-width: 0.4');

    expect(tex).not.toContain('grounds/scale=');
  });

  test('says nothing about grounds in a figure that has none', () => {
    const { tex } = generate('parts:', '  R1: resistor a1 a3');

    expect(tex).not.toContain('grounds/scale=');
  });

  test('widens it further as the lines get thicker', () => {
    const scaleOf = (width: string): number => {
      const { tex } = generate(...GROUND, 'style:', `  wire-width: ${width}`);
      return Number(/grounds\/scale=([\d.]+)/.exec(tex ?? '')?.[1] ?? '1');
    };

    expect(scaleOf('2')).toBeGreaterThan(scaleOf('0.8'));
    expect(scaleOf('4')).toBeGreaterThan(scaleOf('2'));
  });

  test('writes the same widening into the exported tex', () => {
    // 出る図が的で食い違うと、プレビューで確かめてから書き出せなくなる (約束 7)。
    const fence = generate(...GROUND).tex ?? '';
    const latex = generateLatex(...GROUND).tex ?? '';
    const scale = (tex: string): string | undefined => /grounds\/scale=[\d.]+/.exec(tex)?.[0];

    expect(scale(latex)).toBe(scale(fence));
  });
});

describe('generateTex のバージョン刻印', () => {
  const STAMPED = ['parts:', '  R1: resistor a1 a3', 'style:', '  stamp: on'];

  test('writes nothing when the stamp was not asked for', () => {
    expect(generate('parts:', '  R1: resistor a1 a3').tex).not.toContain('circuit-fence');
  });

  test('stamps the version of the tool that generated the figure', () => {
    expect(generate(...STAMPED).tex).toContain(`circuit-fence ${VERSION}`);
  });

  test('hangs the stamp off the finished drawing, not the grid', () => {
    // 図がどこまで広がったかは描き終わるまで決まらない。番地から測ると、
    // ラベルや注釈がはみ出したぶんに刻印が重なる。
    expect(generate(...STAMPED).tex).toContain('current bounding box.south east');
  });

  test('stamps last so the whole drawing is inside the box it measures', () => {
    const lines = (generate(...STAMPED, 'notes:', '  - text c1 "あ"').tex ?? '').split('\n');
    const stamp = lines.findIndex((line) => line.includes('circuit-fence'));

    expect(stamp).toBeGreaterThan(-1);
    expect(lines[stamp + 1]).toBe('\\end{circuitikz}');
  });

  test('draws the stamp in the grid colour so it stays subordinate to the circuit', () => {
    // gray は描き上がった SVG でグリッドの色に塗り替わる (render/theme.ts)。
    expect(generate(...STAMPED).tex).toContain('gray');
  });

  test('writes the same stamp into the exported tex', () => {
    // 刻印は ASCII だけなので、フェンスの制約は何も強いない (約束 7)。
    const line = (tex: string): string | undefined =>
      tex.split('\n').find((row) => row.includes('circuit-fence'));

    expect(line(generateLatex(...STAMPED).tex ?? '')).toBe(line(generate(...STAMPED).tex ?? ''));
  });

  test('carries no line number, because no line of the fence is to blame for it', () => {
    const stamped = (generate(...STAMPED).tex ?? '').split('\n').find((row) => row.includes('circuit-fence'));

    expect(stamped).not.toContain('% line');
  });
});

describe('generateTex の題 (title)', () => {
  const titled = (...rows: string[]) => generate('title: 回路図01 テスト', ...rows);
  const RESISTOR = ['parts:', '  R1: resistor a1 a3'];

  test('writes nothing when the fence has no title', () => {
    expect(generate(...RESISTOR).tex).not.toContain('current bounding box.north west');
  });

  test('hangs the title off the top of the finished drawing', () => {
    // 番地には a より上が無いので、題は図の広がりから測るしかない。
    expect(titled(...RESISTOR).tex).toContain('current bounding box.north west');
  });

  test('draws the title after the notes, so it clears everything drawn', () => {
    const lines = (titled(...RESISTOR, 'notes:', '  - text c1: あ').tex ?? '').split('\n');
    const note = lines.findIndex((line) => line.includes('% line 5'));
    const title = lines.findIndex((line) => line.includes('current bounding box.north west'));

    expect(note).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(note);
  });

  test('keeps the text out of the fence TeX, leaving a mark to fill in', () => {
    // フェンスの TeX に日本語のフォントは無い。注釈と同じ道を通す (約束 7)。
    const { tex, notes } = titled(...RESISTOR);

    expect(tex).not.toContain('回路図01');
    expect(notes.at(-1)).toMatchObject({ text: '回路図01 テスト', bold: true, mono: false });
  });

  test('puts the title last in the marks, because it is drawn last', () => {
    const { notes } = titled(...RESISTOR, 'notes:', '  - text c1: あ');

    expect(notes.map((note) => note.text)).toEqual(['あ', '回路図01 テスト']);
  });

  test('reserves the width the mark does not have, so the title is not cut off', () => {
    const narrow = titled(...RESISTOR).tex ?? '';
    const wide = generate(`title: ${'あ'.repeat(40)}`, ...RESISTOR).tex ?? '';
    const width = (tex: string): number =>
      Number(/rectangle \+\+\(([\d.]+),/.exec(tex)?.[1] ?? '0');

    expect(width(wide)).toBeGreaterThan(width(narrow));
  });

  test('reserves more room for a title in capitals than the plain estimate', () => {
    // 題は必ず太字。cmbx は cmr より字送りが広く、大文字はさらに広い。
    // 細字の見積もりのまま取ると、大文字ばかりの題が図の右で切れる。
    const width = (tex: string): number => Number(/rectangle \+\+\(([\d.]+),/.exec(tex)?.[1] ?? '0');
    const caps = width(generate('title: WWWWWWWWWW', ...RESISTOR).tex ?? '');
    const plain = noteWidth('WWWWWWWWWW', 'large');

    // 端数の丸めで勝ってしまわないよう、はっきり広いことを見る。
    expect(caps).toBeGreaterThan(plain * 1.1);
  });

  test('lets the exported tex typeset the title itself', () => {
    const { tex, notes } = generateLatex('title: 回路図01 テスト', ...RESISTOR);

    expect(tex).toContain('回路図01 テスト');
    expect(notes).toEqual([]);
  });

  test('asks for the unicode font when the exported title needs one', () => {
    expect(generateLatex('title: 回路図01', ...RESISTOR).tex).toContain('newfontfamily');
    expect(generateLatex('title: Fig 1', ...RESISTOR).tex).not.toContain('newfontfamily');
  });

  test('leaves room for the stamp below even when a title is on top', () => {
    const { tex } = generate('title: 回路図01', ...RESISTOR, 'style:', '  stamp: on');

    expect(tex).toContain('current bounding box.north west');
    expect(tex).toContain('current bounding box.south east');
  });
});

describe('生成した TeX が TeX の命令として書けているか', () => {
  // 実機に通すまで気づけない綴りの崩れを、ここで止める。
  // テンプレート文字列の中では `\n` が改行になるので、`\\node` と書かないと
  // 行頭の \ が消えて `ode[...]` になり、**TeX は黙って何も描かない**
  // (エラーにならないので図が出たように見える)。
  test.each([
    ['題', 'title: 回路図01', '\\node[anchor=south west'],
    ['刻印', 'style:\n  stamp: on', '\\node[gray, anchor=north east'],
  ])('%s は \\node から始まる', (_label, extra, expected) => {
    const { tex } = generate(...`parts:\n  R1: resistor a1 a3\n${extra}`.split('\n'));

    expect(tex).toContain(expected);
  });

  test('題の場所取りは \\path から始まる', () => {
    expect(generate('title: 回路図01', 'parts:', '  R1: resistor a1 a3').tex).toContain('\\path (circuittitle');
  });

  test('どの行も TeX の命令か注釈で始まっている', () => {
    const { tex } = generate('title: 回路図01', 'parts:', '  R1: resistor a1 a3', 'style:', '  stamp: on');

    for (const line of (tex ?? '').split('\n')) {
      expect(line, line).toMatch(/^(\\|%)/);
    }
  });
});

describe('generateTex for addresses between the cells', () => {
  test('names the coordinate without a dot, which TikZ reads as an anchor', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a_1.5 a_3.5 10k',
      'wires:',
      '  - a.5_1 -- a.5_3',
    );

    expect(tex).toContain('\\coordinate (a-1p5) at (1,0);');
    expect(tex).toContain('\\coordinate (a-3p5) at (5,0);');
    expect(tex).toContain('\\coordinate (ap5-1) at (0,-1);');
    expect(tex).toContain('\\draw (a-1p5) to[R');
    expect(tex).toContain('\\draw (ap5-1) -- (ap5-3);');
  });

  test('draws the grid on the whole cells, and wide enough to cover a half step', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a_1.5 b_2.5 10k',
      'style:',
      '  grid: on',
    );

    // 点は交点の上にだけ打つ。間の番地はその点と点の間に乗る。
    expect(tex).toContain('\\foreach \\x in {0,2,4} {\\foreach \\y in {0,-2}');
  });

  test('widens the grid to the next whole cell when a part hangs past the last one', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor a1 a.5_1 10k',
      'style:',
      '  grid: on',
    );

    // 行 a.5 は a と b の間なので、b の点まで打たないと図から格子がはみ出す。
    expect(tex).toContain('\\foreach \\x in {0} {\\foreach \\y in {0,-2}');
  });
});

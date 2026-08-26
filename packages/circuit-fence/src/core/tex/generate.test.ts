import { describe, expect, test } from 'vitest';
import { buildCircuit } from '../model/circuit.ts';
import { parseFence } from '../parser/parseFence.ts';
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

    // 定型が 5 行 (usepackage / calc / document / circuitikz / ctikzset)、
    // そのあと座標 4 行。図はその次から。
    expect(lineMap.get(10)).toBe(2);
    expect(lineMap.get(11)).toBe(3);
    expect(lineMap.get(15)).toBe(8);
    // 定型と座標の行は YAML のどの行でもない。
    expect(lineMap.get(1)).toBeUndefined();
    expect(lineMap.get(6)).toBeUndefined();
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

    expect(tex).toContain('\\draw (a1) to[rmeterwa, t={$\\Omega$}, l_=$M_{1}$] (a3); % line 2');
  });
});

describe('generateTex の注釈', () => {
  const RC = ['parts:', '  R1: resistor a1 a3 10k', '  C1: capacitor a3 c3 100n'];

  test('draws the mark around the middle of the part it points at', () => {
    const { tex } = generate(...RC, 'notes:', '  - circle R1');

    // a1 と a3 の真ん中。番地の間隔は 2cm なので x = 2。
    expect(tex).toContain('\\draw[circuitnotered] (2,0) circle (0.9);');
  });

  test('draws the mark on the cell when the note points at a cell', () => {
    const { tex } = generate(...RC, 'notes:', '  - circle b2');

    expect(tex).toContain('\\draw[circuitnotered] (2,-2) circle (0.9);');
  });

  test('declares only the colours it uses', () => {
    const { tex } = generate(...RC, 'notes:', '  - circle R1 blue');

    expect(tex).toContain('\\definecolor{circuitnoteblue}{HTML}{4C8EDA}');
    expect(tex).not.toContain('circuitnotered');
  });

  test('declares no colour at all when there are no notes', () => {
    const { tex } = generate(...RC);

    expect(tex).not.toContain('\\definecolor');
  });

  // 注釈は図の上に重ねる印なので、回路にも分岐の黒丸にも隠れないようにする。
  test('draws the notes after the circuit', () => {
    const { tex } = generate(...RC, 'wires:', '  - a3 -- a4', 'notes:', '  - circle R1');

    expect(tex.indexOf('\\draw[circuitnotered]')).toBeGreaterThan(tex.indexOf('to[R'));
    expect(tex.indexOf('\\draw[circuitnotered]')).toBeGreaterThan(tex.indexOf('node[circ]'));
  });

  test('carries the line of the note back for the TeX log', () => {
    const { tex, lineMap } = generate(...RC, 'notes:', '  - circle R1');
    const at = tex.split('\n').findIndex((line) => line.startsWith('\\draw[circuitnotered]')) + 1;

    expect(lineMap.get(at)).toBe(5);
  });
});

describe('generateTex の注釈の字', () => {
  const R = ['parts:', '  R1: resistor a1 a3 10k'];

  // フェンスの TeX には日本語のフォントが無く、渡すとプロセスごと落ちる。
  // 字は渡さず、置き場所だけを目印として描かせる。
  test('leaves the text out of the fence TeX and marks the place instead', () => {
    const { tex, notes } = generate(...R, 'notes:', '  - text b1: ここで分圧する');

    expect(tex).not.toContain('ここで分圧する');
    expect(tex).toContain('\\definecolor{circuitnotemark}{HTML}{FE00FE}');
    expect(tex).toContain('\\node[anchor=west, inner sep=0, circuitnotemark, font=\\footnotesize] at (0,-2) {X};');
    expect(notes).toEqual([{ text: 'ここで分圧する', color: '#000000', mono: false, bold: false, align: 'left' }]);
  });

  // TeX は字を渡されていないので幅を知らない。取っておかないと図の縁で切れる。
  test('keeps room for the text the fence TeX cannot measure', () => {
    const { tex } = generate(...R, 'notes:', '  - text b1: ここで分圧する');
    const short = generate(...R, 'notes:', '  - text b1: ここ');

    const width = (source: string): number =>
      Number(/\\path \(0,[-\d.]+\) rectangle \(([\d.]+),/.exec(source)?.[1] ?? 0);
    expect(width(tex)).toBeGreaterThan(width(short.tex));
  });

  test('gives the colour of a note that has none to the SVG as the ink black', () => {
    const { notes } = generate(...R, 'notes:', '  - text b1 green: ここ');

    expect(notes).toEqual([{ text: 'ここ', color: '#2ea043', mono: false, bold: false, align: 'left' }]);
  });

  test('hands the texts over in the order the marks are drawn', () => {
    const { notes } = generate(...R, 'notes:', '  - text b1: いち', '  - circle R1', '  - text b3: に');

    expect(notes.map((note) => note.text)).toEqual(['いち', 'に']);
  });

  // 書き出す `.tex` はフォントを積めるので、字は TeX に組ませる。
  test('writes the text itself into the TeX that goes to LaTeX', () => {
    const { tex, notes } = generateLatex(...R, 'notes:', '  - text b1: ここで分圧する');

    expect(tex).toContain('\\circuittext{ここで分圧する}');
    expect(tex).toContain('\\newfontfamily\\circuitunicode');
    expect(tex).not.toContain('circuitnotemark');
    expect(notes).toEqual([]);
  });

  test('leaves the font line out when the text needs no font of its own', () => {
    const { tex } = generateLatex(...R, 'notes:', '  - text b1: 10k pull down');

    expect(tex).toContain('{10k pull down}');
    expect(tex).not.toContain('\\newfontfamily');
  });

  test('colours the text in the TeX that goes to LaTeX', () => {
    const { tex } = generateLatex(...R, 'notes:', '  - text b1 blue: ここ');

    expect(tex).toContain('\\definecolor{circuitnoteblue}{HTML}{4C8EDA}');
    expect(tex).toContain('anchor=west, inner sep=0, circuitnoteblue, font=\\footnotesize');
  });
});

describe('generateTex の書き出し (source)', () => {
  const R = ['parts:', '  R1: resistor a1 a3 10k', 'notes:', '  - source b1'];
  const write = (...rows: string[]) => {
    const source = `${rows.join('\n')}\n`;
    const { doc } = parseFence(source);
    if (doc === null) throw new Error('YAML を読めませんでした');
    return generateTex(buildCircuit(doc).circuit, { style: doc.style, source });
  };

  test('writes the fence out as it was written in the Markdown', () => {
    const { notes } = write(...R);

    expect(notes.map((note) => note.text)).toEqual([
      '```circuit',
      'parts:',
      '  R1: resistor a1 a3 10k',
      'notes:',
      '  - source b1',
      '```',
    ]);
  });

  // 書き写せる形であることが値打ちなので、書いていない字を混ぜない。
  test('adds nothing of its own to the lines it writes out', () => {
    const { notes } = write(...R);

    expect(notes.map((note) => note.text)).toContain('parts:');
    expect(notes.every((note) => !/^\s*\d+ /.test(note.text))).toBe(true);
  });

  test('組む字は等幅にする (字下げが意味を持つので)', () => {
    const { notes } = write(...R);

    expect(notes.every((note) => note.mono)).toBe(true);
  });

  // 格子の刻み (既定 2cm) で送ると、数行書いただけで図より書き出しが高くなる。
  test('packs the lines by the height of the type, not by the grid', () => {
    const { tex } = write(...R);
    const ys = [...tex.matchAll(/circuitnotemark, font=\\footnotesize\] at \((-?[\d.]+),(-?[\d.]+)\)/g)].map(
      (match) => Number(match[2]),
    );

    expect(ys.length).toBeGreaterThan(1);
    const step = (ys[0] ?? 0) - (ys[1] ?? 0);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(1);
  });

  test('takes room for the whole block, so the last line is not cut off', () => {
    const { tex } = write(...R);

    expect(tex).toMatch(/\\path \(0,-[\d.]+\) rectangle \([\d.]+,-?[\d.]+\);/);
  });

  // 書き出す `.tex` はフォントを積めるので、字は TeX に組ませる。
  test('writes the listing into the TeX that goes to LaTeX', () => {
    const source = `${R.join('\n')}\n`;
    const { doc } = parseFence(source);
    if (doc === null) throw new Error('YAML を読めませんでした');
    const { tex, notes } = generateTex(buildCircuit(doc, { target: 'latex' }).circuit, {
      style: doc.style,
      target: 'latex',
      source,
    });

    expect(tex).toContain('\\texttt{parts:}');
    expect(notes).toEqual([]);
  });

  test('組む字が日本語を含むときだけ、等幅の日本語フォントを書く', () => {
    const withJapanese = ['parts:', '  R1: resistor a1 a3', 'notes:', '  - source b1', '  - text c1: ここ'];
    const source = `${withJapanese.join('\n')}\n`;
    const { doc } = parseFence(source);
    if (doc === null) throw new Error('YAML を読めませんでした');
    const latex = (rows: typeof doc) =>
      generateTex(buildCircuit(rows, { target: 'latex' }).circuit, {
        style: rows.style, target: 'latex', source,
      }).tex;

    expect(latex(doc)).toContain('\\newfontfamily\\circuitmono');
    expect(write(...R).tex).not.toContain('circuitmono');
  });
});

describe('generateTex の注釈の見た目', () => {
  const R = ['parts:', '  R1: resistor a1 a3 10k'];

  test('sets the size the note asks for', () => {
    expect(generate(...R, 'notes:', '  - text b1 huge: ここ').tex).toContain('font=\\LARGE');
    expect(generate(...R, 'notes:', '  - text b1 tiny: ここ').tex).toContain('font=\\tiny');
  });

  // 目印は 1 文字なので、これが図に取っておく高さと幅の物差しになる。
  test('takes more room for a bigger note', () => {
    const box = (size: string): number => {
      const tex = generate(...R, 'notes:', `  - text b1 ${size}: ここ`).tex;
      return Number(/\\path \(0,[-\d.]+\) rectangle \(([\d.]+),/.exec(tex)?.[1] ?? 0);
    };

    expect(box('huge')).toBeGreaterThan(box('normal'));
    expect(box('normal')).toBeGreaterThan(box('tiny'));
  });

  test('sets bold as a font of its own and hands it to the SVG', () => {
    const { tex, notes } = generate(...R, 'notes:', '  - text b1 bold: ここ');

    expect(tex).toContain('font=\\footnotesize\\bfseries');
    expect(notes[0]).toMatchObject({ bold: true });
  });

  // TeX は太さをフォントの名前 (cmbx8) で表すが、差し込むときにフォントごと
  // 入れ替えるのでその指定は消える。SVG の側に持ち直す。
  test('hands the alignment to the SVG, which the mark cannot show', () => {
    const { notes } = generate(...R, 'notes:', '  - text b1 right: ここ');

    expect(notes[0]).toMatchObject({ align: 'right' });
  });

  // 目印は 1 文字で本物の字とは幅が違うので、寄せは TeX には決めさせない。
  // 場所だけは、字がどちらへ広がるかに合わせて取っておく。
  test('keeps the room on the side the text will grow to', () => {
    const span = (align: string): readonly [number, number] => {
      const tex = generate(...R, 'notes:', `  - text b3 ${align}: ここ`).tex;
      const found = /\\path \((-?[\d.]+),[-\d.]+\) rectangle \((-?[\d.]+),/.exec(tex);
      return [Number(found?.[1] ?? 0), Number(found?.[2] ?? 0)];
    };

    const [leftFrom, leftTo] = span('left');
    const [rightFrom, rightTo] = span('right');
    const [centreFrom, centreTo] = span('center');

    expect(leftFrom).toBe(4);
    expect(leftTo).toBeGreaterThan(4);
    expect(rightTo).toBe(4);
    expect(rightFrom).toBeLessThan(4);
    expect(centreFrom).toBeLessThan(4);
    expect(centreTo).toBeGreaterThan(4);
  });

  // 番地が字の左端になる、という決まりを目の子で正しくする
  // (inner sep があると 1/3 em ぶん右へずれる)。
  test('puts the text flush at the cell, with no padding of its own', () => {
    expect(generate(...R, 'notes:', '  - text b1: ここ').tex).toContain('inner sep=0');
  });

  // 書き出す `.tex` は TeX に字を組ませるので、寄せも TeX のアンカーで決まる。
  test('leaves the alignment to TeX in the TeX that goes to LaTeX', () => {
    expect(generateLatex(...R, 'notes:', '  - text b1 right: ここ').tex).toContain('anchor=east');
    expect(generateLatex(...R, 'notes:', '  - text b1 center: ここ').tex).toContain('anchor=center');
  });

  test('sets the same size and weight in the TeX that goes to LaTeX', () => {
    expect(generateLatex(...R, 'notes:', '  - text b1 huge bold: ここ').tex).toContain(
      'font=\\LARGE\\bfseries',
    );
  });
});

describe('generateTex の枠 (box)', () => {
  const R = ['parts:', '  R1: resistor a1 a3 10k'];

  // 番地の間隔は 2cm。a1 は (0,0)、c3 は (4,-4)。内側に余白を取って囲む。
  test('draws a frame around the corners it was given', () => {
    const { tex } = generate(...R, 'notes:', '  - box a1 c3');

    expect(tex).toMatch(/\\draw\[circuitnotered, dashed, rounded corners=[\d.]+pt\] \(-0\.7,-4\.7\) rectangle \(4\.7,0\.7\);/);
  });

  test('takes the corners whichever way round they are written', () => {
    const forwards = generate(...R, 'notes:', '  - box a1 c3').tex;
    const backwards = generate(...R, 'notes:', '  - box c3 a1').tex;

    expect(backwards).toBe(forwards);
  });

  test('draws a frame around one cell when both corners are the same', () => {
    const { tex } = generate(...R, 'notes:', '  - box b2 b2');

    expect(tex).toContain('(1.3,-2.7) rectangle (2.7,-1.3)');
  });

  test('declares the colour it uses', () => {
    const { tex } = generate(...R, 'notes:', '  - box a1 c3 green');

    expect(tex).toContain('\\definecolor{circuitnotegreen}{HTML}{2EA043}');
    expect(tex).toContain('\\draw[circuitnotegreen, dashed');
  });

  // 枠には字が無いので、字を差し込む目印の色は要らない。
  test('declares no mark colour when there are no texts', () => {
    const { tex } = generate(...R, 'notes:', '  - box a1 c3');

    expect(tex).not.toContain('circuitnotemark');
  });

  test('draws the same frame in the TeX that goes to LaTeX', () => {
    expect(generateLatex(...R, 'notes:', '  - box a1 c3').tex).toContain('rectangle (4.7,0.7)');
  });

  test('carries the line of the note back for the TeX log', () => {
    const { tex, lineMap } = generate(...R, 'notes:', '  - box a1 c3');
    const at = tex.split('\n').findIndex((line) => line.includes('rounded corners')) + 1;

    expect(lineMap.get(at)).toBe(4);
  });
});

describe('generateTex の指し棒 (arrow)', () => {
  const R = ['parts:', '  R1: resistor a1 a3 10k'];

  test('draws an arrow between two cells', () => {
    const { tex } = generate(...R, 'notes:', '  - arrow c1 c3');

    expect(tex).toContain('\\draw[circuitnotered, -{Stealth[length=2.2mm]}] (0,-4) -- (4,-4);');
  });

  // 先端の形は増やしたライブラリのもの。要るときだけ書く (約束 6)。
  test('loads the arrow tips only when an arrow is drawn', () => {
    expect(generate(...R, 'notes:', '  - arrow c1 c3').tex).toContain('\\usetikzlibrary{arrows.meta}');
    expect(generate(...R, 'notes:', '  - circle R1').tex).not.toContain('arrows.meta');
  });

  // 部品を指す矢印は、印 (circle) と同じ丸の縁で止める。
  // 真ん中まで伸ばすと先端が記号の下に隠れる。
  test('stops the tip at the edge of the part it points at', () => {
    const { tex } = generate(...R, 'notes:', '  - arrow c2 R1');
    const found = /\] \((-?[\d.]+),(-?[\d.]+)\) -- \((-?[\d.]+),(-?[\d.]+)\);/.exec(tex);

    // R1 の真ん中は (2,0)。起点 c2 は (2,-4) なので、まっすぐ上を向く。
    expect(Number(found?.[3])).toBe(2);
    expect(Number(found?.[4])).toBeLessThan(0);
    expect(Number(found?.[4])).toBeGreaterThan(-4);
  });

  test('runs the whole way when both ends are cells', () => {
    const { tex } = generate(...R, 'notes:', '  - arrow c1 c3');

    expect(tex).toContain('(0,-4) -- (4,-4)');
  });

  // 短い矢印で端を削りすぎると、向きが裏返って嘘の図になる。
  test('keeps the arrow pointing the right way when it is short', () => {
    const { tex } = generate(...R, 'notes:', '  - arrow b2 R1');
    const found = /\] \((-?[\d.]+),(-?[\d.]+)\) -- \((-?[\d.]+),(-?[\d.]+)\);/.exec(tex);
    const [, x1, y1, x2, y2] = [...(found ?? [])].map(Number);

    // 起点 b2 は (2,-2)、指す先 R1 の真ん中は (2,0)。上を向いたままにする。
    expect(Number(y2)).toBeGreaterThan(Number(y1));
    expect(Number(x1)).toBe(Number(x2));
  });

  test('declares the colour it uses', () => {
    const { tex } = generate(...R, 'notes:', '  - arrow c1 c3 orange');

    expect(tex).toContain('\\definecolor{circuitnoteorange}{HTML}{D29922}');
  });

  test('draws the same arrow in the TeX that goes to LaTeX', () => {
    expect(generateLatex(...R, 'notes:', '  - arrow c1 c3').tex).toContain('-{Stealth[length=2.2mm]}');
  });

  test('carries the line of the note back for the TeX log', () => {
    const { tex, lineMap } = generate(...R, 'notes:', '  - arrow c1 c3');
    const at = tex.split('\n').findIndex((line) => line.includes('Stealth')) + 1;

    expect(lineMap.get(at)).toBe(4);
  });
});

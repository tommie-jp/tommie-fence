import { describe, expect, test } from 'vitest';
import { buildCircuit } from '../model/circuit.ts';
import { parseFence } from '../parser/parseFence.ts';
import { DEFAULT_NOTE_SIZE, noteFontTex, noteWidth } from '../notes.ts';
import { lookupPartType, partTypeNames, pinPlaces } from '../parts.ts';
import { VERSION } from '../version.ts';
import { generateTex, standaloneTex } from './generate.ts';
import type { StyleSpec } from '../types.ts';

// 刻印は既定で付く (`stamp: off` で消す)。付くと注釈の差し込みの並びの末尾に
// 1 つ増えるので、刻印を見ない試験では**書かれていなければ外して**比べる。
// 既定で付くことは「generateTex のバージョン刻印」で確かめる。
const unstamped = (style: StyleSpec): StyleSpec => ({ ...style, stamp: style.stamp ?? false });

const generate = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return generateTex(buildCircuit(doc).circuit, { style: unstamped(doc.style) });
};

/** 書き出す `.tex` のほう。フェンスに無いフォントとパッケージが使える。 */
const generateLatex = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return generateTex(buildCircuit(doc, { target: 'latex' }).circuit, { style: unstamped(doc.style), target: 'latex' });
};

const RC_LOWPASS = [
  'parts:',
  '  IN:  port 1,1',
  '  R1:  resistor 1,1 3,1 10k',
  '  C1:  capacitor 3,1 3,3 100n',
  '  OUT: port 4,1',
  '  G1:  ground 3,3',
  'wires:',
  '  - 3,1 -- 4,1',
];

describe('generateTex', () => {
  test('stands the antenna on its address and writes its name beside it, as a port', () => {
    const { tex } = generate('parts:', '  ANT: antenna 1,1', '  EAR: earphone 3,1 3,3');

    expect(tex).toContain('\\draw (x1y1) node[antenna]{} node[above left]{ANT}; % line 2');
    expect(tex).toContain('to[loudspeaker, l_=$E_{AR}$] (x3y3); % line 3');
  });

  test('writes the RC low pass exactly', () => {
    expect(generate(...RC_LOWPASS).tex).toBe(
      [
        '\\usepackage{circuitikz}',
        '\\usetikzlibrary{calc}',
        '\\begin{document}',
        '\\begin{circuitikz}[american, line width=0.8pt]',
        '\\ctikzset{bipoles/length=1.2cm}',
        '\\ctikzset{grounds/scale=1.36}',
        '\\coordinate (x1y1) at (0,0);',
        '\\coordinate (x3y1) at (4,0);',
        '\\coordinate (x3y3) at (4,-4);',
        '\\coordinate (x4y1) at (6,0);',
        '\\draw (x1y1) node[ocirc]{} node[above left]{IN}; % line 2',
        '\\draw (x1y1) to[R, l_=$R_{1}$, a^=$10\\,\\mathrm{k}\\Omega$] (x3y1); % line 3',
        '\\draw (x3y1) to[C, l_=$C_{1}$, a^=$100\\,\\mathrm{n}\\mathrm{F}$] (x3y3); % line 4',
        '\\draw (x4y1) node[ocirc]{} node[above left]{OUT}; % line 5',
        '\\node[ground] at (x3y3) {}; % line 6',
        '\\draw (x3y1) -- (x4y1); % line 8',
        '\\node[circ] at (x3y1) {};',
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
    const tex = generate('parts:', '  C1: ecap 1,1 3,1 100u').tex;

    expect(tex).toContain('\\draw (x1y1) to[cC, l_=$C_{1}$, a^=$100\\,\\mu\\mathrm{F}$] (x3y1);');
  });

  test('writes the micro prefix as the Greek mu, not the letter u', () => {
    // フェンスの TeX には siunitx が無い。字のまま u を出すと 1.5 uF と読める図になる。
    // \\mu は数式のフォント (cmmi10) にあるので斜体の µ で出る (実機で確かめた)。
    const tex = generate('parts:', '  C1: capacitor 1,1 3,1 1.5u').tex;

    expect(tex).toContain('a^=$1\\mbox{.}5\\,\\mu\\mathrm{F}$');
    expect(tex).not.toContain('\\mathrm{u}');
  });

  test('leaves out the annotation when a part has no value', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1').tex).toContain('to[R, l_=$R_{1}$] (x3y1)');
  });

  test('writes a part placed along a slant between the two cells', () => {
    const tex = generate('parts:', '  R1: resistor 1,1 4,3').tex;

    expect(tex).toContain('\\coordinate (x4y3) at (6,-4);');
    expect(tex).toContain('to[R, l_=$R_{1}$] (x4y3)');
  });

  test('writes a slanted wire as one straight line', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -- 5,3').tex).toContain('\\draw (x3y1) -- (x5y3);');
  });

  test('subscripts everything after the first letter of the id', () => {
    const tex = generate('parts:', '  Rload: resistor 1,1 3,1').tex;

    expect(tex).toContain('l_=$R_{load}$');
  });

  test('writes an id of one letter without a subscript', () => {
    expect(generate('parts:', '  R: resistor 1,1 3,1').tex).toContain('l_=$R$');
  });

  test('escapes an id that carries a character TeX would read as its own', () => {
    expect(generate('parts:', '  R_1: resistor 1,1 3,1').tex).toContain('l_=$R_{\\_1}$');
  });

  test('writes the label in place of the id when one is given', () => {
    const tex = generate('parts:', '  E1: vsource 1,1 1,3 l=$\\dot{E}$').tex;

    expect(tex).toContain('l_=$\\dot{E}$');
  });

  test('keeps the id in the netlist even when the label replaces it in the figure', () => {
    // ラベルは図の見た目だけ。配線から指す名前もネット名も ID のまま。
    const tex = generate('parts:', '  E1: vsource 1,1 1,3 l=$\\dot{E}$').tex;

    expect(tex).toContain('l_=$\\dot{E}$');
    expect(tex).not.toContain('l_=$E_{1}$');
  });

  test('subscripts a label written without the math form, like an id', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1 l=RL').tex).toContain('l_=$R_{L}$');
  });

  test('falls back to the id when the label cannot be read', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1 l=$\\frac{1}{2}$');

    expect(tex).toContain('l_=$R_{1}$');
  });

  // 値と同じで、フォントの要る字はフォントの要る組み方で出す。書き出す .tex に
  // その 1 行が無いと、組んだときに字が出ない (プレビューには来ない字)。
  test('writes a label that needs a font the same way a value does', () => {
    const { tex } = generateLatex('parts:', '  R1: resistor 1,1 3,1 l=Ω');

    expect(tex).toContain('\\circuittext{Ω}');
    expect(tex).toContain('\\usepackage{fontspec}');
  });

  // 素の線は記号を描かないので、名前を出す先が無い。ID は書かない。
  test('leaves the plain wire without a name in the figure', () => {
    const tex = generate('parts:', '  SH: short 1,1 3,1 i=I').tex;

    expect(tex).toContain('to[short, i>^=$I$, ');
    expect(tex).not.toContain('l_=$S_{H}$');
  });

  test('draws the current arrow from the address written first', () => {
    // `i>` は from → to の向き。番地を入れ替えれば矢も返る (実機で確認)。
    expect(generate('parts:', '  R1: resistor 1,1 3,1 i=i').tex).toContain('i>^=$i$');
  });

  test('subscripts the current label the same way an id is subscripted', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1 i=i1').tex).toContain('i>^=$i_{1}$');
  });

  test('draws the voltage with + on the address written first', () => {
    // `v^>` は from が +。極性の規則 (先に書いた番地が + 側) と同じ向き。
    expect(generate('parts:', '  C1: capacitor 1,1 1,3 v=vC').tex).toContain('v^>=$v_{C}$');
  });

  // 既定のままだと + と − が素子から離れて出る (2 マスの部品では端に付く)。
  // 教科書の図は記号のすぐ脇なので、素子側へ寄せる。実機で値を見て決めた。
  test('pulls the voltage poles toward the symbol, only when a voltage is drawn', () => {
    expect(generate('parts:', '  C1: capacitor 1,1 1,3 v=vC').tex).toContain('voltage/distance from node=.7');
    expect(generate('parts:', '  C1: capacitor 1,1 1,3').tex).not.toContain('voltage/distance');
  });

  // 符号は素子の脇でよいが、字まで記号にくっつくと読みにくい。字だけ離す。
  test('holds the voltage label off the symbol', () => {
    expect(generate('parts:', '  C1: capacitor 1,1 1,3 v=vC').tex).toContain('voltage/american label distance=1.4');
  });

  // 電流の矢は circuitikz の既定 (記号の長さ / 16) だと 1 mm に満たず、印刷でも画面でも
  // 見えない (実機で指摘)。大きさは**その部品の線の中だけ**に効かせる。
  describe('arrow size', () => {
    const lineOf = (tex: string, id: string) => tex.split('\n').find((row) => row.includes(`$${id}$`)) ?? '';

    test('enlarges the current arrow on the line that draws it', () => {
      const { tex } = generate('parts:', '  R1: resistor 1,1 3,1 i=i', '  R2: resistor 1,3 3,3');

      expect(lineOf(tex, 'R_{1}')).toContain(', current arrow scale=');
      expect(lineOf(tex, 'R_{2}')).not.toContain('current arrow scale');
    });

    // 同じ currarrow で描くトランジスタと FET の矢まで膨らむ (実測)。図全体には掛けない。
    test('leaves the transistor arrows alone when a current is drawn', () => {
      const { tex } = generate('parts:', '  R1: resistor 1,1 3,1 i=i', '  Q1: npn 2,3', '  M1: nmos 5,3');

      expect(tex).not.toContain('\\ctikzset{current arrow scale');
    });

    // european と jis の電圧は、電流と同じ currarrow の矢で描く。同じ大きさにする。
    test('enlarges the voltage arrow in the standards that draw one', () => {
      for (const standard of ['european', 'jis']) {
        const { tex } = generate('parts:', '  C1: capacitor 1,1 1,3 v=vC', 'style:', `  standard: ${standard}`);

        expect(lineOf(tex, 'C_{1}')).toContain(', current arrow scale=');
      }
    });

    // 字は矢の北の端 (矢の大きさの半分の高さ) に付くが、描かれる三角はそれより背が高い。
    // 大きくした矢では字が三角に触れた (実測)。電流を描く図にだけ字の余白を広げる。
    test('holds the current label off the enlarged arrow', () => {
      expect(generate('parts:', '  R1: resistor 1,1 3,1 i=i').tex).toContain('\\ctikzset{bipole current style/.style={inner sep=');
      expect(generate('parts:', '  R1: resistor 1,1 3,1').tex).not.toContain('bipole current style');
    });

    // american の電圧は + と − の字で、矢が無い。要らない指定は書かない (約束 6)。
    test('writes no arrow size for the american voltage, which has no arrow', () => {
      expect(generate('parts:', '  C1: capacitor 1,1 1,3 v=vC').tex).not.toContain('current arrow scale');
    });
  });

  // 電験の問題用紙 (令和 6 年度上期 理論 問 15) の電圧の矢は、+ 側を指すまっすぐな矢。
  // circuitikz の european は − 側を指す弧 (ドイツ式) なので、jis では向きの印を返す。
  // + 側が先に書いた番地という規則は流儀に依らない。
  describe('voltage arrow direction', () => {
    const voltageOf = (standard: string, written: string) =>
      generate('parts:', `  C1: capacitor 1,1 1,3 ${written}`, 'style:', `  standard: ${standard}`).tex;

    test('points the jis arrow at the plus side, the address written first', () => {
      expect(voltageOf('jis', 'v=vC')).toContain('v^<=$v_{C}$');
    });

    test('turns the jis arrow the other way when the voltage is written reversed', () => {
      expect(voltageOf('jis', 'v<=vC')).toContain('v^>=$v_{C}$');
    });

    test('keeps the european arrow pointing at the minus side, as circuitikz draws it', () => {
      expect(voltageOf('european', 'v=vC')).toContain('v^>=$v_{C}$');
    });
  });

  // 電源の電圧の矢は circuitikz が丸の 60°〜120° の間に短く描くので、大きくした矢じりが
  // 軸と字を隠す (実測)。丸から離して長くする。試験の図も電源から離した矢。
  describe('voltage arrow of a source', () => {
    const lineOf = (tex: string, id: string) => tex.split('\n').find((row) => row.includes(`$${id}$`)) ?? '';
    const drawn = (standard: string) =>
      generate(
        'parts:',
        '  V1: sine 1,1 1,3 v=v',
        '  B1: battery 3,1 3,3 v=E',
        '  C1: capacitor 5,1 5,3 v=vC',
        'style:',
        `  standard: ${standard}`,
      ).tex;

    test('moves the arrow off the source in the standards that draw one', () => {
      for (const standard of ['european', 'jis']) {
        expect(lineOf(drawn(standard), 'V_{1}')).toContain(', voltage/bump a=');
        expect(lineOf(drawn(standard), 'B_{1}')).toContain(', voltage/bump a=');
      }
    });

    test('leaves the other parts and the american signs where they are', () => {
      expect(lineOf(drawn('jis'), 'C_{1}')).not.toContain('bump a');
      expect(drawn('american')).not.toContain('bump a');
    });
  });

  test('turns the MOSFET arrows on, so the figure tells n from p', () => {
    // 実機で「FET に必ず矢印を入れて n・p の区別が付くように」。circuitikz の
    // 既定では nmos と pmos の違いがゲートの丸だけで、印刷すると読み取れない。
    // **MOSFET を置いた図にだけ書く** (図に入る書き方を増やさない。約束 6)。
    expect(generate('parts:', '  M1: nmos 1,1').tex).toContain('\\ctikzset{tripoles/mos style/arrows}');
    expect(generate('parts:', '  M1: pmos 1,1').tex).toContain('\\ctikzset{tripoles/mos style/arrows}');
    expect(generate('parts:', '  R1: resistor 1,1 3,1').tex).not.toContain('mos style');
    // 接合形と、基板のピンを出す形 (`-e` / `-d`) は既定で矢が付いている。
    // この指定も効かない (実測) ので、書き足す理由が無い。
    expect(generate('parts:', '  J1: njfet 1,1').tex).not.toContain('mos style');
    expect(generate('parts:', '  M1: nmos-e 1,1').tex).not.toContain('mos style');
  });

  test('draws the same arrows in the tex it writes out', () => {
    const tex = generateLatex('parts:', '  R1: resistor 1,1 3,1 i=i1').tex;

    expect(tex).toContain('i>^=$i_{1}$');
  });

  test('writes a value that carries its own unit as it was written', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1 1/2W').tex).toContain('a^=$\\mathrm{1\\mbox{/}2W}$');
  });

  // グリッドの行英字と列数字は読んで数えるもの。図に合わせて選べる。
  test('draws the grid labels in the size and colour the style asked for', () => {
    const tex = generate('parts:', '  R1: resistor 1,1 3,1', 'style:', '  grid: on large red').tex;

    expect(tex).toContain('circuitnotered, font=\\LARGE');
    // 点のほうは grid-color のまま (字だけを選ぶ)。
    expect(tex).toContain('\\fill[gray, opacity=');
  });

  test('leaves the grid labels as they were when no word is written', () => {
    const tex = generate('parts:', '  R1: resistor 1,1 3,1', 'style:', '  grid: on').tex;

    expect(tex).toContain('gray, font=\\scriptsize');
  });

  test('scales the coordinates with the pitch', () => {
    const tex = generateTex(
      buildCircuit(parseFence('parts:\n  R1: resistor 1,1 3,2\n')!.doc!).circuit,
      { pitch: 1.5 },
    ).tex;

    expect(tex).toContain('\\coordinate (x3y2) at (3,-1.5);');
  });

  test('puts a dot where three or more ends meet', () => {
    // a3 は R1 の右端・C1 の上端・配線の端の 3 つが集まる。
    expect(generate(...RC_LOWPASS).tex).toContain('\\node[circ] at (x3y1) {};');
  });

  test('leaves two ends meeting without a dot, which is just a corner', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', '  C1: capacitor 3,1 3,3');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('puts one dot per junction, however many meet there', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 3,1 5,1',
      '  R3: resistor 3,1 3,3',
      '  R4: resistor 3,1 1,3',
    );

    expect(tex.match(/\\node\[circ\]/g)).toHaveLength(1);
  });

  test('does not turn a wire written twice into a junction', () => {
    // 同じ 2 点を結ぶ線が 2 本あっても、集まっている端は 1 つ。
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -- 5,1', '  - 3,1 -- 5,1');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('counts a wire end toward the junction', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 3,1 5,1',
      'wires:',
      '  - 3,1 -- 3,3',
    );

    expect(tex).toContain('\\node[circ] at (x3y1) {};');
  });

  test('writes each cell once even when several parts share it', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', '  R2: resistor 3,1 5,1');

    expect(tex.match(/\\coordinate \(x3y1\)/g)).toHaveLength(1);
  });
});

/**
 * 書き出す `.tex` は、フェンスの制約が強いる 3 点だけが違う。
 * ほかを変えるとプレビューで確かめた図と食い違うので、変わらないことも見る。
 */
describe('generateTex for latex', () => {
  test('spells a scaled value with siunitx, so micro comes out as µ', () => {
    // フェンスの TeX には siunitx が無く、u を字のまま出すしかない (実測)。
    expect(generateLatex('parts:', '  C1: ecap 1,1 3,1 100u').tex).toContain('a^=\\qty{100}{\\micro\\farad}');
    expect(generateLatex('parts:', '  R1: resistor 1,1 3,1 10k').tex).toContain('a^=\\qty{10}{\\kilo\\ohm}');
    expect(generateLatex('parts:', '  R1: resistor 1,1 3,1 10k').tex).toContain('\\usepackage{siunitx}');
  });

  test('writes a value with no unit of its own the same way as the fence does', () => {
    expect(generateLatex('parts:', '  D1: diode 1,1 3,1 1N4148').tex).toContain('a^=$\\mathrm{1N4148}$');
  });

  test('draws the real op amp, whose ± the fence TeX has no font for', () => {
    const tex = generateLatex('parts:', '  U1: opamp 3,3').tex;

    expect(tex).toContain('\\node[op amp] (part-U1) at (x3y3) {};');
    // 手描きの ± は要らなくなる。
    expect(tex).not.toContain('plain amp');
    expect(tex).not.toContain('.+)+(');
  });

  test('loads a font for the text the standard TeX fonts have no glyph for', () => {
    const tex = generateLatex('parts:', '  V1: vsource 1,1 3,1 電池').tex;

    expect(tex).toContain('\\usepackage{fontspec}');
    expect(tex).toContain('\\newfontfamily\\circuitunicode{Noto Sans CJK JP}');
    expect(tex).toContain('a^=\\circuittext{電池}');
  });

  test('leaves the font out when every value is plain ascii', () => {
    // フォントの行はその 1 行だけが別の環境で落ちうる。要るときだけ書く。
    const tex = generateLatex('parts:', '  R1: resistor 1,1 3,1 10k').tex;

    expect(tex).not.toContain('fontspec');
    expect(tex).not.toContain('circuitunicode');
  });

  test('keeps everything else the same as the fence, down to the coordinates', () => {
    const rows = ['parts:', '  R1: resistor 1,1 3,1 10k', '  C1: capacitor 3,1 3,3 100n', 'wires:', '  - 3,1 -- 5,1'];
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
  const withStyle = (style: string[], parts: string[] = ['parts:', '  R1: resistor 1,1 3,1']) =>
    generate(...parts, 'style:', ...style).tex;
  /** 左に並ぶ行の番号 (列の番号は上なので anchor=east を持たない)。 */
  const rowLabel = (row: number): RegExp => new RegExp(`anchor=east\\] at \\([^)]*\\) \\{${row}\\};`);

  test('draws no grid unless it is asked for', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1').tex).not.toContain('\\fill[gray, ');
  });

  test('shows where parts can go, numbering the rows as well as the columns', () => {
    const tex = withStyle(['  grid: on']);

    // 置ける位置の点
    expect(tex).toContain('\\fill[gray, ');
    // 列番号は上、行番号は左。**行も数** (番地の `x,y` の y と同じ数。52 の docs/126)
    expect(tex).toContain('{1};');
    expect(tex).toMatch(/anchor=east\] at \(-[\d.]+,0\) \{1\};/);
    expect(tex).not.toContain('{a};');
  });

  // 点は位置の目安なので薄く、行英字と列数字は読むものなので濃く出す。
  // 同じ色を濃さで分けているので、grid-color の 1 つの指定でどちらも決まる。
  test('draws the dots fainter than the row letters and column numbers', () => {
    const tex = withStyle(['  grid: on']);

    expect(tex).toContain('\\fill[gray, opacity=0.35]');
    expect(tex).toContain('\\node[gray, font=\\scriptsize]');
  });

  test('covers the cells the drawing uses', () => {
    const tex = withStyle(['  grid: on'], ['parts:', '  R1: resistor 1,1 3,3']);

    expect(tex).toMatch(rowLabel(3));
    expect(tex).toContain('{3};');
    expect(tex).not.toMatch(rowLabel(4));
  });

  test('reaches as far as grid-to asks, so there is room to move parts into', () => {
    const tex = withStyle(['  grid: on', '  grid-to: 5,5']);

    expect(tex).toMatch(rowLabel(5));
    expect(tex).toContain('{5};');
  });

  test('draws the grid before the circuit, so the circuit sits on top', () => {
    const tex = withStyle(['  grid: on']);

    expect(tex.indexOf('\\fill[gray, ')).toBeLessThan(tex.indexOf('to[R,'));
  });

  test('leaves the grid out of the line map, since no line asked for it', () => {
    const { lineMap, tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'style:', '  grid: on');
    const gridLine = tex.split('\n').findIndex((row) => row.includes('\\fill[gray, ')) + 1;

    expect(lineMap.get(gridLine)).toBeUndefined();
  });

  test('spaces the grid with the pitch the drawing uses', () => {
    const tex = withStyle(['  grid: on', '  pitch: 1']);

    expect(tex).toContain('\\coordinate (x3y1) at (2,0);');
  });

  test('switches the symbols to the european standard', () => {
    expect(withStyle(['  standard: european'])).toContain('\\begin{circuitikz}[european,');
  });

  // JIS C 0617 (電験三種の問題用紙の図) は抵抗が箱でコイルは半円の連なり (european の
  // 黒い箱ではない)。論理ゲートは MIL のまま。部品ごとの鍵で書き、circuitikz の束に委ねない。
  test('draws jis with box resistors, cute inductors and MIL gates', () => {
    expect(withStyle(['  standard: jis'])).toContain(
      '\\begin{circuitikz}[european resistors, cute inductors, european voltages, european currents, american ports, circuitikz/straight=true, line width=',
    );
  });

  test('keeps american as the default, which the memo verified', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1').tex).toContain('[american,');
  });

  test('draws with the line width that was asked for', () => {
    expect(withStyle(['  wire-width: 1.6'])).toContain('line width=1.6pt');
  });
});

describe('折れた配線', () => {
  test('writes the operator the writer chose', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -| 5,3');

    expect(tex).toContain('\\draw (x3y1) -| (x5y3);');
  });

  test('gives the corner a coordinate so the drawing can reach it', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -| 5,3');

    // a3 -| c5 の曲がり角は a5 (先に横へ)。
    expect(tex).toContain('\\coordinate (x5y1) at (8,0);');
  });

  test('leaves a plain corner without a dot', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -| 5,3');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('puts a dot where something else ends on the corner', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1,1 3,1',
      '  R2: resistor 5,1 7,1',
      'wires:',
      '  - 3,1 -| 5,3',
    );

    // 曲がり角 a5 に R2 の端が乗るので、そこは分岐。
    expect(tex).toContain('\\node[circ] at (x5y1) {};');
  });

  test('leaves a bend that never turns as a straight line', () => {
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1', 'wires:', '  - 3,1 -| 7,1');

    expect(tex).toContain('\\draw (x3y1) -| (x7y1);');
    expect(tex).not.toContain('\\node[circ]');
  });
});

describe('T 字の黒丸', () => {
  test('puts a dot where an end lands in the middle of a wire', () => {
    const { tex } = generate('parts:', '  R1: resistor 3,2 3,4', 'wires:', '  - 1,2 -- 5,2');

    expect(tex).toContain('\\node[circ] at (x3y2) {};');
  });

  test('leaves a plain crossing without a dot', () => {
    const { tex } = generate('parts:', '  R1: resistor 3,1 3,3', '  R2: resistor 1,2 5,2');

    expect(tex).not.toContain('\\node[circ]');
  });

  test('gives the touched cell a coordinate to put the dot on', () => {
    const { tex } = generate('parts:', '  R1: resistor 3,2 3,4', 'wires:', '  - 1,2 -- 5,2');

    expect(tex).toContain('\\coordinate (x3y2)');
  });
});

describe('多端子部品', () => {
  test('places the symbol on the cell and names it after the part', () => {
    const { tex } = generate('parts:', '  Q1: npn 3,3');

    // 座標には番地の名前が付いているので、そのまま指せる。
    expect(tex).toContain('\\coordinate (x3y3) at (4,-4);');
    // ノード名には接頭辞を付ける (番地の座標と同じ名前空間なので)。
    expect(tex).toContain('\\node[npn] (part-Q1) at (x3y3) {};');
  });

  test('draws a wire to the anchor the pin names', () => {
    const { tex } = generate('parts:', '  Q1: npn 3,3', '  R1: resistor 1,1 3,1', 'wires:', '  - Q1.B -- 3,1');

    // ピンの綴りは circuitikz のアンカー名に揃える。
    expect(tex).toContain('\\draw (part-Q1.base) -- (x3y1);');
  });

  test('swaps the opamp for a symbol the fence TeX can draw', () => {
    const { tex } = generate('parts:', '  U1: opamp 5,3');

    // op amp はフォントが無くプロセスごと落ちる。plain amp に置き換える。
    expect(tex).toContain('\\node[plain amp] (part-U1)');
    expect(tex).not.toContain('op amp');
  });

  test('draws the plus and minus the plain symbol does not carry', () => {
    const { tex } = generate('parts:', '  U1: opamp 5,3');

    // 字では書かない。数式モードは別の字形になり、テキストの - は + に対して
    // 細くて短い。線なら太さも長さも揃う。
    expect(tex).not.toContain('{$-$}');
    expect(tex).not.toContain('{{-}}');
    // 横棒が 2 本 (+ と -) と、+ の縦棒が 1 本。
    expect(tex.match(/\\draw \(\$\(\$\(part-U1\./g)).toHaveLength(3);
  });

  test('sets the plus and the minus in from their pins, toward each other', () => {
    const { tex } = generate('parts:', '  U1: opamp 5,3');

    // ± はピンのアンカーから**もう一方のピンのほうへ**寄せて置く。外へ寄せると
    // 三角形の縁とピンの線に挟まれて、どちらのピンの印か読めなくなる。
    // 向き (`+up`) でピンが入れ替わっても、寄せる先が足そのものなので付いていく。
    expect(tex).toContain('($(part-U1.+)!');
    expect(tex).toContain('!(part-U1.-)$)');
    expect(tex).toContain('($(part-U1.-)!');
    expect(tex).toContain('!(part-U1.+)$)');
  });

  test('gives the plus and minus the same bar, so they balance', () => {
    const { tex } = generate('parts:', '  U1: opamp 5,3');
    const bars = [...tex.matchAll(/-- \+\+\(([-\d.]+),0\);/g)].map((match) => match[1]);

    // 横棒どうしが同じ長さ。
    expect(new Set(bars).size).toBe(1);
  });

  test('turns the symbol the way the fence asked', () => {
    expect(generate('parts:', '  U1: opamp 5,3 +up').tex).toContain('plain amp, noinv input up');
  });

  test('writes the part number under the symbol', () => {
    expect(generate('parts:', '  Q1: npn 3,3 2SC1815').tex).toContain('2SC1815');
  });

  test('hangs the part number off the symbol border, not the middle of the symbol', () => {
    const { tex } = generate('parts:', '  Q1: npn 3,3 2SC1815');

    // label=below: は記号ではなくノードの (空の) 文字を基準にするので、
    // 記号の体の上に型番が乗る。南のアンカーに掛ければどの記号でも下に出る。
    expect(tex).toContain('\\node[font=\\scriptsize, anchor=north] at (part-Q1.south) {$\\mathrm{2SC1815}$};');
    expect(tex).not.toContain('label={');
  });

  test('hangs it off the border for the tall symbols too', () => {
    expect(generate('parts:', '  T1: transformer 5,3 1to1').tex).toContain('at (part-T1.south)');
    expect(generate('parts:', '  U1: opamp 5,3 LM358').tex).toContain('at (part-U1.south)');
  });

  test('pulls in calc, which the hand written plus and minus need', () => {
    expect(generate('parts:', '  U1: opamp 5,3').tex).toContain('\\usetikzlibrary{calc}');
  });
});

describe('丸い電源の記号', () => {
  test('swaps the round sources for the empty circle', () => {
    // circuitikz の V / sV / sqV / vsourcetri は**中身を 90 度回して**描く
    // (縦置き前提)。横に置くと - が縦棒になり、波形も寝る。
    for (const [type, symbol] of [['vsource', 'V'], ['sine', 'sV'], ['square', 'sqV'], ['triangle', 'vsourcetri']]) {
      const { tex } = generate('parts:', `  V1: ${type} 1,1 3,1 5`);

      expect(tex).toContain('to[esource');
      expect(tex).not.toContain(`to[${symbol},`);
    }
  });

  test('draws the plus and minus of the dc source as lines', () => {
    const { tex } = generate('parts:', '  V1: vsource 1,1 3,1 5');

    // オペアンプの ± と同じ理由で字では書かない (フェンスのフォントでは
    // $-$ が別の字形になり、テキストの - は + に対して細くて短い)。
    expect(tex).not.toContain('{$-$}');
    // 横棒が 2 本 (+ と -) と、+ の縦棒が 1 本。
    expect(tex.match(/^\\draw \([-\d.]+,[-\d.]+\) -- \+\+\(/gm)).toHaveLength(3);
  });

  test('puts the plus on the side of the address written first', () => {
    // ecap や battery と同じ約束。先に書いた番地が + 側。
    const { tex } = generate('parts:', '  V1: vsource 1,1 3,1 5');
    const xs = [...tex.matchAll(/^\\draw \(([-\d.]+),[-\d.]+\) -- \+\+\([-\d.]+,0\);/gm)]
      .map((match) => Number(match[1]));

    // a1 は x=0、a3 は x=4。丸の真ん中 (x=2) より a1 寄りが + の横棒。
    expect(Math.min(...xs)).toBeLessThan(2);
    expect(Math.max(...xs)).toBeGreaterThan(2);
  });

  test('keeps the minus bar horizontal, which is what the circuitikz symbol does not', () => {
    const { tex } = generate('parts:', '  V1: vsource 1,1 3,1 5');

    // - は横棒 1 本。縦棒は + のぶんの 1 本だけ。
    expect(tex.match(/-- \+\+\(0,[-\d.]+\);/g)).toHaveLength(1);
  });

  test('keeps the signs well inside the circle, off the outline and the leads', () => {
    // 実機で「+ と - が丸の輪郭と左右の導線に重なっている」と指摘された。
    // 導線は輪郭で止まるので、**輪郭に触れなければ導線にも触れない**。
    const { tex } = generate('parts:', '  V1: vsource 1,1 3,1 5');
    // 丸の半径は bipoles/length (1.2) × esource の直径の割合 (0.6) の半分。
    const radius = (1.2 * 0.6) / 2;
    // a1 は (0,0)、a3 は (4,0) なので丸の真ん中は (2,0)。
    const ends = [...tex.matchAll(/^\\draw \((-?[\d.]+),(-?[\d.]+)\) -- \+\+\((-?[\d.]+),(-?[\d.]+)\);/gm)]
      .flatMap(([, x, y, dx, dy]) => {
        const [ax, ay] = [Number(x), Number(y)];
        return [[ax, ay], [ax + Number(dx), ay + Number(dy)]];
      });
    const reach = Math.max(...ends.map(([x, y]) => Math.hypot((x ?? 0) - 2, y ?? 0)));

    expect(ends).toHaveLength(6);
    // 線の太さ (輪郭は倍幅) を引いても隙間が残るところまで内側へ。
    expect(reach).toBeLessThan(radius * 0.65);
    // 縮めすぎて読めなくなっていないことも見る。
    expect(reach).toBeGreaterThan(radius * 0.4);
  });

  test('draws the waveform of the ac sources across the circle', () => {
    // 波形は figure の座標系に描く。斜めに置いても波は水平のままで、
    // 計器の straight instruments と同じ読み方になる。
    expect(generate('parts:', '  V1: sine 1,1 3,1 5').tex).toContain(' sin ++(');
    expect(generate('parts:', '  V1: square 1,1 3,1 5').tex).toMatch(/\(1\.82,0\) -- \+\+\(0,0\.18\)/);
    expect(generate('parts:', '  V1: triangle 1,1 3,1 5').tex).toMatch(/\(1\.82,0\) -- \+\+\(0\.09,0\.135\)/);
  });

  test('draws the same symbol in the tex it writes out', () => {
    // フェンスの都合ではなく circuitikz の描き方の問題なので、
    // 書き出す .tex も同じ形にする (約束 7)。
    const { tex } = generateLatex('parts:', '  V1: vsource 1,1 3,1 5');

    expect(tex).toContain('to[esource');
    expect(tex).not.toContain('to[V,');
  });

  test('keeps the id and the value on the symbol', () => {
    const { tex } = generate('parts:', '  V1: vsource 1,1 3,1 5');

    expect(tex).toContain('l_=$V_{1}$');
    expect(tex).toContain('5\\,\\mathrm{V}');
  });
});

describe('電源レールの記号', () => {
  test('writes the id inside the rail symbol', () => {
    // 端子は白丸の横に名前を添えるが、レールは矢印の先に名前が出る。
    const { tex } = generate('parts:', '  V5: vcc 1,1', '  VN: vee 1,3');

    expect(tex).toContain('\\node[vcc] at (x1y1) {V5}; % line 2');
    expect(tex).toContain('\\node[vee] at (x1y3) {VN}; % line 3');
  });

  test('writes the voltage instead of the id when the rail has one, and keeps the id as the net', () => {
    const { tex } = generate('parts:', '  VCC: vcc 1,1 5V', '  VEE: vee 1,3 5V');

    expect(tex).toContain('\\node[vcc] at (x1y1) {+5V}; % line 2');
    expect(tex).toContain('\\node[vee] at (x1y3) {$-$5V}; % line 3');
  });
});

describe('ピンのある 2 端子部品', () => {
  test('names the bipole so a wire can reach its leg', () => {
    const { tex } = generate('parts:', '  P1: potentiometer 1,1 3,1 10k', 'wires:', '  - P1.w -- 2,3');

    expect(tex).toContain(
      '\\draw (x1y1) to[potentiometer, n=part-P1, l_=$P_{1}$, a^=$10\\,\\mathrm{k}\\Omega$] (x3y1); % line 2',
    );
    expect(tex).toContain('\\draw (part-P1.wiper) -- (x2y3); % line 4');
  });

  test('leaves the bipoles without legs unnamed', () => {
    // 名前を付けるのはピンを指せる種類だけ。ほかは TeX を増やさない。
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1');

    expect(tex).toContain('\\draw (x1y1) to[R, l_=$R_{1}$] (x3y1); % line 2');
  });
});

describe('DIP の IC', () => {
  test('writes the pin count into the symbol and the part number under it', () => {
    // ピンの名前の表に無い型番 (表にある型番は dipPinNames.test.ts)。
    const { tex } = generate('parts:', '  U1: dip8 2,3 LM1875', 'wires:', '  - U1.1 |- 1,1');

    // 立てた箱の中はピンの番号で埋まるので、型番は下の外 (labelOverlap.test.ts)。
    expect(tex).toContain('\\node[dipchip, num pins=8, font=\\scriptsize] (part-U1) at (x2y3) {}; % line 2');
    expect(tex).toContain('\\node[font=\\scriptsize, anchor=north] at (part-U1.south) {$\\mathrm{LM1875}$}; % line 2');
    expect(tex).toContain('\\draw (part-U1.pin 1) |- (x1y1); % line 4');
  });

  test('keeps the box empty when no part number is written', () => {
    const { tex } = generate('parts:', '  U1: dip8 2,3');

    expect(tex).toContain('\\node[dipchip, num pins=8, font=\\scriptsize] (part-U1) at (x2y3) {}; % line 2');
  });
});

describe('記号だけでは見分けが付かない部品', () => {
  test('writes the mark under the id as a second label line', () => {
    const { tex } = generate('parts:', '  R5: thermistor-ntc 1,1 3,1 10k');

    expect(tex).toContain(
      '\\draw (x1y1) to[thR, l2_=$R_{5}$ and NTC, a^=$10\\,\\mathrm{k}\\Omega$] (x3y1); % line 2',
    );
  });

  test('carries the options a symbol needs into the bipole', () => {
    const { tex } = generate('parts:', '  M1: ohmmeter 1,1 3,1');

    expect(tex).toContain('\\draw (x1y1) to[rmeter, t={$\\Omega$}, l_=$M_{1}$] (x3y1); % line 2');
  });
});

describe('可変の矢の向き', () => {
  // 可変抵抗・可変コンデンサの矢は、**どう置いても右上を向く**のが回路図の慣習。
  // circuitikz は矢を記号と一緒に回すので、置いた向きごとに返し方を選ぶ。
  // 表は 4 方向 × 4 通り (なし・mirror・invert・両方) を焼いて目で見て決めた
  // (52 の docs/93)。**フェンスの 1.0 は vR と vC で返し方が違い**、
  // 手元の LaTeX (1.6.6) は vR も vC も同じ。
  const LAID = [
    ['左から右', '1,1 3,1'],
    ['右から左', '3,1 1,1'],
    ['上から下', '1,1 1,3'],
    ['下から上', '1,3 1,1'],
  ] as const;

  const optionsBetween = (tex: string, symbol: string): string =>
    new RegExp(`to\\[${symbol}(.*?), l_=`).exec(tex)?.[1] ?? '(記号が無い)';

  const cases = [
    ['resistor-var', 'vR', 'fence', [', mirror, invert', '', ', mirror', ', invert']],
    ['capacitor-var', 'vC', 'fence', [', mirror', ', invert', ', mirror, invert', '']],
    ['resistor-var', 'vR', 'latex', ['', ', mirror, invert', ', invert', ', mirror']],
    ['capacitor-var', 'vC', 'latex', ['', ', mirror, invert', ', invert', ', mirror']],
  ] as const;

  for (const [type, symbol, target, expected] of cases) {
    test(`turns the ${type} arrow to the upper right in the ${target} tex`, () => {
      const got = LAID.map(([, ends]) => {
        const rows = ['parts:', `  X1: ${type} ${ends}`];
        const { tex } = target === 'fence' ? generate(...rows) : generateLatex(...rows);
        return optionsBetween(tex, symbol);
      });

      expect(got).toEqual(expected);
    });
  }

  // 抵抗を箱で描く流儀 (european・jis) では、**フェンスの 1.0 の vR が箱の矢を
  // vC と同じ引き方で描く**ので、ギザギザの表とは返し方が違う。手元の LaTeX は同じ表。
  const boxed = [
    ['resistor-var', 'vR', 'fence', [', mirror', ', invert', ', mirror, invert', '']],
    ['capacitor-var', 'vC', 'fence', [', mirror', ', invert', ', mirror, invert', '']],
    ['resistor-var', 'vR', 'latex', ['', ', mirror, invert', ', invert', ', mirror']],
    ['capacitor-var', 'vC', 'latex', ['', ', mirror, invert', ', invert', ', mirror']],
  ] as const;

  for (const standard of ['jis', 'european'] as const) {
    for (const [type, symbol, target, expected] of boxed) {
      test(`turns the ${type} arrow to the upper right in the ${target} tex drawn ${standard}`, () => {
        const got = LAID.map(([, ends]) => {
          const rows = ['parts:', `  X1: ${type} ${ends}`, 'style:', `  standard: ${standard}`];
          const { tex } = target === 'fence' ? generate(...rows) : generateLatex(...rows);
          return optionsBetween(tex, symbol);
        });

        expect(got).toEqual(expected);
      });
    }
  }

  test('keeps the value on its usual side when the arrow is turned', () => {
    // mirror / invert は記号だけを返す。ID は l_、値は a^ のまま。
    expect(generate('parts:', '  R2: resistor-var 1,1 3,1 10k').tex)
      .toContain('\\draw (x1y1) to[vR, mirror, invert, l_=$R_{2}$, a^=$10\\,\\mathrm{k}\\Omega$] (x3y1);');
  });

  test('picks the nearer axis for a part laid on a slant', () => {
    // 斜めに置いた部品は、横と縦の近いほうの向きで返す。
    expect(optionsBetween(generate('parts:', '  X1: resistor-var 1,1 4,2').tex, 'vR')).toBe(', mirror, invert');
    expect(optionsBetween(generate('parts:', '  X1: resistor-var 1,1 2,4').tex, 'vR')).toBe(', mirror');
  });
});

/**
 * グラウンドの記号は、3 本の横棒の間隔が記号の側で決め打ちになっている。
 * 線を太くすると棒だけが太って間隔を食い潰し、**棒が 1 つの塊に見える**
 * (既定の 0.8pt で隙間が棒の 1/4 しか残らないと実測)。
 * 潰れない大きさまで記号を広げる。
 */
describe('グラウンドの記号の大きさ', () => {
  const GROUND = ['parts:', '  R1: resistor 1,1 1,3', '  G1: ground 1,3'];

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
    const { tex } = generate('parts:', '  R1: resistor 1,1 3,1');

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
  const STAMPED = ['parts:', '  R1: resistor 1,1 3,1', 'style:', '  stamp: on'];

  // 補助の generate は刻印を外すので、既定はここだけ generateTex に直に渡して見る。
  const raw = (...rows: string[]) => {
    const { doc } = parseFence(`${rows.join('\n')}\n`);
    if (doc === null) throw new Error('YAML を読めませんでした');
    return generateTex(buildCircuit(doc).circuit, { style: doc.style });
  };

  test('stamps the figure without being asked', () => {
    const { tex, notes } = raw('parts:', '  R1: resistor 1,1 3,1');

    expect(tex).toContain('circuitstamp');
    expect(notes.at(-1)).toMatchObject({ text: `circuit-fence ${VERSION}` });
  });

  test('writes nothing when the stamp is turned off', () => {
    const { tex, notes } = raw('parts:', '  R1: resistor 1,1 3,1', 'style:', '  stamp: off');

    expect(tex).not.toContain('circuitstamp');
    expect(notes).toEqual([]);
  });

  test('stamps the version of the tool that generated the figure', () => {
    // フェンスでは字を TeX に渡さず、描き上がった SVG に差し込む (題と同じ道)。
    expect(generate(...STAMPED).notes.at(-1)).toMatchObject({ text: `circuit-fence ${VERSION}` });
  });

  test('hangs the stamp off the finished drawing, not the grid', () => {
    // 図がどこまで広がったかは描き終わるまで決まらない。番地から測ると、
    // ラベルや注釈がはみ出したぶんに刻印が重なる。
    expect(generate(...STAMPED).tex).toContain('current bounding box.south east');
  });

  test('stamps last so the whole drawing is inside the box it measures', () => {
    const lines = (generate(...STAMPED, 'notes:', '  - text 1,3 "あ"').tex ?? '').split('\n');
    const stamp = lines.findIndex((line) => line.includes('circuitstamp'));

    expect(stamp).toBeGreaterThan(-1);
    // 目印の次は場所取り、その次が図の終わり。刻印より後には何も描かない。
    expect(lines[stamp + 2]).toBe('\\end{circuitikz}');
  });

  test('stamps in the size a note is written in when nothing says otherwise', () => {
    // 刻印だけ別の大きさにすると、同じ図の中で字の大きさが 2 通りになる。
    // 書き出し (`- source`) の既定と同じ物差しに乗せる。
    expect(generate(...STAMPED).tex).toContain(`font=${noteFontTex(DEFAULT_NOTE_SIZE, false)}`);
  });

  test('lets the stamp hang off the right edge of the drawing', () => {
    // 右下に掛けるものなので、差し込む字は目印から左へ伸ばす。
    expect(generate(...STAMPED).notes.at(-1)).toMatchObject({ align: 'right', mono: false, bold: false });
  });

  test('keeps the stamp in front of the title in the order the marks are drawn', () => {
    // 差し込みは目印の並び順で当てる。題 → 刻印の順に描くので、並びも同じ順。
    const { notes } = generate('title: 図01 題', ...STAMPED);

    expect(notes.map((note) => note.text)).toEqual(['図01 題', `circuit-fence ${VERSION}`]);
  });

  test('reserves the room the stamp takes so it does not hang outside the drawing', () => {
    // 目印は 1 文字。本物の字の幅を測って箱に入れておかないと、図が狭い
    // ときに刻印だけ外へはみ出す。
    expect(generate(...STAMPED).tex).toContain('rectangle');
  });

  test('draws the stamp in the grid colour so it stays subordinate to the circuit', () => {
    // gray は描き上がった SVG でグリッドの色に塗り替わる (render/theme.ts)。
    // フェンスでは差し込む字に、書き出す .tex では TeX の色として乗る。
    expect(generate(...STAMPED).notes.at(-1)).toMatchObject({ color: 'gray' });
    expect(generateLatex(...STAMPED).tex).toContain('gray');
  });

  test('writes the stamp into the exported tex as the字 itself', () => {
    // 書き出す .tex には差し込む先が無いので、字は TeX が組む。組み方は違うが
    // **出る字は同じ**なので、約束 7 の 3 点には入らない (注釈と同じ扱い)。
    expect(generateLatex(...STAMPED).tex).toContain(`circuit-fence ${VERSION}`);
    expect(generateLatex(...STAMPED).notes).toEqual([]);
  });

  test('defines the mark colour for the stamp even when the drawing has no title and no notes', () => {
    // 題も注釈も無い図で、刻印の目印の色が定義されず TeX が止まった (circuitnotemark を知らない)。
    const tex = raw('parts:', '  R1: resistor 1,1 3,1').tex ?? '';

    expect(tex).toContain('circuitstamp');
    expect(tex).toContain('\\definecolor{circuitnotemark}');
  });

  test('hangs the stamp one text line below the drawing, so it does not touch the lowest symbol', () => {
    // 図の下の端 (グラウンドの記号) に刻印がくっついて読みにくかった。
    const row = (generate(...STAMPED).tex ?? '').split('\n').find((line) => line.includes('(circuitstamp)'));

    expect(row).toMatch(/at \(\[yshift=-[\d.]+cm\]current bounding box\.south east\)/);
  });

  test('carries no line number, because no line of the fence is to blame for it', () => {
    const stamped = (generate(...STAMPED).tex ?? '').split('\n').filter((row) => row.includes('circuitstamp'));

    expect(stamped.length).toBeGreaterThan(0);
    for (const row of stamped) expect(row).not.toContain('% line');
  });
});

describe('generateTex の題 (title)', () => {
  const titled = (...rows: string[]) => generate('title: 回路図01 テスト', ...rows);
  const RESISTOR = ['parts:', '  R1: resistor 1,1 3,1'];

  test('writes nothing when the fence has no title', () => {
    expect(generate(...RESISTOR).tex).not.toContain('current bounding box.north west');
  });

  test('hangs the title off the top of the finished drawing', () => {
    // 番地には a より上が無いので、題は図の広がりから測るしかない。
    expect(titled(...RESISTOR).tex).toContain('current bounding box.north west');
  });

  test('lifts the title clear of the top of the drawing, in both the fence and the exported tex', () => {
    // 題の字は TeX の目印の場所に後から差し込む。日本語の太字は目印より下へはみ出し、
    // 隙間が inner sep の 2pt だけだと一番上の記号 (計器の丸など) に字が重なった (実測)。
    // inner sep を広げると左にもずれるので、上へだけ持ち上げる。
    const fence = titled(...RESISTOR).tex ?? '';
    const latex = generateLatex('title: 回路図01', ...RESISTOR).tex ?? '';

    for (const tex of [fence, latex]) {
      const line = tex.split('\n').find((row) => row.includes('current bounding box.north west')) ?? '';
      expect(line).toContain('yshift=4pt');
      expect(line).toContain('inner sep=2pt');
    }
  });

  test('draws the title after the notes, so it clears everything drawn', () => {
    const lines = (titled(...RESISTOR, 'notes:', '  - text 1,3: あ').tex ?? '').split('\n');
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
    const { notes } = titled(...RESISTOR, 'notes:', '  - text 1,3: あ');

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
    ['刻印', 'style:\n  stamp: on', '\\node[anchor=north east'],
  ])('%s は \\node から始まる', (_label, extra, expected) => {
    const { tex } = generate(...`parts:\n  R1: resistor 1,1 3,1\n${extra}`.split('\n'));

    expect(tex).toContain(expected);
  });

  test('刻印の場所取りは \\path から始まる', () => {
    expect(generate('parts:', '  R1: resistor 1,1 3,1', 'style:', '  stamp: on').tex)
      .toContain('\\path (circuitstamp');
  });

  test('題の場所取りは \\path から始まる', () => {
    expect(generate('title: 回路図01', 'parts:', '  R1: resistor 1,1 3,1').tex).toContain('\\path (circuittitle');
  });

  test('どの行も TeX の命令か注釈で始まっている', () => {
    const { tex } = generate('title: 回路図01', 'parts:', '  R1: resistor 1,1 3,1', 'style:', '  stamp: on');

    for (const line of (tex ?? '').split('\n')) {
      expect(line, line).toMatch(/^(\\|%)/);
    }
  });
});

describe('generateTex for addresses between the cells', () => {
  test('names the coordinate without a dot, which TikZ reads as an anchor', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1.5,1 3.5,1 10k',
      'wires:',
      '  - 1,1.5 -- 3,1.5',
    );

    expect(tex).toContain('\\coordinate (x1p5y1) at (1,0);');
    expect(tex).toContain('\\coordinate (x3p5y1) at (5,0);');
    expect(tex).toContain('\\coordinate (x1y1p5) at (0,-1);');
    expect(tex).toContain('\\draw (x1p5y1) to[R');
    expect(tex).toContain('\\draw (x1y1p5) -- (x3y1p5);');
  });

  test('draws the grid on the whole cells, and wide enough to cover a half step', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1.5,1 2.5,2 10k',
      'style:',
      '  grid: on',
    );

    // 点は交点の上にだけ打つ。間の番地はその点と点の間に乗る。
    expect(tex).toContain('\\foreach \\x in {0,2,4} {\\foreach \\y in {0,-2}');
  });

  test('widens the grid to the next whole cell when a part hangs past the last one', () => {
    const { tex } = generate(
      'parts:',
      '  R1: resistor 1,1 1,1.5 10k',
      'style:',
      '  grid: on',
    );

    // 行 a.5 は a と b の間なので、b の点まで打たないと図から格子がはみ出す。
    expect(tex).toContain('\\foreach \\x in {0} {\\foreach \\y in {0,-2}');
  });
});

/**
 * 向きの受け渡し。**書かれた語 → circuitikz のオプション**で、並びは
 * `rotate` が先・`xscale` が後 (実機で確かめた「反転してから回す」の順)。
 */
describe('向き', () => {
  test('turns a multi terminal part clockwise, the way the word reads', () => {
    // 書き手には時計回りを見せる。TikZ の正は反時計回りなので符号を返す。
    expect(generate('parts:', '  Q1: npn 3,3 r90').tex).toContain('\\node[npn, rotate=-90] (part-Q1)');
    expect(generate('parts:', '  Q1: npn 3,3 r270').tex).toContain('rotate=-270');
  });

  test('mirrors left to right', () => {
    expect(generate('parts:', '  Q1: npn 3,3 mirror').tex).toContain('\\node[npn, xscale=-1] (part-Q1)');
  });

  test('writes the rotation first, so the mirror happens first', () => {
    // TikZ は後に書いたオプションを先に効かせる。逆順に書くと姿が変わる (実機で確認)。
    expect(generate('parts:', '  Q1: npn 3,3 r90 mirror').tex).toContain('rotate=-90, xscale=-1');
  });

  test('leaves an unturned part exactly as it was', () => {
    expect(generate('parts:', '  Q1: npn 3,3').tex).toContain('\\node[npn] (part-Q1) at (x3y3) {};');
  });

  test('turns a ground, which is the one terminal part that can turn', () => {
    expect(generate('parts:', '  G1: ground 3,3 r90').tex).toContain('\\node[ground, rotate=-90] at (x3y3) {};');
  });

  test('keeps the op amp sign order alongside the turn', () => {
    const { tex } = generate('parts:', '  U1: opamp 5,3 +up r90');

    expect(tex).toContain('noinv input up');
    expect(tex).toContain('rotate=-90');
  });

  /**
   * 型番は別ノードなので**字は立ったまま**だが、掛けているアンカーは記号と
   * 一緒に回る。回った先で下に来るアンカーを選び直す (実機で確認した挙動)。
   */
  describe('型番の掛け先', () => {
    const anchorOf = (turn: string) => {
      const { tex } = generate('parts:', `  Q1: npn 3,3 ${turn} 2SC1815`.trimEnd());
      return /anchor=north\] at \(part-Q1\.(\w+)\)/.exec(tex)?.[1] ?? null;
    };

    test('hangs under the symbol however it is turned', () => {
      expect(anchorOf('')).toBe('south');
      expect(anchorOf('r90')).toBe('east');
      expect(anchorOf('r180')).toBe('north');
      expect(anchorOf('r270')).toBe('west');
    });

    test('swaps east and west when mirrored, since left and right change places', () => {
      expect(anchorOf('mirror')).toBe('south');
      expect(anchorOf('r90 mirror')).toBe('west');
      expect(anchorOf('r270 mirror')).toBe('east');
    });
  });

  /**
   * 箱の中に書いた字は**記号と一緒に回る** (実機で確認。`r180` で逆さま)。
   * 向きが付いたら、中心に立てた別ノードで書く。
   */
  describe('箱に書く型番', () => {
    test('keeps the value inside the box while the box stands upright', () => {
      expect(generate('parts:', '  U1: dip8 3,3 NE555').tex).toContain('{$\\mathrm{NE555}$};');
    });

    test('lifts it out to an upright node once the box is turned', () => {
      const { tex } = generate('parts:', '  U1: dip8 3,3 r90 LM1875');

      expect(tex).toContain('\\node[dipchip, num pins=8, font=\\scriptsize, rotate=-90] (part-U1) at (x3y3) {};');
      expect(tex).toContain('at (part-U1.center) {$\\mathrm{LM1875}$};');
    });
  });

  describe('オペアンプの ±', () => {
    test('steps them in at a right angle to the pins once the symbol is turned', () => {
      // 絶対値の横ずらしは 90 度に付いてこず、記号の外へ出た (実機で確認)。
      // 中心へ寄せる形は + と − が重なったので、辺に直角に入る形にした。
      expect(generate('parts:', '  U1: opamp 5,3 r90').tex).toContain('!0.44cm!-90:(part-U1.-)');
    });

    test('turns the step the other way when mirrored, since left and right swap', () => {
      expect(generate('parts:', '  U1: opamp 5,3 mirror').tex).toContain('!0.44cm!90:(part-U1.-)');
    });

    test('draws them centred on the point, so a mirrored bar stays inside', () => {
      // 点から右へ伸ばすと、反転した記号で横棒が縁をまたいで外へ出た (実測)。
      expect(generate('parts:', '  U1: opamp 5,3 mirror').tex).toContain('+(-0.14,0)$) -- ++(0.28,0);');
    });

    test('leaves the upright symbol exactly as it was', () => {
      // 立っているときの値は実物の回路図に寄せて詰めたもの。**図を変えない**
      // のは向きを書いていない図の約束 (スナップショットも見張っている)。
      const { tex } = generate('parts:', '  U1: opamp 5,3');

      expect(tex).toContain('+(0.44,0)$) -- ++(0.28,0);');
      expect(tex).not.toContain('part-U1.center');
    });
  });
});

describe('マイコンボード', () => {
  const board = (...rows: string[]) => {
    const { doc } = parseFence(`${rows.join('\n')}\n`);
    if (doc === null) throw new Error('YAML を読めませんでした');
    return generateTex(buildCircuit(doc).circuit, { style: unstamped(doc.style) });
  };

  test('draws it as a chip whose numbers are hidden, since the names take their place', () => {
    const { tex } = board('parts:', '  U1: pico 2,2');

    expect(tex).toContain('num pins=40');
    expect(tex).toContain('hide numbers');
  });

  test('puts a mark on every leg, one for each name', () => {
    // フェンスは字を TeX に渡さない (約束 7) — TeX に描かせると字送りが狂う。
    const { tex, notes } = board('parts:', '  U1: pico 2,2');
    const marks = (tex.match(/\.bpin \d+\)/g) ?? []).length;

    expect(marks).toBe(40);
    expect(notes.slice(0, 3).map((one) => one.text)).toEqual(['01 GP0', '02 GP1', '03 GND3']);
  });

  test('writes the pin number on the outer end of every leg name', () => {
    // 実機で頼まれた形 —「01 GP0」「02 GP1」、右の列は「VBUS 40」。
    // **番号は常に箱の外側の端**。字は縁から中へ伸びるので、左の列は番号が先、
    // 右の列は名前が先になる。
    const { notes } = board('parts:', '  U1: pico 2,2');

    // 左の列 (1〜20 番) は番号が先。1 桁は 0 を足して 2 桁に揃える。
    expect(notes[0]?.text).toBe('01 GP0');
    expect(notes[19]?.text).toBe('20 GP15');
    // 右の列 (21〜40 番) は名前が先で、番号が外 (右) の端。
    expect(notes[20]?.text).toBe('GP16 21');
    expect(notes[38]?.text).toBe('VSYS 39');
    expect(notes[39]?.text).toBe('VBUS 40');
  });

  test('keeps the number on the outer end after the board is turned', () => {
    // 回すと左の列が上の辺、右の列が下の辺へ移る。どちらも縁から中へ読むので、
    // **番号はどちらも先** (外側の端) になる。
    const { notes } = board('parts:', '  U1: pico 2,2 r90');

    expect(notes[0]?.text).toBe('01 GP0');
    expect(notes[39]?.text).toBe('40 VBUS');
  });

  test('puts the legs before the notes, since the parts are drawn first', () => {
    // 差し込みは**目印の出てくる順**で当たる。並びが逆だと名前と注釈が入れ替わる。
    const { notes } = board('parts:', '  U1: pico 2,2', 'notes:', '  - text 1,1: ここ');

    expect(notes[0]?.text).toBe('01 GP0');
    expect(notes[notes.length - 1]?.text).toBe('ここ');
  });

  test('spells the legs the way the real board prints them', () => {
    const { tex } = board('parts:', '  U1: pico2-w 2,2', 'wires:', '  - U1.GP0 -- 1,1');

    expect(tex).toContain('part-U1.pin 1');
  });

  test('writes the real names into the exported .tex, which has fonts of its own', () => {
    const { doc } = parseFence('parts:\n  U1: pico 2,2\n');
    if (doc === null) throw new Error('YAML を読めませんでした');
    const { tex } = generateTex(buildCircuit(doc, { target: 'latex' }).circuit, {
      style: unstamped(doc.style), target: 'latex',
    });

    expect(tex).toContain('{01 GP0}');
    expect(tex).not.toContain('circuitnotemark');
  });
});

describe('回したマイコンボードのピンの名前', () => {
  const board = (...rows: string[]) => {
    const { doc } = parseFence(`${rows.join('\n')}\n`);
    if (doc === null) throw new Error('YAML を読めませんでした');
    return generateTex(buildCircuit(doc).circuit, { style: unstamped(doc.style) });
  };

  test('stands the names up when the legs move to the top and bottom', () => {
    // 実機で「回すと名前が枠と重なって読めない」。40 本なら隣との間隔は
    // 1 文字も無いので、上下の辺では縦に書く。
    const { notes } = board('parts:', '  U1: pico 2,2 r90');

    // 1 番から半分までが上の辺 (下へ読む)、残りが下の辺 (上へ読む)。
    expect(notes[0]).toMatchObject({ text: '01 GP0', rotate: 90 });
    expect(notes[20]).toMatchObject({ rotate: 270 });
  });

  test('leaves them lying down while the legs are on the sides', () => {
    const { notes } = board('parts:', '  U1: pico 2,2');

    expect(notes[0]).toMatchObject({ text: '01 GP0', rotate: 0, align: 'left' });
    expect(notes[20]).toMatchObject({ rotate: 0, align: 'right' });
  });

  test('turns the names only once, in the SVG, so they do not come out upside down', () => {
    // TeX にも回させると二重になる (実機で焼いて見つけた)。**箱そのものは
    // 回る** ので、見るのはピンの名前を置く行だけ。
    const { tex } = board('parts:', '  U1: pico 2,2 r90');
    const legs = tex.split('\n').filter((line) => line.includes('bpin'));

    expect(legs).toHaveLength(40);
    expect(legs.every((line) => !line.includes('rotate='))).toBe(true);
  });

  test('turns them in the exported .tex, which draws the text itself', () => {
    const { doc } = parseFence('parts:\n  U1: pico 2,2 r90\n');
    if (doc === null) throw new Error('YAML を読めませんでした');
    const { tex } = generateTex(buildCircuit(doc, { target: 'latex' }).circuit, {
      style: unstamped(doc.style), target: 'latex',
    });
    const legs = tex.split('\n').filter((line) => line.includes('bpin'));

    expect(legs.some((line) => line.includes('rotate=-90'))).toBe(true);
  });

  test('lets a board be mirrored, since its names are put in afterwards', () => {
    // DIP が反転できないのはピン番号も型番も TeX が描いて鏡文字になるため。
    const { circuit } = buildCircuit(parseFence('parts:\n  U1: pico 2,2 mirror\n').doc!);

    expect(circuit.parts[0]).toMatchObject({ turn: { mirror: true } });
  });
});

describe('字が出る部品を全部当たる', () => {
  test('turns the leg names of every part that has them, not just the one we found it on', () => {
    // 実機で「回転でピン名が見えにくくなる不具合が他の部品に無いか」。
    // **ピンの名前を書くのは表に `pinLabels` を持つ種類だけ**なので、
    // その全部が回した辺で置き方を決めていることを見る。
    // デュアルゲート MOSFET (`nmos-dg`) は名前がゲートの 2 本だけで、ピンの置き場の並び
    // (中心線に乗る D・S が先) と名前の並びが揃わない。下の「デュアルゲート MOSFET」で見る。
    const named = partTypeNames()
      .filter((type) => lookupPartType(type)?.pinLabels !== undefined && type !== 'nmos-dg');
    expect(named.length).toBeGreaterThan(0);

    for (const type of named) {
      const { doc } = parseFence(`parts:\n  U1: ${type} 2,2 r90\n`);
      if (doc === null) throw new Error(`${type} を読めませんでした`);
      const { circuit } = buildCircuit(doc);
      const { notes } = generateTex(circuit, { style: unstamped(doc.style) });
      const part = circuit.parts[0];
      if (part === undefined || part.kind !== 'multi-terminal') throw new Error(`${type} を置けませんでした`);
      const places = pinPlaces(lookupPartType(type)!, part.turn);

      // **上下の辺に来たピンだけ縦に読む。** 横のままだと隣と重なる。
      // 左右の辺のピンは横のまま (回すとかえって読めない)。
      notes.forEach((one, index) => {
        const side = places[index]?.side;
        const upright = one.rotate === 0;
        expect(upright).toBe(side === 'left' || side === 'right');
      });
    }
  });

  test('names every multi-terminal part next to its symbol', () => {
    // 回路図の決まりごと。**記号だけでは何番の部品か分からない**ので、
    // 2 端子の `l_=` と同じように名札を出す。
    const { tex } = generate('parts:', '  U2: or 3,3');

    expect(tex).toContain('at (part-U2.north) {$U_{2}$};');
  });

  test('puts the name on a side that has no leg', () => {
    // トランジスタは上 (C)・下 (E)・左 (B) がピンで塞がっている。残るのは右。
    const { tex } = generate('parts:', '  Q1: npn 3,3');

    expect(tex).toContain('at (part-Q1.east) {$Q_{1}$};');
  });

  test('turns the name with the symbol', () => {
    // 90 度回すとゲートのピンも回る (左右 → 上下)。名札は空いた辺へ移る。
    // **アンカーは節点ごと回る**ので、画面の左に来るのは記号の中の `south`。
    const { tex } = generate('parts:', '  U2: or 3,3 r90');

    expect(tex).toContain('\\node[anchor=east] at (part-U2.south) {$U_{2}$};');
  });

  test('stacks the name beyond the value when every side has a leg', () => {
    // レギュレータは左右と下がピンで、値は上へ逃がしてある。名札はその外側。
    const { tex } = generate('parts:', '  VR1: regulator 3,3 7805');

    expect(tex).toContain('anchor=south, yshift=9pt] at (part-VR1.north) {$V_{R1}$};');
  });

  test('names the boxes above the box', () => {
    const { tex } = generate('parts:', '  U1: dip8 3,3 NE555');

    expect(tex).toContain('at (part-U1.north) {$U_{1}$};');
  });

  test('draws a name for every part type but the two that have none', () => {
    // 実機で「SMA と U2 の名前が出ていない。**全部品を確認して**」と言われた回。
    // 出ないのは 2 つだけで、どちらも回路図の決まりごと:
    // 素の線 (`short`) は名札を掛ける記号が無く、グラウンドは番号を振らない。
    const nameless = partTypeNames().filter((type) => {
      // 働きで並べた IC (`ic`) は型番が要る。
      const at = lookupPartType(type)?.kind === 'two-terminal'
        ? 'X1: ${type} 2,2 4,2'
        : type === 'ic' ? 'X1: ${type} 2,2 NE555' : 'X1: ${type} 2,2';
      const { doc } = parseFence(`parts:\n  ${at.replace('${type}', type)}\n`);
      if (doc === null) throw new Error(`${type} を読めませんでした`);
      const { tex } = generateTex(buildCircuit(doc).circuit, { style: unstamped(doc.style) });
      // 電源と端子の名前は**綴りのまま** (ネットの名前として図に出るもの)。
      // ほかは 2 端子と同じ組み方 (`R_1` の形)。どちらでも「出ている」と数える。
      return !tex.includes('$X_{1}$') && !tex.includes('{X1}');
    });

    expect(nameless).toEqual(['short', 'ground']);
  });

  test('leaves the parts whose letters circuitikz draws itself alone', () => {
    // 計器の A・V・Ω や電源の記号は circuitikz が描く。縦に置いても字は
    // 立ったままで、こちらが手を出すところが無い (図で 13 種を確かめた)。
    // **こちらが字を置くのは、自分でピンの名前を書く種類だけ。**
    const drawn = partTypeNames().filter((type) => lookupPartType(type)?.pinLabels !== undefined);

    expect(drawn).toEqual([
      'regulator', 'ic3', 'ceramic-filter', 'nmos-dg',
      'sip2', 'sip3', 'sip4', 'sip5', 'sip6', 'sip8', 'sip10', 'sip20', 'sip40',
      'seg7', 'dip-switch4', 'dip-switch8',
      'usb-a', 'usb-c',
      'pico', 'pico-w', 'pico2', 'pico2-w', 'tang-nano-9k',
    ]);
  });
});

describe('デュアルゲート MOSFET', () => {
  test('draws its own symbol and names only the two gates', () => {
    // Arrange / Act
    const { tex, notes } = generate('parts:', '  Q1: nmos-dg 5,4 3SK291');

    // Assert
    expect(tex).toContain('\\pgfdeclareshape{dgfetn}');
    expect(tex).toContain('\\node[dgfetn, draw] (part-Q1)');
    expect(tex).toContain('3SK291');
    // ピンの名前は差し込みの場所 (`bpin K`) だけ作り、字は注釈の差し込みが埋める。
    for (const pin of [1, 2]) expect(tex).toContain(`(part-Q1.bpin ${pin})`);
    expect(tex).not.toContain('(part-Q1.bpin 3)');
    expect(notes.map((one) => one.text)).toEqual(['G1', 'G2']);
  });

  test('does not declare the symbol in a figure without one', () => {
    const { tex } = generate('parts:', '  Q1: nmos-d 5,4');

    expect(tex).not.toContain('dgfetn');
  });

  test('wires reach the gates, the drain and the source by name', () => {
    const { tex } = generate('parts:', '  Q1: nmos-dg 5,4', 'wires:', '  - 5,1 -- Q1.D', '  - Q1.S -- 5,7', '  - 1,4 -| Q1.G1', '  - 1,3 -| Q1.G2');

    for (const anchor of ['drain', 'source', 'pin 1', 'pin 2']) expect(tex).toContain(`(part-Q1.${anchor})`);
  });

  test('stands the gate names upright when the symbol is turned onto its side', () => {
    const { notes } = generate('parts:', '  Q1: nmos-dg 5,4 r90');

    expect(notes.map((one) => one.rotate !== 0)).toEqual([true, true]);
  });
});

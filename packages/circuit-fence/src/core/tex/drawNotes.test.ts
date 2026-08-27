import { describe, expect, test } from 'vitest';
import { buildCircuit } from '../model/circuit.ts';
import { noteSourceLine } from '../notes.ts';
import { parseFence } from '../parser/parseFence.ts';
import { generateTex } from './generate.ts';

// 注釈は generateTex を通した出力で見る。図に出るかどうかが確かめたいことで、
// 描く関数を単体で呼んでも「回路の上に重なっているか」は分からない。
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

  // 書き出しは字が続けて並ぶので、地の文と同じ行送りだと間が空いて読みにくい。
  test('packs the listing by its own, tighter line send', () => {
    const { tex } = write(...R);
    const ys = [...tex.matchAll(/circuitnotemark, font=\\footnotesize\] at \((-?[\d.]+),(-?[\d.]+)\)/g)].map(
      (match) => Number(match[2]),
    );

    const step = (ys[0] ?? 0) - (ys[1] ?? 0);
    expect(step).toBeCloseTo(noteSourceLine('normal'), 3);
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

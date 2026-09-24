import { describe, expect, test } from 'vitest';
import { renderCopper } from './index.ts';
import { VERSION } from './version.ts';
import { boardDescription, lineCaption, pathLength } from './render/captions.ts';
import { createBoard } from './model/board.ts';
import { createLayout } from './model/layout.ts';

const THROUGH = [
  'board: 40x20mm',
  'title: 図1 スルー',
  'f: 2.4G',
  'copper:',
  '  L1: line 0,10 40,10 3.06',
  'parts:',
  '  J1: sma left 10 CH0',
  '  J2: sma right 10 CH1',
].join('\n');

describe('renderCopper', () => {
  test('draws a stand-alone svg that names the version that drew it', () => {
    const { svg, errors, notices, erc, errorHtml } = renderCopper(THROUGH);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`data-copper-fence="${VERSION}"`);
    expect(svg).toContain('図1 スルー');
    expect(svg).toContain('L1 3.06mm 50.0Ω 210°');
    expect(svg).toContain('J1 CH0');
    expect(svg).toContain('50Ω = 3.06mm');
    expect(svg).toContain('λg/4 @2.4GHz = 17.1mm');
    expect([errors, notices, erc, errorHtml]).toEqual([[], [], [], '']);
  });

  test('always draws the board, even for an empty fence', () => {
    const { svg, errors } = renderCopper('');
    expect(svg).toContain('<svg');
    expect(errors[0]?.message).toMatch(/空です/);
  });

  test('gives line numbers of the markdown when told where the fence starts', () => {
    const { errors } = renderCopper('board: 40x20mm\nbored: 1', { offset: 10 });
    expect(errors[0]?.line).toBe(12);
    expect(errors[0]?.text).toBe('bored: 1');
  });

  test('marks what can be grabbed only when editing', () => {
    const source = `${THROUGH}\nwires:\n  - 5,10 -- 30,10`;
    expect(renderCopper(source).svg).not.toContain('cf-chip');
    const edit = renderCopper(source, { edit: true }).svg;
    expect(edit).toContain('class="cf-chip" data-part="J1"');
    expect(edit).toContain('class="cf-wire-hit" data-line="10"');
  });

  test('hides notices but not errors when debug is off', () => {
    const quiet = renderCopper('title: x\nstyle:\n  debug: off');
    expect(quiet.notices).toHaveLength(1);
    expect(quiet.errorHtml).toBe('');
    expect(renderCopper('bored: 1\nstyle:\n  debug: off').errorHtml).toContain('copper-errors');
  });

  test('follows the style: theme, grid, stamp and width', () => {
    const dark = renderCopper(`${THROUGH}\nstyle:\n  theme: dark\n  grid: off\n  stamp: on\n  width: 800`).svg;
    expect(dark).toContain('fill="#1b1d21"');
    expect(dark).not.toContain('stroke-opacity="0.12"');
    expect(dark).toContain(`copper-fence ${VERSION}`);
    expect(dark).toMatch(/width="800"/);
    expect(renderCopper(THROUGH).svg).toContain('stroke-opacity="0.12"');
    expect(renderCopper(`${THROUGH}\nstyle: mono`).svg).toContain('fill="#ffffff"');
  });

  test('draws the grooves of a board whose ground is on the front', () => {
    const svg = renderCopper(['board:', '  size: 40x20mm', '  ground: both', 'copper:', '  L1: line 0,10 40,10 1 gap 0.2', '  X1: slot 20,4 10x1'].join('\n')).svg;
    expect(svg).toContain('fill="#6f6436"');
    expect(svg).toContain('L1 1mm s0.2');
  });

  test('draws a slot on the back as a dashed outline', () => {
    const svg = renderCopper('board: 40x20mm\ncopper:\n  X1: slot 20,4 10x1').svg;
    expect(svg).toContain('stroke-dasharray="3 2"');
  });

  test('draws every kind of part, and a via, a jumper and the notes', () => {
    const result = renderCopper([
      'board:', '  size: 50x30mm', '  ground: front',
      'copper:', '  P1: pad 10,10', '  P2: pad 20,10', '  L1: line 30,2 30,28 3', '  V1: via 40,25',
      'parts:',
      '  R1: resistor P1 P2 51',
      '  L2: inductor P2 20,20 1u',
      '  C1: capacitor/1608 30,15 10p',
      '  Q1: transistor/sot23 40,10 r90',
      '  U1: box 40,18 4x4 4 SAW',
      '  J1: sma/male-edge top 30',
      '  J2: sma bottom 30',
      'wires:', '  - P1 -- 10,20 red',
      'notes:', '  - mark 10,10', '  - box 5,5 25,15', '  - arrow 5,25 10,20', '  - dim 0,-2 50,-2 blue', '  - text 45,28 r90: 字',
      '  - parts', '  - source', '  - source',
    ].join('\n'));
    expect(result.errors).toEqual([]);
    expect(result.notices.map((said) => said.message)).toEqual([
      'V1: 裏に地が無い板なので、via はどこへもつながりません (board の ground)',
      '書き出し (source) は 1 つだけ描きます (後のものは描いていません)',
    ]);
    for (const piece of ['data-part="R1"', 'data-part="Q1"', 'data-part="U1"', 'data-part="J2"', '50mm', '```copper', 'resistor', 'SAW']) {
      expect(result.svg).toContain(piece);
    }
  });

  test('refuses a note or a part that reaches too far off the board', () => {
    const said = renderCopper(['board: 40x20mm', 'parts:', '  R1: resistor 1,1 90,1', 'notes:', '  - mark 90,90'].join('\n'))
      .errors.map((error) => error.message);
    expect(said).toEqual(['R1 が板から離れすぎです', '注釈の点が板から離れすぎです (板の外は 20mm まで)']);
  });

  test('says why a part could not be placed', () => {
    expect(renderCopper('board: 40x20mm\nparts:\n  J1: sma left 1').errors[0]?.message).toMatch(/板の角にかかります/);
  });
});

describe('captions', () => {
  test('describe the line by the model of its board', () => {
    const spec = { kind: 'line', id: 'L1', points: [{ x: 0, y: 0 }, { x: 17.1, y: 0 }], width: 3.06, gap: null, line: 1 } as const;
    expect(lineCaption(spec, createBoard(40, 20), 2.4e9)).toBe('L1 3.06mm 50.0Ω 90°');
    expect(lineCaption(spec, createBoard(40, 20, { ground: 'none' }), null)).toBe('L1 3.06mm');
    expect(lineCaption({ ...spec, width: 1, gap: 0.15 }, createBoard(40, 20, { ground: 'front' }), null)).toBe('L1 1mm s0.15 53.2Ω');
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }])).toBe(7);
  });

  test('give the width of 50 ohms, and leave it out where there is no ground', () => {
    expect(boardDescription(createBoard(40, 20), null)).toMatch(/50Ω = 3.06mm$/);
    expect(boardDescription(createBoard(40, 20, { ground: 'none' }), 1e9)).toBe('40×20 mm  h 1.6  εr 4.4  地なし');
  });
});

describe('createLayout', () => {
  test('keeps room for the rulers and puts the board inside the margin', () => {
    const layout = createLayout(createBoard(40, 20));
    expect(layout.board.x).toBeGreaterThan(14);
    expect(layout.board.width).toBeCloseTo(40 * 20 / 2.54);
    expect(layout.toPx({ x: 0, y: 0 })).toEqual({ x: layout.board.x, y: layout.board.y });
    expect(layout.listBand).toBeNull();
  });

  test('widens the canvas for a band wider than the board', () => {
    const layout = createLayout(createBoard(10, 10), { source: { width: 900, height: 40 }, descriptionWidth: 50 });
    expect(layout.width).toBeGreaterThan(900);
    expect(layout.sourceBand?.height).toBe(40);
  });
});

test('draws node dots only at jumper ends written as points', () => {
  const svg = renderCopper(['board: 40x20mm', 'copper:', '  P1: pad 5,5', '  P2: pad 30,5', 'wires:', '  - P1 -- 20,15'].join('\n'), { edit: true }).svg;
  expect(svg).toContain('data-node="20,15"');
  expect(svg).not.toContain('data-node="5,5"');
});

describe('the back view', () => {
  const VIA = ['board: 40x20mm', 'copper:', '  L1: line 0,10 40,10 3', '  P1: pad 30,15 3x3', '  V1: via 30,15', '  X1: slot 10,3 8x1', 'parts:', '  J1: sma left 10'].join('\n');

  test('draws the back below the front by default, mirrored left to right', () => {
    const { svg } = renderCopper(VIA);
    expect(svg).toContain('裏から見た図 (左右反転) — 裏は銅のベタ (GND)');
    expect(svg).toContain('scale(-1 1)');
    // via は x=30 に。裏から見ると板の左から 10mm の所。
    const holes = [...svg.matchAll(/<circle cx="([\d.]+)"[^>]*fill="#2a2620"/g)].map((found) => Number(found[1]));
    expect(holes).toHaveLength(2);
    expect(Math.round((holes[0] ?? 0) + (holes[1] ?? 0))).toBeGreaterThan(0);
  });

  test('says the back is bare on a board without a back ground', () => {
    expect(renderCopper('board:\n  size: 40x20mm\n  ground: front').svg).toContain('裏に銅は無い');
  });

  test('can be turned off, and is never drawn on the map', () => {
    expect(renderCopper(`${VIA}\nstyle:\n  back: off`).svg).not.toContain('裏から見た図');
    expect(renderCopper(VIA, { edit: true }).svg).not.toContain('裏から見た図');
  });
});

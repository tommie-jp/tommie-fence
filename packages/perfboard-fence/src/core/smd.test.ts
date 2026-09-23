import { applyLineEdits } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { insertPart } from './edit/insert.ts';
import { renderTypeOptions } from './edit/palette.ts';
import { createBoard } from './model/board.ts';
import { createLayout } from './model/layout.ts';
import { splitPartType, variantTable } from './parts/types.ts';

/**
 * 面実装 (52 の docs/64)。**変換基板に載せた姿 (`-dip`) と、この板に直付けする姿**
 * (`2012` `sot346`)。表は fence-kit にあり、ここで見るのは板の側の約束 —
 * 置き方のお知らせ、胴の重なり、パレットから置いたときの足の並び。
 */

const fence = (...lines: string[]): string => ['board: 16x8', ...lines, ''].join('\n');
const said = (result: { readonly notices: readonly { readonly message: string }[] }): string =>
  result.notices.map((one) => one.message).join('\n');

describe('姿', () => {
  test('takes S-Mini on an adapter and soldered straight to the board', () => {
    expect(splitPartType('transistor/sot346-dip')).toEqual({ type: 'transistor', variant: 'sot346-dip', problem: null });
    expect(splitPartType('transistor/sot346').problem).toBeNull();
    expect(splitPartType('q/sot346').type).toBe('transistor');
  });

  test('keeps the looks it had, and puts the surface-mount ones after them', () => {
    const looks = new Map(variantTable());
    expect(looks.get('transistor')?.slice(0, 3)).toEqual(['to92', 'to220', 'sot23-dip']);
    expect(looks.get('resistor')).toEqual(['quarter', 'half', '1608', '2012', '3216']);
    expect(looks.get('dip8')).toEqual(['sop', 'tssop']);
  });

  test('points the other names at the spelling it takes', () => {
    expect(splitPartType('transistor/s-mini').problem).toContain('s-mini は sot346 と書きます');
    expect(splitPartType('transistor/sc59-dip').problem).toContain('sot346-dip と書きます');
    expect(splitPartType('resistor/0805').problem).toContain('2012 と書きます');
  });

  test('points a SOT that is not soldered straight on at its adapter', () => {
    expect(splitPartType('transistor/sot89').problem).toContain('sot89 は sot89-dip と書きます');
  });

  test('keeps control characters out of the refusal', () => {
    // 知らない綴りは何でも来うる。向きを入れ替える字 (U+202E) を文面に載せない。
    const problem = splitPartType('transistor/s-mini\u202e').problem ?? '';
    expect(problem).not.toContain('\u202e');
    expect(problem).toContain('sot346 と書きます');
  });

  test('refuses a size the part does not come in', () => {
    expect(splitPartType('led/3216').problem).toContain('知らない姿です');
    expect(splitPartType('sip8/sop').problem).toContain('sip8 に姿はありません');
  });

  test('lists the adapters and chip sizes in the palette, so they can be picked without typing', () => {
    const options = renderTypeOptions('types');
    for (const written of ['transistor/sot346-dip', 'transistor/sot346', 'resistor/2012', 'dip8/sop']) {
      expect(options, written).toContain(`value="${written}"`);
    }
  });
});

describe('直付けの置き方', () => {
  test('is quiet about a chip across two neighbouring holes', () => {
    const result = renderPerfboard(fence('parts:', '  R1: resistor/2012 b3 b4 10k', '  C1: capacitor/1608 d3 e3 100n'));
    expect(result.errors).toEqual([]);
    // 軸物の「狭すぎます」も言わない (チップは隣の穴に跨ぐのが正しい)。
    expect(said(result)).toBe('');
  });

  test('says how to solder a chip that was written across a gap', () => {
    const result = renderPerfboard(fence('parts:', '  R1: resistor/2012 b3 b6'));
    expect(said(result)).toContain('R1 (resistor/2012) は隣の穴 (上下か左右) に跨いで付けます');
    expect(said(result)).toContain('b3 b6');
  });

  test('wants the DO-214AC two holes apart', () => {
    expect(said(renderPerfboard(fence('parts:', '  D1: schottky/do214ac b3 b5 SS14')))).toBe('');
    expect(said(renderPerfboard(fence('parts:', '  D1: schottky/do214ac b3 b4 SS14')))).toContain('2 穴離して');
  });

  test('wants a SOT in a triangle, and says so otherwise', () => {
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot346 b3 b4 c3 2SC2712')))).toBe('');
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot346 b3 b4 c4')))).toBe('');
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot346 c3 d3 c2')))).toBe(''); // 縦に置いた三角
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot346 b3 b4 b5')))).toContain('三角に置きます');
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot23 b3 b4 d3')))).toContain('三角に置きます');
  });

  test('leaves the adapters to the old rules, since their pins are a header', () => {
    expect(said(renderPerfboard(fence('parts:', '  Q1: transistor/sot346-dip b3 b4 b5')))).toBe('');
  });

  test('says nothing about the mount when the check is off', () => {
    const result = renderPerfboard(fence('parts:', '  R1: resistor/2012 b3 b9', 'style:', '  check: off'));
    expect(said(result)).toBe('');
  });

  test('sees a chip body over another part', () => {
    // 3216 は 3.2mm で、隣の穴の間 (2.54mm) より長い。真下の行の抵抗とは重ならない。
    const apart = renderPerfboard(fence('parts:', '  R1: resistor/3216 b3 b4', '  R2: resistor/3216 c3 c4'));
    expect(said(apart)).not.toContain('重なって');
    // 足の穴は別でも、行の間に載る胴どうしは重なる。
    const stacked = renderPerfboard(fence('parts:', '  Q1: transistor/sot346 b3 b4 c3', '  Q2: transistor/sot346 c4 c5 b5'));
    expect(said(stacked)).toContain('Q1 と Q2 の胴が重なっています');
  });
});

describe('図', () => {
  test('draws the chips at their real size, not stretched between the holes', () => {
    const svg = (holes: string): string => renderPerfboard(fence('parts:', `  R1: resistor/2012 ${holes}`)).svg;
    const width = (drawn: string): number => Number(/<rect x="[-\d.]+" y="[-\d.]+" width="([\d.]+)"/.exec(drawn)?.[1]);
    expect(width(svg('b3 b4'))).toBeCloseTo(width(svg('b3 b9')));
  });

  test('draws S-Mini wider than SOT-23', () => {
    const drawn = (look: string): string => renderPerfboard(fence('parts:', `  Q1: transistor/${look} b3 b4 c3`)).svg;
    expect(drawn('sot346')).not.toBe(drawn('sot23'));
    expect(drawn('sot346')).toContain('Q1');
  });

  test('draws an SOP on a DIP adapter, in the same box as the DIP', () => {
    const adapter = renderPerfboard(fence('parts:', '  U1: dip8/sop c3 NJM4580'));
    const plain = renderPerfboard(fence('parts:', '  U1: dip8 c3 NJM4580'));
    expect(adapter.errors).toEqual([]);
    expect(adapter.svg).toContain('#1f6b45');
    expect(adapter.svg).not.toBe(plain.svg);
    expect(adapter.netlist).toEqual(plain.netlist);
  });

  test('names the look in the parts list', () => {
    const { svg } = renderPerfboard(fence('parts:', '  Q1: transistor/sot346 b3 b4 c3 2SC2712', 'notes:', '  - parts'));
    expect(svg).toContain('transistor/sot346');
  });

  test('draws the solder side too', () => {
    const { svg, errors } = renderPerfboard(fence(
      'parts:', '  Q1: transistor/sot346 b3 b4 c3', '  R1: resistor/2012 e3 e4', 'style:', '  back: on',
    ));
    expect(errors).toEqual([]);
    expect(svg).toContain('半田面');
  });

  test('draws on the same pitch the table measures in', () => {
    // 表の mm を px に換えるのは「2.54mm = 20px」。板のピッチが変わったら表も直す。
    expect(createLayout(createBoard({ cols: 4, rows: 4 })).pitch).toBe(20);
  });
});

describe('パレットから置く', () => {
  const BOARD = 'board: 12x6\nparts:\n  R1: resistor a1 a4\n';
  const at = (row: number, col: number) => ({ row, col });
  const placed = (type: string, anchor: { row: number; col: number }): string => {
    const result = insertPart(BOARD, { id: 'X1', type, at: [anchor] });
    if (!result.ok) throw new Error(result.error.message);
    return applyLineEdits(BOARD, result.value.lines);
  };

  test('puts a chip across the next hole, not five holes away', () => {
    expect(placed('resistor/2012', at(3, 3))).toContain('X1: resistor/2012 c3 c4');
    expect(placed('resistor', at(3, 3))).toContain('X1: resistor c3 c8');
  });

  test('puts the DO-214AC two holes apart', () => {
    expect(placed('diode/do214ac', at(3, 3))).toContain('X1: diode/do214ac c3 c5');
  });

  test('puts a SOT in a triangle, with the third leg on the next row', () => {
    expect(placed('transistor/sot346', at(3, 3))).toContain('X1: transistor/sot346 c3 c4 d3');
    expect(placed('transistor/sot346-dip', at(3, 3))).toContain('X1: transistor/sot346-dip c3 c4 c5');
  });

  test('refuses the bottom row for a SOT, naming the hole that falls off', () => {
    const result = insertPart(BOARD, { id: 'X1', type: 'transistor/sot346', at: [at(6, 3)] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('右と下へ');
  });

  test('names both holes that fall off at the corner, so one press is enough to fix it', () => {
    const result = insertPart(BOARD, { id: 'X1', type: 'transistor/sot346', at: [at(6, 12)] });
    expect(!result.ok && result.error.message).toContain('f13 と g12 が板の外です');
  });
});

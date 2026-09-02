import { describe, expect, test } from 'vitest';
import { fenceAt, gridMap } from './map.ts';
import { renderMapHtml } from './mapSvg.ts';

const RC = [
  'parts:',
  '  IN:  port a1',
  '  R1:  resistor a1 a3 10k',
  '  C1:  capacitor a3 c3 100n',
  'wires:',
  '  - a3 -- a4',
  '',
].join('\n');

describe('gridMap', () => {
  test('places a chip for every part, at its anchor', () => {
    const map = gridMap(RC);

    expect(map.chips.map((chip) => chip.id)).toEqual(['IN', 'R1', 'C1']);
    expect(map.chips[1]).toMatchObject({ id: 'R1', row: 0, col: 0, type: 'resistor' });
    expect(map.chips[2]).toMatchObject({ id: 'C1', row: 0, col: 2 });
  });

  test('carries the far end of a two-terminal part, so the map can draw its reach', () => {
    const map = gridMap(RC);

    expect(map.chips[1]?.to).toEqual({ row: 0, col: 2 });
    expect(map.chips[0]?.to).toBeNull();
  });

  test('sizes the grid to hold every part, with room to move into', () => {
    const map = gridMap(RC);

    expect(map.rows).toBeGreaterThanOrEqual(3);
    expect(map.cols).toBeGreaterThanOrEqual(4);
  });

  test('is empty for a fence it cannot read, rather than guessing', () => {
    expect(gridMap('parts:\n  R1: [unclosed\n').chips).toEqual([]);
  });

  test('leaves out a part on a half-step address, which the map cannot show', () => {
    // 交点の間はマップの升目に載らない。**黙って別の升へ置かない** —
    // 動かせない部品は出さないほうが、嘘の位置を見せるより良い。
    const map = gridMap('parts:\n  R1: resistor a_1.5 a_3.5 1k\n');

    expect(map.chips).toEqual([]);
    expect(map.skipped).toEqual(['R1']);
  });
});

describe('gridMap の配線', () => {
  const linesOf = (source: string) => gridMap(source).wires;

  test('draws a straight wire between the crossings it joins', () => {
    expect(linesOf('wires:\n  - a1 -- a3\n')).toEqual([
      { from: { row: 0, col: 0 }, to: { row: 0, col: 2 }, approximate: false, line: 2 },
    ]);
  });

  test('breaks a bent wire at its corner, so the map can follow it', () => {
    // `-|` は先に横。角は from の行・to の列。
    expect(linesOf('wires:\n  - a1 -| c3\n')).toEqual([
      { from: { row: 0, col: 0 }, to: { row: 0, col: 2 }, approximate: false, line: 2 },
      { from: { row: 0, col: 2 }, to: { row: 2, col: 2 }, approximate: false, line: 2 },
    ]);
  });

  test('draws each leg of a chained wire', () => {
    expect(linesOf('wires:\n  - a1 -- a3 -- c3\n')).toHaveLength(2);
  });

  test('keeps a half-step endpoint where it was written', () => {
    expect(linesOf('wires:\n  - a_1.5 -- a3\n')[0]?.from).toEqual({ row: 0, col: 0.5 });
  });

  test('approximates a pin end at the part, since only TeX knows where the leg is', () => {
    const lines = linesOf('parts:\n  Q1: npn b2\nwires:\n  - Q1.C -- a4\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]?.from).toEqual({ row: 1, col: 1 });
    expect(lines[0]?.approximate).toBe(true);
  });

  test('leaves out a wire to a part that is not there', () => {
    // 書き間違いはエラーの帯の仕事。ここで当てずっぽうの線を引かない。
    expect(linesOf('wires:\n  - Q9.C -- a4\n')).toEqual([]);
  });

  test('has no wires at all when the fence cannot be read', () => {
    expect(linesOf('parts: [')).toEqual([]);
  });

  test('sizes the grid to hold a wire that reaches past every part', () => {
    const map = gridMap('parts:\n  R1: resistor a1 b1\nwires:\n  - b1 -- b9\n');

    expect(map.cols).toBeGreaterThan(8);
  });
});

describe('renderMapHtml', () => {
  const html = renderMapHtml(gridMap(RC));

  test('draws a cell for every crossing, addressed', () => {
    expect(html).toContain('data-address="a1"');
    expect(html).toContain('data-address="c4"');
  });

  test('draws a chip for every part, named', () => {
    expect(html).toContain('data-part="R1"');
    expect(html).toContain('>R1</');
  });

  test('escapes what came from the fence', () => {
    const map = gridMap('parts:\n  R1: resistor a1 a3 "<img src=x>"\n');

    expect(renderMapHtml(map)).not.toContain('<img');
  });

  test('says so when there is nothing to show', () => {
    expect(renderMapHtml(gridMap('parts:\n  R1: [unclosed\n'))).toContain('読めません');
  });
});

describe('fenceAt', () => {
  const markdown = [
    '# 見出し',            // 1
    '',                    // 2
    '```circuit',          // 3
    'parts:',              // 4
    '  R1: resistor a1 a3',// 5
    '```',                 // 6
    '',                    // 7
    '```circuit',          // 8
    'parts:',              // 9
    '  C1: capacitor a1 a3',
    '```',
    '',
  ].join('\n');

  test('finds the fence the cursor is inside', () => {
    expect(fenceAt(markdown, 5)?.line).toBe(3);
    expect(fenceAt(markdown, 10)?.line).toBe(8);
  });

  test('counts the opening line as inside, so the cursor can rest on it', () => {
    expect(fenceAt(markdown, 3)?.line).toBe(3);
  });

  test('finds nothing outside a fence', () => {
    expect(fenceAt(markdown, 1)).toBeNull();
    expect(fenceAt(markdown, 7)).toBeNull();
  });

  test('gives back the body, so the caller can compile it', () => {
    expect(fenceAt(markdown, 5)?.source).toContain('R1: resistor a1 a3');
  });
});

describe('同じ交点に 2 つ', () => {
  const source = ['parts:', '  IN: port a1', '  R1: resistor a1 a3', ''].join('\n');

  test('keeps both chips, so neither disappears from the map', () => {
    // 同じ番地に 2 部品は**この文法では接続**。片方を隠すと、掴んで
    // 出すこともできなくなる。
    const html = renderMapHtml(gridMap(source));

    expect(html).toContain('data-part="IN"');
    expect(html).toContain('data-part="R1"');
  });
});

describe('節点の点', () => {
  const source = 'points:\n  fb: c3\nparts:\n  R1: resistor a1 b1\n  R2: resistor fb d3\n';

  test('marks every crossing something is written at', () => {
    const dots = gridMap(source).dots.map((dot) => `${dot.row},${dot.col}`);

    expect(dots).toContain('0,0');
    expect(dots).toContain('2,2');
  });

  test('carries the name, so the map can show what a one-line move would touch', () => {
    const fb = gridMap(source).dots.find((dot) => dot.row === 2 && dot.col === 2);

    expect(fb?.name).toBe('fb');
    expect(fb?.uses).toBe(1);
  });

  test('leaves the dot under the chip, so a node on a part is still grabbable', () => {
    const html = renderMapHtml(gridMap(source));

    // 同じ升にチップと点の両方が出る。隠すと名前の付いた節点だけ掴めなくなる。
    expect(html).toContain('cf-dot');
    expect(html).toContain('data-node="c3"');
    expect(html).toContain('cf-chip');
  });

  test('has no dots at all when the fence cannot be read', () => {
    expect(gridMap('parts: [').dots).toEqual([]);
  });

  test('covers a crossing only a wire reaches, so its dot is on the map', () => {
    // 部品は a1〜b1 に収まるが、配線が j9 まで届く。升目が部品だけを見て
    // 決まると、j9 の点が升の外に落ちて掴めなくなる。
    const map = gridMap('parts:\n  R1: resistor a1 b1\nwires:\n  - b1 -- j9\n');

    expect(map.rows).toBeGreaterThan(9);
    expect(map.cols).toBeGreaterThan(8);
    expect(renderMapHtml(map)).toContain('data-node="j9"');
  });
});

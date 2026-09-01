import { describe, expect, test } from 'vitest';
import { fenceAt, gridMap, renderMapHtml } from './map.ts';

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

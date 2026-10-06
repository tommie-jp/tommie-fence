import { describe, expect, test } from 'vitest';
import { renderCopper } from './index.ts';

const TWO = [
  'title: 図01 2 枚の銅張り基板',
  'sheets:',
  '  - name: 入力側',
  '    board: 50x30mm',
  '    copper:',
  '      FEED: line 0,15 50,15 3mm',
  '  - name: 出力側',
  '    board: 50x30mm',
  '    copper:',
  '      OUT: line 0,15 50,15 3mm',
].join('\n');

describe('copper sheets:', () => {
  test('draws two boards in one svg', () => {
    const result = renderCopper(TWO);
    expect(result.errors).toEqual([]);
    expect(result.svg.match(/<svg /g)).toHaveLength(3);
    expect(result.svg).toContain('data-copper-fence');
  });

  test('draws a link from a named line toward the left edge of the board', () => {
    const jig = [
      'sheets:',
      '  - name: a',
      '    board: 50x20mm',
      '    copper:',
      '      L1: line 0,10 50,10 3mm',
      '    parts:',
      '      J1: sma left 10 CH0',
      '  - name: b',
      '    board: 25x20mm',
      '    copper:',
      '      L2: line 0,10 25,10 3mm',
      '    parts:',
      '      J2: sma left 10 CH1',
      'links:',
      '  - a.L1 b.L2',
    ].join('\n');
    const result = renderCopper(jig);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('data-sheet-links="1"');
    expect(result.svg).toContain('→ b.L2');
    expect(result.svg.match(/copper-fence \d/g)).toHaveLength(1);
  });

  test('reports an error inside a sheet on its fence line', () => {
    const broken = TWO.replace('line 0,15 50,15 3mm\n', 'nonsense\n');
    const result = renderCopper(broken.replace('OUT: line 0,15 50,15 3mm', 'OUT: nonsense 1'), { offset: 2 });
    const line = TWO.split('\n').findIndex((text) => text.includes('OUT:')) + 1;
    expect(result.errors.some((error) => error.line === line + 2)).toBe(true);
  });

  test('a figure without sheets: is unchanged', () => {
    expect(renderCopper('board: 50x30mm').svg).not.toContain('<svg x=');
  });
});

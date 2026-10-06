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

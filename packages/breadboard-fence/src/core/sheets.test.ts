import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';

const TWO = [
  'title: 図01 2 枚のブレッドボード',
  'board: half',
  'sheets:',
  '  - name: 左',
  '    points:',
  '      OUT: a10',
  '    parts:',
  '      R1: resistor a3 a10 1k',
  '    wires:',
  '      - +t3 -- a3 red',
  '  - name: 右',
  '    points:',
  '      IN: a3',
  '    parts:',
  '      R2: resistor a3 a10 2k2',
  '    wires:',
  '      - c10 -- -t10 black',
  'links:',
  '  - 左.OUT 右.IN',
].join('\n');

describe('breadboard sheets:', () => {
  test('draws two boards in one svg and joins the nets named by links', () => {
    const result = renderBreadboard(TWO);
    expect(result.errors).toEqual([]);
    expect(result.svg.match(/<svg /g)).toHaveLength(3);
    expect(result.svg).toContain('data-breadboard-fence');
    const joined = result.netlist.find((net) => net.refs.includes('R1.2'));
    expect([...(joined?.refs ?? [])].sort()).toEqual(['R1.2', 'R2.1']);
  });

  test('draws the links, from a named hole or the left end of a rail, with tags', () => {
    const result = renderBreadboard(`${TWO}\n  - 左.+t 右.-t`);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('data-sheet-links="2"');
    expect(result.svg).toContain('→ 右.IN');
    expect(result.svg).toContain('→ 左.+t');
    expect(result.svg.match(/breadboard-fence \d/g)).toHaveLength(1);
  });

  test('gives each sheet the shared board: unless it writes its own', () => {
    const result = renderBreadboard(TWO.replace('  - name: 右', '  - name: 右\n    board: mini'));
    // mini にはレールが無いので、右の枚だけ -t10 を断られる (行は元のフェンスの行)
    expect(result.errors.map((error) => error.line)).toEqual([18]);
    expect(result.errors[0]?.message).toContain('レール');
  });

  test('reports an error inside a sheet on its fence line', () => {
    const broken = TWO.replace('R2: resistor a3 a10 2k2', 'R2: nonsense a3 a10 2k2');
    const line = broken.split('\n').findIndex((text) => text.includes('nonsense')) + 1;
    const result = renderBreadboard(broken, { offset: 5 });
    expect(result.errors.some((error) => error.line === line + 5)).toBe(true);
  });

  test('a figure without sheets: is unchanged', () => {
    expect(renderBreadboard('board: half\nparts:\n  R1: resistor a3 a10 1k').svg).not.toContain('<svg x=');
  });
});

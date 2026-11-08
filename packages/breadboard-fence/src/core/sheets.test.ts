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

describe('sheets: the parts lists come after the last sheet, one per sheet', () => {
  const two = (first = '', second = '') => [
    'board: full',
    'sheets:',
    '  - name: A',
    ...(first === '' ? [] : [`    ${first}`]),
    '    parts:',
    '      R1: resistor a5 a10 1k',
    '  - name: B',
    ...(second === '' ? [] : [`    ${second}`]),
    '    parts:',
    '      R2: resistor a5 a10 2k',
  ].join('\n');
  // 字は縁取りと本体の 2 回書かれる。
  const headings = (svg: string) => (svg.match(/>部品</g)?.length ?? 0) / 2;

  test('each sheet keeps its own table, captioned, in the order of the sheets', () => {
    const { svg, errors } = renderBreadboard(two());
    expect(errors).toEqual([]);
    expect(headings(svg)).toBe(2);
    // 枚の題にも同じ字が出るので、表のある末尾から見る。
    const last = (text: string) => svg.lastIndexOf(text);
    expect(last('>A (1枚め)<')).toBeLessThan(last('>R1<'));
    expect(last('>R1<')).toBeLessThan(last('>B (2枚め)<'));
    expect(last('>B (2枚め)<')).toBeLessThan(last('>R2<'));
  });

  test('no table sits between the figures: all of them are in the last sheet', () => {
    const { svg } = renderBreadboard(two());
    const lastSheet = svg.lastIndexOf('<svg');
    expect(svg.indexOf('>部品<')).toBeGreaterThan(lastSheet);
  });

  test('parts-list: none on a sheet leaves out that table only', () => {
    expect(headings(renderBreadboard(two('parts-list: none')).svg)).toBe(1);
    const lastNone = renderBreadboard(two('', 'parts-list: none')).svg;
    expect(headings(lastNone)).toBe(1);
    expect(lastNone).toContain('>R1<');
    expect(headings(renderBreadboard(two('parts-list: none', 'parts-list: none')).svg)).toBe(0);
  });

  test('the tables share one row pitch, set by the tallest drawing of any sheet', () => {
    const { svg } = renderBreadboard([
      'board: full', 'sheets:',
      '  - name: A', '    parts:', '      R1: resistor a5 a10 1k', '      R2: resistor b5 b10 1k', '      R3: resistor c5 c10 1k',
      '  - name: B', '    parts:', '      B1: button @ e5', '      B2: button @ e9', '      B3: button @ e13',
    ].join('\n'));
    const tops = [...svg.matchAll(/class="bf-parts-icon" transform="translate\([\d.]+ ([\d.]+)\)"/g)].map((m) => Number(m[1]));
    expect(tops).toHaveLength(6);
    // 同じ大きさの絵が並ぶ枚の中で、行の送りを比べるには字の行を見る。
    const rows = (id: string) => Number(new RegExp(`y="([\\d.]+)"[^>]*>${id}<`).exec(svg.slice(svg.lastIndexOf('>A (1枚め)<')))?.[1]);
    expect(rows('R2') - rows('R1')).toBeCloseTo(rows('B2') - rows('B1'), 1);
  });

  test('a single figure has no caption', () => {
    expect(renderBreadboard('board: half\nparts:\n  R1: resistor a5 a10 1k').svg).not.toContain('枚め');
  });
});

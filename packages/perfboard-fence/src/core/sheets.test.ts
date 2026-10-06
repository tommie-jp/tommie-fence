import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';

const ONE = [
  'board: 8x5',
  'title: 図01 分圧',
  'points:',
  '  GND: a1',
  '  MID: a8',
  'parts:',
  '  R1: resistor b2 b6 10k',
  'wires:',
  '  - a1 -- b2',
  '  - b6 -- MID',
].join('\n');

const TWO = [
  'title: 図01 分圧',
  'board: 8x5',
  'sheets:',
  '  - name: 電源側',
  '    points:',
  '      GND: a1',
  '      MID: a8',
  '    parts:',
  '      R1: resistor b2 b6 10k',
  '    wires:',
  '      - a1 -- b2',
  '      - b6 -- MID',
  '  - name: 負荷側',
  '    points:',
  '      GND: a1',
  '      MID: a8',
  '    parts:',
  '      R2: resistor b2 b6 4k7',
  '    wires:',
  '      - a1 -- b2',
  '      - b6 -- MID',
  'links:',
  '  - 電源側.GND 負荷側.GND',
  '  - 電源側.MID 負荷側.MID',
].join('\n');

describe('perfboard sheets:', () => {
  test('a figure without sheets: renders exactly as before', () => {
    const result = renderPerfboard(ONE);
    expect(result.errors).toEqual([]);
    expect(result.svg).not.toContain('<svg x=');
  });

  test('draws every sheet in one svg, each with its own title', () => {
    const result = renderPerfboard(TWO);
    expect(result.errors).toEqual([]);
    expect(result.svg.match(/<svg /g)).toHaveLength(3);
    expect(result.svg).toContain('図01 分圧・電源側');
    expect(result.svg).toContain('図01 分圧・負荷側');
    expect(result.svg).toContain('data-perfboard-fence');
  });

  test('joins the nets named by links across sheets', () => {
    const result = renderPerfboard(TWO);
    const names = result.netlist.map((net) => net.name).sort();
    expect(names).toEqual(['GND', 'MID']);
    expect(result.netlist.find((net) => net.name === 'MID')?.refs.slice().sort()).toEqual(['R1.2', 'R2.2']);
  });

  test('keeps nets apart when no link names them', () => {
    const result = renderPerfboard(TWO.replace(/links:[\s\S]*$/, ''));
    expect(result.netlist.map((net) => net.name).sort()).toEqual(['電源側.GND', '電源側.MID', '負荷側.GND', '負荷側.MID'].sort());
  });

  test('reports an error in a sheet on its line in the fence, shifted by the fence offset', () => {
    const broken = TWO.replace('R2: resistor b2 b6 4k7', 'R2: resistor b2 b6 4k7 zzz zzz');
    const line = broken.split('\n').findIndex((text) => text.includes('zzz')) + 1;
    const result = renderPerfboard(broken, { offset: 20 });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.line).toBe(line + 20);
  });

  test('reports a link to a node that does not exist', () => {
    const result = renderPerfboard(TWO.replace('負荷側.MID', '負荷側.NOPE'));
    const error = result.errors.find((one) => one.message.includes('NOPE'));
    expect(error?.line).toBe(24);
    expect(result.errorHtml).toContain('NOPE');
  });

  test('reports the same part name on two sheets as a notice', () => {
    const result = renderPerfboard(TWO.replace('R2:', 'R1:'));
    expect(result.notices.some((one) => one.message.includes('R1'))).toBe(true);
  });

  test('reports a top-level key that belongs inside a sheet', () => {
    const result = renderPerfboard('sheets:\n  - name: a\nparts:\n  - R1: resistor b2 b6');
    const error = result.errors.find((one) => one.message.includes('parts'));
    expect(error?.line).toBe(3);
  });

  test('draws something even when sheets: has no sheet', () => {
    const result = renderPerfboard('sheets:');
    expect(result.svg).not.toBe('');
    expect(result.errors[0]?.message).toContain('1 つもありません');
  });

  test('an error in the shared board: is reported on the shared line', () => {
    const result = renderPerfboard('board: nonsense\nsheets:\n  - name: a\n    parts:\n      - R1: resistor b2 b6');
    expect(result.errors.some((one) => one.line === 1)).toBe(true);
  });
});

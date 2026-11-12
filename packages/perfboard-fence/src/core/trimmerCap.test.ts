import { describe, expect, test } from 'vitest';
import { renderPerfboard } from './index.ts';
import { splitPartType } from './parts/types.ts';

/**
 * トリマコンデンサ (`capacitor/trimmer`)。**種類はコンデンサのまま、姿がトリマ** — 回路図の
 * `capacitor-var` (可変コンデンサ) を基板に挿す形。6 mm 級のセラミックトリマはピンの間隔が 5 mm なので、
 * 穴は間に 1 穴空けて 2 穴離す。値は最大容量 (`50p`)。
 */
const fence = (...lines: string[]): string => ['board: 20x10', ...lines, ''].join('\n');
const messages = (result: { readonly errors: readonly { message: string }[]; readonly notices: readonly { message: string }[] }): string =>
  [...result.errors, ...result.notices].map((one) => one.message).join('\n');
const WIRES = ['wires:', '  - b3 -- a3', '  - b5 -- a5'];

describe('トリマコンデンサ', () => {
  test('is a look of the capacitor, written after the slash', () => {
    expect(splitPartType('capacitor/trimmer')).toEqual({ type: 'capacitor', variant: 'trimmer', problem: null });
    expect(splitPartType('c/trimmer')).toEqual({ type: 'capacitor', variant: 'trimmer', problem: null });
    // 抵抗には無い姿 (半固定抵抗は `potentiometer/trimmer`)。
    expect(splitPartType('resistor/trimmer').problem).toContain('trimmer');
  });

  test('draws, joins the netlist as a two pin part and shows the maximum capacitance', () => {
    const result = renderPerfboard(fence('parts:', '  TC1: capacitor/trimmer b3 b5 50p', ...WIRES));

    expect(messages(result)).toBe('');
    expect(result.svg).toContain('TC1 50p');
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['TC1.1', 'TC1.2']));
  });

  test('draws a body that is not the ceramic disc', () => {
    const trimmer = renderPerfboard(fence('parts:', '  C1: capacitor/trimmer b3 b5 50p', ...WIRES)).svg;
    const ceramic = renderPerfboard(fence('parts:', '  C1: capacitor/ceramic b3 b5 50p', ...WIRES)).svg;

    expect(trimmer).not.toBe(ceramic);
  });

  test('takes the two holes apart placement across rows too', () => {
    const result = renderPerfboard(fence('parts:', '  TC1: capacitor/trimmer b3 d3 50p', 'wires:', '  - b3 -- a3', '  - d3 -- e3'));

    expect(messages(result)).toBe('');
  });

  test.each([
    ['隣の穴', 'b3 b4'],
    ['3 穴離れ', 'b3 b6'],
    ['斜め', 'b3 d5'],
  ])('says how to place it when written %s: the pins are 5 mm apart and do not bend', (_name, holes) => {
    const [first, second] = holes.split(' ');
    const result = renderPerfboard(fence(
      'parts:', `  TC1: capacitor/trimmer ${holes} 50p`, 'wires:', `  - ${first} -- a3`, `  - ${second} -- a6`,
    ));

    // **止めない** — 図は書いたとおりに描き、置き方をお知らせで言う。
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('TC1 50p');
    const said = messages(result);
    expect(said).toContain('TC1 (capacitor/trimmer)');
    expect(said).toContain('2 穴離して');
    expect(said).toContain(`書かれた穴: ${holes}`);
  });

  test('says nothing about the spacing of the other capacitors', () => {
    const result = renderPerfboard(fence('parts:', '  C1: capacitor/ceramic b3 b6 100n', 'wires:', '  - b3 -- a3', '  - b6 -- a6'));

    expect(messages(result)).toBe('');
  });

  test('lists it in the parts table by its look, with no three digit code', () => {
    const result = renderPerfboard(fence(
      'parts:', '  TC1: capacitor/trimmer b3 b5 50p', ...WIRES, 'notes:', '  - parts',
    ));

    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('capacitor/trimmer');
    expect(result.svg).not.toContain('>500<');
  });
});

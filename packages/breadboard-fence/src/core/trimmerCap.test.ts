import { describe, expect, test } from 'vitest';
import { renderBreadboard } from './index.ts';
import { splitPartType, variantsOf } from './parts/variants.ts';

/**
 * トリマコンデンサ (`capacitor/trimmer`)。**種類はコンデンサのまま、姿がトリマ** — 回路図の
 * `capacitor-var` (可変コンデンサ) を基板に挿す形。6 mm 級のセラミックトリマはピンの間隔が 5 mm なので、
 * 同じ行で間に 1 列空けて 2 列離す (`a5 a7`)。値は最大容量 (`50p`)。
 */
const fence = (...lines: string[]): string => ['title: t', ...lines, ''].join('\n');
const messages = (result: { readonly errors: readonly { message: string }[]; readonly notices: readonly { message: string }[] }): string =>
  [...result.errors, ...result.notices].map((one) => one.message).join('\n');

describe('トリマコンデンサ', () => {
  test('is a look of the capacitor, written after the slash', () => {
    expect(variantsOf('capacitor')).toContain('trimmer');
    expect(splitPartType('capacitor/trimmer')).toEqual({ type: 'capacitor', variant: 'trimmer', problem: null });
    expect(splitPartType('c/trimmer')).toEqual({ type: 'capacitor', variant: 'trimmer', problem: null });
  });

  test('draws, joins the netlist as a two pin part and shows the maximum capacitance', () => {
    const result = renderBreadboard(fence('parts:', '  TC1: capacitor/trimmer c5 c7 50p', 'wires:', '  - a5 -- a20', '  - a7 -- a22'));

    expect(messages(result)).toBe('');
    expect(result.svg).toContain('TC1 50p');
    expect(result.netlist.flatMap((net) => net.refs)).toEqual(expect.arrayContaining(['TC1.1', 'TC1.2']));
  });

  test('draws a body that is not the ceramic disc, and needs no polarity', () => {
    const trimmer = renderBreadboard(fence('parts:', '  C1: capacitor/trimmer c5 c7 50p'));
    const ceramic = renderBreadboard(fence('parts:', '  C1: capacitor/ceramic c5 c7 50p'));

    expect(trimmer.errors).toEqual([]);
    expect(trimmer.svg).not.toBe(ceramic.svg);
  });

  test.each([
    ['隣の列', 'c5 c6'],
    ['3 列離れ', 'c5 c8'],
    ['溝をまたぐ', 'e5 f5'],
    ['別の行', 'c5 d7'],
  ])('says how to place it when written %s: the pins are 5 mm apart and do not bend', (_name, holes) => {
    const result = renderBreadboard(fence('parts:', `  TC1: capacitor/trimmer ${holes} 50p`));

    // **止めない** — 図は書いたとおりに描き、置き方をお知らせで言う。
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('TC1 50p');
    const said = messages(result);
    expect(said).toContain('TC1 (capacitor/trimmer)');
    expect(said).toContain('2 列離して');
    expect(said).toContain(`書かれた穴: ${holes}`);
  });

  test('says nothing about the spacing of the other capacitors', () => {
    expect(messages(renderBreadboard(fence('parts:', '  C1: capacitor/ceramic c5 c8 100n')))).toBe('');
  });

  test('lists it in the parts table by its look, with no three digit code', () => {
    const result = renderBreadboard(fence('parts:', '  TC1: capacitor/trimmer c5 c7 50p'));

    expect(result.svg).toContain('capacitor/trimmer');
    expect(result.svg).not.toContain('>500<');
  });
});

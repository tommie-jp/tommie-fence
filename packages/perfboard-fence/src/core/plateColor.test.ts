import { describe, expect, test } from 'vitest';
import { darkenColor } from 'fence-kit';
import { renderPerfboard } from './index.ts';
import { parsePartLine } from './parser/parts.ts';
import { spellPart } from './write/spellPart.ts';

/**
 * 部品の基板の色 (部品の行の末尾の色)。キットやモジュールの基板・変換基板は、ユニバーサル基板と
 * 同じ緑だと縁が読めないので、書く人が見分けの付く色を選べる (52 の 05-etc 第 5 章の図3)。
 */
const fence = (...lines: string[]): string => ['board: 20x12', 'parts:', ...lines.map((line) => `  ${line}`), ''].join('\n');
const fillOf = (svg: string, name: string): string | null =>
  new RegExp(`<rect class="${name}"[^>]* fill="(#[0-9a-f]+)"`).exec(svg)?.[1] ?? null;

describe('部品の行の末尾の色', () => {
  test('reads the trailing colour as the kit board colour, apart from the model', () => {
    const parsed = parsePartLine('J1', 'sip8 c1 r90 105404 blue');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.value).toBe('105404');
    expect(parsed.value.color).toBe('blue');
  });

  test('writes the colour back after the value', () => {
    const parsed = parsePartLine('J1', 'sip8 c1 r90 105404 blue');
    if (!parsed.ok) throw new Error('読めない');

    expect(spellPart({ ...parsed.value, line: null })).toBe('J1: sip8 c1 r90 105404 blue');
  });

  test('refuses a colour on a part with no board of its own', () => {
    for (const line of ['dip8 c3 NE555 blue', 'sip8 c3 blue']) {
      const parsed = parsePartLine('U1', line);

      expect(parsed.ok, line).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.error.message, line).toContain('基板の色');
    }
  });

  test('keeps an LED colour as its value', () => {
    const parsed = parsePartLine('D1', 'led c3 c5 blue');

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.value).toBe('blue');
    expect(parsed.value.color).toBeNull();
  });
});

describe('描いた基板の色', () => {
  test('paints the kit board green when no colour is written', () => {
    const { svg, errors } = renderPerfboard(fence('J1: sip8 c1 r90 105404'));

    expect(errors).toEqual([]);
    expect(fillOf(svg, 'module-board')).toBe('#2f7d4f');
  });

  test('paints the kit board in the written colour', () => {
    const named = renderPerfboard(fence('J1: sip8 c1 r90 105404 blue'));

    expect(named.errors).toEqual([]);
    expect(fillOf(named.svg, 'module-board')).toBe('#1f5c9e');
    expect(named.svg).toContain(`stroke="${darkenColor('#1f5c9e')}"`);
  });

  // YAML は ` #` から後ろを注釈として捨てるので、`#RRGGBB` は値ごと引用で書く。
  test('accepts a quoted #RRGGBB', () => {
    const { svg, errors } = renderPerfboard(fence('J1: "sip8 c1 r90 105404 #aa3355"'));

    expect(errors).toEqual([]);
    expect(fillOf(svg, 'module-board')).toBe('#aa3355');
  });

  test('paints a one-row module body (KY-040) in the written colour', () => {
    const plain = renderPerfboard(fence('U1: sip5 c3 KY-040')).svg;
    const { svg, errors } = renderPerfboard(fence('U1: sip5 c3 KY-040 red'));

    expect(errors).toEqual([]);
    expect(plain).toContain('#2f7d4f');
    expect(svg).toContain('fill="#9e2b2b"');
  });

  test('paints an SOP adapter board in the written colour', () => {
    const plain = renderPerfboard(fence('U1: dip8/sop c3')).svg;
    const { svg, errors } = renderPerfboard(fence('U1: dip8/sop c3 purple'));

    expect(errors).toEqual([]);
    expect(plain).not.toContain('#5b3a86');
    expect(svg).toContain('#5b3a86');
  });

  test('paints a USB adapter board in the written colour', () => {
    const plain = renderPerfboard(fence('J1: usb-c c3 c4 c5 c6')).svg;
    const { svg, errors } = renderPerfboard(fence('J1: usb-c c3 c4 c5 c6 red'));

    expect(errors).toEqual([]);
    expect(plain).not.toContain('#9e2b2b');
    expect(svg).toContain('#9e2b2b');
  });
});

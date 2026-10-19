import { describe, expect, test } from 'vitest';
import { darkenColor } from 'fence-kit';
import { renderBreadboard } from './index.ts';
import { parseCompactPart } from './parser/compact.ts';
import { spellPart } from './write/spellPart.ts';

/**
 * 部品の基板の色 (部品の行の末尾の色)。読み方と描き方は perfboard と同じ (`fence-kit` の plateColor.ts)。
 */
const fillOf = (svg: string, name: string): string | null =>
  new RegExp(`<rect class="${name}"[^>]* fill="(#[0-9a-f]+)"`).exec(svg)?.[1] ?? null;
const draw = (...lines: string[]) => renderBreadboard(['parts:', ...lines.map((line) => `  ${line}`), ''].join('\n'));

describe('部品の行の末尾の色', () => {
  test('reads the trailing colour after an anchored model as the board colour', () => {
    const parsed = parseCompactPart('J1', 'sip8 @ a10 105404 blue', 1);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.label).toBe('105404');
    expect(parsed.value.color).toBe('blue');
    expect(spellPart(parsed.value)).toBe('J1: sip8 @ a10 105404 blue');
  });

  test('reads the trailing colour after the holes of a USB board', () => {
    const parsed = parseCompactPart('J1', 'usb-c/female e5 d5 c5 b5 red', 1);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.value).toBeNull();
    expect(parsed.value.color).toBe('red');
    expect(spellPart(parsed.value)).toBe('J1: usb-c/female e5 d5 c5 b5 red');
  });

  test('refuses a colour on a part with no board of its own', () => {
    const { errors } = draw('U1: dip8 @ e10 NE555 blue');

    expect(errors.map((error) => error.message).join('\n')).toContain('基板の色');
  });

  test('keeps an LED colour as its value', () => {
    const parsed = parseCompactPart('D1', 'led b12(A) b13(K) blue', 1);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.value).toBe('blue');
    expect(parsed.value.color ?? null).toBeNull();
  });
});

describe('描いた基板の色', () => {
  test('paints the kit board green when no colour is written, and in the written colour otherwise', () => {
    const plain = draw('J1: sip8 @ a10 105404');
    const blue = draw('J1: sip8 @ a10 105404 blue');

    expect(plain.errors).toEqual([]);
    expect(blue.errors).toEqual([]);
    expect(fillOf(plain.svg, 'module-board')).toBe('#2f7d4f');
    expect(fillOf(blue.svg, 'module-board')).toBe('#1f5c9e');
    expect(blue.svg).toContain(`stroke="${darkenColor('#1f5c9e')}"`);
  });

  test('takes color: in the map form too', () => {
    const { svg, errors } = renderBreadboard([
      'parts:',
      '  J1:',
      '    type: sip8',
      '    holes: [a10]',
      '    value: "105404"',
      '    color: purple',
      '',
    ].join('\n'));

    expect(errors).toEqual([]);
    expect(fillOf(svg, 'module-board')).toBe('#5b3a86');
  });

  test('refuses an unknown colour in the map form', () => {
    const { errors } = renderBreadboard([
      'parts:',
      '  J1:',
      '    type: sip8',
      '    holes: [a10]',
      '    value: "105404"',
      '    color: bare',
      '',
    ].join('\n'));

    expect(errors.map((error) => error.message).join('\n')).toContain('color は色の名前か #RRGGBB');
  });

  test('paints an SOP adapter board and a USB board in the written colour', () => {
    const sop = draw('U1: dip8/sop @ e10 purple');
    const usb = draw('J1: usb-c/female e5 d5 c5 b5 red');

    expect(sop.errors).toEqual([]);
    expect(usb.errors).toEqual([]);
    expect(sop.svg).toContain('#5b3a86');
    expect(usb.svg).toContain('#9e2b2b');
    expect(draw('U1: dip8/sop @ e10').svg).not.toContain('#5b3a86');
  });

  test('paints a one-row module body (KY-040) in the written colour', () => {
    const { svg, errors } = draw('U1: sip5 @ a10 KY-040 red');

    expect(errors).toEqual([]);
    expect(svg).toContain('fill="#9e2b2b"');
  });
});

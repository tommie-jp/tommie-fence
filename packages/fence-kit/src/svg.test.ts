import { describe, expect, test } from 'vitest';
import { TEXT_HALO_WIDTH, num, svgText } from './svg.ts';

describe('num', () => {
  test('drops digits so the same input always makes the same string', () => {
    expect(num(12.3456)).toBe('12.35');
    expect(num(12)).toBe('12');
    // -0 を文字列にすると "0" になる。負のゼロが属性へ漏れないことを固定する。
    expect(num(-0.004)).toBe('0');
  });
});

describe('svgText', () => {
  test('writes a centred label by default', () => {
    expect(svgText(10, 20, 'a1')).toBe(
      '<text x="10" y="20" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif">a1</text>',
    );
  });

  test('escapes the content so a fence cannot inject markup', () => {
    expect(svgText(0, 0, '<img src=x>')).toContain('&lt;img src=x&gt;');
    expect(svgText(0, 0, '<img src=x>')).not.toContain('<img');
  });

  test('paints the halo under the glyphs so a label over a hole stays readable', () => {
    const text = svgText(0, 0, 'R1', { halo: '#fff' });

    expect(text).toContain('stroke="#fff"');
    expect(text).toContain(`stroke-width="${TEXT_HALO_WIDTH}"`);
    expect(text).toContain('paint-order="stroke"');
  });

  test('takes a wider halo when the glyphs are bigger', () => {
    expect(svgText(0, 0, 'R1', { halo: '#fff', haloWidth: 6 })).toContain('stroke-width="6"');
  });

  test('passes other attributes straight through', () => {
    expect(svgText(0, 0, 'R1', { anchor: 'start', fill: '#123456', 'font-size': 8 }))
      .toContain('text-anchor="start"');
    expect(svgText(0, 0, 'R1', { fill: '#123456' })).toContain('fill="#123456"');
  });
});

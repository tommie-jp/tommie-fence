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

  test('draws a see-through halo as its own text under opaque glyphs', () => {
    const text = svgText(0, 0, 'R1', { halo: '#fff', haloOpacity: 0.5, fill: '#111', class: 'cap' });
    const [under, over] = text.split('</text>');

    // 縁は字の形のまま半分透かす。stroke-opacity だと Chromium で字ごとの縁が
    // 重なって濃い跡が出るので、要素の opacity で 1 枚にまとめて透かす。
    expect(under).toContain('opacity="0.5"');
    expect(under).not.toContain('stroke-opacity');
    expect(under).toContain('fill="#fff"');
    expect(under).toContain('stroke="#fff"');
    expect(under).toContain('aria-hidden="true"');
    // 名札を上の層へ移す印は縁にも付ける。付けないと縁だけが部品の下に残る。
    expect(under).toContain('class="cap"');
    // 字そのものは透かさない。
    expect(over).toContain('fill="#111"');
    expect(over).not.toContain('opacity');
    expect(over).not.toContain('stroke=');
  });

  test('keeps the single opaque text when the halo is not see-through', () => {
    expect(svgText(0, 0, 'R1', { halo: '#fff', haloOpacity: 1 })).toBe(svgText(0, 0, 'R1', { halo: '#fff' }));
  });

  test('passes other attributes straight through', () => {
    expect(svgText(0, 0, 'R1', { anchor: 'start', fill: '#123456', 'font-size': 8 }))
      .toContain('text-anchor="start"');
    expect(svgText(0, 0, 'R1', { fill: '#123456' })).toContain('fill="#123456"');
  });
});

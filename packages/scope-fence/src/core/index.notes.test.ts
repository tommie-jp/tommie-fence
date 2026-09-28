import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

/** 段 3b の注釈 (52 の docs/99 §4 の 2)。 */
const RC = [
  'time: 1ms/div',
  'trigger: ch1 rising 1V',
  'ch1: {wave: square 100Hz 1V offset 1V, range: 500mV/div, position: -2div}',
  'ch2: ch1 | rc 1ms',
].join('\n');

const said = (source: string): readonly string[] => {
  const result = renderScope(source);
  return [...result.errors, ...result.notices].map((error) => error.message);
};

describe('renderScope — notes:', () => {
  test('puts the 1 τ text on the pixel of (1ms, 1.26V) on the named channel\'s scale', () => {
    const { svg } = renderScope(`${RC}\nnotes:\n  - text ch2 1ms 1.26V: 1 τ で 63 %`);
    // 格子は x = 55〜455 (1ms/div、左端 −5 ms)、y = 50〜370。ch2 は ch1 と同じ 500mV/div・−2div (Auto)。
    // 1 ms → 55 + 6 × 40 = 295。1.26 V → (1.26 / 0.5 + 2) / 8 = 0.565 → 50 + 0.435 × 320 = 189.2。
    expect(svg).toContain('<circle cx="295" cy="189.2"');
    expect(svg).toContain('>1 τ で 63 %</text>');
  });

  test('draws a band under the traces with its label, and escapes note text', () => {
    const { svg } = renderScope(`${RC}\nnotes:\n  - band 0 1ms: 充電\n  - text 1ms 1V: "<script>&"`);
    expect(svg).toContain('<rect x="255" y="50" width="40" height="320"');
    expect(svg.indexOf('fill-opacity="0.35"')).toBeLessThan(svg.indexOf('<polyline'));
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).not.toContain('<script>');
  });

  test('says which notes it could not place (off screen, a channel not drawn) instead of dropping them silently', () => {
    expect(said(`${RC}\nnotes:\n  - mark 9ms 1V\n  - mark ch3 0 0V\n  - band 6ms 7ms`)).toEqual([
      'mark 9.000 ms 1.00 V は画面の外です (描いていません。ch1 の V/div で置きます)',
      'mark の ch3 を描いていないので、置けません (ch3: を書くか、注釈に描いている ch を書きます)',
      'band 6.000 ms〜7.000 ms は画面の外です (描いていません)',
    ]);
  });

  test('- source writes the fence under the drawing, once', () => {
    const source = `${RC}\nnotes:\n  - source\n  - source`;
    const { svg } = renderScope(source);
    expect(svg).toContain('```scope');
    expect(svg).toContain('ch2: ch1 | rc 1ms');
    expect(said(source)).toEqual(['書き出し (source) は 1 つだけ描きます (後のものは描いていません)']);
  });
});

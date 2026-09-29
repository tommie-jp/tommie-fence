import { describe, expect, test } from 'vitest';
import { renderGraph } from './index.ts';

const BODE = [
  'title: ボード線図',
  'x: 周波数 Hz log 100..100k',
  'y:',
  '  - 利得 dB',
  '  - 位相 deg',
  'lines:',
  '  利得 dB: 20*log10(1/sqrt(1+(x/1.59k)^2))',
  '  位相 deg: -deg(atan(x/1.59k))',
  'notes:',
  '  - level -3dB',
  '  - level -45deg',
  '  - mark 1.59k',
].join('\n');

const RESONANCE = [
  'x: 周波数 Hz log 2k..32k',
  'y: 電流 mA',
  'lines:',
  '  出力 50Ω mA:',
  '    - 2k 0.38',
  '    - 15.9k 17.6',
  '    - 32k 2.0',
  'notes:',
  '  - mark 15.9k',
  '  - band 14k 18k: LED が点く',
  '  - peak',
  '  - text 16k 20mA: f₀',
  '  - source',
].join('\n');

const said = (source: string): string => {
  const result = renderGraph(source);
  return [...result.errors, ...result.notices].map((error) => error.message).join('\n');
};

describe('renderGraph — 読み値', () => {
  test('reads the Bode plot at the mark the way the textbook table does', () => {
    const result = renderGraph(BODE);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.readingLines.join('\n')).toContain('1.59 kHz  −3.01 dB  −45.0°');
    expect(result.readingLines[0]).toBe('読み値 — 理想 (計算)');
  });

  test('reads points, the peak and the mark of the resonance curve', () => {
    const result = renderGraph(RESONANCE);
    expect(result.errors).toEqual([]);
    const lines = result.readingLines.join('\n');
    expect(lines).toContain('15.9 kHz  17.6 mA');
    expect(lines).toContain('出力 50Ω  15.9 kHz  17.6 mA');
  });
});

describe('renderGraph — 図', () => {
  test('draws two panels for two units, solid ideal lines, and no NaN', () => {
    const { svg } = renderGraph(BODE);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('data-graph-fence');
    expect(svg).toContain('利得/dB');
    expect(svg).toContain('位相/°');
    expect(svg).toContain('周波数/Hz (対数)');
    expect((svg.match(/<polyline/g) ?? []).length).toBe(2);
    expect(svg).not.toContain('stroke-dasharray="5 3"');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  test('writes the band, the peak, the note text and the source listing', () => {
    const { svg } = renderGraph(RESONANCE);
    expect(svg).toContain('LED が点く');
    expect(svg).toContain('f₀');
    expect(svg).toContain('```graph');
    expect(svg).toContain('<path');
  });

  test('always draws a frame, even for an empty fence', () => {
    const result = renderGraph('');
    expect(result.svg).toContain('<rect');
    expect(result.errors[0]?.message).toContain('graph フェンスが空です');
  });

  test('sizes the drawing to style: width and leaves out the stamp when asked', () => {
    const { svg } = renderGraph(`${BODE}\nstyle:\n  width: 600\n  stamp: off`);
    expect(svg).toContain('width="600"');
    expect(svg).not.toContain('graph-fence 0.');
  });
});

describe('renderGraph — 言うこと', () => {
  test('says what it assumed when x: or lines: is missing', () => {
    expect(said('title: a')).toContain('x: が無いので x 0..1');
    expect(said('title: a')).toContain('lines: が無いので枠だけ');
  });

  test('refuses an expression-only graph without an x range', () => {
    expect(said('x: 周波数 Hz log\nlines:\n  a dB: x')).toContain('式だけの図は x: に範囲を書きます');
  });

  test('says when an expression has no value in the range', () => {
    expect(said('x: V 1..2\nlines:\n  a V: log10(-x)')).toContain('値を持ちません');
  });

  test('names notes that have no panel to go to', () => {
    expect(said(`${BODE}\n  - level -3V`)).toContain('V の枠がありません');
    expect(said(`${BODE}\n  - level 3`)).toContain('単位を付けます');
    expect(renderGraph('x: V 0..1\nlines:\n  a V: x\nnotes:\n  - level 0.5').errors).toEqual([]);
  });

  test('says a y: without lines, and stops at three panels', () => {
    expect(said('x: V 0..1\ny:\n  - dB\nlines:\n  a V: x')).toContain('y: の dB を使う線がありません');
    const four = 'x: V 0..1\nlines:\n  a A: x\n  b B: x\n  c C: x\n  d D: x';
    expect(said(four)).toContain('枠は 3 つまでです (D の線は描いていません)');
  });

  test('drops values at or below zero on a log panel, and says so', () => {
    expect(said('x: V 0..1\ny: mA log\nlines:\n  a mA: x')).toContain('0 以下の値');
  });

  test('draws measured points as circles, not as a line', () => {
    const source = 'x: V 0..1\nlines:\n  a V: x\ndata: m.csv';
    const result = renderGraph(source, { data: () => 'x (V),a (V)\n0.2,0.25\n0.5,0.48\n' });
    expect(result.errors).toEqual([]);
    expect((result.svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(2 + 1);
    expect(result.svg).toContain('a (実測)');
  });
});

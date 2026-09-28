import { formatVolts } from 'fence-kit';
import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

/** 段 3a の XY (52 の docs/99 §3 の 4)。 */
const said = (source: string): readonly string[] => {
  const result = renderScope(source);
  return [...result.errors, ...result.notices].map((error) => error.message);
};

/** XY の曲線の点 (px)。 */
function curve(svg: string): readonly (readonly [number, number])[] {
  const points = /<polyline points="([^"]+)"[^>]*data-channel="xy"/.exec(svg)?.[1] ?? '';
  return points.split(' ').filter((one) => one !== '').map((one) => one.split(',').map(Number) as unknown as readonly [number, number]);
}

/** 閉じた曲線が縦の線 x を横切る回数 (点の並びを輪として数える。線の上の点は飛ばす)。 */
function crossings(points: readonly (readonly [number, number])[], x: number): number {
  const sides = points.map(([px]) => Math.sign(px - x)).filter((side) => side !== 0);
  return sides.filter((side, index) => side !== sides[(index + 1) % sides.length]).length;
}

/** 格子の縦の中心 (枠の rect から)。 */
function gridOf(svg: string): { readonly x: number; readonly width: number; readonly height: number } {
  const found = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="([\d.]+)" fill="none"/.exec(svg);
  return { x: Number(found?.[1]), width: Number(found?.[2]), height: Number(found?.[3]) };
}

const LISSAJOUS = 'title: 1:2\nview: xy\nch1: sine 2kHz 1V\nch2: sine 1kHz 1V\nxy: ch1 ch2';

describe('renderScope — view: xy', () => {
  test('a 1:2 Lissajous crosses the vertical centre four times', () => {
    const { svg } = renderScope(LISSAJOUS);
    expect(said(LISSAJOUS)).toEqual([]);
    const grid = gridOf(svg);
    expect(crossings(curve(svg), grid.x + grid.width / 2)).toBe(4);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  test('draws an 8 x 8 grid, square', () => {
    const grid = gridOf(renderScope(LISSAJOUS).svg);
    expect(grid.width).toBe(grid.height);
    expect(grid.width).toBe(320);
  });

  test('reads Vpp, Vmax and Vmin on each axis, and names the axes on the status row', () => {
    const result = renderScope(LISSAJOUS);
    expect(result.readingLines[1]).toMatch(/^CH\s+Vpp\s+Vmax\s+Vmin$/);
    expect(result.readingLines.find((line) => line.startsWith('CH1'))).toMatch(/^CH1\s+2\.00 V\s+1\.00 V\s+-1\.00 V$/);
    expect(result.svg).toContain('X CH1 500mV/div');
    expect(result.svg).toContain('Y CH2 500mV/div');
  });

  test('uses the range: written on the channel for its axis', () => {
    const { svg } = renderScope('view: xy\nch1: {wave: sine 1kHz 1V, range: 1V/div}\nch2: ch1 | rc 100us\nxy: ch1 ch2');
    expect(svg).toContain('X CH1 1V/div');
  });

  test('a diode curve written as an expression ends at the forward voltage and the largest current', () => {
    const source = [
      'title: ダイオードの V–I',
      'view: xy',
      'ch1: triangle 50Hz 0.35V offset 0.35V',
      'ch2: = 1.4uV * (exp(ch1 / 52mV) - 1)',
      'xy: ch1 ch2',
    ].join('\n');
    const result = renderScope(source);
    expect(said(source)).toEqual([]);
    // 横 (ダイオードの電圧) は 0〜0.7 V、縦 (100 Ω の電圧) の上の端は式の 0.7 V での値。
    expect(result.readingLines.find((line) => line.startsWith('CH1'))).toMatch(/^CH1\s+700 mV\s+700 mV\s+[\d.]+ µV$/);
    const top = 1.4e-6 * (Math.exp(0.7 / 0.052) - 1);
    expect(result.readingLines.find((line) => line.startsWith('CH2'))).toMatch(new RegExp(`^CH2\\s+${formatVolts(top)}\\s+${formatVolts(top)}\\s+[\\d.]+ nV$`));
  });

  test('takes math as an axis', () => {
    const source = 'view: xy\nch1: triangle 50Hz 1V\nch2: = 1V * clip(ch1 / 1V, 0, 1)\nmath: {expr: (ch1 - ch2) / 100, unit: V}\nxy: ch1 math';
    const result = renderScope(source);
    expect(said(source)).toEqual([]);
    expect(result.svg).toContain('Y MATH');
    expect(result.readingLines.some((line) => line.startsWith('MATH'))).toBe(true);
  });

  test('still draws the grid when an axis is missing', () => {
    const result = renderScope('view: xy\nch1: sine 1kHz 1V\nxy: ch1 ch2');
    expect(result.errors.map((error) => error.message)).toEqual(['xy: の ch2 が書かれていません']);
    expect(result.svg).toContain('<rect');
    expect(curve(result.svg)).toEqual([]);
  });

  test('closes a curve of two frequencies over their common period', () => {
    // 1 kHz と 1.5 kHz は 2 ms で揃う (1 kHz の 2 周期)。
    const { svg } = renderScope('view: xy\nch1: sine 1kHz 1V\nch2: sine 1.5kHz 1V\nxy: ch1 ch2');
    const points = curve(svg);
    const [first, last] = [points[0], points.at(-1)];
    expect(Math.abs((first?.[0] ?? 0) - (last?.[0] ?? 99))).toBeLessThan(1);
    expect(Math.abs((first?.[1] ?? 0) - (last?.[1] ?? 99))).toBeLessThan(1);
  });

  test('says the default axis ch2 is missing, instead of drawing an empty grid silently', () => {
    const result = renderScope('view: xy\nch1: sine 1kHz 1V\nmath: ch1 / 2');
    expect(result.errors.map((error) => error.message)).toEqual(['xy: の ch2 が書かれていません']);
  });

  test('tells a warm-up it could not finish without pointing at time:', () => {
    const messages = said('view: xy\nch1: sine 10kHz 1V\nch2: ch1 | rc 1s\nxy: ch1 ch2');
    expect(messages).toContain('助走 (rc / hp / peak の τ・delay・integrate の 1 周期) が XY の窓 (周波数から決まる) に比べて長いので、定常まで回しきれていません (τ を短くします)');
  });
});

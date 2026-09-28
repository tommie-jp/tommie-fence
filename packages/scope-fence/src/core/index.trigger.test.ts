import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

/** 読み値の行の最初の値 (`CH1  637 mV`) を V で。 */
const firstValue = (lines: readonly string[], name: string): number => {
  const found = lines.find((line) => line.startsWith(name))?.match(/(-?\d+(?:\.\d+)?) (m|µ)?V/);
  if (found === null || found === undefined) throw new Error(`no reading for ${name}`);
  const scale = found[2] === 'm' ? 1e-3 : found[2] === 'µ' ? 1e-6 : 1;
  return Number(found[1]) * scale;
};

/** 折れ線の点 (x, y) の列。 */
const pointsOf = (svg: string, dashed: boolean): readonly (readonly [number, number])[] => {
  const line = [...svg.matchAll(/<polyline [^>]*>/g)].map((match) => match[0])
    .find((one) => one.includes('stroke-dasharray') === dashed);
  const points = line?.match(/points="([^"]*)"/)?.[1] ?? '';
  return points.split(' ').map((pair) => pair.split(',').map(Number) as unknown as readonly [number, number]);
};

/** 一番上 (y が一番小さい) の点の x。 */
const peakX = (points: readonly (readonly [number, number])[]): number =>
  points.reduce((best, point) => (point[1] < best[1] ? point : best))[0];

/** 格子の左端と幅 (枠の rect)。 */
const gridOf = (svg: string): { readonly x: number; readonly y: number; readonly width: number } => {
  const rect = svg.match(/<rect [^>]*width="400"[^>]*>/)?.[0] ?? '';
  return { x: Number(rect.match(/ x="([\d.]+)"/)?.[1]), y: Number(rect.match(/ y="([\d.]+)"/)?.[1]), width: 400 };
};

const HALF = 'time: 50us/div\ntrigger: ch1 rising 0V at -5div\nch1: sine 1kHz 1V\nmeasure: [avg, vmax, vmin]';

describe('renderScope — trigger position (at)', () => {
  test('at -5div shows exactly the positive half-cycle of a 1 kHz sine at 50us/div, avg 0.637 V', () => {
    const result = renderScope(HALF);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    // 正の半周期の平均は 2/π = 0.6366 V。
    expect(firstValue(result.readingLines.filter((line) => line.startsWith('CH1')), 'CH1')).toBeCloseTo(2 / Math.PI, 2);
    expect(Math.abs(firstValue(result.readingLines, 'CH1') - 2 / Math.PI) / (2 / Math.PI)).toBeLessThan(0.01);
  });

  test('at 0 (the default) shows the half-cycle around the centre instead (avg near 0)', () => {
    const result = renderScope(HALF.replace(' at -5div', ''));
    expect(Math.abs(firstValue(result.readingLines, 'CH1'))).toBeLessThan(0.01);
  });

  test('draws the ▼ mark and a cursor at 0 on the left edge', () => {
    const svg = renderScope(`${HALF}\ncursors: [0]`).svg;
    const grid = gridOf(svg);
    const cursor = svg.match(/<line x1="([\d.]+)"[^>]*stroke-dasharray="2 2"/)?.[1];
    expect(Number(cursor)).toBeCloseTo(grid.x, 1);
    // ▼ は格子の上端の 1 px 上に先を向ける。
    const tips = [...svg.matchAll(/<polygon points="[\d.]+,[\d.]+ [\d.]+,[\d.]+ ([\d.]+),([\d.]+)"/g)]
      .filter((match) => Number(match[2]) === grid.y - 1).map((match) => Number(match[1]));
    expect(tips).toEqual([grid.x]);
  });

  test('the peak of the half-cycle is at the centre of the screen (the ideal)', () => {
    const svg = renderScope(HALF).svg;
    const grid = gridOf(svg);
    expect(peakX(pointsOf(svg, true))).toBeCloseTo(grid.x + grid.width / 2, -1);
  });
});

/** WaveForms の CSV (t = 0 がトリガ) — 1 kHz の正弦、-1 ms〜1 ms。 */
const sineCsv = (() => {
  const rows = ['Time (s),Channel 1 (V)'];
  for (let i = 0; i <= 2000; i += 1) {
    const t = -1e-3 + i * 1e-6;
    rows.push(`${t.toExponential(6)},${Math.sin(2 * Math.PI * 1000 * t).toFixed(5)}`);
  }
  return rows.join('\n');
})();

describe('renderScope — trigger position shifts data: by the same amount', () => {
  test('the measured half-cycle lies on the ideal one, peak at the centre', () => {
    const result = renderScope(`${HALF}\ndata: m.csv`, { data: () => sineCsv });
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    const grid = gridOf(result.svg);
    const measured = peakX(pointsOf(result.svg, false));
    expect(measured).toBeCloseTo(grid.x + grid.width / 2, -1);
    // 間引き (px の列) のずれ 1 列までは同じ位置。
    expect(Math.abs(measured - peakX(pointsOf(result.svg, true)))).toBeLessThanOrEqual(1);
  });

  test('a record that starts after the centred screen is on the screen once the trigger is at the left edge', () => {
    const late = 'Time (s),Channel 1 (V)\n3e-4,1\n4e-4,1\n5e-4,1';
    const centred = renderScope(HALF.replace(' at -5div', '').concat('\ndata: m.csv'), { data: () => late });
    expect(centred.notices.map((one) => one.message)).toContain('m.csv には画面 (-250.0 µs〜250.0 µs) の中の点がありません');
    const left = renderScope(`${HALF}\ndata: m.csv`, { data: () => late });
    expect(left.notices).toEqual([]);
  });
});

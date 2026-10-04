import { describe, expect, test } from 'vitest';
import { renderSpectrum } from './index.ts';

/** 11-12 の形: FM 放送帯を tinySA Ultra で。82.5 MHz に −45 dBm の局。 */
const csv = (() => {
  const rows = ['# tinySA trace <script>alert(1)</script>'];
  for (let i = 0; i < 450; i += 1) {
    const f = 76e6 + (i * 19e6) / 449;
    const level = Math.abs(f - 82.5e6) < 30e3 ? -45 : -97;
    rows.push(`${Math.round(f)},${level}`);
  }
  return rows.join('\n');
})();

const FENCE = 'title: 11-12\ndevice: tinysa-ultra\nsweep: 76M-95M 450\nrbw: 100kHz\nref: -30dBm\ndata: fm.csv\nmarkers: [peak]';

const polylines = (svg: string): readonly string[] => [...svg.matchAll(/<polyline [^>]*>/g)].map((match) => match[0]);

describe('renderSpectrum — data:', () => {
  test('draws only the ideal floor and says so when the host has no reader (playground, web)', () => {
    const result = renderSpectrum(FENCE);
    expect(polylines(result.svg)).toHaveLength(1);
    expect(result.notices.map((one) => one.message)).toEqual(['この宿主では fm.csv を読めません (CLI か VS Code の拡張で描くと実測が重なります)']);
    expect(result.readingLines[0]).toBe('読み値 — 理想 (計算)');
  });

  test('says when the file is not there, or cannot be read', () => {
    expect(renderSpectrum(FENCE, { data: () => null }).notices[0]?.message).toBe('fm.csv が見つかりません (.md と同じ場所に置きます)');
    expect(renderSpectrum(FENCE, { data: () => { throw new Error('x'); } }).notices[0]?.message).toBe('fm.csv が見つかりません (.md と同じ場所に置きます)');
    expect(renderSpectrum(FENCE, { data: () => '1,2' }).notices[0]?.message).toBe('fm.csv を読めません: 点が 2 つ以上要ります');
  });

  test('lays the measurement over the floor, solid, and the peak marker reads it', () => {
    const result = renderSpectrum(FENCE, { data: (name) => (name === 'fm.csv' ? csv : null) });
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    const lines = polylines(result.svg);
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.includes('stroke-dasharray'))).toHaveLength(1);
    expect(result.readingLines[0]).toBe('読み値 — 実測 (fm.csv)');
    expect(result.readingLines[2]).toMatch(/^1 {2}82\.\d{3} MHz {2}−45\.00 dBm$/);
    expect(result.svg).toContain('実測 (fm.csv)');
    // `#` の頭書きは描かない。
    expect(result.svg).not.toContain('script');
  });

  test('reads a WaveForms export in dBV on an FFT instrument without a signal', () => {
    const text = 'Frequency (Hz),Trace 1 (dBV)\n0,-120\n1000,-3.01\n2000,-120';
    const result = renderSpectrum('device: ad2\nsweep: 0-2kHz\ndata: w.csv\nmarkers: [peak]', { data: () => text });
    expect(result.notices).toEqual([]);
    expect(result.readingLines[2]).toBe('1  1.000 kHz  −3.01 dBV');
  });

  test('reads a headerless file in MHz, and says so', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 76M-95M 450\nrbw: 100kHz\nref: -30dBm\ndata: m.csv\nmarkers: [peak]', { data: () => '76,-97\n82.5,-45\n95,-97' });
    expect(result.notices.map((one) => one.message)).toEqual(['m.csv: 周波数が MHz で書かれているとみて読みました (見出しの無い CSV は Hz のはず)']);
    expect(result.readingLines[2]).toBe('1  82.500 MHz  −45.00 dBm');
  });

  test('says when no point of the file is inside the sweep', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 76M-95M 450\nrbw: 100kHz\ndata: m.csv', { data: () => 'Frequency (Hz),Trace (dBm)\n1000,-10\n2000,-10' });
    expect(result.notices.map((one) => one.message)).toEqual(['m.csv には掃引 (76 MHz〜95 MHz) の中の点がありません']);
  });

  test('reads the level in the unit: written, for a file without a heading', () => {
    const result = renderSpectrum('device: tinysa-ultra\nsweep: 0-2M 101\nrbw: 30kHz\nunit: dBV\ndata: m.csv\nmarkers: [peak]', { data: () => '0,-100\n1000000,-6.99\n2000000,-100' });
    expect(result.readingLines[2]).toBe('1  1.000 MHz  −6.99 dBV');
  });
});

/** `data:` のファイル名の後に凡例の名前を書ける (vna と同じ)。書かなければ実測。 */
describe('renderSpectrum — the name of the overlay', () => {
  const named = (name: string): string => FENCE.replace('data: fm.csv', `data: fm.csv ${name}`);
  const run = (name: string) => renderSpectrum(named(name), { data: () => csv });

  test('names the overlay as written after the file, in the legend and the readings', () => {
    const result = run('計算');
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('計算 (fm.csv)');
    expect(result.svg).not.toContain('実測');
    expect(result.readingLines[0]).toBe('読み値 — 計算 (fm.csv)');
  });

  test('keeps the words of a name with spaces', () => {
    expect(run('QucsStudio の計算').readingLines[0]).toBe('読み値 — QucsStudio の計算 (fm.csv)');
  });

  test('escapes the name in the figure', () => {
    const result = run('<b>&');
    expect(result.svg).toContain('&lt;b&gt;&amp;');
    expect(result.svg).not.toContain('<b>');
  });

  test('refuses a name that is too long, and says how long it may be', () => {
    const result = run('あ'.repeat(21));
    expect(result.errors.map((error) => error.message).join('\n')).toContain('20 字まで');
  });

  test('accepts a name of exactly 20 characters', () => {
    expect(run('あ'.repeat(20)).errors).toEqual([]);
  });
});

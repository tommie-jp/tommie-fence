import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

/** 5-1 の画面 (1ms/div) の中に 2001 点、0〜2 V の方形波と RC の出力。 */
const csv = (() => {
  const rows = ['#Digilent WaveForms Oscilloscope Acquisition', '#Note: <script>alert(1)</script>', 'Time (s),Channel 1 (V),Channel 2 (V)'];
  for (let i = 0; i <= 2000; i += 1) {
    const t = -5e-3 + i * 5e-6;
    const high = t >= 0;
    const ch2 = high ? 2 - 1.9866 * Math.exp(-t / 1e-3) : 1.9866 * Math.exp(-(t + 5e-3) / 1e-3);
    rows.push(`${t.toExponential(6)},${high ? 2 : 0},${ch2.toFixed(5)}`);
  }
  return rows.join('\n');
})();

const FENCE = 'title: 5-1\ntime: 1ms/div\ntrigger: ch1 rising 1V\nch1: square 100Hz 1V offset 1V\nch2: ch1 | rc 1ms\ncursors: [0, 1ms]\ndata: m.csv';

const polylines = (svg: string): readonly string[] => [...svg.matchAll(/<polyline [^>]*>/g)].map((match) => match[0]);

describe('renderScope — data:', () => {
  test('draws only the ideal and says so when the host has no reader', () => {
    const result = renderScope(FENCE);
    expect(polylines(result.svg)).toHaveLength(2);
    expect(result.notices.map((one) => one.message)).toEqual(['この宿主では m.csv を読めません (CLI か VS Code の拡張で描くと実測が重なります)']);
  });

  test('draws only the ideal when the file is not there', () => {
    const result = renderScope(FENCE, { data: () => null });
    expect(polylines(result.svg)).toHaveLength(2);
    expect(result.notices[0]?.message).toBe('m.csv が見つかりません (.md と同じ場所に置きます)');
  });

  test('lays the measurement over the ideal, solid, and reads its values', () => {
    const result = renderScope(FENCE, { data: (name) => (name === 'm.csv' ? csv : null) });
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    const lines = polylines(result.svg);
    expect(lines).toHaveLength(4);
    expect(lines.filter((line) => line.includes('stroke-dasharray'))).toHaveLength(2);
    expect(result.readingLines[0]).toBe('読み値 — 実測 (m.csv)');
    expect(result.readingLines.some((line) => /^X2 .* 2\.00 V {2}1\.27 V$/.test(line))).toBe(true);
    expect(result.svg).toContain('実測 (m.csv)');
    // `#` の頭書きは描かない。
    expect(result.svg).not.toContain('script');
  });

  test('draws the measurement alone, taking time/div from the record', () => {
    const result = renderScope('title: x\ndata: m.csv', { data: () => csv });
    expect(polylines(result.svg)).toHaveLength(2);
    expect(result.svg).toContain('1ms/div');
    expect(result.notices.map((one) => one.message)).toEqual(['time: が無いので 1ms/div (記録の幅から) で描いています']);
  });

  test('says when the record has no point on the screen', () => {
    const result = renderScope('time: 1us/div\ndata: m.csv', { data: () => 'Time (s),Channel 1 (V)\n1,0\n2,0' });
    expect(result.notices.map((one) => one.message)).toContain('m.csv には画面 (-5.000 µs〜5.000 µs) の中の点がありません');
  });

  test('says why a file cannot be read, and draws the ideal', () => {
    const result = renderScope(FENCE, { data: () => 'Time (s);Channel 1 (V)\n0;1,5\n1;1,5' });
    expect(result.notices[0]?.message).toBe('m.csv を読めません: 小数点がコンマです (WaveForms の設定で小数点をピリオドにして書き出し直します)');
    expect(polylines(result.svg)).toHaveLength(2);
  });

  test('passes on what the reader dropped', () => {
    const result = renderScope('time: 1ms/div\ndata: m.csv', { data: () => 'Time (s),Channel 1 (V),Math 1 (V)\n0,1,1\n1e-3,1,1' });
    expect(result.notices.map((one) => one.message)).toContain('m.csv: Math 1 (V) の列は読み捨てました (Math は描きません)');
  });

  test('mixes the headings when a channel has only the ideal', () => {
    const result = renderScope(`${FENCE}\nch3: ch2 | abs`, { data: () => csv });
    expect(result.readingLines[0]).toBe('読み値 — 実測 (m.csv)。CH3 は理想');
  });
});

/** `data:` のファイル名の後に凡例の名前を書ける (vna と同じ)。書かなければ実測。 */
describe('renderScope — the name of the overlay', () => {
  const named = (name: string): string => FENCE.replace('data: m.csv', `data: m.csv ${name}`);
  const run = (name: string) => renderScope(named(name), { data: () => csv });

  test('names the overlay as written after the file, in the legend and the readings', () => {
    const result = run('計算');
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('計算 (m.csv)');
    expect(result.svg).not.toContain('実測');
    expect(result.readingLines[0]).toBe('読み値 — 計算 (m.csv)');
  });

  test('keeps the words of a name with spaces', () => {
    expect(run('QucsStudio の計算').readingLines[0]).toBe('読み値 — QucsStudio の計算 (m.csv)');
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

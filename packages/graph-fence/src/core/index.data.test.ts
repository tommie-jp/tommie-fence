import { describe, expect, test } from 'vitest';
import { renderGraph } from './index.ts';

const SOURCE = [
  'x: 周波数 Hz log 2k..32k',
  'lines:',
  '  出力 50Ω mA:',
  '    - 2k 0.38',
  '    - 15.9k 17.6',
  '    - 32k 2.0',
  'data: 9-1.csv',
  'notes:',
  '  - mark 15.9k',
].join('\n');

const CSV = '# 手で測った値\n周波数 (kHz),出力 50Ω (mA)\n2,0.40\n15.9,17.1\n32,2.1\n';

const notices = (data?: (name: string) => string | null): string =>
  renderGraph(SOURCE, data === undefined ? {} : { data }).notices.map((one) => one.message).join('\n');

describe('data:', () => {
  test('says the host cannot read it, and still draws the ideal line', () => {
    const result = renderGraph(SOURCE);
    expect(notices()).toContain('この宿主では 9-1.csv を読めません');
    expect((result.svg.match(/<polyline/g) ?? []).length).toBe(1);
  });

  test('says the file is not there, and when the reader throws', () => {
    expect(notices(() => null)).toContain('9-1.csv が見つかりません');
    expect(notices(() => {
      throw new Error('EACCES');
    })).toContain('9-1.csv が見つかりません');
  });

  test('says why it cannot read the file', () => {
    expect(notices(() => 'x (V),a\n1,2\n')).toContain('9-1.csv を読めません: 1 列目の単位 (V) が横軸 (Hz) と違います');
  });

  test('puts the measured points on the line and reads them at the mark', () => {
    const result = renderGraph(SOURCE, { data: () => CSV });
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    expect(result.readingLines[0]).toBe('読み値 — 理想 (計算) と 実測 (9-1.csv)');
    expect(result.readingLines.join('\n')).toContain('15.9 kHz  17.6 mA   17.1 mA');
    expect(result.svg).toContain('出力 50Ω (実測)');
  });

  test('draws a data-only graph, with the readings from the measurement', () => {
    const result = renderGraph('x: 周波数 Hz log 2k..32k\ndata: 9-1.csv\nnotes:\n  - mark 15.9k', { data: () => CSV });
    expect(result.errors).toEqual([]);
    expect(result.readingLines[0]).toBe('読み値 — 実測 (9-1.csv)');
  });

  test('passes on what the file said', () => {
    expect(notices(() => '周波数 (kHz),a (mA),b (mA)\n2,1,\n')).toContain('9-1.csv: b の列は値が無いので読み捨てました');
  });
});

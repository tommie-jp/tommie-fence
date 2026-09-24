import { describe, expect, test } from 'vitest';
import { renderVna } from './index.ts';
import type { DataSource } from './index.ts';

const fence = (lines: readonly string[]): string => lines.join('\n');
const said = (result: ReturnType<typeof renderVna>): string => [...result.errors, ...result.notices].map((error) => error.message).join('\n');

const SERIES = fence(['sweep: 1M-300M 101', 'title: 図1', 'dut: series R 100', 'markers:', '  - 10M', '  - 300M']);

const S2P = ['# HZ S RI R 50', '1000000 0.5 0 0.5 0 0.5 0 0.5 0', '150000000 0.5 0.01 0.5 0 0.5 0 0.5 0', '300000000 0.5 0.1 0.49 0 0.49 0 0.5 0'].join('\n');
const files = (entries: Readonly<Record<string, string>>): DataSource => (name) => entries[name] ?? null;

describe('renderVna', () => {
  test('draws the 3-1 figure: two dB traces and a Smith trace, with readings', () => {
    const result = renderVna(SERIES);
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('data-vna-fence');
    expect(result.svg.match(/<polyline/g)).toHaveLength(3);
    expect(result.svg).toContain('stroke-dasharray="5 3"');
    expect(result.readings.basis).toBe('model');
    expect(result.readings.rows[0]).toEqual(['1', '10.000 MHz', '−6.02 dB', '−6.02 dB', '150.0 Ω + j0.0 Ω']);
    expect(result.readingLines[0]).toBe('読み値 — 理想 (dut: の模型)');
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  test('an empty fence still draws the empty frames', () => {
    const result = renderVna('');
    expect(result.svg).toContain('<svg');
    expect(result.errors[0]?.message).toContain('空です');
    expect(result.errorHtml).toContain('vna-errors');
  });

  test('says so when there is nothing to draw', () => {
    expect(said(renderVna('sweep: 1M-2M'))).toContain('dut: も data: も無い');
  });

  test('says when the sweep is outside the device', () => {
    expect(said(renderVna('device: h4\nsweep: 1M-3G\ndut: series R 1'))).toContain('1.5 GHz まで');
  });

  test('markers outside the sweep are said and not drawn', () => {
    const result = renderVna('sweep: 1M-2M\ndut: series R 1\nmarkers:\n  - 5M');
    expect(said(result)).toContain('掃引の外');
    expect(result.readings.rows).toEqual([]);
  });

  test('moves line numbers to the markdown', () => {
    const result = renderVna('foo: 1', { offset: 10 });
    expect(result.errors[0]?.line).toBe(11);
  });

  describe('data:', () => {
    const MEASURED = fence(['sweep: 1M-300M', 'dut: series R 100', 'data: m.s2p', 'markers:', '  - 150M']);

    test('overlays the measured trace as a solid line and reads the markers from it', () => {
      const result = renderVna(MEASURED, { data: files({ 'm.s2p': S2P }) });
      expect(result.notices).toEqual([]);
      expect(result.readings.basis).toBe('data');
      expect(result.readings.rows[0]?.[1]).toBe('150.000 MHz');
      expect(result.svg.match(/<polyline/g)).toHaveLength(6);
      expect(result.svg).toContain('実測 (m.s2p)');
      expect(result.readingLines[0]).toBe('読み値 — 実測 (m.s2p)');
    });

    test('says when the host cannot read files', () => {
      expect(said(renderVna(MEASURED))).toContain('この宿主では m.s2p を読めません');
    });

    test('says when the file is missing, broken, or out of the sweep', () => {
      expect(said(renderVna(MEASURED, { data: files({}) }))).toContain('見つかりません');
      expect(said(renderVna(MEASURED, { data: () => { throw new Error('x'); } }))).toContain('見つかりません');
      expect(said(renderVna(MEASURED, { data: files({ 'm.s2p': '# HZ S RI R 50\n1 x' }) }))).toContain('読めません');
      const far = renderVna(MEASURED.replace('1M-300M', '1G-2G'), { data: files({ 'm.s2p': S2P }) });
      expect(said(far)).toContain('掃引');
    });

    test('says when the reference impedance is not 50 Ω', () => {
      expect(said(renderVna(MEASURED, { data: files({ 'm.s2p': S2P.replace('R 50', 'R 75') }) }))).toContain('75 Ω');
    });

    test('a one-port file has no S21', () => {
      const s1p = '# HZ S RI R 50\n1000000 0.5 0\n300000000 0.5 0';
      const result = renderVna(fence(['sweep: 1M-300M', 'data: m.s1p']), { data: files({ 'm.s1p': s1p }) });
      expect(said(result)).toContain('1 端子');
    });

    test('uneven data cannot be turned into a TDR', () => {
      const uneven = '# HZ S RI R 50\n1000000 0.5 0\n2000000 0.5 0\n9000000 0.5 0';
      const result = renderVna(fence(['sweep: 1M-10M', 'data: m.s1p', 'traces:', '  - S11 tdr']), { data: files({ 'm.s1p': uneven }) });
      expect(said(result)).toContain('等間隔');
    });
  });

  test('a model that ends open has no S21, and says so', () => {
    const result = renderVna(fence(['sweep: 1M-1G 401', 'dut:', '  - line 50 1m vf 0.66', '  - open', 'traces:', '  - S21 logmag', '  - S11 tdr', '  - S11 delay']));
    expect(said(result)).toContain('S21 の理想は描きません');
    expect(result.readings.extra[0]).toContain('1.006 m');
  });

  test('every format draws without NaN', () => {
    for (const traces of [['S11 phase', 'S11 swr', 'S11 linear', 'S11 polar'], ['S11 r', 'S11 x', 'S11 z', 'S21 delay'], ['S11 z']]) {
      const result = renderVna(fence(['sweep: 1M-300M', 'dut:', '  - shunt C 47p', '  - series L 100n', 'traces:', ...traces.map((line) => `  - ${line}`), 'markers:', '  - 100M']));
      expect(result.errors).toEqual([]);
      expect(result.svg).not.toMatch(/NaN|Infinity/);
      expect(result.readings.rows[0]).toHaveLength(2 + traces.length);
    }
  });

  test('notes land on the panel of their unit, and say when there is none', () => {
    const result = renderVna(fence([
      'sweep: 1M-300M', 'dut: series R 100', 'traces:', '  - S21 logmag', 'notes:',
      '  - band 10M 20M: 帯', '  - text 100M -6dB: ここ', '  - mark 100M 45deg', '  - source', '  - source',
    ]));
    expect(result.svg).toContain('帯');
    expect(result.svg).toContain('ここ');
    expect(result.svg).toContain('```vna');
    const text = said(result);
    expect(text).toContain('deg の枠');
    expect(text).toContain('1 つだけ');
  });

  test('a band with no frequency panel says so; unitless notes go on SWR', () => {
    const smithOnly = renderVna(fence(['sweep: 1M-300M', 'dut: series R 1', 'traces:', '  - S11 smith', 'notes:', '  - band 1M 2M', '  - mark 1M 2']));
    expect(said(smithOnly)).toContain('band を塗る枠');
    expect(said(smithOnly)).toContain('SWR か linear');
    const swr = renderVna(fence(['sweep: 1M-300M', 'dut: series R 1', 'traces:', '  - S11 swr', 'notes:', '  - mark 10M 2']));
    expect(said(swr)).not.toContain('枠がありません');
  });

  test('style: debug off keeps notices out of the band, but still returns them', () => {
    const result = renderVna('sweep: 1M-2M\nstyle:\n  debug: off');
    expect(result.notices.length).toBeGreaterThan(0);
    expect(result.errorHtml).toBe('');
  });

  test('stamps the version and scales the width when asked', () => {
    const result = renderVna(`${SERIES}\nstyle:\n  stamp: on\n  width: 400\n  theme: mono`);
    expect(result.svg).toContain('vna-fence');
    expect(result.svg).toContain('width="400"');
  });
});

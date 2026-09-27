import { describe, expect, test } from 'vitest';
import { looksLikeMegahertz, parseSpectrumCsv } from './csv.ts';

/** tinySA の SAVE TRACES の形 (見出し無し、Hz と dBm)。実物を写すまでは形だけ写したもの。 */
const TINYSA = ['76000000,-97.5', '76042316,-96.8', '76084632,-45.2', '76126948,-98.1'].join('\n');

/** WaveForms の Spectrum の Export の形 (`#` の頭書き + 見出し)。 */
const WAVEFORMS = [
  '#Digilent WaveForms Spectrum Analyzer',
  '#Device Name: Discovery2',
  '#Date Time: 2026-09-28 10:00:00.000',
  'Frequency (Hz),Trace 1 (dBV)',
  '0,-120.5',
  '6.25,-118.2',
  '12.5,-3.01',
].join('\n');

const read = (text: string) => {
  const result = parseSpectrumCsv(text);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe('parseSpectrumCsv', () => {
  test('reads the tinySA trace: no heading, Hz and dBm', () => {
    const result = read(TINYSA);
    expect(result.frequencies[2]).toBe(76084632);
    expect(result.levels[2]).toBe(-45.2);
    expect(result.unit).toBeNull();
    expect(result.headed).toBe(false);
  });

  test('reads the WaveForms export: skips the # header, takes the units from the heading', () => {
    const result = read(WAVEFORMS);
    expect([...result.frequencies]).toEqual([0, 6.25, 12.5]);
    expect(result.unit).toBe('dBV');
    expect(read('Frequency (MHz);Trace 1 (dBm)\n1;-10\n2;-20').frequencies[1]).toBe(2e6);
    expect(read('Freq (kHz)\tC1 (dBm)\n1\t-10\n2\t-20\n').frequencies[0]).toBe(1e3);
  });

  test('takes CRLF and a trailing delimiter', () => {
    expect(read('1000,-10,\r\n2000,-20,\r\n').levels[1]).toBe(-20);
  });

  test('refuses what it cannot read, saying why', () => {
    expect(parseSpectrumCsv('')).toEqual({ ok: false, reason: '中身がありません' });
    expect(parseSpectrumCsv('1000,-10')).toEqual({ ok: false, reason: '点が 2 つ以上要ります' });
    expect(parseSpectrumCsv('Time (s),Channel 1 (V)\n0,1\n1,1')).toMatchObject({ ok: false, reason: expect.stringContaining('Frequency (Hz)') });
    expect(parseSpectrumCsv('Frequency (Hz),Trace 1\n0,1\n1,1')).toMatchObject({ ok: false, reason: expect.stringContaining('(dBm) か (dBV)') });
    expect(parseSpectrumCsv('2000,-10\n1000,-20')).toEqual({ ok: false, reason: '周波数が 2 行目で戻っています (周波数の順に並べます)' });
    expect(parseSpectrumCsv('1000;-10,5\n2000;-20,5')).toEqual({ ok: false, reason: '小数点がコンマです (小数点をピリオドにして書き出し直します)' });
    expect(parseSpectrumCsv('1000,-10\n2000,x')).toEqual({ ok: false, reason: '2 行目の値が読めません: x' });
    expect(parseSpectrumCsv('1000,-10\n2000,-20,3')).toEqual({ ok: false, reason: '2 行目の列が 2 つではありません' });
  });

  test('refuses more than two columns before allocating anything, and quickly', () => {
    const heading = ['Frequency (Hz)', 'Trace 1 (dBm)', ...Array.from({ length: 40000 }, (_, index) => `X${index}`)].join(',');
    const text = [heading, ...Array.from({ length: 40000 }, () => '0')].join('\n');
    const started = performance.now();
    expect(parseSpectrumCsv(text)).toEqual({ ok: false, reason: '列は 2 つ (周波数とレベル) にします' });
    expect(performance.now() - started).toBeLessThan(100);
  });

  test('refuses too many rows', () => {
    const rows = Array.from({ length: 10002 }, (_, index) => `${index + 1},-10`).join('\n');
    expect(parseSpectrumCsv(rows)).toEqual({ ok: false, reason: '行が多すぎます (10001 行まで)' });
  });

  test('drops control and bidi characters read from the file before saying anything about them', () => {
    const heading = parseSpectrumCsv('Frequency (Hz),\u001b[2KEvil‮gnp​\n0,1\n1,1');
    const reason = heading.ok ? '' : heading.reason;
    expect(reason).toBe('2 列目の見出しに単位 (dBm) か (dBV) を書きます (いまは [2KEvilgnp)');
    const cell = parseSpectrumCsv('1000,-10\n2000,\u001b]0;pwned\u0007x‮');
    expect(cell.ok ? '' : cell.reason).toBe('2 行目の値が読めません: ]0;pwnedx');
  });
});

describe('looksLikeMegahertz', () => {
  test('reads 76–95 as MHz when the sweep ends at 95 MHz, but not 0–20000 on a 20 kHz sweep', () => {
    expect(looksLikeMegahertz(Float64Array.from([76, 95]), 95e6)).toBe(true);
    expect(looksLikeMegahertz(Float64Array.from([0, 20000]), 20e3)).toBe(false);
    expect(looksLikeMegahertz(Float64Array.from([0]), 20e3)).toBe(false);
  });
});

import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv.ts';

/** WaveForms (Scope → Export → CSV) の頭書きの形を写したもの。 */
const WAVEFORMS = [
  '#Digilent WaveForms Oscilloscope Acquisition',
  '#Device Name: Discovery2',
  '#Serial Number: SN:210321A0000',
  '#Date Time: 2026-09-28 10:00:00.000',
  '#Sample rate: 1e+06Hz',
  '#Samples: 4',
  '#Trigger: Source: Channel 1 Type: Edge Condition: Rise Level: 1 V',
  '#Channel 1: Range: 500 mV/div Offset: -1 V',
  'Time (s),Channel 1 (V),Channel 2 (V)',
  '-1e-06,0,0.01',
  '0,1,0.02',
  '1e-06,2,0.03',
  '2e-06,2,0.04',
].join('\n');

const read = (text: string) => {
  const result = parseCsv(text);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe('parseCsv', () => {
  test('reads the WaveForms export: skips the # header and maps Channel N to chN', () => {
    const result = read(WAVEFORMS);
    expect([...result.time]).toEqual([-1e-6, 0, 1e-6, 2e-6]);
    expect(result.columns.map((column) => column.name)).toEqual(['ch1', 'ch2']);
    expect([...(result.columns[0]?.values ?? [])]).toEqual([0, 1, 2, 2]);
    expect(result.dt).toBeCloseTo(1e-6, 15);
    expect(result.notes).toEqual([]);
  });

  test('reads it without the header comments, with CRLF, tabs or semicolons', () => {
    const body = WAVEFORMS.split('\n').filter((line) => !line.startsWith('#'));
    expect(read(body.join('\r\n')).columns).toHaveLength(2);
    expect(read(body.map((line) => line.replaceAll(',', '\t')).join('\n')).columns).toHaveLength(2);
    expect(read(body.map((line) => line.replaceAll(',', ';')).join('\n')).columns).toHaveLength(2);
  });

  test('reads C1 (V) and CH2 (mV) headings, and a time in ms', () => {
    const result = read('Time (ms),C1 (V),CH2 (mV)\n0,1,500\n0.5,1,500\n1,1,500');
    expect(result.columns.map((column) => column.name)).toEqual(['ch1', 'ch2']);
    expect(result.columns[1]?.values[0]).toBe(0.5);
    expect(result.time[2]).toBeCloseTo(1e-3, 15);
  });

  test('takes the columns in order when there is no heading', () => {
    const result = read('0,1,2\n1e-6,1,2\n2e-6,1,2');
    expect(result.columns.map((column) => column.name)).toEqual(['ch1', 'ch2']);
  });

  test('drops Math and says so', () => {
    const result = read('Time (s),Channel 1 (V),Math 1 (V)\n0,1,2\n1e-6,1,2');
    expect(result.columns.map((column) => column.name)).toEqual(['ch1']);
    expect(result.notes).toEqual(['Math 1 (V) の列は読み捨てました (Math は描きません)']);
  });

  test.each([
    ['Time (s),Channel 1 (V)\n0,1\n2e-6,1\n1e-6,1', '時刻が 4 行目で戻っています (時刻の順に並べます)'],
    ['Time (s),Channel 1 (V)\n0,1\n1e-6,1\n3e-6,1', '時刻の間隔が揃っていません (Record で書き出した分割のある記録は読めません)'],
    ['Time (s),Channel 1 (V)\n0,1', '点が 2 つ以上要ります'],
    ['Time (s);Channel 1 (V)\n0;1,5\n0,000001;1,5', '小数点がコンマです (WaveForms の設定で小数点をピリオドにして書き出し直します)'],
    ['Time (s),Channel 1 (V)\n0,x\n1e-6,1', '2 行目の値が読めません: x'],
    ['Time (s),Channel 1 (V),Channel 9 (V)\n0,1,1\n1e-6,1,1', 'Channel 9 (V) の列は ch1〜ch4 に当たりません'],
    ['Time (s)\n0\n1e-6', 'ch の列がありません (Time の後ろに Channel 1 (V) …)'],
    ['', '中身がありません'],
    ['Voltage,Channel 1 (V)\n0,1\n1e-6,1', '1 列目は Time (s) にします (WaveForms の書き出しと同じ)'],
  ])('refuses %j', (text, reason) => {
    expect(parseCsv(text)).toEqual({ ok: false, reason });
  });

  test('refuses too many rows', () => {
    const rows = Array.from({ length: 100_002 }, (_, i) => `${i * 1e-6},1`);
    expect(parseCsv(`Time (s),Channel 1 (V)\n${rows.join('\n')}`)).toEqual({ ok: false, reason: '行が多すぎます (100001 行まで)' });
  });

  test('drops control and bidi characters read from the file before saying anything about them', () => {
    const heading = parseCsv('Time (s),Channel 1 (V),\u001b[2KEvil\u202Egnp.exe\u200B\n0,1,1\n1e-3,1,1');
    expect(heading.ok && heading.notes).toEqual(['[2KEvilgnp.exe の列は読み捨てました']);
    const cell = parseCsv('Time (s),Channel 1 (V)\n0,1\n1e-3,\u001b]0;pwned\u0007x\u202E');
    expect(cell.ok).toBe(false);
    const reason = cell.ok ? '' : cell.reason;
    expect(reason).toBe('3 行目の値が読めません: ]0;pwnedx');
    expect(reason).not.toMatch(/[\u001b\u0007\u202E]/u);
  });

  test('refuses a heading with too many columns before allocating anything, and quickly', () => {
    // 1 MB の上限の中でも 行 × 列 が膨らむ形 (列 4 万・1 バイトの行 4 万)。
    const heading = ['Time (s)', 'Channel 1 (V)', ...Array.from({ length: 40000 }, (_, index) => `X${index}`)].join(',');
    const text = [heading, ...Array.from({ length: 40000 }, () => '0')].join('\n');
    const started = performance.now();
    const result = parseCsv(text);
    expect(performance.now() - started).toBeLessThan(100);
    expect(result).toEqual({ ok: false, reason: '列が多すぎます (16 列まで)' });
  });

  test('still reads 16 columns, dropping the ones it does not draw', () => {
    const heading = ['Time (s)', 'Channel 1 (V)', ...Array.from({ length: 14 }, (_, index) => `X${index}`)].join(',');
    const row = (t: number): string => [t, 1, ...Array.from({ length: 14 }, () => 0)].join(',');
    const result = read([heading, row(0), row(1e-3)].join('\n'));
    expect(result.columns.map((column) => column.name)).toEqual(['ch1']);
    expect(result.notes).toHaveLength(14);
  });
});

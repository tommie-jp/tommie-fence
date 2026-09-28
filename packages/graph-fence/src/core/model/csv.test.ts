import { describe, expect, test } from 'vitest';
import { parseCsv } from './csv.ts';
import { matchColumns } from './data.ts';
import type { LineSpec } from './lines.ts';

const reason = (text: string, unit = 'Hz'): string => {
  const read = parseCsv(text, unit);
  return read.ok ? '' : read.reason;
};

describe('parseCsv', () => {
  test('reads a hand-typed table with a heading', () => {
    const read = parseCsv('周波数 (Hz),電流 (mA)\n2000,0.4\n15900,17.1\n', 'Hz');
    expect(read).toEqual({ ok: true, columns: [{ name: '電流', unit: 'mA', points: [{ x: 2000, y: 0.4 }, { x: 15900, y: 17.1 }] }], notes: [] });
  });

  test('reads a WaveForms Network export with # lines, tabs and a kHz column', () => {
    const text = '#Digilent WaveForms Network\n#Date: x\nFrequency (kHz)\tChannel 2 Magnitude (dB)\tChannel 2 Phase (deg)\n0.1\t-0.02\t-3.6\n1.59\t-3.1\t-45.2\n';
    const read = parseCsv(text, 'Hz');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.columns.map((column) => `${column.name} ${column.unit}`)).toEqual(['Channel 2 Magnitude dB', 'Channel 2 Phase deg']);
    expect(read.columns[0]?.points[1]).toEqual({ x: 1590, y: -3.1 });
  });

  test('reads a table without a heading, with ; and CRLF', () => {
    const read = parseCsv('1;2\r\n2;3\r\n', 'V');
    expect(read.ok && read.columns[0]).toEqual({ name: 'y1', unit: null, points: [{ x: 1, y: 2 }, { x: 2, y: 3 }] });
  });

  test('skips an empty cell and drops a column with no values', () => {
    const read = parseCsv('x (Hz),a (mA),b (mA)\n1,2,\n2,,\n', 'Hz');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.columns).toEqual([{ name: 'a', unit: 'mA', points: [{ x: 1, y: 2 }] }]);
    expect(read.notes[0]).toContain('b の列は値が無い');
  });

  test('refuses what it cannot read, saying why', () => {
    expect(reason('')).toBe('中身がありません');
    expect(reason('1\n2')).toContain('2 列以上');
    expect(reason('x (Hz),y\n')).toContain('値の行がありません');
    expect(reason('x (V),y\n1,2', 'Hz')).toContain('横軸 (Hz) と違います');
    expect(reason('x,y\n1,2,3')).toContain('見出しより多い');
    expect(reason('x,y\n1,abc')).toContain('読めません: abc');
    expect(reason('x,y\n,2')).toContain('x が空です');
    expect(reason('x,y\n2,1\n1,1')).toContain('増えていません');
    expect(reason('x;y\n1;2,5')).toContain('小数点がコンマ');
    expect(reason('x,y\n1,\n')).toContain('y の列に値がありません');
    expect(reason(`${Array.from({ length: 17 }, () => 'a').join(',')}\n`)).toContain('列が多すぎます');
    expect(reason(`x,y\n${Array.from({ length: 100002 }, (_, index) => `${index},1`).join('\n')}`)).toContain('行が多すぎます');
  });

  test('does not carry invisible characters of the heading into what it says', () => {
    const read = parseCsv('x,a‮\u001b[2Kb (mA)\n1,\n', 'Hz');
    expect(read.ok).toBe(false);
    const said = parseCsv('x,a‮b (mA),c\n1,,2\n', 'Hz');
    expect(said.ok && said.notes[0]).toBe('ab の列は値が無いので読み捨てました');
  });
});

describe('matchColumns', () => {
  const ideal = (name: string, unit: string, index: number): LineSpec => ({
    name, unit, source: { kind: 'points', points: [] }, index, line: 3,
  });
  const column = (name: string, unit: string | null) => ({ name, unit, points: [{ x: 1, y: 2 }] });

  test('matches by unit and name, then by unit alone', () => {
    const lines = [ideal('利得', 'dB', 0), ideal('位相', 'deg', 1)];
    const matched = matchColumns([column('Channel 2 Magnitude', 'dB'), column('Channel 2 Phase', 'deg')], lines, '');
    expect(matched.lines.map((line) => `${line.name} ${line.index}`)).toEqual(['利得 0', '位相 1']);
    expect(matched.said).toEqual([]);
    const byName = matchColumns([column('出力 50Ω', 'mA')], [ideal('出力 50Ω', 'mA', 0), ideal('出力 ≈0Ω', 'mA', 1)], '');
    expect(byName.lines[0]?.index).toBe(0);
  });

  test('makes a new line when nothing matches, and says so', () => {
    const matched = matchColumns([column('温度', '℃')], [ideal('電流', 'mA', 0)], '');
    expect(matched.lines[0]).toMatchObject({ name: '温度', unit: '℃', index: 1 });
    expect(matched.said[0]).toContain('新しい線');
  });

  test('borrows the unit of the first line, or of y:, for a column without one', () => {
    expect(matchColumns([column('y1', null)], [ideal('電流', 'mA', 0)], '').lines[0]).toMatchObject({ name: '電流', unit: 'mA', index: 0 });
    expect(matchColumns([column('y1', null)], [], 'V').lines[0]).toMatchObject({ unit: 'V', index: 0 });
  });
});

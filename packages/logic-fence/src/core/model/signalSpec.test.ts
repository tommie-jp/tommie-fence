import { describe, expect, test } from 'vitest';
import { parseSignal } from './signalSpec.ts';

const spec = (text: string) => {
  const read = parseSignal(text);
  if (!read.ok) throw new Error(read.reason);
  return read.value;
};
const refused = (text: string): string => {
  const read = parseSignal(text);
  if (read.ok) throw new Error('読めてしまった');
  return read.reason;
};

describe('parseSignal', () => {
  test('reads a clock with an optional dio and duty', () => {
    expect(spec('dio0 clock 1Hz')).toEqual({ dio: { from: 0, to: 0 }, spec: { kind: 'clock', frequency: 1, duty: 0.5 } });
    expect(spec('clock 10kHz duty 25%').spec).toEqual({ kind: 'clock', frequency: 10e3, duty: 0.25 });
  });

  test('reads pulse, pattern, high, low and edges', () => {
    expect(spec('pulse 2s 500ms').spec).toMatchObject({ kind: 'pulse', at: 2, width: 0.5 });
    expect(spec('pattern 01_10 bit 1ms from 2ms repeat').spec).toMatchObject({ kind: 'pattern', bits: '0110', from: 0.002, repeat: true });
    expect(spec('high').spec).toEqual({ kind: 'level', level: 1 });
    expect(spec('low').spec).toEqual({ kind: 'level', level: 0 });
    expect(spec('edges 0s=0 1.5s=1').spec).toMatchObject({ kind: 'edges', pairs: [[0, 0], [1.5, 1]] });
  });

  test('reads a counter with a dio range and a sequence', () => {
    const read = spec('dio1..dio4 counter on CLK rising sequence 0 1 0x2 3');
    expect(read.dio).toEqual({ from: 1, to: 4 });
    expect(read.spec).toMatchObject({ kind: 'counter', on: 'CLK', edge: 'rising', sequence: [0, 1, 2, 3], wrap: null });
    expect(spec('counter bits 3 on CLK falling start 2 wrap 6').spec).toMatchObject({ bits: 3, edge: 'falling', start: 2, wrap: 6 });
  });

  test('refuses a bare number for a frequency or a time', () => {
    expect(refused('clock 1000')).toContain('単位');
    expect(refused('pulse 2 500ms')).toContain('単位');
  });

  test('says the accepted kinds when the kind is unknown', () => {
    expect(refused('dio0 sqare 1Hz')).toContain('clock / pulse / pattern / high / low / edges / counter');
  });

  test('refuses what would read as something else', () => {
    expect(refused('clock 1Hz duty 100%')).toContain('duty');
    expect(refused('pattern 012 bit 1ms')).toContain('0 と 1');
    expect(refused('pattern 01')).toContain('1 bit の長さ');
    expect(refused('edges 1s=1 0.5s=0')).toContain('後');
    expect(refused('high 1')).toContain('引数は書きません');
    expect(refused('dio5..dio2 counter bits 4 on CLK rising')).toContain('小さい番号から');
    expect(refused('counter on CLK rising sequence 1 2 start 3')).toContain('一緒に書けません');
  });
});

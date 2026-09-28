import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';
import { THEMES } from './render/theme.ts';

/** 段 3a の Math (時間の画面) と、式の ch (52 の docs/99 §3 の 2・3)。 */
const said = (source: string): readonly string[] => {
  const result = renderScope(source);
  return [...result.errors, ...result.notices].map((error) => error.message);
};

/** 読み値の行のうち、名前で始まる行。 */
const row = (source: string, name: string): string =>
  renderScope(source).readingLines.find((line) => line.trimStart().startsWith(name)) ?? '';

const POWER = [
  'title: 瞬時電力',
  'time: 200us/div',
  'trigger: ch1 rising 0V',
  'ch1: sine 1kHz 1V',
  'ch2: ch1',
  'math: {expr: ch1 * ch2, unit: W, range: 200mW/div, position: -2div}',
  'measure: [avg, vmax]',
].join('\n');

describe('renderScope — math:', () => {
  test('sine 1kHz 1V times itself, unit W: the average is 0.500 W', () => {
    expect(said(POWER)).toEqual([]);
    expect(row(POWER, 'MATH')).toMatch(/^MATH\s+500 mW\s+1\.00 W$/);
    expect(row(POWER, 'CH1')).toMatch(/^CH1\s+0 V|^CH1\s+-?\d/);
  });

  test('draws math as a fifth trace in its own colour, with its scale on the status row', () => {
    const { svg } = renderScope(POWER);
    expect(svg).toContain('data-channel="math"');
    expect(svg).toContain(`stroke="${THEMES.light.palette.math}"`);
    expect(svg).toContain('MATH 200mW/div');
    expect(svg.match(/<polyline /g)).toHaveLength(3);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  test('without unit: reads in V, and says the expression is V^2', () => {
    const source = 'time: 200us/div\ntrigger: ch1 rising 0V\nch1: sine 1kHz 1V\nmath: ch1 * ch1\nmeasure: [avg]';
    expect(row(source, 'MATH')).toMatch(/^MATH\s+500 mV$/);
    expect(said(source)).toEqual(['math: の式は V^2 ですが、unit: V で出しています (電力なら unit: W、比なら unit: 1 と書きます)']);
  });

  test('a dimensionless math reads without a unit', () => {
    const source = 'time: 200us/div\ntrigger: ch1 rising 0V\nch1: sine 1kHz 1V\nmath: {expr: ch1 / 1V, unit: 1}\nmeasure: [vmax]';
    expect(said(source)).toEqual([]);
    expect(row(source, 'MATH')).toMatch(/^MATH\s+1\.00$/);
  });

  test('puts MATH in the cursor table with its unit', () => {
    const lines = renderScope(`${POWER}\ncursors: [250us]`).readingLines;
    expect(lines.find((line) => line.startsWith('X1'))).toMatch(/1\.00 W$/);
    expect(lines.find((line) => /^\s+t\s/.test(line))).toMatch(/MATH$/);
  });

  test('tells a math range that leaves the trace small, in its own unit', () => {
    const source = 'time: 200us/div\ntrigger: ch1 rising 0V\nch1: sine 1kHz 1V\nmath: {expr: ch1 * ch1, unit: W, range: 5W/div}';
    expect(said(source)).toEqual(['MATH の振れは 0.2 目盛です (range: 200mW/div なら 5.0 目盛になります)']);
  });
});

describe('renderScope — expressions', () => {
  test('draws an RC charge written as an expression, 1.26 V one tau in', () => {
    // トリガは段の直後 (1 mV) で合わせる — t = 0 がほぼ段の位置に来る。
    const source = 'time: 1ms/div\ntrigger: ch1 rising 1mV\nch1: = 2V * step(t) * (1 - exp(-t/1ms))\ncursors: [0, 1ms]';
    const result = renderScope(source);
    expect(said(source)).toEqual([]);
    const x2 = result.readingLines.find((line) => line.startsWith('X2')) ?? '';
    expect(x2).toMatch(/1\.26 V$/);
  });

  test('says how many points an expression could not compute', () => {
    const messages = said('time: 1ms/div\ntrigger: ch1 rising 1mV\nch1: = 1V * sqrt(t / 1ms)');
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^ch1 の式が \d+ 点で計算できないので \(0 で割る・負の平方根・桁あふれ\)、その点は 0 で描いています$/);
  });

  test('says the time/div it picked when no channel is a wave', () => {
    expect(said('trigger: ch1 rising\nch1: = 1V * step(t)')).toContain('time: が無いので 1ms/div (周期のある波が無いので既定) で描いています');
  });
});

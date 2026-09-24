import { describe, expect, test } from 'vitest';
import { parseDutLine } from './dut.ts';
import { parseNoteLine } from './notes.ts';
import { parseStyle } from './style.ts';
import { parseTraceLine } from './traces.ts';
import { parseLength, parseNumber, parseReactive, parseResistance } from './values.ts';

describe('values', () => {
  test('reads L and C with SI prefixes', () => {
    expect(parseReactive('47p', 'F')).toBeCloseTo(47e-12, 20);
    expect(parseReactive('100n', 'H')).toBeCloseTo(100e-9, 18);
    expect(parseReactive('0.1u', 'F')).toBeCloseTo(0.1e-6, 18);
    expect(parseReactive('2.2µ', 'H')).toBeCloseTo(2.2e-6, 18);
    expect(parseReactive('20f', 'F')).toBeCloseTo(20e-15, 24);
    expect(parseReactive('47pF', 'F')).toBeCloseTo(47e-12, 20);
    expect(parseReactive('47pH', 'F')).toBeNull();
    expect(parseReactive('x', 'F')).toBeNull();
  });

  test('reads R the way the board fences do, and 0 Ω', () => {
    expect(parseResistance('4k7')).toBe(4700);
    expect(parseResistance('100')).toBe(100);
    expect(parseResistance('0')).toBe(0);
    expect(parseResistance('0.0Ω')).toBe(0);
  });

  test('lengths need a unit', () => {
    expect(parseLength('25cm')).toBeCloseTo(0.25, 12);
    expect(parseLength('300mm')).toBeCloseTo(0.3, 12);
    expect(parseLength('1m')).toBe(1);
    expect(parseLength('1')).toBeNull();
    expect(parseNumber('0.66')).toBe(0.66);
    expect(parseNumber('x')).toBeNull();
  });
});

describe('parseDutLine', () => {
  test('lumped parts, with and without the place', () => {
    expect(parseDutLine('series R 100')).toEqual({ ok: true, value: { kind: 'lumped', place: 'series', part: 'R', value: 100, esr: 0, esl: 0, cp: 0 } });
    expect(parseDutLine('shunt C 47p').ok && parseDutLine('shunt C 47p')).toMatchObject({ value: { place: 'shunt', part: 'C' } });
    expect(parseDutLine('L 100n')).toMatchObject({ ok: true, value: { place: 'series', part: 'L' } });
  });

  test('parasitics', () => {
    expect(parseDutLine('series C 10p esr 0.2 esl 1n cp 0.1p')).toMatchObject({ ok: true, value: { esr: 0.2, esl: 1e-9, cp: 0.1e-12 } });
  });

  test('lines and stubs', () => {
    expect(parseDutLine('line 50 1m vf 0.66')).toMatchObject({ ok: true, value: { kind: 'line', z0: 50, length: 1, vf: 0.66, end: null } });
    expect(parseDutLine('shunt line 50 12.5cm open')).toMatchObject({ ok: true, value: { place: 'shunt', end: 'open' } });
  });

  test('ends', () => {
    expect(parseDutLine('open')).toEqual({ ok: true, value: { kind: 'end', end: 'open' } });
    expect(parseDutLine('short')).toEqual({ ok: true, value: { kind: 'end', end: 'short' } });
  });

  test.each([
    ['open 1', '何も書きません'],
    ['series', 'series R 100'],
    ['series Q 1', '知らない素子'],
    ['series R', '値を書きます'],
    ['series C 47', '読めません'],
    ['series R abc', '読めません'],
    ['series C 1p xyz 1', '知らない寄生分'],
    ['series C 1p esr', 'esr の値'],
    ['series C 1p esl x', '読めません'],
    ['line 5000 1m', 'Z0'],
    ['line 50 1', '単位'],
    ['line 50 1m vf 2', 'vf'],
    ['line 50 1m foo', '読めません'],
    ['shunt line 50 1m', 'open か short'],
  ])('refuses %s', (text, said) => {
    const read = parseDutLine(text);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.error.message).toContain(said);
  });
});

describe('parseTraceLine', () => {
  test('reads a parameter and a format', () => {
    expect(parseTraceLine('S21 logmag')).toEqual({ ok: true, value: { param: 'S21', format: 'logmag', vf: null } });
    expect(parseTraceLine('s11 SMITH')).toMatchObject({ ok: true, value: { param: 'S11', format: 'smith' } });
  });

  test('tdr takes a velocity factor', () => {
    expect(parseTraceLine('S11 tdr')).toMatchObject({ ok: true, value: { vf: 0.66 } });
    expect(parseTraceLine('S11 tdr vf 0.8')).toMatchObject({ ok: true, value: { vf: 0.8 } });
  });

  test.each([
    ['S22 logmag', '実機では測りません'],
    ['S31 logmag', 'S11 か S21'],
    ['S11 foo', '知らない形式'],
    ['S21 smith', 'S11 で'],
    ['S11 logmag vf 1', 'tdr の vf'],
    ['S11 tdr vf 2', '0.1〜1'],
  ])('refuses %s', (text, said) => {
    const read = parseTraceLine(text);
    expect(!read.ok && read.error.message).toContain(said);
  });
});

describe('parseNoteLine', () => {
  test('mark and text with units', () => {
    expect(parseNoteLine('mark 100M -6dB', null)).toEqual({ ok: true, value: { kind: 'mark', f: 100e6, value: -6, unit: 'dB' } });
    expect(parseNoteLine('text 1G 45deg', 'ここ')).toMatchObject({ ok: true, value: { kind: 'text', unit: 'deg', text: 'ここ' } });
    expect(parseNoteLine('mark 1G 1.2ns', null)).toMatchObject({ ok: true, value: { unit: 'ns' } });
    expect(parseNoteLine('mark 1G 50Ω', null)).toMatchObject({ ok: true, value: { unit: 'ohm' } });
    expect(parseNoteLine('mark 1G 2', null)).toMatchObject({ ok: true, value: { unit: 'none' } });
  });

  test('band and source', () => {
    expect(parseNoteLine('band 88M 108M', 'FM')).toEqual({ ok: true, value: { kind: 'band', from: 88e6, to: 108e6, text: 'FM' } });
    expect(parseNoteLine('band 88M 108M', null)).toMatchObject({ ok: true, value: { text: null } });
    expect(parseNoteLine('source', null)).toEqual({ ok: true, value: { kind: 'source' } });
  });

  test.each([
    [['source x', null], '何も書きません'],
    [['band 88M', null], 'band は'],
    [['band 108M 88M', null], '始めより上'],
    [['arrow 1M 2M', null], '注釈は'],
    [['mark x -6dB', null], '周波数が読めません'],
    [['mark 1M -6dBm', null], '値が読めません'],
    [['mark 1M -6dB', '字'], 'mark には字'],
    [['text 1M -6dB', null], 'コロンの後ろ'],
  ] as const)('refuses %j', ([head, body], said) => {
    const read = parseNoteLine(head, body);
    expect(!read.ok && read.error.message).toContain(said);
  });
});

describe('parseStyle', () => {
  test('takes a theme name alone, or a map', () => {
    expect(parseStyle('dark', 1).style.theme).toBe('dark');
    expect(parseStyle({ width: 500, stamp: 'on', debug: false }, 1).style).toMatchObject({ width: 500, stamp: true, debug: false });
  });

  test('says what it cannot read', () => {
    expect(parseStyle('neon', 1).errors[0]?.message).toContain('知らないテーマ');
    expect(parseStyle({ grid: true }, 1).errors[0]?.message).toContain('知らない style');
    expect(parseStyle({ width: 10 }, 1).errors[0]?.message).toContain('120〜4000');
    expect(parseStyle([1], 1).errors[0]?.message).toContain('style:');
  });
});

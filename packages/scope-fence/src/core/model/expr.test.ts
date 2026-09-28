import { describe, expect, test } from 'vitest';
import { dimText, parseExpr } from './expr.ts';
import type { ParsedExpr } from './expr.ts';
import { evaluateExpr } from './exprEval.ts';

/** 読めた式。読めなければ試験を落とす。 */
const read = (text: string, allowed: readonly ('ch1' | 'ch2' | 'ch3' | 'ch4')[] = []): ParsedExpr => {
  const result = parseExpr(text, allowed);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/** 断った理由。読めてしまえば試験を落とす。 */
const refusal = (text: string, allowed: readonly ('ch1' | 'ch2' | 'ch3' | 'ch4')[] = []): { message: string; token?: string } => {
  const result = parseExpr(text, allowed);
  if (result.ok) throw new Error(`読めてしまった: ${text}`);
  return result.error;
};

/** 時刻 t の 1 点で値を出す。 */
const at = (text: string, t = 0): number => {
  const { values } = evaluateExpr(read(text).expr, { start: t, dt: 1, length: 1, channels: new Map() });
  return values[0] ?? Number.NaN;
};

describe('parseExpr — values', () => {
  test('the RC charging curve is 1.264 V one tau after the step', () => {
    expect(at('2V * (1 - exp(-t/1ms))', 1e-3)).toBeCloseTo(1.2642, 4);
    expect(dimText(read('2V * (1 - exp(-t/1ms))').dim)).toBe('V');
  });

  test('^ binds tighter than unary minus, which binds tighter than * and /', () => {
    expect(at('-2^2')).toBe(-4);
    expect(at('2^3^2')).toBe(512);
    expect(at('1 + 2 * 3')).toBe(7);
    expect(at('(1 + 2) * 3')).toBe(9);
    expect(at('8 / 2 / 2')).toBe(2);
    expect(at('2 * -3')).toBe(-6);
    expect(at('2^-1')).toBe(0.5);
    expect(at('+3 - 1')).toBe(2);
  });

  test('reads units with SI prefixes and pi', () => {
    expect(at('500mV')).toBeCloseTo(0.5, 12);
    expect(at('1kHz * 1ms')).toBeCloseTo(1, 12);
    expect(at('20us / 1ms')).toBeCloseTo(0.02, 12);
    expect(at('.5V / 1V')).toBe(0.5);
    expect(at('pi')).toBe(Math.PI);
  });

  test('evaluates every function', () => {
    expect(at('sin(pi / 2)')).toBeCloseTo(1, 12);
    expect(at('cos(0)')).toBe(1);
    expect(at('exp(0)')).toBe(1);
    expect(at('abs(-3V)')).toBe(3);
    expect(at('sqrt(4 * 1V^2)')).toBe(2);
    expect(dimText(read('sqrt(4 * 1V^2)').dim)).toBe('V');
    expect(at('4V^2')).toBe(16);
    expect(at('min(1V, 2V)')).toBe(1);
    expect(at('max(1V, 2V, 3V)')).toBe(3);
    expect(at('clip(5V, 0V, 3V)')).toBe(3);
    expect(at('clip(-5V, 0V, 3V)')).toBe(0);
    expect(at('step(t - 1ms)', 0)).toBe(0);
    expect(at('step(t)', 0)).toBe(1);
  });

  test('a sine written with its frequency', () => {
    expect(at('1V * sin(2 * pi * 1kHz * t)', 0.25e-3)).toBeCloseTo(1, 12);
  });

  test('reads the channels it may reference, sample by sample', () => {
    const parsed = read('ch1 * ch2 / 10', ['ch1', 'ch2']);
    expect(parsed.refs).toEqual(['ch1', 'ch2']);
    expect(dimText(parsed.dim)).toBe('V^2');
    const channels = new Map([['ch1', Float64Array.from([1, 2])], ['ch2', Float64Array.from([3, -4])]] as const);
    const { values } = evaluateExpr(parsed.expr, { start: 0, dt: 1, length: 2, channels });
    expect([...values]).toEqual([0.3, -0.8]);
  });

  test('names the dimension of the result', () => {
    expect(dimText(read('1').dim)).toBe('無次元');
    expect(dimText(read('1ms').dim)).toBe('s');
    expect(dimText(read('1kHz').dim)).toBe('1/s');
    expect(dimText(read('1V / 1ms').dim)).toBe('V/s');
    expect(dimText(read('1 / (1V * 1ms)').dim)).toBe('1/(V·s)');
  });

  test('values it cannot compute become 0 and are counted, never NaN', () => {
    const { values, invalid } = evaluateExpr(read('sqrt(t)').expr, { start: -1e-3, dt: 1e-3, length: 3, channels: new Map() });
    expect(invalid).toBe(1);
    expect([...values].every(Number.isFinite)).toBe(true);
    expect(values[0]).toBe(0);
    expect(evaluateExpr(read('1V / t').expr, { start: 0, dt: 1, length: 1, channels: new Map() }).invalid).toBe(1);
    expect(evaluateExpr(read('1V * exp(1000)').expr, { start: 0, dt: 1, length: 1, channels: new Map() }).invalid).toBe(1);
  });

  test('a channel that is missing from the input reads as 0', () => {
    const { values } = evaluateExpr(read('ch1', ['ch1']).expr, { start: 0, dt: 1, length: 2, channels: new Map() });
    expect([...values]).toEqual([0, 0]);
  });
});

describe('parseExpr — refusals', () => {
  test('a function written without parentheses (sin 1kHz)', () => {
    expect(refusal('sin 1kHz').message).toMatch(/sin\(…\)/);
  });

  test('a frequency or a time written as a bare number', () => {
    const said = refusal('1V * sin(2 * pi * 1000 * t)');
    expect(said.message).toMatch(/sin の中は無次元/);
    expect(said.message).toMatch(/s/);
    expect(refusal('1V * exp(-t / 0.001)').message).toMatch(/exp の中は無次元/);
  });

  test('an unknown function lists the functions', () => {
    const said = refusal('sine(t)');
    expect(said.message).toMatch(/知らない関数です: sine/);
    expect(said.message).toMatch(/sin \/ cos \/ exp \/ abs \/ sqrt \/ min \/ max \/ clip \/ step/);
    expect(said.token).toBe('sine');
  });

  test('an unknown name lists the names', () => {
    expect(refusal('x * 2').message).toMatch(/知らない名前です: x \(書けるのは t \/ pi \/ ch1〜ch4/);
    expect(refusal('1 V').message).toMatch(/数と単位の間は空けません/);
  });

  test('a unit it does not know, or a bare prefix', () => {
    expect(refusal('2pi').message).toMatch(/2 \* pi/);
    expect(refusal('1k').message).toMatch(/単位が読めません: 1k/);
    expect(refusal('1e3').message).toMatch(/単位が読めません/);
    expect(refusal('1Vpp').message).toMatch(/peak/);
  });

  test('adding a volt to a second', () => {
    expect(refusal('1V + 1ms').message).toMatch(/\+ の両側は同じ単位にします \(V と s\)/);
    expect(refusal('max(ch1, 0)', ['ch1']).message).toMatch(/0V/);
  });

  test('a power of a quantity with a varying exponent', () => {
    expect(refusal('1V ^ (t / 1ms)').message).toMatch(/指数/);
    expect(refusal('2 ^ 1V').message).toMatch(/指数は無次元/);
  });

  test('a channel it may not reference', () => {
    expect(refusal('ch2 * 2', ['ch1']).message).toMatch(/ch2 は参照できません \(参照できるのは ch1\)/);
    expect(refusal('ch1', []).message).toMatch(/参照できる ch がありません/);
    expect(refusal('ch5').message).toMatch(/知らない名前/);
  });

  test('too long, or nested too deep', () => {
    expect(refusal(`1V${' + 1V'.repeat(60)}`).message).toMatch(/200 字まで/);
    expect(refusal(`${'('.repeat(17)}1V${')'.repeat(17)}`).message).toMatch(/16 段まで/);
    expect(refusal(`${'-'.repeat(17)}1V`).message).toMatch(/16 段まで/);
  });

  test('broken syntax says where', () => {
    expect(refusal('').message).toMatch(/式が空です/);
    expect(refusal('1V 2V').message).toMatch(/式の終わりに余計な物があります/);
    expect(refusal('(1V + 2V').message).toMatch(/\) が足りません/);
    expect(refusal('1V +').message).toMatch(/式が途中で終わっています/);
    expect(refusal('sin()').message).toMatch(/sin は 1 つの値を取ります/);
    expect(refusal('clip(1V, 2V)').message).toMatch(/clip は 3 つの値を取ります/);
    expect(refusal('min(1V)').message).toMatch(/min は 2 つ以上の値を取ります/);
    expect(refusal('1V | rc 1ms').message).toMatch(/式に書けない字です/);
    expect(refusal('* 2').message).toMatch(/値が要ります/);
  });
});

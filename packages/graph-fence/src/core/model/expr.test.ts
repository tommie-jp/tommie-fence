import { describe, expect, test } from 'vitest';
import { evaluate, parseExpr } from './expr.ts';

const at = (text: string, x: number): number => {
  const read = parseExpr(text);
  if (!read.ok) throw new Error(read.reason);
  return evaluate(read.expr, x);
};

const reason = (text: string): string => {
  const read = parseExpr(text);
  return read.ok ? '' : read.reason;
};

describe('parseExpr と evaluate — 教科書の式', () => {
  test('RC ローパスの利得と位相 (02 の 5-1)', () => {
    const gain = '20*log10(1/sqrt(1+(x/1.59k)^2))';
    expect(at(gain, 1590)).toBeCloseTo(-3.0103, 3);
    expect(at(gain, 15900)).toBeCloseTo(-20.043, 2);
    expect(at(gain, 100)).toBeCloseTo(-0.0171, 3);
    expect(at('-deg(atan(x/1.59k))', 1590)).toBeCloseTo(-45, 6);
    expect(at('-deg(atan(x/1.59k))', 15900)).toBeCloseTo(-84.289, 2);
    expect(at('-atan(x/1.59k)*180/pi', 1590)).toBeCloseTo(-45, 6);
  });

  test('ダイオードの I-V (電験 6-1)', () => {
    expect(at('4.4n * (exp(x / (1.9 * 25.9m)) - 1) * 1000', 0.6)).toBeCloseTo(0.868, 3);
  });

  test('リアクタンス (電験 3-9)', () => {
    expect(at('2*pi*x*10m', 15900)).toBeCloseTo(999.0, 0);
    expect(at('1/(2*pi*x*10n)', 15900)).toBeCloseTo(1000.97, 1);
  });
});

describe('parseExpr — 文法', () => {
  test('reads prefixes as factors and tells m from M', () => {
    expect(at('10M', 0)).toBe(1e7);
    expect(at('10m', 0)).toBeCloseTo(0.01);
    expect(at('1e3 + 2', 0)).toBe(1002);
  });

  test('makes ^ right-associative and binds unary minus looser than ^', () => {
    expect(at('x^2^3', 2)).toBe(256);
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('2^-1', 0)).toBe(0.5);
    expect(at('+x', 4)).toBe(4);
  });

  test('knows the listed functions with their arity', () => {
    expect(at('min(x, 3) + max(x, 3)', 1)).toBe(4);
    expect(at('atan2(1, 1)', 0)).toBeCloseTo(Math.PI / 4);
    expect(at('pow(2, 10)', 0)).toBe(1024);
    expect(at('abs(-2) + floor(1.7) + ceil(1.2) + ln(1) + log2(8) + exp(0)', 0)).toBe(9);
    expect(at('sin(0) + cos(0) + tan(0) + rad(180)', 0)).toBeCloseTo(1 + Math.PI);
  });

  test('gives NaN outside the domain so the caller can drop the point', () => {
    expect(at('log10(x)', -1)).toBeNaN();
  });

  test('refuses what it cannot read, saying how to fix it', () => {
    expect(reason('foo(x)')).toContain('知らない名前です: foo');
    expect(reason('foo(x)')).toContain('sqrt');
    expect(reason('2x')).toContain('* は省けません');
    expect(reason('x +')).toContain('途中で終わっています');
    expect(reason('(x')).toContain('括弧が閉じていません');
    expect(reason('sqrt x')).toContain('括弧で引数');
    expect(reason('sqrt(x')).toContain('閉じていません');
    expect(reason('min(x)')).toContain('引数は 2 つ');
    expect(reason('x $ 2')).toContain('使えない字');
    expect(reason('*x')).toContain('ここに * は書けません');
    expect(reason('')).toContain('空');
  });

  test('refuses too long or too deep expressions', () => {
    expect(reason('x+'.repeat(101) + 'x')).toContain('長すぎます');
    expect(reason(`${'('.repeat(40)}x${')'.repeat(40)}`)).toContain('深すぎます');
  });

  test('does not reach properties of the function table', () => {
    expect(reason('constructor(x)')).toContain('知らない名前です');
    expect(reason('toString(x)')).toContain('知らない名前です');
  });
});

import { LIMITS } from '../limits.ts';
import type { TraceName } from './channel.ts';
import type { Expr } from './expr.ts';

/**
 * 式を点の列の上で計算する。**木を 1 度だけ関数に畳み**、点ごとに呼ぶ (点ごとに木を
 * 辿り直さない。配列を節ごとに確保すると、助走込みで 100 万点 × 節の数になる)。
 * 計算できない点 (0 で割る・負の平方根・桁あふれ) は **0 にして数を返す**、±1 MV を越える点は
 * **±1 MV で切って数を返す** — 呼ぶ側がお知らせで言う。SVG にも読み値にも NaN / Infinity も
 * 桁外れの値も流さない (CLAUDE.md の約束 4・5。波の電圧の上限と同じ)。
 */

type Point = (index: number, t: number) => number;

export type ExprInput = {
  /** 最初の点の時刻 (s) と間隔。 */
  readonly start: number;
  readonly dt: number;
  readonly length: number;
  /** 参照する ch の点の列 (同じ時刻の格子)。無い ch は 0。 */
  readonly channels: ReadonlyMap<TraceName, Float64Array>;
  /** この番号より前の点 (助走) は数えない (画面に出ない点のことは言わない)。 */
  readonly countFrom?: number;
};

export type Evaluated = {
  readonly values: Float64Array;
  /** 計算できずに 0 にした点の数 (`countFrom` から)。 */
  readonly invalid: number;
  /** ±1 MV で切った点の数 (`countFrom` から)。 */
  readonly clipped: number;
};

const UNARY: Readonly<Record<'sin' | 'cos' | 'exp' | 'abs' | 'sqrt' | 'step', (x: number) => number>> = {
  sin: Math.sin, cos: Math.cos, exp: Math.exp, abs: Math.abs, sqrt: Math.sqrt, step: (x) => (x >= 0 ? 1 : 0),
};

function binary(op: Extract<Expr, { kind: 'bin' }>['op'], left: Point, right: Point): Point {
  switch (op) {
    case '+':
      return (i, t) => left(i, t) + right(i, t);
    case '-':
      return (i, t) => left(i, t) - right(i, t);
    case '*':
      return (i, t) => left(i, t) * right(i, t);
    case '/':
      return (i, t) => left(i, t) / right(i, t);
    case '^':
      return (i, t) => left(i, t) ** right(i, t);
  }
}

/** 引数を左から畳む (点ごとに配列を作らない)。 */
function fold(args: readonly Point[], f: (a: number, b: number) => number): Point {
  return (i, t) => {
    let value = (args[0] ?? (() => 0))(i, t);
    for (let index = 1; index < args.length; index += 1) value = f(value, (args[index] ?? (() => 0))(i, t));
    return value;
  };
}

function call(expr: Extract<Expr, { kind: 'call' }>, channels: ExprInput['channels']): Point {
  const args = expr.args.map((arg) => compile(arg, channels));
  const [x = () => 0, lo = () => 0, hi = () => 0] = args;
  switch (expr.fn) {
    case 'min':
      return fold(args, Math.min);
    case 'max':
      return fold(args, Math.max);
    case 'clip':
      return (i, t) => Math.min(hi(i, t), Math.max(lo(i, t), x(i, t)));
    default: {
      const f = UNARY[expr.fn];
      return (i, t) => f(x(i, t));
    }
  }
}

function compile(expr: Expr, channels: ExprInput['channels']): Point {
  switch (expr.kind) {
    case 'num': {
      const { value } = expr;
      return () => value;
    }
    case 't':
      return (_, t) => t;
    case 'ch': {
      const samples = channels.get(expr.name);
      return samples === undefined ? () => 0 : (i) => samples[i] ?? 0;
    }
    case 'neg': {
      const arg = compile(expr.arg, channels);
      return (i, t) => -arg(i, t);
    }
    case 'bin':
      return binary(expr.op, compile(expr.left, channels), compile(expr.right, channels));
    case 'call':
      return call(expr, channels);
  }
}

/** 式を `length` 点計算する。**新しい配列を返す**。 */
export function evaluateExpr(expr: Expr, input: ExprInput): Evaluated {
  const point = compile(expr, input.channels);
  const values = new Float64Array(input.length);
  const from = input.countFrom ?? 0;
  const max = LIMITS.voltsMax;
  let invalid = 0;
  let clipped = 0;
  for (let index = 0; index < input.length; index += 1) {
    const value = point(index, input.start + index * input.dt);
    const counted = index >= from ? 1 : 0;
    if (!Number.isFinite(value)) {
      invalid += counted;
    } else if (Math.abs(value) > max) {
      values[index] = Math.sign(value) * max;
      clipped += counted;
    } else {
      values[index] = value;
    }
  }
  return { values, invalid, clipped };
}

import { LIMITS } from '../limits.ts';
import { PREFIXES } from './quantity.ts';

/**
 * 線の式 (`20*log10(1/sqrt(1+(x/1.59k)^2))`)。**再帰下降の小さな式で、`eval` は使わない**
 * — 式は他人の書いたノートから来る入力で、それを計算する部品だから (52 の docs/96 §8)。
 * 字数と入れ子の深さに上限を置く。
 *
 * - 数は無次元。接頭辞は倍率 (`1.59k` `25.9m` `10M`。大文字小文字を区別する)
 * - `x` は横軸の値 (軸の単位の数)、`pi`
 * - `+ - * /`、`^` (右結合。`-x^2` は −(x²))、括弧
 * - 関数は {@link FUNCTIONS}。**掛け算は省けない** (`2x` は断る。黙って別の意味に読まない)
 */

export type Expr =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'x' }
  | { readonly kind: 'neg'; readonly arg: Expr }
  | { readonly kind: 'binary'; readonly op: '+' | '-' | '*' | '/' | '^'; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'call'; readonly name: string; readonly args: readonly Expr[] };

type Fn = { readonly arity: number; readonly apply: (args: readonly number[]) => number };

const one = (fn: (value: number) => number): Fn => ({ arity: 1, apply: (args) => fn(args[0] ?? Number.NaN) });
const two = (fn: (a: number, b: number) => number): Fn => ({ arity: 2, apply: (args) => fn(args[0] ?? Number.NaN, args[1] ?? Number.NaN) });

/** 書ける関数。**並びがそのままエラー文の一覧になる**。 */
export const FUNCTIONS: Readonly<Record<string, Fn>> = {
  sqrt: one(Math.sqrt),
  exp: one(Math.exp),
  ln: one(Math.log),
  log10: one(Math.log10),
  log2: one(Math.log2),
  sin: one(Math.sin),
  cos: one(Math.cos),
  tan: one(Math.tan),
  atan: one(Math.atan),
  atan2: two(Math.atan2),
  abs: one(Math.abs),
  min: two(Math.min),
  max: two(Math.max),
  pow: two(Math.pow),
  floor: one(Math.floor),
  ceil: one(Math.ceil),
  deg: one((radians) => (radians * 180) / Math.PI),
  rad: one((degrees) => (degrees * Math.PI) / 180),
};

const FUNCTION_LIST = Object.keys(FUNCTIONS).join(' / ');

type Token =
  | { readonly kind: 'number'; readonly value: number; readonly at: number }
  | { readonly kind: 'name'; readonly name: string; readonly at: number }
  | { readonly kind: 'op'; readonly op: string; readonly at: number }
  | { readonly kind: 'end'; readonly at: number };

export type ExprRead = { readonly ok: true; readonly expr: Expr } | { readonly ok: false; readonly reason: string; readonly token?: string };

class ExprError extends Error {
  constructor(message: string, readonly token?: string) {
    super(message);
  }
}

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const PREFIX = /^[pnuµμmkMGT](?![A-Za-z0-9_µμ])/u;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const space = /^\s+/.exec(rest);
    if (space !== null) {
      at += space[0].length;
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number !== null) {
      let value = Number(number[0]);
      at += number[0].length;
      const prefix = PREFIX.exec(text.slice(at));
      if (prefix !== null) {
        value *= PREFIXES[prefix[0]] ?? 1;
        at += prefix[0].length;
      }
      tokens.push({ kind: 'number', value, at });
      continue;
    }
    const name = NAME.exec(rest);
    if (name !== null) {
      tokens.push({ kind: 'name', name: name[0], at });
      at += name[0].length;
      continue;
    }
    const op = rest[0] ?? '';
    if ('+-*/^(),'.includes(op)) {
      tokens.push({ kind: 'op', op, at });
      at += 1;
      continue;
    }
    throw new ExprError(`使えない字です: ${op} (+ - * / ^ と括弧、数、x、関数だけ)`, op);
  }
  tokens.push({ kind: 'end', at });
  return tokens;
}

/** 式を読む。読めなければ理由 (直し方つき)。 */
export function parseExpr(text: string): ExprRead {
  if ([...text].length > LIMITS.exprLength) return { ok: false, reason: `長すぎます (${LIMITS.exprLength} 字まで)` };
  if (text.trim() === '') return { ok: false, reason: '空です' };
  try {
    const tokens = tokenize(text);
    let index = 0;
    let depth = 0;
    const peek = (): Token => tokens[index] ?? { kind: 'end', at: text.length };
    const next = (): Token => {
      const token = peek();
      index += 1;
      return token;
    };
    const isOp = (token: Token, op: string): boolean => token.kind === 'op' && token.op === op;
    const deeper = <T>(read: () => T): T => {
      depth += 1;
      if (depth > LIMITS.exprDepth) throw new ExprError(`入れ子が深すぎます (${LIMITS.exprDepth} 段まで)`);
      try {
        return read();
      } finally {
        depth -= 1;
      }
    };

    const sum = (): Expr => {
      let left = product();
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        const op = (next() as { op: '+' | '-' }).op;
        left = { kind: 'binary', op, left, right: product() };
      }
      return left;
    };
    const product = (): Expr => {
      let left = unary();
      while (isOp(peek(), '*') || isOp(peek(), '/')) {
        const op = (next() as { op: '*' | '/' }).op;
        left = { kind: 'binary', op, left, right: unary() };
      }
      return left;
    };
    const unary = (): Expr => deeper(() => {
      if (isOp(peek(), '-')) {
        next();
        return { kind: 'neg', arg: unary() };
      }
      if (isOp(peek(), '+')) {
        next();
        return unary();
      }
      return power();
    });
    const power = (): Expr => {
      const base = primary();
      if (!isOp(peek(), '^')) return base;
      next();
      return { kind: 'binary', op: '^', left: base, right: unary() };
    };
    const primary = (): Expr => deeper(() => {
      const token = next();
      if (token.kind === 'number') return { kind: 'number', value: token.value };
      if (token.kind === 'op' && token.op === '(') {
        const inner = sum();
        if (!isOp(next(), ')')) throw new ExprError('括弧が閉じていません');
        return inner;
      }
      if (token.kind === 'name') {
        if (token.name === 'x') return { kind: 'x' };
        if (token.name === 'pi') return { kind: 'number', value: Math.PI };
        const fn = FUNCTIONS[token.name];
        if (fn === undefined || !Object.hasOwn(FUNCTIONS, token.name)) {
          throw new ExprError(`知らない名前です: ${token.name} (使えるのは x・pi と、関数 ${FUNCTION_LIST})`, token.name);
        }
        if (!isOp(next(), '(')) throw new ExprError(`${token.name} の後ろには括弧で引数を書きます (${token.name}(x))`, token.name);
        const args: Expr[] = [sum()];
        while (isOp(peek(), ',')) {
          next();
          args.push(sum());
        }
        if (!isOp(next(), ')')) throw new ExprError(`${token.name}( の括弧が閉じていません`, token.name);
        if (args.length !== fn.arity) throw new ExprError(`${token.name} の引数は ${fn.arity} つです`, token.name);
        return { kind: 'call', name: token.name, args };
      }
      if (token.kind === 'end') throw new ExprError('途中で終わっています');
      throw new ExprError(`ここに ${token.op} は書けません`, token.op);
    });

    const expr = sum();
    const rest = peek();
    if (rest.kind !== 'end') {
      const shown = rest.kind === 'number' ? String(rest.value) : rest.kind === 'name' ? rest.name : rest.op;
      throw new ExprError(`続きが読めません: ${shown} (掛け算の * は省けません。2*x のように書きます)`, shown);
    }
    return { ok: true, expr };
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, reason: error.message, ...(error.token === undefined ? {} : { token: error.token }) };
    throw error;
  }
}

/** x での値。**定義域の外 (log10 の負など) は NaN** を返し、描く側が抜く。 */
export function evaluate(expr: Expr, x: number): number {
  switch (expr.kind) {
    case 'number': return expr.value;
    case 'x': return x;
    case 'neg': return -evaluate(expr.arg, x);
    case 'call': return (FUNCTIONS[expr.name]?.apply(expr.args.map((arg) => evaluate(arg, x)))) ?? Number.NaN;
    case 'binary': {
      const left = evaluate(expr.left, x);
      const right = evaluate(expr.right, x);
      switch (expr.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        default: return left ** right;
      }
    }
    default: return Number.NaN;
  }
}

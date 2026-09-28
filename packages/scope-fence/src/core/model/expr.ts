import { parsePrefixedHertz, parseSeconds, parseVolts } from 'fence-kit';
import { safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import { fail, ok } from '../parser/result.ts';
import type { LineResult } from '../parser/result.ts';
import { CHANNEL_NAMES } from './channel.ts';
import type { ChannelName } from './channel.ts';

/**
 * 式 — `ch2: = 2V * (1 - exp(-t/1ms))` と `math: ch1 * ch2 / 10` の 1 つの小さな言語
 * (52 の docs/99 決め 1)。**再帰下降**で読み、`eval` は使わない。優先順位は
 * `^` > 単項の `-` > `* /` > `+ -` (`-2^2` は −4、`2^3^2` は 512)。
 *
 * **次元 (V と s の指数) を数える** — 単位の無い数は無次元の倍率としてだけ読み、
 * `sin(2*pi*1000*t)` (周波数を素の数で書いた) は「sin の中は無次元」と断る。
 * 素の数を黙って Hz や V と読まない (直下の CLAUDE.md の文法の方針 1)。
 * 結果の次元は呼ぶ側が見る (ch は V でなければ断る。Math は書き手の `unit:` と比べて言う)。
 */

/** V と s の指数。Hz は s^−1。 */
export type Dim = { readonly v: number; readonly s: number };

export const FUNCTION_NAMES = ['sin', 'cos', 'exp', 'abs', 'sqrt', 'min', 'max', 'clip', 'step'] as const;
export type FunctionName = (typeof FUNCTION_NAMES)[number];

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 't' }
  | { readonly kind: 'ch'; readonly name: ChannelName }
  | { readonly kind: 'neg'; readonly arg: Expr }
  | { readonly kind: 'bin'; readonly op: BinaryOp; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'call'; readonly fn: FunctionName; readonly args: readonly Expr[] };

export type ParsedExpr = {
  readonly expr: Expr;
  /** 結果の次元。 */
  readonly dim: Dim;
  /** 参照した ch (書いた順、重なりなし)。 */
  readonly refs: readonly ChannelName[];
};

const NONE: Dim = { v: 0, s: 0 };
const VOLT: Dim = { v: 1, s: 0 };
const SECOND: Dim = { v: 0, s: 1 };
const HERTZ: Dim = { v: 0, s: -1 };

const EPSILON = 1e-9;
export const sameDim = (a: Dim, b: Dim): boolean => Math.abs(a.v - b.v) < EPSILON && Math.abs(a.s - b.s) < EPSILON;
export const isDimensionless = (dim: Dim): boolean => sameDim(dim, NONE);
export const isVolts = (dim: Dim): boolean => sameDim(dim, VOLT);

/**
 * 木の節の数。**計算の重さの見積もりに使う** — 1 点ぶんの計算は木を 1 回辿るので、
 * 節の数がそのまま 1 点あたりのコストになる (`min(ch1,ch1,…)` は引数の数だけ節が増える)。
 * 深さは `exprDepth` で絞っているので、この再帰も同じだけ浅い。
 */
export function exprNodes(expr: Expr): number {
  switch (expr.kind) {
    case 'num':
    case 't':
    case 'ch':
      return 1;
    case 'neg':
      return 1 + exprNodes(expr.arg);
    case 'bin':
      return 1 + exprNodes(expr.left) + exprNodes(expr.right);
    case 'call':
      return 1 + expr.args.reduce((sum, arg) => sum + exprNodes(arg), 0);
  }
}

/** 次元を読める字に (`V` `V^2` `1/s` `V/s` `無次元`)。 */
export function dimText(dim: Dim): string {
  const part = (unit: string, power: number): string => (Math.abs(power - 1) < EPSILON ? unit : `${unit}^${Number(power.toFixed(3))}`);
  const units = [['V', dim.v], ['s', dim.s]] as const;
  const top = units.filter(([, power]) => power > EPSILON).map(([unit, power]) => part(unit, power));
  const bottom = units.filter(([, power]) => power < -EPSILON).map(([unit, power]) => part(unit, -power));
  if (top.length === 0 && bottom.length === 0) return '無次元';
  const over = bottom.length === 0 ? '' : `/${bottom.length > 1 ? `(${bottom.join('·')})` : bottom[0]}`;
  return `${top.length === 0 ? '1' : top.join('·')}${over}`;
}

// ---- 字句 ----

type Token =
  | { readonly kind: 'number'; readonly text: string }
  | { readonly kind: 'name'; readonly text: string }
  | { readonly kind: 'symbol'; readonly text: string }
  | { readonly kind: 'end'; readonly text: '' };

const NUMBER_TOKEN = /^(?:\d+(?:\.\d+)?|\.\d+)[A-Za-zµμ]*/;
const NAME_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*/;
const SYMBOLS = '+-*/^(),';
const CHARACTER_HINT = '式に書けない字です (書けるのは 数と単位・t・pi・ch1〜ch4・関数・+ - * / ^ ( ) ,)';

function tokensOf(text: string): LineResult<readonly Token[]> {
  const tokens: Token[] = [];
  let rest = text;
  while (rest !== '') {
    const space = /^\s+/.exec(rest);
    if (space !== null) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const number = NUMBER_TOKEN.exec(rest);
    const name = number === null ? NAME_TOKEN.exec(rest) : null;
    const found = number ?? name;
    if (found !== null) {
      tokens.push({ kind: number === null ? 'name' : 'number', text: found[0] });
      rest = rest.slice(found[0].length);
      continue;
    }
    const character = [...rest][0] ?? '';
    if (!SYMBOLS.includes(character)) return fail(CHARACTER_HINT, character);
    tokens.push({ kind: 'symbol', text: character });
    rest = rest.slice(character.length);
  }
  return ok([...tokens, { kind: 'end', text: '' }]);
}

// ---- 数と単位 ----

type Quantity = { readonly value: number; readonly dim: Dim };

const UNIT_HINT = '1V / 500mV / 1ms / 20us / 1kHz、無次元は素の数';

/** `1V` `500mV` `1ms` `1kHz` `2`。**Hz は `Hz` まで書く** (`1k` を Hz と読まない)。 */
function quantityOf(text: string): LineResult<Quantity> {
  const unit = /[A-Za-zµμ]*$/.exec(text)?.[0] ?? '';
  if (unit === '') return ok({ value: Number(text), dim: NONE });
  if (unit.endsWith('Hz')) {
    const hertz = parsePrefixedHertz(text);
    if (hertz !== null) return ok({ value: hertz, dim: HERTZ });
  }
  const seconds = parseSeconds(text);
  if (seconds !== null) return ok({ value: seconds, dim: SECOND });
  const volts = parseVolts(text);
  if (volts !== null) {
    return volts.kind === 'peak'
      ? ok({ value: volts.volts, dim: VOLT })
      : fail('式の中の電圧は 1V / 500mV のように書きます (Vpp / Vrms / dBm は波の振幅にだけ書けます。peak の値にします)', text);
  }
  if (/^[A-Za-z_]/.test(unit) && (unit === 'pi' || unit === 't' || /^ch\d$/.test(unit))) {
    return fail(`単位が読めません: ${safeToken(text)} (掛けるときは 2 * pi のように * を書きます)`, text);
  }
  return fail(`単位が読めません: ${safeToken(text)} (${UNIT_HINT})`, text);
}

// ---- 構文 ----

/** 読んだ途中の節。`constant` は t と ch を含まないときの値 (`^` の指数に使う)。 */
type Node = { readonly expr: Expr; readonly dim: Dim; readonly constant: number | null };

/** 単位だけの語 (`1 V` と空けて書いたとき)。 */
const UNIT_WORD = /^(?:[nuµμmk]?V|[nuµμm]?s|[kMG]?Hz)$/;

const NAME_HINT = `t / pi / ch1〜ch4 / ${FUNCTION_NAMES.join(' / ')}`;
const ARITY: Readonly<Record<FunctionName, number>> = {
  sin: 1, cos: 1, exp: 1, abs: 1, sqrt: 1, step: 1, clip: 3, min: -2, max: -2,
};

type Parser = {
  readonly tokens: readonly Token[];
  index: number;
  depth: number;
  readonly allowed: readonly ChannelName[];
  readonly refs: ChannelName[];
};

const peek = (parser: Parser): Token => parser.tokens[parser.index] ?? { kind: 'end', text: '' };
const take = (parser: Parser): Token => {
  const token = peek(parser);
  parser.index += 1;
  return token;
};
const isSymbol = (token: Token, text: string): boolean => token.kind === 'symbol' && token.text === text;

/** 入れ子を 1 段下りる。深さの上限を越えたら断る。 */
function descend<T>(parser: Parser, inner: () => LineResult<T>): LineResult<T> {
  parser.depth += 1;
  if (parser.depth > LIMITS.exprDepth) return fail(`式の入れ子が深すぎます (${LIMITS.exprDepth} 段まで)`);
  const result = inner();
  parser.depth -= 1;
  return result;
}

const fold = (a: number | null, b: number | null, f: (x: number, y: number) => number): number | null =>
  (a === null || b === null ? null : f(a, b));

/** 足し算と引き算 (同じ次元どうし)。 */
function sumOf(parser: Parser): LineResult<Node> {
  let read = productOf(parser);
  while (read.ok && (isSymbol(peek(parser), '+') || isSymbol(peek(parser), '-'))) {
    const op = take(parser).text as '+' | '-';
    const right = productOf(parser);
    if (!right.ok) return right;
    const left = read.value;
    if (!sameDim(left.dim, right.value.dim)) {
      return fail(`${op} の両側は同じ単位にします (${dimText(left.dim)} と ${dimText(right.value.dim)})`, op);
    }
    read = ok({
      expr: { kind: 'bin', op, left: left.expr, right: right.value.expr },
      dim: left.dim,
      constant: fold(left.constant, right.value.constant, (x, y) => (op === '+' ? x + y : x - y)),
    });
  }
  return read;
}

/** 掛け算と割り算 (次元は足し引き)。 */
function productOf(parser: Parser): LineResult<Node> {
  let read = unaryOf(parser);
  while (read.ok && (isSymbol(peek(parser), '*') || isSymbol(peek(parser), '/'))) {
    const op = take(parser).text as '*' | '/';
    const right = unaryOf(parser);
    if (!right.ok) return right;
    const left = read.value;
    const sign = op === '*' ? 1 : -1;
    read = ok({
      expr: { kind: 'bin', op, left: left.expr, right: right.value.expr },
      dim: { v: left.dim.v + sign * right.value.dim.v, s: left.dim.s + sign * right.value.dim.s },
      constant: fold(left.constant, right.value.constant, (x, y) => (op === '*' ? x * y : x / y)),
    });
  }
  return read;
}

/** 単項の符号。 */
function unaryOf(parser: Parser): LineResult<Node> {
  const token = peek(parser);
  if (!isSymbol(token, '-') && !isSymbol(token, '+')) return powerOf(parser);
  take(parser);
  return descend(parser, () => {
    const inner = unaryOf(parser);
    if (!inner.ok || token.text === '+') return inner;
    const { expr, dim, constant } = inner.value;
    return ok({ expr: { kind: 'neg', arg: expr }, dim, constant: constant === null ? null : -constant });
  });
}

/** 累乗 (右結合)。量の累乗は指数が定数のときだけ (`1V^2`)。 */
function powerOf(parser: Parser): LineResult<Node> {
  const base = atomOf(parser);
  if (!base.ok || !isSymbol(peek(parser), '^')) return base;
  take(parser);
  return descend(parser, () => {
    const exponent = unaryOf(parser);
    if (!exponent.ok) return exponent;
    const { dim, constant } = exponent.value;
    if (!isDimensionless(dim)) return fail(`^ の指数は無次元にします (いまは ${dimText(dim)})`, '^');
    const quantity = !isDimensionless(base.value.dim);
    if (quantity && constant === null) return fail('単位のある量の ^ は指数を定数にします (1V^2 のように。t や ch は書けません)', '^');
    const power = constant ?? 0;
    return ok({
      expr: { kind: 'bin', op: '^', left: base.value.expr, right: exponent.value.expr },
      dim: quantity ? { v: base.value.dim.v * power, s: base.value.dim.s * power } : base.value.dim,
      constant: fold(base.value.constant, constant, (x, y) => x ** y),
    });
  });
}

function atomOf(parser: Parser): LineResult<Node> {
  const token = take(parser);
  switch (token.kind) {
    case 'end':
      return fail('式が途中で終わっています (値か ( が要ります)');
    case 'number': {
      const read = quantityOf(token.text);
      return read.ok ? ok({ expr: { kind: 'num', value: read.value.value }, dim: read.value.dim, constant: read.value.value }) : read;
    }
    case 'name':
      return nameOf(parser, token.text);
    case 'symbol':
      if (token.text !== '(') return fail(`${token.text} の前に値が要ります`, token.text);
      return descend(parser, () => {
        const inner = sumOf(parser);
        if (!inner.ok) return inner;
        return isSymbol(take(parser), ')') ? inner : fail(') が足りません', '(');
      });
  }
}

/** 名前 1 つ — t・pi・ch・関数。 */
function nameOf(parser: Parser, name: string): LineResult<Node> {
  const called = isSymbol(peek(parser), '(');
  if ((FUNCTION_NAMES as readonly string[]).includes(name)) {
    return called ? callOf(parser, name as FunctionName) : fail(`${name} は ${name}(…) のように括弧で書きます`, name);
  }
  if (called) return fail(`知らない関数です: ${safeToken(name)} (書けるのは ${FUNCTION_NAMES.join(' / ')})`, name);
  if (name === 't') return ok({ expr: { kind: 't' }, dim: SECOND, constant: null });
  if (name === 'pi') return ok({ expr: { kind: 'num', value: Math.PI }, dim: NONE, constant: Math.PI });
  if ((CHANNEL_NAMES as readonly string[]).includes(name)) return channelOf(parser, name as ChannelName);
  return fail(`知らない名前です: ${safeToken(name)} (書けるのは ${NAME_HINT})`, name);
}

function channelOf(parser: Parser, name: ChannelName): LineResult<Node> {
  if (!parser.allowed.includes(name)) {
    const which = parser.allowed.length === 0 ? '参照できる ch がありません' : `参照できるのは ${parser.allowed.join(' / ')}`;
    return fail(`${name} は参照できません (${which})`, name);
  }
  if (!parser.refs.includes(name)) parser.refs.push(name);
  return ok({ expr: { kind: 'ch', name }, dim: VOLT, constant: null });
}

/** 関数の呼び出し。引数の数と次元を見る。 */
function callOf(parser: Parser, fn: FunctionName): LineResult<Node> {
  take(parser);
  return descend(parser, () => {
    const args: Node[] = [];
    if (!isSymbol(peek(parser), ')')) {
      for (;;) {
        const arg = sumOf(parser);
        if (!arg.ok) return arg;
        args.push(arg.value);
        if (!isSymbol(peek(parser), ',')) break;
        take(parser);
      }
    }
    if (!isSymbol(take(parser), ')')) return fail(`${fn}( の ) が足りません`, fn);
    return typedCall(fn, args);
  });
}

function typedCall(fn: FunctionName, args: readonly Node[]): LineResult<Node> {
  const arity = ARITY[fn];
  if (arity > 0 && args.length !== arity) return fail(`${fn} は ${arity} つの値を取ります`, fn);
  if (arity < 0 && args.length < -arity) return fail(`${fn} は 2 つ以上の値を取ります`, fn);
  const first = args[0] as Node;
  const call = { kind: 'call', fn, args: args.map((arg) => arg.expr) } as const;
  switch (fn) {
    case 'sin':
    case 'cos':
    case 'exp':
      if (!isDimensionless(first.dim)) {
        return fail(`${fn} の中は無次元にします (いまは ${dimText(first.dim)}。周波数は 1kHz、時間は 1ms のように単位を付けます)`, fn);
      }
      return ok({ expr: call, dim: NONE, constant: null });
    case 'abs':
      return ok({ expr: call, dim: first.dim, constant: null });
    case 'sqrt':
      return ok({ expr: call, dim: { v: first.dim.v / 2, s: first.dim.s / 2 }, constant: null });
    case 'step':
      return ok({ expr: call, dim: NONE, constant: null });
    default: {
      const other = args.find((arg) => !sameDim(arg.dim, first.dim));
      if (other !== undefined) {
        return fail(`${fn} の中は同じ単位にします (${dimText(first.dim)} と ${dimText(other.dim)}。0 も 0V のように書きます)`, fn);
      }
      return ok({ expr: call, dim: first.dim, constant: null });
    }
  }
}

/**
 * 式を読む。`allowed` は参照してよい ch (ch の行なら自分より前の読めた ch、Math なら読めた ch 全部)。
 * 読めなければ理由と、行の中で指す綴り。
 */
export function parseExpr(text: string, allowed: readonly ChannelName[]): LineResult<ParsedExpr> {
  const trimmed = text.trim();
  if (trimmed === '') return fail('式が空です (例: 2V * (1 - exp(-t/1ms)))');
  if ([...trimmed].length > LIMITS.exprLength) return fail(`式は ${LIMITS.exprLength} 字までです`);
  const tokens = tokensOf(trimmed);
  if (!tokens.ok) return tokens;
  const parser: Parser = { tokens: tokens.value, index: 0, depth: 0, allowed, refs: [] };
  const read = sumOf(parser);
  if (!read.ok) return read;
  const rest = peek(parser);
  if (rest.kind === 'name' && UNIT_WORD.test(rest.text)) return fail(`数と単位の間は空けません (1V / 1ms / 1kHz のように続けて書きます)`, rest.text);
  if (rest.kind !== 'end') return fail(`式の終わりに余計な物があります: ${safeToken(rest.text)} (値と値の間には + - * / を書きます)`, rest.text);
  return ok({ expr: read.value.expr, dim: read.value.dim, refs: [...parser.refs] });
}

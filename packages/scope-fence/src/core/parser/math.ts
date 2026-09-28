import { isMap } from 'yaml';
import type { Node, Pair } from 'yaml';
import { WAVE_SHAPES } from 'fence-kit';
import { fenceError, notice, safeToken } from '../errors.ts';
import { LIMITS } from '../limits.ts';
import type { ChannelName } from '../model/channel.ts';
import { dimText, parseExpr, sameDim } from '../model/expr.ts';
import { MATH_UNITS, UNIT_DIMS, formatQuantityPerDiv, parseQuantityPerDiv } from '../model/quantity.ts';
import type { QuantityUnit } from '../model/quantity.ts';
import type { FenceError, MathSpec } from '../types.ts';
import { parsePosition } from './lines.ts';
import { commaHint, scalarText, splitByComma, writtenText } from './yamlText.ts';

/**
 * `math:` の読み。**必ず式** (`math: ch1 * ch2 / 10`)、並びなら
 * `{expr: …, unit: W, range: 200mW/div, position: -2div}` (52 の docs/99 決め 2)。
 * 参照できるのは読めた ch 全部 (Math は ch を全部出した後に計算する)。
 */
export const MATH_KEYS = ['expr', 'unit', 'range', 'position'] as const;

type LineOf = (node: Node | Pair | null | undefined) => number | null;

export type MathContext = {
  readonly source: string;
  readonly lineOf: LineOf;
  /** 読めた ch。 */
  readonly read: readonly ChannelName[];
  /** 書いてあった ch (読めなかったものも)。 */
  readonly written: ReadonlySet<string>;
};

type Written = {
  readonly text: string | null;
  readonly unit: string | null;
  readonly range: { readonly text: string; readonly line: number | null } | null;
  readonly position: { readonly text: string; readonly line: number | null } | null;
  readonly unitLine: number | null;
};

const EXAMPLE = '例: math: ch1 * ch2 / 10';

/** 並びの項目を集める (読むのは後で。unit: を先に知ってから range: を読む)。 */
function collect(pair: Pair, context: MathContext, errors: FenceError[]): Written | null {
  if (!isMap(pair.value)) {
    return { text: scalarText(pair.value), unit: null, range: null, position: null, unitLine: null };
  }
  const expr = pair.value.items.find((item) => scalarText(item.key) === 'expr');
  if (expr !== undefined && splitByComma(scalarText(expr.value))) {
    errors.push(fenceError(commaHint('expr'), context.lineOf((expr.value ?? expr.key) as Node)));
    return null;
  }
  let written: Written = { text: null, unit: null, range: null, position: null, unitLine: null };
  let broken = false;
  for (const item of pair.value.items) {
    const key = scalarText(item.key) ?? '';
    const line = context.lineOf((item.value ?? item.key) as Node);
    const value = writtenText(item.value, context.source) ?? scalarText(item.value) ?? '';
    if (key === 'expr') written = { ...written, text: scalarText(item.value) };
    else if (key === 'unit') written = { ...written, unit: value, unitLine: line };
    else if (key === 'range') written = { ...written, range: { text: value, line } };
    else if (key === 'position') written = { ...written, position: { text: value, line } };
    else {
      errors.push(fenceError(`知らない項目です: ${safeToken(key)} (書けるのは ${MATH_KEYS.join(' / ')})`, line, key || undefined));
      broken = true;
    }
  }
  if (written.text === null) {
    errors.push(fenceError('math: を並びで書くときは expr: が要ります (例: {expr: ch1 * ch2 / 10, unit: W})', context.lineOf(pair.value as Node)));
    return null;
  }
  return broken ? null : written;
}

const RANGE_HINTS: Readonly<Record<QuantityUnit, string>> = {
  V: 'range: は 500mV/div / 2V/div のように /div を付けます',
  W: 'range: は 200mW/div のように W の /div で書きます',
  1: 'range: は 0.5/div のように /div を付けます (unit: 1 は無次元)',
};

/** unit: range: position: を読む。読めなければ null (言うことは errors へ)。 */
function scaleOf(written: Written, errors: FenceError[]): { readonly unit: QuantityUnit; readonly range: number | null; readonly position: number | null } | null {
  const unit = written.unit === null ? 'V' : (MATH_UNITS as readonly string[]).includes(written.unit) ? written.unit as QuantityUnit : null;
  if (unit === null) {
    errors.push(fenceError(`unit: は ${MATH_UNITS.join(' / ')} のどれかです (1 は無次元)`, written.unitLine, written.unit ?? undefined));
    return null;
  }
  let range: number | null = null;
  if (written.range !== null) {
    range = parseQuantityPerDiv(written.range.text, unit);
    const { min, max } = LIMITS.voltsPerDiv;
    if (range === null || range < min || range > max) {
      const bounds = range === null ? '' : ` (${formatQuantityPerDiv(min, unit)}〜${formatQuantityPerDiv(max, unit)})`;
      errors.push(fenceError(`${RANGE_HINTS[unit]}${bounds}`, written.range.line, written.range.text || undefined));
      return null;
    }
  }
  const position = written.position === null ? null : parsePosition(written.position.text);
  if (written.position !== null && position === null) {
    const zero = unit === 'V' ? '0 V' : unit === 'W' ? '0 W' : '0';
    errors.push(fenceError(`position: は ${zero} の基準の位置を -2div のように書きます (中央が 0、上が正)`, written.position.line, written.position.text || undefined));
    return null;
  }
  return { unit, range, position };
}

/** 式の字の前の見立て (波や = を書いた、読めなかった ch を参照した)。 */
function screenText(text: string, context: MathContext, at: number | null): FenceError | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('=')) return fenceError(`math: は = を付けずに式を書きます (${EXAMPLE})`, at, '=');
  const first = trimmed.split(/\s+/)[0] ?? '';
  if ((WAVE_SHAPES as readonly string[]).includes(first)) {
    return fenceError(`math: は式で書きます (波は ch の行に書きます。${EXAMPLE})`, at, first);
  }
  const broken = [...trimmed.matchAll(/\bch[1-4]\b/g)].map((found) => found[0])
    .find((name) => context.written.has(name) && !context.read.includes(name as ChannelName));
  return broken === undefined ? null : fenceError(`${broken} が読めないので math: も描けません`, at, broken);
}

export function readMath(pair: Pair, context: MathContext): { readonly math: MathSpec | null; readonly errors: readonly FenceError[] } {
  const errors: FenceError[] = [];
  const at = context.lineOf((pair.value ?? pair.key) as Node);
  const written = collect(pair, context, errors);
  if (written === null) return { math: null, errors };
  if (written.text === null || written.text.trim() === '') {
    return { math: null, errors: [fenceError(`math: には式を 1 行で書きます (${EXAMPLE})`, at)] };
  }
  const screened = screenText(written.text, context, at);
  if (screened !== null) return { math: null, errors: [screened] };
  const scale = scaleOf(written, errors);
  const read = parseExpr(written.text, context.read);
  if (!read.ok) errors.push({ ...read.error, line: at });
  if (!read.ok || scale === null) return { math: null, errors };
  // 単位は推定しない。式の次元と合わなければ、どの単位で出したかを言う。
  if (!sameDim(read.value.dim, UNIT_DIMS[scale.unit])) {
    errors.push(notice(`math: の式は ${dimText(read.value.dim)} ですが、unit: ${scale.unit} で出しています (電力なら unit: W、比なら unit: 1 と書きます)`, at));
  }
  return { math: { expr: read.value.expr, ...scale, line: at }, errors };
}

import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { splitPartType } from '../parts/variants.ts';
import type { HoleRef, PartSpec, Result, WireHint, WireSpec } from '../types.ts';

// `b12(A)` `f11(+)` — ピン名には極性の記号も使う。
const TAGGED_HOLE = /^([+\-\w]+)\(([+\-\w]+)\)$/;

/** `b12(A)` のような極性タグ付きの穴。タグが無ければ 1 から始まる番号をピン名にする。 */
export function parseHoleToken(token: string, index: number): HoleRef {
  const tagged = TAGGED_HOLE.exec(token);
  if (tagged) return { addr: tagged[1] ?? token, tag: tagged[2] ?? String(index + 1) };
  return { addr: token, tag: String(index + 1) };
}

/**
 * 1 行で書く部品の記法を読む。
 *   R1: resistor a5 a10 10k
 *   D1: led b12(A) b13(K) red
 *   U1: dip8 @ e5 NJM4556A
 *
 * ボード外の機器 (device) はピン名を並べる必要があるので、1 行では書けない。
 * parseFence 側でマップ形式として読む。
 */
export function parseCompactPart(id: string, spec: string, line: number): Result<PartSpec> {
  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  const [typeToken, ...rest] = tokens;
  if (!typeToken) return fail(`部品 ${safeToken(id)} の内容が空です`, line);

  const { type, variant } = splitPartType(typeToken);
  const base: PartSpec = { id, type, variant, holes: [], value: null, label: null, at: null, pins: null, line };

  if (rest[0] === '@') {
    const target = rest[1];
    if (!target) return fail(`部品 ${safeToken(id)}: @ の後ろに穴番地か top / bottom が要ります`, line);
    const joined = rest.slice(2).join(' ');
    const label = joined ? clampText(joined, LIMITS.labelLength) : null;
    if (target === 'top' || target === 'bottom') return ok({ ...base, at: target, label });
    return ok({ ...base, holes: [{ addr: target, tag: '1' }], label });
  }

  const holes: HoleRef[] = [];
  const words: string[] = [];
  for (const token of rest) {
    if (TAGGED_HOLE.test(token) || parseAddress(token)) holes.push(parseHoleToken(token, holes.length));
    else words.push(token);
  }

  const value = words.join(' ');

  return ok({ ...base, holes, value: value ? clampText(value, LIMITS.labelLength) : null });
}

const HINT_GROUP = /\[([^\]]*)\]\s*$/;
const HINT = /^([vh])([+-]?\d+)$/;
// 迂回の距離は盤の外まで伸ばしても意味がない。桁あふれで NaN を作らせないための上限でもある。
const MAX_HINT_DELTA = 2000;

/** `a10 -- b12 red [v-20, h30]` の 1 行を読む。角括弧の中は迂回ヒント。 */
export function parseWireSpec(text: string, line: number): Result<WireSpec> {
  const group = HINT_GROUP.exec(text.trim());
  const hints: WireHint[] = [];
  for (const token of (group?.[1] ?? '').split(/[,\s]+/).filter(Boolean)) {
    const hint = HINT.exec(token);
    if (!hint) return fail(`迂回ヒントは v20 や h-30 の形で書きます: ${safeToken(token)}`, line);
    const delta = Number(hint[2]);
    if (!Number.isFinite(delta) || Math.abs(delta) > MAX_HINT_DELTA) {
      return fail(`迂回の距離は ±${MAX_HINT_DELTA} までです (20 が穴 1 つぶん)`, line);
    }
    hints.push({ axis: hint[1] as 'v' | 'h', delta });
  }

  const head = group ? text.trim().slice(0, group.index) : text;
  const tokens = head.trim().split(/\s+/).filter(Boolean);
  const [from, separator, to, ...rest] = tokens;

  if (separator !== '--' || !from || !to || tokens.filter((token) => token === '--').length !== 1) {
    return fail('配線は「端点 -- 端点 [色]」の形で書きます', line);
  }
  if (rest.length > 1) return fail('配線の行に余分な語があります (色は 1 語だけ書けます)', line);

  return ok({ from, to, color: rest[0] ?? null, hints, line });
}

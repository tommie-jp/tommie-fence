import { fail, ok, safeToken } from '../errors.ts';
import { LIMITS, clampText } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { splitPartType } from '../parts/variants.ts';
import type { HoleRef, PartSpec, Result, WireHint, WireSpec } from '../types.ts';

// `b12(A)` `f11(+)` — ピン名には極性の記号も使う。
const TAGGED_HOLE = /^([+\-\w]+)\(([+\-\w]+)\)$/;

/**
 * `l=OLED` — 図に出るラベルだけを差し替える (マップ形式の `label:` と同じ意味)。
 * **空白は含められない**ので、語をまたぐラベルはマップ形式で書く。
 * 1 行の記法は空白で語を割っており、ここだけ別の割り方をすると読み方が 2 つになる。
 */
const LABEL_TAG = /^l=(.+)$/;

/**
 * その語を穴として読むか。番地の形か、`points:` で名前を付けた点なら穴。
 * それ以外は値の語として集める (この規則があるので、部品の値に `J5` のような
 * 番地の形をした語は使えない)。
 */
const isHoleToken = (token: string, isPoint: (token: string) => boolean): boolean =>
  parseAddress(token) !== null || isPoint(token);

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
export function parseCompactPart(
  id: string,
  spec: string,
  line: number,
  // `points:` で名前を付けた穴。番地の形をしていない語でも穴として読む。
  isPoint: (token: string) => boolean = () => false,
): Result<PartSpec> {
  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  const [typeToken, ...rest] = tokens;
  if (!typeToken) return fail(`部品 ${safeToken(id)} の内容が空です`, line);

  const { type, variant, problem } = splitPartType(typeToken);
  if (problem) return fail(`部品 ${safeToken(id)}: ${problem}`, line);
  const base: PartSpec = { id, type, variant, holes: [], value: null, label: null, at: null, pins: null, line };

  if (rest[0] === '@') {
    const target = rest[1];
    if (!target) return fail(`部品 ${safeToken(id)}: @ の後ろに穴番地か top / bottom が要ります`, line);
    const joined = rest.slice(2).join(' ');
    // `@` の後ろの残りはそのままラベルだが、`l=` と書いても同じ意味に読む
    // (1 行の記法の中で、ラベルの書き方が 2 通りに見えないようにする)。
    const written = LABEL_TAG.exec(joined)?.[1] ?? joined;
    const label = written ? clampText(written, LIMITS.labelLength) : null;
    if (target === 'top' || target === 'bottom') return ok({ ...base, at: target, label });
    return ok({ ...base, holes: [{ addr: target, tag: '1' }], label });
  }

  const holes: HoleRef[] = [];
  const words: string[] = [];
  let label: string | null = null;
  // 番地の形ではなく、点の名前だから穴として読んだ最後の語。
  let byName: string | null = null;

  for (const token of rest) {
    const tagged = LABEL_TAG.exec(token);
    if (tagged) {
      if (label !== null) return fail(`部品 ${safeToken(id)}: l= が 2 回書かれています`, line);
      label = clampText(tagged[1] ?? '', LIMITS.labelLength);
      continue;
    }
    const named = TAGGED_HOLE.exec(token);
    const addr = named?.[1] ?? token;
    if (isHoleToken(addr, isPoint)) {
      byName = parseAddress(addr) === null ? token : null;
      holes.push(parseHoleToken(token, holes.length));
    } else {
      byName = null;
      words.push(token);
    }
  }

  const value = words.join(' ');

  return ok({
    ...base,
    holes,
    label,
    value: value ? clampText(value, LIMITS.labelLength) : null,
    // 値のつもりで書いた語が点の名前と同じだと、**黙って別の回路の図が出る**。
    // `points: {2N3904: c1}` があると `Q1: transistor a5 a6 2N3904` の 3 本目が
    // c1 に生えて、それ自体は正しく見える別の回路になる。
    // 番地の形は書き手が避けられる閉じた語彙だが、点の名前は任意の語なので、
    // 値に使いたくなる語ほどぶつかりやすい。
    eatenValue: value === '' ? byName : null,
  });
}

const HINT_GROUP = /\[([^\]]*)\]\s*$/;
const HINT = /^([vh])([+-]?\d+)$/;
// 迂回の距離は盤の外まで伸ばしても意味がない。桁あふれで NaN を作らせないための上限でもある。
const MAX_HINT_DELTA = 2000;

/**
 * `a10 -- b12 red [v-20, h30]` の 1 行を読む。角括弧の中は迂回ヒント。
 *
 * 端点は 3 つ以上つなげて書ける (`+t5 -- a5 -- a10 red`)。1 行が 1 本の信号の道として
 * 読めるようにするためで、**隣り合う端点ごとの区間にパーサの中で開く**。
 * 中間のモデルから先は今までどおり 2 点の配線しか見ないので、
 * ネットリストも経路探索も触らずに済む。行番号は書かれた 1 行のまま。
 */
export function parseWireSpec(text: string, line: number): Result<readonly WireSpec[]> {
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

  // `端点 -- 端点 [-- 端点 …]` は端点 n 個と `--` が n-1 個で、必ず奇数長になる。
  const chain: string[] = [];
  let index = 0;
  for (; index < tokens.length; index += 1) {
    const token = tokens[index] ?? '';
    if (index % 2 === 0) {
      if (token === '--') break;
      chain.push(token);
    } else if (token !== '--') break;
  }
  const rest = tokens.slice(index);

  if (chain.length < 2 || index % 2 === 0) {
    return fail('配線は「端点 -- 端点 [-- 端点 …] [色]」の形で書きます', line);
  }
  if (rest.length > 1) return fail('配線の行に余分な語があります (色は 1 語だけ書けます)', line);

  const color = rest[0] ?? null;
  // 迂回ヒントは 1 区間ぶんの道順なので、どの区間のことか決まらない書き方は受け取らない。
  if (hints.length > 0 && chain.length > 2) {
    return fail('迂回ヒントを書く配線は、端点を 2 つだけにします (どの区間の道順か決まらないため)', line);
  }

  const wires = chain.slice(0, -1).map((from, at) => ({
    from,
    to: chain[at + 1] ?? '',
    color,
    hints,
    line,
  } satisfies WireSpec));

  return ok(wires);
}

import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { footprintOf } from '../parts/footprint.ts';
import { MIRROR_WORD, NO_TURN, isTurned, orientOf, rotationOf } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';
import { isKnownType, isNestedType, placeableNames, splitPartType } from '../parts/types.ts';
import type { FenceError, PartSpec } from '../types.ts';

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

/**
 * 1 行から読み取れるところまで。**行番号は持たない** — それを知っているのは
 * YAML の節点を見ている呼ぶ側なので、あちらが足す。
 */
export type WrittenPart = Omit<PartSpec, 'line'>;

/** どんな板にも載りうる番地か。載らない桁のものは型番とみなす。 */
function plausibleHole(token: string): boolean {
  const address = parseAddress(token);
  return address !== null && address.col <= LIMITS.cols && address.row <= LIMITS.rows;
}

/**
 * `resistor b3 b7 10k` のような 1 行を読む。行番号は呼ぶ側が持っているので、
 * ここでは付けない (`fenceError` の行は null で返す)。
 *
 * **書かれた綴りを落とさない** (`written`)。略記を畳んだ綴りは行のどこにも
 * 無いので、それで報告の位置を探すと印が消えるか、別の語を指す。
 */
export function parsePartLine(id: string, line: string): Parsed<WrittenPart> {
  if (!isReferenceable(id)) {
    return fail(`部品の名前に使えません: ${safeToken(id)} (英数字と _ - で ${LIMITS.idLength} 字まで)`, id);
  }

  const tokens = line.trim().split(/\s+/).filter((token) => token !== '');
  const [written, ...rest] = tokens;
  if (written === undefined) return fail(`${safeToken(id)} に部品の種類が書かれていません`);

  const { type, variant, problem } = splitPartType(written);
  if (problem !== null) return fail(problem, written);

  // 姿で足の数が変わる (端面実装の `sma` は 3 本)。
  const footprint = footprintOf(type, variant);
  if (footprint === null) {
    // **知らないふりをしない。** 名前は知っているが置けないものと、
    // 書き方が違うだけのものと、綴りを疑うべきものとでは、次にやることが違う。
    if (isNestedType(type)) {
      // 書き方が違うだけなので、**そのまま書き写せる形**を見せる。
      return fail(`${safeToken(written)} は入れ子で書きます (type: device / at: top / pins: + -)`, written);
    }
    if (isKnownType(type)) return fail(`${safeToken(written)} はまだ置けません`, written);
    return fail(
      `知らない部品の種類です: ${safeToken(written)}`
      + ` (${placeableNames().slice(0, 6).join(' / ')} / dipN / sipN など)`,
      written,
    );
  }

  // **番地に見える語だけを穴として取る。** 省いてよい足のある形 (端面実装) では、
  // 3 つ目が値のこともある。
  const wanted = footprint.minHoles ?? footprint.holes;
  const holes = rest.slice(0, footprint.holes)
    .filter((token, index) => index < wanted || plausibleHole(token));
  if (holes.length < wanted) {
    // **書く穴の数は形が決める。** DIP と SIP はアンカー 1 つだけ
    // (足の位置はパッケージが決めていて、書く人が選べない)。
    // 端面実装は中心導体と凹の先端 — 先端は片方だけでよい (もう片方は反対側に決まる)。
    if (footprint.kind === 'edge') {
      return fail(
        `${safeToken(written)} は中心導体と凹の先端の穴を書きます (例: ${written} e1 f0。先端は片方だけでよい)`,
        written,
      );
    }
    const example = footprint.holes === 1 ? `${type} b3` : `${type} ${['b3', 'b5', 'b7'].slice(0, footprint.holes).join(' ')}`;
    return fail(
      `${safeToken(written)} は穴を ${footprint.holes} つ書きます (例: ${example})`,
      written,
    );
  }
  for (const hole of holes) {
    if (parseAddress(hole) === null) {
      return fail(`穴の番地として読めません: ${safeToken(hole)} (行の名前 + 列の番号、例: b3)`, hole);
    }
  }

  // 残りは向きの語と値。**向きは決まった語なので見分けられる。**
  const after = rest.slice(holes.length);
  let turn: Turn = NO_TURN;
  const tail: string[] = [];
  for (const token of after) {
    const rotate = rotationOf(token);
    if (rotate !== null) {
      // **同じ種類を 2 回書いたら断る。** 後勝ちで黙ると、どちらのつもりか
      // 決められないまま図が出る。
      if (turn.rotate !== 0) return fail(`${safeToken(written)} に回転が 2 つ書かれています`, token);
      turn = { ...turn, rotate };
      continue;
    }
    if (token === MIRROR_WORD) {
      if (turn.mirror) return fail(`${safeToken(written)} に ${MIRROR_WORD} が 2 回書かれています`, token);
      turn = { ...turn, mirror: true };
      continue;
    }
    tail.push(token);
  }

  // **書けない形に向きを書いたら断る。** 足を並べて書く部品の向きは穴の順
  // そのものなので、語と食い違うと、どちらが本当か決められなくなる。
  if (isTurned(turn) && orientOf(type) === 'none') {
    return fail(
      `${safeToken(written)} に向きは書けません (足を並べて書く部品の向きは穴の順そのものです)`,
      written,
    );
  }
  // **番地に見えるものを黙って値にしない。** 足を 1 本多く書いたつもりの人が、
  // 「値 b9」の図を見て気づけないまま終わる。
  //
  // ただし**どんな板にも載らない番地は足の書き間違いではない**。型番は番地と
  // そっくりの綴りをしていて (`NE555` は ne 行 555 列、`C1815` は c 行 1815 列)、
  // 番地として弾くと正しい図が毎回叱られる。上限を超える列は型番のほう。
  const stray = tail.find((token) => plausibleHole(token));
  if (stray !== undefined) {
    return fail(
      `${safeToken(written)} が書く穴は ${footprint.holes} つです。余分な番地: ${safeToken(stray)}`,
      stray,
    );
  }
  const value = tail.join(' ');
  return {
    ok: true,
    value: { id, type, variant, written, holes, value: value === '' ? null : value, turn },
  };
}

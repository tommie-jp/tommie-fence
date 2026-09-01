import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, isReferenceable } from '../limits.ts';
import { parseAddress } from '../model/address.ts';
import { isKnownType, isTwoLead, splitPartType, twoLeadNames } from '../parts/types.ts';
import type { FenceError, PartSpec } from '../types.ts';

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FenceError };

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

/** 2 本足の部品が要る穴の数。3 本足を入れるときはここが種類ごとになる。 */
const TWO_LEAD_HOLES = 2;

/**
 * 1 行から読み取れるところまで。**行番号は持たない** — それを知っているのは
 * YAML の節点を見ている呼ぶ側なので、あちらが足す。
 */
export type WrittenPart = Omit<PartSpec, 'line'>;

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

  if (!isTwoLead(type)) {
    // **知らないふりをしない。** 名前は知っているが置けないものと、
    // 綴りを疑うべきものとでは、次にやることが違う。
    const message = isKnownType(type)
      ? `${safeToken(written)} はまだ置けません (いま置けるのは 2 本足の部品だけです)`
      : `知らない部品の種類です: ${safeToken(written)} (${twoLeadNames().slice(0, 6).join(' / ')} など)`;
    return fail(message, written);
  }

  const holes = rest.slice(0, TWO_LEAD_HOLES);
  if (holes.length < TWO_LEAD_HOLES) {
    return fail(`${safeToken(written)} は足が 2 本なので、穴を 2 つ書きます (例: ${type} b3 b7)`, written);
  }
  for (const hole of holes) {
    if (parseAddress(hole) === null) {
      return fail(`穴の番地として読めません: ${safeToken(hole)} (行の名前 + 列の番号、例: b3)`, hole);
    }
  }

  // 残りは丸ごと値。`100n 50V` のように空白を含む書き方をそのまま通す。
  const tail = rest.slice(TWO_LEAD_HOLES);
  // **番地に見えるものを黙って値にしない。** 3 本目の足を書いたつもりの人が、
  // 「値 b9」の図を見て気づけないまま終わる。
  const stray = tail.find((token) => parseAddress(token) !== null);
  if (stray !== undefined) {
    return fail(
      `${safeToken(written)} は足が 2 本なので、3 つ目の穴は書けません: ${safeToken(stray)}`,
      stray,
    );
  }
  const value = tail.join(' ');
  return {
    ok: true,
    value: { id, type, variant, written, holes, value: value === '' ? null : value },
  };
}

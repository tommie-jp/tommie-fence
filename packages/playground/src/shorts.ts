/**
 * 短縮リンクの表 (s.tommie.jp)。**QR に入れる URL を短くする**ために引く
 * (52 の docs/42)。
 *
 * 共有リンクはフェンスを丸ごと base64 で載せるので長い (中央 400 字、
 * 例で最長 7,534 字)。**2,500 字を超えると QR そのものが作れない**ので、
 * 一番大きい例は QR に入らなかった。
 *
 * **こちらは表を引くだけで、短縮を作らない。** 作るには転送ページを
 * 置く必要があり、この頁はサーバを持たない (52 の docs/39)。表に無い図 —
 * 手で直したフェンスなど — は長いままになる。
 *
 * 表の鍵は**行き先の URL そのもの**。道 (`fence/bread/01-led`) は
 * 向こうが名前を付けるもので、こちらでは組み立てられない。
 */

/** 行き先の URL → 短縮リンク。 */
export type Shorts = ReadonlyMap<string, string>;

/** 表の置き場。**別の出所の静的ファイル** (GitHub Pages が配る)。 */
export const SHORTS_URL = 'https://s.tommie.jp/links.json';

/**
 * JSON を表にする。**外から来たものなので形を確かめる** (約束 6)。
 * 値が https の URL でない行は落とす — QR は人が読み取って開くものなので、
 * 知らない綴りをそのまま入れない。
 */
export function parseShorts(data: unknown): Shorts {
  const table = new Map<string, string>();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return table;

  for (const [to, short] of Object.entries(data as Record<string, unknown>)) {
    if (typeof short !== 'string' || !short.startsWith('https://')) continue;
    table.set(to, short);
  }
  return table;
}

/**
 * `?dev` などの問い合わせを外した URL。**同じ図なら同じ鍵にする**ため
 * (問い合わせは頁の都合で、図の中身ではない)。読めない URL はそのまま返す。
 */
function withoutSearch(url: string): string {
  try {
    const one = new URL(url);
    one.search = '';
    return one.href;
  } catch {
    return url;
  }
}

/**
 * その URL の短縮リンク。**短くならないものは返さない** — 短縮のほうが
 * 長ければ入れ替える意味がない (元がもともと短い頁など)。
 */
export function shortFor(url: string, table: Shorts): string | null {
  const key = withoutSearch(url);
  const short = table.get(key);
  if (short === undefined || short.length >= key.length) return null;
  return short;
}

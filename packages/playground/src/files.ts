/**
 * 外にあるファイルを開いて、書き戻すための決め事 (52 の docs/43)。
 *
 * fence-editor は「外にある `.md` を開く → 中のフェンスを直す → `.md` に
 * 書き戻す」道具で、頁はその手順のデモをする。**開く口と書き戻す口は
 * 動く所によって違う**が、決め方はここに集める (DOM は知らない)。
 */

/** 名前が分からないときの呼び名。 */
export const UNTITLED = 'fence.md';

/**
 * その字は CRLF で書かれているか。
 *
 * **テキスト欄は値を LF に均す**ので、開いた時点で見分けて覚えておかないと、
 * Windows で書いた `.md` を開いて保存しただけで**全行が変更扱い**になる
 * (git の差分が真っ赤になる)。
 */
export const isCrlf = (text: string): boolean => text.includes('\r\n');

/** 書き戻す形に直す。開いたときが CRLF なら CRLF で返す。 */
export const withNewlines = (text: string, crlf: boolean): string =>
  (crlf ? text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n') : text.replaceAll('\r\n', '\n'));

/** 開いた字を欄に入れる形 (欄が均すのと同じ形に、こちらでも均しておく)。 */
export const asTyped = (text: string): string => text.replaceAll('\r\n', '\n');

/**
 * URL からファイル名を採る。`.md` で終わらないものは既定の名前にする —
 * **書き戻すときの名前**になるので、拡張子の無い名前は付けない。
 */
export function nameOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? '';
  const last = decodeURIComponent(path.split('/').pop() ?? '');
  return last.toLowerCase().endsWith('.md') ? last : UNTITLED;
}

/**
 * `?doc=` の行き先。**http(s) だけ受ける** — 外から来た字なので、
 * `javascript:` や `file:` を開きに行かせない。読めなければ null。
 *
 * `base` は相対の道を解く基準 (頁の URL)。**ここから外を見に行かない** —
 * 決め事は DOM も `location` も知らない所に置く (約束 5)。
 *
 * 相手が CORS を許していなければ取れないが、それは取りに行ってから分かる
 * (ここでは綴りだけ見る)。
 */
export function docFrom(search: string, base: string): string | null {
  const asked = new URLSearchParams(search).get('doc');
  if (asked === null || asked === '') return null;
  try {
    const url = new URL(asked, base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

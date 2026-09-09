import { toKind } from './kinds.ts';
import type { Kind } from './kinds.ts';

/**
 * 書いたフェンスを URL に載せる。**アドレス欄をそのまま渡せば同じ図が出る**
 * ようにするためのもの (mermaid.live と同じ流儀)。
 *
 * 形は `#<種類>/<base64url>`。サーバーに何も預けないので、リンクが切れない。
 * 圧縮はしない — フェンスは数百バイトの YAML で、詰めても URL の長さは
 * 変わらないほう (base64 の 4/3 倍) が効く。**種類を頭に平文で置く**のは、
 * リンクを見ただけでどのフェンスか分かるようにするため。
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** バイト列 → base64url。`btoa` は 1 文字 1 バイトとして読むので先に詰め直す。 */
function toBase64Url(text: string): string {
  const bytes = encoder.encode(text);
  let binary = '';
  // 一度に渡すと引数の数の上限に当たる (長いフェンスで落ちる) ので刻む。
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/** base64url → 元の字。読めなければ null (外から来た字なので投げない)。 */
function fromBase64Url(data: string): string | null {
  try {
    const padded = data.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/** 共有リンクのハッシュ部 (`#` は含まない)。 */
export const encodeShare = (kind: Kind, source: string): string =>
  `${kind}/${toBase64Url(source)}`;

/**
 * 共有リンクを読んだ結果。**3 通りある。**
 *
 * | 返り | 何が起きたか | 呼ぶ側 |
 * | --- | --- | --- |
 * | `null` | そもそも共有リンクではない (空、ただの `#見出し`) | 何も言わない |
 * | `ok: false` | リンクの形はしているが読めない | **画面に出す** |
 * | `ok: true` | 読めた | その図を出す |
 *
 * **読めないものを黙って捨てない** (約束 6)。既定の例に落ちるだけだと、
 * リンクを渡された人には「別の図が出た」としか見えない。
 */
export type Shared =
  | { readonly ok: true; readonly kind: Kind; readonly source: string }
  | { readonly ok: false; readonly why: string };

/** 画面に出す綴りの上限。外から来た字なので、長いものは切る。 */
const SHOWN = 20;

/** 外から来た字を、そのまま画面に出せる短さにする。 */
const shown = (text: string): string =>
  (text.length <= SHOWN ? text : `${text.slice(0, SHOWN)}…`);

/**
 * 共有リンクを読む。`#` が付いていても外して読む。
 *
 * **種類は別名でも受ける** (`kinds.ts` の `toKind`) — リンクは昔の綴りで
 * 書かれていることがあり、綴りを変えた日に配ってあるものを切らないため。
 */
export function decodeShare(hash: string): Shared | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const slash = body.indexOf('/');
  // 区切りが無いものは共有リンクではない (ただの `#見出し` かもしれない)。
  if (slash <= 0) return null;

  const spelling = body.slice(0, slash);
  const kind = toKind(spelling);
  if (kind === null) return { ok: false, why: `知らない種類です: ${shown(spelling)}` };

  const source = fromBase64Url(body.slice(slash + 1));
  if (source === null) return { ok: false, why: 'リンクの中身を読めませんでした' };
  if (source === '') return { ok: false, why: 'リンクに中身がありません' };
  return { ok: true, kind, source };
}

/**
 * 貼ったときに見える題。**リンクの長さではなく、貼った先の見た目を直す**
 * ためのもの (52 の docs/38)。
 *
 * フェンスの `title:` をそのまま使う — 図に出ている題と、貼ったリンクの題が
 * 同じでないと、受け取った人が別のものだと思う。**字下げした `title:` は
 * 拾わない** (部品の中に書いた題は、図の題ではない)。
 */
const TITLE = /^title:[ \t]*(.*)$/m;

/** 貼った先で 1 行に収まる長さ。これを超えたら切る。 */
const LABEL_MAX = 60;

/** YAML の引用符を外す。書き方の違いを貼り先へ持ち込まない。 */
const unquoted = (text: string): string =>
  (/^(["']).*\1$/.test(text) ? text.slice(1, -1) : text);

export function shareLabel(kind: Kind, source: string): string {
  const found = TITLE.exec(source);
  const title = unquoted((found?.[1] ?? '').trim()).trim();
  if (title === '') return `tommie-fence の ${kind} 図`;
  return title.length <= LABEL_MAX ? title : `${title.slice(0, LABEL_MAX)}…`;
}

/** HTML に入れてよい形に逃がす。**題もアドレスも外から来た字。** */
const escaped = (text: string): string => text
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

/**
 * クリップボードの `text/html` に置く 1 本のリンク。
 *
 * これがあると、リッチテキストを受ける相手 (Gmail・Slack・Notion など) では
 * **題だけが見える**。プレーンテキストしか受けない相手には
 * `text/plain` のほうが渡るので、そちらは今までどおり URL。
 */
export const shareHtml = (url: string, label: string): string =>
  `<a href="${escaped(url)}">${escaped(label)}</a>`;

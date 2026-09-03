import { isKind } from './kinds.ts';
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
 * 共有リンクを読む。`#` が付いていても外して読む。
 * **読めないものは黙って捨てない** — null を返し、呼ぶ側が既定の例に落とす。
 */
export function decodeShare(hash: string): { readonly kind: Kind; readonly source: string } | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  const slash = body.indexOf('/');
  if (slash <= 0) return null;

  const kind = body.slice(0, slash);
  if (!isKind(kind)) return null;

  const source = fromBase64Url(body.slice(slash + 1));
  if (source === null || source === '') return null;
  return { kind, source };
}

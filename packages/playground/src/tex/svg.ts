import { Buffer } from 'buffer';
import { dvi2html } from '@prinsss/dvi2html';

/**
 * DVI を SVG にする。node-tikzjax の `dvi2svg.ts` と同じ段取りだが、
 * **jsdom も svgo も md5 も要らない**: DOM はブラウザのものを使い、
 * 図を縮めるのはやめ (`disableOptimize` と同じ)、印の付け替えに使う鍵は
 * 短いハッシュで足りる (秘密を守る用途ではない)。
 */

/** 同じ頁に何枚も貼るとき、pgf の id がぶつからないようにする鍵。 */
function keyOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** `id="pgf..."` を頭に鍵を挟んだ綴りへ。長いものから置き換える (短い方が食い込むため)。 */
function uniqueIds(html: string): string {
  const ids = html.match(/\bid="pgf[^"]*"/g);
  if (ids === null) return html;

  const key = keyOf(html);
  let out = html;
  for (const id of [...ids].sort((a, b) => b.length - a.length)) {
    const body = id.replace(/id="pgf(.*)"/, '$1');
    out = out.replaceAll(`pgf${body}`, `pgf${key}${body}`);
  }
  return out;
}

export async function dviToSvg(dvi: Uint8Array): Promise<string> {
  let html = '';
  async function* stream(): AsyncGenerator<Buffer> {
    yield Buffer.from(dvi);
  }

  await dvi2html(stream(), {
    write(chunk: { toString(): string }) {
      html += chunk.toString();
    },
  });

  // ソフトハイフンに入れられた記号 (\Omega など) が出ないのを直す
  // (node-tikzjax と同じ手当て)。
  const patched = uniqueIds(html).replaceAll('&#173;', '&#172;');

  // **貼る前に、文書として読み直す。** DOMParser は読むだけでは何も動かさない。
  const parsed = new DOMParser().parseFromString(patched, 'text/html');
  const svg = parsed.querySelector('svg');
  if (svg === null) throw new Error('TeX の出力に図が入っていません');
  return svg.outerHTML;
}

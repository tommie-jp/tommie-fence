/**
 * 図の見分けに使う短い鍵。描画結果をキャッシュから引くためだけのもので、
 * 秘密を守る用途ではないので FNV-1a で足りる。
 * node の crypto を使わないのは、同じコードを web 版の拡張でも動かすため。
 */
const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function hashOf(text: string): string {
  let hash = OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, PRIME);
  }
  return (hash >>> 0).toString(36);
}

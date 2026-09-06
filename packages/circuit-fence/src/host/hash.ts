/**
 * 図の見分けに使う短い鍵。描画結果をキャッシュから引くためだけのもので、
 * 秘密を守る用途ではないので FNV-1a で足りる。
 * node の crypto を使わないのは、同じコードを web 版の拡張でも動かすため。
 *
 * **32 ビットを 2 本並べて 64 ビットにしてある。** 鍵がぶつかると、別のフェンスの
 * 図が黙って出る (エラーにならない)。1 本の 32 ビットでは、覚えている 100 枚の
 * 中でぶつかる確率が 10^-6 のけたで、起きたときに気づく手立てが無い。
 * 2 本目は種を変えて同じ計算を回す。桁は固定 (7 桁の 36 進) にして、
 * 2 本の継ぎ目が動いて別の組が同じ綴りになることを防ぐ。
 */
const OFFSET = 0x811c9dc5;
/** 2 本目の種。1 本目と同じ字列でも別の道を辿る値なら何でもよい。 */
const OFFSET_2 = 0x2c9c62a5;
const PRIME = 0x01000193;

/** 36 進で 32 ビットを書き切る桁数 (36^7 > 2^32)。 */
const DIGITS = 7;

const fnv1a = (text: string, seed: number): string => {
  let hash = seed;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, PRIME);
  }
  return (hash >>> 0).toString(36).padStart(DIGITS, '0');
};

export function hashOf(text: string): string {
  return fnv1a(text, OFFSET) + fnv1a(text, OFFSET_2);
}

import { deflateSync } from 'node:zlib';

/**
 * PWA の絵札を焼く。**外から持ってこない** — この頁の組み立ては
 * 「外部から取ってくるものは無い」を守っているので、絵札のためだけに
 * ラスタライザ (sharp など 30 MB の native) を足さない。
 *
 * 描くのは favicon と同じ図案 (穴の並んだ板に 1 本の配線)。zlib は Node に
 * 入っているので、RGBA を並べて PNG に詰めるだけで足りる。
 *
 * **`maskable` にも耐える形にする。** Android は絵札を丸や角丸に切り抜くので、
 * 地を全面に塗り、図案は真ん中 60 % に収める (切り抜かれても欠けない)。
 */

/** 地の色 (紙)、穴の色、配線の色。favicon と揃える。 */
const PAPER = [0xf2, 0xef, 0xe6, 0xff];
const HOLE = [0x3f, 0x46, 0x50, 0xff];
const WIRE = [0xc1, 0x44, 0x0e, 0xff];

/** 図案が収まる幅 (絵札の何割か)。残りは切り抜かれてよい余白。 */
const SAFE = 0.6;
/** 縁を滑らかにするための刻み (1 画素を SUB × SUB で数える)。 */
const SUB = 4;

/** 円の中か。 */
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** 太さのある線分の上か (端は丸)。 */
function onLine(x, y, x1, y1, x2, y2, half) {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len));
  return inCircle(x, y, x1 + dx * t, y1 + dy * t, half);
}

/**
 * 絵札 1 枚の RGBA。**図案は favicon と同じ**: 4 つの穴と、上の 2 つを結ぶ配線。
 * 地は全面 (maskable のため)。
 */
export function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const pad = size * (1 - SAFE) / 2;
  const inner = size * SAFE;
  // 穴の位置は favicon の 16 単位の図を引き伸ばしたもの (4.5 と 11.5)。
  const at = (n) => pad + inner * (n / 16);
  const holes = [[4.5, 4.5], [11.5, 4.5], [4.5, 11.5], [11.5, 11.5]].map(([x, y]) => [at(x), at(y)]);
  const holeR = inner * (1.4 / 16);
  const wireHalf = inner * (1.2 / 16) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // 上に載る順に数える (地 → 配線 → 穴)。**穴が配線より上** — 板の図では
      // 穴が見えていないと、何の絵か分からない。
      let hole = 0;
      let wire = 0;
      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const px = x + (sx + 0.5) / SUB;
          const py = y + (sy + 0.5) / SUB;
          if (holes.some(([cx, cy]) => inCircle(px, py, cx, cy, holeR))) hole += 1;
          else if (onLine(px, py, holes[0][0], holes[0][1], holes[1][0], holes[1][1], wireHalf)) wire += 1;
        }
      }
      const total = SUB * SUB;
      const mix = (channel) => Math.round(
        (PAPER[channel] * (total - hole - wire) + HOLE[channel] * hole + WIRE[channel] * wire) / total,
      );
      const at4 = (y * size + x) * 4;
      pixels[at4] = mix(0);
      pixels[at4 + 1] = mix(1);
      pixels[at4 + 2] = mix(2);
      pixels[at4 + 3] = 0xff;
    }
  }
  return pixels;
}

/** PNG の塊 1 つ (長さ・名前・中身・CRC)。 */
function chunk(name, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const named = Buffer.concat([Buffer.from(name, 'ascii'), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(named), 0);
  return Buffer.concat([head, named, tail]);
}

/** PNG の CRC-32 (表は初回に組む)。 */
let table = null;
function crc32(buf) {
  if (table === null) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** RGBA → PNG。**フィルタは使わない** (0 のまま) — 絵札は小さく、詰め直す値打ちが無い。 */
export function encodePng(size, rgba) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // 1 色 8 ビット
  head[9] = 6; // RGBA
  // 10..12 は圧縮・フィルタ・インタレースの方式で、どれも 0 が唯一の決まり。

  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(rows, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** その大きさの絵札 1 枚 (PNG)。 */
export const iconPng = (size) => encodePng(size, drawIcon(size));

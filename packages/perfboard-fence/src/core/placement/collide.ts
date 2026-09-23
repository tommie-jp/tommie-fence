import { isDirectSmd, smdMount } from 'fence-kit';
import type { SmdMount } from 'fence-kit';
import { notice, safeToken } from '../errors.ts';
import type { Layout } from '../model/layout.ts';
import { isAxial } from '../parts/types.ts';
import type { Address, FenceError, PlacedPart } from '../types.ts';
import { formatAddress } from '../model/address.ts';
import { bodyRect, overlaps, spanOf } from './geometry.ts';

/**
 * 実物に載るかを見る。**足の穴が別でも、胴は重なる。**
 *
 * 47 の 06 メモで「Lcapy は並列部品を黙って重ねる」を弱点として挙げた以上、
 * こちらが同じことをしては筋が通らない。
 *
 * 見るのは 3 つ — 胴どうしの重なり、実物では入らない足の間隔、
 * 直付けの面実装の置き方。
 */

/**
 * 軸物が要る最小の間隔 (穴の数)。**斜めは直線で測る**ので、隣の斜めの穴
 * (1.41) もここに掛かる — 実物でも胴が入らない距離。
 */
const MIN_AXIAL_SPAN = 2;

/**
 * 胴どうしの重なり。**組ごとに 1 件**にする (部品ごとに出すと、3 つ重なった
 * ときに同じことを 6 回言う)。
 */
function collisions(parts: readonly PlacedPart[], layout: Layout): FenceError[] {
  const rects = parts.map((part) => bodyRect(part, layout));
  const found: FenceError[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const a = rects[i];
    if (!a) continue;
    for (let j = i + 1; j < parts.length; j += 1) {
      const b = rects[j];
      if (!b || !overlaps(a, b)) continue;

      const first = parts[i] as PlacedPart;
      const second = parts[j] as PlacedPart;
      found.push(notice(
        `${safeToken(first.id)} と ${safeToken(second.id)} の胴が重なっています (実物では両方を挿せません)`,
        // **後に書いたほうの行を指す。** 重なりに気づくのは後から置いたときで、
        // 動かすのもたいていそちら。
        second.line ?? first.line,
      ));
    }
  }
  return found;
}

/**
 * 実物では入らない足の間隔。
 *
 * **軸物 (胴の両端から足が出る形) は、隣り合う穴に挿せない。** 胴そのものが
 * 2.54mm より長いため。ラジアル (足が同じ側から出る形) は、そもそも足の間隔が
 * 2.54mm で作られているので見ない。
 *
 * **上限は置いていない。** 足は伸ばせるし、部品ごとの実寸は種類だけでは
 * 決まらない (1/4W と 1/6W で胴の長さが違う)。ここで見るのは
 * **どの部品でも確実に入らない**間隔だけにしてある — 迷ったら黙るほうが、
 * 正しい図を叱るより良い。
 */
function tooTight(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    // **直付けの面実装は軸物ではない。** `resistor/2012` は隣の穴に跨ぐのが正しい。
    if (!isAxial(part.type) || isDirectSmd(part.variant)) return [];
    const span = spanOf(part);
    if (span === null || span >= MIN_AXIAL_SPAN) return [];

    const holes = part.pins.map((pin) => formatAddress(pin.address)).join(' と ');
    return [notice(
      `${safeToken(part.id)} (${part.type}) の足の間隔が狭すぎます (${holes})`
      + '。胴の両端から足が出る部品なので、実物では入りません',
      part.line,
    )];
  });
}

/** 上下か左右に、ちょうど `apart` 穴離れているか。 */
const straight = (a: Address, b: Address, apart: number): boolean =>
  (a.row === b.row && Math.abs(a.col - b.col) === apart) || (a.col === b.col && Math.abs(a.row - b.row) === apart);

/**
 * 三角 — 1 番と 2 番が隣の穴、3 番はその隣の行 (列) の、1 番か 2 番の並び。
 * SOT の 1 番・2 番の足 (1.9mm) は隣の穴 (2.54mm) のランドに載り、3 番は反対側に出る。
 */
function isTriangle(first: Address, second: Address, third: Address): boolean {
  if (!straight(first, second, 1)) return false;
  return first.row === second.row
    ? Math.abs(third.row - first.row) === 1 && (third.col === first.col || third.col === second.col)
    : Math.abs(third.col - first.col) === 1 && (third.row === first.row || third.row === second.row);
}

/** 置き方ごとの言い方。**どう置けばよいか**を言う (違っていることだけでは直せない)。 */
const MOUNT_WORDS: Readonly<Record<SmdMount, string>> = {
  adjacent: '隣の穴 (上下か左右) に跨いで付けます',
  'two-holes': '間に 1 穴空けて (2 穴離して) 付けます',
  triangle: '三角に置きます — 1 番と 2 番を隣の穴に、3 番を次の行の 1 番か 2 番の隣に (b3 b4 c3 のように)',
};

function mountFits(mount: SmdMount, holes: readonly Address[]): boolean {
  const [first, second, third] = holes;
  if (first === undefined || second === undefined) return true;
  if (mount === 'adjacent') return straight(first, second, 1);
  if (mount === 'two-holes') return straight(first, second, 2);
  return third === undefined || isTriangle(first, second, third);
}

/**
 * 直付けの面実装の置き方 (52 の docs/64)。**表が決めた置き方と違えば言う** —
 * 止めない (54 の流儀)。図はそのまま描き、届かない分は足先から穴への線に出る。
 */
function wrongMount(parts: readonly PlacedPart[]): FenceError[] {
  return parts.flatMap((part) => {
    const mount = smdMount(part.variant);
    const holes = part.pins.map((pin) => pin.address);
    if (mount === null || mountFits(mount, holes)) return [];
    // 種類と姿は表にある綴りなので、そのまま文面に出してよい。
    return [notice(
      `${safeToken(part.id)} (${part.type}/${part.variant ?? ''}) は${MOUNT_WORDS[mount]}`
      + ` (書かれた穴: ${holes.map(formatAddress).join(' ')})`,
      part.line,
    )];
  });
}

export const checkFit = (parts: readonly PlacedPart[], layout: Layout): FenceError[] =>
  [...collisions(parts, layout), ...tooTight(parts), ...wrongMount(parts)];

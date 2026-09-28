import { textWidth } from '../textFit.ts';

/**
 * 板の外の機器 (`type: device`) の足の名前。**横 1 列に並んだ名前が隣と触れない大きさ**を決める。
 *
 * 名前は足の真上に中央揃えで書く。足の間が狭いと (PIR の `GND VCC OUT` が隣り合う穴へ
 * 落ちたとき、ブレッドボードで機器が帯に詰め込まれたとき) `GNDVCCOUT` と地続きに読めた。
 * breadboard と perfboard が同じ形で踏んだので、ここに置く。
 *
 * 1. 既定の大きさ (`largest`) で隣と `PIN_NAME_GAP` 空くなら、そのまま 1 段
 * 2. 空かなければ、隣どうしの幅の和の半分 + 隙間が足の間に収まる大きさまで縮める
 *    (長い名前は短い隣の名前が空けた所へはみ出してよい — DIP の名前と同じ決め方)
 * 3. それが下限 (`smallest`) を割るなら、**2 段に互い違いに置く** (`staggered`)。
 *    同じ段で隣になるのは 1 つ飛ばしの名前なので、足の間が倍になる。大きさはそこから
 *    同じように決め、下限で止める
 */

/** 隣り合う名前の字と字の隙間。これより詰めると 2 つの名前が 1 つの綴りに読める。 */
export const PIN_NAME_GAP = 4;
/**
 * 足の名前は大文字ばかり (`GND` `VCC`) で、`textWidth` の半角 0.55 より広い
 * (DIP の名前で焼いて測ると 1.25 倍ほど)。狭く見積もると隣の名前に食い込む。
 * `M` `W` はさらに広い (焼いた PNG で `W2` が隣の `GND` に付いて見えた)。
 */
const CAPS = 1.25;
const WIDEST_CAPS = /[MW]/;
const WIDEST_WIDTH = 0.95;

/** 字の大きさ 1 のときの足の名前の幅 (大文字の見積もり)。 */
export const pinNameWidth = (name: string): number =>
  [...name].reduce((sum, char) => sum + (WIDEST_CAPS.test(char) ? WIDEST_WIDTH : textWidth(char) * CAPS), 0);

export type PinNameRowOptions = {
  /** 間が広いときの大きさ。これより大きくはしない。 */
  readonly largest: number;
  /** 読める下限。これを割るなら 2 段にする。 */
  readonly smallest: number;
  /** 名前が出てはいけない左右の端 (機器の箱の内側)。書かなければ端を見ない。 */
  readonly within?: { readonly left: number; readonly right: number };
};

export type PinNameRow = {
  readonly size: number;
  /** 2 段に互い違いに置く (並べた順で偶数番目と奇数番目が別の段)。 */
  readonly staggered: boolean;
};

/**
 * `step` 個離れた名前どうしが `PIN_NAME_GAP` 空き、どの名前も `within` から出ない大きさ
 * (`largest` で頭打ち)。
 */
function fittingSize(
  sorted: readonly { x: number; name: string }[],
  step: number,
  { largest, within }: PinNameRowOptions,
): number {
  let size = largest;
  if (within) {
    for (const { x, name } of sorted) {
      const half = pinNameWidth(name) / 2;
      if (half > 0) size = Math.min(size, Math.min(x - within.left, within.right - x) / half);
    }
  }
  for (let i = step; i < sorted.length; i += 1) {
    const [a, b] = [sorted[i - step]!, sorted[i]!];
    const both = (pinNameWidth(a.name) + pinNameWidth(b.name)) / 2;
    if (both > 0) size = Math.min(size, (b.x - a.x - PIN_NAME_GAP) / both);
  }
  return size;
}

/**
 * `xs[i]` の足に `names[i]` を書くときの字の大きさと段の数。
 * 足の並び順は問わない (x で並べ直して隣を決める)。
 */
export function pinNameRow(
  xs: readonly number[],
  names: readonly string[],
  options: PinNameRowOptions,
): PinNameRow {
  const sorted = names
    .map((name, index) => ({ x: xs[index] ?? 0, name }))
    .sort((a, b) => a.x - b.x);
  const single = fittingSize(sorted, 1, options);
  if (single >= options.smallest) return { size: single, staggered: false };
  return { size: Math.max(options.smallest, fittingSize(sorted, 2, options)), staggered: true };
}

/** 互い違いのとき、この足の名前を奥の段 (機器の箱の内へ 1 行ぶん) に書くか。 */
export function pinNameInner(xs: readonly number[], index: number): boolean {
  const x = xs[index] ?? 0;
  const rank = xs.filter((other, at) => other < x || (other === x && at < index)).length;
  return rank % 2 === 1;
}

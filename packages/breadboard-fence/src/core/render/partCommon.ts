import { bodySize } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import { TEXT_HALO_WIDTH, num, svgText } from './svg.ts';
import { fit } from './textFit.ts';
import type { TextOptions } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { BASE_HOLE_SIZE, textScale } from './theme.ts';

/** 部品の種類ごとの描画で共有する寸法と字の置き方。 */
export const LEAD_WIDTH = 2;
export const CHAR_WIDTH = 5.6;
export const CAPTION_HEIGHT = 14;

// ラベルは穴 1 つぶんの隙間 (20) に置く。字を大きくしても**ベースラインは動かさない**:
// 字は基準線から上へ伸びるので隙間を上に使い、下げると隣の穴の列に食い込む。
export const CAPTION_DROP = 18;
/** 胴と足の名前のあいだの隙間。字の高さは呼ぶ側が足す。 */
export const LEG_NAME_CLEAR = 3;
/** 字が基準線から上へ出る高さの、字の大きさに対する比。 */
export const NAME_CAP = 0.72;
/** 字を 1 行送るときの比。 */
export const NAME_LINE = 1.15;

// ラベルと値の長さはパーサ側 (limits.ts) で切ってあるので、ここでは組み立てるだけ。
export const caption = (part: PlacedPart): string => [part.id, part.value ?? part.label ?? ''].join(' ').trim();

/**
 * 板からはみ出す字を切る。使える幅は**置き方 (anchor) と、そこから近いほうの板の端まで**で決まる。
 *
 * `limits.ts` が切っているのは**文字数** (60) で、幅ではない。全角 60 文字は
 * 既定のテーマで 750px あり、half サイズの画布 (664px) には最初から入らない。
 * 切らずに置くと viewBox の外へ出て**黙って消える**ので、読む側は切れたことにも
 * 気づけない。切った跡を `…` で残すのは部品リストと同じ約束。
 *
 * 画布ではなく板を境にするのは、字が画布の縁に貼り付くと読みにくいため。
 * 板の外の余白 (OUTER_MARGIN) は、はみ出したときの逃げしろとして空けておく。
 */
export function fitToBoard(
  text: string,
  x: number,
  fontSize: number,
  layout: Layout,
  // 中央揃え (部品の真上) と右揃え (Pico の左に出すラベル) だけ。
  // 左揃えのキャプションはまだ無いので、要るようになってから足す。
  anchor: 'middle' | 'end' = 'middle',
): string {
  const left = x - layout.board.x;
  const room = anchor === 'end' ? left : Math.min(left, layout.board.x + layout.board.width - x) * 2;
  return fit(text, Math.max(0, room) / fontSize);
}

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const charWidth = (theme: RenderTheme): number => textScale(theme) * CHAR_WIDTH;

/**
 * ラベルの縁取りの太さ。ラベルは必ず隣の穴の列にかかる位置に来るので、
 * **縁取りがその穴を消しきれる太さでなければ字が穴に食われる**。
 * 字が伸びれば覆う範囲が広がり、穴が大きくなれば消すべき量も増えるので、両方で決める。
 */
export const haloWidth = (theme: RenderTheme): number =>
  TEXT_HALO_WIDTH * textScale(theme) + (theme.metrics.holeSize - BASE_HOLE_SIZE) * 1.25;

/**
 * **胴が足の線に細く乗らない部品**。ほかの 2 本足は足の線の上に薄く乗るだけなので
 * 定数の距離で足りるが、水晶の缶は**足の穴を覆う** (平たい缶) か**片側に高く立つ**
 * (円筒) ので、既定の距離では字が胴に載る。ここだけ**胴の高さから測る**。
 */
const OVER_AXIS_TYPES: ReadonlySet<string> = new Set(['crystal']);

/** 胴の高さ (足の線からどれだけ張り出しうるか)。字を胴の外へ置くのに要る。 */
function bodyHeightOf(part: PlacedPart, layout: Layout): number {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return 0;
  const from = layout.point(first.address);
  const to = layout.point(second.address);
  return bodySize(part, Math.hypot(to.x - from.x, to.y - from.y)).height;
}

/** 胴と名札のあいだに空ける隙間。 */
export const CAPTION_CLEAR = 4;

/** 字が基準線から上へ出る高さ (大文字の高さ)。下に置くときはこれも足す。 */
const capHeight = (theme: RenderTheme): number => theme.metrics.textSize * 0.72;

/**
 * ラベルは**いつも胴の下**。溝の側へ振り分けていたが、上のブロックと下の
 * ブロックで名前の出る側が変わり、同じ図の中で揃わなかった
 * (実機で「すべての部品名は部品の下側に表示する」)。
 *
 * **胴の高さから測る。** 決め打ちの距離だと、背の高い胴 (円板のバリスタや
 * CdS、箱のヒューズ・電池・太陽電池・スイッチ、砲弾のダイオード) に字が乗る
 * (実機で「文字と図形が被らないように文字をずらす」と 18 種類を並べて言われた)。
 * **姿もそのまま効く** — 胴の寸法は `bodySize` が姿ごとに持っているので、
 * `capacitor/electrolytic` のように姿で背の伸びる部品も一緒に逃げる。
 *
 * 下に置くときは**字の高さも足す** — 基準線は字の下端なので、隙間だけ足すと
 * 字の頭が胴に食い込む。
 */
export function labelYOf(part: PlacedPart, center: Point, layout: Layout, theme: RenderTheme): number {
  if (OVER_AXIS_TYPES.has(part.type)) return center.y + bodyHeightOf(part, layout);
  const half = bodyHeightOf(part, layout) / 2;
  return center.y + Math.max(CAPTION_DROP, half + CAPTION_CLEAR + capHeight(theme));
}

/** 板と穴の上に載る部品の字。縁取りを敷いて、下の穴に食われないようにする。 */
export const partLabel = (
  x: number,
  y: number,
  text: string,
  theme: RenderTheme,
  extra: TextOptions = {},
): string =>
  svgText(x, y, text, {
    'font-size': num(theme.metrics.textSize),
    fill: theme.palette.partText,
    halo: theme.palette.textHalo,
    haloWidth: haloWidth(theme),
    ...extra,
  });

/** その部品のピンが落ちた画布の座標。1 本でも置けていなければ null (描かない)。 */
export function pinPoints(part: PlacedPart, layout: Layout): Point[] | null {
  const points = part.pins.map((pin) => (pin.address ? layout.point(pin.address) : null));
  return points.every((point): point is Point => point !== null) ? points : null;
}

export const pointOfPin = (part: PlacedPart, name: string, layout: Layout): Point | null => {
  const pin = part.pins.find((candidate) => candidate.name === name);
  return pin?.address ? layout.point(pin.address) : null;
};

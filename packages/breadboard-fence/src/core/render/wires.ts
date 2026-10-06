import type { Point } from '../types.ts';
import type { RenderTheme } from './theme.ts';
import { element, num, roundedPath } from './svg.ts';

const CORNER_RADIUS = 10;
/** 穴の中央に置く金属の粒の半径 (太さに対する比)。暗い穴の上で金属の先が見えるよう、穴より小さくする。 */
const END_RADIUS_RATIO = 0.55;
/**
 * 縁取りが線の両側に出る幅。細い線として見える最小限に留める。
 * 広げると被覆の色より縁のほうが目立ってしまい、色で配線を追えなくなる。
 */
const HALO_MARGIN = 1.6;
/**
 * 端で被覆を剥いた長さ。穴に挿す所は金属の線が穴の中央まで出ているように描く
 * (機器のピンと同じ見え方。被覆の色が穴まで来ると、どこに挿さっているか読みにくかった)。
 */
const BARE_TIP = 9;
/** 剥いた先の金属の太さ (被覆に対する比)。 */
const BARE_WIDTH_RATIO = 0.6;

/**
 * 1 本の配線を、下に敷く縁取りと線本体に分けて返す。
 * **分けるのは、縁取りが交差した相手の線を塗り潰さないようにするため。**
 * 全部の縁取りを先に敷いてから線を重ねる (呼ぶ側がその順で並べる)。
 */
export type WirePaint = { readonly halo: string; readonly line: string };

const NOTHING: WirePaint = { halo: '', line: '' };

/**
 * 配線の縁取り。**テーマが縁取りを持たないとき** (classic・presentation) は、
 * **全部の線を同じ縁で縁取る** (perfboard-fence と同じ)。
 *
 * 沈む色 (白・既定の灰色) だけ縁取っていたころは、太さが 2 通りに見えて意味の違いに
 * 読まれ、交差した 2 本の境目も見えなかった。縁は濃い灰色で、明るい基板の上で
 * 線の形を立てる (perf の緑の基板は白い縁だが、この基板の明るさでは白は消える)。
 * 色は変えない (被覆の色そのもので、テーマで変えると図が嘘になる)。
 */
export const WIRE_OUTLINE = '#5b636d';
/** 縁取りが線の両側に出る幅の合計 (片側 1。perfboard-fence の `OUTLINE_MARGIN` と同じ)。 */
const OUTLINE_MARGIN = 2;

/**
 * 1 本の配線。`hops` は**この線が跨ぐ交差の点** (`crossings.ts`)。
 * 交差があればそこだけ半円で渡る (perfboard-fence と同じ描き方)。
 */
export function renderWire(
  points: readonly Point[],
  color: string,
  theme: RenderTheme,
  hops: readonly Point[] = [],
): WirePaint {
  const path = wirePath(points, hops);
  if (!path) return NOTHING;

  const { wireWidth } = theme.metrics;
  const { wireHalo, chipPin } = theme.palette;

  // 配線の色は被覆の色そのものなのでテーマでは変えない。
  // 地に沈むテーマ (暗い基板の黒線など) は、色を変えるかわりに縁取りを敷いて浮かせる。
  // テーマが縁取りを持たなければ、全部の線を同じ縁で縁取る (`WIRE_OUTLINE`)。
  const outline = wireHalo ? null : WIRE_OUTLINE;
  const halo = wireHalo
    ? element('path', {
        d: path, fill: 'none', stroke: wireHalo, 'stroke-width': num(wireWidth + HALO_MARGIN),
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.75,
      })
    : outline
      ? element('path', {
          d: path, fill: 'none', stroke: outline, 'stroke-width': num(wireWidth + OUTLINE_MARGIN),
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        })
      : '';
  // 芯線 (金属) を穴から穴まで敷き、その上に両端を剥いた被覆を重ねる。
  const core = element('path', {
    d: path, fill: 'none', stroke: chipPin, 'stroke-width': num(wireWidth * BARE_WIDTH_RATIO),
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  const covered = wirePath(stripEnds(points), hops) || path;
  const line = element('path', {
    d: covered, fill: 'none', stroke: color, 'stroke-width': num(wireWidth), 'stroke-linecap': 'round',
  });
  const ends = [points[0], points[points.length - 1]]
    .map((point) =>
      point
        ? insertionDot(point, theme)
        : '',
    )
    .join('');

  return { halo, line: core + line + ends };
}

/**
 * 穴に挿した所の金属の粒。配線の端と部品のピンの端で同じものを置き、
 * どこに挿さっているかを同じ見え方で示す。
 */
/** 挿した所の金属の粒の半径。 */
export const insertionDotRadius = (theme: RenderTheme): number => theme.metrics.wireWidth * END_RADIUS_RATIO;

export function insertionDot(point: Point, theme: RenderTheme): string {
  return element('circle', {
    cx: num(point.x), cy: num(point.y), r: num(insertionDotRadius(theme)), fill: theme.palette.chipPin,
  });
}

/** 端の点から隣の点へ `length` だけ進んだ点。区間が短ければ区間の半分で止める。 */
function stepToward(end: Point, next: Point, length: number): Point {
  const dx = next.x - end.x;
  const dy = next.y - end.y;
  const span = Math.hypot(dx, dy);
  if (span === 0) return end;
  const step = Math.min(length, span / 2) / span;
  return { x: end.x + dx * step, y: end.y + dy * step };
}

/** 両端を剥いた長さだけ縮めた点の並び (元の並びは変えない)。 */
function stripEnds(points: readonly Point[]): readonly Point[] {
  if (points.length < 2) return points;
  const first = stepToward(points[0]!, points[1]!, BARE_TIP);
  const last = stepToward(points[points.length - 1]!, points[points.length - 2]!, BARE_TIP);
  return [first, ...points.slice(1, -1), last];
}

/**
 * 跨ぎの半径。**穴の間隔 (20) の 3/10。** 縁込みの線の太さ (約 6) より十分大きくないと
 * 半円が線に埋もれ、大きいと隣の穴まで届いて、跨いだ先の穴が塞がって見える。
 */
const HOP = 6;

/** 座標の比べ方の許し。 */
const EPSILON = 1e-6;

/**
 * 角を丸め、交差の所だけ半円で跨ぐ道筋。跨ぎが無ければ `roundedPath` のまま
 * (図の大半は交差しないので、書き出した SVG を変えない)。
 *
 * 跨ぎは区間ごとに入れ、**角の丸めにかかる所には入れない** (弧が角の曲がりと
 * 重なると結び目に見える)。**近すぎる跨ぎは 1 つにまとめる**。膨らむ向きは
 * 線の向きによらず揃える — 横寄りの区間は上へ、縦寄りの区間は右へ。
 */
function wirePath(points: readonly Point[], hops: readonly Point[]): string {
  if (hops.length === 0) return roundedPath(points, CORNER_RADIUS);
  const path = points.filter((current, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== current.x || previous.y !== current.y;
  });
  if (path.length < 2) return '';

  const last = path.length - 1;
  // 角ごとの丸め始めと丸め終わり (`roundedPath` と同じ取り方)。
  const corners = path.map((corner, index) => {
    if (index === 0 || index === last) return null;
    const before = path[index - 1]!;
    const after = path[index + 1]!;
    return {
      corner,
      entry: stepToward(corner, before, CORNER_RADIUS),
      exit: stepToward(corner, after, CORNER_RADIUS),
    };
  });

  const commands = [`M ${xy(path[0]!)}`];
  for (let index = 1; index <= last; index += 1) {
    const start = corners[index - 1]?.exit ?? path[index - 1]!;
    const end = corners[index]?.entry ?? path[index]!;
    commands.push(...hopsAlong(start, end, hops));
    const bend = corners[index];
    commands.push(bend ? `L ${xy(bend.entry)} Q ${xy(bend.corner)} ${xy(bend.exit)}` : `L ${xy(end)}`);
  }
  return commands.join(' ');
}

/** `start`→`end` の区間に乗る跨ぎを、端の手前で収まるものだけ半円にする。 */
function hopsAlong(start: Point, end: Point, hops: readonly Point[]): readonly string[] {
  const length = distanceOf(start, end);
  if (length === 0) return [];
  const unit = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const at = (along: number): Point => ({ x: start.x + unit.x * along, y: start.y + unit.y * along });
  // 弧の向き (sweep=1 は進行方向の左、画面では横へ進むと上へ膨らむ)。
  const sweep = (Math.abs(unit.x) >= Math.abs(unit.y) ? unit.x > 0 : unit.y > 0) ? 1 : 0;

  const spans = hops
    .filter((hop) => Math.abs((hop.x - start.x) * unit.y - (hop.y - start.y) * unit.x) < EPSILON)
    .map((hop) => (hop.x - start.x) * unit.x + (hop.y - start.y) * unit.y)
    .filter((along) => along - HOP > 0 && along + HOP < length)
    .sort((one, other) => one - other)
    .reduce<readonly { readonly start: number; readonly end: number }[]>((kept, along) => {
      const span = { start: along - HOP, end: along + HOP };
      const previous = kept[kept.length - 1];
      return previous !== undefined && span.start <= previous.end
        ? [...kept.slice(0, -1), { start: previous.start, end: span.end }]
        : [...kept, span];
    }, []);

  return spans.map((span) => {
    const radius = num((span.end - span.start) / 2);
    return `L ${xy(at(span.start))} A ${radius} ${radius} 0 0 ${sweep} ${xy(at(span.end))}`;
  });
}

const xy = (point: Point): string => `${num(point.x)} ${num(point.y)}`;

const distanceOf = (one: Point, other: Point): number => Math.hypot(other.x - one.x, other.y - one.y);

import { element, num } from 'fence-kit';
import { wireStroke } from '../color.ts';
import { hatchDash } from './hatch.ts';
import type { Layout } from '../model/layout.ts';
import type { Point, RoutedWire } from '../types.ts';
import type { DeviceWire } from '../wiring/wiring.ts';
import type { PlacedDevice } from './devices.ts';
import type { Theme } from './theme.ts';

/** ジャンパの太さ。部品の足より少し太い (被覆があるぶん)。 */
const WIRE_WIDTH = 3;

/**
 * 跨ぎの半径。**穴の間隔 (20) の 1/4。** これより小さいと線の太さに埋もれ、
 * 大きいと隣の穴まで届いて、跨いだ先の穴が塞がって見える。
 */
const HOP = 5;

/**
 * 配線。**2 つの穴をまっすぐ結ぶ。**
 *
 * ブレッドボードは溝と電源レールがあるので横レーンへ迂回する経路探索が要ったが
 * (48 の docs/12〜14)、ユニバーサル基板はどの穴も同じ格子の上にあり、
 * ジャンパは実物でも 2 点を最短で結ぶ。**書かれたとおりに描く**という約束とも
 * 合っている — 経路を機械が決めると、はんだ付けの手順書にならない。
 *
 * **途中で交差する線は跨いで引く** (`hops` にその点が入っている)。この板では
 * 線の途中に接点が無いのに、2 本が同じ点で出会うと半田付けしたように見えるため
 * (`render/crossings.ts`)。実物でもジャンパは相手をまたいで渡るので、
 * 半円は図の約束であると同時に見たままでもある。
 */
export const renderWires = (
  wires: readonly RoutedWire[],
  layout: Layout,
  theme: Theme,
  hops: readonly (readonly Point[])[] = [],
  edit = false,
): string =>
  wires
    .map((wire, index) => {
      const drawn = strand(
        layout.point(wire.from),
        layout.point(wire.to),
        hops[index] ?? [],
        wire.color,
        theme,
      );
      if (!edit) return drawn;
      // 線は細くて掴めないので、**同じ道に太い透明な線**を重ねる。
      const from = layout.point(wire.from);
      const to = layout.point(wire.to);
      const hit = element('line', {
        class: 'cf-wire-hit',
        x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
        stroke: 'transparent',
        'stroke-width': num(WIRE_WIDTH * 3),
        'stroke-linecap': 'round',
      });
      return element('g', { class: 'cf-wire', 'data-line': String(wire.line ?? 0) }, drawn + hit);
    })
    .join('');

/**
 * 機器の足と穴を結ぶ配線。**板の上まで線を引く。**
 *
 * 電池やスピーカーの線も、実物では板の穴に半田付けする。どの穴へ行くのかが
 * 図に出ないと、帯に浮いた箱と板が結び付かず、組む人が図から手を動かせない
 * (breadboard-fence も同じように引く)。線が届く先はその穴そのものなので、
 * 「挿す場所があるように見える」ということも無い。
 *
 * 機器どうしを結んだ配線は板に触れないので、ここには来ない。
 */
export const renderDeviceWires = (
  wires: readonly DeviceWire[],
  devices: readonly PlacedDevice[],
  layout: Layout,
  theme: Theme,
  hops: readonly (readonly Point[])[] = [],
): string => {
  const pins = new Map(devices.map((placed) => [placed.device.id, placed.pins]));

  return wires
    .map((wire, index) => {
      const from = pins.get(wire.device)?.get(wire.pin);
      // 機器が帯に置けなかったとき (帯そのものが無いとき) は線も引けない。
      if (!from) return '';
      return strand(from, layout.point(wire.hole), hops[index] ?? [], wire.color, theme);
    })
    .join('');
};

/**
 * 1 本のジャンパ。交差する点があれば、そこだけ半円で跨ぐ。
 *
 * 跨ぎが無ければ線のまま引く — 図の大半は交差しないので、そこまで path にすると
 * 書き出した SVG が読みづらくなる (差分も大きくなる)。
 */
function strand(
  from: Point,
  to: Point,
  hops: readonly Point[],
  color: string | null,
  theme: Theme,
): string {
  // **白黒の図では色を線の型に移す** (`hatch.ts`)。塗り分けを落とすだけだと
  // 「同じ色の線は同じ網」が読めなくなるので、形のほうに移して凡例で引かせる。
  const dash = theme.hatch === true && color !== null ? hatchDash(color) : '';
  const ink = {
    stroke: theme.hatch === true ? theme.palette.wire : wireStroke(color, theme.palette.wire),
    'stroke-width': WIRE_WIDTH,
    // 破線は端を丸めると隙間が埋まって実線に見える。
    'stroke-linecap': dash === '' ? 'round' : 'butt',
    'stroke-opacity': theme.metrics.wireOpacity,
    ...(dash === '' ? {} : { 'stroke-dasharray': dash }),
  };
  const path = hops.length === 0 ? null : hopPath(from, to, hops);

  return path === null
    ? element('line', {
      x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y), ...ink,
    })
    : element('path', { d: path, fill: 'none', ...ink });
}

/**
 * 跨ぎを入れた道筋。**近すぎる跨ぎは 1 つにまとめる** — 弧が前の弧の中から
 * 始まると線が折り返して見え、跨ぎのつもりが結び目になる。
 */
function hopPath(from: Point, to: Point, hops: readonly Point[]): string | null {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return null;

  const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const at = (along: number) =>
    `${num(from.x + unit.x * along)} ${num(from.y + unit.y * along)}`;

  const spans = hops
    .map((hop) => (hop.x - from.x) * unit.x + (hop.y - from.y) * unit.y)
    .sort((one, other) => one - other)
    .reduce<readonly { readonly start: number; readonly end: number }[]>((kept, along) => {
      const span = { start: Math.max(0, along - HOP), end: Math.min(length, along + HOP) };
      const last = kept[kept.length - 1];
      return last !== undefined && span.start <= last.end
        ? [...kept.slice(0, -1), { start: last.start, end: Math.max(last.end, span.end) }]
        : [...kept, span];
    }, []);

  const drawn = spans
    .map((span) => ` L ${at(span.start)} A ${num((span.end - span.start) / 2)} ${num((span.end - span.start) / 2)} 0 0 1 ${at(span.end)}`)
    .join('');

  return `M ${at(0)}${drawn} L ${at(length)}`;
}

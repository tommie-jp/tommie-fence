import { element, num } from 'fence-kit';
import { wireStroke } from '../color.ts';
import { wireOutline } from './finish.ts';
import { hatchDash } from './hatch.ts';
import type { Layout } from '../model/layout.ts';
import type { Point, RoutedWire } from '../types.ts';
import type { DeviceWire } from '../wiring/wiring.ts';
import type { PlacedDevice } from './devices.ts';
import type { Theme } from './theme.ts';
import type { Obstacle } from './captions.ts';

/**
 * ジャンパの太さ。部品の足より少し太い (被覆があるぶん)。3 では縮めて貼ると
 * 1 px 前後になり、板と明るさの近い色 (青・赤・紫・茶) が沈んだ (52 の docs/110)。
 */
export const WIRE_WIDTH = 4;

/**
 * 縁取りが線の両側に出る幅の合計 (片側 1)。**全部の線を縁取る** — 緑の板では
 * 11 色のうち 4 色が板とほぼ同じ明るさで、色みの違いでしか見分けられない。
 * 沈む色だけ縁取ると太さが 2 通りに見え、意味の違いに読まれる。
 */
export const OUTLINE_MARGIN = 2;

/**
 * 穴の間で渡る跨ぎの半径。**穴の間隔 (20) の 1/4。** これより小さいと線の太さに埋もれ、
 * 大きいと隣の穴まで届いて、跨いだ先の穴が塞がって見える。
 */
const HOP = 5;

/**
 * **穴の真上で渡る**跨ぎの半径。ランド (半径 4.5) と半田の玉 (半径 6) の外に
 * 縁込みの線の帯 (中心 ± 3) が収まる大きさ。HOP のままだと半円がランドの縁に重なり、
 * 輪郭が色づいたようにしか見えない。隣の穴のランド (15.5 から) には届かない。
 */
const HOP_OVER_HOLE = 9;

/** 名札が避ける形としての配線 (`captions.ts`)。太さは縁取りの外まで。 */
export const wireObstacle = (from: Point, to: Point): Obstacle => ({
  from, to, half: (WIRE_WIDTH + OUTLINE_MARGIN) / 2, owner: null,
});

/** 座標の比べ方の許し。 */
const EPSILON = 1e-6;

/** 点が穴の真上か。格子は一様なので、1 番地の座標からの距離がピッチの倍数かで足りる。 */
const isOverHole = (layout: Layout, point: Point): boolean => {
  const origin = layout.point({ row: 1, col: 1 });
  const onGrid = (delta: number): boolean => {
    const rest = Math.abs(delta) % layout.pitch;
    return rest < EPSILON || layout.pitch - rest < EPSILON;
  };
  return onGrid(point.x - origin.x) && onGrid(point.y - origin.y);
};

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
): string => {
  const painted = wires.map((wire, index) => {
      const paint = strand(
        layout.point(wire.from),
        layout.point(wire.to),
        hops[index] ?? [],
        wire.color,
        theme,
        layout,
      );
      const drawn = paint.line;
      if (!edit) return { halo: paint.halo, line: drawn };
      // 線は細くて掴めないので、**同じ道に太い透明な線**を重ねる。
      // **行番号は掴み手そのものに持たせる。** webview はカーソルの下にある要素から
      // `data-line` を読むので、外の `g` にだけ付けると掴んでも行が分からない。
      const from = layout.point(wire.from);
      const to = layout.point(wire.to);
      const hit = element('line', {
        class: 'cf-wire-hit',
        'data-line': String(wire.line ?? 0),
        x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
        stroke: 'transparent',
        'stroke-width': num(WIRE_WIDTH * 3),
        'stroke-linecap': 'round',
      });
      const ends = wireEndHits(from, to, String(wire.line ?? 0));
      return {
        halo: paint.halo,
        line: element('g', { class: 'cf-wire', 'data-line': String(wire.line ?? 0) }, drawn + hit + ends),
      };
    });
  return layered(painted);
};

/**
 * 1 本を縁と線に分けたもの。**縁を全部先に敷き、その上に線を重ねる** —
 * 線ごとに縁を重ねると、同じ穴で出会う 2 本の継ぎ目に縁の輪が出て、
 * つながっていないように見える (breadboard-fence の `WirePaint` と同じ順)。
 */
type WirePaint = { readonly halo: string; readonly line: string };

const layered = (painted: readonly WirePaint[]): string =>
  painted.map((paint) => paint.halo).join('') + painted.map((paint) => paint.line).join('');

/**
 * 配線の**端だけ**を掴む的。線そのものより後に置く (端の上では端が勝つ)。
 * 掴んだ端だけを付け替えられるようにするためのもの
 * (実機で「配線の先端を選択して、その先端だけ移動できるようにする」)。
 * breadboard-fence と同じ約束 (`.cf-wire-end` に `data-line` と `data-end`)。
 */
const wireEndHits = (from: Point, to: Point, line: string): string =>
  [{ at: from, end: 'from' }, { at: to, end: 'to' }]
    .map(({ at, end }) => element('circle', {
      class: 'cf-wire-end',
      'data-line': line,
      'data-end': end,
      cx: num(at.x),
      cy: num(at.y),
      r: num(WIRE_WIDTH * 1.6),
      fill: 'transparent',
    }))
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

  return layered(wires.flatMap((wire, index) => {
    const from = pins.get(wire.device)?.get(wire.pin);
    // 機器が帯に置けなかったとき (帯そのものが無いとき) は線も引けない。
    if (!from) return [];
    return [strand(from, layout.point(wire.hole), hops[index] ?? [], wire.color, theme, layout)];
  }));
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
  layout: Layout,
): WirePaint {
  // **白黒の図では色を線の型に移す** (`hatch.ts`)。塗り分けを落とすだけだと
  // 「同じ色の線は同じ網」が読めなくなるので、形のほうに移して凡例で引かせる。
  const dash = theme.hatch === true && color !== null ? hatchDash(color) : '';
  // **白黒の図は縁取らない** — 線の型で読ませる図に縁を足すと、破線の隙間が埋まる。
  const outlined = theme.hatch !== true;
  const ink = {
    stroke: theme.hatch === true ? theme.palette.wire : wireStroke(color, theme.palette.wire),
    'stroke-width': WIRE_WIDTH,
    // 破線は端を丸めると隙間が埋まって実線に見える。
    'stroke-linecap': dash === '' ? 'round' : 'butt',
    // 縁の上で透かすと暗い縁が透けて色が濁り、真ん中と端で色が違って見える。
    'stroke-opacity': outlined ? 1 : theme.metrics.wireOpacity,
    ...(dash === '' ? {} : { 'stroke-dasharray': dash }),
  };
  const path = hops.length === 0 ? null : hopPath(from, to, hops, layout);
  const draw = (attributes: Record<string, string | number>): string =>
    path === null
      ? element('line', { x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y), ...attributes })
      : element('path', { d: path, fill: 'none', ...attributes });

  return {
    halo: outlined
      ? draw({
        class: 'cf-wire-outline',
        stroke: wireOutline(ink.stroke, theme.palette.plate),
        'stroke-width': WIRE_WIDTH + OUTLINE_MARGIN,
        'stroke-linecap': 'round',
        'pointer-events': 'none',
      })
      : '',
    line: draw(ink),
  };
}

/**
 * 跨ぎを入れた道筋。**近すぎる跨ぎは 1 つにまとめる** — 弧が前の弧の中から
 * 始まると線が折り返して見え、跨ぎのつもりが結び目になる。
 *
 * 半径は穴の真上かどうかで決める (`HOP_OVER_HOLE`)。**膨らむ向きは線の向きに
 * よらず揃える** — 横寄りの線は上へ、縦寄りの線は右へ。書いた端の順で上下が
 * 入れ替わると、同じ形の交差が別物に見える。
 */
function hopPath(from: Point, to: Point, hops: readonly Point[], layout: Layout): string | null {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return null;

  const unit = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
  const at = (along: number) =>
    `${num(from.x + unit.x * along)} ${num(from.y + unit.y * along)}`;

  // 弧の向き (sweep=1 は進行方向の左、画面では横へ進むと上へ膨らむ)。
  const sweep = (Math.abs(unit.x) >= Math.abs(unit.y) ? unit.x > 0 : unit.y > 0) ? 1 : 0;

  const spans = hops
    .map((hop) => ({
      along: (hop.x - from.x) * unit.x + (hop.y - from.y) * unit.y,
      radius: isOverHole(layout, hop) ? HOP_OVER_HOLE : HOP,
    }))
    .sort((one, other) => one.along - other.along)
    .reduce<readonly { readonly start: number; readonly end: number }[]>((kept, { along, radius }) => {
      const span = { start: Math.max(0, along - radius), end: Math.min(length, along + radius) };
      const last = kept[kept.length - 1];
      return last !== undefined && span.start <= last.end
        ? [...kept.slice(0, -1), { start: last.start, end: Math.max(last.end, span.end) }]
        : [...kept, span];
    }, []);

  const drawn = spans
    .map((span) => ` L ${at(span.start)} A ${num((span.end - span.start) / 2)} ${num((span.end - span.start) / 2)} 0 0 ${sweep} ${at(span.end)}`)
    .join('');

  return `M ${at(0)}${drawn} L ${at(length)}`;
}

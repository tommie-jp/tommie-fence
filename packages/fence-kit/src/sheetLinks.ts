/**
 * 枚をまたぐ線 (`links:`) を、積んだ図の上に描く (52 の docs/118 の 4)。
 *
 * **線は基板の脇の通り道を通す。** 穴から横へ基板の外まで出し、図の左か右の
 * 通り道を縦に走って、相手の枚の穴へ横から入る。枚の間の隙間を縦に抜けると、
 * 上の枚の下に出す部品表・半田面の上を線が横切る。
 *
 * **基板を出た所に札を付ける。** 札には行き先 (`→ LED.VCC`) を書く。線を目で
 * たどらなくても、その穴から出た線がどこへ行くかが読める。
 *
 * 盤面には依らない。各フェンスは節点の名前 → 枚の中の座標 (`anchors`) と、
 * 線の太さ・字の大きさ (`LinkLook`) を渡すだけ。
 */
import { element } from './markup.ts';
import { num, svgText } from './svg.ts';
import { textWidth } from './textFit.ts';
import { DEFAULT_WIRE_COLOR, wireColor } from './colors.ts';

export type SheetPoint = { readonly x: number; readonly y: number };

/** 線と札の描き方。先頭の枚のテーマから取る。 */
export type LinkLook = {
  /** 線の太さ (枚の座標の単位)。 */
  readonly wire: number;
  /** 線の縁取りの色。基板と見分けるため全部の線を縁取る。 */
  readonly outline: string;
  /** 札の字の色。 */
  readonly ink: string;
  /** 札の地の色。 */
  readonly paper: string;
  readonly textSize: number;
  /** 白黒の図。線を字の色 1 色で描く。 */
  readonly mono: boolean;
};

/** 1 本の線の端。`point` は枚 `sheet` の中の座標 (その枚の viewBox の単位)。 */
export type StackLinkEnd = { readonly sheet: number; readonly point: SheetPoint; readonly tag: string };
export type StackLink = { readonly ends: readonly StackLinkEnd[]; readonly color: string };

/** 札の字の左右の余白。 */
const TAG_PAD = 4;
/** 札と枚の縁の間。 */
const TAG_GAP = 6;
/** 札の外側から最初の通り道まで。 */
const LANE_START = 10;
/** 通り道どうしの間。線の太さ (4) と縁取りに、隙間が見える幅を足す。 */
const LANE_GAP = 10;
/** 一番外の通り道と画布の縁の間。 */
const EDGE = 10;

const GROUND = /^(?:-|−)|^(?:a|d|p)?gnd$|^(?:0v|vss|ground|com)$/i;
const POWER = /^\+|^(?:vcc|vdd|vin|vbus|vbat|v\+|3v3|\d+(?:\.\d+)?v\d*)$/i;

/**
 * 色を書かなかった線の色。**赤は + だけ、黒は GND だけ** (breadboard-wiring の流儀)。
 * それ以外は配線の既定の色。
 */
export function linkColorOf(names: readonly string[]): string {
  if (names.length > 0 && names.every((name) => GROUND.test(name))) return wireColor('black') ?? DEFAULT_WIRE_COLOR;
  if (names.length > 0 && names.every((name) => POWER.test(name))) return wireColor('red') ?? DEFAULT_WIRE_COLOR;
  return DEFAULT_WIRE_COLOR;
}

export type PlacedFrame = {
  /** 積んだ図での枚の上端。 */
  readonly top: number;
  readonly width: number;
  /** 枚の座標 → 積んだ図の座標の倍率 (`style: width:` で縮めた枚)。 */
  readonly scaleX: number;
  readonly scaleY: number;
};

type Side = 'left' | 'right';
type Leg = { readonly x: number; readonly y: number; readonly tag: string };
type Routed = { readonly side: Side; readonly legs: readonly Leg[]; readonly color: string };

/** 左右の通り道に要る幅と、線の組み立て。`stackSheets` が枚を置く前に使う。 */
export type LinkPlan = {
  /** 枚を右へずらす量 (左の通り道のぶん)。 */
  readonly left: number;
  /** 枚の右に足す幅。 */
  readonly right: number;
  /** 枚を `left` だけずらした後に描く SVG。 */
  readonly draw: (sheetsWidth: number) => string;
};

const tagWidth = (tag: string, look: LinkLook): number => textWidth(tag) * look.textSize + TAG_PAD * 2;

/** 1 本の線を、左右のどちらの通り道へ出すか。**基板の上を横切る長さの合計が短いほう。** */
function sideOf(legs: readonly Leg[], width: number): Side {
  const left = legs.reduce((sum, leg) => sum + leg.x, 0);
  const right = legs.reduce((sum, leg) => sum + (width - leg.x), 0);
  return left <= right ? 'left' : 'right';
}

/** 通り道の幅。線が無ければ 0。 */
function bandWidth(routed: readonly Routed[], look: LinkLook): { readonly tags: number; readonly total: number } {
  if (routed.length === 0) return { tags: 0, total: 0 };
  const tags = Math.max(...routed.flatMap((one) => one.legs.map((leg) => tagWidth(leg.tag, look)))) + TAG_GAP;
  return { tags, total: tags + LANE_START + (routed.length - 1) * LANE_GAP + EDGE };
}

export function planLinks(
  links: readonly StackLink[],
  frames: readonly PlacedFrame[],
  look: LinkLook,
): LinkPlan {
  const width = Math.max(0, ...frames.map((frame) => frame.width));
  const routed = links.flatMap((link): Routed[] => {
    const legs = link.ends.flatMap((end): Leg[] => {
      const frame = frames[end.sheet];
      if (frame === undefined) return [];
      return [{ x: end.point.x * frame.scaleX, y: frame.top + end.point.y * frame.scaleY, tag: end.tag }];
    });
    if (legs.length < 2) return [];
    return [{ side: sideOf(legs, width), legs, color: look.mono ? look.ink : link.color }];
  });
  // **短い線を内側の通り道に。** 長い線が外を回れば、内側の線の脚を跨がずに済むことが多い。
  const span = (one: Routed): number => Math.max(...one.legs.map((leg) => leg.y)) - Math.min(...one.legs.map((leg) => leg.y));
  const ofSide = (side: Side): Routed[] => routed.filter((one) => one.side === side).sort((a, b) => span(a) - span(b));
  const lefts = ofSide('left');
  const rights = ofSide('right');
  const leftBand = bandWidth(lefts, look);
  const rightBand = bandWidth(rights, look);
  const shift = leftBand.total;

  const draw = (sheetsWidth: number): string => {
    const laneX = (side: Side, lane: number): number => (side === 'left'
      ? shift - leftBand.tags - LANE_START - lane * LANE_GAP
      : shift + sheetsWidth + rightBand.tags + LANE_START + lane * LANE_GAP);
    const lines = [...lefts.map((one, lane) => ({ one, x: laneX('left', lane) })),
      ...rights.map((one, lane) => ({ one, x: laneX('right', lane) }))];
    const pathOf = (one: Routed, x: number): string => {
      const ys = one.legs.map((leg) => leg.y);
      const legs = one.legs.map((leg) => `M${num(shift + leg.x)} ${num(leg.y)}H${num(x)}`).join('');
      return `${legs}M${num(x)} ${num(Math.min(...ys))}V${num(Math.max(...ys))}`;
    };
    const strokes = lines.map(({ one, x }) => {
      const d = pathOf(one, x);
      return element('path', {
        d, fill: 'none', stroke: look.outline, 'stroke-width': num(look.wire + 2), 'stroke-linejoin': 'round',
      }) + element('path', {
        d, fill: 'none', stroke: one.color, 'stroke-width': num(look.wire), 'stroke-linejoin': 'round',
      });
    }).join('');
    // 穴の印 (線の出る所) と、通り道の途中で枝が分かれる所の点。
    const dots = lines.map(({ one, x }) => {
      const ys = one.legs.map((leg) => leg.y);
      const [low, high] = [Math.min(...ys), Math.max(...ys)];
      const holes = one.legs.map((leg) => element('circle', {
        cx: num(shift + leg.x), cy: num(leg.y), r: num(look.wire), fill: one.color, stroke: look.outline, 'stroke-width': 1,
      }));
      const tees = one.legs.filter((leg) => leg.y > low && leg.y < high).map((leg) => element('circle', {
        cx: num(x), cy: num(leg.y), r: num(look.wire), fill: one.color,
      }));
      return [...holes, ...tees].join('');
    }).join('');
    const tags = lines.flatMap(({ one }) => one.legs.map((leg) => {
      const w = tagWidth(leg.tag, look);
      const h = look.textSize * 1.5;
      const x = one.side === 'left' ? shift - TAG_GAP - w : shift + sheetsWidth + TAG_GAP;
      return element('rect', {
        x: num(x), y: num(leg.y - h / 2), width: num(w), height: num(h), rx: 3,
        fill: look.paper, stroke: one.color, 'stroke-width': 1.5,
      }) + svgText(x + w / 2, leg.y + look.textSize * 0.35, leg.tag, { fill: look.ink, 'font-size': num(look.textSize) });
    })).join('');
    return lines.length === 0 ? '' : element('g', { 'data-sheet-links': String(lines.length) }, strokes + dots + tags);
  };

  return { left: shift, right: rightBand.total, draw };
}

import { NO_TURN } from './orient.ts';
import type { Turn } from './orient.ts';
import type { Address, Board } from '../types.ts';
import { isEdgeMount, isThreeLead, isTwoLead } from './types.ts';
import { lookupBoardPart } from 'fence-kit';

/**
 * 部品の形。**何個の穴を書くか**と、**足がどこに来るか**の 2 つを決める。
 *
 * 2 本足と 3 本足は**書かれた穴がそのまま足**。実物の足は曲げられるので、
 * 列に並べても三角に開いても挿さり、どちらで書いたかは図に出したい。
 *
 * DIP と SIP は**アンカー 1 つだけ書く**。足の位置はパッケージが決めていて、
 * 書く人が選べないため — 16 個の穴を書かせるのは、選べないものを書かせること。
 *
 * 端面実装のコネクタ (`sma/*-edge`) は **3 本足** — 中心導体と、凹の両端の先端。
 * 実物の凹は板の縁を上下から挟み、半田付けするのは腕の先端の 2 点で、
 * 中心導体の行ではなくその上下の行の銅箔に来る。2 本足のまま中心線に足を
 * 書かせると、アースの穴が中心導体の真下に埋まって信号線とつながって見えた。
 * **先端は片方だけ書けばよい** — 凹は 1 つの金物で、書かなかったほうは
 * 中心線を挟んで反対側に決まる (`pinsOf` が補う)。
 */

export type FootprintKind = 'two-lead' | 'three-lead' | 'edge' | 'dip' | 'sip' | 'board';

export type Footprint = {
  readonly kind: FootprintKind;
  /** 足の数。 */
  readonly pins: number;
  /** フェンスに書く穴の数。 */
  readonly holes: number;
  /** 省いてよい足があるとき、書く穴の最小の数。無ければ `holes` と同じ。 */
  readonly minHoles?: number;
};

/** DIP の 2 列の間隔 (穴の数)。300 mil = 7.62mm = 3 ピッチ。 */
export const DIP_ROW_SPAN = 3;

/**
 * マイコンボードの 2 列の間隔 (穴の数)。Pico は 0.7 インチ = 17.78mm = 7 ピッチ。
 * **DIP と同じ並べ方で、間隔だけが違う** — 1 番が左上、右へ数えて折り返す。
 */
export const BOARD_ROW_SPAN = 7;

const DIP = /^dip([0-9]{1,2})$/;
const SIP = /^sip([0-9]{1,2})$/;

const DIP_MIN_PINS = 4;
const DIP_MAX_PINS = 40;
/** 1 本のヘッダは部品として意味を持たない。上限は dip に合わせる。 */
const SIP_MIN_PINS = 2;
const SIP_MAX_PINS = 40;

/** 種類から形を引く。置けない種類は null。**姿で足の数が変わる**のは端面実装だけ。 */
export function footprintOf(type: string, variant: string | null = null): Footprint | null {
  if (isEdgeMount(type, variant)) return { kind: 'edge', pins: 3, holes: 3, minHoles: 2 };

  // マイコンボード。**表は fence-kit と共有** (どのボードに何番のピンがあるかは
  // 板に依らない)。並べ方は DIP と同じで、列の間隔だけが広い。
  const board = lookupBoardPart(type);
  if (board !== null) return { kind: 'board', pins: board.pins.length, holes: 1 };

  if (isTwoLead(type)) return { kind: 'two-lead', pins: 2, holes: 2 };
  if (isThreeLead(type)) return { kind: 'three-lead', pins: 3, holes: 3 };

  const dip = DIP.exec(type);
  if (dip) {
    const pins = Number(dip[1]);
    // 奇数の DIP は無い (2 列に分かれる)。
    if (pins >= DIP_MIN_PINS && pins <= DIP_MAX_PINS && pins % 2 === 0) {
      return { kind: 'dip', pins, holes: 1 };
    }
    return null;
  }

  const sip = SIP.exec(type);
  if (sip) {
    const pins = Number(sip[1]);
    if (pins >= SIP_MIN_PINS && pins <= SIP_MAX_PINS) return { kind: 'sip', pins, holes: 1 };
  }
  return null;
}

/**
 * 書かれた穴から足の位置を出す。
 *
 * DIP は**パッケージの番号の付き方どおり**に反時計回り — pin 1 が左上、
 * そこから右へ数えて、折り返して下の列を左へ戻る。実物のノッチと同じ向きで、
 * ここを変えるとデータシートのピン番号と図が食い違う。
 */
/**
 * アンカーからの相対位置を、書かれた向きに回す。
 *
 * **反転してから回す** (circuit と同じ意味。52 の docs/11)。板は行が下へ、
 * 列が右へ増えるので、時計回りは (行, 列) → (列, -行)。
 * 反転は**左右**なので、列の符号だけが変わる。
 */
function turned(offset: { readonly row: number; readonly col: number }, turn: Turn) {
  const mirrored = turn.mirror ? { row: offset.row, col: -offset.col } : offset;
  const times = turn.rotate / 90;
  return Array.from({ length: times }).reduce(
    (spun: { readonly row: number; readonly col: number }) => ({ row: spun.col, col: -spun.row }),
    mirrored,
  );
}

export function pinsOf(
  footprint: Footprint,
  holes: readonly Address[],
  board: Pick<Board, 'cols' | 'rows'> | null = null,
  turn: Turn = NO_TURN,
): readonly Address[] {
  const anchor = holes[0];
  if (!anchor) return [];

  if (footprint.kind === 'two-lead' || footprint.kind === 'three-lead') {
    return holes.slice(0, footprint.pins);
  }

  if (footprint.kind === 'edge') {
    const [, tip, other] = holes;
    if (tip === undefined) return [anchor];
    if (other !== undefined || board === null) return holes.slice(0, footprint.pins);
    const mirrored = mirroredTip(anchor, tip, board);
    return mirrored === null ? [anchor, tip] : [anchor, tip, mirrored];
  }

  // **アンカーは動かさない。** 回しても 1 番ピンの穴はそのままで、
  // 残りがその周りを回る (動かすと「回す」が「移動」になる)。
  const at = (offset: { readonly row: number; readonly col: number }): Address => {
    const spun = turned(offset, turn);
    return { row: anchor.row + spun.row, col: anchor.col + spun.col };
  };

  if (footprint.kind === 'sip') {
    return Array.from({ length: footprint.pins }, (_, index) => at({ row: 0, col: index }));
  }

  const span = footprint.kind === 'board' ? BOARD_ROW_SPAN : DIP_ROW_SPAN;
  const perSide = footprint.pins / 2;
  const top = Array.from({ length: perSide }, (_, index) => at({ row: 0, col: index }));
  const bottom = Array.from({ length: perSide }, (_, index) =>
    at({ row: span, col: perSide - 1 - index }));
  return [...top, ...bottom];
}

/** 端面実装のコネクタが載る辺。 */
export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * 端面実装のコネクタが**どの辺に載っているか**。中心導体から一番近い縁で決める —
 * ただし**先端が中心導体より外側にある辺だけ**を候補にする。板の角に近い
 * コネクタで左右と上下が同じ距離になっても、先端の側で決まる。
 *
 * 足どうしを結んだ線で決めないのは、先端が中心線の上下 (左右) にあるので、
 * その線は必ず斜めになるため (`placement/geometry.ts` の `edgeMountOf` と同じ理由)。
 * 決められないときは null (先端が中心導体と同じ穴など)。
 */
export function edgeSideOf(
  centre: Address,
  tip: Address,
  board: Pick<Board, 'cols' | 'rows'>,
): EdgeSide | null {
  const candidates: readonly (readonly [EdgeSide, number, boolean])[] = [
    ['left', centre.col - 1, tip.col < centre.col],
    ['right', board.cols - centre.col, tip.col > centre.col],
    ['top', centre.row - 1, tip.row < centre.row],
    ['bottom', board.rows - centre.row, tip.row > centre.row],
  ];
  const outward = candidates.filter(([, , faces]) => faces);
  if (outward.length === 0) return null;
  return outward.reduce((best, one) => (one[1] < best[1] ? one : best))[0];
}

/**
 * 書かれた先端の、中心線を挟んだ反対側。**辺に沿った向きに写す** — 左右の縁なら
 * 行を、上下の縁なら列を裏返す。先端が中心線の上に乗っていれば写しようが
 * 無いので null (置く側が断る)。
 */
export function mirroredTip(
  centre: Address,
  tip: Address,
  board: Pick<Board, 'cols' | 'rows'>,
): Address | null {
  const side = edgeSideOf(centre, tip, board);
  if (side === null) return null;

  const acrossRows = side === 'left' || side === 'right';
  if (acrossRows ? tip.row === centre.row : tip.col === centre.col) return null;
  return acrossRows
    ? { row: 2 * centre.row - tip.row, col: tip.col }
    : { row: tip.row, col: 2 * centre.col - tip.col };
}


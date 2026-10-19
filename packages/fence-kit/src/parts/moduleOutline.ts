import { element } from '../markup.ts';
import { num } from '../svg.ts';
import { chipAlongX } from './chips.ts';
import type { ChipBox, ChipPoint } from './chips.ts';
import { darkenColor } from './plateColor.ts';

/**
 * 1 列のヘッダに載った**モジュールの外形** (秋月の LAN コネクターDIP化キットのように、
 * 変換基板の一辺の縁にヘッダが出て、基板の上に胴が載る部品)。ヘッダだけを描くと、
 * 胴がどちらへ張り出すのかが図から読めない (52 の 05-etc 第 5 章)。
 *
 * 寸法は mm。**基板はデータシートの外形**、胴 (ジャック) は写真から取った目安。
 */
export type ModuleOutline = {
  /** 基板の長さ (ヘッダの列に沿う向き) と幅 (列を横切る向き)。 */
  readonly along: number;
  readonly across: number;
  /** ヘッダの列の中心線から、基板の手前の縁までの距離。 */
  readonly inset: number;
  /** 胴。列に沿う長さと、列の中心線から測った手前と奥 (奥が基板の縁を越えれば張り出す)。 */
  readonly jack: { readonly along: number; readonly from: number; readonly to: number };
  /** 胴に刷る字。 */
  readonly mark: string;
};

/** 2.54 mm が 1 ピッチ。 */
const MM_PER_PITCH = 2.54;
/** 胴の口 (奥の端) を濃く塗る幅 (mm)。どちらが口かを見せる。 */
const MOUTH = 2;
const BOARD_FILL = '#2f7d4f';
const BOARD_EDGE = '#1d5434';
const JACK_FILL = '#c9cdd3';
const JACK_EDGE = '#7a8089';
const MOUTH_FILL = '#3a3f47';
const MARK_INK = '#3a3f47';
/** 胴に刷る字の大きさ (ピッチに対する比)。 */
const MARK_FONT = 0.45;
/** 下の穴と線が透けて見える濃さ。胴の下に配線は通らないが、どの穴に挿したかは読めるように。 */
const OPACITY = 0.55;

type Frame = {
  /** 列に沿う向きの中心 (px) と、列の中心線の位置 (px)。 */
  readonly centre: number;
  readonly line: number;
  readonly alongX: boolean;
  readonly scale: number;
};

const frameOf = (points: readonly ChipPoint[], pitch: number): Frame => {
  const alongX = chipAlongX(points);
  const along = points.map((point) => (alongX ? point.x : point.y));
  const across = points.map((point) => (alongX ? point.y : point.x));
  return {
    centre: (Math.min(...along) + Math.max(...along)) / 2,
    line: across.reduce((sum, value) => sum + value, 0) / across.length,
    alongX,
    scale: pitch / MM_PER_PITCH,
  };
};

/**
 * 列に沿う長さ `length` (mm) と、中心線から `side` の向きへ測った `[near, far]` (mm) の矩形。
 * `near` が負なら中心線の反対側まで回り込む (基板の手前の縁)。
 */
function slab(frame: Frame, side: 1 | -1, length: number, near: number, far: number): ChipBox {
  const half = (length * frame.scale) / 2;
  const a = frame.line + side * near * frame.scale;
  const b = frame.line + side * far * frame.scale;
  const lo = Math.min(a, b);
  const span = Math.abs(b - a);
  return frame.alongX
    ? { x: frame.centre - half, y: lo, width: half * 2, height: span }
    : { x: lo, y: frame.centre - half, width: span, height: half * 2 };
}

/**
 * モジュールの外形 (基板と胴を合わせた矩形)。**当たり判定と画布の広さもこれで測る**。
 * `side` は張り出す向き: 横に寝た列なら +1 が下、縦の列なら +1 が右 (SIP のピンの名前と同じ約束)。
 */
export function moduleBox(points: readonly ChipPoint[], pitch: number, side: 1 | -1, outline: ModuleOutline): ChipBox {
  const frame = frameOf(points, pitch);
  const board = slab(frame, side, outline.along, -outline.inset, outline.across - outline.inset);
  const jack = slab(frame, side, outline.jack.along, outline.jack.from, outline.jack.to);
  const x0 = Math.min(board.x, jack.x);
  const y0 = Math.min(board.y, jack.y);
  return {
    x: x0, y: y0,
    width: Math.max(board.x + board.width, jack.x + jack.width) - x0,
    height: Math.max(board.y + board.height, jack.y + jack.height) - y0,
  };
}

/**
 * 張り出す向き。**列の両脇のうち、基板の縁に近い側** — 実物は胴の口を基板の外へ向けて挿す
 * (逆に挿すと胴が基板の部品の上に被さる)。両脇が同じ近さなら -1 (上か左)。
 */
export function moduleSide(points: readonly ChipPoint[], board: ChipBox): 1 | -1 {
  if (points.length === 0) return -1;
  const alongX = chipAlongX(points);
  const line = points.reduce((sum, point) => sum + (alongX ? point.y : point.x), 0) / points.length;
  const low = alongX ? board.y : board.x;
  const high = alongX ? board.y + board.height : board.x + board.width;
  return high - line < line - low ? 1 : -1;
}

export type ModuleOutlineOptions = {
  readonly points: readonly ChipPoint[];
  readonly pitch: number;
  readonly side: 1 | -1;
  readonly outline: ModuleOutline;
  /** キットの基板の色 (部品の行の末尾に書いた色)。書かなければ実物の緑。縁は塗りから作る。 */
  readonly plate?: string;
};

/**
 * モジュールの基板 (既定は緑、`plate` を書けばその色) と胴 (銀、口の端を濃く)。**ヘッダより先に描く** — ヘッダのピンと
 * 名前が上に載り、どの穴に挿したかが読める。半透明なのは同じ理由。
 */
export function drawModuleOutline(options: ModuleOutlineOptions): string {
  const { points, pitch, side, outline, plate } = options;
  if (points.length === 0) return '';
  const frame = frameOf(points, pitch);
  const rect = (box: ChipBox, name: string, fill: string, stroke: string | null): string => element('rect', {
    class: name, x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height),
    fill, ...(stroke === null ? {} : { stroke }), 'fill-opacity': OPACITY, rx: 2,
  });
  const board = slab(frame, side, outline.along, -outline.inset, outline.across - outline.inset);
  const jack = slab(frame, side, outline.jack.along, outline.jack.from, outline.jack.to);
  const mouth = slab(frame, side, outline.jack.along, outline.jack.to - MOUTH, outline.jack.to);
  const size = pitch * MARK_FONT;
  const mark = element('text', {
    class: 'module-mark',
    x: num(jack.x + jack.width / 2), y: num(jack.y + jack.height / 2),
    'font-size': num(size), 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: MARK_INK,
    ...(frame.alongX ? {} : { transform: `rotate(-90 ${num(jack.x + jack.width / 2)} ${num(jack.y + jack.height / 2)})` }),
  }, outline.mark);
  return rect(board, 'module-board', plate ?? BOARD_FILL, plate === undefined ? BOARD_EDGE : darkenColor(plate))
    + rect(jack, 'module-jack', JACK_FILL, JACK_EDGE)
    + rect(mouth, 'module-mouth', MOUTH_FILL, null)
    + mark;
}

import {
  DEFAULT_LED_COLOR, bandColor, element, fit, ledColor, num, parseOhms, resistorBandColors, svgText,
} from 'fence-kit';
import { LIMITS, clampText } from '../limits.ts';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import type { Theme } from './theme.ts';

const LEAD_WIDTH = 2;
/** 胴の高さ。ピッチ (20) の中に収まる太さ。 */
const BODY_HEIGHT = 11;
/** 胴が穴に掛からないよう、両端から詰める幅。 */
const BODY_INSET = 9;
/** キャプションを胴のどれだけ下に置くか。 */
const CAPTION_DROP = 14;
/** カラーコードの帯の幅と、胴の端から空ける幅。 */
const BAND_WIDTH = 3;
const BAND_MARGIN = 2;

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 図に出す名前と値。値が無ければ名前だけ。 */
const caption = (part: PlacedPart): string =>
  part.value === null ? part.id : `${part.id} ${clampText(part.value, LIMITS.labelLength)}`;

/**
 * 板からはみ出す字を切る。使える幅は**中央から近いほうの板の端まで**の 2 倍。
 *
 * `limits.ts` が切っているのは**文字数** (60) で、幅ではない。切らずに置くと
 * viewBox の外へ出て**黙って消える**ので、読む側は切れたことにも気づけない
 * (breadboard が同じ穴を踏んでいる)。切った跡を `…` で残すのはそちらと同じ約束。
 *
 * 画布ではなく板を境にするのは、字が画布の縁に貼り付くと読みにくいため。
 */
function fitToBoard(text: string, x: number, fontSize: number, layout: Layout): string {
  const { board } = layout;
  const room = Math.min(x - board.x, board.x + board.width - x) * 2;
  return fit(text, Math.max(0, room) / fontSize);
}

/**
 * 抵抗の胴。値が抵抗として読めるときだけカラーコードを塗る。
 * **読めない値で帯を描かない** — 実物と違う帯は、図を信じた人を間違えさせる。
 */
function resistorBody(part: PlacedPart, width: number, theme: Theme): string {
  const shell = element('rect', {
    x: num(-width / 2), y: num(-BODY_HEIGHT / 2), width: num(width), height: BODY_HEIGHT,
    rx: 4, fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

  const ohms = part.value === null ? null : parseOhms(part.value);
  const bands = ohms === null ? null : resistorBandColors(ohms);
  if (bands === null) return shell;

  // **帯は胴の幅に比例させる。** 間隔を決め打つと、隣り合う穴に挿した短い部品で
  // 帯が胴から出て、板の地や隣の穴の上に乗る。
  const inner = width - BAND_MARGIN * 2;
  const bandWidth = Math.min(BAND_WIDTH, inner / (bands.length * 2));
  const step = (inner - bandWidth) / (bands.length - 1);
  const stripes = bands
    .map((name, index) => element('rect', {
      x: num(-width / 2 + BAND_MARGIN + index * step), y: num(-BODY_HEIGHT / 2 + 1),
      width: num(bandWidth), height: BODY_HEIGHT - 2, fill: bandColor(name),
    }))
    .join('');
  return shell + stripes;
}

/** LED の玉。色は書かれた値から引き、知らない色でも既定で描く (足の位置は変わらない)。 */
const ledBody = (part: PlacedPart): string =>
  element('circle', {
    cx: 0, cy: 0, r: num(BODY_HEIGHT / 2 + 1),
    fill: (part.value === null ? null : ledColor(part.value)) ?? DEFAULT_LED_COLOR,
    stroke: '#00000033', 'stroke-width': 1,
  });

const genericBody = (width: number, theme: Theme): string =>
  element('rect', {
    x: num(-width / 2), y: num(-BODY_HEIGHT / 2), width: num(width), height: BODY_HEIGHT,
    rx: 3, fill: theme.palette.body, stroke: theme.palette.bodyEdge, 'stroke-width': 1,
  });

const bodyOf = (part: PlacedPart, width: number, theme: Theme): string => {
  if (part.type === 'resistor') return resistorBody(part, width, theme);
  if (part.type === 'led') return ledBody(part);
  return genericBody(width, theme);
};

/**
 * 2 本足の部品。**胴は 2 つの穴を結ぶ線の上に、その傾きのまま描く**ので、
 * 各部品の形は「原点が中央・x 軸が足の向き」の座標で書けばよい。
 */
function renderTwoLead(part: PlacedPart, layout: Layout, theme: Theme): string {
  const [first, second] = part.pins;
  if (!first || !second) return '';

  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const width = Math.max(span - BODY_INSET * 2, BODY_HEIGHT);

  const lead = element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: theme.palette.lead, 'stroke-width': LEAD_WIDTH,
  });
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  const body = element(
    'g',
    { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` },
    bodyOf(part, width, theme),
  );
  const text = fitToBoard(caption(part), center.x, theme.metrics.textSize, layout);
  const label = svgText(center.x, center.y + CAPTION_DROP, text, {
    fill: theme.palette.caption,
    'font-size': num(theme.metrics.textSize),
    halo: theme.palette.plate,
  });

  return `${lead}${body}${label}`;
}

export const renderParts = (parts: readonly PlacedPart[], layout: Layout, theme: Theme): string =>
  parts.map((part) => renderTwoLead(part, layout, theme)).join('');

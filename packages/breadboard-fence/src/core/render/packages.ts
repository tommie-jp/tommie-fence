import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import {
  CAPTION_CLEAR, NAME_CAP, NAME_LINE, caption, captionAt, captionTextWidth, charWidth, fitToBoard, haloWidth, partLabel, pinPoints,
  pointOfPin,
} from './partCommon.ts';
import type { CaptionSpot } from './partCommon.ts';
import { insertionDotRadius } from './wires.ts';
import { isWideDip } from '../parts/wide.ts';
import { element, num } from './svg.ts';
import {
  REAL_INK, dipChip, drawDipAdapter, drawModuleOutline, drawNamedChip, drawSipAdapter, lookupNamedChip, lookupPinout, plateLook, sipBox, sipHeader,
  transformerCore,
} from 'fence-kit';
import { plateInkOf, plateOf } from './plate.ts';
import type { ChipInk, SipLook } from 'fence-kit';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/** fence-kit のパッケージに渡す色。**基板ではなく部品の色**を集めたもの。 */
export function chipInk(theme: RenderTheme): ChipInk {
  return {
    body: theme.palette.chipBody,
    pin: theme.palette.chipPin,
    chipText: theme.palette.chipText,
    plate: theme.palette.plate,
    outside: theme.palette.partText,
    halo: theme.palette.textHalo,
    haloWidth: haloWidth(theme),
  };
}

/** ピンの上に置くピンの跡。 */
const stub = (point: Point, fill: string, dy = -3): string =>
  element('rect', { x: num(point.x - 3), y: num(point.y + dy), width: 6, height: 6, fill });

/**
 * DIP パッケージ。**姿は fence-kit にある** (`parts/chips.ts`) — 実物の
 * パッケージの話で基板に依らないので、perfboard と同じ絵になる
 * (実機で「全ての部品の見た目を breadboard と perfboard で共通にする」)。
 * ここに残るのは基板の話 — ピンの点と、切り欠きを向ける先。
 */
export function renderDip(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  // **`pins[0]` は 1 番ピンとは限らない** — 升の並びは固定で、回すと名前のほうが
  // 巡る (`placement/place.ts` の spun)。だから名前で引く。
  const pinOne = part.pins.findIndex((pin) => (pin.number ?? pin.name) === '1');
  // **名前で呼ぶ DIP は番号と名前の 2 段** (52 の docs/95)。刷る名前は表の印字
  // (呼び名が番号になった `NC` も `NC` と刷る)。
  // 名前で呼ぶかは置いたとき (`placeDip`) に決まっている — ピンが番号を持つか。
  const printed = part.pins.some((pin) => pin.number !== undefined) && lookupNamedChip(part.type, part.variant) === null
    ? lookupPinout(part.value ?? part.label, part.pins.length)
    : null;
  const options = {
    points,
    names: printed === null
      ? part.pins.map((pin) => pin.name)
      : part.pins.map((pin) => printed.names[Number(pin.number) - 1] ?? pin.name),
    ...(printed === null ? {} : { numbers: part.pins.map((pin) => pin.number ?? pin.name) }),
    pinOne: pinOne < 0 ? 0 : pinOne,
    pitch: layout.pitch,
    caption: caption(part),
    scale: textScale(theme),
    ink: chipInk(theme),
    // 幅広 (600 mil) は胴が 6 ピッチ奥行きなので、名前は胴の中に刷る (ピンの外は配線の通り道)。
    ...(isWideDip(part.variant) ? { namesInside: true } : {}),
  };
  // ピンに名前のある DIP 型 (リレー・フォトカプラ・7 セグ)。姿は品名なので、
  // 変換基板の道へは行かせない (52 の docs/66)。
  const named = lookupNamedChip(part.type, part.variant);
  if (named !== null) return drawNamedChip({ ...options, chip: named });
  // 面実装しか無い型番 (3SK291) は、変換基板に載せた実寸の胴で描く。
  const paint = plateInkOf(part);
  const painted = paint === null ? {} : { paint };
  if (printed?.chip !== undefined) return drawDipAdapter({ ...options, chip: printed.chip, label: part.id, ...painted });
  // 姿があれば DIP 化した変換基板 (`dip8/sop`)。外形は DIP と同じ。
  return part.variant === null || isWideDip(part.variant) ? dipChip(options) : drawDipAdapter({ ...options, variant: part.variant, ...painted });
}

export function sipBarRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return sipBox(points, layout.pitch);
}

/**
 * 1 列に並んだヘッダ。**姿は fence-kit にある** (`parts/chips.ts`)。
 * 基板の話として残るのは**ピン名をどちら側に出すか**と**名札の置き場**。
 * ピン名を出す先は溝の側: 盤の端には列番号が印字されていて、そこに重ねると両方読めなくなる。
 */
/** 型番が姿を持つ部品 (SFU455) なら、その樹脂の色。 */
const lookOf = (part: PlacedPart): { look?: SipLook } => {
  const pinout = lookupPinout(part.value ?? part.label, part.pins.length);
  // **色はモジュールなら基板に、1 列のモジュール (KY-040 など) なら胴に**。キットのヘッダ (銀の帯) は替えない。
  const plate = plateOf(part);
  const look = plate !== null && pinout?.module === undefined ? plateLook(plate) : pinout?.look;
  return look === undefined ? {} : { look };
};

/** 面実装しか無い型番 (3SK291) は、1 列の変換基板に載せた実寸の胴で描く。名札は基板のシルクに刷る。 */
const adapterChipOf = (part: PlacedPart) => lookupPinout(part.value ?? part.label, part.pins.length)?.chip;

/** キットの基板に渡す色 (書いていなければ渡さず、実物の緑)。 */
const plateOption = (part: PlacedPart): { plate?: string } => {
  const plate = plateOf(part);
  return plate === null ? {} : { plate };
};

const sipNameSide = (first: Point, layout: Layout): 1 | -1 => (first.y < layout.ravineY ? 1 : -1);

/**
 * ピンの名前が胴の縁から出る深さ。fence-kit の `sipLegends` と同じ寸法
 * (縁取りの半分 + 隙間 + 字の高さと深さ)。perfboard の `SIP_LEGEND_DEPTH` と同じ式。
 */
const sipLegendDepth = (theme: RenderTheme): number => 1 + 0.5 + textScale(theme) * 6.5 * (0.72 + 0.2);

/**
 * 1 列の部品の名札の置き場の候補。**胴には字を刷らない** (真ん中のピンの ○ と食い合う) ので
 * 胴の外に置く。先に試すのは 2 ピン・3 ピンと同じ胴の下 (ピンの名前が下にあれば、その下)。
 * 胴は 1 ピッチの幅があるので、下の行の部品に名札が乗りやすい — そのときは**胴の横**
 * (同じ行の右、次に左) へ逃がす (教科書のミキサーの FL1 が真下の R7 に重なった)。
 * 変換基板に載せた部品はシルクに刷るので候補なし。
 */
export function sipCaptionSpots(part: PlacedPart, layout: Layout, theme: RenderTheme, width: number): CaptionSpot[] {
  if (adapterChipOf(part) !== undefined) return [];
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return [];
  const bar = sipBox(points, layout.pitch);
  const cap = theme.metrics.textSize * NAME_CAP;
  const lying = points.every((point) => point.y === first.y);
  const namesBelow = lying && sipNameSide(first, layout) > 0;
  const top = bar.y + bar.height + (namesBelow ? sipLegendDepth(theme) : 0);
  const below = { x: bar.x + bar.width / 2, y: top + CAPTION_CLEAR + cap, width };
  if (!lying) return [below];
  const gap = CAPTION_CLEAR + haloWidth(theme) / 2;
  const middle = bar.y + bar.height / 2 + cap / 2;
  return [
    below,
    { x: bar.x + bar.width + gap + width / 2, y: middle, width },
    { x: bar.x - gap - width / 2, y: middle, width },
  ];
}

/** 候補の `slot` 番め。候補が尽きたら胴の下から 1 行ずつ下げる (`captionDrops` の段)。 */
export function sipCaptionAt(
  part: PlacedPart,
  layout: Layout,
  theme: RenderTheme,
  width: number,
  slot = 0,
): CaptionSpot | null {
  const spots = sipCaptionSpots(part, layout, theme, width);
  const below = spots[0];
  if (!below) return null;
  if (slot < spots.length) return spots[slot] ?? below;
  return { ...below, y: below.y + (slot - spots.length + 1) * theme.metrics.textSize * NAME_LINE };
}

/** 胴とピンの名前が占める外形 (書いて決めた名札 `cap=` はこの外に置く)。 */
export function sipExtent(part: PlacedPart, layout: Layout, theme: RenderTheme): Rect {
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return { x: 0, y: 0, width: 0, height: 0 };
  const bar = sipBox(points, layout.pitch);
  const side = sipNameSide(first, layout);
  if (points.every((point) => point.y === first.y)) {
    const depth = sipLegendDepth(theme);
    return { ...bar, y: side > 0 ? bar.y : bar.y - depth, height: bar.height + depth };
  }
  const longest = Math.max(0, ...part.pins.map((pin) => [...pin.name].length)) * charWidth(theme) + sipLegendDepth(theme);
  return { ...bar, x: side > 0 ? bar.x : bar.x - longest, width: bar.width + longest };
}

export function renderSip(part: PlacedPart, layout: Layout, theme: RenderTheme, slot = 0, spot: CaptionSpot | null = null): string {
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return '';

  const options = {
    points,
    names: part.pins.map((pin) => pin.name),
    pitch: layout.pitch,
    scale: textScale(theme),
    nameSide: sipNameSide(first, layout),
    ink: chipInk(theme),
  };
  const chip = adapterChipOf(part);
  const paint = plateInkOf(part);
  if (chip !== undefined) return drawSipAdapter({ ...options, chip, label: part.id, ...(paint === null ? {} : { paint }) });
  // **モジュール (キットの基板とジャック) は溝の側へ描く** — 実物もブレッドボードの穴の上に載り、
  // 盤の外へは出ない。ピンの名前は半透明の外形の上に縁取りつきで載る。ヘッダより先に描く。
  const outline = lookupPinout(part.value ?? part.label, part.pins.length)?.module;
  const module = outline === undefined ? '' : drawModuleOutline({ points, pitch: layout.pitch, side: options.nameSide, outline, ...plateOption(part) });
  // ピンの ○ は配線の端の粒と同じ大きさ (挿した所が同じ見え方になる)。
  const body = module + sipHeader({ ...options, ...lookOf(part), pinRadius: insertionDotRadius(theme) });
  // 書いて決めた名札 (`cap=`) は、配線よけと同じ答え (`explicitCaptionSpot`) の所へ置く。
  if (spot !== null) return body + captionAt(spot, caption(part), theme);
  // 名札は候補から選ぶ (段の番号は配線よけと同じ `captionDrops` の答え)。
  const at = sipCaptionAt(part, layout, theme, captionTextWidth(part, theme), slot);
  if (at === null) return body;
  const text = slot === 0 ? fitToBoard(caption(part), at.x, theme.metrics.textSize, layout) : caption(part);
  return body + partLabel(at.x, at.y, text, theme);
}

/** タクトスイッチの本体が覆う範囲 (ピッチに対する比)。6mm 角なので 2 列 + 溝ぶん。 */
const SWITCH_PAD_X = 0.45;
const SWITCH_PAD_Y = 0.4;

export function switchBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - SWITCH_PAD_X * layout.pitch;
  const x1 = Math.max(...xs) + SWITCH_PAD_X * layout.pitch;
  const y0 = Math.min(...ys) - SWITCH_PAD_Y * layout.pitch;
  const y1 = Math.max(...ys) + SWITCH_PAD_Y * layout.pitch;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * 溝をまたぐ 4 ピンのタクトスイッチ。**押していなくてもつながっているピンの組を線で描く**。
 * 実物では見えない結線だが、ここを知らずに同じ側の 2 本を使うと回路が最初から短絡する
 * (この図がいちばん防ぎたい間違い)。
 */
export function renderPushbutton(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  const { palette } = theme;
  const body = switchBodyRect(part, layout);
  const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };

  const shell = element('rect', {
    x: num(body.x), y: num(body.y), width: num(body.width), height: num(body.height), rx: 3,
    fill: palette.chipBody, stroke: '#14171c',
  });
  const bridges = part.bridges
    .map(([from, to]) => {
      const a = pointOfPin(part, from, layout);
      const b = pointOfPin(part, to, layout);
      return a && b
        ? element('line', {
            x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y),
            stroke: palette.chipPin, 'stroke-width': 2.4, 'stroke-opacity': 0.55,
          })
        : '';
    })
    .join('');
  const stubs = points.map((point) => stub(point, palette.chipPin)).join('');
  const button = element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(0.45 * layout.pitch),
    fill: '#c9cfd8', stroke: '#6b7280',
  });
  // **名前は胴の下。** 上に出していたが、ほかの部品と側が揃わなかった
  // (実機で「transformer, button* は名前を部品の下にする」)。
  const label = partLabel(
    center.x,
    body.y + body.height + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), center.x, theme.metrics.textSize, layout),
    theme,
  );

  return `${shell}${bridges}${stubs}${button}${label}`;
}

/**
 * 変圧器。**書かれた 4 つの穴を囲む箱**として描き、中身 (積層鉄心と巻線) は
 * fence-kit が描く — 実物の話で基板に依らないので、perfboard と同じ絵になる。
 *
 * ピンの並びを決め打たないのは、実物のピンの並びが品によって違うため。
 * どの穴に挿したかをそのまま図にする (2 ピン・3 ピンと同じ考え方)。
 */
export function renderTransformer(part: PlacedPart, layout: Layout, theme: RenderTheme, drop = 0): string {
  const rect = fourLeadBodyRect(part, layout);
  if (rect.width === 0) return '';

  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const core = element(
    'g',
    { transform: `translate(${num(centre.x)} ${num(centre.y)})` },
    transformerCore(rect.width, rect.height, REAL_INK),
  );
  const stubs = (pinPoints(part, layout) ?? []).map((point) => stub(point, theme.palette.chipPin)).join('');
  // **字は胴の下。** ほかの部品と側を揃える (実機で「名前を部品の下にする」)。
  const label = partLabel(
    centre.x,
    centre.y + rect.height / 2 + CAPTION_CLEAR + theme.metrics.textSize * NAME_CAP + drop,
    fitToBoard(caption(part), centre.x, theme.metrics.textSize, layout),
    theme,
  );
  return `${core}${stubs}${label}`;
}

/** 4 ピンを囲む箱。**配線をよける領域**と描画で同じ数字を使う。 */
export function fourLeadBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - FOUR_LEAD_PAD;
  const x1 = Math.max(...xs) + FOUR_LEAD_PAD;
  const y0 = Math.min(...ys) - FOUR_LEAD_PAD;
  const y1 = Math.max(...ys) + FOUR_LEAD_PAD;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** ピンの穴から胴の縁までの余白。実物もピンの外側に樹脂が回る。 */
const FOUR_LEAD_PAD = 6;

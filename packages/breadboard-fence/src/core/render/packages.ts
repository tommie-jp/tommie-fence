import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { caption, fitToBoard, partLabel, pinPoints, pointOfPin } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/** ピンの上に置く足の跡。 */
const stub = (point: Point, fill: string, dy = -3): string =>
  element('rect', { x: num(point.x - 3), y: num(point.y + dy), width: 6, height: 6, fill });

/** パッケージの幅からはみ出さないところまで字を詰める。 */
const fittedFontSize = (text: string, width: number, scale: number): number =>
  Math.min(scale * 9.5, (width - 14) / (text.length * 0.58));

export function renderDip(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const anchor = part.pins[0]?.address;
  const half = part.pins.length / 2;
  if (!anchor || anchor.kind !== 'hole') return '';

  const { palette } = theme;
  const scale = textScale(theme);
  const points = part.pins.map((pin) => (pin.address ? layout.point(pin.address) : { x: 0, y: 0 }));
  const anchorPoint = points[0]!;
  const oppositePoint = points[part.pins.length - 1]!;
  const farPoint = points[half - 1]!;

  const x0 = Math.min(anchorPoint.x, farPoint.x) - 0.45 * layout.pitch;
  const x1 = Math.max(anchorPoint.x, farPoint.x) + 0.45 * layout.pitch;
  const y0 = Math.min(anchorPoint.y, oppositePoint.y) - 5;
  const y1 = Math.max(anchorPoint.y, oppositePoint.y) + 5;

  const stubs = points.map((point) => stub(point, palette.chipPin, point.y < (y0 + y1) / 2 ? -1 : -5)).join('');

  const numbers = part.pins
    .map((pin, index) => {
      const point = points[index]!;
      const inward = point.y < (y0 + y1) / 2 ? 12 : -7;
      return svgText(point.x, point.y + inward, pin.name, { 'font-size': num(scale * 6.5), fill: palette.chipPin });
    })
    .join('');

  const shell = element('rect', {
    x: num(x0), y: num(y0), width: num(x1 - x0), height: num(y1 - y0), rx: 3,
    fill: palette.chipBody, stroke: '#14171c',
  });
  const notch = element('circle', { cx: num(x0), cy: num((y0 + y1) / 2), r: 4.5, fill: palette.plate });
  const text = caption(part);
  const label = svgText((x0 + x1) / 2, (y0 + y1) / 2 + 3.5, text, {
    'font-size': num(fittedFontSize(text, x1 - x0, scale)),
    fill: palette.chipText,
  });

  return `${stubs}${shell}${notch}${numbers}${label}`;
}

/** 1 列ヘッダの本体が覆う帯 (ピッチに対する比)。 */
const SIP_HALF_HEIGHT = 0.55;
const SIP_NAME_GAP = 9;
const SIP_NAME_FONT = 7;

export function sipBarRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const x0 = Math.min(...xs) - 0.5 * layout.pitch;
  const x1 = Math.max(...xs) + 0.5 * layout.pitch;
  const half = SIP_HALF_HEIGHT * layout.pitch;
  return { x: x0, y: first.y - half, width: x1 - x0, height: half * 2 };
}

/**
 * 1 列に並んだヘッダ。ヘッダ 1 列のモジュール (OLED や測距センサ) をこれで賄うので、
 * **ピン名は本体の外**に出す。どの穴が何なのかが、図の中だけで分かる必要がある。
 * 出す先は溝の側 (`partCommon.labelYOf` と同じ約束):
 * 盤の端には列番号が印字されていて、そこに重ねると両方読めなくなる。
 */
export function renderSip(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  const first = points?.[0];
  if (!points || !first) return '';

  const { palette } = theme;
  const scale = textScale(theme);
  const bar = sipBarRect(part, layout);
  const towardRavine = first.y < layout.ravineY ? 1 : -1;

  const shell = element('rect', {
    x: num(bar.x), y: num(bar.y), width: num(bar.width), height: num(bar.height), rx: 3,
    fill: palette.chipBody, stroke: '#14171c',
  });
  // 足は本体の縁からピン名の側へ覗かせる。本体の真ん中に重ねるとキャプションと食い合い、
  // 本体の下に隠すとどの穴に挿さっているのかが読めなくなる。
  const edgeY = first.y + (towardRavine * bar.height) / 2;
  const stubs = points
    .map((point) =>
      element('rect', { x: num(point.x - 3), y: num(edgeY - 2.5), width: 6, height: 5, fill: palette.chipPin }),
    )
    .join('');
  const names = part.pins
    .map((pin, index) => {
      const point = points[index];
      return point
        ? partLabel(point.x, point.y + towardRavine * (bar.height / 2 + SIP_NAME_GAP), pin.name, theme, {
            'font-size': num(scale * SIP_NAME_FONT),
          })
        : '';
    })
    .join('');

  const text = caption(part);
  const label = svgText(bar.x + bar.width / 2, first.y + 3.5, text, {
    'font-size': num(fittedFontSize(text, bar.width, scale)),
    fill: palette.chipText,
  });

  return `${shell}${stubs}${names}${label}`;
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
 * 溝をまたぐ 4 本足のタクトスイッチ。**押していなくてもつながっている足の組を線で描く**。
 * 実物では見えない結線だが、ここを知らずに同じ側の 2 本を使うと回路が最初から短絡する
 * (この図がいちばん防ぎたい間違い)。
 */
export function renderPushbutton(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
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
  const label = partLabel(center.x, body.y - 5, fitToBoard(caption(part), center.x, theme.metrics.textSize, layout), theme);

  return `${shell}${bridges}${stubs}${button}${label}`;
}

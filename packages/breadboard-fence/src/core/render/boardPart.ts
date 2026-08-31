import type { Layout } from '../model/layout.ts';
import { lookupBoardPart } from '../parts/boards.ts';
import type { PlacedPart, Rect } from '../types.ts';
import { caption, fitToBoard, pinPoints } from './partCommon.ts';
import { element, num, svgText } from './svg.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/** 基板の縁がピン列の外へ出る量 (ピッチに対する比)。Pico は 21mm 幅 / ピン間隔 0.7 インチ。 */
const EDGE_X = 0.55;
const EDGE_Y = 0.63;

// USB micro-B は幅 7.5mm ほど。基板の端から少しだけ出る。
const USB_OVERHANG = 8;
const USB_WIDTH = 20;
const USB_HEIGHT = 2.6;
const PIN_FONT = 6.8;
const PIN_NAME_GAP = 8;
const CHIP_SIDE = 2.2;

export function boardBodyRect(part: PlacedPart, layout: Layout): Rect {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x0 = Math.min(...xs) - EDGE_X * layout.pitch;
  const x1 = Math.max(...xs) + EDGE_X * layout.pitch;
  const y0 = Math.min(...ys) - EDGE_Y * layout.pitch;
  const y1 = Math.max(...ys) + EDGE_Y * layout.pitch;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * 溝をまたいで挿すマイコンボード。**ピン名は基板の中に縦書きで置く**:
 * 外に出すと、隣の列の穴 (実際に配線を挿すところ) を字が覆ってしまう。
 * USB は必ずピン 1 の側の端に描く。実物のピンアウト図と同じ向きで読めるようにするため。
 */
export function renderBoardPart(part: PlacedPart, layout: Layout, theme: RenderTheme): string {
  const points = pinPoints(part, layout);
  if (!points || points.length === 0) return '';

  const { palette } = theme;
  const scale = textScale(theme);
  const definition = lookupBoardPart(part.type);
  const body = boardBodyRect(part, layout);
  const center = { x: body.x + body.width / 2, y: body.y + body.height / 2 };

  // USB は基板の下から出ているので、本体より先に描いて縁を隠す。
  const usb = element('rect', {
    x: num(body.x - USB_OVERHANG), y: num(center.y - (USB_HEIGHT / 2) * layout.pitch),
    width: num(USB_OVERHANG + USB_WIDTH), height: num(USB_HEIGHT * layout.pitch), rx: 2.5,
    fill: '#c9cfd8', stroke: '#8a929c',
  });
  const shell = element('rect', {
    x: num(body.x), y: num(body.y), width: num(body.width), height: num(body.height), rx: 5,
    fill: palette.chipBody, stroke: '#14171c',
  });

  const chipSide = CHIP_SIDE * layout.pitch;
  const chip = element('rect', {
    x: num(center.x - chipSide / 2), y: num(center.y - chipSide / 2), width: num(chipSide), height: num(chipSide),
    rx: 2, fill: '#0d1014', stroke: '#3a4049',
  });
  const chipName = definition
    ? svgText(center.x, center.y + 3, definition.chip, { 'font-size': num(scale * 7), fill: palette.chipText })
    : '';

  const stubs = points
    .map((point) =>
      element('rect', { x: num(point.x - 3), y: num(point.y - 3), width: 6, height: 6, fill: palette.chipPin }),
    )
    .join('');

  const fontSize = scale * PIN_FONT;
  const names = part.pins
    .map((pin, index) => {
      const point = points[index];
      if (!point) return '';
      // 基板の内側へ向かって縦書きにする。**字の向きは上下の列で揃える** (下から上へ読む):
      // 伸ばす向きは anchor で切り替え、回す角度は変えない。片方だけ天地が逆になると読めない。
      const inward = point.y < center.y ? 1 : -1;
      const x = point.x + fontSize * 0.35;
      const y = point.y + inward * PIN_NAME_GAP;
      // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
      return element(
        'g',
        { transform: `translate(${num(x)} ${num(y)}) rotate(-90)` },
        svgText(0, 0, pin.name, {
          'font-size': num(fontSize),
          fill: palette.chipText,
          anchor: inward > 0 ? 'end' : 'start',
        }),
      );
    })
    .join('');

  // 基板の左に右揃えで置くので、伸びるのは左だけ。画布の左端で切る。
  const labelX = center.x - chipSide / 2 - 10;
  const labelSize = scale * 10;
  const label = svgText(labelX, center.y + 4, fitToBoard(caption(part), labelX, labelSize, layout, 'end'), {
    'font-size': num(labelSize),
    fill: palette.chipText,
    anchor: 'end',
  });

  return `${usb}${shell}${antenna(part, body, center.y, palette.chipPin)}${chip}${chipName}${stubs}${names}${label}`;
}

/** 無線つきの版は USB と反対の端にアンテナが載っている。 */
function antenna(part: PlacedPart, body: Rect, centerY: number, ink: string): string {
  if (!lookupBoardPart(part.type)?.wireless) return '';

  const width = 20;
  const height = 30;
  const x = body.x + body.width - width - 6;
  const outline = element('rect', {
    x: num(x), y: num(centerY - height / 2), width: num(width), height: num(height), rx: 2,
    fill: 'none', stroke: ink, 'stroke-width': 1.6,
  });
  const traces = [-8, 0, 8]
    .map((offset) =>
      element('line', {
        x1: num(x + 4), y1: num(centerY + offset), x2: num(x + width - 4), y2: num(centerY + offset),
        stroke: ink, 'stroke-width': 1.6,
      }),
    )
    .join('');
  return outline + traces;
}

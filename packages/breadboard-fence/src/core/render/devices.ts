import type { Layout } from '../model/layout.ts';
import type { DeviceSide, PlacedPart, Point, Rect } from '../types.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';
import { element, num, svgText } from './svg.ts';
import {
  PIN_NAME_GAP, deviceLookOf, deviceSilk, deviceWireColor, drawDeviceLook, wireColor, lookPinX, lookSize, pinNameInner, pinNameRow, pinNameWidth, pxPerMmOf,
} from 'fence-kit';
import { DEVICE_HEIGHT, PITCH } from '../model/layout.ts';

/** 姿のある機器は実寸で描く (2.54 mm = 1 ピッチ)。 */
const PX_PER_MM = pxPerMmOf(PITCH);

const PIN_LENGTH = 8;
const PIN_SPACING = 40;
const MIN_WIDTH = 120;
const CHAR_WIDTH = 7.5;
const DEVICE_GAP = 16;
/** 箱を縮める下限 (これより狭くすると名前が読めない)。 */
const MIN_SQUEEZE = 0.2;
// 機器のラベルとピン名は、部品のラベル (既定 10) との比で決める。
const LABEL_FONT = 11;
const PIN_FONT = 8.5;
/**
 * ピンの名前をこれより小さくしない (部品のラベルの 6 割)。帯に詰め込まれてこれでも
 * 隣と触れるなら、名前を 2 段に互い違いに置く。
 */
const MIN_PIN_FONT = 6;
/** ピンの名前を機器の箱の縁からこれだけ内に収める (角の丸みのぶん)。 */
const NAME_INSET = 4;
/** 2 段に置くときの段の間 (字の大きさに対する比)。 */
const STAGGER_LINE = 1.2;

export type DevicePlacement = {
  readonly rect: Rect;
  readonly side: DeviceSide;
  readonly pins: ReadonlyMap<string, Point>;
};

/** 左右の帯に置いた機器か。 */
export const isSideways = (side: DeviceSide | null | undefined): side is 'left' | 'right' =>
  side === 'left' || side === 'right';

// 左右の帯の箱 (52 の docs/159)。ピンは基板に向いた辺に縦に並べ、名前は箱の内側に横書きで刷る。
/** 縦に並ぶピンの間 (穴 1 つぶん)。 */
const SIDE_PIN_SPACING = PITCH;
/** 箱の上の、名前を刷る段の高さ。 */
const SIDE_LABEL_BAND = 30;
const SIDE_MIN_WIDTH = 72;
/** 左右の帯に並べる機器の間。 */
const SIDE_GAP = 16;

const captionOf = (part: PlacedPart): string => part.label ?? part.id;

/**
 * ピン 1 本ぶんの幅。**ピンの名前が既定の大きさで隣と触れない幅**を取る
 * (`PIN_SPACING` だけで決めていたので、長い名前は隣と地続きになった)。
 */
const pinSpacingOf = (part: PlacedPart, scale: number): number => {
  const widest = part.pins.reduce((most, pin) => Math.max(most, pinNameWidth(pin.name)), 0);
  // 端の名前も箱の縁から `NAME_INSET` 内に収まるように (ピンは箱の端から半ピッチ)。
  return Math.max(PIN_SPACING, widest * scale * PIN_FONT + Math.max(PIN_NAME_GAP, 2 * NAME_INSET));
};

/** 機器の幅。**姿のある機器 (Debug Probe) は実寸の幅**、ほかは名前とピンの数から。 */
const widthOf = (part: PlacedPart, scale: number): number => {
  const look = deviceLookOf(part.model ?? null);
  return look === null ? boxWidthOf(part, scale) : lookSize(look, PX_PER_MM, part.size ?? undefined).width;
};

/** 帯の高さ。姿のある機器があれば、その実寸の高さまで伸ばす (箱は既定の高さのまま)。 */
export function deviceBandHeight(devices: readonly PlacedPart[], side: 'top' | 'bottom'): number {
  return devices
    .filter((device) => (device.at ?? 'top') === side)
    .reduce((most, device) => {
      const look = deviceLookOf(device.model ?? null);
      return look === null ? most : Math.max(most, lookSize(look, PX_PER_MM, device.size ?? undefined).height);
    }, DEVICE_HEIGHT);
}

/** 左右の帯の箱の大きさ。幅は名前とピンの名前の長いほう、高さはピンの数から。 */
function sideBoxOf(part: PlacedPart, scale: number): { readonly width: number; readonly height: number } {
  const widestPin = part.pins.reduce((most, pin) => Math.max(most, pinNameWidth(pin.name) * scale * PIN_FONT), 0);
  const width = Math.max(SIDE_MIN_WIDTH, captionOf(part).length * scale * CHAR_WIDTH + 20, widestPin + 2 * NAME_INSET + 12);
  const height = Math.max(DEVICE_HEIGHT, SIDE_LABEL_BAND + part.pins.length * SIDE_PIN_SPACING);
  return { width, height };
}

/** 左右の帯の幅 (その側に置く機器の箱の幅のいちばん広いもの。無ければ 0)。 */
export function sideBandWidth(devices: readonly PlacedPart[], side: 'left' | 'right', scale: number): number {
  return devices
    .filter((device) => device.at === side)
    .reduce((most, device) => Math.max(most, sideBoxOf(device, scale).width), 0);
}

/** 左右の帯の機器を上から詰めて並べる。ピンは基板に向いた辺に縦に並ぶ。 */
function layoutSideDevices(
  devices: readonly PlacedPart[], layout: Layout, scale: number, placements: Map<string, DevicePlacement>,
): void {
  for (const side of ['left', 'right'] as const) {
    const band = layout.deviceBands[side];
    if (!band) continue;
    let cursor = band.y;
    for (const device of devices.filter((one) => one.at === side)) {
      const { width, height } = sideBoxOf(device, scale);
      // 基板の側の縁を帯の縁にそろえる (ピンの先がそろう)。
      const x = side === 'right' ? band.x : band.x + band.width - width;
      const rect: Rect = { x, y: cursor, width, height };
      const pinX = side === 'right' ? rect.x - PIN_LENGTH : rect.x + rect.width + PIN_LENGTH;
      placements.set(device.id, {
        rect,
        side,
        pins: new Map(device.pins.map((pin, index) => [
          pin.name, { x: pinX, y: rect.y + SIDE_LABEL_BAND + (index + 0.5) * SIDE_PIN_SPACING },
        ])),
      });
      cursor += height + SIDE_GAP;
    }
  }
}

/** 左右の帯の箱を描く。名前は上の段、ピンの名前は基板の側の縁に沿って横書き。 */
function renderSideDevice(part: PlacedPart, placement: DevicePlacement, theme: RenderTheme): string {
  const { rect, side } = placement;
  const { palette } = theme;
  const scale = textScale(theme);
  const edgeX = side === 'right' ? rect.x : rect.x + rect.width;
  const body = element('rect', {
    x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: 6,
    fill: palette.deviceBody, stroke: palette.deviceEdge,
  }) + svgText(rect.x + rect.width / 2, rect.y + 20, captionOf(part), {
    'font-size': num(scale * LABEL_FONT),
    fill: palette.deviceText,
  });
  const pins = part.pins.map((pin) => {
    const point = placement.pins.get(pin.name);
    if (!point) return '';
    const stub = element('line', {
      x1: num(edgeX), y1: num(point.y), x2: num(point.x), y2: num(point.y),
      stroke: palette.chipPin, 'stroke-width': 3,
    });
    const inward = side === 'right' ? 1 : -1;
    const name = svgText(edgeX + inward * (NAME_INSET + 2), point.y + scale * PIN_FONT * 0.35, pin.name, {
      'font-size': num(scale * PIN_FONT),
      fill: palette.chipPin,
      anchor: side === 'right' ? 'start' : 'end',
    });
    return stub + name;
  }).join('');
  return `${body}${pins}`;
}

const boxWidthOf = (part: PlacedPart, scale: number): number =>
  Math.max(part.pins.length * pinSpacingOf(part, scale), captionOf(part).length * scale * CHAR_WIDTH + 28, MIN_WIDTH);

/**
 * ボード外の機器を上下の帯に並べる。
 * つながる穴の平均 x を希望位置にして、帯からはみ出さない範囲で左から詰める。
 */
export function layoutDevices(
  devices: readonly PlacedPart[],
  preferredX: ReadonlyMap<string, number>,
  layout: Layout,
  theme: RenderTheme,
): Map<string, DevicePlacement> {
  const fontScale = textScale(theme);
  const placements = new Map<string, DevicePlacement>();
  layoutSideDevices(devices, layout, fontScale, placements);

  for (const side of ['top', 'bottom'] as const) {
    const band = layout.deviceBands[side];
    const onSide = devices.filter((device) => (device.at ?? 'top') === side);
    if (!band || onSide.length === 0) continue;

    const widths = new Map(onSide.map((device) => [device.id, widthOf(device, fontScale)]));
    const total = onSide.reduce((sum, device) => sum + (widths.get(device.id) ?? 0), 0)
      + DEVICE_GAP * (onSide.length - 1);
    // 帯からはみ出すなら箱だけを縮める (姿は実寸のまま)。姿の幅と間を先に取り、残りに箱を収める。
    const lookTotal = onSide.reduce((sum, device) =>
      sum + (deviceLookOf(device.model ?? null) === null ? 0 : widths.get(device.id) ?? 0), 0);
    const boxTotal = total - lookTotal - DEVICE_GAP * (onSide.length - 1);
    const room = band.width - lookTotal - DEVICE_GAP * (onSide.length - 1);
    const scale = total > band.width && boxTotal > 0 ? Math.max(MIN_SQUEEZE, room / boxTotal) : 1;
    const center = band.x + band.width / 2;

    const ordered = [...onSide].sort(
      (a, b) => (preferredX.get(a.id) ?? center) - (preferredX.get(b.id) ?? center),
    );

    /** 並べる幅。姿は実寸のまま、箱だけ縮める。 */
    const placedWidth = (device: PlacedPart): number =>
      (widths.get(device.id) ?? MIN_WIDTH) * (deviceLookOf(device.model ?? null) === null ? scale : 1);

    // 後ろに控えている分の幅は末尾から累積しておく (毎回数え直すと機器数の 2 乗になる)。
    const remaining: number[] = new Array(ordered.length + 1).fill(0);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const later = ordered[index];
      const laterWidth = later ? placedWidth(later) : 0;
      remaining[index] = (remaining[index + 1] ?? 0) + laterWidth + DEVICE_GAP * scale;
    }

    let cursor = band.x;
    ordered.forEach((device, index) => {
      // 姿は実寸なので縮めない (帯が足りなければはみ出す)。縮めるのは箱だけ。
      const look = deviceLookOf(device.model ?? null);
      const width = placedWidth(device);
      const rest = remaining[index + 1] ?? 0;
      const wanted = (preferredX.get(device.id) ?? center) - width / 2;
      const rightmost = band.x + band.width - width - rest;
      const x = Math.min(Math.max(wanted, cursor), Math.max(rightmost, cursor));
      // 背の高さ: 姿は実寸、箱は既定の高さ。どちらも基板の側の縁を帯の縁にそろえる (ピンの先がそろう)。
      const height = look === null ? Math.min(band.height, DEVICE_HEIGHT) : lookSize(look, PX_PER_MM, device.size ?? undefined).height;
      const rect: Rect = { x, y: side === 'top' ? band.y + band.height - height : band.y, width, height };
      const edgeY = side === 'top' ? rect.y + rect.height : rect.y;
      const pinY = side === 'top' ? edgeY + PIN_LENGTH : edgeY - PIN_LENGTH;

      // 姿のある機器は、ピンの x を姿の口の位置から取る (書いたピンの数に依らない)。
      const pinX = (name: string, pinIndex: number): number =>
        (look === null ? null : lookPinX(look, name, rect, side, PX_PER_MM, device.size ?? undefined))
        ?? rect.x + (rect.width * (pinIndex + 0.5)) / device.pins.length;
      placements.set(device.id, {
        rect,
        side,
        pins: new Map(device.pins.map((pin, pinIndex) => [pin.name, { x: pinX(pin.name, pinIndex), y: pinY }])),
      });
      cursor = x + width + DEVICE_GAP * scale;
    });
  }

  return placements;
}

export function renderDevice(part: PlacedPart, placement: DevicePlacement, theme: RenderTheme): string {
  if (isSideways(placement.side)) return renderSideDevice(part, placement, theme);
  const { rect, side } = placement;
  const { palette } = theme;
  const scale = textScale(theme);
  const edgeY = side === 'top' ? rect.y + rect.height : rect.y;
  const labelY = side === 'top' ? rect.y + 20 : rect.y + rect.height - 12;
  const stubOf = (point: Point): string => element('line', {
    x1: num(point.x), y1: num(edgeY), x2: num(point.x), y2: num(point.y),
    stroke: palette.chipPin, 'stroke-width': 3,
  });

  // **姿のある機器 (Debug Probe)** は実寸で描き、ピンの名前も姿が刷る (口の中は 1 mm 間隔なので縦書き)。
  const look = deviceLookOf(part.model ?? null);
  if (look !== null) {
    // ピンの名前は付属のケーブルの色で刷る (橙・黒・黄)。線の色と名前を見比べられるように。
    const pins = part.pins.map((pin) => {
      const colorName = deviceWireColor(part.model ?? null, pin.name);
      const color = colorName === null ? null : wireColor(colorName);
      return { name: pin.name, text: deviceSilk(part.model ?? null, pin.name), ...(color === null ? {} : { color }) };
    });
    const body = drawDeviceLook(look, {
      rect, side, label: captionOf(part), scale, pxPerMm: PX_PER_MM, pins, pinFont: scale * PIN_FONT, ...(part.size ? { size: part.size } : {}),
    });
    const stubs = part.pins.map((pin) => {
      const point = placement.pins.get(pin.name);
      return point === undefined ? '' : stubOf(point);
    }).join('');
    return `${body}${stubs}`;
  }

  const body = element('rect', {
    x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: 6,
    fill: palette.deviceBody, stroke: palette.deviceEdge,
  }) + svgText(rect.x + rect.width / 2, labelY, captionOf(part), {
    'font-size': num(scale * LABEL_FONT),
    fill: palette.deviceText,
  });
  const printed = part.pins.map((pin) => pin.name);

  // 帯に詰め込まれてピンの間が縮んだら、名前は隣と触れない大きさまで縮め、
  // それでも触れるなら 2 段に互い違いに置く。
  const xs = part.pins.map((pin) => placement.pins.get(pin.name)?.x ?? rect.x);
  const largest = scale * PIN_FONT;
  const nameRow = pinNameRow(xs, printed, {
    largest,
    smallest: Math.min(largest, MIN_PIN_FONT),
    within: { left: rect.x + NAME_INSET, right: rect.x + rect.width - NAME_INSET },
  });
  const nameY = side === 'top' ? edgeY - 6 : edgeY + 12 - (largest - nameRow.size) * 0.72;
  const inwardStep = (side === 'top' ? -1 : 1) * nameRow.size * STAGGER_LINE;

  const pins = part.pins
    .map((pin, index) => {
      const point = placement.pins.get(pin.name);
      if (!point) return '';
      const inner = nameRow.staggered && pinNameInner(xs, index);
      const name = svgText(point.x, nameY + (inner ? inwardStep : 0), printed[index] ?? pin.name, {
        'font-size': num(nameRow.size),
        fill: palette.chipPin,
      });
      return stubOf(point) + name;
    })
    .join('');

  return `${body}${pins}`;
}

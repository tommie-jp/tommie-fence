import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';
import { element, num, svgText } from './svg.ts';

const PIN_LENGTH = 8;
const PIN_SPACING = 40;
const MIN_WIDTH = 120;
const CHAR_WIDTH = 7.5;
const DEVICE_GAP = 16;
// 機器のラベルとピン名は、部品のラベル (既定 10) との比で決める。
const LABEL_FONT = 11;
const PIN_FONT = 8.5;

export type DevicePlacement = {
  readonly rect: Rect;
  readonly side: 'top' | 'bottom';
  readonly pins: ReadonlyMap<string, Point>;
};

const captionOf = (part: PlacedPart): string => part.label ?? part.id;

const widthOf = (part: PlacedPart, scale: number): number =>
  Math.max(part.pins.length * PIN_SPACING, captionOf(part).length * scale * CHAR_WIDTH + 28, MIN_WIDTH);

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

  for (const side of ['top', 'bottom'] as const) {
    const band = layout.deviceBands[side];
    const onSide = devices.filter((device) => (device.at ?? 'top') === side);
    if (!band || onSide.length === 0) continue;

    const widths = new Map(onSide.map((device) => [device.id, widthOf(device, fontScale)]));
    const total = onSide.reduce((sum, device) => sum + (widths.get(device.id) ?? 0), 0)
      + DEVICE_GAP * (onSide.length - 1);
    const scale = total > band.width ? band.width / total : 1;
    const center = band.x + band.width / 2;

    const ordered = [...onSide].sort(
      (a, b) => (preferredX.get(a.id) ?? center) - (preferredX.get(b.id) ?? center),
    );

    // 後ろに控えている分の幅は末尾から累積しておく (毎回数え直すと機器数の 2 乗になる)。
    const remaining: number[] = new Array(ordered.length + 1).fill(0);
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const later = ordered[index];
      const laterWidth = later ? (widths.get(later.id) ?? MIN_WIDTH) * scale : 0;
      remaining[index] = (remaining[index + 1] ?? 0) + laterWidth + DEVICE_GAP * scale;
    }

    let cursor = band.x;
    ordered.forEach((device, index) => {
      const width = (widths.get(device.id) ?? MIN_WIDTH) * scale;
      const rest = remaining[index + 1] ?? 0;
      const wanted = (preferredX.get(device.id) ?? center) - width / 2;
      const rightmost = band.x + band.width - width - rest;
      const x = Math.min(Math.max(wanted, cursor), Math.max(rightmost, cursor));
      const rect: Rect = { x, y: band.y, width, height: band.height };
      const edgeY = side === 'top' ? rect.y + rect.height : rect.y;
      const pinY = side === 'top' ? edgeY + PIN_LENGTH : edgeY - PIN_LENGTH;

      placements.set(device.id, {
        rect,
        side,
        pins: new Map(
          device.pins.map((pin, pinIndex) => [
            pin.name,
            { x: rect.x + (rect.width * (pinIndex + 0.5)) / device.pins.length, y: pinY },
          ]),
        ),
      });
      cursor = x + width + DEVICE_GAP * scale;
    });
  }

  return placements;
}

export function renderDevice(part: PlacedPart, placement: DevicePlacement, theme: RenderTheme): string {
  const { rect, side } = placement;
  const { palette } = theme;
  const scale = textScale(theme);
  const edgeY = side === 'top' ? rect.y + rect.height : rect.y;
  const labelY = side === 'top' ? rect.y + 20 : rect.y + rect.height - 12;

  const shell = element('rect', {
    x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: 6,
    fill: palette.deviceBody, stroke: palette.deviceEdge,
  });
  const label = svgText(rect.x + rect.width / 2, labelY, captionOf(part), {
    'font-size': num(scale * LABEL_FONT),
    fill: palette.deviceText,
  });

  const pins = part.pins
    .map((pin) => {
      const point = placement.pins.get(pin.name);
      if (!point) return '';
      const stub = element('line', {
        x1: num(point.x), y1: num(edgeY), x2: num(point.x), y2: num(point.y),
        stroke: palette.chipPin, 'stroke-width': 3,
      });
      const name = svgText(point.x, side === 'top' ? edgeY - 6 : edgeY + 12, pin.name, {
        'font-size': num(scale * PIN_FONT),
        fill: palette.chipPin,
      });
      return stub + name;
    })
    .join('');

  return `${shell}${label}${pins}`;
}

import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point, Rect } from '../types.ts';
import { DEFAULT_LED_COLOR, PALETTE, bandColor, ledColor } from './palette.ts';
import { element, num, svgText } from './svg.ts';
import { parseOhms, resistorBandColors } from './values.ts';

const LEAD_WIDTH = 2;

// ラベルと値の長さはパーサ側 (limits.ts) で切ってあるので、ここでは組み立てるだけ。
const caption = (part: PlacedPart): string => [part.id, part.value ?? part.label ?? ''].join(' ').trim();

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const CHAR_WIDTH = 5.6;
const CAPTION_HEIGHT = 14;

/**
 * 配線に横切られたくない領域。本体そのものより、
 * 溝側に置いたラベルがレーンと同じ高さに来るのが問題になる。
 */
export function partObstacles(part: PlacedPart, layout: Layout): Rect[] {
  const points = part.pins
    .map((pin) => (pin.address ? layout.point(pin.address) : null))
    .filter((point): point is Point => point !== null);
  if (points.length === 0) return [];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (part.kind === 'dip') {
    return [{ x: left - 9, y: top - 5, width: right - left + 18, height: bottom - top + 10 }];
  }

  if (part.kind === 'three-lead') {
    const radius = 0.95 * layout.pitch;
    const center = points[1] ?? points[0]!;
    // 本体の丸に、上下へ出したピン名とラベルを足した高さ。
    return [{ x: center.x - radius, y: center.y - radius - 18, width: radius * 2, height: radius * 2 + 36 }];
  }

  const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const width = Math.max(caption(part).length * CHAR_WIDTH, right - left);
  const labelY = center.y < layout.ravineY ? center.y + 18 : center.y - (part.type === 'led' ? 21 : 14);

  return [{ x: center.x - width / 2, y: labelY - CAPTION_HEIGHT + 3, width, height: CAPTION_HEIGHT }];
}

export function renderPart(part: PlacedPart, layout: Layout): string {
  if (part.kind === 'dip') return renderDip(part, layout);
  if (part.kind === 'three-lead') return renderTransistor(part, layout);
  return renderTwoLead(part, layout);
}

function renderTwoLead(part: PlacedPart, layout: Layout): string {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return '';

  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  const span = Math.hypot(to.x - from.x, to.y - from.y);

  const lead = element('line', {
    x1: num(from.x), y1: num(from.y), x2: num(to.x), y2: num(to.y),
    stroke: PALETTE.lead, 'stroke-width': LEAD_WIDTH,
  });
  // ラベルは溝の側に置く。盤の端は列番号の印字があり、そこに重ねると両方読めなくなる。
  const towardRavine = center.y < layout.ravineY;
  const labelY = towardRavine ? center.y + 18 : center.y - (part.type === 'led' ? 21 : 14);
  const label = svgText(center.x, labelY, caption(part), {
    'font-size': 10,
    fill: PALETTE.partText,
    halo: PALETTE.plate,
  });
  // 3 引数 rotate() を読まないレンダラがあるので translate と rotate に分ける。
  const body = (inner: string): string =>
    element('g', { transform: `translate(${num(center.x)} ${num(center.y)}) rotate(${num(angle)})` }, inner);

  if (part.type === 'resistor') {
    const width = Math.min(span * 0.6, 38);
    const ohms = part.value ? parseOhms(part.value) : null;
    const bands = (ohms === null ? null : resistorBandColors(ohms)) ?? ['brown', 'black', 'black'];
    const stripes = bands
      .map((band, index) =>
        element('rect', {
          x: num(-width / 4 + index * (width / 5)), y: -6, width: 3.2, height: 12,
          fill: bandColor(band),
        }),
      )
      .join('');
    const shell = element('rect', {
      x: num(-width / 2), y: -6.5, width: num(width), height: 13, rx: 5,
      fill: '#e9d8a6', stroke: '#b08968',
    });
    return `${lead}${body(shell + stripes)}${label}`;
  }

  if (part.type === 'capacitor') {
    const minus = part.pins.findIndex((pin) => pin.name === '-');
    if (minus === -1) {
      const width = Math.min(span * 0.55, 30);
      const shell = element('rect', {
        x: num(-width / 2), y: -8, width: num(width), height: 16, rx: 3,
        fill: '#e3a72f', stroke: '#9c6f10',
      });
      return `${lead}${body(shell)}${label}`;
    }

    // 極性つき (電解): マイナス側に帯を描く。逆挿しは壊れるので目立たせる。
    const width = Math.min(span * 0.6, 34);
    const stripeX = minus === 0 ? -width / 2 + 4.5 : width / 2 - 4.5;
    const shell = element('rect', {
      x: num(-width / 2), y: -9.5, width: num(width), height: 19, rx: 4,
      fill: '#2c3e70', stroke: '#1b2748',
    });
    const stripe = element('rect', { x: num(stripeX - 3.5), y: -9.5, width: 7, height: 19, fill: '#dfe4ee' });
    const mark = svgText(stripeX, 4, '−', { 'font-size': 12, 'font-weight': 700, fill: '#2c3e70' });
    return `${lead}${body(shell + stripe + mark)}${label}`;
  }

  const color = ledColor(part.value ?? '') ?? DEFAULT_LED_COLOR;
  // カソード側の平らな面。部品の向きに合わせたいので、本体と同じ回転の中で置く。
  const flatX = part.pins[0]?.name.toUpperCase() === 'K' ? -6 : 6;
  const dome = element('circle', {
    cx: 0, cy: -4, r: 8.5, fill: color, 'fill-opacity': 0.85, stroke: '#7a2018',
  });
  const flat = element('line', {
    x1: flatX, y1: -11, x2: flatX, y2: 3, stroke: '#7a2018', 'stroke-width': 2,
  });
  return `${lead}${body(dome + flat)}${label}`;
}

/**
 * TO-92 のような 3 本足の部品。パッケージの平らな面の向きは図では主張せず、
 * どの穴がどの足かをピン名で示す (足の並びは品種で違うため)。
 */
function renderTransistor(part: PlacedPart, layout: Layout): string {
  const points = part.pins.map((pin) => (pin.address ? layout.point(pin.address) : null));
  const center = points[1];
  if (!center || points.some((point) => point === null)) return '';

  // TO-92 は幅 4.5mm ほど。穴のピッチ 2.54mm に対して直径 2 ピッチ弱に収める。
  const radius = 0.95 * layout.pitch;
  const towardRavine = center.y < layout.ravineY ? 1 : -1;

  const shell = element('circle', {
    cx: num(center.x), cy: num(center.y), r: num(radius),
    fill: PALETTE.chipBody, stroke: '#14171c',
  });
  const legs = points
    .map((point) =>
      point
        ? element('rect', { x: num(point.x - 3), y: num(point.y - 3), width: 6, height: 6, fill: PALETTE.chipPin })
        : '',
    )
    .join('');
  const names = part.pins
    .map((pin, index) => {
      const point = points[index];
      return point
        ? svgText(point.x, point.y - towardRavine * (radius + 9), pin.name, {
            'font-size': 10,
            'font-weight': 700,
            fill: PALETTE.partText,
            halo: PALETTE.plate,
          })
        : '';
    })
    .join('');
  const label = svgText(center.x, center.y + towardRavine * (radius + 14), caption(part), {
    'font-size': 10,
    fill: PALETTE.partText,
    halo: PALETTE.plate,
  });

  return `${shell}${legs}${names}${label}`;
}

function renderDip(part: PlacedPart, layout: Layout): string {
  const anchor = part.pins[0]?.address;
  const half = part.pins.length / 2;
  if (!anchor || anchor.kind !== 'hole') return '';

  const points = part.pins.map((pin) => (pin.address ? layout.point(pin.address) : { x: 0, y: 0 }));
  const anchorPoint = points[0]!;
  const oppositePoint = points[part.pins.length - 1]!;
  const farPoint = points[half - 1]!;

  const x0 = Math.min(anchorPoint.x, farPoint.x) - 0.45 * layout.pitch;
  const x1 = Math.max(anchorPoint.x, farPoint.x) + 0.45 * layout.pitch;
  const y0 = Math.min(anchorPoint.y, oppositePoint.y) - 5;
  const y1 = Math.max(anchorPoint.y, oppositePoint.y) + 5;

  const stubs = points
    .map((point) =>
      element('rect', {
        x: num(point.x - 3), y: num(point.y - (point.y < (y0 + y1) / 2 ? 1 : 5)), width: 6, height: 6,
        fill: PALETTE.chipPin,
      }),
    )
    .join('');

  const numbers = part.pins
    .map((pin, index) => {
      const point = points[index]!;
      const inward = point.y < (y0 + y1) / 2 ? 12 : -7;
      return svgText(point.x, point.y + inward, pin.name, { 'font-size': 6.5, fill: PALETTE.chipPin });
    })
    .join('');

  const shell = element('rect', {
    x: num(x0), y: num(y0), width: num(x1 - x0), height: num(y1 - y0), rx: 3,
    fill: PALETTE.chipBody, stroke: '#14171c',
  });
  const notch = element('circle', { cx: num(x0), cy: num((y0 + y1) / 2), r: 4.5, fill: PALETTE.plate });
  const text = caption(part);
  const label = svgText((x0 + x1) / 2, (y0 + y1) / 2 + 3.5, text, {
    // パッケージの幅からはみ出さないところまで字を詰める。
    'font-size': num(Math.min(9.5, (x1 - x0 - 14) / (text.length * 0.58))),
    fill: PALETTE.chipText,
  });

  return `${stubs}${shell}${notch}${numbers}${label}`;
}

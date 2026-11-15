import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { USB_STAMP, lookupUsbKind, usbKinds } from './deviceLooks.ts';
import type { UsbKind, UsbPort } from './deviceLooks.ts';

/**
 * USB ケーブル (52 の docs/157)。口 (`UsbPort`) から出ていく向きへまっすぐ伸ばし、
 * **両端の差し込みの胴に種類を刷る** (`micro-B` `USB-C`)。手前の差し込みは口に挿さっている。
 * 向こうの端はパソコンや充電器へ行く物として、図の縁の手前で止める (相手は描かない)。
 */
export type UsbCableOptions = {
  readonly port: UsbPort;
  /** 向こうの端の差し込みの種類。 */
  readonly far: UsbKind;
  /** 口から向こうの端の差し込みの先まで (px)。`usbCableMinLength` より短ければ伸ばす。 */
  readonly length: number;
  readonly scale: number;
};

/** 差し込みの胴 (樹脂) の長さと太さ (px)。 */
const BODY_LENGTH = 34;
const BODY_THICK = 15;
/** 線の太さ (px)。 */
const CORD = 6;
/** 向こうの端の金物の長さと太さ (px)。 */
const TIP: Readonly<Record<UsbKind, { readonly length: number; readonly thick: number; readonly round: number }>> = {
  'micro-b': { length: 6, thick: 8, round: 1 },
  'usb-c': { length: 7, thick: 9, round: 3.5 },
  'usb-a': { length: 9, thick: 13, round: 0.5 },
};
const PLUG_FILL = '#2b2f36';
const PLUG_EDGE = '#14171b';
const PLUG_INK = '#ffffff';
const METAL_FILL = '#c9cfd8';
const METAL_EDGE = '#8a929c';

/** 線の部分を少しでも見せる長さ (px)。両端の胴と金物の分に足す。 */
const MIN_CORD = 24;

/** これより短く引くと線が見えない長さ。 */
export const usbCableMinLength = (far: UsbKind): number => 2 * BODY_LENGTH + TIP[far].length + MIN_CORD;

/** ケーブルが占める矩形 (画布を広げる量を測るのに使う)。 */
export function usbCableBox(options: Omit<UsbCableOptions, 'scale'>): { x: number; y: number; width: number; height: number } {
  const { port } = options;
  const length = Math.max(options.length, usbCableMinLength(options.far));
  const half = BODY_THICK / 2;
  switch (port.dir) {
    case 'up': return { x: port.x - half, y: port.y - length, width: BODY_THICK, height: length };
    case 'down': return { x: port.x - half, y: port.y, width: BODY_THICK, height: length };
    case 'left': return { x: port.x - length, y: port.y - half, width: length, height: BODY_THICK };
    default: return { x: port.x, y: port.y - half, width: length, height: BODY_THICK };
  }
}

/** ケーブルを描く。線は口から外へまっすぐ。 */
export function drawUsbCable(options: UsbCableOptions): string {
  const { port, far, scale } = options;
  const length = Math.max(options.length, usbCableMinLength(far));
  const vertical = port.dir === 'up' || port.dir === 'down';
  const sign = port.dir === 'up' || port.dir === 'left' ? -1 : 1;
  /** 口から `distance` 進んだ点。 */
  const at = (distance: number): { x: number; y: number } => (vertical
    ? { x: port.x, y: port.y + sign * distance }
    : { x: port.x + sign * distance, y: port.y });
  /** 口から `from`〜`to` の区間の矩形 (太さ `thick`)。 */
  const slab = (from: number, to: number, thick: number, attrs: Record<string, string | number>): string => {
    const a = at(from);
    const b = at(to);
    const x = vertical ? port.x - thick / 2 : Math.min(a.x, b.x);
    const y = vertical ? Math.min(a.y, b.y) : port.y - thick / 2;
    return element('rect', {
      x: num(x), y: num(y),
      width: num(vertical ? thick : Math.abs(b.x - a.x)), height: num(vertical ? Math.abs(b.y - a.y) : thick),
      ...attrs,
    });
  };
  const tip = TIP[far];
  const farBody = length - tip.length - BODY_LENGTH;
  const cord = (() => {
    const a = at(BODY_LENGTH);
    const b = at(farBody);
    return element('line', {
      x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y),
      stroke: PLUG_FILL, 'stroke-width': CORD, 'stroke-linecap': 'butt',
    });
  })();
  const body = (from: number): string => slab(from, from + BODY_LENGTH, BODY_THICK, { rx: 3, fill: PLUG_FILL, stroke: PLUG_EDGE });
  const metal = slab(length - tip.length, length, tip.thick, { rx: tip.round, fill: METAL_FILL, stroke: METAL_EDGE });
  // 胴の字は胴に沿って書く (縦のケーブルなら字も縦)。
  const stamp = (from: number, kind: UsbKind): string => {
    const centre = at(from + BODY_LENGTH / 2);
    const size = 7 * scale;
    const text = svgText(0, size * 0.35, USB_STAMP[kind], { 'font-size': num(size), fill: PLUG_INK });
    return element('g', {
      class: 'cf-usb-stamp',
      transform: `translate(${num(centre.x)} ${num(centre.y)})${vertical ? ' rotate(-90)' : ''}`,
    }, text);
  };
  return element('g', { class: 'cf-usb-cable' },
    `${cord}${body(0)}${stamp(0, port.kind)}${body(farBody)}${stamp(farBody, far)}${metal}`);
}

/** 部品の種類の綴り (`type: usb-cable`)。 */
export const USB_CABLE_TYPE = 'usb-cable';

const CABLE_KEYS = ['type', 'from', 'plug', 'label'] as const;
/** 口の名前。今は USB の口が 1 つの物だけなので `USB` だけ。 */
const PORT_REF = /^([A-Za-z0-9_-]+)\.USB$/;
/** 書かなければ向こうの端は Type-C (今のパソコンと充電器の口。52 の docs/157)。 */
const DEFAULT_FAR: UsbKind = 'usb-c';

export type UsbCableRead =
  | { readonly ok: true; readonly partId: string; readonly far: UsbKind; readonly label: string | null }
  | { readonly ok: false; readonly message: string; readonly token?: string };

/**
 * `type: usb-cable` のマップを読む (bread と perf で同じ決まり)。**線ではなく部品** — 部品表に
 * 「usb-cable USB-C – micro-B」と出て、買う物が分かる。中の 4 本は書かないので、ネットリストにも入れない。
 *
 * ```yaml
 * W1:
 *   type: usb-cable
 *   from: MCU.USB      # 挿す口。口の種類で手前の差し込みが決まる (Pico なら micro-B)
 *   plug: usb-a        # 向こうの端 (パソコンの側)。書かなければ usb-c
 * ```
 *
 * 字は呼ぶ側が自分の決まりで安全な形にして出す (`message` の中の綴りは `token` にも入れる)。
 */
export function readUsbCable(raw: Readonly<Record<string, unknown>>, quote: (text: string) => string): UsbCableRead {
  const unknownKey = Object.keys(raw).find((key) => !(CABLE_KEYS as readonly string[]).includes(key));
  if (unknownKey !== undefined) {
    return { ok: false, message: `USB ケーブルに書ける項目は ${CABLE_KEYS.join(', ')} です (今は ${quote(unknownKey)})`, token: unknownKey };
  }
  const from = typeof raw.from === 'string' ? raw.from.trim() : null;
  if (from === null) return { ok: false, message: 'USB ケーブルには from: に挿す口を書きます (例: from: MCU.USB)' };
  const port = PORT_REF.exec(from);
  if (port === null) return { ok: false, message: `from: は「部品の ID.USB」で書きます (今は ${quote(from)})`, token: from };
  const written = raw.plug === undefined ? DEFAULT_FAR : typeof raw.plug === 'string' ? raw.plug : null;
  const far = written === null ? null : lookupUsbKind(written);
  if (far === null) {
    return { ok: false, message: `plug: は ${usbKinds().join(' / ')} のどれかです (今は ${quote(String(raw.plug))})`, token: String(raw.plug) };
  }
  if (raw.label !== undefined && typeof raw.label !== 'string') return { ok: false, message: 'label は字で書きます' };
  return { ok: true, partId: port[1] ?? '', far, label: typeof raw.label === 'string' ? raw.label : null };
}

/** 部品表の値の欄 (`USB-C – micro-B`)。手前の口の種類が分からなければ向こうの端だけ。 */
export const usbCableListValue = (far: UsbKind, near: UsbKind | null): string =>
  `${USB_STAMP[far]}${near === null ? '' : ` – ${USB_STAMP[near]}`}`;

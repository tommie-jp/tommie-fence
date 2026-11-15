import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { DEFAULT_PART_SIZE, USB_STAMP, lookupPartSize, lookupUsbKind, partSizes, usbKinds } from './deviceLooks.ts';
import type { PartSize, UsbKind, UsbPort } from './deviceLooks.ts';

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
  /** 1 mm が何 px か (2.54 mm = 1 ピッチ)。 */
  readonly pxPerMm: number;
  /** 大きさ。書かなければ `medium`。 */
  readonly size?: PartSize;
};

/**
 * 差し込みの実寸 (mm)。金物 (`tip`) は USB-IF の規格書の値、胴 (オーバーモールド。根元を含む) はメーカー図の値。
 * - micro-B: 金物 6.85 × 5.4 (Micro-USB 1.01 Fig 4-7・4-8)、胴 10.6 × 25.6 (規格の幅の上限と Molex 68784)
 * - USB-C: 金物 8.25 × 6.65 (Type-C 1.1 Fig 3-3)、胴 12.2 × 35 (Newnex の図。規格の上限は 12.35 × 35)
 * - USB-A: 金物 12.0 × 11.75 (USB 2.0 Fig 6-9)、胴 15.7 × 36 (USB 2.0 Fig 6-2 の典型。根元 9 mm を含む)
 */
const PLUG: Readonly<Record<UsbKind, {
  readonly tipWidth: number; readonly tipLength: number; readonly bodyWidth: number; readonly bodyLength: number; readonly round: number;
}>> = {
  'micro-b': { tipWidth: 6.85, tipLength: 5.4, bodyWidth: 10.6, bodyLength: 25.6, round: 0.4 },
  'usb-c': { tipWidth: 8.25, tipLength: 6.65, bodyWidth: 12.2, bodyLength: 35, round: 1.2 },
  'usb-a': { tipWidth: 12.0, tipLength: 11.75, bodyWidth: 15.7, bodyLength: 36, round: 0.3 },
};
/** ケーブルの太さ (mm)。USB 2.0 のケーブルは 3.5〜4.0 mm (Assmann・Qualtek の図)。 */
const CORD_MM = 3.8;

/**
 * 大きさごとの倍率。`large` は実寸。`medium` は金物と胴の幅は実寸のまま胴の長さだけ縮め、`small` は
 * 金物も胴も細く短くする。
 */
const SCALE: Readonly<Record<PartSize, { readonly tip: number; readonly width: number; readonly length: number; readonly cord: number }>> = {
  large: { tip: 1, width: 1, length: 1, cord: 1 },
  medium: { tip: 1, width: 1, length: 0.45, cord: 1 },
  small: { tip: 0.6, width: 0.6, length: 0.3, cord: 0.6 },
};

/** 大きさに合わせた差し込みの寸法 (mm)。 */
const plugOf = (kind: UsbKind, size: PartSize) => {
  const plug = PLUG[kind];
  const k = SCALE[size];
  return {
    tipWidth: plug.tipWidth * k.tip, tipLength: plug.tipLength * k.tip,
    bodyWidth: plug.bodyWidth * k.width, bodyLength: plug.bodyLength * k.length, round: plug.round * k.tip,
  };
};
const PLUG_FILL = '#2b2f36';
const PLUG_EDGE = '#14171b';
const PLUG_INK = '#ffffff';
const METAL_FILL = '#c9cfd8';
const METAL_EDGE = '#8a929c';

/** 線の部分を少しでも見せる長さ (px)。両端の胴と金物の分に足す。 */
const MIN_CORD = 24;

/** これより短く引くと線が見えない長さ (px)。手前の胴 + 向こうの胴と金物 + 見せる線。 */
export const usbCableMinLength = (near: UsbKind, far: UsbKind, pxPerMm: number, size: PartSize = DEFAULT_PART_SIZE): number =>
  (plugOf(near, size).bodyLength + plugOf(far, size).bodyLength + plugOf(far, size).tipLength) * pxPerMm + MIN_CORD;

/** ケーブルが占める矩形 (画布を広げる量を測るのに使う)。太さは太いほうの胴。 */
export function usbCableBox(options: Omit<UsbCableOptions, 'scale'>): { x: number; y: number; width: number; height: number } {
  const { port, pxPerMm } = options;
  const size = options.size ?? DEFAULT_PART_SIZE;
  const length = Math.max(options.length, usbCableMinLength(port.kind, options.far, pxPerMm, size));
  const half = (Math.max(plugOf(port.kind, size).bodyWidth, plugOf(options.far, size).bodyWidth) * pxPerMm) / 2;
  switch (port.dir) {
    case 'up': return { x: port.x - half, y: port.y - length, width: half * 2, height: length };
    case 'down': return { x: port.x - half, y: port.y, width: half * 2, height: length };
    case 'left': return { x: port.x - length, y: port.y - half, width: length, height: half * 2 };
    default: return { x: port.x, y: port.y - half, width: length, height: half * 2 };
  }
}

/** ケーブルを実寸で描く。線は口から外へまっすぐ。手前の差し込みの金物は口の中に入っているので描かない。 */
export function drawUsbCable(options: UsbCableOptions): string {
  const { port, far, scale, pxPerMm } = options;
  const size = options.size ?? DEFAULT_PART_SIZE;
  const mm = (value: number): number => value * pxPerMm;
  const length = Math.max(options.length, usbCableMinLength(port.kind, far, pxPerMm, size));
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
  const near = plugOf(port.kind, size);
  const farPlug = plugOf(far, size);
  const nearBody = mm(near.bodyLength);
  const farTip = mm(farPlug.tipLength);
  const farBodyStart = length - farTip - mm(farPlug.bodyLength);
  const cord = (() => {
    const a = at(nearBody);
    const b = at(farBodyStart);
    return element('line', {
      x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y),
      stroke: PLUG_FILL, 'stroke-width': num(mm(CORD_MM * SCALE[size].cord)), 'stroke-linecap': 'butt',
    });
  })();
  const body = (from: number, kind: UsbKind): string =>
    slab(from, from + mm(plugOf(kind, size).bodyLength), mm(plugOf(kind, size).bodyWidth), { rx: num(mm(1.5 * SCALE[size].width)), fill: PLUG_FILL, stroke: PLUG_EDGE });
  const metal = slab(length - farTip, length, mm(farPlug.tipWidth), { rx: num(mm(farPlug.round)), fill: METAL_FILL, stroke: METAL_EDGE });
  // 胴の字は胴に沿って書く (縦のケーブルなら字も縦)。
  const stamp = (from: number, kind: UsbKind): string => {
    const plug = plugOf(kind, size);
    const centre = at(from + mm(plug.bodyLength) / 2);
    // 字は胴の長さと太さに収める (縮めた胴でも種類が読めるように)。
    const fontSize = Math.min(9 * scale, mm(plug.bodyWidth) * 0.6, mm(plug.bodyLength) * 0.9 / (USB_STAMP[kind].length * 0.6));
    const text = svgText(0, fontSize * 0.35, USB_STAMP[kind], { 'font-size': num(fontSize), fill: PLUG_INK });
    return element('g', {
      class: 'cf-usb-stamp',
      transform: `translate(${num(centre.x)} ${num(centre.y)})${vertical ? ' rotate(-90)' : ''}`,
    }, text);
  };
  return element('g', { class: 'cf-usb-cable' },
    `${cord}${body(0, port.kind)}${stamp(0, port.kind)}${body(farBodyStart, far)}${stamp(farBodyStart, far)}${metal}`);
}

/** 部品の種類の綴り (`type: usb-cable`)。 */
export const USB_CABLE_TYPE = 'usb-cable';

const CABLE_KEYS = ['type', 'from', 'plug', 'label', 'size'] as const;
/** 口の名前。今は USB の口が 1 つの物だけなので `USB` だけ。 */
const PORT_REF = /^([A-Za-z0-9_-]+)\.USB$/;
/** 書かなければ向こうの端は Type-C (今のパソコンと充電器の口。52 の docs/157)。 */
const DEFAULT_FAR: UsbKind = 'usb-c';

export type UsbCableRead =
  | { readonly ok: true; readonly partId: string; readonly far: UsbKind; readonly label: string | null; readonly size: PartSize }
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
 *   size: medium       # large (実寸) / medium (既定) / small
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
  const size = raw.size === undefined ? DEFAULT_PART_SIZE : typeof raw.size === 'string' ? lookupPartSize(raw.size) : null;
  if (size === null) {
    return { ok: false, message: `size: は ${partSizes().join(' / ')} のどれかです (今は ${quote(String(raw.size))})`, token: String(raw.size) };
  }
  return { ok: true, partId: port[1] ?? '', far, label: typeof raw.label === 'string' ? raw.label : null, size };
}

/** 部品表の値の欄 (`USB-C – micro-B`)。手前の口の種類が分からなければ向こうの端だけ。 */
export const usbCableListValue = (far: UsbKind, near: UsbKind | null): string =>
  `${USB_STAMP[far]}${near === null ? '' : ` – ${USB_STAMP[near]}`}`;

import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';

/**
 * 基板の外の機器を**箱の代わりに実物の姿を実寸で**描く (52 の docs/157)。今は Raspberry Pi の
 * Debug Probe だけ。寸法は下の `MM` と `CASE_SIDE` `CASE_END`。帯はこの背の高さまで伸びる。
 * 口の中のピンは 1 mm 間隔なので、ピンの名前は口の上に縦に刷る。
 *
 * **ロゴ (ラズベリーの印) は描かない。** 商標の決まりがロゴの利用を正規品の販売・配布に限っていて、
 * 図や文書での再現を許す条が無い (2026-06-17 版)。
 *
 * 向き: `side` は機器を置く帯。上の帯 (`top`) なら 3 ピンの口が下 (基板の側)・USB が上で、
 * 公式の図と同じ向き。下の帯は 180 度回した姿 (左右も入れ替わる)。
 */
export type DeviceLookName = 'rpi-debug-probe';

/** USB の口と差し込みの種類。 */
export type UsbKind = 'micro-b' | 'usb-c' | 'usb-a';

/** 図に刷る種類の名前。 */
export const USB_STAMP: Readonly<Record<UsbKind, string>> = { 'micro-b': 'micro-B', 'usb-c': 'USB-C', 'usb-a': 'USB-A' };

/** 書ける種類の綴り (`usb-c`)。 */
export const usbKinds = (): readonly UsbKind[] => ['micro-b', 'usb-c', 'usb-a'];

/** 綴りから種類を引く。知らない綴りは null。 */
export const lookupUsbKind = (written: string): UsbKind | null => {
  const key = written.trim().toLowerCase();
  return (usbKinds() as readonly string[]).includes(key) ? key as UsbKind : null;
};

export type LookRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** USB の口。`x` `y` は口の縁の真ん中、`dir` はケーブルが出ていく向き。 */
export type UsbPort = {
  readonly x: number;
  readonly y: number;
  readonly dir: 'up' | 'down' | 'left' | 'right';
  readonly kind: UsbKind;
};

/**
 * Debug Probe の寸法 (mm)。**寸法図 RP-008192-DS** から: 基板 32 × 22 mm、USB の口 (micro-B) は短辺の真ん中で
 * 基板の縁から 1.3 mm 出る。3 ピンの口 (JST SH の横挿し SM03B) は反対の短辺で、基板の真ん中の線から ±3.8 mm
 * (上の帯の向きで左が U、右が D)。口の中のピンは 1 mm 間隔 (3 ピンのデバッグコネクタの仕様 RP-003139-SP)。
 * ケースの外寸は 31 × 37 mm (**公式の値は無く、Elektor のレビューの実測**。基板の左右に 4.5 mm、上下に 2.5 mm ずつ)。
 */
const MM = {
  boardShort: 22, boardLong: 32,
  usbWidth: 7.5, usbDepth: 5.0, usbJut: 1.3,
  portOffset: 3.8, pinStep: 1.0, housingWidth: 5.8, housingDepth: 4.25,
} as const;
/** ケースが基板の縁から外へ出る量 (mm)。左右 (基板の短辺 22 mm の向き) と、上下 (USB と口の側)。 */
const CASE_SIDE = 4.5;
const CASE_END = 2.5;

/** 口ごとのピンの並び (上の帯で左から。1 番 = 橙・2 番 = 黒・3 番 = 黄。公式のケーブルの図の色の順)。値は口の真ん中からの mm。 */
const PROBE_SLOTS: Readonly<Record<string, { readonly port: 'U' | 'D'; readonly offset: number }>> = {
  TX: { port: 'U', offset: -MM.pinStep }, UGND: { port: 'U', offset: 0 }, RX: { port: 'U', offset: MM.pinStep },
  SC: { port: 'D', offset: -MM.pinStep }, DGND: { port: 'D', offset: 0 }, SD: { port: 'D', offset: MM.pinStep },
};

/** 口の真ん中 (上の帯の向きで、ケースの左の縁からの mm)。 */
const portCentre = (port: 'U' | 'D'): number =>
  CASE_SIDE + MM.boardShort / 2 + (port === 'U' ? -MM.portOffset : MM.portOffset);

const CASE_FILL = '#eef0f2';
const CASE_EDGE = '#9aa1a9';
const BOARD_FILL = '#4f9f74';
const BOARD_EDGE = '#357552';
const SILK = '#ffffff';
const HOUSING_FILL = '#f3efe2';
const HOUSING_EDGE = '#a59d86';
const METAL_FILL = '#c9cfd8';
const METAL_EDGE = '#8a929c';
/** LED の色 (回路図 RP-008194-DS: 電源の赤と、UART・DAP の緑と黄)。 */
const LEDS = ['#e5484d', '#3fb950', '#e3b341', '#3fb950', '#e3b341'] as const;

/** 2.54 mm = 1 ピッチの図で、1 mm が何 px か。 */
export const pxPerMmOf = (pitch: number): number => pitch / 2.54;

/** 姿の幅と高さ (px)。**実寸** — 基板とケースの mm に `pxPerMm` を掛ける。 */
export const lookSize = (_look: DeviceLookName, pxPerMm: number): { readonly width: number; readonly height: number } => ({
  width: (MM.boardShort + 2 * CASE_SIDE) * pxPerMm,
  height: (MM.boardLong + 2 * CASE_END) * pxPerMm,
});

/**
 * ピンの x (px)。**どのピンを書いたかに依らず、口の中の位置は実物で決まる**。
 * 姿に無いピンは null (表のピンだけが書けるので、来ない)。
 */
export function lookPinX(_look: DeviceLookName, pin: string, rect: LookRect, side: 'top' | 'bottom', pxPerMm: number): number | null {
  if (!Object.hasOwn(PROBE_SLOTS, pin)) return null;
  const slot = PROBE_SLOTS[pin];
  if (slot === undefined) return null;
  const mm = portCentre(slot.port) + slot.offset;
  return side === 'top' ? rect.x + mm * pxPerMm : rect.x + rect.width - mm * pxPerMm;
}

/** 機器の USB の口 (基板の側と反対の辺の真ん中。差し込みが入る縁)。 */
export function lookUsbPort(_look: DeviceLookName, rect: LookRect, side: 'top' | 'bottom', pxPerMm: number): UsbPort {
  const mouth = (CASE_END - MM.usbJut) * pxPerMm;
  return side === 'top'
    ? { x: rect.x + rect.width / 2, y: rect.y + mouth, dir: 'up', kind: 'micro-b' }
    : { x: rect.x + rect.width / 2, y: rect.y + rect.height - mouth, dir: 'down', kind: 'micro-b' };
}

export type LookOptions = {
  readonly rect: LookRect;
  readonly side: 'top' | 'bottom';
  /** 姿に刷る名前 (`label`。書かなければ製品の正式名称)。 */
  readonly label: string;
  readonly scale: number;
  readonly pxPerMm: number;
  /** 書いたピン (配線の名前) と、刷る字 (`UGND` なら GND)。名前は姿が口の上に縦に刷る。 */
  readonly pins: readonly { readonly name: string; readonly text: string }[];
};

/**
 * Debug Probe の姿を**実寸で**描く。ケース (半透明の白) の中に緑の基板、USB の口 (外の辺)、3 ピンの口 2 つ
 * (基板の側の辺) と `U` `D` の字、LED 5 つ、名前。**ピンの名前も姿が描く** — 口の中のピンは 1 mm 間隔なので、
 * 名前は口の上に縦に刷る。ピンの足 (帯の外へ出る短い線) は呼ぶ側が描く。
 */
export function drawDeviceLook(_look: DeviceLookName, options: LookOptions): string {
  const { rect, side, label, scale, pxPerMm, pins } = options;
  const top = side === 'top';
  const mm = (value: number): number => value * pxPerMm;
  // 上の帯の向き (USB が上、口が下) で mm を測り、下の帯では 180 度回す。
  const px = (fromLeft: number): number => (top ? rect.x + mm(fromLeft) : rect.x + rect.width - mm(fromLeft));
  const py = (fromTop: number): number => (top ? rect.y + mm(fromTop) : rect.y + rect.height - mm(fromTop));
  const box = (left: number, upper: number, width: number, height: number, attrs: Record<string, string | number>): string => {
    const xs = [px(left), px(left + width)];
    const ys = [py(upper), py(upper + height)];
    return element('rect', {
      x: num(Math.min(...xs)), y: num(Math.min(...ys)), width: num(Math.abs(xs[1]! - xs[0]!)), height: num(Math.abs(ys[1]! - ys[0]!)),
      ...attrs,
    });
  };
  const centreX = CASE_SIDE + MM.boardShort / 2;
  const boardBottom = CASE_END + MM.boardLong;

  const casing = element('rect', {
    class: 'cf-look-case', x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: num(mm(3.5)),
    fill: CASE_FILL, stroke: CASE_EDGE, 'stroke-width': 1.5,
  });
  const board = box(CASE_SIDE, CASE_END, MM.boardShort, MM.boardLong, {
    class: 'cf-look-board', rx: num(mm(1)), fill: BOARD_FILL, stroke: BOARD_EDGE,
  });
  const usb = box(centreX - MM.usbWidth / 2, CASE_END - MM.usbJut, MM.usbWidth, MM.usbDepth, {
    rx: num(mm(0.5)), fill: METAL_FILL, stroke: METAL_EDGE,
  });

  const font = 8 * scale;
  const pinFont = Math.min(font, mm(MM.pinStep) * 0.9);
  const housingTop = boardBottom - MM.housingDepth;
  const ports = (['U', 'D'] as const).map((port) => {
    const centre = portCentre(port);
    const housing = box(centre - MM.housingWidth / 2, housingTop, MM.housingWidth, MM.housingDepth, {
      rx: 1.5, fill: HOUSING_FILL, stroke: HOUSING_EDGE,
    });
    // ピンの金物: 口の奥からケースの縁まで (線はケースの外で足に続く)。
    const leads = [-1, 0, 1].map((step) => {
      const x = px(centre + step * MM.pinStep);
      return element('line', { x1: num(x), y1: num(py(housingTop + 1)), x2: num(x), y2: num(py(boardBottom + CASE_END)), stroke: METAL_EDGE, 'stroke-width': 1.2 });
    }).join('');
    // 口の字は口の上 (ピンの名前のさらに上)。
    const mark = svgText(px(centre), py(housingTop - 5.2) + font * 0.4, port, { 'font-size': num(font * 1.15), 'font-weight': 'bold', fill: SILK });
    return housing + leads + mark;
  }).join('');
  // ピンの名前は口のすぐ上に、下から上へ読む縦書き (上の帯の向き。下の帯でも字は読める向きのまま)。
  const names = pins.flatMap((pin) => {
    const slot = Object.hasOwn(PROBE_SLOTS, pin.name) ? PROBE_SLOTS[pin.name] : undefined;
    if (slot === undefined) return [];
    const x = px(portCentre(slot.port) + slot.offset);
    const y = py(housingTop - 0.6);
    const anchor = top ? 'start' : 'end';
    return [element('g', { transform: `translate(${num(x + pinFont * 0.35)} ${num(y)}) rotate(-90)` },
      svgText(0, 0, pin.text, { 'font-size': num(pinFont), fill: SILK, anchor }))];
  }).join('');

  const leds = LEDS.map((fill, index) =>
    box(CASE_SIDE + 2.5 + index * 1.6, CASE_END + 6.5, 1.0, 0.7, { fill, stroke: '#1d2b22', 'stroke-width': 0.5 })).join('');
  // 名前は基板の幅に収める (字幅は字の大きさの 0.6 倍で見積もる)。
  const nameSize = Math.min(font * 1.2, mm(MM.boardShort - 2) / Math.max(1, label.length * 0.6));
  const name = svgText(px(centreX), py(CASE_END + 13) + nameSize * 0.35, label, { 'font-size': num(nameSize), fill: SILK });

  // USB の口はケースの開口から見えるので、ケースと基板より上に描く。
  return `${casing}${board}${usb}${leds}${name}${ports}${names}`;
}

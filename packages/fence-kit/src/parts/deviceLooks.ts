import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';

/**
 * 基板の外の機器を**箱の代わりに実物に寄せた姿**で描く (52 の docs/157)。今は Raspberry Pi の
 * Debug Probe だけ。**寸法は実物の比ではない** — 機器の帯 (高さが決まっている) に 6 本のピンと
 * 名前を並べるため、横に広げてある。実物から写すのは、ケースと基板の色・USB の口と 3 ピンの口が
 * 反対の辺にあること・口の `U` `D` の字・LED の並び。
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

/** 姿の幅 (px、字の倍率 1 のとき)。帯に入りきらなければ呼ぶ側が縮める。 */
const PROBE_WIDTH = 200;
/** 3 ピンの口の真ん中 (幅に対する比)。U が左、D が右。 */
const U_CENTRE = 0.27;
const D_CENTRE = 0.73;
/** 口の中のピンの間 (幅に対する比)。実物は 1 mm だが、線と名前が並ぶように広げる。 */
const PIN_STEP = 0.085;

/** 口ごとのピンの並び (上の帯で左から。公式のケーブルの図の色の順: 橙・黒・黄)。 */
const PROBE_SLOTS: Readonly<Record<string, number>> = {
  TX: U_CENTRE - PIN_STEP, UGND: U_CENTRE, RX: U_CENTRE + PIN_STEP,
  SC: D_CENTRE - PIN_STEP, DGND: D_CENTRE, SD: D_CENTRE + PIN_STEP,
};

const CASE_FILL = '#eef0f2';
const CASE_EDGE = '#9aa1a9';
const BOARD_FILL = '#4f9f74';
const BOARD_EDGE = '#357552';
const SILK = '#ffffff';
const HOUSING_FILL = '#f3efe2';
const HOUSING_EDGE = '#a59d86';
const METAL_FILL = '#c9cfd8';
const METAL_EDGE = '#8a929c';
/** LED の並び (幅に対する比): 1 つ目の位置・間・LED の列が占める幅。 */
const LED_START = 0.08;
const LED_STEP = 0.035;
const LED_SPAN = LED_START + 4 * LED_STEP + 0.02;
/** LED の色 (回路図 RP-008194-DS: 電源の赤と、UART・DAP の緑と黄)。 */
const LEDS = ['#e5484d', '#3fb950', '#e3b341', '#3fb950', '#e3b341'] as const;

/** ピンの名前を辺から内へずらす量 (px)。3 ピンの口の胴の上に重ねない。 */
export const lookNameInset = (_look: DeviceLookName): number => HOUSING_HEIGHT + 2;

/** ピンの名前の色 (緑の基板の上の白い刷り)。 */
export const lookNameInk = (_look: DeviceLookName): string => SILK;

/** 姿の幅 (px)。 */
export const lookWidth = (_look: DeviceLookName, scale: number): number => PROBE_WIDTH * Math.max(scale, 1);

/**
 * ピンの x (px)。**どのピンを書いたかに依らず、口の中の位置は実物で決まる**。
 * 姿に無いピンは null (表のピンだけが書けるので、来ない)。
 */
export function lookPinX(_look: DeviceLookName, pin: string, rect: LookRect, side: 'top' | 'bottom'): number | null {
  if (!Object.hasOwn(PROBE_SLOTS, pin)) return null;
  const fraction = PROBE_SLOTS[pin] ?? 0.5;
  return rect.x + rect.width * (side === 'top' ? fraction : 1 - fraction);
}

/** 機器の USB の口 (基板の側と反対の辺の真ん中)。 */
export function lookUsbPort(_look: DeviceLookName, rect: LookRect, side: 'top' | 'bottom'): UsbPort {
  return side === 'top'
    ? { x: rect.x + rect.width / 2, y: rect.y - MICRO_JUT, dir: 'up', kind: 'micro-b' }
    : { x: rect.x + rect.width / 2, y: rect.y + rect.height + MICRO_JUT, dir: 'down', kind: 'micro-b' };
}

/** micro-B の口がケースの縁から出る量 (px)。寸法図で 1.3 mm。 */
const MICRO_JUT = 2;
const MICRO_WIDTH = 26;
const MICRO_DEPTH = 9;
const HOUSING_HEIGHT = 9;
const BOARD_INSET = 5;

export type LookOptions = {
  readonly rect: LookRect;
  readonly side: 'top' | 'bottom';
  /** 姿に刷る名前 (`label`、無ければ型番の代わりの字)。 */
  readonly label: string;
  readonly scale: number;
};

/**
 * Debug Probe の姿。ケース (半透明の白) の中に緑の基板、USB の口 (外の辺)、3 ピンの口 2 つ
 * (基板の側の辺) と `U` `D` の字、LED 5 つ、名前。ピンの足と名前は呼ぶ側が描く (箱と同じ所)。
 */
export function drawDeviceLook(_look: DeviceLookName, options: LookOptions): string {
  const { rect, side, label, scale } = options;
  const top = side === 'top';
  // 上の帯の姿を基準に、下の帯では 180 度回す (y は縦に折り返し、x も折り返す)。
  const fx = (fraction: number): number => rect.x + rect.width * (top ? fraction : 1 - fraction);
  /** 外の辺 (USB の側) から `depth` 内の y。 */
  const fromOuter = (depth: number): number => (top ? rect.y + depth : rect.y + rect.height - depth);
  const box = (cx: number, cy: number, width: number, height: number, attrs: Record<string, string | number>): string =>
    element('rect', { x: num(cx - width / 2), y: num(cy - height / 2), width: num(width), height: num(height), ...attrs });

  const casing = element('rect', {
    class: 'cf-look-case', x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: 9,
    fill: CASE_FILL, stroke: CASE_EDGE, 'stroke-width': 1.5,
  });
  const board = element('rect', {
    class: 'cf-look-board',
    x: num(rect.x + BOARD_INSET), y: num(rect.y + BOARD_INSET),
    width: num(rect.width - 2 * BOARD_INSET), height: num(rect.height - 2 * BOARD_INSET), rx: 5,
    fill: BOARD_FILL, stroke: BOARD_EDGE,
  });
  const usbY = top ? rect.y - MICRO_JUT + MICRO_DEPTH / 2 : rect.y + rect.height + MICRO_JUT - MICRO_DEPTH / 2;
  const usb = box(rect.x + rect.width / 2, usbY, MICRO_WIDTH, MICRO_DEPTH, { rx: 2, fill: METAL_FILL, stroke: METAL_EDGE });

  const font = 8 * scale;
  const housingY = top ? rect.y + rect.height - HOUSING_HEIGHT / 2 : rect.y + HOUSING_HEIGHT / 2;
  const housingWidth = rect.width * PIN_STEP * 2 + 10;
  const ports = ([['U', U_CENTRE], ['D', D_CENTRE]] as const).map(([mark, centre]) => {
    const housing = box(fx(centre), housingY, housingWidth, HOUSING_HEIGHT, { rx: 1.5, fill: HOUSING_FILL, stroke: HOUSING_EDGE });
    // 口の字は口の左脇 (ピンの名前は口の内側に並ぶので、そこを避ける)。
    const markX = fx(centre) - housingWidth / 2 - 12;
    const markSize = font * 1.15;
    const markY = top ? rect.y + rect.height - BOARD_INSET - 2 : rect.y + BOARD_INSET + 2 + markSize * 0.75;
    return housing + svgText(markX, markY, mark, { 'font-size': num(font * 1.15), 'font-weight': 'bold', fill: SILK });
  }).join('');

  const ledY = fromOuter(MICRO_DEPTH + 8);
  const leds = LEDS.map((fill, index) =>
    box(fx(LED_START + index * LED_STEP), ledY, 4, 3, { fill, stroke: '#1d2b22', 'stroke-width': 0.5 })).join('');
  // 帯が詰まって姿が縮められても、名前は LED の右の幅に収める (字幅は字の大きさの 0.6 倍で見積もる)。
  const room = rect.width * (1 - 2 * LED_SPAN) - 2 * BOARD_INSET;
  const nameSize = Math.min(font * 1.2, room / Math.max(1, label.length * 0.6));
  const name = svgText(rect.x + rect.width / 2, fromOuter(MICRO_DEPTH + 10) + nameSize * 0.35, label, {
    'font-size': num(nameSize), fill: SILK,
  });

  return `${usb}${casing}${board}${leds}${name}${ports}`;
}

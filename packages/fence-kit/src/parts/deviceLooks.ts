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
 * 姿とケーブルの大きさ (`size:`)。**既定は `medium`** (52 の docs/157)。
 * - `large`: 実寸 (図が大きくなる)
 * - `medium`: 口とコネクタは実寸、全体 (基板・ケース・差し込みの胴の長さ) は小さくする
 * - `small`: 口とコネクタも実寸より小さくし、全体も小さくする
 */
export type PartSize = 'large' | 'medium' | 'small';
export const DEFAULT_PART_SIZE: PartSize = 'medium';
export const partSizes = (): readonly PartSize[] => ['large', 'medium', 'small'];
/** 綴りから大きさを引く。知らない綴りは null。 */
export const lookupPartSize = (written: string): PartSize | null => {
  const key = written.trim().toLowerCase();
  return (partSizes() as readonly string[]).includes(key) ? key as PartSize : null;
};

/** Debug Probe の寸法 (mm)。大きさごとに 1 組。位置は上の帯の向き (USB が上) で、ケースの左上からの mm。 */
type ProbeGeometry = {
  readonly boardShort: number; readonly boardLong: number;
  /** ケースが基板の縁から外へ出る量 (左右と上下)。 */
  readonly caseSide: number; readonly caseEnd: number;
  readonly usbWidth: number; readonly usbDepth: number; readonly usbJut: number;
  /** 3 ピンの口: 基板の真ん中の線からの隔たり・口の中のピンの間・胴の幅と奥行き。 */
  readonly portOffset: number; readonly pinStep: number; readonly housingWidth: number; readonly housingDepth: number;
  /** LED の列 (左端・上下の位置・間・大きさ) と名前の高さ (ケースの上の縁から)。 */
  readonly ledLeft: number; readonly ledTop: number; readonly ledStep: number; readonly ledWidth: number; readonly ledHeight: number;
  readonly nameTop: number;
  readonly corner: number;
};

/**
 * `large` は実物の寸法。**寸法図 RP-008192-DS** から: 基板 32 × 22 mm、USB の口 (micro-B) は短辺の真ん中で
 * 基板の縁から 1.3 mm 出る。3 ピンの口 (JST SH の横挿し SM03B) は反対の短辺で、基板の真ん中の線から ±3.8 mm
 * (上の帯の向きで左が U、右が D)。口の中のピンは 1 mm 間隔 (3 ピンのデバッグコネクタの仕様 RP-003139-SP)。
 * ケースの外寸は 31 × 37 mm (**公式の値は無く、Elektor のレビューの実測**。基板の左右に 4.5 mm、上下に 2.5 mm ずつ)。
 */
const LARGE: ProbeGeometry = {
  boardShort: 22, boardLong: 32, caseSide: 4.5, caseEnd: 2.5,
  usbWidth: 7.5, usbDepth: 5.0, usbJut: 1.3,
  portOffset: 3.8, pinStep: 1.0, housingWidth: 5.8, housingDepth: 4.25,
  ledLeft: 7, ledTop: 9, ledStep: 1.6, ledWidth: 1.0, ledHeight: 0.7, nameTop: 15.5, corner: 3.5,
};
/** `medium`: 口 (USB・3 ピン) は実寸のまま、基板を 18 × 24 mm、ケースを 21 × 27 mm に縮める。 */
const MEDIUM: ProbeGeometry = {
  ...LARGE, boardShort: 18, boardLong: 24, caseSide: 1.5, caseEnd: 1.5,
  ledLeft: 3.5, ledTop: 7.3, nameTop: 11.5, corner: 2.5,
};
/** `small`: 口も 0.7 倍にし、基板を 13 × 19 mm、ケースを 15 × 21 mm に縮める (2 行の名前と口の字が重ならない背)。 */
const SMALL_PORT = 0.7;
const SMALL: ProbeGeometry = {
  boardShort: 13, boardLong: 19, caseSide: 1, caseEnd: 1,
  usbWidth: LARGE.usbWidth * SMALL_PORT, usbDepth: LARGE.usbDepth * SMALL_PORT, usbJut: LARGE.usbJut * SMALL_PORT,
  portOffset: LARGE.portOffset * SMALL_PORT, pinStep: LARGE.pinStep * SMALL_PORT,
  housingWidth: LARGE.housingWidth * SMALL_PORT, housingDepth: LARGE.housingDepth * SMALL_PORT,
  ledLeft: 2.2, ledTop: 5, ledStep: 1.2, ledWidth: 0.8, ledHeight: 0.5, nameTop: 8.2, corner: 2,
};
const GEOMETRY: Readonly<Record<PartSize, ProbeGeometry>> = { large: LARGE, medium: MEDIUM, small: SMALL };

/** 口ごとのピンの並び (上の帯で左から。1 番 = 橙・2 番 = 黒・3 番 = 黄。公式のケーブルの図の色の順)。値はピンの間を単位にした口の真ん中からの隔たり。 */
const PROBE_SLOTS: Readonly<Record<string, { readonly port: 'U' | 'D'; readonly step: number }>> = {
  TX: { port: 'U', step: -1 }, UGND: { port: 'U', step: 0 }, RX: { port: 'U', step: 1 },
  SC: { port: 'D', step: -1 }, DGND: { port: 'D', step: 0 }, SD: { port: 'D', step: 1 },
};

/** 口の真ん中 (上の帯の向きで、ケースの左の縁からの mm)。 */
const portCentre = (g: ProbeGeometry, port: 'U' | 'D'): number =>
  g.caseSide + g.boardShort / 2 + (port === 'U' ? -g.portOffset : g.portOffset);

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

/** USB の口の内側の字 (種類) の大きさと色 (金物の銀に読める濃い灰)。 */
const USB_FONT = 6.5;
const USB_INK = '#2b2f36';
/** 色つきのピンの名前の縁の太さ (px)。 */
const NAME_HALO = 2.5;
/** 名前の行の送り (字の大きさに対する比)。字と字の間が 1/4 em。 */
const NAME_LINE = 1.25;
/** 姿に刷る名前の字の大きさ (USB の差し込みに刷る字と同じ)。 */
const LABEL_FONT = 9;
/** これより長い名前は 2 行に分ける (字の数)。 */
const LABEL_WRAP = 12;

/** 名前を行に分ける。長くて空白があれば、真ん中に近い空白で 2 行に。 */
function labelLines(label: string): readonly string[] {
  if (label.length <= LABEL_WRAP || !label.includes(' ')) return [label];
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index ?? 0);
  const middle = label.length / 2;
  const cut = spaces.reduce((best, at) => (Math.abs(at - middle) < Math.abs(best - middle) ? at : best));
  return [label.slice(0, cut), label.slice(cut + 1)];
}

/** 2.54 mm = 1 ピッチの図で、1 mm が何 px か。 */
export const pxPerMmOf = (pitch: number): number => pitch / 2.54;

/** 姿の幅と高さ (px)。基板とケースの mm に `pxPerMm` を掛ける。 */
export const lookSize = (
  _look: DeviceLookName, pxPerMm: number, size: PartSize = DEFAULT_PART_SIZE,
): { readonly width: number; readonly height: number } => {
  const g = GEOMETRY[size];
  return { width: (g.boardShort + 2 * g.caseSide) * pxPerMm, height: (g.boardLong + 2 * g.caseEnd) * pxPerMm };
};

/**
 * ピンの x (px)。**どのピンを書いたかに依らず、口の中の位置は実物で決まる**。
 * 姿に無いピンは null (表のピンだけが書けるので、来ない)。
 */
export function lookPinX(
  _look: DeviceLookName, pin: string, rect: LookRect, side: 'top' | 'bottom', pxPerMm: number, size: PartSize = DEFAULT_PART_SIZE,
): number | null {
  if (!Object.hasOwn(PROBE_SLOTS, pin)) return null;
  const slot = PROBE_SLOTS[pin];
  if (slot === undefined) return null;
  const g = GEOMETRY[size];
  const mm = portCentre(g, slot.port) + slot.step * g.pinStep;
  return side === 'top' ? rect.x + mm * pxPerMm : rect.x + rect.width - mm * pxPerMm;
}

/** 機器の USB の口 (基板の側と反対の辺の真ん中。差し込みが入る縁)。 */
export function lookUsbPort(
  _look: DeviceLookName, rect: LookRect, side: 'top' | 'bottom', pxPerMm: number, size: PartSize = DEFAULT_PART_SIZE,
): UsbPort {
  const g = GEOMETRY[size];
  const mouth = (g.caseEnd - g.usbJut) * pxPerMm;
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
  /** 大きさ。書かなければ `medium`。 */
  readonly size?: PartSize;
  /** ピンの名前の字の大きさ (px)。**ほかの機器のピンの名前と同じ大きさ**を渡す。 */
  readonly pinFont: number;
  /**
   * 書いたピン (配線の名前) と、刷る字 (`UGND` なら GND)。名前は姿が口の上に縦に刷る。
   * `color` を渡すとその色で刷る (付属のケーブルの色: 橙・黒・黄)。渡さなければ白。
   */
  readonly pins: readonly { readonly name: string; readonly text: string; readonly color?: string }[];
};

/**
 * Debug Probe の姿を描く。ケース (半透明の白) の中に緑の基板、USB の口 (外の辺)、3 ピンの口 2 つ
 * (基板の側の辺) と `U` `D` の字、LED 5 つ、名前。**ピンの名前も姿が描く** — 口の中のピンは 1 mm 間隔なので、
 * 名前は口の上に縦に刷る。ピンの足 (帯の外へ出る短い線) は呼ぶ側が描く。
 */
export function drawDeviceLook(_look: DeviceLookName, options: LookOptions): string {
  const { rect, side, label, scale, pxPerMm, pins } = options;
  const size = options.size ?? DEFAULT_PART_SIZE;
  const g = GEOMETRY[size];
  // ピンの名前はどの大きさでも、ほかの機器のピンの名前と同じ大きさ。
  const { pinFont } = options;
  // 名前の並びの間 (縦書きの行の送り) は 1.25 em (字と字の間が 1/4 em)。口の中のピンの間 (1 mm) より広いので、
  // 名前はピンの真上ではなく、口の真ん中から行の送りずつ左右へ広げて並べる (並びの順はピンと同じ)。
  const nameStep = (pinFont * NAME_LINE) / pxPerMm;
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
  const centreX = g.caseSide + g.boardShort / 2;
  const boardBottom = g.caseEnd + g.boardLong;

  const casing = element('rect', {
    class: 'cf-look-case', x: num(rect.x), y: num(rect.y), width: num(rect.width), height: num(rect.height), rx: num(mm(g.corner)),
    fill: CASE_FILL, stroke: CASE_EDGE, 'stroke-width': 1.5,
  });
  const board = box(g.caseSide, g.caseEnd, g.boardShort, g.boardLong, {
    class: 'cf-look-board', rx: num(mm(1)), fill: BOARD_FILL, stroke: BOARD_EDGE,
  });
  const usbFont = Math.min(USB_FONT * scale, (mm(g.usbWidth) * 0.85) / (USB_STAMP['micro-b'].length * 0.55));
  const usb = box(centreX - g.usbWidth / 2, g.caseEnd - g.usbJut, g.usbWidth, g.usbDepth, {
    rx: num(mm(0.5)), fill: METAL_FILL, stroke: METAL_EDGE,
  })
    // 口の内側に種類 (`micro-B`) を刷る。字は口の幅に収める。
    + svgText(px(centreX), py(g.caseEnd - g.usbJut + g.usbDepth / 2) + usbFont * 0.35, USB_STAMP['micro-b'], { 'font-size': num(usbFont), fill: USB_INK });

  const font = 8 * scale;
  const housingTop = boardBottom - g.housingDepth;
  const ports = (['U', 'D'] as const).map((port) => {
    const centre = portCentre(g, port);
    const housing = box(centre - g.housingWidth / 2, housingTop, g.housingWidth, g.housingDepth, {
      rx: 1.5, fill: HOUSING_FILL, stroke: HOUSING_EDGE,
    });
    // ピンの金物: 口の奥からケースの縁まで (線はケースの外で足に続く)。
    const leads = [-1, 0, 1].map((step) => {
      const x = px(centre + step * g.pinStep);
      return element('line', { x1: num(x), y1: num(py(housingTop + g.housingDepth * 0.25)), x2: num(x), y2: num(py(boardBottom + g.caseEnd)), stroke: METAL_EDGE, 'stroke-width': 1.2 });
    }).join('');
    // 口の字は口の上 (ピンの名前のさらに上)。
    const mark = svgText(px(centre), py(housingTop - 1.2) - (top ? 1 : -1) * (pinFont * 2.2 + font * 0.6) + font * 0.4, port, { 'font-size': num(font * 1.15), 'font-weight': 'bold', fill: SILK });
    return housing + leads + mark;
  }).join('');
  // ピンの名前は口のすぐ上に、下から上へ読む縦書き (上の帯の向き。下の帯でも字は読める向きのまま)。
  const names = pins.flatMap((pin) => {
    const slot = Object.hasOwn(PROBE_SLOTS, pin.name) ? PROBE_SLOTS[pin.name] : undefined;
    if (slot === undefined) return [];
    const x = px(portCentre(g, slot.port) + slot.step * nameStep);
    const y = py(housingTop - 0.6);
    const anchor = top ? 'start' : 'end';
    // 色つきの字は、緑の基板の上で読めるよう白い縁で囲む。
    const ink = pin.color === undefined
      ? { fill: SILK }
      : { fill: pin.color, halo: SILK, haloWidth: NAME_HALO, 'font-weight': 'bold' };
    return [element('g', { transform: `translate(${num(x + pinFont * 0.35)} ${num(y)}) rotate(-90)` },
      svgText(0, 0, pin.text, { 'font-size': num(pinFont), anchor, ...ink }))];
  }).join('');

  const leds = LEDS.map((fill, index) =>
    box(g.ledLeft + index * g.ledStep, g.ledTop, g.ledWidth, g.ledHeight, { fill, stroke: '#1d2b22', 'stroke-width': 0.5 })).join('');
  // 名前は USB の差し込みに刷る字と同じ大きさ。長い名前 (`Raspberry Pi Debug Probe`) は真ん中に近い空白で 2 行に分ける。
  // 基板の幅に収まらなければ縮める (字幅は字の大きさの 0.6 倍で見積もる)。
  const lines = labelLines(label);
  const widest = Math.max(...lines.map((line) => line.length));
  const nameSize = Math.min(LABEL_FONT * scale, mm(g.boardShort - 2) / Math.max(1, widest * 0.6));
  const name = lines.map((line, index) => svgText(
    px(centreX), py(g.nameTop) + nameSize * (0.35 + (index - (lines.length - 1) / 2) * NAME_LINE), line,
    { 'font-size': num(nameSize), fill: SILK },
  )).join('');

  // USB の口はケースの開口から見えるので、ケースと基板より上に描く。
  return `${casing}${board}${usb}${leds}${name}${ports}${names}`;
}

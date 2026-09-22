import { element } from '../markup.ts';
import { num, svgText } from '../svg.ts';
import { textWidth } from '../textFit.ts';
import { REAL_INK } from './bodies.ts';
import type { BodyInk } from './bodies.ts';
import type { ChipBox, ChipPoint } from './chips.ts';

/**
 * 基板に載せるコネクタ (USB)。**表と姿を 3 つのフェンスで分け合う** (52 の docs/58)。
 * どの足が何かは板に依らないので、`boards.ts` (マイコンボードの足) と同じく
 * ここに 1 つだけ置く。
 *
 * **足は表の順に書く。** 実物の変換基板は足の並びが製品ごとに違うので、並びは
 * 決め打たず、**書いた穴がそのまま足** (変圧器と同じ)。穴は表の順に対応させ、
 * 書いた数だけ使う — 電源だけの変換基板は 2 本 (`VBUS GND`)、USB 2.0 は 4 本、
 * Type-C の CC まで 6 本。**表の順を規格のピン番号 (VBUS D- D+ GND) にしない**のは、
 * 2 本だけ書いたときに電源の組になるようにするため。
 *
 * **姿は変換基板ごと**描く。Type-C の受け口は面実装で穴には挿せず、実物も
 * 変換基板に載せてから挿す (`transistor/sot23-dip` と同じ理由、52 の docs/18)。
 * 差し込み口は**板の縁に近い側**を向く — ケーブルを板の外へ出す置き方が普通で、
 * 向きを書かせる語を足すより、置いた場所で決まるほうが書く量が少ない。
 */

type ConnectorSpec = {
  /** 部品リストと図に出す名前。 */
  readonly name: string;
  /** 足の名前。**書く穴の順**。 */
  readonly pins: readonly string[];
  /** 受け口 (メス) の金物。幅と奥行き (mm)。 */
  readonly receptacle: { readonly width: number; readonly depth: number };
  /** 差し込み (オス) の金物。幅、基板の縁から出る長さ、基板に載る根元 (mm)。 */
  readonly plug: { readonly width: number; readonly reach: number; readonly root: number };
  /** Type-C は口が長丸。Type-A は角。 */
  readonly round: boolean;
};

const CONNECTORS: Record<string, ConnectorSpec> = {
  // 受け口 13.1 × 14mm (USB 2.0 の縦型でない標準品)、差し込みは 12mm 幅で 12mm 出る。
  'usb-a': {
    name: 'USB Type-A',
    pins: ['VBUS', 'GND', 'D+', 'D-'],
    receptacle: { width: 13.1, depth: 14 },
    plug: { width: 12, reach: 12, root: 3 },
    round: false,
  },
  // 受け口 8.94 × 7.35mm (ミッドマウント)、差し込みは 8.25mm 幅で 6.65mm 挿さる。
  'usb-c': {
    name: 'USB Type-C',
    pins: ['VBUS', 'GND', 'D+', 'D-', 'CC1', 'CC2'],
    receptacle: { width: 8.94, depth: 7.35 },
    plug: { width: 8.25, reach: 6.65, root: 2.5 },
    round: true,
  },
};

/** 書ける姿。**書かなければ受け口** (基板に載るのはたいていメス)。 */
export const CONNECTOR_LOOKS = ['male', 'female'] as const;

/** 書く足の最少。1 本ではどちらの線にもならない。 */
export const MIN_CONNECTOR_PINS = 2;

export type Connector = { readonly name: string; readonly pins: readonly string[] };

export const connectorNames = (): readonly string[] => Object.keys(CONNECTORS);

/**
 * 種類名は入力から来るので、必ず自分の持ち物だけを引く (`boards.ts` と同じ理由)。
 * 素の添字だと `constructor` が Object.prototype から拾えてしまう。
 */
const specOf = (type: string): ConnectorSpec | null =>
  (Object.hasOwn(CONNECTORS, type) ? CONNECTORS[type] ?? null : null);

export function lookupConnector(type: string): Connector | null {
  const spec = specOf(type);
  return spec === null ? null : { name: spec.name, pins: spec.pins };
}

/** 書いた足の数ぶんの名前。表より多い足には名前が無い (呼ぶ側が断る)。 */
export const connectorPinNames = (type: string, count: number): readonly string[] =>
  specOf(type)?.pins.slice(0, Math.max(0, count)) ?? [];

/** 差し込み口の向き (図の上の向き)。 */
export type ConnectorFacing = 'up' | 'down' | 'left' | 'right';

/** 足の並びが横か。**全部の足で見る** — 表の順に書くので、1 番と 2 番が隣とは限らない。 */
function runsAlongX(points: readonly ChipPoint[]): boolean {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
}

const middle = (values: readonly number[]): number => (Math.min(...values) + Math.max(...values)) / 2;

/**
 * 差し込み口を向ける先。**足の並びに直角な向きのうち、`centre` から遠い側** —
 * 板の中心を渡せば近い縁、ブレッドボードなら溝の反対側になる。
 */
export function connectorFacing(points: readonly ChipPoint[], centre: ChipPoint): ConnectorFacing {
  if (points.length === 0) return 'up';
  if (runsAlongX(points)) return middle(points.map((point) => point.y)) <= centre.y ? 'up' : 'down';
  return middle(points.map((point) => point.x)) <= centre.x ? 'left' : 'right';
}

export type ConnectorShape = {
  readonly type: string;
  /** `male` / `female`。null は受け口。 */
  readonly variant: string | null;
  /** 足の穴の点。**書いた順** (表の順)。 */
  readonly points: readonly ChipPoint[];
  readonly pitch: number;
  readonly facing: ConnectorFacing;
};

/** 足の点の周り (ピッチ比)。ランドの半径。 */
const PAD = 0.3;
/** 足の列の後ろに残す基板 (ピッチ比)。 */
const BACK = 0.5;
/** 足の名前の字の大きさの上限と、字どうしの隙間。 */
const NAME_FONT = 6;
const NAME_GAP = 2;
/** 字の頭が基準線から出る高さの比 (大文字の高さ)。 */
const NAME_CAP = 0.72;
/**
 * 字幅の見積もり (`textWidth`) に掛ける余裕。**横に伸ばす字だけ**に効かせる —
 * 見積もりは英数字を字の大きさの 0.55 と数えるが、`VBUS` は実際にはもう少し広く、
 * そのまま金物を置くと字の尻が金物に食われた (図を見て直した)。
 */
const NAME_SLACK = 1.2;
/** 字と金物の間。 */
const METAL_GAP = 2;
/** 金物の前に基板が残す縁 (mm)。受け口は基板の縁から少し出るのが普通。 */
const LIP = 0.5;
/** 金物の脇に残す基板 (mm)。 */
const SIDE = 1;

/** 局所座標の長方形。`a` は足の並ぶ向き、`b` は差し込み口の向き (足の列が 0)。 */
type Span = { readonly a0: number; readonly a1: number; readonly b0: number; readonly b1: number };

type Frame = {
  readonly spec: ConnectorSpec;
  readonly male: boolean;
  readonly mm: number;
  /** 足の局所座標。 */
  readonly pins: readonly { readonly a: number; readonly b: number }[];
  readonly names: readonly string[];
  readonly font: number;
  /** 足の名前を置く帯 (差し込み口の向きの範囲)。 */
  readonly band: { readonly b0: number; readonly b1: number };
  readonly plate: Span;
  readonly metal: Span;
  /** 局所座標 → 図の座標。 */
  readonly at: (a: number, b: number) => ChipPoint;
};

const AXES: Record<ConnectorFacing, { readonly u: ChipPoint; readonly v: ChipPoint }> = {
  up: { u: { x: 1, y: 0 }, v: { x: 0, y: -1 } },
  down: { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  left: { u: { x: 0, y: 1 }, v: { x: -1, y: 0 } },
  right: { u: { x: 0, y: 1 }, v: { x: 1, y: 0 } },
};

const sideways = (facing: ConnectorFacing): boolean => facing === 'left' || facing === 'right';

/**
 * 形を局所座標で組む。**描くのも外形を返すのもここから** — 別々に測ると、
 * 図では重なって見えるのに当たり判定は何も言わない、が起きる
 * (perfboard の約束 9)。
 */
function frameOf(shape: ConnectorShape): Frame | null {
  const spec = specOf(shape.type);
  const origin = shape.points[0];
  if (spec === null || origin === undefined) return null;

  const { u, v } = AXES[shape.facing];
  const mm = shape.pitch / 2.54;
  const raw = shape.points.map((point) => ({
    a: (point.x - origin.x) * u.x + (point.y - origin.y) * u.y,
    b: (point.x - origin.x) * v.x + (point.y - origin.y) * v.y,
  }));
  // **原点は足の並びの真ん中、いちばん前の足の列。** 金物は全部の足より前に来る。
  const centre = middle(raw.map((pin) => pin.a));
  const front = Math.max(...raw.map((pin) => pin.b));
  const pins = raw.map((pin) => ({ a: pin.a - centre, b: pin.b - front }));
  const at = (a: number, b: number): ChipPoint => ({
    x: origin.x + (centre + a) * u.x + (front + b) * v.x,
    y: origin.y + (centre + a) * u.y + (front + b) * v.y,
  });

  const names = spec.pins.slice(0, pins.length);
  const widest = Math.max(...names.map((name) => textWidth(name)));
  const along = [...pins.map((pin) => pin.a)].sort((x, y) => x - y);
  const gaps = along.slice(1).map((value, index) => value - (along[index] ?? value)).filter((gap) => gap > 0);
  // **横に並んだ名前は隣とぶつからない大きさ**に詰める。縦に並ぶときは字の高さが
  // ピッチより低ければよく、字は横へ伸ばせる。
  const room = Math.min(gaps.length === 0 ? shape.pitch : Math.min(...gaps), shape.pitch) - NAME_GAP;
  const font = sideways(shape.facing) ? NAME_FONT : Math.min(NAME_FONT, room / widest);
  const reach = sideways(shape.facing) ? font * widest * NAME_SLACK : font * NAME_CAP;
  const bandFrom = shape.pitch * PAD + 1.5;
  const band = { b0: bandFrom, b1: bandFrom + reach };

  const male = shape.variant === 'male';
  const metalFrom = band.b1 + METAL_GAP;
  const width = (male ? spec.plug.width : spec.receptacle.width) * mm;
  const rear = Math.min(...pins.map((pin) => pin.b)) - shape.pitch * BACK;
  const spread = Math.max(...pins.map((pin) => Math.abs(pin.a))) + shape.pitch * 0.5;
  const plateHalf = Math.max(spread, width / 2 + SIDE * mm);

  // 受け口は基板に載って縁から少し出る。差し込みは根元だけ基板に載り、先は外へ出る。
  const plateFront = male ? metalFrom + spec.plug.root * mm : metalFrom + (spec.receptacle.depth - LIP) * mm;
  const metalTo = male ? plateFront + spec.plug.reach * mm : metalFrom + spec.receptacle.depth * mm;

  return {
    spec,
    male,
    mm,
    pins,
    names,
    font,
    band,
    plate: { a0: -plateHalf, a1: plateHalf, b0: rear, b1: plateFront },
    metal: { a0: -width / 2, a1: width / 2, b0: metalFrom, b1: metalTo },
    at,
  };
}

/** 局所座標の長方形を図の上の長方形に。軸が 90 度単位なので、角 2 つで決まる。 */
function boxOf(frame: Frame, span: Span): ChipBox {
  const p = frame.at(span.a0, span.b0);
  const q = frame.at(span.a1, span.b1);
  const x = Math.min(p.x, q.x);
  const y = Math.min(p.y, q.y);
  return { x, y, width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) };
}

/** 基板と金物を合わせた外形。**当たり判定と画布の広げ方はこれを読む**。 */
export function connectorBox(shape: ConnectorShape): ChipBox {
  const frame = frameOf(shape);
  if (frame === null) return { x: 0, y: 0, width: 0, height: 0 };
  const plate = boxOf(frame, frame.plate);
  const metal = boxOf(frame, frame.metal);
  const x = Math.min(plate.x, metal.x);
  const y = Math.min(plate.y, metal.y);
  return {
    x,
    y,
    width: Math.max(plate.x + plate.width, metal.x + metal.width) - x,
    height: Math.max(plate.y + plate.height, metal.y + metal.height) - y,
  };
}

/** 変換基板 (青いガラエポ) と、白い字。 */
const PLATE = '#1f3f78';
const PLATE_EDGE = '#132a52';
const SILK = '#eef2f8';
/** ランド (金めっき) と、挿したピンヘッダの頭。 */
const LAND = '#d4ae4c';
const HEADER = '#4b5058';
/** 金物と、口の奥の暗がり。 */
const METAL = '#c3c8ce';
const METAL_EDGE = '#7f868d';
const MOUTH = '#2b2f33';

type ShapeOf = (frame: Frame, span: Span, attributes: Record<string, string | number>) => string;

const rectOf: ShapeOf = (frame, span, attributes) => {
  const box = boxOf(frame, span);
  return element('rect', {
    x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height), ...attributes,
  });
};

/**
 * 金物の上の見分けどころ。**上から見た姿**で描く (52 の docs/18 — 1 つの図に
 * 視点を混ぜない)。
 *
 * - 受け口は口の縁の暗がり。Type-C は長丸、Type-A は角。Type-A は天板の
 *   ばね (2 つの窓) も見える
 * - 差し込みは基板の縁から外へ出る。Type-A は天板の 2 つの角窓が実物の目印
 */
function metalMarks(frame: Frame, ink: BodyInk): string {
  const { metal, mm, spec } = frame;
  const width = metal.a1 - metal.a0;
  if (frame.male) {
    if (spec.round) {
      // Type-C の差し込みは薄い長丸。天板の真ん中に合わせ目が 1 本通る。
      const seam = { a0: -width * 0.36, a1: width * 0.36, b0: metal.b1 - 5.5 * mm, b1: metal.b1 - 5.2 * mm };
      return rectOf(frame, seam, { fill: ink.paint(METAL_EDGE) });
    }
    return [-1, 1].map((side) => rectOf(frame, {
      a0: side * width * 0.22 - mm, a1: side * width * 0.22 + mm, b0: metal.b1 - 5 * mm, b1: metal.b1 - 3 * mm,
    }, { fill: ink.paint(MOUTH) })).join('');
  }

  const lip = rectOf(frame, {
    a0: -width * 0.42, a1: width * 0.42, b0: metal.b1 - 1.3 * mm, b1: metal.b1 - 0.4 * mm,
  }, { fill: ink.paint(MOUTH), rx: num(spec.round ? 0.45 * mm : 0.1 * mm) });
  if (spec.round) return lip;
  const springs = [-1, 1].map((side) => rectOf(frame, {
    a0: side * width * 0.25 - 0.8 * mm, a1: side * width * 0.25 + 0.8 * mm,
    b0: metal.b1 - 4.2 * mm, b1: metal.b1 - 2 * mm,
  }, { fill: ink.paint(METAL_EDGE) })).join('');
  return lip + springs;
}

/** 足の名前。**基板に刷った字**なので白。いつも横書き (読む向きを変えない)。 */
function pinNames(frame: Frame, facing: ConnectorFacing, ink: BodyInk): string {
  const style = { 'font-size': num(frame.font), fill: ink.paint(SILK) };
  return frame.pins.map((pin, index) => {
    const name = frame.names[index] ?? '';
    if (sideways(facing)) {
      const point = frame.at(pin.a, frame.band.b0);
      return svgText(point.x, point.y + frame.font * NAME_CAP / 2, name, {
        ...style, anchor: facing === 'right' ? 'start' : 'end',
      });
    }
    // 字は基準線から上へ伸びるので、帯の下の縁 (図の上で) に基準線を置く。
    const near = frame.at(pin.a, frame.band.b0);
    const far = frame.at(pin.a, frame.band.b1);
    return svgText(near.x, Math.max(near.y, far.y), name, style);
  }).join('');
}

/**
 * USB コネクタを変換基板ごと描く。足はランドとピンヘッダの頭で、名前は基板に刷る。
 * 知らない種類は何も描かない (呼ぶ側が種類を確かめている)。
 */
export function drawConnector(shape: ConnectorShape & { readonly ink?: BodyInk }): string {
  const frame = frameOf(shape);
  if (frame === null) return '';
  const ink = shape.ink ?? REAL_INK;

  const plate = rectOf(frame, frame.plate, {
    rx: 2, fill: ink.paint(PLATE), stroke: ink.paint(PLATE_EDGE), 'stroke-width': 1,
  });
  const land = shape.pitch * PAD;
  const pins = frame.pins.map((pin) => {
    const point = frame.at(pin.a, pin.b);
    const head = land * 0.8;
    return element('circle', { cx: num(point.x), cy: num(point.y), r: num(land), fill: ink.paint(LAND) })
      + element('rect', {
        x: num(point.x - head / 2), y: num(point.y - head / 2), width: num(head), height: num(head),
        fill: ink.paint(HEADER),
      });
  }).join('');
  const metal = rectOf(frame, frame.metal, {
    rx: num((frame.spec.round ? 1.2 : 0.3) * frame.mm),
    fill: ink.paint(METAL), stroke: ink.paint(METAL_EDGE), 'stroke-width': 1,
  });

  return `${plate}${pins}${pinNames(frame, shape.facing, ink)}${metal}${metalMarks(frame, ink)}`;
}

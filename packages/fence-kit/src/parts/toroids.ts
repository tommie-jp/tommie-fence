import { element } from '../markup.ts';
import { num } from '../svg.ts';
import type { BodyInk } from './ink.ts';

/**
 * トロイダルコア (ドーナツ形の磁芯) の表。**実物の話で基板に依らない**ので、breadboard と
 * perfboard が共有する (52 の docs/136)。
 *
 * 型番は Amidon の呼び名 (`FT37-43` = 外径 0.37 インチのフェライト、混合 43)。**頭の `FT` がフェライト、
 * `T` が鉄粉**で、後ろの数が材質 (混合)。材質で使える周波数が違う (43 は 1〜50 MHz の広帯域、
 * 61 は 10〜200 MHz、鉄粉の 2 は 1〜30 MHz の同調用)。
 *
 * 外径は Amidon の寸法 (FT37・T37 は 0.375 インチ、FT50・T50 は 0.5 インチ) の丸めで、図の大きさを決める。
 * **AL 値は持たない** — 載せるなら資料で確かめてから (段 3、52 の docs/136)。
 */
export type ToroidMaterial = 'ferrite' | 'iron-powder';

export type ToroidCore = {
  /** 大文字の型番 (`FT37-43`)。 */
  readonly model: string;
  readonly material: ToroidMaterial;
  /** 材質の名前 (`43`・`61`・`2`)。 */
  readonly mix: string;
  /** 外径 (mm)。 */
  readonly outerMm: number;
  /** 穴の径 (mm)。 */
  readonly innerMm: number;
};

const core = (model: string, material: ToroidMaterial, mix: string, outerMm: number, innerMm: number): ToroidCore =>
  ({ model, material, mix, outerMm, innerMm });

/** 並びは表のまま。型番を足したら試験が落ちて、色の表も要求する。 */
export const TOROID_CORES: readonly ToroidCore[] = [
  core('FT37-43', 'ferrite', '43', 9.5, 4.8),
  core('FT37-61', 'ferrite', '61', 9.5, 4.8),
  core('T37-2', 'iron-powder', '2', 9.5, 5.2),
  core('T50-2', 'iron-powder', '2', 12.7, 7.7),
];

/** 表から型番を引く。**大文字小文字は問わない**。知らない型番は null。 */
export function lookupToroid(model: string | null | undefined): ToroidCore | null {
  if (model === null || model === undefined) return null;
  const wanted = model.trim().toUpperCase();
  return TOROID_CORES.find((entry) => entry.model === wanted) ?? null;
}

/** 型番を知らないときの塗り。フェライトの灰色。 */
const FERRITE_PAINT = { body: '#4a4f57', edge: '#2b2f35', shade: '#6a7079' } as const;

/** 材質ごとの塗り。**実物の色** — 鉄粉の混合 2 は赤、フェライトは灰色。 */
const PAINTS: Readonly<Record<string, { readonly body: string; readonly edge: string; readonly shade: string }>> = {
  'ferrite-43': FERRITE_PAINT,
  'ferrite-61': { body: '#5d5a52', edge: '#35332d', shade: '#7d7a70' },
  'iron-powder-2': { body: '#b8382c', edge: '#7a2219', shade: '#d4574a' },
};

const paintOf = (look: ToroidCore | null) =>
  (look === null ? FERRITE_PAINT : PAINTS[`${look.material}-${look.mix}`] ?? FERRITE_PAINT);

/** 巻線の銅色。 */
const WIRE = { stroke: '#c68b46', edge: '#8a5c2a' } as const;

/** 巻き目の本数 (ドーナツを 1 周)。 */
const TURNS = 14;
const INNER_RATIO = 0.48;

/**
 * 上から見たドーナツ。**原点が中心**で、`diameter` は外径 (px)。穴は抜く (下の基板が見える) —
 * 外円と内円を 1 本の道にして `evenodd` で塗る。そこへ巻線の銅線を放射状に重ねる
 * (実物はコアに線を巻く)。型番を知らなければ灰色のフェライトで、穴の比は 0.48。
 */
export function toroidBody(diameter: number, look: ToroidCore | null, ink: BodyInk): string {
  const outer = diameter / 2;
  const inner = look === null ? outer * INNER_RATIO : (outer * look.innerMm) / look.outerMm;
  const paint = paintOf(look);
  const ring = element('path', {
    d: circlePath(outer) + circlePath(inner),
    'fill-rule': 'evenodd',
    fill: ink.paint(paint.body),
    stroke: ink.paint(paint.edge),
    'stroke-width': 1,
  });
  // 巻線。内円から外円へ、少し食み出させて (コアに巻き付いて見える)。
  const spoke = (outer - inner) * 0.3;
  const wires = Array.from({ length: TURNS }, (_, index) => {
    const angle = (Math.PI * 2 * index) / TURNS;
    const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
    return element('line', {
      x1: num(dx * (inner - spoke * 0.4)), y1: num(dy * (inner - spoke * 0.4)),
      x2: num(dx * (outer + spoke * 0.4)), y2: num(dy * (outer + spoke * 0.4)),
      stroke: ink.paint(WIRE.stroke), 'stroke-width': 1.6, 'stroke-linecap': 'round',
    });
  }).join('');
  return ring + wires;
}

/** 原点を中心にした円の道 (2 つの半円)。 */
const circlePath = (radius: number): string =>
  `M${num(-radius)} 0A${num(radius)} ${num(radius)} 0 1 0 ${num(radius)} 0`
  + `A${num(radius)} ${num(radius)} 0 1 0 ${num(-radius)} 0Z`;

/** 外径 (px)。`pitch` は穴の間隔 (px)。型番を知らなければ null。 */
export const toroidDiameter = (look: ToroidCore | null, pitch: number): number | null =>
  look === null ? null : (look.outerMm / 2.54) * pitch;

/**
 * 中点タップ付きのトランスのピンの名前。**穴を書く順がそのままピンの順**で、回路図の
 * `transformer-ct` `transformer-ct2` と同じ綴り (`A1` `A2` `B1` `CT` `B2` /
 * `A1` `ACT` `A2` `B1` `BCT` `B2`)。1 次が先、2 次が後。
 */
export const TAPPED_TRANSFORMER_PINS: Readonly<Record<string, readonly string[]>> = {
  'transformer-ct': ['A1', 'A2', 'B1', 'CT', 'B2'],
  'transformer-ct2': ['A1', 'ACT', 'A2', 'B1', 'BCT', 'B2'],
};

export const tappedTransformerPins = (type: string): readonly string[] | null =>
  TAPPED_TRANSFORMER_PINS[type] ?? null;

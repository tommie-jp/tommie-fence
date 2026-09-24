import type { SmdSpec } from 'fence-kit';
import { edgeLength, edgePoint } from '../model/board.ts';
import type { Axis } from '../geometry/shapes.ts';
import type { Board, Mm, PartSpec, RectMm, Side } from '../types.ts';
import { smdSpecOf } from './catalog.ts';

/**
 * 部品の足が**銅のどこに乗るか** (mm)。描画・ネット・ERC が同じ点を読む。
 *
 * 面実装の寸法は fence-kit の表 (52 の docs/64) をそのまま使う。この板は mm で
 * 描くので、表の値がそのまま図の寸法になる。
 */

/** 足 1 本。**点が 2 つ以上なら同じ金物** (SOT-89 の 2 番の足とタブ)。 */
export type PinPlace = {
  readonly name: string;
  readonly points: readonly Mm[];
  /** 同軸の外皮。**板の地へ付く** (地の無い板では自分だけのネット)。 */
  readonly shell?: boolean;
};

export type Footprint = {
  readonly part: PartSpec;
  readonly pins: readonly PinPlace[];
  /** 胴の中心と向き (時計回りの度) と裏返し。描画はここから置く。 */
  readonly center: Mm;
  readonly angle: number;
  readonly mirror: boolean;
  /** 胴の外形 (向きを掛けたあとの外接矩形)。画布の広さと名札の置き場に使う。 */
  readonly outline: RectMm;
  /** 足のある部品の両端。 */
  readonly ends?: readonly [Mm, Mm];
};

/** SOT-89 のタブが胴から出る長さ (mm)。**fence-kit の絵と同じ値**。 */
const SOT89_TAB_OUT = 0.6;

/**
 * 端面 SMA の寸法 (mm)。**実物 (1.6mm 板用の端面ジャック) に寄せた値**。
 * 中心導体は縁から 4mm 板に載り、半田付けする点は縁から 1mm。
 * アースの腕は中心から ±2.2mm で、同じく 4mm 載る。
 */
export const SMA = {
  pinReach: 4,
  pinWidth: 0.9,
  pinSolder: 1,
  legOffset: 2.2,
  legWidth: 1,
  legReach: 4,
  /** 板の外。台座の厚みと、ねじ部の長さ。**胴は 6.35mm 角** (fence-kit の SMA_SIZE と同じ)。 */
  base: 1.6,
  barrel: 6.5,
  size: 6.35,
} as const;

/** 局所の点 (u, v) を、裏返してから時計回りに回して置く。 */
export function place(center: Mm, angle: number, mirror: boolean, u: number, v: number): Mm {
  const x = mirror ? -u : u;
  const rad = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.round(Math.cos(rad)), Math.round(Math.sin(rad))];
  return { x: center.x + x * cos - v * sin, y: center.y + x * sin + v * cos };
}

/** 局所の矩形を置いた外接矩形。 */
function placeRect(center: Mm, angle: number, mirror: boolean, local: RectMm): RectMm {
  const corners = [
    place(center, angle, mirror, local.x, local.y),
    place(center, angle, mirror, local.x + local.width, local.y + local.height),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/** 辺から板の内へ向く角 (`place` の向き)。 */
export const SIDE_ANGLE: Readonly<Record<Side, number>> = { left: 0, top: 90, right: 180, bottom: 270 };

/** 2 本足の面実装の寸法 (mm)。**切れ目は胴の長さの半分、足は長さの 0.4 倍の所**。 */
export function chipGeometry(spec: SmdSpec): { readonly gap: number; readonly reach: number; readonly length: number; readonly width: number } {
  if (spec.kind === 'chip') return { gap: spec.length * 0.5, reach: spec.length * 0.4, length: spec.length, width: spec.width };
  if (spec.kind === 'leaded') return { gap: spec.length * 0.5, reach: spec.span * 0.4, length: spec.span, width: spec.width };
  return { gap: 0, reach: 0, length: 0, width: 0 };
}

/** SOT の足の点 (局所)。1 番と 2 番が -v の側、3 番が +v の側。SOT-89 は 3 本とも -v、タブは +v。 */
function sotPins(spec: SmdSpec): PinPlace[] {
  if (spec.kind !== 'sot') return [];
  const { width, span, pitch } = spec;
  if (spec.tab) {
    const out = span - width - SOT89_TAB_OUT;
    const foot = width / 2 + out / 2;
    return [
      { name: '1', points: [{ x: -pitch, y: -foot }] },
      { name: '2', points: [{ x: 0, y: -foot }, { x: 0, y: width / 2 + SOT89_TAB_OUT / 2 }] },
      { name: '3', points: [{ x: pitch, y: -foot }] },
    ];
  }
  const out = (span - width) / 2;
  const foot = width / 2 + out / 2;
  return [
    { name: '1', points: [{ x: -pitch, y: -foot }] },
    { name: '2', points: [{ x: pitch, y: -foot }] },
    { name: '3', points: [{ x: 0, y: foot }] },
  ];
}

/** SOT の外形 (局所)。 */
function sotOutline(spec: SmdSpec): RectMm {
  if (spec.kind !== 'sot') return { x: 0, y: 0, width: 0, height: 0 };
  if (spec.tab) {
    const top = spec.width / 2 + (spec.span - spec.width - SOT89_TAB_OUT);
    return { x: -spec.length / 2, y: -top, width: spec.length, height: top + spec.width / 2 + SOT89_TAB_OUT };
  }
  return { x: -spec.length / 2, y: -spec.span / 2, width: spec.length, height: spec.span };
}

/** 箱の足。**左の辺を上から下へ、右の辺を下から上へ** (DIP と同じ反時計回り)。 */
export const BOX_PAD_OUT = 0.5;

function boxPins(width: number, height: number, count: number): PinPlace[] {
  const left = Math.ceil(count / 2);
  const right = count - left;
  const pins: PinPlace[] = [];
  const x = width / 2 + BOX_PAD_OUT / 2;
  for (let index = 0; index < left; index += 1) {
    pins.push({ name: String(index + 1), points: [{ x: -x, y: -height / 2 + (height / left) * (index + 0.5) }] });
  }
  for (let index = 0; index < right; index += 1) {
    pins.push({
      name: String(left + index + 1),
      points: [{ x, y: height / 2 - (height / right) * (index + 0.5) }],
    });
  }
  return pins;
}

/** 足の間隔 (箱の辺の上)。描画が足の金物の幅に使う。 */
export const boxPitch = (height: number, count: number): number => height / Math.ceil(count / 2);

export type EndResolver = (written: string) => Mm | string;

export type FootprintResult = { readonly ok: true; readonly value: Footprint } | { readonly ok: false; readonly reason: string };

/**
 * 部品を置く。`axes` はチップの向き (乗った線路で決まる)、`resolve` は
 * 足のある部品の端 (島の名前か点) を点に直す。
 */
export function footprintOf(
  part: PartSpec,
  board: Board,
  axes: ReadonlyMap<string, Axis>,
  resolve: EndResolver,
): FootprintResult {
  switch (part.kind) {
    case 'edge': {
      const length = edgeLength(board, part.side);
      if (part.offset < SMA.size / 2 || part.offset > length - SMA.size / 2) {
        return { ok: false, reason: `${part.id} が板の角にかかります (${part.side} の辺は ${SMA.size / 2}〜${length - SMA.size / 2}mm)` };
      }
      const center = edgePoint(board, part.side, part.offset);
      const angle = SIDE_ANGLE[part.side];
      const at = (u: number, v: number): Mm => place(center, angle, false, u, v);
      const outline = placeRect(center, angle, false, {
        x: -(SMA.base + SMA.barrel), y: -SMA.size / 2, width: SMA.base + SMA.barrel + SMA.legReach, height: SMA.size,
      });
      return {
        ok: true,
        value: {
          part, center, angle, mirror: false, outline,
          pins: [
            { name: '1', points: [at(SMA.pinSolder, 0)] },
            { name: '2', points: [at(SMA.legReach / 2, -SMA.legOffset), at(SMA.legReach / 2, SMA.legOffset)], shell: true },
          ],
        },
      };
    }
    case 'chip': {
      const spec = smdSpecOf(part.variant ?? '');
      if (spec === null) return { ok: false, reason: `${part.id} の姿を引けません` };
      const geometry = chipGeometry(spec);
      const axis = axes.get(part.id) ?? 'x';
      const angle = part.orient === null ? (axis === 'x' ? 0 : 90) : part.orient.turn;
      const mirror = part.orient?.mirror ?? false;
      const at = (u: number): Mm => place(part.at, angle, mirror, u, 0);
      return {
        ok: true,
        value: {
          part, center: part.at, angle, mirror,
          outline: placeRect(part.at, angle, mirror, {
            x: -geometry.length / 2, y: -geometry.width / 2, width: geometry.length, height: geometry.width,
          }),
          pins: [{ name: '1', points: [at(-geometry.reach)] }, { name: '2', points: [at(geometry.reach)] }],
        },
      };
    }
    case 'sot': {
      const spec = smdSpecOf(part.variant ?? '');
      if (spec === null || spec.kind !== 'sot') return { ok: false, reason: `${part.id} の姿を引けません` };
      const angle = part.orient?.turn ?? 0;
      const mirror = part.orient?.mirror ?? false;
      return {
        ok: true,
        value: {
          part, center: part.at, angle, mirror,
          outline: placeRect(part.at, angle, mirror, sotOutline(spec)),
          pins: sotPins(spec).map((pin) => ({
            ...pin, points: pin.points.map((point) => place(part.at, angle, mirror, point.x, point.y)),
          })),
        },
      };
    }
    case 'box': {
      const angle = part.orient?.turn ?? 0;
      const mirror = part.orient?.mirror ?? false;
      return {
        ok: true,
        value: {
          part, center: part.at, angle, mirror,
          outline: placeRect(part.at, angle, mirror, {
            x: -part.width / 2 - BOX_PAD_OUT, y: -part.height / 2, width: part.width + BOX_PAD_OUT * 2, height: part.height,
          }),
          pins: boxPins(part.width, part.height, part.pins).map((pin) => ({
            ...pin, points: pin.points.map((point) => place(part.at, angle, mirror, point.x, point.y)),
          })),
        },
      };
    }
    case 'leaded': {
      const ends = part.ends.map((written) => resolve(written));
      const bad = ends.findIndex((end) => typeof end === 'string');
      if (bad >= 0) return { ok: false, reason: `${part.id} の${bad === 0 ? '1' : '2'} つ目の端: ${ends[bad] as string}` };
      const [a, b] = ends as [Mm, Mm];
      if (a.x === b.x && a.y === b.y) return { ok: false, reason: `${part.id} の両端が同じ点です` };
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return {
        ok: true,
        value: {
          part, center, angle, mirror: false, ends: [a, b],
          outline: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
          pins: [{ name: '1', points: [a] }, { name: '2', points: [b] }],
        },
      };
    }
  }
}

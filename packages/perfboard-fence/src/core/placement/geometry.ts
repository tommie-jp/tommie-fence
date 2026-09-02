import type { Layout } from '../model/layout.ts';
import { footprintOf } from '../parts/footprint.ts';
import { isEdgeMount } from '../parts/types.ts';
import type { PlacedPart, Point } from '../types.ts';

/**
 * 部品の胴の形と、その重なり。
 *
 * **描画とここで同じ形を使う。** 別々に持つと、片方を直したときに
 * 「図では重なって見えるのに何も言わない」あるいはその逆になる
 * (`pinRef` を 2 か所に持って ERC が黙った件と同じ型)。
 */

/** 胴の高さ。ピッチ (20) の中に収まる太さ。 */
export const BODY_HEIGHT = 11;
/** 胴が穴に掛からないよう、両端から詰める幅。 */
export const BODY_INSET = 9;
/** 玉の直径 (LED)。**足の間隔で変わらない。** */
export const DOME_SIZE = BODY_HEIGHT + 2;
/** 足が 3 本以上ある部品の胴を、足の囲みからどれだけ詰めるか。 */
const BOX_INSET = 4;

/**
 * 同軸コネクタ (SMA) の胴。**六角の胴が 6.35mm** なので、ピッチ 2.54mm の
 * 2.5 個ぶん。金物なので足を広げても縮まない。
 */
export const SMA_SIZE = 50;

/**
 * 端面実装 (横置き) のコネクタの、板の外へ出る 3 段の長さ。
 * 左から**ねじ部・ねじなし・台座**で、台座の右端が板の縁に来る。
 * 実物は全長 13.5mm のうち 3.8mm が足の側なので、外へ出るのは 9.7mm ぶん。
 */
export const SMA_THREAD = 34;
export const SMA_PLAIN = 34;
/** 台座の厚さは 1mm (2.54mm = 20px なので 8px)。板を挟む板金の厚みぶん。 */
export const SMA_BASE = 8;
export const SMA_BARREL = SMA_THREAD + SMA_PLAIN + SMA_BASE;

/**
 * 端面実装の胴の置き方。**描画も当たり判定もここから取る** — 別々に測ると、
 * 図では板の縁に載っているのに当たり判定は別の場所、ということが起きる。
 *
 * 足は 3 本 — **中心導体と、凹の両端の先端** (`parts/footprint.ts`)。
 * `edgeX` は**板の縁**、`legX` は**凹の先端**の、胴の中心から測った軸に沿う
 * 位置 (局所座標。+x は先端から中心導体へ向かう向き)。`tips` は凹の 2 つの
 * 先端の、中心線からのずれ (局所座標の y。胴と一緒に回る)。
 *
 * **軸は板の縁に垂直。** 足どうしを結んだ線で向きを決めると、先端が中心線の
 * 上下にあるぶん胴が斜めになる。列が違えば横向き、同じなら縦向き。
 */
export type EdgeMount = {
  readonly rect: OrientedRect;
  readonly edgeX: number;
  readonly legX: number;
  readonly tips: readonly number[];
};

export function edgeMountOf(part: PlacedPart, layout: Layout): EdgeMount | null {
  const [first, ...rest] = part.pins;
  const tip = rest[0];
  if (!first || !tip) return null;

  const centre = layout.point(first.address);
  const ground = layout.point(tip.address);

  // **2 つの先端が同じ列に並んでいれば横向き** (板の左右の縁)、同じ行なら縦向き。
  // 先端が 1 つしか無いときは、中心導体と列が違えば横向きとみなす。
  const other = rest[1];
  const sideways = other === undefined
    ? tip.address.col !== first.address.col
    : other.address.col === tip.address.col;
  const step = sideways ? centre.x - ground.x : centre.y - ground.y;
  if (step === 0) return null;

  // +x は先端 → 中心導体の向き (板の内側)。
  const ux = sideways ? Math.sign(step) : 0;
  const uy = sideways ? 0 : Math.sign(step);

  // **中心導体を 0 として軸に沿って測る。** 板の角を全部見て一番外を取るので、
  // 板のどの辺に載せても (図を裏返しても) 同じ辺が出る。
  const along = (px: number, py: number): number => (px - centre.x) * ux + (py - centre.y) * uy;
  const across = (px: number, py: number): number => -(px - centre.x) * uy + (py - centre.y) * ux;
  const { x, y, width, height } = layout.board;
  const edge = Math.min(...[
    [x, y], [x + width, y], [x, y + height], [x + width, y + height],
  ].map(([cx = 0, cy = 0]) => along(cx, cy)));

  // 胴は「台座の右端 = 板の縁」から外へ 3 段。内側の端は中心導体の穴。
  const outer = edge - SMA_BARREL;
  const middle = outer / 2;

  return {
    rect: {
      cx: centre.x + ux * middle,
      cy: centre.y + uy * middle,
      width: -outer,
      height: SMA_SIZE,
      // 局所座標の +x は**先端から中心導体へ** (u と同じ向き)。先端が -width/2。
      angle: Math.atan2(uy, ux),
    },
    edgeX: edge - middle,
    legX: along(ground.x, ground.y) - middle,
    tips: rest.map((pin) => {
      const at = layout.point(pin.address);
      return across(at.x, at.y);
    }),
  };
}

/**
 * **胴が足の間を跨がない部品** — 足を遠くへ広げても本体の大きさが変わらない形。
 * 玉 (LED) と金物のコネクタがこれ。描画 (`render/parts.ts`) と当たり判定が
 * 同じ表を見る (別々に持つと、図と当たり判定が食い違う)。
 */
const FIXED_SIZE: Record<string, { readonly width: number; readonly height: number }> = {
  led: { width: DOME_SIZE, height: DOME_SIZE },
  sma: { width: SMA_SIZE, height: SMA_SIZE },
};

const own = (table: Record<string, unknown>, key: string): boolean => Object.hasOwn(table, key);

export const fixedSizeOf = (type: string): { readonly width: number; readonly height: number } | null =>
  (own(FIXED_SIZE, type) ? FIXED_SIZE[type] ?? null : null);

export const isDome = (type: string): boolean => type === 'led';

/** 中心・大きさ・傾きで表した長方形。 */
export type OrientedRect = {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
  /** ラジアン。x 軸が足の向き。 */
  readonly angle: number;
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 足の間隔を穴の数で数える。**斜めは足から足への直線**で測る —
 * 胴が跨ぐのはその直線であって、行や列の差ではない。
 */
export function spanOf(part: PlacedPart): number | null {
  const [first, second] = part.pins;
  if (!first || !second) return null;
  return Math.hypot(
    second.address.col - first.address.col,
    second.address.row - first.address.row,
  );
}

/**
 * 足が 3 本以上ある部品の胴。**足を囲む矩形**を軸に沿って取る。
 * 2 本足のように傾けないのは、パッケージが格子に沿って載るため。
 */
function boxRect(part: PlacedPart, layout: Layout): OrientedRect | null {
  const points = part.pins.map((pin) => layout.point(pin.address));
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    // 足の穴に胴が掛からないよう、端から少し詰める。
    width: Math.max(right - left + BODY_HEIGHT - BOX_INSET, BODY_HEIGHT),
    height: Math.max(bottom - top + BODY_HEIGHT - BOX_INSET, BODY_HEIGHT),
    angle: 0,
  };
}

/**
 * 箱で囲む部品か。**足の数ではなく形で決める** — `sip2` は足が 2 本でも
 * パッケージ。描画 (`render/parts.ts`) と同じ判定を使う。
 */
const isBoxed = (part: PlacedPart): boolean => {
  const kind = footprintOf(part.type)?.kind;
  return kind === 'dip' || kind === 'sip' || kind === 'three-lead';
};

/** 胴の長方形。足が 1 本も無ければ null。 */
export function bodyRect(part: PlacedPart, layout: Layout): OrientedRect | null {
  // **端面実装は足が 3 本でも箱ではない。** 置き方は `edgeMountOf` が決める。
  if (isEdgeMount(part.type, part.variant)) {
    const mount = edgeMountOf(part, layout);
    if (mount !== null) return mount.rect;
  }
  if (isBoxed(part) || part.pins.length > 2) return boxRect(part, layout);

  const [first, second] = part.pins;
  if (!first || !second) return null;

  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const center = midpoint(from, to);
  const length = Math.hypot(to.x - from.x, to.y - from.y);

  // **描かれている形をそのまま返す。** 玉やコネクタは足を広げても本体が伸びないので、
  // 足の間隔から胴を作ると、離れた部品と重なっていると言い出す。
  const fixed = fixedSizeOf(part.type);
  const width = fixed?.width ?? Math.max(length - BODY_INSET * 2, BODY_HEIGHT);

  return {
    cx: center.x,
    cy: center.y,
    width,
    height: fixed?.height ?? BODY_HEIGHT,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  };
}

/** 長方形の 4 隅。 */
function corners(rect: OrientedRect): Point[] {
  const cos = Math.cos(rect.angle);
  const sin = Math.sin(rect.angle);
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;

  return [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([x = 0, y = 0]) => ({
    x: rect.cx + x * cos - y * sin,
    y: rect.cy + x * sin + y * cos,
  }));
}

const project = (points: readonly Point[], axis: Point): { min: number; max: number } => {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
};

/**
 * 2 つの胴が重なっているか。**分離軸定理** — 傾いた長方形どうしは、
 * 4 辺の法線のどれかで影が離れていれば重なっていない。
 *
 * 触れているだけ (影がちょうど接する) は重なりとしない。実物でも
 * 隣り合わせに並べることはできる。
 */
export function overlaps(a: OrientedRect, b: OrientedRect): boolean {
  const cornersA = corners(a);
  const cornersB = corners(b);
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2]
    .map((angle) => ({ x: Math.cos(angle), y: Math.sin(angle) }));

  return axes.every((axis) => {
    const shadowA = project(cornersA, axis);
    const shadowB = project(cornersB, axis);
    return shadowA.max > shadowB.min && shadowB.max > shadowA.min;
  });
}

/**
 * 図が広がっている範囲。**画布からはみ出すものがある**かを見るために使う。
 * 端面実装のコネクタは板の外へ張り出し、番地も板の外を指せる (縁の銅箔) ので、
 * 板の寸法だけで画布を決めると**はみ出したぶんが黙って切れる**。
 * 呼ぶ側は画布のほうを広げる。何も無ければ null。
 */
export function drawnExtent(
  parts: readonly PlacedPart[],
  layout: Layout,
  extra: readonly Point[] = [],
): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null {
  const points = [
    ...parts.flatMap((part) => {
      const rect = bodyRect(part, layout);
      return rect === null ? [] : corners(rect);
    }),
    ...extra,
  ];
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

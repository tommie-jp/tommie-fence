import type { Scene, SceneBody, SceneWire, ScenePoint } from 'fence-kit';
import {
  crossingOf, distanceToSegment, headingOf, isInside, isSamePoint, lengthInside, penetration, segmentsOf,
} from './geometry.ts';
import type { Segment } from './geometry.ts';

/**
 * 検査の項目 (52 の docs/148 の順)。
 *
 * - `overlap` — 部品どうしの胴の重なり
 * - `wire-part` — 線が部品の胴を通る (自分の足へ来る区間は除く)
 * - `crossing` — 線どうしが途中で十字に交わる
 * - `junction4` — 上下左右の 4 本が 1 点でつながる十字 (circuit だけ。つながりの黒丸に頼る形)
 * - `caption` — 名札が部品・線・ほかの名札に重なる
 * - `wire-pin` — 線が、自分の端でない部品のピンかほかの線の端の穴の上を通る (bread。52 の docs/151。
 *   perf は裸の線で同じネットのピンをなぞるのが普通なので、`Scene` にネットが載るまで見ない)
 * - `device-side` — 板の外の機器の箱から出た線が、板の真ん中の溝をまたぐ (bread。docs/151)
 */
export const KINDS = ['overlap', 'wire-part', 'crossing', 'junction4', 'caption', 'wire-pin', 'device-side', 'wire-overlap'] as const;
export type Kind = (typeof KINDS)[number];

export type Finding = {
  readonly kind: Kind;
  /** 相手の名前 (部品 ID・`wire(c12-f9)`・`caption:ID`・`ID(body)`)。線は両端で名付ける (docs/150)。 */
  readonly a: string;
  readonly b: string;
  /** 重なりの深さ・通った長さ (px)。交点は 1 件 = 1。`wire-pin` は通った穴の数。 */
  readonly amount: number;
  readonly unit: 'px' | 'point';
  /** フェンスの中の行 (後に書いたほう)。分からなければ null。 */
  readonly line: number | null;
  /** `uncertain` は座標が近似の図 (circuit) で出したもの。 */
  readonly grade: 'sure' | 'uncertain';
  readonly at: ScenePoint;
};

export type CheckOptions = {
  /** これより浅い重なり・短い横切りは数えない (px)。丸めの揺れを拾わないため。 */
  readonly min?: number;
};

/** 既定の下限 (px)。字の縁取りや線の太さより小さい食い込みは見て分からない。 */
export const DEFAULT_MIN = 1;

const laterLine = (a: number | null, b: number | null): number | null =>
  a === null ? b : b === null ? a : Math.max(a, b);

const round = (value: number): number => Math.round(value * 10) / 10;

export function checkScene(scene: Scene, options: CheckOptions = {}): readonly Finding[] {
  const min = options.min ?? DEFAULT_MIN;
  const grade = scene.approximate ? 'uncertain' : 'sure';
  const make = (kind: Kind, a: string, b: string, amount: number, line: number | null, at: ScenePoint, sure = true): Finding => ({
    kind, a, b, amount: kind === 'crossing' || kind === 'junction4' ? 1 : round(amount),
    unit: POINT_KINDS.has(kind) ? 'point' : 'px',
    line, grade: sure ? grade : 'uncertain', at,
  });
  return [
    ...overlaps(scene.parts, min, make),
    ...wireParts(scene.parts, scene.wires, min, make),
    ...crossings(scene.wires, make),
    ...(scene.fence === 'circuit' ? junctions(scene.wires, make) : []),
    ...captions(scene, min, make),
    ...(scene.fence === 'breadboard' ? wirePins(scene, make) : []),
    ...deviceSides(scene, make),
    ...wireOverlaps(scene.wires, make),
  ];
}

/** 平行と見なす向きの差 (度)。 */
const PARALLEL_DEGREES = 2;
/**
 * 重なって見える線どうしの間 (px)。**2 px まで** — ブレッドボードの道順は並べて走らせる線を
 * 4 px ずらして置き、色で 2 本と読める (教科書で数えると、平行に並ぶ組の間は 0 px か 4 px に分かれた)。
 * 0〜2 px は線が線を隠す。
 */
const OVERLAP_GAP = 2;
/** 数える重なりの長さの下限 (px)。端が少し触れるだけの並びは数えない。 */
const OVERLAP_MIN = 10;

/** 線 (折れ線) の両端。 */
const endsOfWire = (wire: SceneWire): readonly ScenePoint[] => [wire.points[0]!, wire.points[wire.points.length - 1]!];

/** 2 区間が平行に並んで重なる長さ (px)。平行でない・離れている・重ならないなら 0。 */
function parallelOverlap(one: Segment, other: Segment): number {
  const dx = one.to.x - one.from.x;
  const dy = one.to.y - one.from.y;
  const length = Math.hypot(dx, dy);
  const ox = other.to.x - other.from.x;
  const oy = other.to.y - other.from.y;
  const otherLength = Math.hypot(ox, oy);
  if (length === 0 || otherLength === 0) return 0;
  const sin = Math.abs(dx * oy - dy * ox) / (length * otherLength);
  if (sin > Math.sin((PARALLEL_DEGREES * Math.PI) / 180)) return 0;
  const ux = dx / length;
  const uy = dy / length;
  // もう一方の両端の、この区間の直線からの距離と、直線に沿った位置。
  const across = (point: ScenePoint): number => Math.abs((point.x - one.from.x) * uy - (point.y - one.from.y) * ux);
  const along = (point: ScenePoint): number => (point.x - one.from.x) * ux + (point.y - one.from.y) * uy;
  if (Math.max(across(other.from), across(other.to)) > OVERLAP_GAP) return 0;
  const [low, high] = [along(other.from), along(other.to)].sort((a, b) => a - b) as [number, number];
  return Math.max(0, Math.min(length, high) - Math.max(0, low));
}

/**
 * 9. 平行に重なる線 (docs/150 の #9)。**線が線を隠す** — 十字 (`crossing`) は点で交わる所しか
 * 数えないので、2 本が同じ道を並んで走ると見落とす (52 の docs/149 §8.3、アダプタの図)。
 * 線の組ごとに、重なった長さの合計で 1 件。**端を共有する線の組は数えない** — 同じ穴・同じ節点へ
 * 集まる線は同じネットで、重なって見えてよい (束ねた GND の線など)。
 */
function wireOverlaps(wires: readonly SceneWire[], make: Make): Finding[] {
  const found: Finding[] = [];
  const cut = wires.map((wire) => segmentsOf(wire.points));
  wires.forEach((one, index) => {
    wires.slice(index + 1).forEach((other, offset) => {
      const shareEnd = endsOfWire(one).some((end) => endsOfWire(other).some((theirs) => isSamePoint(end, theirs)));
      if (shareEnd) return;
      let total = 0;
      let at: ScenePoint | null = null;
      for (const mine of cut[index]!) {
        for (const theirs of cut[index + 1 + offset]!) {
          const shared = parallelOverlap(mine, theirs);
          if (shared > 0) {
            total += shared;
            at ??= { x: (theirs.from.x + theirs.to.x) / 2, y: (theirs.from.y + theirs.to.y) / 2 };
          }
        }
      }
      if (total >= OVERLAP_MIN && at !== null) {
        found.push(make('wire-overlap', one.id, other.id, total, laterLine(one.line, other.line), at));
      }
    });
  });
  return found;
}

/** 量を点の数で数える項目。 */
const POINT_KINDS: ReadonlySet<Kind> = new Set<Kind>(['crossing', 'junction4', 'wire-pin', 'device-side']);

type Make = (kind: Kind, a: string, b: string, amount: number, line: number | null, at: ScenePoint, sure?: boolean) => Finding;

const centerOf = (body: SceneBody): ScenePoint => ({ x: body.rect.cx, y: body.rect.cy });

/** 1. 部品どうしの胴の重なり。組ごとに 1 件。 */
function overlaps(parts: readonly SceneBody[], min: number, make: Make): Finding[] {
  const found: Finding[] = [];
  parts.forEach((one, index) => {
    for (const other of parts.slice(index + 1)) {
      const depth = penetration(one.rect, other.rect);
      if (depth >= min) found.push(make('overlap', one.id, other.id, depth, laterLine(one.line, other.line), centerOf(other)));
    }
  });
  return found;
}

/** 足から縁までの勘定に足す遊び (px)。丸めと線の太さのぶん。 */
const EDGE_SLACK = 2;

/** 胴より十分長い距離 (px)。足から向きに沿って伸ばし、縁で切るのに使う。 */
const FAR = 1e5;

/** 足から `toward` の向き (と、その逆) に伸ばした線が胴を出るまでの長さ。 */
function exitLength(pin: ScenePoint, toward: ScenePoint, rect: SceneBody['rect'], sign: 1 | -1): number {
  const dx = toward.x - pin.x;
  const dy = toward.y - pin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 0;
  const far = { x: pin.x + (sign * dx * FAR) / length, y: pin.y + (sign * dy * FAR) / length };
  return lengthInside({ from: pin, to: far }, rect);
}

/**
 * 区間が胴の中を通る長さ。**自分の足で終わる区間は、足から近いほうの縁へ出るなら許す** —
 * 足は胴の縁か内側にある (DIP の樹脂は足の列を包み、ユニバーサル基板の IC と SMA は
 * 足の上に胴が載る)。進む向きの先の縁が、逆向きの縁より遠ければ、線は胴を渡っている。
 * そのときは逆向きの縁までの長さ (足が胴に埋まっている分) を超えた分を数える。
 * 縁にある足から箱の中へ進む線 (箱の左の辺のピンから右へ箱を貫く線) は全部数える
 * (52 の docs/149)。
 */
const insideLength = (segment: Segment, body: SceneBody): number => {
  const length = lengthInside(segment, body.rect);
  const atPin = (point: ScenePoint): boolean => body.pins.some((one) => isSamePoint(one, point));
  // 両端とも自分の足 (胴の下で足どうしをつなぐ線) は、線がまるごと胴に隠れる。
  if (atPin(segment.from) && atPin(segment.to)) return length;
  // ピンでなくても線が来てよい点 (記号を置いた番地) を**先に**見る。記号の中心なので、
  // そこで終わる線はどちらへ出ても許す (ピンから中心へ引く短い線も、中心から見れば同じ)。
  const pin = [...(body.joins ?? []), ...body.pins]
    .find((one) => isSamePoint(one, segment.from) || isSamePoint(one, segment.to));
  if (pin === undefined || length === 0) return length;
  const other = isSamePoint(pin, segment.from) ? segment.to : segment.from;
  const ahead = exitLength(pin, other, body.rect, 1);
  const behind = exitLength(pin, other, body.rect, -1);
  if (ahead <= behind + EDGE_SLACK) return 0;
  return Math.max(0, length - behind - EDGE_SLACK);
};

/** 2. 線が部品の胴を通る。線と部品の組ごとに、通った長さの合計で 1 件。 */
function wireParts(parts: readonly SceneBody[], wires: readonly SceneWire[], min: number, make: Make): Finding[] {
  const found: Finding[] = [];
  for (const wire of wires) {
    const segments = segmentsOf(wire.points);
    for (const body of parts) {
      if (body.id === wire.id) continue;
      const length = segments.reduce((sum, segment) => sum + insideLength(segment, body), 0);
      if (length >= min) found.push(make('wire-part', wire.id, body.id, length, laterLine(wire.line, body.line), centerOf(body)));
    }
  }
  return found;
}

/** 3. 線どうしの十字。点ごとに 1 件。 */
function crossings(wires: readonly SceneWire[], make: Make): Finding[] {
  const found: Finding[] = [];
  const cut = wires.map((wire) => segmentsOf(wire.points));
  wires.forEach((one, index) => {
    wires.slice(index + 1).forEach((other, offset) => {
      const theirs = cut[index + 1 + offset]!;
      for (const mine of cut[index]!) {
        for (const segment of theirs) {
          const point = crossingOf(mine, segment);
          if (point !== null) found.push(make('crossing', one.id, other.id, 1, laterLine(one.line, other.line), point));
        }
      }
    });
  });
  return found;
}

/** 十字の 4 方向 (度。y は下が +)。 */
const CROSS = [0, 90, 180, 270] as const;

/**
 * 3'. 4 方向の交点 (circuit)。線の端が集まる点で、**上下左右の 4 方向がそろう十字**。
 * 途中を通り抜ける線は 2 方向に数える (T 字に通した線にもう 1 本足すと十字になる)。
 *
 * 数えるのは十字だけ (52 の docs/149)。readable-schematic #7 が十字を避ける理由は、
 * つながっているかが黒丸の有無だけで決まる (黒丸を見落とすと「交差しているだけ」と読める)
 * から。コッククロフト・ウォルトンの梯子のように斜めの線が集まる形は、斜めの線が
 * 点を突き抜けないので交差とは読めない。よく見る定型でもあるので数えない。
 */
function junctions(wires: readonly SceneWire[], make: Make): Finding[] {
  const all = wires.flatMap((wire) => segmentsOf(wire.points).map((segment) => ({ wire, segment })));
  const ends: { point: ScenePoint; wire: SceneWire }[] = all.flatMap(({ wire, segment }) => [
    { point: segment.from, wire }, { point: segment.to, wire },
  ]);
  const seen: ScenePoint[] = [];
  const found: Finding[] = [];
  for (const { point } of ends) {
    if (seen.some((one) => isSamePoint(one, point))) continue;
    seen.push(point);
    const headings = new Set<number>();
    const names = new Set<string>();
    let line: number | null = null;
    for (const { wire, segment } of all) {
      if (isSamePoint(segment.from, point)) headings.add(headingOf(point, segment.to));
      else if (isSamePoint(segment.to, point)) headings.add(headingOf(point, segment.from));
      else if (isInside(point, segment)) {
        headings.add(headingOf(point, segment.to));
        headings.add(headingOf(point, segment.from));
      } else continue;
      names.add(wire.id);
      line = laterLine(line, wire.line);
    }
    if (CROSS.every((heading) => headings.has(heading))) {
      const [a = '', b = '', ...rest] = [...names];
      found.push(make('junction4', a, [b, ...rest].join('+'), 1, line, point));
    }
  }
  return found;
}

/** 4. 名札と部品・線・ほかの名札の衝突。 */
function captions(scene: Scene, min: number, make: Make): Finding[] {
  const found: Finding[] = [];
  const lineOf = new Map(scene.parts.map((body) => [body.id, body.line]));
  scene.captions.forEach((caption, index) => {
    const name = `caption:${caption.owner}`;
    const line = lineOf.get(caption.owner) ?? null;
    const at = { x: caption.rect.cx, y: caption.rect.cy };
    for (const body of scene.parts) {
      const depth = penetration(caption.rect, body.rect);
      const other = body.id === caption.owner ? `${body.id}(body)` : body.id;
      if (depth >= min) found.push(make('caption', name, other, depth, laterLine(line, body.line), at));
    }
    for (const other of scene.captions.slice(index + 1)) {
      const depth = penetration(caption.rect, other.rect);
      if (depth >= min) {
        found.push(make('caption', name, `caption:${other.owner}`, depth, laterLine(line, lineOf.get(other.owner) ?? null), at));
      }
    }
    for (const wire of scene.wires) {
      const length = segmentsOf(wire.points).reduce((sum, segment) => sum + lengthInside(segment, caption.rect), 0);
      if (length >= min) found.push(make('caption', name, wire.id, length, laterLine(line, wire.line), at));
    }
  });
  return found;
}

/**
 * 線が穴の上を通ったと見る距離 (px)。breadboard・perfboard のピッチ 20 の 1/4。
 * 穴の真上を通る線 (0 px) は拾い、半穴ずらして通した線 (10 px。breadboard-wiring #24) は拾わない。
 */
const PIN_REACH = 5;

/**
 * 5. 線が、自分の端でない挿さった穴 (部品のピン・ほかの線の端) の上を通る。線と相手の組ごとに、
 * 通った穴の数で 1 件 (52 の docs/151)。`wire-part` は胴を見るので、胴の外に出たピン
 * (抵抗のリードの先) の上を縦に通る線はこちらで拾う。板の外の機器のピンは除く
 * (箱の縁にあり、そこを通る線は `wire-part` が箱で拾う)。
 */
function wirePins(scene: Scene, make: Make): Finding[] {
  const offBoardPins = scene.parts.filter((body) => body.offBoard === true).flatMap((body) => body.pins);
  const onBoard = (point: ScenePoint): boolean => !offBoardPins.some((one) => isSamePoint(one, point));
  const targets: { id: string; points: readonly ScenePoint[]; line: number | null }[] = [
    ...scene.parts.filter((body) => body.offBoard !== true).map((body) => ({ id: body.id, points: body.pins, line: body.line })),
    ...scene.wires.map((wire) => ({ id: wire.id, points: endsOf(wire).filter(onBoard), line: wire.line })),
  ];
  const found: Finding[] = [];
  for (const wire of scene.wires) {
    const segments = segmentsOf(wire.points);
    const own = endsOf(wire);
    for (const target of targets) {
      if (target.id === wire.id) continue;
      const passed = target.points.filter((point) =>
        !own.some((end) => isSamePoint(end, point))
        && segments.some((segment) => distanceToSegment(point, segment) <= PIN_REACH));
      const first = passed[0];
      if (first !== undefined) found.push(make('wire-pin', wire.id, target.id, passed.length, laterLine(wire.line, target.line), first));
    }
  }
  return found;
}

const endsOf = (wire: SceneWire): readonly ScenePoint[] => {
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  return first === undefined || last === undefined ? [] : [first, last];
};

/**
 * 6. 板の外の機器の箱から出た線が、溝をまたぐ (breadboard。52 の docs/151)。線ごとに 1 件。
 * 箱は線を挿す半分の側に置く (breadboard-wiring #26)。**機器の線が全部またぐなら箱の側の誤り**
 * (`sure`)。またがない線もあるなら、両方の半分へ行く機器で、箱を分けるか端を動かすかは
 * 人が決めるので `uncertain`。
 */
function deviceSides(scene: Scene, make: Make): Finding[] {
  const ravines = scene.ravines ?? [];
  if (ravines.length === 0) return [];
  const crosses = (wire: SceneWire): boolean => segmentsOf(wire.points).some((segment) =>
    ravines.some((y) => (segment.from.y - y) * (segment.to.y - y) < 0));
  const found: Finding[] = [];
  for (const body of scene.parts.filter((one) => one.offBoard === true)) {
    const mine = scene.wires.filter((wire) => endsOf(wire).some((end) => body.pins.some((pin) => isSamePoint(pin, end))));
    const far = mine.filter(crosses);
    const sure = far.length === mine.length;
    for (const wire of far) {
      found.push(make('device-side', wire.id, body.id, 1, laterLine(wire.line, body.line), endsOf(wire)[1] ?? centerOf(body), sure));
    }
  }
  return found;
}

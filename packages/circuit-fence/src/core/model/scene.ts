import type { Scene, SceneBody, ScenePoint, SceneWire } from 'fence-kit';
import { compileCircuit } from '../index.ts';
import { parseFence } from '../parser/parseFence.ts';
import { normalizeNewlines } from '../newlines.ts';
import { cellOf, nodeNameOf, texNameOfEndpoint } from '../types.ts';
import type { Endpoint } from '../types.ts';
import { DEFAULT_PITCH, cornerOf } from './address.ts';
import type { Address } from './address.ts';
import { buildCircuit } from './circuit.ts';
import type { Circuit } from './circuit.ts';

/**
 * 図の幾何 (fence-check が見る形。52 の docs/148)。
 *
 * **circuit の図は TeX が描く**ので、描き上がった記号の外形は TS の側に無い。
 * 番地の升目を 96 dpi の px に直し、2 端子の記号は `bipoles/length` (1.2 cm) から見積もる
 * (`approximate: true`)。線の交差と 4 方向の交点は升目の上で正確に出る。
 *
 * 多端子部品 (トランジスタ・IC・機器) のピンの位置は TikZ のアンカーに任せていて升目に無い。
 * **TeX に問い合わせた座標 (`pinProbe` → `readPinProbe`) を渡されたときだけ**、ピンへの線と
 * 多端子部品の胴 (ノードの外形) を足す。渡されなければピンへの線は `skipped` に数だけ残す。
 * 名札も TeX が置くので、ここでは出さない (docs/148 の段 C)。
 */

/** 1 cm を 96 dpi の px に。 */
const PX_PER_CM = 96 / 2.54;

/** TeX の pt を 96 dpi の px に (1 in = 72.27 pt)。 */
const PX_PER_PT = 96 / 72.27;

/** 2 端子の記号の長さと太さ (cm)。`bipoles/length` 1.2 cm に抵抗の割合 (0.8・0.3) を掛けた見積もり。 */
const BODY_LENGTH = 0.96;
const BODY_THICKNESS = 0.36;

/** 記号を描かない 2 端子 (ただの線)。 */
const LINE_ONLY = new Set(['short']);

/** TeX に問い合わせた座標 (px)。鍵は `pinProbe` の `keys`。 */
export type ProbedPoints = ReadonlyMap<string, ScenePoint>;

/** 多端子部品の胴を問い合わせる鍵。ノードの外形の対角 2 点。 */
const bodyKeys = (id: string): readonly [string, string] => [`${nodeNameOf(id)}|ne`, `${nodeNameOf(id)}|sw`];

function circuitOf(input: string): { readonly circuit: Circuit; readonly pitch: number } | null {
  const { doc } = parseFence(normalizeNewlines(input));
  if (doc.parts.length === 0) return null;
  const { circuit } = buildCircuit(doc, { target: 'fence' });
  return { circuit, pitch: doc.style.pitch ?? DEFAULT_PITCH };
}

/** 線の端 (ピン) を TikZ の「ノード名とアンカー」に分ける。番地の端は null。 */
function anchorOf(end: Endpoint): { readonly node: string; readonly anchor: string } | null {
  if (end.kind !== 'pin') return null;
  const full = texNameOfEndpoint(end);
  const node = nodeNameOf(end.part);
  return { node, anchor: full.slice(node.length + 1) };
}

/**
 * ピンと多端子部品の外形の座標を TeX に書かせるための TeX。図の TeX の終わりに
 * `\pgfpointanchor` と `\typeout` を足したもの。**番号で書かせる** — ピンの名前には
 * TeX で特別な字 (`%` `#`) が来うるので、鍵はログに載せない。
 * 問い合わせるものが無ければ null。
 */
export function pinProbe(input: string): { readonly tex: string; readonly keys: readonly string[] } | null {
  const read = circuitOf(input);
  if (read === null) return null;
  const queries = new Map<string, { readonly node: string; readonly anchor: string }>();
  for (const wire of read.circuit.wires) {
    for (const end of [wire.from, wire.to]) {
      const anchor = anchorOf(end);
      if (anchor !== null) queries.set(texNameOfEndpoint(end), anchor);
    }
  }
  for (const part of read.circuit.parts) {
    if (part.kind !== 'multi-terminal') continue;
    const [ne, sw] = bodyKeys(part.id);
    queries.set(ne, { node: nodeNameOf(part.id), anchor: 'north east' });
    queries.set(sw, { node: nodeNameOf(part.id), anchor: 'south west' });
  }
  if (queries.size === 0) return null;
  const { tex } = compileCircuit(input);
  if (tex === null) return null;
  const end = tex.lastIndexOf('\\end{circuitikz}');
  if (end < 0) return null;
  const keys = [...queries.keys()];
  const lines = [...queries.values()].map(({ node, anchor }, index) =>
    `\\pgfpointanchor{${node}}{${anchor}}\\typeout{FCPIN|${index}|\\the\\pgf@x|\\the\\pgf@y}`);
  const probe = ['\\makeatletter', ...lines, '\\makeatother', ''].join('\n');
  return { tex: tex.slice(0, end) + probe + tex.slice(end), keys };
}

const PROBE_LINE = /FCPIN\|(\d+)\|(-?[\d.]+)pt\|(-?[\d.]+)pt/g;

/** TeX のログから問い合わせた座標を読む。TikZ は上が +y なので、図の向き (下が +y) に返す。 */
export function readPinProbe(log: string, keys: readonly string[]): ProbedPoints {
  const found = new Map<string, ScenePoint>();
  for (const matched of log.matchAll(PROBE_LINE)) {
    const key = keys[Number(matched[1])];
    if (key === undefined) continue;
    found.set(key, { x: Number(matched[2]) * PX_PER_PT, y: -Number(matched[3]) * PX_PER_PT });
  }
  return found;
}

export function scenesOfCircuit(input: string, probed: ProbedPoints | null = null): readonly Scene[] {
  const read = circuitOf(input);
  if (read === null) return [];
  const { circuit, pitch } = read;
  const at = (address: Address): ScenePoint => ({
    x: address.col * pitch * PX_PER_CM,
    y: address.row * pitch * PX_PER_CM,
  });

  const parts: SceneBody[] = [];
  const leads: SceneWire[] = [];
  for (const part of circuit.parts) {
    if (part.kind !== 'two-terminal') continue;
    const from = at(part.from);
    const to = at(part.to);
    leads.push({ id: part.id, points: [from, to], line: part.line, lead: true });
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (LINE_ONLY.has(part.type) || span === 0) continue;
    parts.push({
      id: part.id,
      rect: {
        cx: (from.x + to.x) / 2,
        cy: (from.y + to.y) / 2,
        width: Math.min(span, BODY_LENGTH * PX_PER_CM),
        height: BODY_THICKNESS * PX_PER_CM,
        angle: Math.atan2(to.y - from.y, to.x - from.x),
      },
      pins: [from, to],
      line: part.line,
    });
  }

  const pointOf = (end: Endpoint): ScenePoint | null => {
    const cell = cellOf(end);
    if (cell !== null) return at(cell);
    return probed?.get(texNameOfEndpoint(end)) ?? null;
  };

  let skipped = 0;
  const wires: SceneWire[] = [];
  const pinsOf = new Map<string, ScenePoint[]>();
  circuit.wires.forEach((wire, index) => {
    const from = pointOf(wire.from);
    const to = pointOf(wire.to);
    if (from === null || to === null) {
      skipped += 1;
      return;
    }
    for (const [end, point] of [[wire.from, from], [wire.to, to]] as const) {
      if (end.kind === 'pin') pinsOf.set(end.part, [...(pinsOf.get(end.part) ?? []), point]);
    }
    wires.push({ id: `wire#${index + 1}`, points: bentPoints(wire.from, wire.to, from, to, wire.operator), line: wire.line });
  });

  if (probed !== null) parts.push(...multiTerminalBodies(circuit, probed, pinsOf));

  return [{
    fence: 'circuit',
    sheet: null,
    parts,
    wires: [...leads, ...wires],
    captions: [],
    approximate: true,
    skipped,
  }];
}

/** `-|` は先に横・`|-` は先に縦 (TikZ と同じ)。曲がり角が端に乗れば曲げない。 */
function bentPoints(
  fromEnd: Endpoint,
  toEnd: Endpoint,
  from: ScenePoint,
  to: ScenePoint,
  operator: Circuit['wires'][number]['operator'],
): readonly ScenePoint[] {
  const fromCell = cellOf(fromEnd);
  const toCell = cellOf(toEnd);
  if (fromCell !== null && toCell !== null) {
    return cornerOf(fromCell, toCell, operator) === null ? [from, to] : [from, cornerPoint(from, to, operator), to];
  }
  if (operator === '--' || from.x === to.x || from.y === to.y) return [from, to];
  return [from, cornerPoint(from, to, operator), to];
}

const cornerPoint = (from: ScenePoint, to: ScenePoint, operator: string): ScenePoint =>
  operator === '-|' ? { x: to.x, y: from.y } : { x: from.x, y: to.y };

/** 多端子部品の胴 (TikZ のノードの外形)。外形の分からない部品は足さない。 */
function multiTerminalBodies(
  circuit: Circuit,
  probed: ProbedPoints,
  pinsOf: ReadonlyMap<string, readonly ScenePoint[]>,
): SceneBody[] {
  return circuit.parts.flatMap((part): SceneBody[] => {
    if (part.kind !== 'multi-terminal') return [];
    const [neKey, swKey] = bodyKeys(part.id);
    const ne = probed.get(neKey);
    const sw = probed.get(swKey);
    if (ne === undefined || sw === undefined) return [];
    const width = Math.abs(ne.x - sw.x);
    const height = Math.abs(ne.y - sw.y);
    if (width === 0 || height === 0) return [];
    return [{
      id: part.id,
      rect: { cx: (ne.x + sw.x) / 2, cy: (ne.y + sw.y) / 2, width, height, angle: 0 },
      pins: pinsOf.get(part.id) ?? [],
      line: part.line,
    }];
  });
}

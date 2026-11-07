import type { Scene, SceneBody, ScenePoint, SceneWire } from 'fence-kit';
import { parseFence } from '../parser/parseFence.ts';
import { normalizeNewlines } from '../newlines.ts';
import { cellOf } from '../types.ts';
import { DEFAULT_PITCH, cornerOf } from './address.ts';
import type { Address } from './address.ts';
import { buildCircuit } from './circuit.ts';

/**
 * 図の幾何 (fence-check が見る形。52 の docs/148)。
 *
 * **circuit の図は TeX が描く**ので、描き上がった記号の外形は TS の側に無い。
 * 番地の升目を 96 dpi の px に直し、記号は `bipoles/length` (1.2 cm) から見積もる
 * (`approximate: true`)。線の交差と 4 方向の交点は升目の上で正確に出る。
 *
 * 多端子部品 (トランジスタ・IC) のピンの位置は TikZ のアンカーに任せていて
 * 升目に無いので、ピンへ引いた線は数えずに `skipped` に数だけ残す。
 * 名札も TeX が置くので、ここでは出さない (docs/148 の段 C)。
 */

/** 1 cm を 96 dpi の px に。 */
const PX_PER_CM = 96 / 2.54;

/** 2 端子の記号の長さと太さ (cm)。`bipoles/length` 1.2 cm に抵抗の割合 (0.8・0.3) を掛けた見積もり。 */
const BODY_LENGTH = 0.96;
const BODY_THICKNESS = 0.36;

/** 記号を描かない 2 端子 (ただの線)。 */
const LINE_ONLY = new Set(['short']);

export function scenesOfCircuit(input: string): readonly Scene[] {
  const { doc } = parseFence(normalizeNewlines(input));
  if (doc.parts.length === 0) return [];
  const { circuit } = buildCircuit(doc, { target: 'fence' });
  const pitch = doc.style.pitch ?? DEFAULT_PITCH;
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

  let skipped = 0;
  const wires: SceneWire[] = [];
  circuit.wires.forEach((wire, index) => {
    const from = cellOf(wire.from);
    const to = cellOf(wire.to);
    if (from === null || to === null) {
      skipped += 1;
      return;
    }
    const corner = cornerOf(from, to, wire.operator);
    const cells = corner === null ? [from, to] : [from, corner, to];
    wires.push({ id: `wire#${index + 1}`, points: cells.map(at), line: wire.line });
  });

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

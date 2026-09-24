import {
  REAL_INK, drawBody, drawsOwnLeads, element, num, sotGlyph,
} from 'fence-kit';
import type { BodyPart } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { BOX_PAD_OUT, SMA, boxPitch } from '../parts/footprint.ts';
import type { Footprint } from '../parts/footprint.ts';
import { smdSpecOf } from '../parts/catalog.ts';
import type { Theme } from './theme.ts';

/**
 * 部品の絵。**置き方 (中心・向き・足の点) は `footprint.ts` が決め**、ここは
 * その上に絵を載せるだけ — 図と導通が食い違わない。
 *
 * 面実装の胴は fence-kit (mm の表から描く。perfboard の直付けと同じ絵)。
 * 端面 SMA は perfboard の絵が穴の番地に縛られているので、ここで実寸 (mm) から描く。
 */

const SMA_METAL = '#c7ccd3';
const SMA_EDGE = '#7f868d';
const SMA_DIELECTRIC = '#f4f1e6';
const SMA_SOCKET = '#2b2f33';

/** 回して置く。`mirror` は回す前に左右を裏返す (`footprint.ts` の `place` と同じ順)。 */
const placed = (layout: Layout, footprint: Footprint, body: string, attrs: Record<string, string> = {}): string => {
  const at = layout.toPx(footprint.center);
  const flip = footprint.mirror ? ' scale(-1 1)' : '';
  return element('g', {
    ...attrs,
    transform: `translate(${num(at.x)} ${num(at.y)}) rotate(${num(footprint.angle)})${flip}`,
  }, body);
};

export const bodyPart = (footprint: Footprint): BodyPart => ({
  type: footprint.part.type,
  variant: footprint.part.variant,
  value: footprint.part.value,
  pins: footprint.pins.map((pin) => ({ name: pin.name })),
});

/** 端面 SMA。局所の座標は **u が板の内へ、v が辺に沿う** (px)。 */
function smaEdge(layout: Layout, male: boolean, pinColor: string): string {
  const mm = (value: number): number => layout.len(value);
  const box = (u: number, v: number, du: number, dv: number, fill: string, round = 0.6): string => element('rect', {
    x: num(mm(u)), y: num(mm(v)), width: num(mm(du)), height: num(mm(dv)), rx: num(round),
    fill, stroke: SMA_EDGE, 'stroke-width': 0.8,
  });
  const half = SMA.size / 2;
  const barrel = half * 0.62;
  const tip = -(SMA.base + SMA.barrel);
  const threads = [0.8, 1.6, 2.4, 3.2, 4.0, 4.8]
    .map((at) => element('line', {
      x1: num(mm(tip + at)), y1: num(mm(-barrel + 0.3)), x2: num(mm(tip + at)), y2: num(mm(barrel - 0.3)),
      stroke: SMA_EDGE, 'stroke-width': 0.8,
    }))
    .join('');
  const face = male
    ? box(tip - 1, -0.3, 1.4, 0.6, pinColor, 0.2)
    : box(tip + 0.2, -0.4, 0.5, 0.8, SMA_SOCKET, 0.1);
  const legs = [-1, 1]
    .map((side) => box(0, side * SMA.legOffset - SMA.legWidth / 2, SMA.legReach, SMA.legWidth, SMA_METAL, 0.3))
    .join('');
  const pin = box(0, -SMA.pinWidth / 2, SMA.pinReach, SMA.pinWidth, pinColor, 0.3);
  return box(tip, -barrel, SMA.barrel, barrel * 2, SMA_METAL) + threads
    + box(tip + 0.3, -barrel * 0.5, 0.3, barrel, SMA_DIELECTRIC, 0.1) + face
    + box(-SMA.base, -half, SMA.base, SMA.size, SMA_METAL) + legs + pin;
}

/** 箱。黒い胴と、左右の辺の足の金物。1 番の足の側に丸の印。 */
function boxBody(layout: Layout, footprint: Footprint, theme: Theme): string {
  const part = footprint.part;
  if (part.kind !== 'box') return '';
  const mm = (value: number): number => layout.len(value);
  const [w, h] = [part.width, part.height];
  const pitch = boxPitch(h, part.pins);
  const padH = Math.min(pitch * 0.6, 1);
  const pads = footprint.pins.map((_pin, index) => {
    const left = index < Math.ceil(part.pins / 2);
    // 足の点は置いたあとの座標なので、局所の並びは足の番号から組み直す。
    const row = left ? index : index - Math.ceil(part.pins / 2);
    const count = left ? Math.ceil(part.pins / 2) : part.pins - Math.ceil(part.pins / 2);
    const v = left ? -h / 2 + (h / count) * (row + 0.5) : h / 2 - (h / count) * (row + 0.5);
    const u = left ? -w / 2 - BOX_PAD_OUT : w / 2 - 0.4;
    return element('rect', {
      x: num(mm(u)), y: num(mm(v - padH / 2)), width: num(mm(BOX_PAD_OUT + 0.4)), height: num(mm(padH)),
      fill: SMA_METAL, stroke: SMA_EDGE, 'stroke-width': 0.5,
    });
  }).join('');
  const body = element('rect', {
    x: num(mm(-w / 2)), y: num(mm(-h / 2)), width: num(mm(w)), height: num(mm(h)), rx: 1,
    fill: theme.palette.box, stroke: theme.palette.boxEdge, 'stroke-width': 0.8,
  });
  const dot = element('circle', {
    cx: num(mm(-w / 2 + Math.min(0.8, w / 4))), cy: num(mm(-h / 2 + Math.min(0.8, h / 4))),
    r: num(mm(Math.min(0.3, w / 10))), fill: theme.palette.boxText,
  });
  return pads + body + dot;
}

/** 足のある部品。**足の線を端から端まで引き、胴を真ん中に載せる**。 */
function leadedBody(layout: Layout, footprint: Footprint, theme: Theme): string {
  const [a, b] = footprint.ends ?? [footprint.center, footprint.center];
  const span = layout.len(Math.hypot(b.x - a.x, b.y - a.y));
  const part = bodyPart(footprint);
  const lead = drawsOwnLeads(part.type)
    ? ''
    : element('line', {
      x1: num(-span / 2), y1: 0, x2: num(span / 2), y2: 0, stroke: theme.palette.lead, 'stroke-width': 1.6,
      'stroke-linecap': 'round',
    });
  const solder = [-1, 1].map((side) => element('circle', {
    cx: num((side * span) / 2), cy: 0, r: 2.2, fill: theme.palette.solder, stroke: theme.palette.lead, 'stroke-width': 0.5,
  })).join('');
  return lead + solder + drawBody(part, span, REAL_INK);
}

/** 部品 1 つ。`edit` のときは掴むための印を付ける (マップのエディタ)。 */
export function renderPart(layout: Layout, footprint: Footprint, theme: Theme, edit = false): string {
  const part = footprint.part;
  const attrs: Record<string, string> = edit ? { class: 'cf-chip', 'data-part': part.id } : { 'data-part': part.id };
  switch (part.kind) {
    case 'edge':
      return placed(layout, footprint, smaEdge(layout, part.variant === 'male-edge', theme.palette.pin), attrs);
    case 'chip':
      return placed(layout, footprint, drawBody(bodyPart(footprint), 0, REAL_INK), attrs);
    case 'sot': {
      const spec = smdSpecOf(part.variant ?? '');
      return spec === null || spec.kind !== 'sot' ? '' : placed(layout, footprint, sotGlyph(spec, REAL_INK), attrs);
    }
    case 'box':
      return placed(layout, footprint, boxBody(layout, footprint, theme), attrs);
    case 'leaded': {
      const at = layout.toPx(footprint.center);
      return element('g', {
        ...attrs, transform: `translate(${num(at.x)} ${num(at.y)}) rotate(${num(footprint.angle)})`,
      }, leadedBody(layout, footprint, theme));
    }
  }
}

/** 島どうしのジャンパ。**端に半田の玉**を置く (銅に付いていることが見える)。 */
export function renderJumpers(
  jumpers: readonly { readonly from: { x: number; y: number }; readonly to: { x: number; y: number }; readonly color: string | null; readonly line: number | null }[],
  layout: Layout,
  theme: Theme,
  colorOf: (name: string) => string | null,
  edit = false,
): string {
  return jumpers.map((jumper) => {
    const [a, b] = [layout.toPx(jumper.from), layout.toPx(jumper.to)];
    const stroke = (jumper.color === null ? null : colorOf(jumper.color)) ?? theme.palette.wire;
    const wire = element('line', {
      x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y), stroke, 'stroke-width': 2, 'stroke-linecap': 'round',
    });
    const dots = [a, b].map((at) => element('circle', {
      cx: num(at.x), cy: num(at.y), r: 2, fill: theme.palette.solder, stroke, 'stroke-width': 0.6,
    })).join('');
    const hit = edit && jumper.line !== null
      ? element('line', {
        class: 'cf-wire-hit', 'data-line': jumper.line, x1: num(a.x), y1: num(a.y), x2: num(b.x), y2: num(b.y),
        stroke: 'transparent', 'stroke-width': 10,
      })
      : '';
    return wire + dots + hit;
  }).join('');
}


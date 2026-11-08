import { bodySize, sceneRectOf, sceneWireNames } from 'fence-kit';
import type { Scene, SceneBody, SceneCaption, SceneEndKind, SceneRect, SceneWire } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import type { PlacedPart, Point } from '../types.ts';
import { boardBodyRect } from './boardPart.ts';
import { captionGlyphBoxOf } from './captions.ts';
import { connectorBodyRect } from './connector.ts';
import type { DevicePlacement } from './devices.ts';
import { fourLeadBodyRect, sipBarRect, switchBodyRect } from './packages.ts';
import { pinPoints, shiftOffsetOf } from './partCommon.ts';
import type { RenderedWire } from './document.ts';
import { bodyDown, bodyHalfWidth, bodyUp } from './threeLead.ts';
import type { RenderTheme } from './theme.ts';

/**
 * 図の幾何 (fence-check が見る形。52 の docs/148)。**描くのと同じ勘定**から組む —
 * 胴は配線よけと同じ外枠、名札は描く位置と同じ `captionTextBandOf`、線は
 * 引き回したあとの折れ線。
 */
export type SceneInput = {
  readonly parts: readonly PlacedPart[];
  readonly devices: ReadonlyMap<string, DevicePlacement>;
  readonly wires: readonly RenderedWire[];
  /** `wires` と同じ並びの、書かれた両端 (番地か `機器.ピン`)。線の名前になる。 */
  readonly wireEnds: readonly (readonly [string, string])[];
  /** `wires` と同じ並びの、線のネットの名前 (穴の導通から)。分からなければ null。 */
  readonly wireNets?: readonly (string | null)[];
  /** `wires` と同じ並びの、両端の種類。 */
  readonly wireEndKinds?: readonly (readonly [SceneEndKind, SceneEndKind])[];
  /** `wires` と同じ並びの、電源・GND のネットの線か。 */
  readonly wirePower?: readonly boolean[];
  readonly layout: Layout;
  readonly theme: RenderTheme;
  readonly drops: ReadonlyMap<string, number>;
};

export function breadboardScene(input: SceneInput, sheet: string | null = null): Scene {
  const { parts, devices, wires, wireEnds, layout, theme, drops } = input;
  const bodies: SceneBody[] = parts.flatMap((part) => {
    const rect = bodyOf(part, layout);
    return rect === null ? [] : [{ id: part.id, rect, pins: pinPoints(part, layout) ?? [], line: part.line }];
  });
  const deviceBodies: SceneBody[] = [...devices].map(([id, device]) => ({
    id,
    rect: sceneRectOf(device.rect),
    pins: [...device.pins.values()],
    offBoard: true,
    line: parts.find((part) => part.id === id)?.line ?? null,
  }));
  // 名札は**字形そのもの**で見る (配線よけの帯は行送りと縁取りのぶん広い)。
  const captions: SceneCaption[] = parts.flatMap((part) => {
    if (part.kind === 'device' || part.kind === 'dip') return [];
    const box = captionGlyphBoxOf(part, layout, theme, drops.get(part.id) ?? 0);
    return box === null ? [] : [{ owner: part.id, rect: sceneRectOf(box) }];
  });
  const names = sceneWireNames(wireEnds);
  const lines: SceneWire[] = wires.map((wire, index) => ({
    id: names[index] ?? `wire#${index + 1}`,
    points: wire.points,
    line: wire.line === 0 ? null : wire.line,
    net: input.wireNets?.[index] ?? null,
    ...(input.wireEndKinds?.[index] === undefined ? {} : { ends: input.wireEndKinds[index]! }),
    ...(input.wirePower?.[index] === undefined ? {} : { power: input.wirePower[index]! }),
  }));
  return {
    fence: 'breadboard',
    sheet,
    parts: [...bodies, ...deviceBodies],
    wires: lines,
    captions,
    approximate: false,
    skipped: 0,
    ravines: [layout.ravineY],
  };
}

/** 胴の外枠。描く側の関数を使う (配線よけの `partObstacles` から名札の帯を除いたもの)。 */
export function bodyOf(part: PlacedPart, layout: Layout): SceneRect | null {
  switch (part.kind) {
    case 'board': return sceneRectOf(boardBodyRect(part, layout));
    case 'sip': return nonEmpty(sceneRectOf(sipBarRect(part, layout)));
    case 'switch': return sceneRectOf(switchBodyRect(part, layout));
    case 'wound': return sceneRectOf(fourLeadBodyRect(part, layout));
    case 'connector': return nonEmpty(sceneRectOf(connectorBodyRect(part, layout)));
    case 'dip': return dipBody(part, layout);
    case 'three-lead': return threeLeadBody(part, layout);
    case 'two-lead': return twoLeadBody(part, layout);
    default: return null;
  }
}

const nonEmpty = (rect: SceneRect): SceneRect | null => (rect.width > 0 && rect.height > 0 ? rect : null);

const pointsOf = (part: PlacedPart, layout: Layout): Point[] => part.pins
  .map((pin) => (pin.address ? layout.point(pin.address) : null))
  .filter((point): point is Point => point !== null);

/** DIP の樹脂。配線よけ (`partObstacles`) と同じ余白。 */
function dipBody(part: PlacedPart, layout: Layout): SceneRect | null {
  const points = pointsOf(part, layout);
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return sceneRectOf({
    x: left - 9, y: top - 5, width: Math.max(...xs) - left + 18, height: Math.max(...ys) - top + 10,
  });
}

/** 3 ピンの胴 (名札とピンの名前の帯は含めない)。 */
function threeLeadBody(part: PlacedPart, layout: Layout): SceneRect | null {
  const points = pointsOf(part, layout);
  const center = points[1] ?? points[0];
  if (center === undefined) return null;
  const halfWidth = bodyHalfWidth(part, layout);
  const up = bodyUp(part, layout);
  const down = bodyDown(part, layout);
  return sceneRectOf({ x: center.x - halfWidth, y: center.y - up, width: halfWidth * 2, height: up + down });
}

/** 2 ピンの胴。**傾けたまま**返す (斜めに挿した部品を軸に沿った箱で包むと広すぎる)。 */
function twoLeadBody(part: PlacedPart, layout: Layout): SceneRect | null {
  const [first, second] = part.pins;
  if (!first?.address || !second?.address) return null;
  const from = layout.point(first.address);
  const to = layout.point(second.address);
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  if (span === 0) return null;
  const size = bodySize(part, span);
  const offset = shiftOffsetOf(part, layout);
  return {
    cx: (from.x + to.x) / 2 + offset.x,
    cy: (from.y + to.y) / 2 + offset.y,
    width: size.width,
    height: size.height,
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  };
}

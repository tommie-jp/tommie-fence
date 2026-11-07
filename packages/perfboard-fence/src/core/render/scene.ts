import { sceneRectOf, sceneWireNames } from 'fence-kit';
import type { Scene, SceneBody, SceneCaption, SceneWire } from 'fence-kit';
import type { Layout } from '../model/layout.ts';
import { bodyRect } from '../placement/geometry.ts';
import type { Address, PlacedPart, Point, Rect, RoutedWire } from '../types.ts';
import type { DeviceWire } from '../wiring/wiring.ts';
import type { PlacedDevice } from './devices.ts';

/**
 * 図の幾何 (fence-check が見る形。52 の docs/148)。**描くのと同じ勘定**から組む —
 * 胴は当たり判定と同じ `bodyRect`、名札は描くときに置き場を決めた帯
 * (`captionRoom` が知らせたもの)、線は基板の上の直線と機器へ引いた線。
 */
export type SceneInput = {
  readonly parts: readonly PlacedPart[];
  readonly devices: readonly PlacedDevice[];
  readonly wires: readonly RoutedWire[];
  readonly deviceWires: readonly DeviceWire[];
  readonly captions: readonly { readonly owner: string; readonly box: Rect }[];
  readonly layout: Layout;
  /** 番地を基板の綴りで書く (線の名前 `wire(c7-c9)` に使う)。 */
  readonly spell: (address: Address) => string;
};

export function perfboardScene(input: SceneInput, sheet: string | null = null): Scene {
  const { parts, devices, wires, deviceWires, captions, layout, spell } = input;
  const bodies: SceneBody[] = parts.flatMap((part) => {
    const rect = part.pins.length === 0 ? null : bodyRect(part, layout);
    return rect === null ? [] : [{
      id: part.id,
      rect,
      pins: part.pins.map((pin) => layout.point(pin.address)),
      line: part.line ?? null,
    }];
  });
  const boxes: SceneBody[] = devices.map((one) => ({
    id: one.device.id,
    rect: sceneRectOf(one.box),
    pins: [...one.pins.values()],
    line: one.device.line ?? null,
  }));
  const pinOf = new Map(devices.map((one) => [one.device.id, one.pins]));
  const names = sceneWireNames([
    ...wires.map((wire) => [spell(wire.from), spell(wire.to)] as const),
    ...deviceWires.map((wire) => [`${wire.device}.${wire.pin}`, spell(wire.hole)] as const),
  ]);
  const lines: SceneWire[] = [
    ...wires.map((wire, index) => ({
      id: names[index] ?? `wire#${index + 1}`,
      points: [layout.point(wire.from), layout.point(wire.to)],
      line: wire.line,
    })),
    ...deviceWires.flatMap((wire, index): SceneWire[] => {
      const from: Point | undefined = pinOf.get(wire.device)?.get(wire.pin);
      return from === undefined ? [] : [{
        id: names[wires.length + index] ?? `${wire.device}.${wire.pin}#${index + 1}`,
        points: [from, layout.point(wire.hole)],
        line: wire.line,
      }];
    }),
  ];
  const labels: SceneCaption[] = captions.map(({ owner, box }) => ({ owner, rect: sceneRectOf(box) }));
  return {
    fence: 'perfboard',
    sheet,
    parts: [...bodies, ...boxes],
    wires: lines,
    captions: labels,
    approximate: false,
    skipped: 0,
  };
}

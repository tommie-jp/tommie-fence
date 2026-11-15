import {
  boardUsbPort, deviceLookOf, pxPerMmOf, drawUsbCable, lookUsbPort, lookupBoardPart, usbCableBox, usbCableListValue, usbCableMinLength,
} from 'fence-kit';
import type { PartSize, UsbKind, UsbPort } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { PITCH } from '../model/layout.ts';
import type { Layout } from '../model/layout.ts';
import type { CableSpec, FenceError, PlacedPart } from '../types.ts';
import type { DevicePlacement } from './devices.ts';
import { pinOneOf } from './boardPart.ts';
import { pinPoints } from './partCommon.ts';
import type { RenderTheme } from './theme.ts';
import { textScale } from './theme.ts';

/**
 * USB ケーブルを口から外へまっすぐ引く (52 の docs/157)。
 *
 * - **マイコンボードの口**は基板の縁の外 (`BOARD_CLEAR`) まで引く — 実物もケーブルは基板の外へ出ていく
 * - **機器の口** (Debug Probe) は基板と反対の辺にあるので、帯の外へ、両端の差し込み (実寸) と少しの線が見える長さだけ引く。
 *   そのぶん画布の上か下を空ける (`cableMargins`)
 */
const BOARD_CLEAR = 30;
/** 機器の口から帯の外へ引く長さ (px)。両端の胴と金物 (実寸) に、見せる線の分を足した最短。 */
const deviceLength = (far: UsbKind, pxPerMm: number, size: PartSize): number => usbCableMinLength('micro-b', far, pxPerMm, size);
/** 画布の縁とケーブルの端の間。 */
const EDGE_GAP = 6;

export type PlannedCable = {
  readonly spec: CableSpec; readonly port: UsbPort; readonly length: number;
  /** 機器の口か (帯の外へ決まった長さ)。マイコンボードの口なら false。 */
  readonly onDevice: boolean;
};

type PortResult = { readonly port: UsbPort } | { readonly error: string } | null;

function portOf(
  spec: CableSpec, parts: readonly PlacedPart[], layout: Layout, devices: ReadonlyMap<string, DevicePlacement> | null,
): PortResult {
  const part = parts.find((one) => one.id === spec.partId);
  if (part === undefined) return { error: `from: の ${safeToken(spec.partId)} という部品はありません` };
  if (part.kind === 'board') {
    const definition = lookupBoardPart(part.type);
    const points = pinPoints(part, layout);
    const port = definition === null || points === null ? null : boardUsbPort(points, layout.pitch, definition, pinOneOf(part));
    return port === null ? { error: `${safeToken(part.id)} に USB の口がありません` } : { port };
  }
  if (part.kind === 'device') {
    const look = deviceLookOf(part.model ?? null);
    if (look === null) return { error: `${safeToken(part.id)} に USB の口がありません (USB の口を持つのは マイコンボードと model: RPI-DEBUG-PROBE)` };
    // 帯の位置は機器を並べたあとで決まる。決まる前 (画布を測る段) は null を返して飛ばす。
    const placement = devices?.get(part.id);
    // 姿のある機器は上下の帯にしか置けない (置く側が断る)。
    if (placement === undefined || placement.side === 'left' || placement.side === 'right') return null;
    return { port: lookUsbPort(look, placement.rect, placement.side, pxPerMmOf(layout.pitch), part.size ?? undefined) };
  }
  return { error: `${safeToken(part.id)} に USB の口がありません (USB の口を持つのは マイコンボードと model: RPI-DEBUG-PROBE)` };
}

function lengthOf(port: UsbPort, layout: Layout, onDevice: boolean, far: UsbKind, size: PartSize): number {
  if (onDevice) return deviceLength(far, pxPerMmOf(layout.pitch), size);
  const { board } = layout;
  const reach = {
    left: port.x - (board.x - BOARD_CLEAR),
    right: board.x + board.width + BOARD_CLEAR - port.x,
    up: port.y - (board.y - BOARD_CLEAR),
    down: board.y + board.height + BOARD_CLEAR - port.y,
  }[port.dir];
  return reach;
}

/** ケーブルを引く。口の無い部品を指したケーブルは描かずに断る。 */
export function planCables(
  specs: readonly CableSpec[], parts: readonly PlacedPart[], layout: Layout, devices: ReadonlyMap<string, DevicePlacement> | null,
  errors: FenceError[] | null,
): readonly PlannedCable[] {
  return specs.flatMap((spec) => {
    const found = portOf(spec, parts, layout, devices);
    if (found === null) return [];
    if ('error' in found) {
      errors?.push(fenceError(`部品 ${safeToken(spec.id)}: ${found.error}`, spec.line, spec.partId));
      return [];
    }
    const onDevice = parts.find((one) => one.id === spec.partId)?.kind === 'device';
    const length = Math.max(lengthOf(found.port, layout, onDevice, spec.far, spec.size), usbCableMinLength(found.port.kind, spec.far, pxPerMmOf(layout.pitch), spec.size));
    return [{ spec, port: found.port, length, onDevice }];
  });
}

/** 機器の口から出るケーブルのために、画布の上と下に空ける量。 */
export function cableMargins(specs: readonly CableSpec[], parts: readonly PlacedPart[]): { top: number; bottom: number } {
  const sides = specs.flatMap((spec) => {
    const part = parts.find((one) => one.id === spec.partId);
    return part?.kind === 'device' && deviceLookOf(part.model ?? null) !== null ? [{ side: part.at ?? 'top', far: spec.far, size: spec.size }] : [];
  });
  const px = pxPerMmOf(PITCH);
  const room = (side: 'top' | 'bottom'): number => Math.max(0, ...sides
    .filter((one) => one.side === side)
    .map((one) => deviceLength(one.far, px, one.size) + EDGE_GAP));
  return { top: room('top'), bottom: room('bottom') };
}

/** マイコンボードの口から出るケーブルが、画布の左右 (と上下) からはみ出す量。 */
export function cableOverhang(planned: readonly PlannedCable[], layout: Layout): { top: number; bottom: number; left: number; right: number } {
  return planned
    .filter((cable) => !cable.onDevice)
    .map((cable) => usbCableBox({ port: cable.port, far: cable.spec.far, length: cable.length, pxPerMm: pxPerMmOf(layout.pitch), size: cable.spec.size }))
    .reduce((most, box) => ({
      top: Math.max(most.top, EDGE_GAP - box.y),
      bottom: Math.max(most.bottom, box.y + box.height + EDGE_GAP - layout.height),
      left: Math.max(most.left, EDGE_GAP - box.x),
      right: Math.max(most.right, box.x + box.width + EDGE_GAP - layout.width),
    }), { top: 0, bottom: 0, left: 0, right: 0 });
}

export function renderCables(planned: readonly PlannedCable[], theme: RenderTheme): string {
  const scale = textScale(theme);
  return planned
    .map((cable) => drawUsbCable({ port: cable.port, far: cable.spec.far, length: cable.length, scale, pxPerMm: pxPerMmOf(PITCH), size: cable.spec.size }))
    .join('');
}

/** 部品表に並べる行 (機器の行と同じ形の部品として)。手前の口の種類は引いた口から。 */
export function cableListParts(specs: readonly CableSpec[], planned: readonly PlannedCable[]): readonly PlacedPart[] {
  return specs.map((spec) => {
    const port = planned.find((cable) => cable.spec.id === spec.id)?.port ?? null;
    return {
      id: spec.id, type: 'usb-cable', written: 'usb-cable', variant: null, kind: 'device', pins: [], bridges: [],
      value: null, label: spec.label ?? usbCableListValue(spec.far, port === null ? null : port.kind),
      at: null, line: spec.line,
    } satisfies PlacedPart;
  });
}

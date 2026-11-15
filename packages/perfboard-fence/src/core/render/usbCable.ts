import {
  boardUsbPort, deviceLookOf, drawUsbCable, lookUsbPort, lookupBoardPart, usbCableBox, usbCableListValue, usbCableMinLength,
} from 'fence-kit';
import type { UsbKind, UsbPort } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import type { Layout } from '../model/layout.ts';
import type { CableSpec, DeviceSpec, FenceError, PlacedPart } from '../types.ts';
import type { PlacedDevice } from './devices.ts';

/**
 * USB ケーブルを口から外へまっすぐ引く (52 の docs/157。bread と同じ決まり)。
 *
 * - **マイコンボードの口**は基板の縁の外 (`BOARD_CLEAR`) まで引く
 * - **機器の口** (Debug Probe を帯に並べた物) は基板と反対の辺にあるので、帯の外へ決まった長さ
 *   (`DEVICE_LENGTH`) だけ引く。そのぶん画布の上か下を空ける (`cableMargins`)
 */
// 行と列の名前の欄 (基板の縁の外) を越えて、名前に差し込みを重ねない。
const BOARD_CLEAR = 72;
const DEVICE_LENGTH = 120;
const EDGE_GAP = 6;
const NO_PORT = 'USB の口がありません (USB の口を持つのは マイコンボードと、帯に並べた model: RPI-DEBUG-PROBE)';

export type PlannedCable = {
  readonly spec: CableSpec; readonly port: UsbPort; readonly length: number; readonly onDevice: boolean;
};

/** 帯に並べた、姿のある機器か (番地で置いた機器は箱なので口を持たない)。 */
const lookedDevice = (device: DeviceSpec | undefined): boolean =>
  device !== undefined && device.where === null && deviceLookOf(device.model ?? null) !== null;

function portOf(
  spec: CableSpec, parts: readonly PlacedPart[], devices: readonly DeviceSpec[], placed: readonly PlacedDevice[] | null, layout: Layout,
): { readonly port: UsbPort } | { readonly error: string } | null {
  const part = parts.find((one) => one.id === spec.partId);
  if (part !== undefined) {
    const definition = lookupBoardPart(part.type);
    if (definition === null) return { error: `${safeToken(part.id)} に ${NO_PORT}` };
    const port = boardUsbPort(part.pins.map((pin) => layout.point(pin.address)), layout.pitch, definition);
    return port === null ? { error: `${safeToken(part.id)} に ${NO_PORT}` } : { port };
  }
  const device = devices.find((one) => one.id === spec.partId);
  if (device === undefined) return { error: `from: の ${safeToken(spec.partId)} という部品はありません` };
  const look = device.where === null ? deviceLookOf(device.model ?? null) : null;
  if (look === null) return { error: `${safeToken(device.id)} に ${NO_PORT}` };
  // 帯の位置は機器を並べたあとで決まる。決まる前 (画布を測る段) は null を返して飛ばす。
  const box = placed?.find((one) => one.device.id === device.id)?.box;
  return box === undefined ? null : { port: lookUsbPort(look, box, device.at) };
}

function boardReach(port: UsbPort, layout: Layout): number {
  const { board } = layout;
  return {
    left: port.x - (board.x - BOARD_CLEAR),
    right: board.x + board.width + BOARD_CLEAR - port.x,
    up: port.y - (board.y - BOARD_CLEAR),
    down: board.y + board.height + BOARD_CLEAR - port.y,
  }[port.dir];
}

/** ケーブルを引く。口の無い部品を指したケーブルは描かずに断る (`errors` を渡したときだけ)。 */
export function planCables(
  specs: readonly CableSpec[], parts: readonly PlacedPart[], devices: readonly DeviceSpec[],
  placed: readonly PlacedDevice[] | null, layout: Layout, errors: FenceError[] | null,
): readonly PlannedCable[] {
  return specs.flatMap((spec) => {
    const found = portOf(spec, parts, devices, placed, layout);
    if (found === null) return [];
    if ('error' in found) {
      errors?.push(fenceError(`${safeToken(spec.id)}: ${found.error}`, spec.line, spec.partId));
      return [];
    }
    const onDevice = !parts.some((one) => one.id === spec.partId);
    const reach = onDevice ? DEVICE_LENGTH : boardReach(found.port, layout);
    return [{ spec, port: found.port, length: Math.max(reach, usbCableMinLength(spec.far)), onDevice }];
  });
}

/** 機器の口から出るケーブルのために、画布の上と下に空ける量。 */
export function cableMargins(specs: readonly CableSpec[], devices: readonly DeviceSpec[]): { top: number; bottom: number } {
  const sides = specs.flatMap((spec) => {
    const device = devices.find((one) => one.id === spec.partId);
    return lookedDevice(device) ? [device?.at ?? 'top'] : [];
  });
  const room = DEVICE_LENGTH + EDGE_GAP;
  return { top: sides.includes('top') ? room : 0, bottom: sides.includes('bottom') ? room : 0 };
}

/** マイコンボードの口から出るケーブルが、基板の縁からはみ出す量 (`moduleOverhang` と同じ測り方)。 */
export function cableOverhang(planned: readonly PlannedCable[], layout: Layout): { above: number; below: number; left: number; right: number } {
  const { x, y, width, height } = layout.board;
  return planned
    .filter((cable) => !cable.onDevice)
    .map((cable) => usbCableBox({ port: cable.port, far: cable.spec.far, length: cable.length }))
    .reduce((most, box) => ({
      above: Math.max(most.above, y - box.y),
      below: Math.max(most.below, box.y + box.height - (y + height)),
      left: Math.max(most.left, x - box.x),
      right: Math.max(most.right, box.x + box.width - (x + width)),
    }), { above: 0, below: 0, left: 0, right: 0 });
}

export const renderCables = (planned: readonly PlannedCable[], scale: number): string =>
  planned.map((cable) => drawUsbCable({ port: cable.port, far: cable.spec.far, length: cable.length, scale })).join('');

/** 手前の口の種類 (画布を組む前に、部品表の行を作るのに使う)。分からなければ null。 */
function nearKind(spec: CableSpec, parts: readonly { readonly id: string; readonly type: string }[], devices: readonly DeviceSpec[]): UsbKind | null {
  const part = parts.find((one) => one.id === spec.partId);
  if (part !== undefined) return lookupBoardPart(part.type)?.usb ?? null;
  return lookedDevice(devices.find((one) => one.id === spec.partId)) ? 'micro-b' : null;
}

/** 部品表に並べる行 (機器の行と同じ形)。 */
export const cableRows = (
  specs: readonly CableSpec[], parts: readonly { readonly id: string; readonly type: string }[], devices: readonly DeviceSpec[],
): readonly (readonly [string, string, string, string])[] =>
  specs.map((spec) => [spec.id, 'usb-cable', spec.label ?? usbCableListValue(spec.far, nearKind(spec, parts, devices)), ''] as const);

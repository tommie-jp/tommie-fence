import { textWidth } from 'fence-kit';
import { PX } from '../model/layout.ts';
import type { Board, DeviceSpec, Mm, RectMm, Side } from '../types.ts';

/**
 * 基板の外の機器の置き方。**箱の大きさ・ピンの位置は書いた内容 (名札・ピンの名前・基板との位置)
 * だけから決まり**、描画と配線と ERC が同じ結果を読む — 図と導通が食い違わない。
 *
 * ピンは箱の**基板のいる側の辺**から出て、先 (tip) に配線がつながる。
 */

/** 字の大きさ (mm)。図の名札と同じ 9px。 */
export const DEVICE_TEXT_MM = 9 / PX;
/** ピンの長さ (mm)。 */
export const STUB = 2.5;
const PITCH = 4;
const PAD = 1.5;
const MIN_ACROSS = 10;
const HORIZONTAL_HEIGHT = 9;

export type DevicePin = {
  readonly name: string;
  /** 箱の辺の上の付け根。 */
  readonly base: Mm;
  /** ピンの先。配線はここへつながる。 */
  readonly tip: Mm;
};

export type PlacedDevice = {
  readonly spec: DeviceSpec;
  readonly box: RectMm;
  readonly face: Side;
  readonly pins: readonly DevicePin[];
  /** 名札の中心。ピンの名前を書く帯を避けた所。 */
  readonly label: Mm;
};

/** 箱の中心が基板のどちら側にあるか。ピンはそちらから基板へ向ける。 */
export function faceOf(at: Mm, board: Board): Side {
  const outX = Math.max(-at.x, at.x - board.width, 0);
  const outY = Math.max(-at.y, at.y - board.height, 0);
  if (outX >= outY) return at.x > board.width / 2 ? 'left' : 'right';
  return at.y > board.height / 2 ? 'top' : 'bottom';
}

const mmWidth = (text: string): number => (textWidth(text) * 9) / PX;

const isVertical = (face: Side): boolean => face === 'left' || face === 'right';

function boxSize(spec: DeviceSpec, face: Side): { readonly width: number; readonly height: number; readonly nameStrip: number } {
  const names = Math.max(...spec.pins.map(mmWidth));
  const label = mmWidth(spec.label);
  if (isVertical(face)) {
    const strip = names + PAD;
    return {
      width: Math.max(MIN_ACROSS, label + strip + 3 * PAD),
      height: Math.max(MIN_ACROSS, spec.pins.length * PITCH),
      nameStrip: strip,
    };
  }
  const pitch = Math.max(PITCH + 0.5, names + PAD);
  return {
    width: Math.max(MIN_ACROSS, spec.pins.length * pitch, label + 2 * PAD),
    height: HORIZONTAL_HEIGHT,
    nameStrip: DEVICE_TEXT_MM + PAD * 2,
  };
}

/** ピンを辺の上に等間隔に置く。 */
function pinsOf(spec: DeviceSpec, box: RectMm, face: Side): readonly DevicePin[] {
  const count = spec.pins.length;
  return spec.pins.map((name, index) => {
    const along = (index + 0.5) / count;
    switch (face) {
      case 'right': {
        const base = { x: box.x + box.width, y: box.y + along * box.height };
        return { name, base, tip: { x: base.x + STUB, y: base.y } };
      }
      case 'left': {
        const base = { x: box.x, y: box.y + along * box.height };
        return { name, base, tip: { x: base.x - STUB, y: base.y } };
      }
      case 'bottom': {
        const base = { x: box.x + along * box.width, y: box.y + box.height };
        return { name, base, tip: { x: base.x, y: base.y + STUB } };
      }
      case 'top': {
        const base = { x: box.x + along * box.width, y: box.y };
        return { name, base, tip: { x: base.x, y: base.y - STUB } };
      }
    }
  });
}

/** 名札の中心。ピンの名前の帯を除いた残りの真ん中。 */
function labelAt(box: RectMm, face: Side, strip: number): Mm {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  switch (face) {
    case 'right': return { x: cx - strip / 2, y: cy };
    case 'left': return { x: cx + strip / 2, y: cy };
    case 'bottom': return { x: cx, y: cy - strip / 2 };
    case 'top': return { x: cx, y: cy + strip / 2 };
  }
}

export function placeDevice(spec: DeviceSpec, board: Board): PlacedDevice {
  const face = spec.face ?? faceOf(spec.at, board);
  const size = boxSize(spec, face);
  const box: RectMm = {
    x: spec.at.x - size.width / 2,
    y: spec.at.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
  return { spec, box, face, pins: pinsOf(spec, box, face), label: labelAt(box, face, size.nameStrip) };
}

/** 箱が基板に重なっているか (機器は基板の外に置く)。 */
export const overlapsBoard = (box: RectMm, board: Board): boolean =>
  box.x < board.width && box.x + box.width > 0 && box.y < board.height && box.y + box.height > 0;

/** 箱とピンの先を囲む点 (図の広がりの計算用)。 */
export const deviceCorners = (device: PlacedDevice): readonly Mm[] => [
  { x: device.box.x, y: device.box.y },
  { x: device.box.x + device.box.width, y: device.box.y + device.box.height },
  ...device.pins.map((pin) => pin.tip),
];

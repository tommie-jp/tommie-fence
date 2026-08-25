import type { BoardPart } from '../parts/boards.ts';
import { boardPartNames, lookupBoardPart } from '../parts/boards.ts';

/** 部品の形。ここに無い種類は描けないので配置時にエラーにする。 */
export type Footprint =
  | { readonly kind: 'two-lead' }
  | { readonly kind: 'three-lead' }
  /** 溝をまたぐ 4 本足のスイッチ (6mm 角のタクトスイッチ)。 */
  | { readonly kind: 'switch' }
  | { readonly kind: 'dip'; readonly pins: number }
  | { readonly kind: 'sip'; readonly pins: number }
  | { readonly kind: 'board'; readonly board: BoardPart }
  | { readonly kind: 'device' };

const TWO_LEAD_TYPES = new Set(['resistor', 'capacitor', 'led', 'diode', 'buzzer', 'crystal', 'inductor']);
const THREE_LEAD_TYPES = new Set(['transistor', 'potentiometer', 'slide-switch']);
const SWITCH_TYPES = new Set(['pushbutton']);

const DIP_PATTERN = /^dip(\d+)$/;
const DIP_MIN_PINS = 4;
const DIP_MAX_PINS = 40;

const SIP_PATTERN = /^sip(\d+)$/;
// 1 本のヘッダは部品として意味を持たない。上限は dip に合わせる。
const SIP_MIN_PINS = 2;
const SIP_MAX_PINS = 40;

export function lookupFootprint(type: string): Footprint | null {
  if (TWO_LEAD_TYPES.has(type)) return { kind: 'two-lead' };
  if (THREE_LEAD_TYPES.has(type)) return { kind: 'three-lead' };
  if (SWITCH_TYPES.has(type)) return { kind: 'switch' };
  if (type === 'device') return { kind: 'device' };

  const board = lookupBoardPart(type);
  if (board) return { kind: 'board', board };

  const dip = DIP_PATTERN.exec(type);
  if (dip) {
    const pins = Number(dip[1]);
    if (pins >= DIP_MIN_PINS && pins <= DIP_MAX_PINS && pins % 2 === 0) return { kind: 'dip', pins };
  }

  const sip = SIP_PATTERN.exec(type);
  if (sip) {
    const pins = Number(sip[1]);
    // 片側だけの列なので、dip と違って奇数でよい。
    if (pins >= SIP_MIN_PINS && pins <= SIP_MAX_PINS) return { kind: 'sip', pins };
  }

  return null;
}

export const knownPartTypes = (): readonly string[] => [
  ...TWO_LEAD_TYPES,
  ...THREE_LEAD_TYPES,
  ...SWITCH_TYPES,
  'dipN',
  'sipN',
  ...boardPartNames(),
  'device',
];

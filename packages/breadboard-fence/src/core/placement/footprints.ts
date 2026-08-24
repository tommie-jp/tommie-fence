/** 部品の形。ここに無い種類は描けないので配置時にエラーにする。 */
export type Footprint =
  | { readonly kind: 'two-lead' }
  | { readonly kind: 'three-lead' }
  | { readonly kind: 'dip'; readonly pins: number }
  | { readonly kind: 'device' };

const TWO_LEAD_TYPES = new Set(['resistor', 'capacitor', 'led']);
const THREE_LEAD_TYPES = new Set(['transistor']);
const DIP_PATTERN = /^dip(\d+)$/;
const DIP_MIN_PINS = 4;
const DIP_MAX_PINS = 40;

export function lookupFootprint(type: string): Footprint | null {
  if (TWO_LEAD_TYPES.has(type)) return { kind: 'two-lead' };
  if (THREE_LEAD_TYPES.has(type)) return { kind: 'three-lead' };
  if (type === 'device') return { kind: 'device' };

  const dip = DIP_PATTERN.exec(type);
  if (dip) {
    const pins = Number(dip[1]);
    if (pins >= DIP_MIN_PINS && pins <= DIP_MAX_PINS && pins % 2 === 0) return { kind: 'dip', pins };
  }
  return null;
}

export const knownPartTypes = (): readonly string[] => [
  ...TWO_LEAD_TYPES,
  ...THREE_LEAD_TYPES,
  'dipN',
  'device',
];

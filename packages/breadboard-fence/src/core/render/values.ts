const MULTIPLIERS: Record<string, number> = { r: 1, k: 1e3, m: 1e6 };

const DIGIT_COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray', 'white'];

const MULTIPLIER_COLORS: Record<number, string> = {
  [-2]: 'silver',
  [-1]: 'gold',
  0: 'black',
  1: 'brown',
  2: 'red',
  3: 'orange',
  4: 'yellow',
  5: 'green',
  6: 'blue',
  7: 'violet',
};

const PLAIN = /^(\d+(?:\.\d+)?)([rkm]?)$/i;
const INFIX = /^(\d+)([rkm])(\d+)$/i;

/** `10k` `4k7` `1R` `2.2M` などの抵抗値表記をオームに直す。読めなければ null。 */
export function parseOhms(text: string): number | null {
  const cleaned = text.trim().replace(/(Ω|Ω|ohms?)$/iu, '').trim();

  const infix = INFIX.exec(cleaned);
  if (infix) {
    const [, whole, unit, fraction] = infix;
    return Number(`${whole}.${fraction}`) * (MULTIPLIERS[(unit ?? 'r').toLowerCase()] ?? 1);
  }

  const plain = PLAIN.exec(cleaned);
  if (plain) {
    const [, digits, unit] = plain;
    const value = Number(digits) * (unit ? MULTIPLIERS[unit.toLowerCase()] ?? 1 : 1);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

/** 3 本のカラーコード (数字 2 本 + 乗数 1 本)。表せない値は null。 */
export function resistorBandColors(ohms: number): readonly [string, string, string] | null {
  if (!Number.isFinite(ohms) || ohms <= 0) return null;

  const exponent = Math.floor(Math.log10(ohms));
  let digits = Math.round(ohms / 10 ** (exponent - 1));
  let multiplier = exponent - 1;
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    multiplier += 1;
  }

  const first = DIGIT_COLORS[Math.floor(digits / 10)];
  const second = DIGIT_COLORS[digits % 10];
  const scale = MULTIPLIER_COLORS[multiplier];

  return first && second && scale ? [first, second, scale] : null;
}

import { lookupGateUnits } from 'fence-kit';
import type { PartSpec } from './types.ts';

/**
 * ゲートの記号に添える IC のピンの番号 (`U1A: nand c3 74HC00` の 1・2 → 3)。
 *
 * **IC の 1 回路 = 記号 1 つ。** 回路は ID の末尾の大文字 (`U1A` の `A` = 1 つ目、`B` = 2 つ目 …) で
 * 選び、番号は**型番からピンの名前の表で引く** (`pinouts.ts` の `1A` `1B` `1Y` の印字)。
 * 型番が表に無い・ID に回路の字が無いときは何も添えない (今までの図のまま)。
 */

/** 番号を添えられる記号と、その入力の数。 */
const ARITY: Readonly<Record<string, number>> = {
  and: 2, or: 2, nand: 2, nor: 2, xor: 2, xnor: 2, not: 1, buffer: 1,
};

/** 記号のピン (circuitikz のアンカー名)。入力は上から、出力は右。 */
const INPUT_ANCHORS: Readonly<Record<number, readonly string[]>> = {
  1: ['in'],
  2: ['in 1', 'in 2'],
};

/** ID の末尾の回路の字 (`U1A` の `A`)。直前が数字のときだけ — `GATEA` のような名前は回路ではない。 */
const UNIT_LETTER = /^.*\d([A-Z])$/;

export type GateNumber = { readonly anchor: string; readonly text: string };

export type GateNumbers = {
  readonly numbers: readonly GateNumber[];
  /** 添えられなかった理由 (お知らせに出す)。何も言わなくてよいときは null。 */
  readonly problem: string | null;
};

const NONE: GateNumbers = { numbers: [], problem: null };

const unitLetters = (count: number): string =>
  Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index)).join('・');

export function gateNumbersOf(part: PartSpec): GateNumbers {
  if (part.kind !== 'multi-terminal' || !Object.hasOwn(ARITY, part.type)) return NONE;
  const letter = UNIT_LETTER.exec(part.id)?.[1];
  if (letter === undefined) return NONE;
  const units = lookupGateUnits(part.value);
  if (units === null || part.value === null) return NONE;

  const unit = units[letter.charCodeAt(0) - 65];
  if (unit === undefined) {
    return { numbers: [], problem: `${part.id}: ${part.value} の回路は ${unitLetters(units.length)} までです` };
  }
  const arity = ARITY[part.type] ?? 0;
  if (unit.inputs.length !== arity) {
    return {
      numbers: [],
      problem: `${part.id}: ${part.value} は ${unit.inputs.length} 入力なので、${arity} 入力の ${part.type} にはピンの番号を添えません`,
    };
  }
  const anchors = INPUT_ANCHORS[arity] ?? [];
  return {
    numbers: [
      ...anchors.map((anchor, index) => ({ anchor, text: String(unit.inputs[index]) })),
      { anchor: 'out', text: String(unit.output) },
    ],
    problem: null,
  };
}

import { isMapForm, isTurned } from '../parts.ts';
import { yamlScalar } from './yamlScalar.ts';
import type { Turn } from '../parts.ts';
import type { PartSpec } from '../types.ts';

/**
 * 仕様から**部品の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * 中身から本文を組み立てる形にするための土台。**書き換えた項目だけ**これを
 * 通し、触っていない行は書かれた字のまま残す。だから**桁揃えの空白は作らない**
 * (`IN:  port a1` のように揃えて書く人がいるが、それは書いた人の手癖で、
 * こちらが真似ると触っていない行まで揃え直すことになる)。
 *
 * 読む側 (`parser/compact.ts`) と**同じ並び**で書く。ずれると、書き換えた
 * とたんに読めなくなる行ができる:
 *
 * - 2 端子 — `ID: 種類 番地 番地 [値] [l=字] [i=字] [v=字]`
 * - 1 端子 — `ID: 種類 番地 [向き]`
 * - 多端子 — `ID: 種類 番地 [向き] [値]`
 *
 * **番地は読んだ行と列ではなく、書かれた綴りを使う** (`spelling`)。
 * `points:` の名前で書いた番地 (`R2: resistor fb d3`) が、書き戻すときに
 * 番地へ化けないようにするため。例 22 文書のうち 4 行がこの形だった。
 */

/** 向きの語。読む側の `ROTATIONS` / `MIRROR` と同じ綴り。 */
const turnWords = (turn: Turn): readonly string[] => {
  if (!isTurned(turn)) return [];
  return [
    ...(turn.rotate === 0 ? [] : [`r${turn.rotate}`]),
    ...(turn.mirror ? ['mirror'] : []),
  ];
};

/** `l=` / `i=` / `v=` の札。**矢を返す印 (`<`) は電流と電圧だけ**。 */
const tag = (key: string, text: string | null, reversed = false): readonly string[] =>
  (text === null ? [] : [`${key}${reversed ? '<' : ''}=${text}`]);

export function spellPart(part: PartSpec): string {
  // **機器はブロックで書くので、鍵の行は ID だけ** (`M1:`)。中身の行は
  // `spellPartBlock` が組む。1 行に畳むと下の行が宙に浮く (52 の docs/66)。
  if (isMapForm(part)) return `${part.id}:`;

  // **種類も番地も、書かれた綴りをそのまま使う** (`written` / `spelling`)。
  // 読んだ正式名で書き戻すと、略記や別名で書いた行が勝手に長くなる。
  const head = [`${part.id}:`, part.written, ...part.spelling];

  if (part.kind === 'two-terminal') {
    return [
      ...head,
      ...(part.value === null ? [] : [part.value]),
      ...tag('l', part.label),
      ...tag('i', part.current, part.currentReversed),
      ...tag('v', part.voltage, part.voltageReversed),
    ].join(' ');
  }

  if (part.kind === 'one-terminal') return [...head, ...turnWords(part.turn)].join(' ');

  // 多端子の `orientation` (± の並び) は向きの語と同じ場所に書く。
  return [
    ...head,
    ...(part.orientation === null ? [] : [part.orientation]),
    ...turnWords(part.turn),
    ...(part.value === null ? [] : [part.value]),
  ].join(' ');
}

/** ブロックの中の項目の字下げ (鍵の行から 2 つ下げる)。 */
const FIELD_INDENT = '  ';

/**
 * 部品を**書かれる形のまま**組む。1 行の部品は 1 行、機器 (`device`) は
 * 鍵の行と中身の行 (`type` `at` `label` `pins` `turn`)。字下げは鍵の行からの相対。
 */
export function spellPartBlock(part: PartSpec): readonly string[] {
  if (!isMapForm(part) || part.kind !== 'multi-terminal') return [spellPart(part)];
  const turn = turnWords(part.turn);
  return [
    `${part.id}:`,
    `${FIELD_INDENT}type: ${part.type}`,
    `${FIELD_INDENT}at: ${part.spelling[0] ?? ''}`,
    ...(part.value === null ? [] : [`${FIELD_INDENT}label: ${yamlScalar(part.value)}`]),
    `${FIELD_INDENT}pins: [${(part.pinNames ?? []).join(', ')}]`,
    ...(turn.length === 0 ? [] : [`${FIELD_INDENT}turn: ${turn.join(' ')}`]),
  ];
}

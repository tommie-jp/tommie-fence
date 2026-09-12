import { MIRROR_WORD, isTurned } from '../parts/orient.ts';
import type { Turn } from '../parts/orient.ts';
import type { PartSpec } from '../types.ts';

/**
 * 仕様から**部品の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * 中身から本文を組み立てる形にするための土台。**書き換えた項目だけ**これを
 * 通し、触っていない行は書かれた字のまま残す。だから**桁揃えの空白は作らない**。
 *
 * 読む側 (`parser/parts.ts`) と**同じ並び**で書く:
 * `ID: 種類 穴… [向き] [値]`
 *
 * **この板は仕様がもう書かれた綴りを持っている** — 種類は `written`
 * (略記のまま)、穴は `holes` (`points:` の名前のまま)。ほかの 2 つで
 * 足すことになった控えが、ここでは最初から要らない (測ったら例 10 文書の
 * 59 行が素朴な組み直しで 100 % 一致した)。
 *
 * **機器は組み直さない。** 別の並び (`doc.devices`) にあり、ブロックで書く形。
 */

/** 向きの語。読む側の `rotationOf` / `MIRROR_WORD` と同じ綴り。 */
const turnWords = (turn: Turn): readonly string[] => (isTurned(turn)
  ? [...(turn.rotate === 0 ? [] : [`r${turn.rotate}`]), ...(turn.mirror ? [MIRROR_WORD] : [])]
  : []);

export function spellPart(part: PartSpec): string {
  return [
    `${part.id}:`,
    part.written,
    ...part.holes,
    ...turnWords(part.turn),
    ...(part.value === null ? [] : [part.value]),
  ].join(' ');
}

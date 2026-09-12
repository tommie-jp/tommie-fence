import { isTurned, turnWord } from '../parts/orient.ts';
import type { HoleRef, PartSpec } from '../types.ts';

/**
 * 仕様から**部品の 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * 中身から本文を組み立てる形にするための土台。**書き換えた項目だけ**これを
 * 通し、触っていない行は書かれた字のまま残す。だから**桁揃えの空白は作らない**
 * (揃えて書くのは書いた人の手癖で、真似ると触っていない行まで揃え直す)。
 *
 * 読む側 (`parser/compact.ts`) と**同じ並び**で書く:
 * `ID: 種類 穴… [向き] [値] [ラベル]`
 *
 * **書かれた綴りを使う** — 種類は `written` (略記のまま)、穴は `addr`
 * (`points:` の名前のまま)、足の名前は**書かれていたときだけ**添える
 * (`tagged`)。読んだ値で書き戻すと、書いた人の綴りが化ける。
 *
 * **ブロックで書いた部品は組み直さない** (機器と、マップで書いた部品)。
 * 1 行に落ちないので `null` を返し、呼ぶ側が書かれた行をそのまま残す。
 */

/** `b12(A)` の綴り。足の名前は書かれていたときだけ。 */
const hole = (one: HoleRef): string => (one.tagged ? `${one.written}(${one.tag})` : one.written);

export function spellPart(part: PartSpec): string | null {
  // 機器もマップで書いた部品も、ブロックなので 1 行に落ちない。
  if (part.type === 'device' || part.block) return null;

  // `@` で書いた形は、穴 (か top / bottom) を 1 つだけ添える。
  if (part.anchored) {
    const target = part.at ?? part.holes[0]?.written ?? '';
    return [
      `${part.id}:`, part.written, '@', target,
      ...(isTurned(part.turn) ? [turnWord(part.turn.rotate)] : []),
      ...(part.label === null ? [] : [part.labelTagged ? `l=${part.label}` : part.label]),
    ].join(' ');
  }

  return [
    `${part.id}:`,
    part.written,
    ...part.holes.map(hole),
    ...(isTurned(part.turn) ? [turnWord(part.turn.rotate)] : []),
    ...(part.value === null ? [] : [part.value]),
    ...(part.label === null ? [] : [part.labelTagged ? `l=${part.label}` : part.label]),
  ].join(' ');
}

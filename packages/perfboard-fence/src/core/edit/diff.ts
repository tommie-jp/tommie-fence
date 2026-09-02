import { normalizeNewlines } from 'fence-kit';
import type { Edit, LineEdit, NetDiff } from 'fence-kit';
import { renderPerfboard } from '../index.ts';
import { parseFence } from '../parser/parseFence.ts';
import { applyEdits } from './shared.ts';

/**
 * 書き換えの前と後で**接続がどう変わったか**。動かす操作はどれもこれを添える。
 *
 * **全穴が独立している**ので、circuit や breadboard と違って「寄せただけ」で
 * つながることは無い — 変わったら必ず配線か足の話になる。だからこそ黙らせない
 * (52 の docs/13 の決め 8)。
 */

/** 組を 1 つの綴りにするときの区切り。端子の名前に現れない字を選ぶ。 */
const SEPARATOR = ' ';

/**
 * ネットリストを「つながっている端子の組」の集合にする。
 *
 * **名前を付けた穴も相手として数える。** 部品が 1 つしか来ていないネットでは
 * 端子の組ができず、`points:` の名前から離れても何も言えなくなる
 * (`IN -- a2 -- b2` の b2 から R1 を外した、が黙る)。名前は書き手が付けた
 * 目印なので、そこから離れたかどうかは知らせる値打ちがある。
 */
function connectionsOf(source: string): Set<string> {
  const { doc } = parseFence(source);
  const named = new Set((doc?.points ?? []).map((point) => point.name));

  const pairs = new Set<string>();
  for (const net of renderPerfboard(source).netlist) {
    const refs = [...net.refs, ...(named.has(net.name) ? [net.name] : [])].sort();
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) pairs.add(`${refs[i]}${SEPARATOR}${refs[j]}`);
    }
  }
  return pairs;
}

const toPairs = (keys: readonly string[]): NetDiff['lost'] =>
  keys.map((key) => key.split(SEPARATOR) as unknown as NetDiff['lost'][number]);

/** その書き換えを当てたら接続がどう変わるか。書き換えが無ければ変化も無い。 */
export function diffAfter(source: string, edits: readonly Edit[]): NetDiff {
  if (edits.length === 0) return { lost: [], gained: [] };

  const was = connectionsOf(source);
  const now = connectionsOf(applyEdits(normalizeNewlines(source), edits));

  return {
    lost: toPairs([...was].filter((pair) => !now.has(pair)).sort()),
    gained: toPairs([...now].filter((pair) => !was.has(pair)).sort()),
  };
}

/**
 * 行を出し入れしたときの変化。**行番号は当てる前のもの**なので、
 * 後ろから当てて数えるのは同じ (`applyEdits` と揃える)。
 */
export function diffAfterLines(source: string, lines: readonly LineEdit[]): NetDiff {
  if (lines.length === 0) return { lost: [], gained: [] };

  const rows = normalizeNewlines(source).split('\n');
  for (const edit of [...lines].sort((a, b) => b.line - a.line)) {
    if (edit.kind === 'delete') rows.splice(edit.line - 1, 1);
    else rows.splice(edit.line - 1, 0, edit.text);
  }

  const was = connectionsOf(source);
  const now = connectionsOf(rows.join('\n'));
  return {
    lost: toPairs([...was].filter((pair) => !now.has(pair)).sort()),
    gained: toPairs([...now].filter((pair) => !was.has(pair)).sort()),
  };
}

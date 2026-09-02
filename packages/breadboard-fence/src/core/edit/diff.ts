import type { Edit, NetDiff } from 'fence-kit';
import { renderBreadboard } from '../index.ts';
import { normalizeNewlines } from '../newlines.ts';
import { applyEdits } from './shared.ts';

/**
 * 書き換えの前と後で**接続がどう変わったか**。動かす操作はどれもこれを添える。
 *
 * **同じ列の 5 穴はつながっている**ので、1 つ動かすと意図せずつながることが
 * circuit より起きやすい。黙らせない (52 の docs/13 の決め 8)。
 * 逆に、同じ導通の中で寄っただけなら**何も言わない** — 言うと嘘になる。
 */

/** 組を 1 つの綴りにするときの区切り。端子の名前に現れない字を選ぶ。 */
const SEPARATOR = ' ';

/** ネットリストを「つながっている端子の組」の集合にする。 */
function connectionsOf(source: string): Set<string> {
  const pairs = new Set<string>();
  for (const net of renderBreadboard(source).netlist) {
    const refs = [...net.refs].sort();
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

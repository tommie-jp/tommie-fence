import { applyRewrite } from 'fence-kit';
import type { Edit, EditResult, LineEdit, NetDiff } from 'fence-kit';
import { renderCopper } from '../index.ts';
import { parseFence } from '../parser/parseFence.ts';

/** 書き換えの断り。**行番号つき**で返す (帯にそのまま出せる)。 */
export const refuse = (message: string, line: number | null = null): EditResult => ({ ok: false, error: { message, line } });

const NO_DIFF: NetDiff = { lost: [], gained: [] };
const SEPARATOR = ' ';

/** 足どうしのつながり (ネットの中の 2 つずつ)。 */
function connectionsOf(source: string): Set<string> {
  const pairs = new Set<string>();
  for (const net of renderCopper(source).netlist) {
    const refs = [...net.refs].sort();
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) pairs.add(`${refs[i]}${SEPARATOR}${refs[j]}`);
    }
  }
  return pairs;
}

const toPairs = (keys: readonly string[]): NetDiff['lost'] =>
  keys.map((key) => key.split(SEPARATOR) as unknown as NetDiff['lost'][number]);

/** 書き換えで**離れた・つながった**足の組 (perfboard と同じ数え方)。 */
function diffOf(source: string, after: string): NetDiff {
  const was = connectionsOf(source);
  const now = connectionsOf(after);
  return {
    lost: toPairs([...was].filter((pair) => !now.has(pair)).sort()),
    gained: toPairs([...now].filter((pair) => !was.has(pair)).sort()),
  };
}

/**
 * 書き換えを答えにする。**書いたあと読み直して、狙った行が読めなくなったら断る**
 * (壊した字を書くより断るほうがよい。3 つのフェンスと同じ約束)。試し当て
 * (`preview`) では接続の変化を数えない — 図を 2 枚組み直すのは重い。
 */
export function changed(
  source: string,
  change: { readonly edits?: readonly Edit[]; readonly lines?: readonly LineEdit[]; readonly wires?: number },
  options: { readonly preview?: boolean; readonly check?: readonly number[] } = {},
): EditResult {
  const after = applyRewrite(source, change);
  const before = new Set(parseFence(source).errors.filter((error) => error.notice !== true).map((error) => error.message));
  const broken = parseFence(after).errors
    .filter((error) => error.notice !== true && !before.has(error.message))
    .find((error) => options.check === undefined || error.line === null || options.check.includes(error.line));
  if (broken !== undefined) return refuse(broken.message, broken.line);
  return {
    ok: true,
    value: {
      ...(change.edits === undefined ? {} : { edits: change.edits }),
      ...(change.lines === undefined ? {} : { lines: change.lines }),
      ...(change.wires === undefined ? {} : { wires: change.wires }),
      diff: options.preview === true ? NO_DIFF : diffOf(source, after),
    },
  };
}

import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';

/**
 * 配線の欄。**回路図の配線に色は書けない。**
 *
 * 板の 2 つは被覆の色を書く (実物の線が何色か、という話) が、回路図の線は
 * 図の地の文と同じ色で引くもので、1 本ずつ色を変える意味が無い
 * (色は `style: ink-color` で図ごとに決まる)。
 *
 * それでも**欄は出す** — 選んだものが何かは分かるほうがよく、
 * 「色を書けない」ことは書ける欄が空であることで伝わる。
 */

const HANDLE = 'wire:';

export const isWireHandle = (handle: string): boolean => handle.startsWith(HANDLE);

const wireLineOf = (handle: string): number | null => {
  if (!isWireHandle(handle)) return null;
  const line = Number(handle.slice(HANDLE.length));
  return Number.isInteger(line) && line > 0 ? line : null;
};

export function wireFields(source: string, handle: string) {
  const line = wireLineOf(handle);
  if (line === null) return null;
  const { doc } = parseFence(normalizeNewlines(source));
  const wire = doc?.wires.find((one) => one.line === line);
  if (wire === undefined) return null;
  return { id: `配線 (${line} 行目)`, type: 'wire', value: '', label: '', color: '', can: [] as const };
}

/** 色の候補。**回路図には無い**ので空の一覧を返す (欄も出ない)。 */
export const renderColorOptions = (id: string): string => `<datalist id="${id}"></datalist>`;

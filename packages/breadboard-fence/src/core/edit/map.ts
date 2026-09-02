import type { FenceBlock } from 'fence-kit';
import { extractBreadboardFences } from '../fences.ts';
import { formatAddress } from '../model/address.ts';
import { normalizeNewlines } from '../newlines.ts';
import { parseFence } from '../parser/parseFence.ts';
import { scan } from './point.ts';

/**
 * カーソルとマップを突き合わせる。**掴む物はどれも図の上にある**ので、
 * ここが返すのは「その行と桁が指しているもの」だけ。
 */

/** カーソルが指しているもの。`id` は文字列 (穴なら綴り、配線なら行)。 */
export type Aim = {
  readonly kind: 'part' | 'node' | 'wire';
  readonly id: string;
};

/** カーソルのある行 (1 始まり) を含む breadboard フェンス。無ければ null。 */
export function fenceAt(markdown: string, line: number): FenceBlock | null {
  for (const fence of extractBreadboardFences(markdown)) {
    const body = fence.source === '' ? 0 : fence.source.replace(/\n$/, '').split('\n').length;
    // 開き記号の行から閉じ記号の行までを「中」とみなす (縁にあっても拾う)。
    if (line >= fence.line && line <= fence.line + body + 1) return fence;
  }
  return null;
}

/**
 * フェンスの中の行 (1 始まり) と桁 (0 始まり) が指しているもの。
 *
 * **番地の綴りの上なら穴**、それ以外はその行が持っているもの (部品か配線)。
 * 行の上ならどこでも同じ答えになるので、行のどこにカーソルがあっても迷わない。
 */
export function aimAt(source: string, line: number, column: number): Aim | null {
  const doc = scan(source);
  if (doc === null) return null;

  const on = doc.written.find((one) =>
    one.line === line && column >= one.column && column <= one.column + one.length);
  if (on !== undefined) return { kind: 'node', id: formatAddress(on.address) };

  // `points:` の行が持っているのはその穴そのもの。**行の上ならどこでも**同じ答え
  // (名前の上にカーソルがあるほうが普通なので、綴りの上だけでは拾えない)。
  const named = doc.written.find((one) => one.line === line && one.from === 'point');
  if (named !== undefined) return { kind: 'node', id: formatAddress(named.address) };

  const { doc: parsed } = parseFence(normalizeNewlines(source));
  if (parsed === null) return null;

  const part = parsed.parts.find((one) => one.line === line);
  if (part !== undefined) return { kind: 'part', id: part.id };

  const wire = parsed.wires.find((one) => one.line === line);
  return wire === undefined ? null : { kind: 'wire', id: String(line) };
}

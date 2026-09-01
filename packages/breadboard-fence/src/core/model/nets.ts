import { computeNets as computeNetsCore } from 'fence-kit';
import type { NetInput as CoreInput, NetMember } from 'fence-kit';
import { RAIL_ROWS } from '../types.ts';
import type { Net, StripId } from '../types.ts';

export type { NetMember };
export type NetInput = Omit<CoreInput, 'preferredName'>;

const RAIL_ORDER: readonly string[] = RAIL_ROWS;

const railName = (strip: StripId): string | null => (strip.startsWith('rail:') ? strip.slice('rail:'.length) : null);

/**
 * 電源レールを含むネットには、レールの名前を付ける (`+t/-t` のように並べる)。
 * **ここがブレッドボード固有の事情**で、union-find そのものは fence-kit にある。
 */
function railNameOf(strips: readonly StripId[]): string | null {
  const rails = strips
    .map(railName)
    .filter((name): name is string => name !== null)
    .sort((a, b) => RAIL_ORDER.indexOf(a) - RAIL_ORDER.indexOf(b));
  return rails.length > 0 ? rails.join('/') : null;
}

/**
 * 穴の導通 (ストリップ) と配線からネットリストを組み立てる。
 * 部品は「ネットとネットの間の枝」なので、ネットをつなぐのは配線だけ。
 */
export const computeNets = (input: NetInput): Net[] =>
  computeNetsCore({ ...input, preferredName: railNameOf });

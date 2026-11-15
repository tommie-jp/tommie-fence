import { computeNets as computeNetsCore } from 'fence-kit';
import type { NetInput as CoreInput, NetMember } from 'fence-kit';
import { RAIL_ROWS } from '../types.ts';
import type { Net, StripId } from '../types.ts';

export type { NetMember };
export type NetInput = Omit<CoreInput, 'preferredName'>;

const RAIL_ORDER: readonly string[] = RAIL_ROWS;

/** レールのストリップの名前 (`+t`、2 枚め以降は `2:+t`)。 */
const railName = (strip: StripId): string | null => {
  const match = /^(?:(\d+)\/)?rail:(.+)$/.exec(strip);
  if (!match) return null;
  const [, tier, rail = ''] = match;
  return tier === undefined ? rail : `${tier}:${rail}`;
};

/** 並べる順: 枚が先、枚の中はレールの上からの順。 */
const railRank = (name: string): number => {
  const [tier, rail] = name.includes(':') ? name.split(':') as [string, string] : ['1', name];
  return Number(tier) * RAIL_ORDER.length + RAIL_ORDER.indexOf(rail);
};

/**
 * 電源レールを含むネットには、レールの名前を付ける (`+t/-t` のように並べる)。
 * **ここがブレッドボード固有の事情**で、union-find そのものは fence-kit にある。
 */
function railNameOf(strips: readonly StripId[]): string | null {
  const rails = strips
    .map(railName)
    .filter((name): name is string => name !== null)
    .sort((a, b) => railRank(a) - railRank(b));
  return rails.length > 0 ? rails.join('/') : null;
}

/**
 * 穴の導通 (ストリップ) と配線からネットリストを組み立てる。
 * 部品は「ネットとネットの間の枝」なので、ネットをつなぐのは配線だけ。
 */
export const computeNets = (input: NetInput): Net[] =>
  computeNetsCore({ ...input, preferredName: railNameOf });

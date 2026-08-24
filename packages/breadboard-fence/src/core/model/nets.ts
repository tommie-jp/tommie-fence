import { RAIL_ROWS } from '../types.ts';
import type { Net, StripId } from '../types.ts';

export type NetMember = { readonly ref: string; readonly strip: StripId };

export type NetInput = {
  readonly members: readonly NetMember[];
  readonly links: readonly (readonly [StripId, StripId])[];
};

const RAIL_ORDER: readonly string[] = RAIL_ROWS;

const railName = (strip: StripId): string | null => (strip.startsWith('rail:') ? strip.slice('rail:'.length) : null);

/**
 * 穴の導通 (ストリップ) と配線からネットリストを組み立てる。
 * 部品は「ネットとネットの間の枝」なので、ネットをつなぐのは配線だけ。
 */
export function computeNets(input: NetInput): Net[] {
  const parent = new Map<StripId, StripId>();

  const add = (strip: StripId): void => {
    if (!parent.has(strip)) parent.set(strip, strip);
  };

  const find = (strip: StripId): StripId => {
    let root = strip;
    // 未登録のストリップを渡されても止まるように、たどれなくなったらそこを根とする。
    for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
      root = next;
    }
    let cursor = strip;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  for (const member of input.members) add(member.strip);
  for (const [a, b] of input.links) {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  }

  const stripsByRoot = new Map<StripId, StripId[]>();
  for (const strip of parent.keys()) {
    const root = find(strip);
    const group = stripsByRoot.get(root);
    if (group) group.push(strip);
    else stripsByRoot.set(root, [strip]);
  }

  // 部品ピンが 1 本も乗っていないネットは配線だけの空中配線なので出力しない。
  const refsByRoot = new Map<StripId, string[]>();
  for (const member of input.members) {
    const root = find(member.strip);
    const refs = refsByRoot.get(root);
    if (refs) refs.push(member.ref);
    else refsByRoot.set(root, [member.ref]);
  }

  let anonymous = 0;
  return [...refsByRoot].map(([root, refs]) => {
    const strips = stripsByRoot.get(root) ?? [root];
    const rails = strips
      .map(railName)
      .filter((name): name is string => name !== null)
      .sort((a, b) => RAIL_ORDER.indexOf(a) - RAIL_ORDER.indexOf(b));
    return {
      name: rails.length > 0 ? rails.join('/') : `N${(anonymous += 1)}`,
      strips,
      refs,
    };
  });
}

import { RAIL_ROWS } from '../types.ts';
import type { Net, StripId } from '../types.ts';

export type NetMember = { readonly ref: string; readonly strip: StripId };

export type NetInput = {
  readonly members: readonly NetMember[];
  readonly links: readonly (readonly [StripId, StripId])[];
  /**
   * `points:` で名前を付けた穴の導通グループ。**定義順**で渡す。
   * 節点に名前を書いたなら、ネットリストにも同じ名前が出るほうが突き合わせやすい。
   */
  readonly names?: readonly (readonly [StripId, string])[];
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

  // `points:` に `N1` のような名前を書かれても、連番と同じ名前を 2 つ出さない。
  // ネット名が重なると「図と意図した回路の突き合わせ」がそこで成立しなくなる。
  const taken = new Set((input.names ?? []).map(([, name]) => name));
  let anonymous = 0;
  const nextName = (): string => {
    let name = `N${(anonymous += 1)}`;
    while (taken.has(name)) name = `N${(anonymous += 1)}`;
    return name;
  };

  return [...refsByRoot].map(([root, refs]) => {
    const strips = stripsByRoot.get(root) ?? [root];
    const rails = strips
      .map(railName)
      .filter((name): name is string => name !== null)
      .sort((a, b) => RAIL_ORDER.indexOf(a) - RAIL_ORDER.indexOf(b));
    if (rails.length > 0) return { name: rails.join('/'), strips, refs };

    // 名前は定義順に当てる。同じネットに 2 つ乗っていたら先に書いたほうを使う。
    const here = new Set(strips);
    const named = (input.names ?? []).find(([strip]) => here.has(strip));
    return { name: named?.[1] ?? nextName(), strips, refs };
  });
}

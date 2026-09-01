/**
 * 穴の導通と配線からネットリストを組み立てる。
 *
 * **盤面には依らない。** 見ているのは「導通グループの名前 (`StripId`) を、
 * 配線がどうつないだか」だけで、そのグループが**どうできているか**は
 * 盤面ごとに違う (ブレッドボードは列の 5 穴、ユニバーサル基板は穴 1 つ)。
 * 穴のある盤面を描くフェンスが 2 つになった時点で引き上げた。
 *
 * 盤面ごとの事情は `preferredName` 1 つに寄せてある。ブレッドボードは
 * 電源レールを含むネットにレールの名前を付けるが、ユニバーサル基板には
 * レールが無いので何も渡さない。
 */

export type StripId = string;

export type Net = {
  readonly name: string;
  readonly strips: readonly StripId[];
  readonly refs: readonly string[];
};

export type NetMember = { readonly ref: string; readonly strip: StripId };

export type NetInput = {
  readonly members: readonly NetMember[];
  readonly links: readonly (readonly [StripId, StripId])[];
  /**
   * 名前を付けた穴の導通グループ。**定義順**で渡す。
   * 節点に名前を書いたなら、ネットリストにも同じ名前が出るほうが突き合わせやすい。
   */
  readonly names?: readonly (readonly [StripId, string])[];
  /**
   * 盤面が持っている名前 (ブレッドボードの電源レールなど)。
   * 返した名前は `names` より優先される。
   */
  readonly preferredName?: (strips: readonly StripId[]) => string | null;
};

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

  // 名前を書かれても、連番と同じ名前を 2 つ出さない。
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
    const preferred = input.preferredName?.(strips) ?? null;
    if (preferred !== null) return { name: preferred, strips, refs };

    // 名前は定義順に当てる。同じネットに 2 つ乗っていたら先に書いたほうを使う。
    const here = new Set(strips);
    const named = (input.names ?? []).find(([strip]) => here.has(strip));
    return { name: named?.[1] ?? nextName(), strips, refs };
  });
}

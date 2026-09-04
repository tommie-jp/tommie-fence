import { cornerOf, formatAddress } from './address.ts';
import type { Address } from './address.ts';
import { wireContacts } from './circuit.ts';
import type { Circuit } from './circuit.ts';
import { namesNet } from '../parts.ts';
import { cellOf as addressOf, nameOfEndpoint } from '../types.ts';
import type { Endpoint, PartSpec } from '../types.ts';

/** つながっている端子のまとまり。図を見ずに回路を突き合わせるための出力。 */
export type Net = { readonly name: string; readonly refs: readonly string[] };

/**
 * 節点の名前。番地の綴り (`a3`) か、多端子部品の足 (`U1.out`) をそのまま使う。
 * 図を直してもネットの名前が動かない (Lcapy のダミーノード方式との差はここ)。
 */
type CellId = string;

type Member = { readonly ref: string; readonly cell: CellId; readonly part: PartSpec };

const cellOf = (address: Address): CellId => formatAddress(address);

/** 配線の端の節点名。core 全体で同じ綴りを使う (割れないように)。 */
const nodeOf = (endpoint: Endpoint): CellId => nameOfEndpoint(endpoint);

/**
 * 部品の端子に名前を付ける。2 端子は `R1.1` `R1.2`、1 端子は ID そのまま。
 * 多端子は足ごとに節点を持つが、どの足が使われたかは配線を見るまで分からない。
 * 置かれた交点そのものは節点ではないので、ここでは何も出さない。
 */
function membersOf(part: PartSpec): Member[] {
  if (part.kind === 'one-terminal') return [{ ref: part.id, cell: cellOf(part.at), part }];
  if (part.kind === 'multi-terminal') return [];
  return [
    { ref: `${part.id}.1`, cell: cellOf(part.from), part },
    { ref: `${part.id}.2`, cell: cellOf(part.to), part },
  ];
}

/** 配線から指された足。指された足だけがネットに現れる。 */
function pinMembersOf(circuit: Circuit): Member[] {
  const byId = new Map(circuit.parts.map((part) => [part.id, part]));
  const members: Member[] = [];
  const seen = new Set<string>();

  for (const wire of circuit.wires) {
    for (const endpoint of [wire.from, wire.to]) {
      if (endpoint.kind !== 'pin') continue;
      const part = byId.get(endpoint.part);
      if (part === undefined || seen.has(nodeOf(endpoint))) continue;
      seen.add(nodeOf(endpoint));
      members.push({ ref: nodeOf(endpoint), cell: nodeOf(endpoint), part });
    }
  }

  return members;
}

/**
 * 交点の導通そのもの。**部品は「ネットとネットの間の枝」**なので、交点をつなぐのは
 * 配線だけ。ただしグラウンド記号どうしは、回路図の約束どおり離れていても
 * 同じ節点として扱う。**ネットリストの一歩手前**で、どの節点が同じまとまりに
 * 居るかだけを返す。
 *
 * ネットリスト (`computeNets`) は**部品の足が乗っているまとまりしか出さない**ので、
 * 「部品に届いていない配線」を見るにはこちらが要る (`erc.ts`)。
 * 2 つが同じ union-find を使うことが大事で、別々に組むと片方だけ直したとき
 * 図とお知らせが黙って食い違う。
 */
export type Wiring = {
  /** その節点が属するまとまりの代表。知らない節点はそれ自身が代表。 */
  readonly rootOf: (cell: string) => string;
  /** 部品の端子。`ref` は `R1.1` のような呼び名。 */
  readonly members: readonly { readonly ref: string; readonly cell: string; readonly part: PartSpec }[];
};

export function wiringOf(circuit: Circuit): Wiring {
  const parent = new Map<CellId, CellId>();

  const add = (cell: CellId): void => {
    if (!parent.has(cell)) parent.set(cell, cell);
  };

  const find = (cell: CellId): CellId => {
    let root = cell;
    // 未登録の交点を渡されても止まるように、たどれなくなったらそこを根とする。
    for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
      root = next;
    }
    let cursor = cell;
    while (cursor !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: CellId, b: CellId): void => {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  };

  const members = [...circuit.parts.flatMap(membersOf), ...pinMembersOf(circuit)];
  for (const member of members) add(member.cell);

  for (const wire of circuit.wires) {
    const from = addressOf(wire.from);
    const to = addressOf(wire.to);
    // 折れた線は曲がり角も通る。そこに乗っている端も同じ節点なので、
    // 端どうしを直接つなぐだけでは足りない (足が絡む線は曲がり角を持たない)。
    const corner = from === null || to === null ? null : cornerOf(from, to, wire.operator);
    if (corner === null) {
      union(nodeOf(wire.from), nodeOf(wire.to));
      continue;
    }
    union(nodeOf(wire.from), cellOf(corner));
    union(cellOf(corner), nodeOf(wire.to));
  }

  // 端が別の配線の途中に乗っているところ (T 字) も同じ節点。
  for (const contact of wireContacts(circuit)) union(cellOf(contact.cell), nodeOf(contact.wire.from));

  // グラウンドは離れて描いても同じ節点。ここで結んでおかないと、
  // 図としては正しいのにネットリストだけが割れて見える。
  const grounds = members.filter((member) => member.part.type === 'ground');
  for (const ground of grounds.slice(1)) union(grounds[0]!.cell, ground.cell);

  // **同じ名前の記号どうしも同じ節点。** `VCC` を何か所にも描くのは回路図の
  // 書き方そのもので、離して描いても指しているネットは 1 つ。名前が違えば
  // 結ばない — そこは今までどおりで、5V と 3V3 を一緒にしないための線引き。
  const byName = new Map<string, Member[]>();
  for (const member of members) {
    if (!namesNet(member.part.type)) continue;
    const group = byName.get(member.part.id);
    if (group) group.push(member);
    else byName.set(member.part.id, [member]);
  }
  for (const group of byName.values()) {
    for (const rest of group.slice(1)) union(group[0]!.cell, rest.cell);
  }

  return { rootOf: find, members };
}

/**
 * 交点の導通からネットリストを組み立てる。**部品の足が乗っているまとまりだけ**が
 * ネットになる (どこにも部品の無い線のかたまりは、突き合わせるものが無い)。
 */
export function computeNets(circuit: Circuit): Net[] {
  const { rootOf: find, members } = wiringOf(circuit);

  const byRoot = new Map<CellId, Member[]>();
  for (const member of members) {
    const root = find(member.cell);
    const group = byRoot.get(root);
    if (group) group.push(member);
    else byRoot.set(root, [member]);
  }

  const groups = [...byRoot.values()];
  // 名前の付いたネットを先に押さえておく。ポートを N1 と名付けた図でも
  // 別のネットに同じ N1 を振らないため。
  const named = groups.map((group) => nameOf(group) ?? pointNameOf(group, circuit.points));
  const taken = new Set<string>();

  let anonymous = 0;
  const nextAnonymous = (): string => {
    let candidate = `N${(anonymous += 1)}`;
    while (taken.has(candidate) || named.includes(candidate)) candidate = `N${(anonymous += 1)}`;
    return candidate;
  };

  return groups.map((group, index) => ({
    name: claim(named[index] ?? nextAnonymous(), taken),
    // **同じ名前の記号は 1 つの端子として並べる。** `VCC` を 3 か所に描いた図で
    // `VCC, VCC, VCC` と並ぶと、突き合わせるときに何が 3 つあるのか読めない。
    refs: [...new Set(group.map((member) => member.ref))],
  }));
}

/**
 * 使われていない名前にして押さえる。
 * 同じ名前のネットが 2 つあると、テキストで回路を突き合わせるという
 * ネットリストの用途が成り立たない (ポートを GND と名付けた図など)。
 */
function claim(candidate: string, taken: Set<string>): string {
  let name = candidate;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${candidate}-${suffix}`;
  taken.add(name);
  return name;
}

/**
 * 番地に付けた名前 (`points:`) から取るネットの名前。
 *
 * **図に出る名前 (ポート・グラウンド) が無いときだけ**引く。図と
 * ネットリストを突き合わせるための出力なので、図に見えている名前を先に取る。
 * 同じネットに名前が 2 つ乗っていたら、書いた順で先のほうを使う
 * (並べると番地の綴りより長くなり、突き合わせにくい)。
 */
function pointNameOf(group: readonly Member[], points: ReadonlyMap<string, Address>): string | null {
  const cells = new Set(group.map((member) => member.cell));
  for (const [name, address] of points) {
    if (cells.has(cellOf(address))) return name;
  }
  return null;
}

/**
 * ネットの名前。グラウンドが乗っていれば GND、名前を図に出す記号
 * (端子・電源レール) が乗っていればその名前。
 *
 * **図に名前が出ている記号だけ**がネットに名前を与える。図とネットリストを
 * 突き合わせるための出力なので、図に見えない名前を持ち込まない。
 */
function nameOf(group: readonly Member[]): string | null {
  if (group.some((member) => member.part.type === 'ground')) return 'GND';

  const named = [...new Set(group
    .filter((member) => namesNet(member.part.type))
    .map((member) => member.ref))]
    .sort();
  return named.length > 0 ? named.join('/') : null;
}

import { fenceError, safeToken } from '../errors.ts';
import { lookupPartType, mainPinName, pinPlaces } from '../parts.ts';
import type { Circuit } from './circuit.ts';
import type { Net } from './nets.ts';
import { wiringOf } from './nets.ts';
import { formatAddress } from './address.ts';
import { cellOf as addressOf, nameOfEndpoint } from '../types.ts';
import type { FenceError, PartSpec } from '../types.ts';

/**
 * ERC — **図のとおりに組んでも動かない**、という指摘。読めなかったわけでも
 * 描けなかったわけでもないので、エラーではなくお知らせで返す
 * (perfboard の `erc/erc.ts` と同じ立て付け。3 つのフェンスで同じ扱いにする)。
 *
 * 見るのは 4 つ。**どれも「書いた人が気づけない」種類の間違い**で、図としては
 * 成立してしまうものを選んである:
 *
 * - どこにも届いていない足 (2 端子・1 端子)
 * - 配線が 1 本も指していない足 (多端子)
 * - 両端が同じネットに来ている部品 (配線で跨がれている)
 * - 部品の足に届いていない配線
 *
 * **うるさくしない線引きが本体。** 正しい図が毎回叱られると、帯を読まなくなる。
 */

/** 1 件に並べる足の数の上限。これを超えたら数で言う。 */
const MAX_SHOWN = 4;

/**
 * 足の並びがパッケージで決まる種類。**余った足を言わない** — `dip8` に 8 本
 * つなげとは言えないし、どのピンを使うかは型番の話で種類名からは決まらない
 * (`pico` の 40 本なら、使わない足のほうが多い)。
 */
const PACKAGED = /^(dip|sip)\d+$/;

const isPackaged = (part: PartSpec): boolean =>
  PACKAGED.test(part.type) || (lookupPartType(part.type)?.pinLabels?.length ?? 0) > 4;

/**
 * どこにも届いていない足。**自分しか乗っていないまとまり**にいて、しかも
 * **配線が 1 本も来ていない**端子は、つなぐ相手が居ない。
 *
 * 見逃すものが 3 つある。どれも「正しい図が毎回叱られる」のを避けるため:
 *
 * - **配線が来ている端**。交点まで線を引いて終える書き方は、記号の足を見せる
 *   図 (文法リファレンスの記号表) がそうしている。線が引いてあるのは
 *   「ここまでは意図した」という印で、その先が空でも書いた人は見えている
 * - **`points:` で名前を付けた節点**。名前を付けたのは「ここから信号が
 *   出入りする」という意思表示
 * - **図に名前が出る記号** (`port` / `vcc` / `vee`)。それ自体が「外から来る」印。
 *   グラウンドは入らない — 名前は出るが、つながっていないグラウンドは間違い
 */
function looseTerminals(circuit: Circuit): FenceError[] {
  const { rootOf, members } = wiringOf(circuit);
  const named = new Set([...circuit.points.values()].map((address) => rootOf(formatAddress(address))));
  const wired = new Set<string>();
  for (const wire of circuit.wires) {
    for (const endpoint of [wire.from, wire.to]) wired.add(rootOf(nameOfEndpoint(endpoint)));
  }

  const byRoot = new Map<string, typeof members>();
  for (const member of members) {
    const root = rootOf(member.cell);
    byRoot.set(root, [...(byRoot.get(root) ?? []), member]);
  }

  const found: FenceError[] = [];
  for (const [root, group] of byRoot) {
    const alone = group[0];
    if (group.length > 1 || alone === undefined || wired.has(root) || named.has(root)) continue;
    if (lookupPartType(alone.part.type)?.idLabel !== undefined) continue;
    found.push(fenceError(`${safeToken(alone.ref)} はどこにもつながっていません`, alone.part.line));
  }
  return found;
}

/**
 * 配線が 1 本も指していない多端子の足。**多端子は指されて初めてネットに乗る**
 * ので、指されていない足はネットリストに現れず、上の検査では見えない。
 */
function unusedPins(circuit: Circuit): FenceError[] {
  // **突き合わせるのはアンカー名。** 足は `B` でも `base` でも書けるが、
  // 読んだ時点で 1 つに揃っている (`resolvePins`) ので、こちらもそちらで数える
  // — 人に見せる綴りで比べると、`Q1.B` と書いた足を「指していない」と言う。
  const used = new Set<string>();
  for (const wire of circuit.wires) {
    for (const endpoint of [wire.from, wire.to]) {
      if (endpoint.kind === 'pin') used.add(`${endpoint.part}.${endpoint.pin}`);
    }
  }

  const found: FenceError[] = [];
  for (const part of circuit.parts) {
    if (part.kind !== 'multi-terminal' || isPackaged(part)) continue;
    const type = lookupPartType(part.type);
    if (type === null || type === undefined) continue;

    const loose = pinPlaces(type)
      .filter((place) => !used.has(`${part.id}.${place.anchor}`))
      .map((place) => mainPinName(type, place.anchor));
    if (loose.length === 0) continue;

    const shown = loose.length > MAX_SHOWN
      ? `${loose.slice(0, MAX_SHOWN).join('、')} ほか ${loose.length - MAX_SHOWN} 本`
      : loose.join('、');
    found.push(fenceError(
      `${safeToken(part.id)} の足 ${shown} をどの配線も指していません`,
      part.line,
    ));
  }
  return found;
}

/**
 * 両端が同じネットに来ている部品。**配線で自分を跨がれている** —
 * 抵抗を入れたつもりが線で短絡していた、という取り違えを拾う。
 */
function shorted(circuit: Circuit, netlist: readonly Net[]): FenceError[] {
  const netOf = new Map<string, number>();
  for (const [index, net] of netlist.entries()) {
    for (const ref of net.refs) netOf.set(ref, index);
  }

  return circuit.parts.flatMap((part) => {
    if (part.kind !== 'two-terminal') return [];
    const one = netOf.get(`${part.id}.1`);
    const two = netOf.get(`${part.id}.2`);
    return one === undefined || one !== two
      ? []
      : [fenceError(`${safeToken(part.id)} の両端が同じネットに来ています (配線で短絡しています)`, part.line)];
  });
}

/**
 * 部品の足に届いていない配線。**ネットリストには出てこない**
 * (`computeNets` は足の乗ったまとまりしか出さない) ので、ここで言わないと
 * 黙って消える。
 */
function looseWires(circuit: Circuit): FenceError[] {
  const { rootOf, members } = wiringOf(circuit);
  const live = new Set(members.map((member) => rootOf(member.cell)));

  return circuit.wires.flatMap((wire) => {
    const ends = [wire.from, wire.to].map((endpoint) => rootOf(nameOfEndpoint(endpoint)));
    if (ends.some((root) => live.has(root))) return [];

    const spell = (endpoint: typeof wire.from): string => {
      const cell = addressOf(endpoint);
      return cell === null ? nameOfEndpoint(endpoint) : formatAddress(cell);
    };
    return [fenceError(
      `${spell(wire.from)} ${wire.operator} ${spell(wire.to)} は部品の足を 1 つもつないでいません`,
      wire.line,
    )];
  });
}

/**
 * **配線が 1 本も無い図は回路ではない。** 記号を並べた表や、部品 1 つを見せる
 * 図がそれで、つながっていないのは当たり前 — そこで「つながっていません」と
 * 言うと、正しい図が毎回叱られて帯を読まなくなる
 * (文法リファレンスと例の図の半分がこれに当たる)。
 */
export const checkErc = (circuit: Circuit, netlist: readonly Net[]): FenceError[] =>
  (circuit.wires.length === 0
    ? []
    : [
      ...looseTerminals(circuit), ...unusedPins(circuit),
      ...shorted(circuit, netlist), ...looseWires(circuit),
    ]);

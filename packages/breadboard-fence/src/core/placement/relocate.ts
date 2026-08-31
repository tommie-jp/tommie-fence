import { notice, safeToken } from '../errors.ts';
import { formatAddress } from '../model/address.ts';
import { HOLE_ROWS } from '../types.ts';
import type { FenceError, HoleAddress, HoleRow, PlacedPart } from '../types.ts';
import { coveredHoles } from './place.ts';

/**
 * 配線の端点 1 つ。
 *
 * - `exit` はその穴から配線が縦にどちらへ走るか。`none` は縦に走らない
 *   (横へ逃げる短いホップ)、`unknown` は読み取れない (迂回ヒントの着地側など)。
 * - `away` は部品を寄せるならどちらが見た目に良いか (反対側の端点から遠ざかる側)。
 *   `exit` と違って強制ではなく、塞がっていれば逆へも寄る。
 */
export type WireEnd = {
  readonly address: HoleAddress;
  readonly exit: 'up' | 'down' | 'none' | 'unknown';
  readonly away: 'up' | 'down' | null;
};

export type RelocateResult = {
  readonly parts: readonly PlacedPart[];
  readonly errors: readonly FenceError[];
};

/** 胴が板から浮いていて、同じ列のまま行を変えても絵が成り立つ種類。 */
const SLIDABLE_KINDS: ReadonlySet<string> = new Set(['two-lead', 'three-lead']);

const BLOCK_ROWS = HOLE_ROWS.length / 2;

const rowIndex = (row: HoleRow): number => HOLE_ROWS.indexOf(row);

/** その行が入るブロック (a–e / f–j) の先頭の行位置。 */
const blockStart = (row: HoleRow): number => (rowIndex(row) < BLOCK_ROWS ? 0 : BLOCK_ROWS);

/** 同じ列のまま行だけずらした穴。ブロックを出るなら null (ストリップが変わってしまう)。 */
const shifted = (address: HoleAddress, delta: number): HoleAddress | null => {
  const index = rowIndex(address.row) + delta;
  const start = blockStart(address.row);
  if (index < start || index >= start + BLOCK_ROWS) return null;
  const row = HOLE_ROWS[index];
  return row ? { ...address, row } : null;
};

/** 行の並びは a が上。up は行位置が減る向き。 */
const DELTA = { up: -1, down: 1 } as const;

/**
 * 縦に走る配線が通り過ぎる穴。端点からブロックの端まで
 * (レーンとレールはブロックの外にあるので、走り抜ける行はここで全部)。
 */
function corridorOf(end: WireEnd): string[] {
  if (end.exit !== 'up' && end.exit !== 'down') return [];
  const holes: string[] = [];
  for (let step = 1; step < BLOCK_ROWS; step += 1) {
    const hole = shifted(end.address, DELTA[end.exit] * step);
    if (!hole) break;
    holes.push(formatAddress(hole));
  }
  return holes;
}

/**
 * 配線の端点と足が同じ穴を取り合う部品を、同じ列のまま空いている行へ寄せる。
 * 実物のボードでは同じ穴に足とジャンパは挿せないので、図もそう描かない。
 *
 * - 縦に走る配線の**通り道には寄せない** (穴は空いていても、線が足の上を通る)。
 * - 横へ逃げる配線しか無ければどちらへも寄れる。見た目に良い側 (`away`) から試す。
 * - 同じ列の中の移動なのでストリップが変わらず、**ネットリストは変わらない**。
 *   だからこの寄せはお知らせにしない (文書化された標準の描き方)。
 * - 寄せられないときは書かれたまま描き、**お知らせで実物に挿せないことだけ言う**。
 *   黙って通すと、図を写した人がその穴の前で手が止まる。
 */
export function relocateParts(parts: readonly PlacedPart[], ends: readonly WireEnd[]): RelocateResult {
  if (ends.length === 0) return { parts, errors: [] };

  // 配線が塞ぐ穴 (端点そのもの) と、縦に走って通り過ぎる穴。
  const wireHoles = new Map<string, WireEnd[]>();
  for (const wireEnd of ends) {
    const name = formatAddress(wireEnd.address);
    wireHoles.set(name, [...(wireHoles.get(name) ?? []), wireEnd]);
  }
  const corridors = new Set(ends.flatMap(corridorOf));

  // 部品が塞ぐ穴の台帳 (ピン + 本体の下)。部品が動いたら付け替える。
  const partHoles = new Set<string>();
  for (const part of parts) {
    for (const pin of part.pins) if (pin.address) partHoles.add(formatAddress(pin.address));
    for (const address of coveredHoles(part)) partHoles.add(formatAddress(address));
  }

  const errors: FenceError[] = [];
  let anyMoved = false;

  const result = parts.map((part) => {
    const sharedEnds = part.pins.flatMap((pin) =>
      pin.address?.kind === 'hole' ? wireHoles.get(formatAddress(pin.address)) ?? [] : []);
    if (sharedEnds.length === 0) return part;

    const giveUp = (): PlacedPart => {
      const holes = [...new Set(sharedEnds.map((end) => formatAddress(end.address)))];
      errors.push(notice(
        `部品 ${safeToken(part.id)}: ${holes.join(', ')} に足と配線の両方がつながっています` +
        ' (実物では同じ穴に挿せません)',
        part.line,
      ));
      return part;
    };

    if (sharedEnds.some((end) => end.exit === 'unknown')) return giveUp();
    if (!SLIDABLE_KINDS.has(part.kind)) return giveUp();
    const holes = part.pins.map((pin) => pin.address);
    if (!holes.every((address): address is HoleAddress => address?.kind === 'hole')) return giveUp();

    // 縦に走る配線の側は禁止 (寄せるとその通り道に入る)。両側が塞がれば寄せられない。
    const forbidden = new Set(sharedEnds.flatMap((end) =>
      end.exit === 'up' || end.exit === 'down' ? [DELTA[end.exit]] : []));
    if (forbidden.size === 2) return giveUp();

    // 試す向き: 禁止の反対。禁止が無ければ、見た目に良い側 (away) から両方。
    const preferred = sharedEnds.find((end) => end.away !== null)?.away ?? 'up';
    const candidates = forbidden.size === 1
      ? [-[...forbidden][0]!]
      : [DELTA[preferred], -DELTA[preferred]];

    const own = new Set(holes.map(formatAddress));
    for (const direction of candidates) {
      for (let step = 1; step < BLOCK_ROWS; step += 1) {
        const targets = holes.map((address) => shifted(address, direction * step));
        // どれかの足がブロックを出たら、それより先も出たままなのでこの向きは打ち切る。
        if (!targets.every((target): target is HoleAddress => target !== null)) break;

        const names = targets.map(formatAddress);
        const blocked = names.some((name) =>
          wireHoles.has(name) || corridors.has(name) || (partHoles.has(name) && !own.has(name)));
        if (blocked) continue;

        for (const name of own) partHoles.delete(name);
        for (const name of names) partHoles.add(name);
        anyMoved = true;
        return {
          ...part,
          pins: part.pins.map((pin, index) => ({ ...pin, address: targets[index]! })),
        };
      }
    }

    return giveUp();
  });

  return { parts: anyMoved ? result : parts, errors };
}

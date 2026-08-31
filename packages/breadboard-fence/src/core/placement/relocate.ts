import { notice, safeToken } from '../errors.ts';
import { formatAddress, isTopBlock } from '../model/address.ts';
import { HOLE_ROWS } from '../types.ts';
import type { Address, FenceError, HoleAddress, HoleRow, PlacedPart } from '../types.ts';
import { occupiedHoles } from './place.ts';

/**
 * 配線の端点 1 つ。穴でもレールでもよい (レールの穴も実物では 1 本しか挿せない)。
 *
 * - `exit` はその穴から配線が縦にどちらへ走るか。`none` は縦に走らない
 *   (横へ逃げる短いホップ)、`unknown` は読み取れない (端点の座標が決まらないなど)。
 * - `away` は部品を寄せるならどちらが見た目に良いか (反対側の端点から遠ざかる側)。
 *   `exit` と違って強制ではなく、塞がっていれば逆へも寄る。
 */
export type WireEnd = {
  readonly address: Address;
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

type Side = 'up' | 'down';

/** 行の並びは a が上。up は行位置が減る向き。 */
const DELTA: Record<Side, number> = { up: -1, down: 1 };

const rowIndex = (row: HoleRow): number => HOLE_ROWS.indexOf(row);

/** その行が入るブロック (a–e / f–j) の先頭の行位置。 */
const blockStart = (row: HoleRow): number => (isTopBlock(row) ? 0 : BLOCK_ROWS);

/** 同じ列のまま行だけずらした穴。ブロックを出るなら null (ストリップが変わってしまう)。 */
const shifted = (address: HoleAddress, delta: number): HoleAddress | null => {
  const index = rowIndex(address.row) + delta;
  const start = blockStart(address.row);
  if (index < start || index >= start + BLOCK_ROWS) return null;
  const row = HOLE_ROWS[index];
  return row ? { ...address, row } : null;
};

/** 寄せ探しが見る盤面。partHoles だけは、部品が動くたびに付け替える。 */
type Ledger = {
  readonly wireHoles: ReadonlyMap<string, readonly WireEnd[]>;
  readonly corridors: ReadonlySet<string>;
  readonly partHoles: Set<string>;
};

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
export function relocateParts(
  parts: readonly PlacedPart[],
  ends: readonly WireEnd[],
  // 配線が縦に走って通り過ぎる穴。実際に引く折れ線から呼ぶ側が数える
  // (ここで向きから推測すると、ブロックをまたぐ直行や迂回ヒントの経路とずれる)。
  corridor: readonly Address[] = [],
): RelocateResult {
  if (ends.length === 0) return { parts, errors: [] };

  // 配線が塞ぐ穴 (端点そのもの) と、縦に走って通り過ぎる穴。
  const wireHoles = new Map<string, WireEnd[]>();
  for (const wireEnd of ends) {
    const name = formatAddress(wireEnd.address);
    const bucket = wireHoles.get(name);
    if (bucket) bucket.push(wireEnd);
    else wireHoles.set(name, [wireEnd]);
  }
  const corridors = new Set(corridor.map(formatAddress));

  // 部品が塞ぐ穴の台帳 (足 + 本体の下)。
  const partHoles = new Set<string>();
  for (const part of parts) {
    for (const address of occupiedHoles(part)) partHoles.add(formatAddress(address));
  }

  const ledger: Ledger = { wireHoles, corridors, partHoles };
  const errors: FenceError[] = [];

  const result = parts.map((part) => {
    const sharedEnds = part.pins.flatMap((pin) =>
      pin.address ? wireHoles.get(formatAddress(pin.address)) ?? [] : []);
    if (sharedEnds.length === 0) return part;

    const slid = slideAside(part, sharedEnds, ledger);
    if (!slid) errors.push(unbuildable(part, sharedEnds));
    return slid ?? part;
  });

  const anyMoved = result.some((part, index) => part !== parts[index]);
  return { parts: anyMoved ? result : parts, errors };
}

/** 寄せた先の姿。寄せられなければ null (呼ぶ側がお知らせを出す)。 */
function slideAside(part: PlacedPart, sharedEnds: readonly WireEnd[], ledger: Ledger): PlacedPart | null {
  if (sharedEnds.some((end) => end.exit === 'unknown')) return null;
  if (!SLIDABLE_KINDS.has(part.kind)) return null;
  const holes = part.pins.map((pin) => pin.address);
  if (!holes.every((address): address is HoleAddress => address?.kind === 'hole')) return null;

  // 縦に走る配線の側は禁止 (寄せるとその通り道に入る)。両側が塞がれば寄せられない。
  // 禁止が無ければ、見た目に良い側 (away) から両方を試す。
  const forbidden = new Set<Side>(sharedEnds.flatMap((end) =>
    end.exit === 'up' || end.exit === 'down' ? [end.exit] : []));
  const preferred = sharedEnds.find((end) => end.away !== null)?.away ?? 'up';
  const order: readonly Side[] = preferred === 'up' ? ['up', 'down'] : ['down', 'up'];
  const candidates = order.filter((side) => !forbidden.has(side));

  const own = new Set(holes.map(formatAddress));
  for (const side of candidates) {
    for (let step = 1; step < BLOCK_ROWS; step += 1) {
      const targets = holes.map((address) => shifted(address, DELTA[side] * step));
      // どれかの足がブロックを出たら、それより先も出たままなのでこの向きは打ち切る。
      if (!targets.every((target): target is HoleAddress => target !== null)) break;

      // 足の穴に加えて、胴の下に隠れる穴 (足の間) も見る。そこに配線の点や
      // 他の足があると、胴の絵の下に埋まって何が挿さっているのか読めなくなる。
      const names = [...targets.map(formatAddress), ...betweenLeads(targets)];
      const blocked = names.some((name) =>
        ledger.wireHoles.has(name) || ledger.corridors.has(name)
        || (ledger.partHoles.has(name) && !own.has(name)));
      if (blocked) continue;

      for (const name of own) ledger.partHoles.delete(name);
      for (const name of names) ledger.partHoles.add(name);
      return {
        ...part,
        pins: part.pins.map((pin, index) => ({ ...pin, address: targets[index]! })),
      };
    }
  }

  return null;
}

/** 足が 1 行に並ぶ部品の、足と足の間の穴。胴がその上に描かれる。 */
function betweenLeads(targets: readonly HoleAddress[]): string[] {
  const rows = new Set(targets.map((target) => target.row));
  if (rows.size !== 1 || targets.length < 2) return [];

  const cols = targets.map((target) => target.col);
  const taken = new Set(cols);
  const row = targets[0]!.row;
  const holes: string[] = [];
  for (let col = Math.min(...cols) + 1; col < Math.max(...cols); col += 1) {
    if (!taken.has(col)) holes.push(formatAddress({ kind: 'hole', row, col }));
  }
  return holes;
}

const unbuildable = (part: PlacedPart, sharedEnds: readonly WireEnd[]): FenceError => {
  const holes = [...new Set(sharedEnds.map((end) => formatAddress(end.address)))];
  return notice(
    `部品 ${safeToken(part.id)}: ${holes.join(', ')} に足と配線の両方がつながっています` +
    ' (実物では同じ穴に挿せません)',
    part.line,
  );
};

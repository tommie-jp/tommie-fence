import type { BoardPart } from '../boards.ts';
import type { DiscreteRow } from '../discretes.ts';
import type { ModuleRow } from '../modules.ts';
import type { PinoutRow } from '../pinouts.ts';
import type { CardTable } from './types.ts';

/**
 * **描いている間だけ有効な表** (52 の docs/158 の 1-6)。表を引く所が 120 か所ほどあり、末端まで
 * 引数で運ぶと大改造になるので、入口 (描画の引数・殻の引数) で `withCards` に包み、
 * 中の `lookupPinout` などが同梱の表の次にここを引く。
 *
 * 描画は同期なので、包んだ間だけ有効にして必ず戻せる。**非同期の境を越えて表を引かない**こと
 * (回路図の TeX の描画は非同期だが、表を引くのは TeX を書き出すまで)。
 */

type CardIndex = {
  readonly pinouts: ReadonlyMap<string, PinoutRow>;
  readonly discretes: ReadonlyMap<string, DiscreteRow>;
  readonly modules: ReadonlyMap<string, ModuleRow>;
  readonly boards: ReadonlyMap<string, BoardPart>;
};

type Active = { readonly table: CardTable; readonly index: CardIndex; readonly used: Set<string> };

let active: Active | null = null;

/** 表ごとの索引の控え。同じ表で何度描いても索引は 1 回だけ組む。 */
const indexes = new WeakMap<CardTable, CardIndex>();

const byModel = <Row extends { readonly models: readonly string[] }>(
  rows: readonly Row[], key: (row: Row, model: string) => string,
): ReadonlyMap<string, Row> => {
  const map = new Map<string, Row>();
  // **先に書いた行が勝つ** (重なりは表を組むときに知らせてある)。
  for (const row of rows) for (const model of row.models) if (!map.has(key(row, model))) map.set(key(row, model), row);
  return map;
};

function indexOf(table: CardTable): CardIndex {
  const found = indexes.get(table);
  if (found !== undefined) return found;
  const index: CardIndex = {
    pinouts: byModel(table.pinouts, (_row, model) => model.toUpperCase()),
    discretes: byModel(table.discretes, (row, model) => `${row.type}:${model.toUpperCase()}`),
    modules: byModel(table.modules, (_row, model) => model.toUpperCase()),
    boards: new Map(table.boards.map((board) => [board.type, board.part])),
  };
  indexes.set(table, index);
  return index;
}

/**
 * `fn` を回す間だけカードの表を有効にする。**例外でも戻す**。表が無ければ (undefined・null)
 * 外の表のまま `fn` を回す (入れ子で外のカードを消さない)。
 */
export function withCards<T>(table: CardTable | null | undefined, fn: () => T): T {
  return withCardsUsed(table, fn).value;
}

/** `withCards` と同じで、**手元のカードから引いた型番** (代表の綴り) も返す。CLI の `--strict-cards` が使う。 */
export function withCardsUsed<T>(
  table: CardTable | null | undefined, fn: () => T,
): { readonly value: T; readonly used: readonly string[] } {
  if (table === null || table === undefined) return { value: fn(), used: [] };
  const before = active;
  const now: Active = { table, index: indexOf(table), used: new Set() };
  active = now;
  try {
    const value = fn();
    return { value, used: [...now.used].sort() };
  } finally {
    active = before;
    // 外にも表があれば、内で引いた型番を外にも数える。
    if (before !== null) for (const model of now.used) before.used.add(model);
  }
}

const note = <Row extends { readonly models: readonly string[] }>(row: Row | undefined): Row | undefined => {
  if (row !== undefined) active?.used.add(row.models[0] ?? '');
  return row;
};

/** カードの表からピンの名前の行を引く (同梱の表に無かったときだけ呼ぶ)。 */
export const cardPinout = (model: string): PinoutRow | undefined =>
  note(active?.index.pinouts.get(model.trim().toUpperCase()));

export const cardDiscrete = (type: string, model: string): DiscreteRow | undefined =>
  note(active?.index.discretes.get(`${type}:${model.trim().toUpperCase()}`));

export const cardModule = (model: string): ModuleRow | undefined =>
  note(active?.index.modules.get(model.trim().toUpperCase()));

export function cardBoard(type: string): BoardPart | undefined {
  const board = active?.index.boards.get(type);
  if (board !== undefined) active?.used.add(type);
  return board;
}

/** 今有効なカードの表 (無ければ null)。読み取りの控えを表ごとに分けるのに使う。 */
export const activeCardTable = (): CardTable | null => active?.table ?? null;

/** 今有効なカードのボードの種類の名前。 */
export const cardBoardNames = (): readonly string[] => (active === null ? [] : [...active.index.boards.keys()]);

import { bundledBoardNames } from '../boards.ts';
import { discreteTable } from '../discretes.ts';
import { moduleTable } from '../modules.ts';
import { pinoutTable } from '../pinouts.ts';
import { cardTableOf } from './convert.ts';
import type { CardTable, PartCard } from './types.ts';

/** どのファイルのカードか (知らせに添える)。 */
export type PlacedCard = { readonly card: PartCard; readonly file: string };

/** 表を組むときの知らせ。カードは読むが、その型番は使われない。 */
export type CardTableNotice = { readonly file: string; readonly model: string; readonly message: string };

/** 同じ表を引く種類ごとの鍵 (3 ピンは種類ごとに別の表)。 */
const keyOf = (card: PartCard, model: string): string => {
  if (card.kind === 'discrete') return `discrete:${card.type}:${model.toUpperCase()}`;
  if (card.kind === 'board') return `board:${model}`;
  // DIP・1 列とモジュールは、機器の `model:` が両方の表を引くので 1 つの鍵の空間にする。
  return `pin:${model.toUpperCase()}`;
};

const bundledKeys = (): ReadonlySet<string> => new Set([
  ...pinoutTable().flatMap((row) => row.models.map((model) => `pin:${model.toUpperCase()}`)),
  ...moduleTable().flatMap((row) => row.models.map((model) => `pin:${model.toUpperCase()}`)),
  ...discreteTable().flatMap((row) => row.models.map((model) => `discrete:${row.type}:${model.toUpperCase()}`)),
  ...bundledBoardNames().map((name) => `board:${name}`),
]);

/**
 * 手元のカードから描くときに渡す表を組む (52 の docs/158 の 1-5)。
 *
 * - **同梱の表と重なる型番は同梱が勝つ** — 黙って並びを変えない。知らせを出し、カードのその型番は使わない
 * - カードどうしで重なれば、ファイルの名前の順で先のカードが勝つ
 */
export function buildCardTable(placed: readonly PlacedCard[]): { readonly table: CardTable; readonly notices: readonly CardTableNotice[] } {
  const bundled = bundledKeys();
  const taken = new Map<string, string>();
  const notices: CardTableNotice[] = [];
  const kept: PartCard[] = [];

  for (const { card, file } of [...placed].sort((a, b) => a.file.localeCompare(b.file))) {
    const models = card.models.filter((model) => {
      const key = keyOf(card, model);
      if (bundled.has(key)) {
        notices.push({ file, model, message: `型番 ${model} は同梱の表にあります。同梱の並びで描き、このカードの ${model} は使いません (並びを変えたいなら公開側の表を直します)` });
        return false;
      }
      const owner = taken.get(key);
      if (owner !== undefined) {
        notices.push({ file, model, message: `型番 ${model} は ${owner} のカードにもあります。${owner} の並びで描きます` });
        return false;
      }
      taken.set(key, file);
      return true;
    });
    if (models.length > 0) kept.push({ ...card, models });
  }
  return { table: cardTableOf(kept), notices };
}

import type { BoardPart } from '../boards.ts';
import type { DiscreteRow } from '../discretes.ts';
import type { ModuleRow } from '../modules.ts';
import type { PinoutRow } from '../pinouts.ts';
import type { BoardCard, CardTable, ChipCard, DiscreteCard, ModuleCard, PartCard } from './types.ts';

/**
 * 部品カードを表の行に直す。**型だけを読む** (表のファイルがここを読むので、表を引くと輪になる)。
 * 省いた欄は行にも置かない — TS で書いた行と同じ形にして、試験で突き合わせられるようにする。
 */

type Origin = 'bundled' | 'local';

const optional = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

const chipRow = (card: ChipCard, origin: Origin): PinoutRow => ({
  models: card.models, names: card.pins, role: card.role,
  ...optional('note', card.note),
  ...optional('look', card.look),
  ...optional('chip', card.smd),
  ...optional('module', card.outline),
  ...optional('roleEn', card.roleEn),
  ...optional('ic', card.ic),
  card: origin,
});

const discreteRow = (card: DiscreteCard, origin: Origin): DiscreteRow => ({
  models: card.models, type: card.type, kind: card.discreteKind, names: card.pins,
  pkg: card.case, role: card.role,
  ...optional('note', card.note),
  source: card.source,
  card: origin,
});

const moduleRow = (card: ModuleCard, origin: Origin): ModuleRow => ({
  models: card.models, names: card.pins, role: card.role, roleEn: card.roleEn ?? card.role,
  product: card.product, view: card.view,
  ...optional('note', card.note),
  source: card.source,
  card: origin,
});

const boardPart = (card: BoardCard): BoardPart => ({
  name: card.name, chip: card.chip, wireless: card.wireless, hdmi: card.hdmi,
  rowSpan: card.rowSpan, reach: card.reach, usb: card.usb,
  ...optional('mark', card.mark),
  pins: card.pins,
});

const ofKind = <K extends PartCard['kind']>(cards: readonly PartCard[], kind: K) =>
  cards.filter((card): card is Extract<PartCard, { kind: K }> => card.kind === kind);

export const chipRows = (cards: readonly PartCard[], origin: Origin): readonly PinoutRow[] =>
  ofKind(cards, 'chip').map((card) => chipRow(card, origin));

export const discreteRows = (cards: readonly PartCard[], origin: Origin): readonly DiscreteRow[] =>
  ofKind(cards, 'discrete').map((card) => discreteRow(card, origin));

export const moduleRows = (cards: readonly PartCard[], origin: Origin): readonly ModuleRow[] =>
  ofKind(cards, 'module').map((card) => moduleRow(card, origin));

/** ボードは**型番がそのまま種類の名前** (`pico2` と同じ書き方)。型番ごとに 1 つ。 */
export const boardRows = (cards: readonly PartCard[]): readonly { readonly type: string; readonly part: BoardPart }[] =>
  ofKind(cards, 'board').flatMap((card) => card.models.map((type) => ({ type, part: boardPart(card) })));

/** 手元のカードから、描くときに渡す表を組む (重なりの検査は `buildCardTable`)。 */
export const cardTableOf = (cards: readonly PartCard[]): CardTable => ({
  pinouts: chipRows(cards, 'local'),
  discretes: discreteRows(cards, 'local'),
  modules: moduleRows(cards, 'local'),
  boards: boardRows(cards),
});

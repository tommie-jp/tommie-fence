import type { PartCard } from 'fence-kit';

/**
 * 同梱の部品カードの型番を、文書の表にする (52 の docs/158 の 4-3)。3 つのフェンスの文書
 * (bread と circuit の早見表、perf の文法の手引き) の印の間を、この字で書き換える (`npm run rows`)。
 * **手で写さない** — 写すと、カードを足したときに載せ漏れる (文書の試験が落ちる)。
 */
export const CARD_ROWS_BEGIN = '<!-- part-cards:begin `npm run rows` が書き出す。手で直さない (52 の docs/158) -->';
export const CARD_ROWS_END = '<!-- part-cards:end -->';

/** 別名は 3 つまで (早見表のほかの行と同じ)。 */
const MAX_ALIASES = 3;

const code = (text: string): string => `\`${text}\``;

function row(card: PartCard): string {
  const [head = '', ...rest] = card.models;
  const aliases = rest.length === 0 ? '' : ` (${rest.slice(0, MAX_ALIASES).map(code).join(' ')}${rest.length > MAX_ALIASES ? ' …' : ''})`;
  const note = card.note === undefined ? '' : ` (${card.note})`;
  return `| ${code(head)}${aliases} | ${code(card.package)} | ${card.pins.map(code).join(' ')}${note} |`;
}

/** 印を含めた区切りの全部。 */
export function cardRowsBlock(cards: readonly PartCard[]): string {
  const body = cards.length === 0
    ? ['同梱の部品カードはまだありません。']
    : [
      '同梱の部品カード (`packages/fence-kit/parts/*.part.yaml`) の型番。書き方は上の表と同じ (`model:` や穴の後ろに型番を書く)。',
      '',
      '| 型番 | 置き方 | ピンの名前 |',
      '| --- | --- | --- |',
      ...cards.map(row),
    ];
  return [CARD_ROWS_BEGIN, '', ...body, '', CARD_ROWS_END].join('\n');
}

/** 文書の印の間を書き換える。印が無ければ null。 */
export function replaceCardRows(markdown: string, cards: readonly PartCard[]): string | null {
  const begin = markdown.indexOf(CARD_ROWS_BEGIN);
  const end = markdown.indexOf(CARD_ROWS_END);
  if (begin < 0 || end < begin) return null;
  return `${markdown.slice(0, begin)}${cardRowsBlock(cards)}${markdown.slice(end + CARD_ROWS_END.length)}`;
}

/** 書き換える文書 (リポジトリの根から)。 */
export const CARD_ROW_DOCS: readonly string[] = [
  'packages/breadboard-fence/docs/02-cheatsheet.md',
  'packages/circuit-fence/docs/02-cheatsheet.md',
  'packages/perfboard-fence/docs/01-syntax.md',
];

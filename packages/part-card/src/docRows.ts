import { discreteDocTable, moduleDocTable, pinoutDocTable } from 'fence-kit';
import type { DiscreteRow, ModuleRow, PinoutRow } from 'fence-kit';

/**
 * 部品の表を、文書の表にする (52 の docs/158 の 4-3、docs/160 の 1-3)。
 * 3 つのフェンスの文書の印の間を、この字で書き換える (`npm run rows`)。
 * **手で写さない** — 写すと、部品を足したときに載せ漏れ、文書ごとに字が食い違う。
 */

/** 別名は 3 つまで (早見表のほかの行と同じ)。 */
const MAX_ALIASES = 3;

const code = (text: string): string => `\`${text}\``;

const head = (models: readonly string[]): string => {
  const [first = '', ...rest] = models;
  const aliases = rest.length === 0 ? '' : ` (${rest.slice(0, MAX_ALIASES).map(code).join(' ')}${rest.length > MAX_ALIASES ? ' …' : ''})`;
  return `${code(first)}${aliases}`;
};

const pinList = (names: readonly string[]): string => names.map(code).join(' ');

/** 1 つの表の書き出し。`name` は印の名前 (`<!-- part-rows:name begin … -->`)。 */
export type RowBlock = {
  readonly name: string;
  /** 書き換える文書 (リポジトリの根から)。 */
  readonly docs: readonly string[];
  /** 印の間に入れる字 (表の見出しから最後の行まで)。 */
  readonly render: () => string;
};

const CHEATSHEETS = [
  'packages/breadboard-fence/docs/02-cheatsheet.md',
  'packages/circuit-fence/docs/02-cheatsheet.md',
  'packages/perfboard-fence/docs/01-syntax.md',
] as const;

const SYNTAX_DOCS = [
  'packages/breadboard-fence/docs/01-syntax.md',
  'packages/circuit-fence/docs/01-syntax.md',
  'packages/perfboard-fence/docs/01-syntax.md',
] as const;

const discreteRow = (row: DiscreteRow): string =>
  `| ${head(row.models)} | ${code(row.type)} | ${pinList(row.names)} | ${row.pkg}。${row.role}${row.note === undefined ? '' : `。${row.note}`} |`;

const moduleRow = (row: ModuleRow): string =>
  `| ${head(row.models)} | ${pinList(row.names)} | ${row.role}。${row.product ?? ''}。並びは${row.view ?? ''}${row.note === undefined ? '' : `。${row.note}`} |`;

const chipRow = (row: PinoutRow): string =>
  `| ${head(row.models)} | ${code(row.package ?? `dip${row.names.length}`)} | ${pinList(row.names)}${row.note === undefined ? '' : ` (${row.note})`} |`;

export const ROW_BLOCKS: readonly RowBlock[] = [
  {
    name: 'chips',
    docs: CHEATSHEETS,
    render: () => [
      '| 型番 (別名) | 種類 | ピンの名前 (1 番から) |',
      '| --- | --- | --- |',
      ...pinoutDocTable().map(chipRow),
    ].join('\n'),
  },
  {
    name: 'discretes',
    docs: CHEATSHEETS,
    render: () => [
      '| 型番 | 種類 | 穴の順 (印字面を手前、ピンを下にして左から) | パッケージ |',
      '| --- | --- | --- | --- |',
      ...discreteDocTable().map(discreteRow),
    ].join('\n'),
  },
  {
    name: 'modules',
    docs: SYNTAX_DOCS,
    render: () => [
      '| 型番 (別名) | ピン (並び) | 働き・標準の品・注 |',
      '| --- | --- | --- |',
      ...moduleDocTable().map(moduleRow),
    ].join('\n'),
  },
];

const beginOf = (name: string): string => `<!-- part-rows:${name} begin \`npm run rows\` が書き出す。手で直さない (52 の docs/160) -->`;
const endOf = (name: string): string => `<!-- part-rows:${name} end -->`;

/** 印を含めた区切りの全部。 */
export const rowBlockText = (block: RowBlock): string => [beginOf(block.name), '', block.render(), '', endOf(block.name)].join('\n');

/** 文書の印の間を書き換える。印が無ければ null。 */
export function replaceRowBlock(markdown: string, block: RowBlock): string | null {
  const begin = markdown.indexOf(beginOf(block.name));
  const end = markdown.indexOf(endOf(block.name));
  if (begin < 0 || end < begin) return null;
  return `${markdown.slice(0, begin)}${rowBlockText(block)}${markdown.slice(end + endOf(block.name).length)}`;
}

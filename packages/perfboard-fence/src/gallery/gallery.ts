import { TRIMMER_CAP_HOLES, boardPartNames, discreteTable, moduleTable, namedChipTypes, pinoutTable } from 'fence-kit';
import type { PinoutRow } from 'fence-kit';
import { rowLabel } from '../core/model/address.ts';
import { partPrefix } from '../core/parts/catalog.ts';
import { footprintOf } from '../core/parts/footprint.ts';
import { packageNames, placeableNames, variantTable } from '../core/parts/types.ts';

/**
 * **部品ギャラリー** — 描ける部品を全部、ユニバーサル基板に置いて見せる例 (examples/13〜16)。
 *
 * 部品の種類・姿・型番の表から書き出すので、**表に部品を足したら `npm run gallery` で
 * 書き出し直す**。書き出し直さないと gallery.test.ts が落ちる (載せ漏れを残さない)。
 * 図は部品を見せるためだけの物で、配線はしない (`style: check: off`)。
 * 形は breadboard-fence の `src/gallery/gallery.ts` に揃えてある。
 */

/** 基板の列の数。いちばん長い `sip40` が 1 段に収まる幅。 */
const COLUMNS = 46;

/**
 * 1 つの部品を置く口。`col` は胴の左端の列、`row` は段の行 (1 始まり)。返すのは parts: の下の行。
 */
type Item = {
  readonly prefix: string;
  /** 列の幅 (隣との間と名札の分を含む)。 */
  readonly width: number;
  readonly place: (id: string, col: number, row: number) => readonly string[];
};

type Section = {
  readonly heading: string;
  readonly text: string;
  readonly title: string;
  /** 基板の行の数。 */
  readonly rows: number;
  /** 部品を並べる段の行 (1 始まり、上から順に)。 */
  readonly lanes: readonly number[];
  readonly items: readonly Item[];
};

export type GalleryFile = { readonly name: string; readonly markdown: string };

// ---- 置き方 ----------------------------------------------------------------

const hole = (row: number, col: number): string => `${rowLabel(row)}${col}`;

const holes = (row: number, col: number, count: number, step = 1): string =>
  Array.from({ length: count }, (_, index) => hole(row, col + index * step)).join(' ');

const tail = (...words: readonly (string | undefined)[]): string =>
  words.filter((word) => word !== undefined && word !== '').map((word) => ` ${word}`).join('');

const prefixOf = (type: string): string => partPrefix(type) ?? 'U';

/** 穴を並べて書く部品 (2 ピン・3 ピン・巻き物・USB・端子台)。 */
const leaded = (prefix: string, token: string, count: number, width: number, value?: string, step = 1): Item => ({
  prefix,
  width,
  place: (id, col, row) => [`${id}: ${token} ${holes(row, col, count, step)}${tail(value)}`],
});

/** アンカー 1 つで置く部品 (DIP・SIP・ボード・名前つきの DIP 型・タクトスイッチ)。 */
const anchored = (prefix: string, token: string, width: number, model?: string, shift = 0): Item => ({
  prefix,
  width,
  place: (id, col, row) => [`${id}: ${token} ${hole(row, col + shift)}${tail(model)}`],
});

/** 基板の外の機器 (マップ形式)。段の 1 は基板の上の帯、2 は下の帯。幅はピンの数で見積もる。 */
const device = (model: string, pins: number): Item => ({
  prefix: 'M',
  width: pins + 3,
  place: (id, _col, row) => [`${id}:`, '    type: device', `    at: ${row === 1 ? 'top' : 'bottom'}`, `    model: ${model}`],
});

// ---- 種類ごとの決まり -------------------------------------------------------

/** 胴の大きい姿。小さい部品の段に混ぜると隣に重なるので、別の段に置く。 */
const BIG_LOOKS: ReadonlySet<string> = new Set(['toroid', 'to220', 'knob', 'sot23-dip', 'sot346-dip', 'sot89-dip']);

/** この基板に直付けする面実装の姿 (ブレッドボードには無い)。 */
const CHIP_LOOKS: ReadonlySet<string> = new Set(['1608', '2012', '3216', 'sod123', 'sod323']);
const SOT_LOOKS: ReadonlySet<string> = new Set(['sot23', 'sot346']);
const isDirectSmd = (variant: string | null): boolean =>
  variant !== null && (CHIP_LOOKS.has(variant) || SOT_LOOKS.has(variant) || variant === 'do214ac');

const SMALL_TWO = 6;
const SMALL_THREE = 4;
const BIG = 6;

/** 直付けの面実装。チップと SOD は隣の穴、`do214ac` は 2 穴離し、SOT は三角 (3 番は 1 行上)。 */
function smdItem(prefix: string, token: string, variant: string): Item {
  if (SOT_LOOKS.has(variant)) {
    return { prefix, width: 3, place: (id, col, row) => [`${id}: ${token} ${hole(row, col)} ${hole(row, col + 1)} ${hole(row - 1, col + 1)}`] };
  }
  return variant === 'do214ac' ? leaded(prefix, token, 2, 4, undefined, 2) : leaded(prefix, token, 2, 3);
}

/** 1 つの種類と姿を置く口。`variant` が null なら既定の姿。 */
function kindItem(type: string, variant: string | null): Item | null {
  const token = variant === null ? type : `${type}/${variant}`;
  const kind = footprintOf(type, variant)?.kind;
  const big = variant !== null && BIG_LOOKS.has(variant);
  const prefix = prefixOf(type);
  if (isDirectSmd(variant) && variant !== null) return smdItem(prefix, token, variant);
  switch (kind) {
    case 'two-lead':
      // トリマコンデンサはピンの間隔が決まっている (2 穴)。ほかは 4 穴離して胴を見せる。
      return leaded(prefix, token, 2, type === 'sma' ? 7 : SMALL_TWO, undefined, variant === 'trimmer' ? TRIMMER_CAP_HOLES : 4);
    case 'three-lead':
      return leaded(prefix, token, 3, big ? BIG : SMALL_THREE);
    case 'wound': {
      const pins = footprintOf(type)?.pins ?? 4;
      return leaded(prefix, token, pins, variant === 'toroid' ? Math.max(pins, 4) + 4 : pins + 2);
    }
    case 'switch':
      return anchored(prefix, token, 5);
    case 'connector':
      return type.startsWith('terminal')
        ? leaded(prefix, token, Number(type.slice('terminal'.length)), Number(type.slice('terminal'.length)) * 2 + 2, undefined, 2)
        : leaded(prefix, token, 4, 7);
    default:
      return null;
  }
}

/** 段に並べる種類 (DIP・SIP・ボード・名前つき・機器は別のファイル)。 */
const leadedKinds = (): readonly string[] =>
  placeableNames().filter((type) => ['two-lead', 'three-lead', 'wound', 'switch', 'connector'].includes(footprintOf(type)?.kind ?? ''));

const LOOKS: ReadonlyMap<string, readonly string[]> = new Map(variantTable());
const looksOf = (type: string): readonly string[] => LOOKS.get(type) ?? [];

// ---- 型番 (ピンの名前の表) --------------------------------------------------

/** 1 列で描く行。奇数ピン、樹脂の色や胴の字を持つ物、モジュールの外形を持つ物。 */
const isSip = (row: PinoutRow): boolean => row.names.length % 2 === 1 || row.look !== undefined || row.module !== undefined;

/** 名札 (`U1 型番`) の幅を列で見積もる。1 列に字が 3 つほど。 */
const labelColumns = (model: string): number => Math.ceil((model.length + 3) / 3);

const dipItem = (row: PinoutRow): Item => {
  const model = row.models[0] ?? '';
  const pins = row.names.length;
  return anchored('U', `dip${pins}`, pins / 2 + 2, model);
};

const sipItem = (row: PinoutRow): Item => {
  const model = row.models[0] ?? '';
  const pins = row.names.length;
  // キットの外形はヘッダの両脇へ 1〜2 列はみ出す。
  const margin = row.module === undefined ? 2 : 3;
  return anchored('U', `sip${pins}`, Math.max(pins, labelColumns(model)) + margin, model);
};

// ---- 段に詰める -------------------------------------------------------------

/** 1 枚の図に詰めた部品。`lanes` は使った段の数。 */
type Packed = { readonly parts: readonly string[]; readonly lanes: number };

/** 段に左から詰め、溢れたら次の段、段が尽きたら次の図へ。 */
function pack(items: readonly Item[], lanes: readonly number[]): readonly Packed[] {
  const figures: Packed[] = [];
  let lines: string[] = [];
  let lane = 0;
  let col = 1;
  const counts = new Map<string, number>();
  const flush = (): void => {
    if (lines.length > 0) figures.push({ parts: lines, lanes: Math.min(lane + 1, lanes.length) });
    lines = [];
    counts.clear();
    lane = 0;
    col = 1;
  };
  for (const item of items) {
    if (col + item.width - 1 > COLUMNS) {
      lane += 1;
      col = 1;
    }
    if (lane >= lanes.length) flush();
    const count = (counts.get(item.prefix) ?? 0) + 1;
    counts.set(item.prefix, count);
    lines.push(...item.place(`${item.prefix}${count}`, col + 1, lanes[lane] ?? 1));
    col += item.width;
  }
  flush();
  return figures;
}

// ---- Markdown ---------------------------------------------------------------

const HEADER = '# ユニバーサル基板の実体配線図 (tommie-fence の perf フェンス)';

const fence = (title: string, rows: number, parts: readonly string[]): readonly string[] => [
  '```perf', HEADER, `title: ${title}`,
  'board:', `  size: ${COLUMNS}x${rows}`, '  h: 1.6mm', '  material: FR-4', '  slots: on',
  'style:', '  check: off',
  'parts:', ...parts.map((line) => `  ${line}`), '```',
];

/** 使った段の分だけの行。最後の段の下は、段を全部使ったときと同じだけ空ける。 */
const rowsFor = (section: Section, used: number): number =>
  (section.lanes[used - 1] ?? 1) + section.rows - (section.lanes[section.lanes.length - 1] ?? 1);

function renderFile(stem: string, heading: string, lead: string, sections: readonly Section[]): GalleryFile {
  const blocks = sections.flatMap((section) => pack(section.items, section.lanes).map((packed) => ({ section, ...packed })));
  const total = blocks.length;
  const out: string[] = [`# ${heading}`, '', lead, ''];
  let previous: Section | null = null;
  let within = 0;
  blocks.forEach(({ section, parts, lanes }, index) => {
    if (section !== previous) {
      out.push(`## ${section.heading}`, '', section.text, '');
      previous = section;
      within = 0;
    }
    within += 1;
    const count = blocks.filter((block) => block.section === section).length;
    const number = String(index + 1).padStart(2, '0');
    const title = `図${number} ${section.title}${count > 1 ? ` (${within}/${count})` : ''}`;
    const image = total === 1 ? `${stem}.svg` : `${stem}-${index + 1}.svg`;
    out.push(...fence(title, rowsFor(section, lanes), parts), '', `![${title}](out/${image})`, '');
  });
  return { name: `${stem}.md`, markdown: `${out.join('\n').trimEnd()}\n` };
}

const GENERATED = '**このファイルは書き出した物** — 直すときは `src/gallery/gallery.ts` を直して `npm run gallery`。';
const BOARD_NOTE = `基板は ${COLUMNS} 列の穴数で書いた、縁にパッドのある標準 (\`slots: on\`、1.6 mm の FR-4)。配線はしていないので \`style: check: off\` で検査を外した。`;

// ---- 4 つのファイル ---------------------------------------------------------

type Pick = { readonly type: string; readonly variant: string | null };

/** 基板の縁に載せる部品 (端面実装の SMA)。中心導体を縁の列に、凹の先端を縁の銅箔に書く。 */
const edgeItem = (type: string, variant: string): Item => ({
  prefix: prefixOf(type),
  width: COLUMNS,
  place: (id, _col, row) => [
    `${id}: ${type}/${variant} ${hole(row, COLUMNS)} ${hole(row + 1, COLUMNS + 1)}`,
  ],
});

function leadsFile(): GalleryFile {
  const kindOf = (type: string): string => footprintOf(type)?.kind ?? '';
  const kinds = leadedKinds();
  const picks: Pick[] = [
    ...kinds.map((type) => ({ type, variant: null })),
    ...kinds.flatMap((type) => looksOf(type).map((variant) => ({ type, variant }))),
  ];
  const isEdge = ({ variant }: Pick): boolean => variant !== null && variant.endsWith('-edge');
  const isConnector = ({ type }: Pick): boolean => kindOf(type) === 'connector';
  const isBig = (pick: Pick): boolean =>
    pick.type === 'sma' || !['two-lead', 'three-lead'].includes(kindOf(pick.type)) || (pick.variant !== null && BIG_LOOKS.has(pick.variant));
  const select = (test: (pick: Pick) => boolean): Item[] =>
    picks.filter((pick) => !isEdge(pick) && test(pick)).map(({ type, variant }) => kindItem(type, variant)).filter((item): item is Item => item !== null);
  const small = (kind: string, looked: boolean) => (pick: Pick): boolean =>
    !isBig(pick) && !isDirectSmd(pick.variant) && kindOf(pick.type) === kind && (pick.variant !== null) === looked;
  const edges = picks.filter(isEdge).map(({ type, variant }) => edgeItem(type, variant ?? ''));
  return renderFile('13-gallery-leads', '部品ギャラリー: 穴を並べて置く部品', [
    'ユニバーサル基板に**穴を並べて書く部品** (2 ピン・3 ピン・巻き物・スイッチ・USB・端子台・SMA) を、',
    '種類ごとに 1 つずつ、姿 (`種類/姿`) ごとに 1 つずつ置いた。この基板に直付けする面実装の姿と、',
    '基板の縁に載せる端面実装の SMA も置いた。',
    BOARD_NOTE,
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '2 ピンの部品', text: '姿を書かないときの姿。4 穴の間に置いた。', title: '2 ピンの部品', rows: 12, lanes: [2, 5, 8, 11], items: select(small('two-lead', false)) },
    { heading: '2 ピンの部品の姿', text: '`種類/姿` で選べる差し込みの姿。', title: '2 ピンの部品の姿', rows: 12, lanes: [2, 5, 8, 11], items: select(small('two-lead', true)) },
    { heading: '直付けの面実装', text: 'この基板に直付けする姿 (ブレッドボードには挿せない)。チップと SOD は隣の穴、`do214ac` は 2 穴離し、SOT は三角に置いた。', title: '直付けの面実装', rows: 9, lanes: [3, 7], items: select((pick) => isDirectSmd(pick.variant)) },
    { heading: '3 ピンの部品', text: '姿を書かないときの姿と、`種類/姿` で選べる小さい姿。隣どうしの 3 穴に置いた。', title: '3 ピンの部品', rows: 9, lanes: [3, 7], items: [...select(small('three-lead', false)), ...select(small('three-lead', true))] },
    { heading: 'タクトスイッチ', text: 'アンカー 1 つ (左上のピン) で置く (a 接点の `button` と b 接点の `button-nc` は同じ形)。', title: 'タクトスイッチ', rows: 5, lanes: [2], items: select((pick) => kindOf(pick.type) === 'switch') },
    { heading: '大きい部品', text: '巻き物・SMA と、胴の大きい姿 (TO-220・トロイダル・ボリューム・面実装の変換基板など)。', title: '大きい部品', rows: 16, lanes: [5, 12], items: select((pick) => isBig(pick) && !isConnector(pick) && kindOf(pick.type) !== 'switch') },
    { heading: 'コネクタ', text: 'USB と端子台。差し込み口は基板の中心から遠い側を向くので、下の縁に置いた。', title: 'コネクタ', rows: 5, lanes: [5], items: select(isConnector) },
    { heading: '縁に載せる部品', text: '端面実装の SMA (`sma/male-edge` `sma/female-edge`)。中心導体を右端の列に、凹の先端をその外の縁の銅箔に書いた。', title: '縁に載せる部品', rows: 8, lanes: [2, 6], items: edges },
  ]);
}

function chipsFile(): GalleryFile {
  const rows = pinoutTable();
  const dips = rows.filter((row) => !isSip(row));
  const bySize = [...new Set(dips.map((row) => row.names.length))].sort((a, b) => a - b);
  const sections: Section[] = bySize.map((pins) => ({
    heading: `DIP${pins}`,
    text: `型番の表にある ${pins} ピンの型番。胴の縁にピンの番号、その内側にピンの名前が出る。`,
    title: `DIP${pins} の型番`,
    rows: 20,
    lanes: [2, 7, 12, 17],
    items: dips.filter((row) => row.names.length === pins).map(dipItem),
  }));
  const sips = rows.filter((row) => isSip(row) && row.module === undefined);
  const modules = rows.filter((row) => row.module !== undefined);
  const dipLooks = looksOf('dip8').map((variant) => anchored('U', `dip8/${variant}`, 7));
  const bare = packageNames().filter((type) => /^(dip|sip)\d+$/.test(type)).map((type) => {
    const pins = footprintOf(type)?.pins ?? 0;
    return type.startsWith('dip') ? anchored('U', type, pins / 2 + 2) : anchored('J', type, pins + 2);
  });
  sections.push(
    { heading: '1 列の型番', text: '1 列 (`sipN`) で描く型番 (センサ・フィルタ・モジュールのヘッダ・フルカラー LED など)。', title: '1 列の型番', rows: 15, lanes: [3, 7, 11, 15], items: sips.map(sipItem) },
    { heading: 'DIP 化キット', text: '基板とジャックの外形を帯の脇 (基板の縁に近い側) に描く型番。下の縁に置いた。', title: 'DIP 化キット', rows: 6, lanes: [6], items: modules.map(sipItem) },
    { heading: 'DIP の姿', text: '`dipN/sop` `dipN/tssop` (面実装の IC を DIP 化した変換基板に載せた姿) と `dipN/socket` (IC ソケットに挿した姿。この基板だけ)。', title: 'DIP の姿', rows: 5, lanes: [2], items: dipLooks },
    { heading: '型番を書かない DIP と 1 列', text: 'パレットに並ぶピンの数の `dipN` と `sipN`。型番を書かなければ胴にピンの番号だけが出る。', title: '型番を書かない DIP と 1 列', rows: 20, lanes: [2, 7, 12, 17], items: bare },
  );
  return renderFile('14-gallery-chips', '部品ギャラリー: 型番のある IC とモジュール', [
    '[書き方](../docs/01-syntax.md#dip-のピンの名前) の「DIP のピンの名前」の表にある**型番を全部**置いた。',
    '型番を書くと、胴にピンの番号と名前が出る。',
    BOARD_NOTE,
    '',
    GENERATED,
  ].join('\n'), sections);
}

function discretesFile(): GalleryFile {
  const items = discreteTable().map((row) =>
    leaded(prefixOf(row.type), row.pkg === 'TO-220' ? `${row.type}/to220` : row.type, 3, (row.pkg === 'TO-220' ? 5 : 3) + labelColumns(row.models[0] ?? ''), row.models[0]));
  return renderFile('15-gallery-discretes', '部品ギャラリー: 型番のあるトランジスタ・FET・レギュレータ', [
    '[書き方](../docs/01-syntax.md#3-ピンのトランジスタfetレギュレータの穴の順) の「3 ピンのトランジスタ・FET・レギュレータの穴の順」の表にある**型番を全部**置いた。',
    '型番を書くと、穴の順に表のピンの名前が付く。TO-220 の型番は `/to220` の姿で、ほかは TO-92 の姿で置いた。',
    BOARD_NOTE,
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '型番', text: '印字面を手前、ピンを下にして左から右の並び。', title: 'トランジスタ・FET・レギュレータの型番', rows: 16, lanes: [4, 9, 14], items },
  ]);
}

/** 4 桁の 7 セグは胴がピンの左右へ 7 列ずつはみ出すので、アンカーをずらして置く。 */
const SEG7X4_OVERHANG = 7;
const segmentItem = (type: string, look: string): Item =>
  type === 'seg7x4'
    ? anchored('DS', `${type}/${look}`, 6 + SEG7X4_OVERHANG * 2 + 2, undefined, SEG7X4_OVERHANG)
    : anchored('DS', `${type}/${look}`, 8);

function boardsFile(): GalleryFile {
  const boards = boardPartNames().map((name) => anchored('U', name, (footprintOf(name)?.pins ?? 40) / 2 + 3));
  const NAMED_WIDTH: Readonly<Record<string, number>> = { relay: 10, photocoupler: 4, photocoupler6: 5, 'dip-switch4': 6, 'dip-switch8': 10 };
  const named = namedChipTypes();
  const segments = named.filter((type) => type.startsWith('seg7'));
  const chips = named.filter((type) => !segments.includes(type));
  const modules = moduleTable().map((row) => device(row.models[0] ?? '', row.names.length));
  return renderFile('16-gallery-boards', '部品ギャラリー: マイコンボード・名前つきの部品・基板の外の機器', [
    'マイコンボード、ピンに名前のある DIP 型 (リレー・フォトカプラ・7 セグ・DIP スイッチ)、',
    '型番で書く基板の外の機器 (`type: device` の `model:`) を全部置いた。',
    BOARD_NOTE,
    '',
    GENERATED,
  ].join('\n'), [
    { heading: 'マイコンボード', text: 'アンカー 1 つ (胴の左上) で置くボード。', title: 'マイコンボード', rows: 24, lanes: [2, 15], items: boards },
    { heading: 'ピンに名前のある DIP 型', text: 'ピンは名前でも番号でも呼べる。', title: 'ピンに名前のある DIP 型', rows: 6, lanes: [2], items: chips.flatMap((type) => looksOf(type).map((look) => anchored(prefixOf(type), `${type}/${look}`, NAMED_WIDTH[type] ?? 8))) },
    { heading: '7 セグ', text: '列の間が 6 穴。4 桁の胴は外形どおり横長。', title: '7 セグ', rows: 10, lanes: [2], items: segments.flatMap((type) => looksOf(type).map((look) => segmentItem(type, look))) },
    { heading: '基板の外の機器', text: '`model:` に型番を書くと、ピンの名前が表から出る。基板の上と下の帯に並べた。', title: '基板の外の機器', rows: 4, lanes: [1, 2], items: modules },
  ]);
}

/** ギャラリーの全ファイル。 */
export const galleryFiles = (): readonly GalleryFile[] => [leadsFile(), chipsFile(), discretesFile(), boardsFile()];

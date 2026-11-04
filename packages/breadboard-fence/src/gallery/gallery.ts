import { boardPartNames, discreteTable, moduleTable, pinoutTable } from 'fence-kit';
import type { PinoutRow } from 'fence-kit';
import { typesWithVariants, variantsOf } from '../core/parts/variants.ts';
import { knownPartTypes, lookupFootprint } from '../core/placement/footprints.ts';

/**
 * **部品ギャラリー** — 描ける部品を全部、ブレッドボードに置いて見せる例 (examples/18〜21)。
 *
 * 部品の種類・姿・型番の表から書き出すので、**表に部品を足したら `npm run gallery` で
 * 書き出し直す**。書き出し直さないと gallery.test.ts が落ちる (載せ漏れを残さない)。
 * 図は部品を見せるためだけの物で、配線はしない。
 */

/** フルサイズのブレッドボードの列の数。 */
const COLUMNS = 63;

/** 1 つの部品を置く口。`col` は胴の左端の列、`row` は段の行。返すのは parts: の下の行。 */
type Item = {
  readonly prefix: string;
  /** 列の幅 (隣との間と名札の分を含む)。 */
  readonly width: number;
  readonly place: (id: string, col: number, row: string) => readonly string[];
  /** 段の行の代わりに置く行 (列の間の決まった部品)。 */
  readonly row?: string;
};

/** 部品を並べる段。行の名前を上から順に。 */
type Lanes = readonly string[];

type Section = {
  readonly heading: string;
  readonly text: string;
  readonly title: string;
  readonly lanes: Lanes;
  readonly items: readonly Item[];
};

export type GalleryFile = { readonly name: string; readonly markdown: string };

// ---- 置き方 ----------------------------------------------------------------

const holes = (row: string, col: number, count: number, step = 1): string =>
  Array.from({ length: count }, (_, index) => `${row}${col + index * step}`).join(' ');

const tail = (...words: readonly (string | undefined)[]): string =>
  words.filter((word) => word !== undefined && word !== '').map((word) => ` ${word}`).join('');

/** 穴を並べて書く部品 (2 ピン・3 ピン・巻き物・USB・端子台)。 */
const leaded = (prefix: string, token: string, count: number, width: number, value?: string, step = 1): Item => ({
  prefix,
  width,
  place: (id, col, row) => [`${id}: ${token} ${holes(row, col, count, step)}${tail(value)}`],
});

/** アンカー 1 つで置く部品 (DIP・SIP・ボード・名前つきの DIP 型・タクトスイッチ)。 */
const anchored = (prefix: string, token: string, width: number, model?: string): Item => ({
  prefix,
  width,
  place: (id, col, row) => [`${id}: ${token} @ ${row}${col}${tail(model)}`],
});

/** ボードの外の機器 (マップ形式)。段の行は使わない。 */
const device = (model: string, width: number): Item => ({
  prefix: 'M',
  width,
  place: (id) => [`${id}:`, '    type: device', `    model: ${model}`],
});

// ---- 種類ごとの決まり -------------------------------------------------------

/** 種類の頭文字 (部品番号)。 */
const PREFIX: Readonly<Record<string, string>> = {
  resistor: 'R', capacitor: 'C', led: 'D', diode: 'D', zener: 'D', schottky: 'D', photodiode: 'D', varicap: 'D',
  diac: 'D', phototransistor: 'Q', transistor: 'Q', thyristor: 'Q', triac: 'Q', inductor: 'L', 'ferrite-bead': 'L',
  crystal: 'X', battery: 'BT', solar: 'BT', speaker: 'SP', mic: 'MK', buzzer: 'BZ', switch: 'SW', 'switch-nc': 'SW',
  reed: 'SW', button: 'SW', 'button-nc': 'SW', 'slide-switch': 'SW', potentiometer: 'VR', fuse: 'F', lamp: 'LP',
  transformer: 'T', 'transformer-ct': 'T', 'transformer-ct2': 'T', regulator: 'U', ic3: 'U', sma: 'J',
};
const prefixOf = (type: string): string => PREFIX[type] ?? (type.startsWith('photoresistor') || type.startsWith('thermistor') || type === 'varistor' ? 'R' : 'U');

/** 胴の大きい姿。小さい部品の段に混ぜると隣に重なるので、別の段に置く。 */
const BIG_LOOKS: ReadonlySet<string> = new Set(['toroid', 'to220', 'knob', 'radial', 'sot23-dip', 'sot346-dip', 'sot89-dip']);

const WOUND_PINS: Readonly<Record<string, number>> = { transformer: 4, 'transformer-ct': 5, 'transformer-ct2': 6 };

const SMALL_TWO = 7;
const SMALL_THREE = 8;
const BIG = 10;

/** 1 つの種類と姿を置く口。`variant` が null なら既定の姿。 */
function kindItem(type: string, variant: string | null): Item | null {
  const token = variant === null ? type : `${type}/${variant}`;
  const kind = lookupFootprint(type)?.kind;
  const big = variant !== null && BIG_LOOKS.has(variant);
  const prefix = prefixOf(type);
  switch (kind) {
    case 'two-lead':
      return leaded(prefix, token, 2, big || type === 'sma' ? BIG : SMALL_TWO, undefined, 4);
    case 'three-lead':
      return leaded(prefix, token, 3, big ? BIG : SMALL_THREE);
    case 'wound': {
      const pins = WOUND_PINS[type] ?? 4;
      return leaded(prefix, token, pins, pins + (variant === 'toroid' ? 6 : 4));
    }
    case 'switch':
      // 溝をまたぐので e 行に置く。
      return { ...anchored(prefix, token, 6), row: 'e' };
    case 'connector':
      return type.startsWith('terminal')
        ? leaded('J', token, Number(type.slice('terminal'.length)), Number(type.slice('terminal'.length)) * 2 + 3, undefined, 2)
        : leaded('J', token, 4, BIG);
    default:
      return null;
  }
}

/** 段に並べる種類 (DIP・SIP・ボード・名前つき・機器は別の節)。 */
const leadedKinds = (): readonly string[] =>
  knownPartTypes().filter((type) => ['two-lead', 'three-lead', 'wound', 'switch', 'connector'].includes(lookupFootprint(type)?.kind ?? ''));

const looksOf = (type: string): readonly string[] => (typesWithVariants().includes(type) ? variantsOf(type) : []);

// ---- 型番 (ピンの名前の表) --------------------------------------------------

/** 1 列で描く行。奇数ピン、樹脂の色や胴の字を持つ物、モジュールの外形を持つ物。 */
const isSip = (row: PinoutRow): boolean => row.names.length % 2 === 1 || row.look !== undefined || row.module !== undefined;

/** 600 mil で売られている SRAM。表は幅を持たないので、ここで姿を選ぶ。 */
const WIDE_MODELS: ReadonlySet<string> = new Set(['62256', '6116']);

const dipItem = (row: PinoutRow): Item => {
  const model = row.models[0] ?? '';
  const pins = row.names.length;
  const token = WIDE_MODELS.has(model) ? `dip${pins}/wide` : `dip${pins}`;
  return anchored('U', token, pins / 2 + 2, model);
};

/** 名札 (`U1 型番`) の幅を列で見積もる。1 列に字が 3 つほど。 */
const labelColumns = (model: string): number => Math.ceil((model.length + 3) / 3);

const sipItem = (row: PinoutRow): Item => {
  const model = row.models[0] ?? '';
  const pins = row.names.length;
  const outline = row.module === undefined ? 0 : 6;
  return anchored('U', `sip${pins}`, Math.max(pins, labelColumns(model)) + 2 + outline, model);
};

// ---- 段に詰める -------------------------------------------------------------

/** 段に左から詰め、溢れたら次の段、段が尽きたら次の図へ。 */
function pack(items: readonly Item[], lanes: Lanes): readonly (readonly string[])[] {
  const figures: string[][] = [];
  let lines: string[] = [];
  let lane = 0;
  let col = 1;
  const counts = new Map<string, number>();
  const flush = (): void => {
    if (lines.length > 0) figures.push(lines);
    lines = [];
    counts.clear();
    lane = 0;
    col = 1;
  };
  for (const item of items) {
    if (col + item.width - 1 > COLUMNS + 1) {
      lane += 1;
      col = 1;
    }
    if (lane >= lanes.length) flush();
    const count = (counts.get(item.prefix) ?? 0) + 1;
    counts.set(item.prefix, count);
    lines.push(...item.place(`${item.prefix}${count}`, col + 1, item.row ?? lanes[lane] ?? 'a'));
    col += item.width;
  }
  flush();
  return figures;
}

// ---- Markdown ---------------------------------------------------------------

const HEADER = '# ブレッドボードの実体配線図 (tommie-fence の bread フェンス)';

function renderFile(stem: string, heading: string, lead: string, sections: readonly Section[]): GalleryFile {
  const blocks: { section: Section; parts: readonly string[] }[] = [];
  for (const section of sections) {
    for (const parts of pack(section.items, section.lanes)) blocks.push({ section, parts });
  }
  const total = blocks.length;
  const out: string[] = [`# ${heading}`, '', lead, ''];
  let previous: Section | null = null;
  let within = 0;
  blocks.forEach(({ section, parts }, index) => {
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
    out.push('```bread', HEADER, `title: ${title}`, 'board: full', 'parts:', ...parts.map((line) => `  ${line}`), '```', '', `![${title}](out/${image})`, '');
  });
  return { name: `${stem}.md`, markdown: `${out.join('\n').trimEnd()}\n` };
}

const GENERATED = '**このファイルは書き出した物** — 直すときは `src/gallery/gallery.ts` を直して `npm run gallery`。';

// ---- 4 つのファイル ---------------------------------------------------------

function leadsFile(): GalleryFile {
  type Pick = { readonly type: string; readonly variant: string | null };
  const kindOf = (type: string): string => lookupFootprint(type)?.kind ?? '';
  const kinds = leadedKinds();
  const picks: Pick[] = [
    ...kinds.map((type) => ({ type, variant: null })),
    ...kinds.flatMap((type) => looksOf(type).map((variant) => ({ type, variant }))),
  ];
  const isBig = ({ type, variant }: Pick): boolean =>
    type === 'sma' || !['two-lead', 'three-lead'].includes(kindOf(type)) || (variant !== null && BIG_LOOKS.has(variant));
  const select = (test: (pick: Pick) => boolean): Item[] =>
    picks.filter(test).map(({ type, variant }) => kindItem(type, variant)).filter((item): item is Item => item !== null);
  const small = (kind: string, looked: boolean) => (pick: Pick): boolean =>
    !isBig(pick) && kindOf(pick.type) === kind && (pick.variant !== null) === looked;
  return renderFile('18-gallery-leads', '部品ギャラリー: 穴を並べて置く部品', [
    'ブレッドボードに**穴を並べて書く部品** (2 ピン・3 ピン・巻き物・スイッチ・USB・端子台) を、',
    '種類ごとに 1 つずつ、姿 (`種類/姿`) ごとに 1 つずつ置いた。配線はしていない。',
    '図の下の部品リストで、どの部品が何の種類と姿かを読める。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '2 ピンの部品', text: '姿を書かないときの姿。4 穴の間に置いた。', title: '2 ピンの部品', lanes: ['a', 'd', 'g', 'i'], items: select(small('two-lead', false)) },
    { heading: '2 ピンの部品の姿', text: '`種類/姿` で選べる姿。', title: '2 ピンの部品の姿', lanes: ['a', 'd', 'g', 'i'], items: select(small('two-lead', true)) },
    { heading: '3 ピンの部品', text: '姿を書かないときの姿と、`種類/姿` で選べる姿。隣どうしの 3 穴に置いた。', title: '3 ピンの部品', lanes: ['c', 'h'], items: [...select(small('three-lead', false)), ...select(small('three-lead', true))] },
    { heading: 'タクトスイッチ', text: '溝をまたいで置く (a 接点の `button` と b 接点の `button-nc` は同じ形)。', title: 'タクトスイッチ', lanes: ['e'], items: select((pick) => kindOf(pick.type) === 'switch') },
    { heading: '大きい部品', text: '巻き物・USB・端子台・SMA と、胴の大きい姿 (TO-220・トロイダル・ボリューム・面実装の変換基板など)。', title: '大きい部品', lanes: ['c', 'h'], items: select((pick) => isBig(pick) && kindOf(pick.type) !== 'switch') },
  ]);
}

function chipsFile(): GalleryFile {
  const rows = pinoutTable();
  const dips = rows.filter((row) => !isSip(row));
  const bySize = [...new Set(dips.map((row) => row.names.length))].sort((a, b) => a - b);
  const sections: Section[] = bySize.map((pins) => ({
    heading: `DIP${pins}`,
    text: `型番の表にある ${pins} ピンの型番。胴にピンの番号、胴の外にピンの名前が出る。`,
    title: `DIP${pins} の型番`,
    lanes: ['e'],
    items: dips.filter((row) => row.names.length === pins).map(dipItem),
  }));
  const sips = rows.filter((row) => isSip(row) && row.module === undefined);
  const modules = rows.filter((row) => row.module !== undefined);
  sections.push(
    { heading: '1 列の型番', text: '1 列 (`sipN`) で描く型番 (センサ・フィルタ・モジュールのヘッダ・フルカラー LED など)。', title: '1 列の型番', lanes: ['a', 'e', 'i'], items: sips.map(sipItem) },
    { heading: 'DIP 化キット', text: '基板とジャックの外形を帯の脇に描く型番。', title: 'DIP 化キット', lanes: ['j'], items: modules.map(sipItem) },
    { heading: 'DIP 化した変換基板の姿', text: '`dipN/sop` `dipN/tssop` (面実装の IC を DIP 化した変換基板に載せた姿)。', title: '変換基板の姿', lanes: ['e'], items: variantsOf('dip8').map((variant) => anchored('U', `dip8/${variant}`, 8)) },
  );
  return renderFile('19-gallery-chips', '部品ギャラリー: 型番のある IC とモジュール', [
    '[早見表](../docs/02-cheatsheet.md) の「DIP のピンの名前」の表にある**型番を全部**置いた。',
    '型番を書くと、胴にピンの番号、胴の外にピンの名前が出る。配線はしていない。',
    '62256 と 6116 は 600 mil の幅広 (`dipN/wide`) で置いた。',
    '',
    GENERATED,
  ].join('\n'), sections);
}

function discretesFile(): GalleryFile {
  const items = discreteTable().map((row) =>
    leaded(row.type === 'regulator' ? 'U' : 'Q', row.pkg === 'TO-220' ? `${row.type}/to220` : row.type, 3, (row.pkg === 'TO-220' ? 6 : 4) + labelColumns(row.models[0] ?? ''), row.models[0]));
  return renderFile('20-gallery-discretes', '部品ギャラリー: 型番のあるトランジスタ・FET・レギュレータ', [
    '[早見表](../docs/02-cheatsheet.md) の「3 ピンのトランジスタ・FET・レギュレータの穴の順」の表にある**型番を全部**置いた。',
    '型番を書くと、穴の順に表のピンの名前が付く。TO-220 の型番は `/to220` の姿で、ほかは TO-92 の姿で置いた。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '型番', text: '印字面を手前、ピンを下にして左から右の並び。', title: 'トランジスタ・FET・レギュレータの型番', lanes: ['c', 'i'], items },
  ]);
}

/** 4 桁の 7 セグは胴がピンの左右へはみ出す (左へ 6 列ほど) ので、アンカーをずらして置く。 */
const SEG7X4_OVERHANG = 6;
const segmentItem = (type: string, look: string): Item =>
  type === 'seg7x4'
    ? { prefix: 'DS', width: 24, place: (id, col, row) => [`${id}: ${type}/${look} @ ${row}${col + SEG7X4_OVERHANG}`] }
    : anchored('DS', `${type}/${look}`, 10);

function boardsFile(): GalleryFile {
  // Tang Nano 9K は列の間が 9 ピッチなので b↔i に置く (ほかは溝をまたぐ e↔f)。
  const boards = boardPartNames().map((name) => (name.startsWith('tang') ? { ...anchored('B', name, 30), row: 'b' } : anchored('B', name, 23)));
  const NAMED_WIDTH: Readonly<Record<string, number>> = { relay: 11, photocoupler: 5, photocoupler6: 6, 'dip-switch4': 6, 'dip-switch8': 10 };
  const named = knownPartTypes().filter((type) => lookupFootprint(type)?.kind === 'named');
  const segments = named.filter((type) => type.startsWith('seg7'));
  const chips = named.filter((type) => !segments.includes(type));
  const modules = moduleTable().map((row) => device(row.models[0] ?? '', 1));
  return renderFile('21-gallery-boards', '部品ギャラリー: マイコンボード・名前つきの部品・ボード外の機器', [
    'マイコンボード、ピンに名前のある DIP 型 (リレー・フォトカプラ・7 セグ・DIP スイッチ)、',
    '型番で書くボード外の機器 (`type: device` の `model:`) を全部置いた。配線はしていない。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: 'マイコンボード', text: '溝をまたいで置くボード。', title: 'マイコンボード', lanes: ['e'], items: boards },
    { heading: 'ピンに名前のある DIP 型', text: '溝をまたいで置く。ピンは名前でも番号でも呼べる。', title: 'ピンに名前のある DIP 型', lanes: ['e'], items: chips.flatMap((type) => looksOf(type).map((look) => anchored(type.startsWith('dip-switch') ? 'SW' : type === 'relay' ? 'K' : 'U', `${type}/${look}`, NAMED_WIDTH[type] ?? 8))) },
    { heading: '7 セグ', text: '列の間が 6 穴なので、i 行と e 行の組に置く。', title: '7 セグ', lanes: ['i'], items: segments.flatMap((type) => looksOf(type).map((look) => segmentItem(type, look))) },
    { heading: 'ボード外の機器', text: '`model:` に型番を書くと、ピンの名前が表から出る。', title: 'ボード外の機器', lanes: ['a'], items: modules },
  ]);
}

/** ギャラリーの全ファイル。 */
export const galleryFiles = (): readonly GalleryFile[] => [leadsFile(), chipsFile(), discretesFile(), boardsFile()];

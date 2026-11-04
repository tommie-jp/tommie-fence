import { boardPartNames, connectorNames, discreteTable, lookupBoardPart, lookupConnectorSymbol, lookupNamedChip, moduleTable, namedChipTypes, pinoutTable } from 'fence-kit';
import type { DiscreteKind, PinoutRow } from 'fence-kit';
import { lookupIcPinout, icLayoutModels } from '../core/icLayouts.ts';
import { PART_NAMES, PART_PREFIXES, lookupPartType, partTypeNames } from '../core/parts.ts';
import type { PartTypeName } from '../core/parts.ts';
import { deviceBox } from '../core/tex/shapes.ts';
import { icBox, icStepOf } from '../core/tex/icShape.ts';

/**
 * **部品ギャラリー** — 描ける記号を全部、回路図に並べて見せる例 (examples/19〜23)。
 *
 * 種類・型番の表から書き出すので、**表に部品を足したら `npm run gallery` で
 * 書き出し直す**。書き出し直さないと gallery.test.ts が落ちる (載せ漏れを残さない)。
 * 図は記号を見せるためだけの物で、配線はしない。
 *
 * 寸法はすべて番地のマス (pitch 2 の 1 マス = 2 cm)。記号の広がりを見積もり、
 * 段に左から詰め、溢れたら次の段、段が図の高さを越えたら次の図へ。
 */

/** 図の幅と高さ (マス)。これより大きい部品は 1 つで 1 段を占める。 */
const COLUMNS = 16;
const ROWS = 20;
/** 隣の部品との間 (マス)。札と記号が重ならない分。 */
const GAP_X = 0.6;
const GAP_Y = 0.35;
/** 記号の上下に添える字の行の高さ (マス)。 */
const TEXT_ROW = 0.45;
/** 図の pitch (cm / マス)。既定のまま。 */
const PITCH = 2;
/** ピンが番地に乗る部品のピンの刻み (マス)。 */
const PIN_STEP = 0.25;

/** 置いた点から見た記号の広がり (マス)。左・右・上・下。 */
type Extent = { readonly l: number; readonly r: number; readonly u: number; readonly d: number };

/** 1 つの部品。`place` は置いた点 (x, y) を受けて parts: の下の行を返す。 */
type Item = {
  readonly prefix: string;
  readonly extent: Extent;
  readonly place: (id: string, x: string, y: string) => readonly string[];
  /** 記号の上と下に添える字 (無ければ添えない)。 */
  readonly above?: string;
  readonly below?: string;
  /** 決まった ID (ネットの名前として図に出る種類)。 */
  readonly fixedId?: string;
};

type Section = {
  readonly heading: string;
  readonly text: string;
  readonly title: string;
  readonly items: readonly Item[];
  readonly style?: readonly string[];
  /** 段の中の幅を揃える (記号の一覧。札の長さで間隔がばらつかない)。 */
  readonly uniform?: boolean;
};

export type GalleryFile = { readonly name: string; readonly markdown: string };

// ---- 寸法の見積もり ---------------------------------------------------------

const extent = (l: number, r: number, u: number, d: number): Extent => ({ l, r, u, d });

/** 字の幅 (マス)。`small` の字で、半角 1 字が約 0.11 マス、全角はその倍。 */
const textWidth = (text: string): number => [...text].reduce((width, char) => width + (char.charCodeAt(0) > 0xff ? 0.22 : 0.11), 0);

/** ピンが番地に乗る箱の上下。偶数本は真ん中の上のピンが置いた行 (pinGrid.ts)。 */
const gridRows = (pins: number): { readonly u: number; readonly d: number } => ({
  u: (Math.ceil(pins / 2) - 1) * PIN_STEP + BOX_EDGE,
  d: Math.floor(pins / 2) * PIN_STEP + BOX_EDGE,
});

/** ID の札 (箱の上) の高さ。 */
const ID_ROW = 0.3;
/** 端のピンから箱の縁まで (マス)。 */
const BOX_EDGE = 0.15;
/** 箱の下へ出る型番 (立てた DIP) の高さ。 */
const VALUE_ROW = 0.3;
/** ピンの先の長さ (マス)。 */
const LEAD = 0.25;

const cm = (length: number): number => length / PITCH;

/** 種類ごとの広がり。表に無い種類は標準の大きさ。 */
const SYMBOL_EXTENT: Readonly<Record<string, Extent>> = {
  opamp: extent(0.75, 0.75, 0.7, 0.55),
  transformer: extent(0.6, 0.6, 0.65, 0.45),
  'transformer-ct': extent(0.6, 0.6, 0.65, 0.45),
  'transformer-ct2': extent(0.6, 0.6, 0.65, 0.45),
  regulator: extent(0.85, 0.85, 0.8, 0.7),
  ic3: extent(0.85, 0.85, 0.8, 0.7),
  'ceramic-filter': extent(0.85, 0.85, 0.8, 0.7),
  'nmos-dg': extent(0.9, 0.7, 0.65, 0.65),
  sma: extent(0.7, 0.7, 0.65, 0.65),
  relay: extent(1.2, 0.9, 0.6, 0.6),
  photocoupler: extent(0.9, 0.9, 0.7, 0.6),
  photocoupler6: extent(0.9, 0.9, 0.7, 0.6),
};
const MULTI_EXTENT = extent(0.75, 0.75, 0.55, 0.55);
/** 1 端子は記号が置いた点の片側へ出る。 */
const ONE_EXTENTS: Readonly<Record<string, Extent>> = {
  port: extent(0.6, 0.3, 0.3, 0.3),
  antenna: extent(0.6, 0.3, 1.0, 0.1),
  ground: extent(0.4, 0.4, 0.1, 0.45),
  vcc: extent(0.4, 0.4, 0.55, 0.1),
  vee: extent(0.4, 0.4, 0.1, 0.55),
};
const ONE_EXTENT = extent(0.5, 0.5, 0.6, 0.6);
/** 2 端子は置いた点から右へ 2 マス。 */
const TWO_LENGTH = 2;
const TWO_EXTENT = extent(0, TWO_LENGTH, 0.45, 0.55);

// ---- 置き方 ----------------------------------------------------------------

const prefixOf = (type: string): string => PART_PREFIXES[type as PartTypeName] ?? 'U';

/** 1 行で書く多端子 (`ID: 種類 番地 [型番]`)。 */
const single = (type: string, prefix: string, ext: Extent, model?: string): Item => ({
  prefix,
  extent: ext,
  place: (id, x, y) => [`${id}: ${type} ${x},${y}${model === undefined ? '' : ` ${model}`}`],
});

/** マップ形式で書く部品 (`type: device` / `type: ic3` + `model:`)。 */
const mapped = (type: string, model: string, ext: Extent): Item => ({
  prefix: type === 'device' ? 'M' : 'U',
  extent: ext,
  place: (id, x, y) => [`${id}:`, `    type: ${type}`, `    at: ${x},${y}`, `    model: ${model}`],
});

/** 1 端子で ID がネットの名前になる種類の ID。 */
const NET_IDS: Readonly<Record<string, string>> = { port: 'IN', antenna: 'ANT', vcc: 'VCC', vee: 'VEE' };

/** 種類の記号 1 つ (型番なし)。上に和名、下に種類名を添える。 */
function symbolItem(type: string): Item {
  const kind = lookupPartType(type)?.kind;
  const labels = { above: PART_NAMES[type as PartTypeName], below: type };
  if (kind === 'two-terminal') {
    return {
      ...labels,
      prefix: prefixOf(type),
      extent: TWO_EXTENT,
      place: (id, x, y) => [`${id}: ${type} ${x},${y} ${Number(x) + TWO_LENGTH},${y}`],
    };
  }
  if (kind === 'one-terminal') {
    const fixedId = NET_IDS[type];
    return { ...labels, ...(fixedId === undefined ? {} : { fixedId }), ...single(type, prefixOf(type), ONE_EXTENTS[type] ?? ONE_EXTENT) };
  }
  return { ...labels, ...single(type, prefixOf(type), SYMBOL_EXTENT[type] ?? MULTI_EXTENT) };
}

/** ピンが番地に乗る箱 (左右にピン)。`halfWidth` は箱の半幅 (cm)。 */
const gridBox = (pins: number, halfWidth: number, valueBelow: boolean): Extent => {
  const rows = gridRows(pins / 2);
  const half = cm(halfWidth) + LEAD;
  return extent(half, half, rows.u + ID_ROW, rows.d + (valueBelow ? VALUE_ROW : 0));
};

/** 片側 (左) にピンが並ぶ箱。 */
const headerBox = (pins: number, halfWidth: number): Extent => {
  const rows = gridRows(pins);
  return extent(cm(halfWidth) + LEAD, cm(halfWidth), rows.u + ID_ROW, rows.d);
};

/** DIP スイッチの 1 連の高さの半分 (マス)。 */
const DIP_SWITCH_ROW = 0.11;
/** 素の DIP の箱の半幅 (cm)。circuitikz の既定 1.2 を 1.2 倍して描く。 */
const DIP_HALF = 0.72;
/** 名前を刷る DIP の箱の幅 (parts.ts の dipWidth と同じ見積もり)。 */
const namedDipHalf = (names: readonly string[]): number => {
  const digits = String(names.length).length;
  const longest = Math.max(0, ...names.map((name) => [...name].length));
  const column = (digits + 1 + longest) * 0.1 + 0.1;
  return (Math.max(1.2, (column * 2 + 0.2) / 1.2) * 1.2) / 2;
};
/** マイコンボードの箱の半幅 (cm)。`dipchip/width=2.4` を 1.2 倍。 */
const BOARD_HALF = 1.44;
/** ピンヘッダの箱の半幅 (cm)。tex/shapes.ts の HALF_WIDTH。 */
const SIP_HALF = 0.55;

const dipItem = (pins: number, model?: string): Item =>
  single(`dip${pins}`, 'U', gridBox(pins, model === undefined ? DIP_HALF : namedDipHalf(pinoutNames(model)), model !== undefined), model);

const pinoutNames = (model: string): readonly string[] => pinoutTable().find((row) => row.models[0] === model)?.names ?? [];

const deviceItem = (model: string, names: readonly string[]): Item =>
  mapped('device', model, headerBox(names.length, deviceBox(names, model).halfWidth));

const icItem = (model: string): Item => {
  const pinout = lookupIcPinout(model);
  if (pinout === null) throw new Error(`ic の型番 ${model} の並びが無い`);
  const box = icBox(pinout, icStepOf(PITCH));
  const halfX = cm(box.halfWidth + 0.4);
  const halfY = cm(box.halfHeight + 0.4);
  return single('ic', 'U', extent(halfX, halfX, halfY + ID_ROW, halfY), model);
};

// ---- 段に詰める -------------------------------------------------------------

type Placed = { readonly lines: readonly string[]; readonly notes: readonly string[] };

const coord = (value: number): string => String(Math.round(value * 100) / 100);
/** 置く点は半マスに揃える (ピンが番地に乗る)。 */
const halfUp = (value: number): number => Math.ceil(value * 2 - 1e-9) / 2;
/** 横は 1/4 マスに揃える (半マスだと隣との間が揃わない)。 */
const quarterUp = (value: number): number => Math.ceil(value * 4 - 1e-9) / 4;

const slotWidth = (item: Item): number =>
  Math.max(item.extent.l + item.extent.r, textWidth(item.above ?? ''), textWidth(item.below ?? '')) + GAP_X;
const slotHeight = (item: Item): number =>
  (item.above === undefined ? 0 : TEXT_ROW) + item.extent.u + item.extent.d + (item.below === undefined ? 0 : TEXT_ROW) + GAP_Y;

/** 段に左から詰め、溢れたら次の段、図の高さを越えたら次の図へ。 */
function pack(items: readonly Item[], uniform = false): readonly Placed[] {
  const widest = Math.max(...items.map(slotWidth));
  const widthOf = (item: Item): number => (uniform ? widest : slotWidth(item));
  const figures: Placed[] = [];
  let lines: string[] = [];
  let notes: string[] = [];
  let counts = new Map<string, number>();
  let row: Item[] = [];
  let top = 1;
  const flush = (): void => {
    if (lines.length > 0) figures.push({ lines, notes });
    lines = [];
    notes = [];
    counts = new Map();
    top = 1;
  };
  const emit = (): void => {
    if (row.length === 0) return;
    const height = Math.max(...row.map(slotHeight));
    if (top + height > ROWS + 1 && lines.length > 0) flush();
    const hasAbove = row.some((item) => item.above !== undefined);
    const rowUp = Math.max(...row.map((item) => item.extent.u));
    const rowDown = Math.max(...row.map((item) => item.extent.d));
    const y = halfUp(top + (hasAbove ? TEXT_ROW : 0) + rowUp);
    let left = 1;
    for (const item of row) {
      const width = widthOf(item);
      const x = quarterUp(left + (width - GAP_X - item.extent.l - item.extent.r) / 2 + item.extent.l);
      const count = (counts.get(item.prefix) ?? 0) + 1;
      counts.set(item.prefix, count);
      const id = item.fixedId ?? `${item.prefix}${count}`;
      lines.push(...item.place(id, coord(x), coord(y)));
      const middle = coord(x + (item.extent.r - item.extent.l) / 2);
      // 幅を揃えた段は字の行も揃える (段でいちばん高い・低い記号に合わせる)。
      const up = uniform ? rowUp : item.extent.u;
      const down = uniform ? rowDown : item.extent.d;
      if (item.above !== undefined) notes.push(`- text ${middle},${coord(y - up - TEXT_ROW / 2)} small blue center: ${item.above}`);
      if (item.below !== undefined) notes.push(`- text ${middle},${coord(y + down + TEXT_ROW / 2)} small center: ${item.below}`);
      left += width;
    }
    top = y + rowDown + (row.some((item) => item.below !== undefined) ? TEXT_ROW : 0) + GAP_Y;
    row = [];
  };
  let used = 0;
  for (const item of items) {
    const width = widthOf(item);
    if (row.length > 0 && used + width > COLUMNS) {
      emit();
      used = 0;
    }
    row.push(item);
    used += width;
  }
  emit();
  flush();
  return figures;
}

// ---- Markdown ---------------------------------------------------------------

const HEADER = '# 回路図 (tommie-fence の circuit フェンス)';
const GENERATED = '**このファイルは書き出した物** — 直すときは `src/gallery/gallery.ts` を直して `npm run gallery`。';

function renderFile(stem: string, heading: string, lead: string, sections: readonly Section[]): GalleryFile {
  const blocks = sections.flatMap((section) => {
    const figures = pack(section.items, section.uniform);
    return figures.map((figure, index) => ({ section, figure, within: index + 1, count: figures.length }));
  });
  const out: string[] = [`# ${heading}`, '', lead, ''];
  let previous: Section | null = null;
  blocks.forEach(({ section, figure, within, count }, index) => {
    if (section !== previous) {
      out.push(`## ${section.heading}`, '', section.text, '');
      previous = section;
    }
    const number = String(index + 1).padStart(2, '0');
    const title = `図${number} ${section.title}${count > 1 ? ` (${within}/${count})` : ''}`;
    const image = blocks.length === 1 ? `${stem}.png` : `${stem}-${index + 1}.png`;
    out.push(
      '```circuit', HEADER, `title: ${title}`, 'parts:',
      ...figure.lines.map((line) => `  ${line}`),
      ...(figure.notes.length === 0 ? [] : ['notes:', ...figure.notes.map((line) => `  ${line}`)]),
      ...(section.style === undefined ? [] : ['style:', ...section.style.map((line) => `  ${line}`)]),
      '```', '', `![${title}](out/${image})`, '',
    );
  });
  return { name: `${stem}.md`, markdown: `${out.join('\n').trimEnd()}\n` };
}

// ---- 種類の分け方 -----------------------------------------------------------

/** 型番の節で置く種類 (型番が要る・型番で並びが決まる)。 */
const BY_MODEL: ReadonlySet<string> = new Set(['ic', 'device']);
const isDip = (type: string): boolean => /^dip\d+$/.test(type);
const isSip = (type: string): boolean => /^sip\d+$/.test(type);
const GATES: ReadonlySet<string> = new Set(['and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buffer']);
/** 箱で描く大きい部品 (コネクタ・名前つき・ボード)。別のファイルに置く。 */
const isBoxed = (type: string): boolean =>
  isDip(type) || isSip(type) || connectorNames().includes(type) || namedChipTypes().includes(type) || boardPartNames().includes(type);

const kindOf = (type: string): string | undefined => lookupPartType(type)?.kind;
const plainTypes = (): readonly string[] => partTypeNames().filter((type) => !BY_MODEL.has(type) && !isBoxed(type));

/** 流儀 (`standard:`) で形の変わる記号。 */
const STANDARD_TYPES: Readonly<Record<'european' | 'jis', readonly string[]>> = {
  european: ['resistor', 'resistor-var', 'potentiometer', 'inductor', 'isource', 'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buffer'],
  // jis の論理ゲートは MIL 記号のまま (american と同じ) なので載せない。
  jis: ['resistor', 'resistor-var', 'potentiometer', 'inductor', 'isource'],
};

function symbolsFile(): GalleryFile {
  const types = plainTypes();
  const pick = (test: (type: string) => boolean): Item[] => types.filter(test).map(symbolItem);
  return renderFile('19-gallery-symbols', '部品ギャラリー: 記号', [
    '回路図に描ける**記号を種類ごとに 1 つずつ**置いた。配線はしていない。',
    '記号の上の青い字が和名、下の字が `parts:` に書く種類の名前。',
    'ピンの多い箱 (DIP・ヘッダ・コネクタ・ボード) と型番で描く部品は、続きのファイル (20〜23) に置いた。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '2 端子の部品', text: '`ID: 種類 番地 番地` の 1 行。先に書いた番地 (左) が + 側。', title: 'ギャラリー 2 端子の記号', uniform: true, items: pick((type) => kindOf(type) === 'two-terminal') },
    { heading: '1 端子の部品', text: '`ID: 種類 番地`。`port` `antenna` `vcc` `vee` は ID がそのままネットの名前になる。', title: 'ギャラリー 1 端子の記号', uniform: true, items: pick((type) => kindOf(type) === 'one-terminal') },
    { heading: 'トランジスタ・FET・オペアンプ・トランスなど', text: '`ID: 種類 番地` の 1 行。置いた番地が記号の真ん中。', title: 'ギャラリー 多端子の記号', uniform: true, items: pick((type) => kindOf(type) === 'multi-terminal' && !GATES.has(type)) },
    { heading: 'ロジックゲート', text: '`style:` を書かないときの形 (`american`、MIL 記号)。', title: 'ギャラリー ロジックゲート', uniform: true, items: pick((type) => GATES.has(type)) },
    ...(['european', 'jis'] as const).map((standard) => ({
      heading: `流儀 \`standard: ${standard}\``,
      text: `\`style: standard: ${standard}\` で形の変わる記号。種類は同じで、描き方だけが変わる。`,
      title: `ギャラリー standard ${standard} の記号`,
      items: STANDARD_TYPES[standard].map(symbolItem),
      style: [`standard: ${standard}`],
      uniform: true,
    })),
  ]);
}

/** ピンの名前の表のうち、1 列のヘッダや外形を持つ行 (DIP の箱ではなく機器の箱で描く)。 */
const isRowLike = (row: PinoutRow): boolean => row.names.length % 2 === 1 || row.look !== undefined || row.module !== undefined;

function boxesFile(): GalleryFile {
  const dips = partTypeNames().filter(isDip).map((type) => ({ ...dipItem(Number(type.slice(3))), below: type }));
  const sips = partTypeNames().filter(isSip).map((type) => {
    const pins = Number(type.slice(3));
    return { ...single(type, 'J', headerBox(pins, SIP_HALF)), below: type };
  });
  const connectors = connectorNames().map((type) => {
    const pins = lookupConnectorSymbol(type)?.pins.length ?? 2;
    const rows = gridRows(pins);
    return { ...single(type, 'J', extent(0.9, 0.8, rows.u + ID_ROW, rows.d)), above: PART_NAMES[type as PartTypeName], below: type };
  });
  const named = namedChipTypes().map((type) => {
    const chip = lookupNamedChip(type, null);
    const pins = chip?.pins.length ?? 4;
    const ext = SYMBOL_EXTENT[type]
      ?? (type.startsWith('seg7') ? headerBox(pins, deviceBox(chip?.pins.map((pin) => pin.name) ?? [], chip?.name ?? '').halfWidth)
        : extent(0.7, 0.7, (pins / 2) * DIP_SWITCH_ROW + ID_ROW, (pins / 2) * DIP_SWITCH_ROW + BOX_EDGE + LEAD));
    return { ...single(type, chip?.prefix ?? 'U', ext), above: PART_NAMES[type as PartTypeName], below: type };
  });
  const boards = boardPartNames().map((type) => {
    const pins = lookupBoardPart(type)?.pins.length ?? 40;
    return { ...single(type, 'U', gridBox(pins, BOARD_HALF, false)), below: type };
  });
  return renderFile('20-gallery-boxes', '部品ギャラリー: ピンの多い箱 (DIP・ヘッダ・コネクタ・ボード)', [
    '箱にピンが並ぶ記号を種類ごとに 1 つずつ置いた。配線はしていない。',
    'DIP とピンヘッダは型番を書かない形 (ピンは番号)。型番を書いた DIP は [21-gallery-chips.md](21-gallery-chips.md)。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: 'DIP の IC', text: '`dip4`〜`dip40`。ピンは `U1.1` 〜 の番号で呼ぶ。', title: 'ギャラリー 番号だけの DIP', items: dips },
    { heading: 'ピンヘッダ', text: '`sip2`〜`sip40`。ピンは番号で呼ぶ。', title: 'ギャラリー ピンヘッダ', items: sips },
    { heading: 'コネクタ', text: 'USB とターミナルブロック。ピンは名前でも番号でも呼べる。', title: 'ギャラリー コネクタ', items: connectors },
    { heading: 'ピンに名前のある部品', text: 'リレー・フォトカプラ・7 セグ・DIP スイッチ。ピンは名前でも実物の番号でも呼べる。', title: 'ギャラリー ピンに名前のある部品', items: named },
    { heading: 'マイコンボード', text: 'ピンは実物の印字で呼ぶ (`U1.GP0`)。図には番号も出る。', title: 'ギャラリー マイコンボード', items: boards },
  ]);
}

function chipsFile(): GalleryFile {
  const rows = pinoutTable().filter((row) => !isRowLike(row));
  // 型番の少ない本数は隣の本数とまとめる (1 つだけの図を作らない)。
  const groups: readonly (readonly number[])[] = [[4, 8], [14], [16], [18, 20], [24, 28]];
  const counted = new Set(groups.flat());
  const stray = [...new Set(rows.map((row) => row.names.length))].filter((pins) => !counted.has(pins));
  if (stray.length > 0) throw new Error(`ギャラリーの DIP の組に無い本数: ${stray.join(' ')}`);
  return renderFile('21-gallery-chips', '部品ギャラリー: 型番のある DIP', [
    '[早見表](../docs/02-cheatsheet.md) の「DIP のピンの名前の表」の**型番を全部**、`dipN` に書いて置いた。',
    '型番を書くと、箱の中にピンの名前と番号が出る。配線はしていない。',
    '1 列のヘッダや外形を持つ型番 (センサ・モジュール・フィルタなど) は [23-gallery-modules.md](23-gallery-modules.md) に機器の箱で置いた。',
    '',
    GENERATED,
  ].join('\n'), groups.map((sizes) => {
    const names = sizes.map((pins) => `DIP${pins}`).join('・');
    return {
      heading: names,
      text: `表にある ${sizes.join('・')} ピンの型番 (${sizes.map((pins) => `\`dip${pins}\``).join(' ')})。`,
      title: `ギャラリー ${names} の型番`,
      items: rows.filter((row) => sizes.includes(row.names.length)).map((row) => dipItem(row.names.length, row.models[0] ?? '')),
    };
  }));
}

function icFile(): GalleryFile {
  const models = icLayoutModels();
  const big = (model: string): boolean => (lookupIcPinout(model)?.names.length ?? 0) > 16;
  return renderFile('22-gallery-ic', '部品ギャラリー: 働きで並べた IC (`ic`)', [
    '`ic` で描ける**型番を全部**置いた (`U1: ic 番地 型番`)。電源が上・GND が下・入力が左・出力が右。',
    '同じ型番を DIP の並びで描いた図は [21-gallery-chips.md](21-gallery-chips.md)。配線はしていない。',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: '16 ピンまで', text: '8〜16 ピンの型番。', title: 'ギャラリー ic の型番', items: models.filter((model) => !big(model)).map(icItem) },
    { heading: '20 ピン以上', text: '20〜28 ピンの型番。', title: 'ギャラリー ic の型番 (20 ピン以上)', items: models.filter(big).map(icItem) },
  ]);
}

/** ディスクリートの表の系統 → 回路図の記号。 */
const DISCRETE_SYMBOL: Readonly<Record<DiscreteKind, string>> = {
  npn: 'npn', pnp: 'pnp', 'nch-mos': 'nmos', 'pch-mos': 'pmos', 'nch-jfet': 'njfet', 'pch-jfet': 'pjfet', regulator: 'regulator',
};

function modulesFile(): GalleryFile {
  const discretes = discreteTable().map((row) => {
    const type = DISCRETE_SYMBOL[row.kind];
    const model = row.models[0] ?? '';
    const ext = SYMBOL_EXTENT[type] ?? MULTI_EXTENT;
    const valued = type === 'regulator' ? { ...ext, u: ext.u + VALUE_ROW } : { ...ext, d: ext.d + VALUE_ROW };
    return { ...single(type, type === 'regulator' ? 'U' : 'Q', valued, model), below: type };
  });
  const rowLike = pinoutTable().filter(isRowLike);
  const ic3s = rowLike.filter((row) => row.names.length === 3).map((row) => ({ ...mapped('ic3', row.models[0] ?? '', SYMBOL_EXTENT.ic3 ?? MULTI_EXTENT) }));
  const devices = [
    ...rowLike.map((row) => deviceItem(row.models[0] ?? '', row.names)),
  ];
  const modules = moduleTable().map((row) => deviceItem(row.models[0] ?? '', row.names));
  return renderFile('23-gallery-modules', '部品ギャラリー: 型番のあるトランジスタ・レギュレータ・機器', [
    '型番の表のうち、DIP の箱で描かない物を**全部**置いた。配線はしていない。',
    '',
    '- 3 ピンのトランジスタ・FET・レギュレータは記号に型番を添えた (`Q1: npn 番地 2SC1815`)',
    '- 3 ピンの IC は `type: ic3` + `model:` (ピンの名前が表から出る)',
    '- 1 列のヘッダの型番とモジュールは `type: device` + `model:`',
    '',
    GENERATED,
  ].join('\n'), [
    { heading: 'トランジスタ・FET・レギュレータの型番', text: '早見表の「3 ピンのトランジスタ・FET・レギュレータ」の表の型番。下の字は記号の種類。', title: 'ギャラリー トランジスタ・FET・レギュレータの型番', uniform: true, items: discretes },
    { heading: '3 ピンの IC (`ic3`)', text: 'ピンの名前の表にある 3 ピンの型番。箱は三端子レギュレータと同じ (1 = 左、2 = 下、3 = 右)。', title: 'ギャラリー ic3 の型番', items: ic3s },
    { heading: '1 列の型番 (`device`)', text: 'ピンの名前の表のうち、センサ・モジュール・フィルタ・DIP 化キットなど 1 列で描く型番。', title: 'ギャラリー device の型番 (1 列)', items: devices },
    { heading: 'モジュール (`device`)', text: '文法リファレンスの「モジュールの表」の型番。', title: 'ギャラリー device のモジュール', items: modules },
  ]);
}

/** ギャラリーの全ファイル。 */
export const galleryFiles = (): readonly GalleryFile[] => [symbolsFile(), boxesFile(), chipsFile(), icFile(), modulesFile()];

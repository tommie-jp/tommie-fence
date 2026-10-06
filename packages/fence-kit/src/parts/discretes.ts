/**
 * 3 本足のディスクリート部品 (トランジスタ・FET・三端子レギュレータ) のピンの名前の表
 * (52 の docs/119)。**型番で引いて、ブレッドボードとユニバーサル基板が同じ名前を刷る**。
 * 回路図の記号 (`npn` `njfet` …) はピンの名前が記号で決まっているので、この表は
 * (1) 実体配線図の穴に名前を当て、(2) 記号と型番の極性が食い違ったときにお知らせを出すのに使う。
 *
 * **並びは「印字面 (平らな面) を手前、ピンを下にして、左から右」**。これは実体配線図の
 * `Q1: transistor f5 f6 f7 2SC1815` の穴を書く順と同じ。同じ TO-92 でも型番で並びが違う
 * (2SC1815 は E C B、2N3904 は E B C、2N7000 は S G D、BS170 は D G S) ので、**型番ごとに
 * データシートの図で確かめた** (出典は各行の `source`)。
 */

/** 部品の系統。回路図の記号との突き合わせに使う。 */
export type DiscreteKind = 'npn' | 'pnp' | 'nch-mos' | 'pch-mos' | 'nch-jfet' | 'pch-jfet' | 'regulator';

/** 表を引く 3 ピンの部品の種類 (フェンスに書く種類の名前)。 */
export type DiscreteType = 'transistor' | 'regulator';

export type DiscreteRow = {
  /** 書ける型番。**先頭が代表の綴り**。 */
  readonly models: readonly string[];
  readonly type: DiscreteType;
  readonly kind: DiscreteKind;
  /** ピンの名前。印字面を手前、ピンを下にして左から右。 */
  readonly names: readonly [string, string, string];
  /** パッケージ (データシートの名前)。 */
  readonly pkg: string;
  /** 一言で言う働き。部品表に出す。 */
  readonly role: string;
  /** 文書の表に添える一言。 */
  readonly note?: string;
  /** 確かめたデータシート。 */
  readonly source: string;
};

export type Discrete = {
  readonly model: string;
  readonly kind: DiscreteKind;
  readonly names: readonly [string, string, string];
};

const ECB = ['E', 'C', 'B'] as const;
const EBC = ['E', 'B', 'C'] as const;
const SGD = ['S', 'G', 'D'] as const;
const DGS = ['D', 'G', 'S'] as const;
const GDS = ['G', 'D', 'S'] as const;

const ROWS: readonly DiscreteRow[] = [
  // --- 東芝系の TO-92 (2-5F1B): 印字面を手前に 1=E 2=C 3=B ---
  {
    models: ['2SC1815', '2SC1815Y', '2SC1815GR', '2SC1815BL', '2SC1815-Y', '2SC1815-GR', '2SC2458'], type: 'transistor', kind: 'npn', names: ECB,
    pkg: 'TO-92', role: 'NPN 汎用 50 V 150 mA', source: '東芝 2SC1815 (2007-11-01)、外形図 2-5F1B の端子 (1 EMITTER・2 COLLECTOR・3 BASE)',
  },
  {
    models: ['2SA1015', '2SA1015Y', '2SA1015GR', '2SA1015-Y', '2SA1015-GR'], type: 'transistor', kind: 'pnp', names: ECB,
    pkg: 'TO-92', role: 'PNP 汎用 -50 V -150 mA', source: '東芝 2SA1015 (2007-11-01)、2-5F1B',
  },
  {
    models: ['2SC2120', '2SC2120Y', '2SC2120O', '2SC2120-Y', '2SC2120-O'], type: 'transistor', kind: 'npn', names: ECB,
    pkg: 'TO-92', role: 'NPN 30 V 800 mA', source: '東芝 2SC2120 (2002-01-30、秋月の配布)、2-5F1B',
  },
  {
    models: ['2SA950', '2SA950Y', '2SA950O', '2SA950-Y', '2SA950-O'], type: 'transistor', kind: 'pnp', names: ECB,
    pkg: 'TO-92', role: 'PNP -30 V -800 mA', source: '東芝 2SA950 (2007-11-01、秋月の配布)、2-5F1B',
  },
  {
    models: ['2SC2655', '2SC2655Y', '2SC2655O', '2SC2655-Y', '2SC2655-O'], type: 'transistor', kind: 'npn', names: ECB,
    pkg: 'TO-92MOD', role: 'NPN 50 V 2 A', note: '太い TO-92 (2-5J1A)', source: '東芝 2SC2655 (2009-12-21)、2-5J1A',
  },
  {
    models: ['2SA1020', '2SA1020Y', '2SA1020O', '2SA1020-Y', '2SA1020-O'], type: 'transistor', kind: 'pnp', names: ECB,
    pkg: 'TO-92MOD', role: 'PNP -50 V -2 A', note: '太い TO-92 (2-5J1A)', source: '東芝 2SA1020 (2010-11-09)、2-5J1A',
  },
  // --- 海外・その他の TO-92 ---
  {
    models: ['2N3904'], type: 'transistor', kind: 'npn', names: EBC,
    pkg: 'TO-92', role: 'NPN 汎用 40 V 200 mA', source: 'onsemi 2N3903/D Rev. 9 (2021-08)、CASE 29-11 STYLE 1 (1 E・2 B・3 C)',
  },
  {
    models: ['2N3906'], type: 'transistor', kind: 'pnp', names: EBC,
    pkg: 'TO-92', role: 'PNP 汎用 -40 V -200 mA', source: 'onsemi 2N3906/D Rev. 4 (2010-02)、CASE 29 STYLE 1',
  },
  {
    models: ['2N2222A', '2N2222', 'PN2222A', 'PN2222'], type: 'transistor', kind: 'npn', names: EBC,
    pkg: 'TO-92 / TO-18', role: 'NPN 40 V 600 mA',
    note: '**onsemi の `P2N2222A` は C B E (STYLE 17) で逆**。金属缶 TO-18 は番号 (1=E 2=B 3=C) を穴の順に書く',
    source: 'Fairchild PN2222A (Rev. A1、2004-08) の図 E B C と、TO-18 の 1 E・2 B・3 C (CDIL・Microsemi)',
  },
  {
    models: ['P2N2222A'], type: 'transistor', kind: 'npn', names: ['C', 'B', 'E'],
    pkg: 'TO-92', role: 'NPN 40 V 600 mA', note: 'onsemi の STYLE 17。`PN2222A` (E B C) と C と E が逆', source: 'onsemi P2N2222A/D Rev. 7 (2013-01)、CASE 29-11 STYLE 17',
  },
  {
    models: ['2SC1008'], type: 'transistor', kind: 'npn', names: EBC,
    pkg: 'TO-92', role: 'NPN 60 V 700 mA',
    note: '同世代の 2SC1815 (E C B) と違い E B C。**原典の資料は見つからず JCET 製の資料による**',
    source: 'JCET 2SC1008 (E 版、2017-08)、印字面の E B C',
  },
  // --- FET ---
  {
    models: ['2SK30A', '2SK30ATM', '2SK30A-Y', '2SK30A-GR', '2SK30ATM-Y', '2SK30ATM-GR'], type: 'transistor', kind: 'nch-jfet', names: SGD,
    pkg: 'TO-92', role: 'N チャネル JFET (低雑音・汎用)', note: '2SK170・2SK117 は D G S で S と D が逆',
    source: '東芝 2SK30ATM (1997-04-10)、外形 2-5F1C の 1 S・2 G・3 D',
  },
  {
    models: ['2SK170', '2SK170-BL', '2SK170-GR', '2SK170-V', '2SK170BL', '2SK170GR', '2SK170V'], type: 'transistor', kind: 'nch-jfet', names: DGS,
    pkg: 'TO-92', role: 'N チャネル JFET (低雑音)', note: '2SK30A は S G D で S と D が逆',
    source: '東芝 2SK170 (2003-03-25)、外形 2-5F1D の 1 D・2 G・3 S (底面から見た図の番号。印字面を手前にしても左右は同じ)',
  },
  {
    models: ['2SK117', '2SK117-BL', '2SK117-GR', '2SK117-Y'], type: 'transistor', kind: 'nch-jfet', names: DGS,
    pkg: 'TO-92', role: 'N チャネル JFET (低雑音)', source: '東芝 2SK117 (1997-04-10)、2-5F1D',
  },
  {
    models: ['2SJ74', '2SJ74-BL', '2SJ74-GR', '2SJ74-V', '2SJ74BL', '2SJ74GR', '2SJ74V'], type: 'transistor', kind: 'pch-jfet', names: DGS,
    pkg: 'TO-92', role: 'P チャネル JFET (低雑音)', note: '2SK170 の相補品。並びも同じ', source: '東芝 2SJ74 (1997-04-10)、2-5F1D',
  },
  {
    models: ['2N7000'], type: 'transistor', kind: 'nch-mos', names: SGD,
    pkg: 'TO-92', role: 'N チャネル MOSFET 60 V 200 mA',
    note: '**BS170 は D G S で逆**。onsemi の 2022 年版は本文の表が D G S と読める (誤記説あり・未確認)。買った品の資料かテスタで確かめる',
    source: 'ON Semi 2N7000/D Rev. 7 (2007-10)、印字面の図 (CASE 29 STYLE 22: 1 S・2 G・3 D)',
  },
  {
    models: ['BS170'], type: 'transistor', kind: 'nch-mos', names: DGS,
    pkg: 'TO-92', role: 'N チャネル MOSFET 60 V 500 mA', note: '**2N7000 は S G D で逆**',
    source: 'ON Semi BS170/D Rev. 5 (2005-08)、印字面の図 (CASE 29 STYLE 30: 1 D・2 G・3 S)',
  },
  {
    models: ['IRF520', 'IRF520N', 'IRF540', 'IRF540N', 'IRLZ44N', 'IRLZ44', 'IRL540N', 'IRF3205'], type: 'transistor', kind: 'nch-mos', names: GDS,
    pkg: 'TO-220', role: 'N チャネルパワー MOSFET', note: 'タブは D。IRLZ44N は Vgs 最大 ±16 V',
    source: 'Vishay IRF520 (Doc 91017 Rev. C)、Infineon IRF540NPbF (Rev. 2.1)、IR IRLZ44N (PD-94831) の 1 G・2 D・3 S',
  },
  {
    models: ['IRF9540', 'IRF9540N', 'IRF9Z34N'], type: 'transistor', kind: 'pch-mos', names: GDS,
    pkg: 'TO-220', role: 'P チャネルパワー MOSFET', note: '並びは N チャネルと同じ G D S。タブは D',
    source: 'Vishay IRF9540 (Doc 91078 Rev. C) の 1 G・2 D・3 S',
  },
  {
    models: ['2SK2231'], type: 'transistor', kind: 'nch-mos', names: GDS,
    pkg: 'PW-Mold (面実装)', role: 'N チャネル MOSFET 60 V 5 A', note: '**TO-220 ではなく面実装 (DPAK 相当)**。タブは D。基板に挿すには変換基板が要る',
    source: '東芝 2SK2231 (1998-11-12)、2-7B1B の 1 G・2 D・3 S',
  },
  // --- TO-126 ---
  {
    models: ['2SD882'], type: 'transistor', kind: 'npn', names: ECB,
    pkg: 'TO-126', role: 'NPN 30 V 3 A', note: '**ST の資料だけ図が B C E で食い違う**。実物をテスタで確かめる',
    source: 'Inchange 2SD882 の 1 E・2 C・3 B (文字のみ)。ST 2SD882 Rev 3 の内部図は B C E',
  },
  {
    models: ['2SB772'], type: 'transistor', kind: 'pnp', names: ECB,
    pkg: 'TO-126', role: 'PNP -30 V -3 A', source: 'Blue Rocket 2SB772 Rev. F (2016-03)、Inchange 2SB772 の 1 E・2 C・3 B',
  },
  // --- 三端子レギュレータ ---
  {
    models: ['7805', 'L7805', 'L7805CV', 'LM7805', 'MC7805', 'UA7805', '7809', '7812', '7815', 'L7809', 'L7812', 'L7815'], type: 'regulator', kind: 'regulator',
    names: ['IN', 'GND', 'OUT'], pkg: 'TO-220', role: '三端子レギュレータ (正電圧)', note: '78L05 (TO-92) は逆の並び',
    source: 'TI uA78xx SLVS056P (2015-01)、KCS/KCT の 1 INPUT・2 COMMON・3 OUTPUT',
  },
  {
    models: ['78L05', 'L78L05', 'UA78L05', 'MC78L05', '78L33', '78L09', '78L12'], type: 'regulator', kind: 'regulator',
    names: ['OUT', 'GND', 'IN'], pkg: 'TO-92', role: '三端子レギュレータ (正電圧、100 mA)', note: '7805 (TO-220) は逆の並び',
    source: 'TI uA78L SLVS010X (2023-06)、Figure 5-2 (LP) の 1 OUTPUT・2 COMMON・3 INPUT',
  },
  {
    models: ['LM317', 'LM317T', 'LM317MP'], type: 'regulator', kind: 'regulator',
    names: ['ADJ', 'OUT', 'IN'], pkg: 'TO-220', role: '可変三端子レギュレータ', note: '`GND` ではなく `ADJ`。タブは OUT',
    source: 'TI LM317 SLVS044Z (2025-04)、KCS/KCT の 1 ADJUST・2 OUTPUT・3 INPUT',
  },
];

/** 型番 (大文字) → 行。`Map` にするのは `constructor` のような継ぎ物の名前を拾わないため。 */
const BY_MODEL: ReadonlyMap<string, DiscreteRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [`${row.type}:${model.toUpperCase()}`, row] as const)),
);

/**
 * 種類と型番からピンの名前を引く。**表に無い型番は null** (呼ぶ側は穴に書かれた名前か番号で描く)。
 */
export function lookupDiscrete(type: string, model: string | null): Discrete | null {
  if (model === null) return null;
  const row = BY_MODEL.get(`${type}:${model.trim().toUpperCase()}`);
  return row === undefined ? null : { model: row.models[0] ?? '', kind: row.kind, names: row.names };
}

/** 表にある型番 (行ごとに代表の綴り 1 つ)。種類を渡すとその種類だけ。 */
export const discreteModels = (type?: DiscreteType): readonly string[] =>
  ROWS.filter((row) => type === undefined || row.type === type).map((row) => row.models[0] ?? '');

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const discreteTable = (): readonly DiscreteRow[] => ROWS;

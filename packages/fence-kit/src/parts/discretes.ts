import { BUNDLED_CARDS } from './cards/bundled.gen.ts';
import { discreteRows } from './cards/convert.ts';
import { cardDiscrete } from './cards/scope.ts';

/**
 * 3 ピンのディスクリート部品 (トランジスタ・FET・三端子レギュレータ) のピンの名前の表
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
  /** 部品カードから読んだ行。 */
  readonly card?: 'bundled' | 'local';
};

export type Discrete = {
  readonly model: string;
  readonly kind: DiscreteKind;
  readonly names: readonly [string, string, string];
};

/**
 * **データシートどうしが食い違い、表が一方に従った型番**と、**製造元の図が無く個人のデータの一致で
 * 並びを決めたモジュール**の注意書き。**実物で確かめる**ことを、この型番が出てくる全部の文書
 * (3 つの文法リファレンス・早見表・教科書の部品表) に同じ文面で書く。試験が文書に載っているかを見張る。
 * 文面は表の行 (ディスクリート・ピンの名前・モジュールの表) の注にも埋める。
 */
export const VERIFY_NOTES: Readonly<Record<string, string>> = {
  '2N7000': '実物で確かめる: onsemi の 2007 年版の図は S G D、2022 年版の表は D G S で食い違い、表は 2007 年版 (S G D) に従う。実物はテスタで確かめる',
  '2SD882': '実物で確かめる: ST の資料だけ図が B C E で、他は E C B。表は E C B。実物はテスタで確かめる',
  'GY-9833': '実物で確かめる: 製造元の図が無く、並びは個人の KiCad データ 5 つの一致による。CJMCU-9833 の名の基板は REF VCC GND DAT CLK FNC OUT の別の並びが多い。実物は基板の印字で確かめる',
  'TP4056-MODULE': '実物で確かめる: 製造元の図が無く、パッドの位置は個人のデータ 3 つの一致による。実物は基板の印字で確かめる',
  'AE-DC-POWER-JACK-DIP': '実物で確かめる: 秋月の図は線画だけで、2・3 番がどちらにつながるかは読み取れない。シルクのある 1 番 (−) と 4 番 (+) だけを使い、実物はテスタで確かめる',
};

/**
 * 行は同梱の部品カード (`packages/fence-kit/parts/discretes/*.part.yaml`) に移した (52 の docs/160)。
 * 並び (印字面を手前、ピンを下にして左から右) と出典は各カードにある。
 */
const TS_ROWS: readonly DiscreteRow[] = [];

/** 型番 (大文字) → 行。`Map` にするのは `constructor` のような継ぎ物の名前を拾わないため。 */
/** 表の全部。TS の行のあとに同梱の部品カード (52 の docs/158)。 */
const ROWS: readonly DiscreteRow[] = [...TS_ROWS, ...discreteRows(BUNDLED_CARDS, 'bundled')];

const BY_MODEL: ReadonlyMap<string, DiscreteRow> = new Map(
  ROWS.flatMap((row) => row.models.map((model) => [`${row.type}:${model.toUpperCase()}`, row] as const)),
);

/**
 * 種類と型番からピンの名前を引く。**表に無い型番は null** (呼ぶ側は穴に書かれた名前か番号で描く)。
 */
export function lookupDiscrete(type: string, model: string | null): Discrete | null {
  if (model === null) return null;
  const row = BY_MODEL.get(`${type}:${model.trim().toUpperCase()}`) ?? cardDiscrete(type, model);
  return row === undefined ? null : { model: row.models[0] ?? '', kind: row.kind, names: row.names };
}

/** 表にある型番 (行ごとに代表の綴り 1 つ)。種類を渡すとその種類だけ。 */
export const discreteModels = (type?: DiscreteType): readonly string[] =>
  ROWS.filter((row) => type === undefined || row.type === type).map((row) => row.models[0] ?? '');

/** 表の全部 (早見表と文法リファレンスに並べる)。 */
export const discreteTable = (): readonly DiscreteRow[] => ROWS;

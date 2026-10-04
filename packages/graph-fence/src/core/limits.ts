/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 描画は同期処理なので、上限が無いと 1 枚のフェンスで拡張ホストを止められる。
 *
 * **上限を置いていない数はいつか無限になる** (perfboard の Phase 3 で踏んだ)。
 */
export const LIMITS = {
  /** 報告に添える行の中身の長さ。 */
  snippetLength: 120,
  /** 識別子の長さ。報告に載せる綴りの切り詰めにも使う。 */
  idLength: 32,
  /** 線の数。**4 本を超えると見分けにくい** (readable-graph #7) が、族を描く題のために 8 まで受ける。 */
  lines: 8,
  /** 1 本の点列の点の数。 */
  pointsPerLine: 1001,
  /** 式を標本にする点の数。 */
  samples: 512,
  /** 式の字数と入れ子の深さ。**式は入力を計算する部品**なので両方に上限を置く。 */
  exprLength: 200,
  exprDepth: 32,
  /** 単位ごとの枠の数。縦に積むので、これより多いと縦に長くなりすぎる。 */
  panels: 3,
  /** 注釈の数と、1 つの字数。`mark` の数 (帯の行の数)。 */
  notes: 50,
  noteLength: 60,
  marks: 8,
  /** 対数の軸の両端の比の上限 (12 桁)。 */
  logRatio: 1e12,
  /** 値の絶対値の上限。これより大きい値は描かず、読み値は — にする。 */
  valueMax: 1e15,
  /** `data:` の行の数・列の数・ファイルの大きさ。**列は配列を確保する前に断る** (scope の CRITICAL と同じ守り)。 */
  dataRows: 100001,
  dataColumns: 16,
  dataBytes: 1_000_000,
  /** `data:` の凡例の名前の字数 (`計算` `QucsStudio の計算`)。 */
  dataLabel: 20,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 軸の名前と線の名前の長さ。 */
  nameLength: 24,
  /** `- source` が図に書き出すフェンスの行数と、1 行の長さ (scope と同じ値)。 */
  sourceLines: 1000,
  sourceLineLength: 160,
} as const;

/**
 * `data:` に書けるファイル名。**`.md` の隣のファイルだけ** — `/` も `..` も
 * 通さない。共有された `.md` に `../../.ssh/…` を書かれても読みに行かない
 * (vna・scope と同じ。52 の docs/76)。宿主の側でも名前がそのままファイル名であることを確かめる。
 */
export const DATA_NAME = /^[\w-][\w.-]{0,63}\.(csv|txt)$/i;

/**
 * `data:` に凡例の名前を書かなかったときの名前。`data:` は測った値を重ねるキーなので、
 * 既定は実測。計算で作ったファイルは名前を書く (`data: x.csv 計算`)。
 */
export const MEASURED_LABEL = '実測';

/** 選べるテーマ。**既定は light**。 */
export const THEME_NAMES = ['light', 'dark', 'mono'] as const;

/** `style:` に書ける大きさの範囲。 */
export const STYLE_RANGES = {
  width: { min: 120, max: 4000 },
} as const;

/** 図に載る文字の長さを切る。サロゲートペアを割らないようコードポイントで数える。 */
export function clampText(text: string, max: number): string {
  const characters = [...text];
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}

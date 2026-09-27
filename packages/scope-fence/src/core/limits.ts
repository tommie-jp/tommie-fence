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
  /** ch の数。**実機 (AD3 / 汎用機) と同じ 4 本**。 */
  channels: 4,
  /** 1 つの ch に繋げる操作の数。 */
  opsPerChannel: 8,
  /** 画面 1 枚の点数。**WaveForms の既定の Buffer (8192)**。 */
  samples: 8192,
  /** 助走 (定常まで回す分) の点数の上限。画面の 128 枚ぶん。 */
  warmupSamples: 8192 * 128,
  /** カーソルと Measurements の数。 */
  cursors: 2,
  measures: 8,
  /** time/div と V/div の範囲 (s と V)。 */
  perDiv: { min: 1e-9, max: 60 },
  voltsPerDiv: { min: 1e-6, max: 1e4 },
  /** 電圧と周波数の上の端。 */
  voltsMax: 1e6,
  frequencyMax: 1e9,
  /** `data:` の行の数とファイルの大きさ。 */
  dataRows: 100001,
  /**
   * `data:` の列の数 (時刻 1 + ch 4 + Math など読み捨てる列の余裕)。**配列を確保する前に断る** —
   * 列に上限が無いと、1 MB の上限の中でも 行 × 列 の確保が膨らんで拡張ホストが止まる。
   */
  dataColumns: 16,
  dataBytes: 1_000_000,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 注釈の数と、1 つの字数 (段 3 の notes: が使う)。 */
  notes: 50,
  noteLength: 60,
  /** `- source` が図に書き出すフェンスの行数と、1 行の長さ (vna と同じ値)。 */
  sourceLines: 1000,
  sourceLineLength: 160,
} as const;

/**
 * `data:` に書けるファイル名。**`.md` の隣のファイルだけ** — `/` も `..` も
 * 通さない。共有された `.md` に `../../.ssh/…` を書かれても読みに行かない
 * (vna と同じ。52 の docs/76)。宿主の側でも名前がそのままファイル名であることを確かめる。
 */
export const DATA_NAME = /^[\w-][\w.-]{0,63}\.(csv|txt)$/i;

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

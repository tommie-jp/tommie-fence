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
  /** `signal:` に並べられる波の数 (和を取る)。 */
  signals: 16,
  /** `hold:` に並べられる行の数 (1 行が範囲なら、その位置ごとに掃引が増える)。 */
  holdEntries: 64,
  /** MAX HOLD で積める掃引の数。FFT 型は掃引ごとに FFT をするので少ない。 */
  holdSweeps: 1000,
  holdSweepsFft: 32,
  /** 線スペクトルの本数 (全部の波の高調波の和)。掃引型の計算は線の数 × 点数。 */
  lines: 4096,
  /** 掃引型の点数 (機種ごとの選択肢はこの中)。 */
  points: { min: 51, max: 1001 },
  /** FFT 型の標本の数 (2 の冪)。 */
  samples: { min: 1024, max: 65536 },
  /** マーカーの数 (実機と同じ 4)。 */
  markers: 4,
  /** 周波数の上の端 (Hz)。 */
  frequencyMax: 10e9,
  /** レベルの範囲 (dBm。dBV も同じ幅で見る)。 */
  levelRange: { min: -200, max: 40 },
  /** 目盛 1 つの幅 (dB)。 */
  scale: { min: 0.1, max: 50 },
  /** `data:` の行の数とファイルの大きさ。 */
  dataRows: 10001,
  dataBytes: 1_000_000,
  /** `data:` の凡例の名前の字数 (`計算` `QucsStudio の計算`)。 */
  dataLabel: 20,
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

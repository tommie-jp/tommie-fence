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
  /** `signals:` の行の数。 */
  signalRows: 64,
  /** レーンの数 (機種の本数はこの中。generic はこの数まで)。 */
  lanes: 32,
  /** バスの 1 語の長さ (`A3..A0` など。これを越える語は読まない)。 */
  wordLength: 80,
  /** バスに束ねられるビットの数。 */
  busBits: 16,
  /** `buses:` と `decode:` の行の数。 */
  buses: 16,
  decodes: 8,
  /** カーソルの数 (X1・X2)。 */
  cursors: 2,
  /** `pattern` の bit の数と `edges` の組の数、counter の `sequence` の長さ。 */
  patternBits: 4096,
  edgePairs: 4096,
  sequenceLength: 4096,
  /** 1 つのレーンで数え上げる edge の数。これを越えると密なレーンとして塗りで描く。 */
  edges: 4000,
  /** 窓の目盛の数 (WaveForms の Logic と同じ 10)。 */
  divisions: 10,
  /** 窓の幅 (s) の範囲と、`start:` の絶対値の上限。範囲の外は断り、窓は仮のまま (桁あふれで座標が NaN になる)。 */
  windowMax: 1e6,
  windowMin: 1e-9,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 図に載せるバスの値の並びの数 (`check` の要約)。 */
  summaryValues: 24,
  /** `- source` が図に書き出すフェンスの行数と、1 行の長さ (vna と同じ値)。 */
  sourceLines: 1000,
  sourceLineLength: 160,
} as const;

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

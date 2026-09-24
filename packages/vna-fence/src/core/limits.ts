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
  /** 掃引の点数。**1001 は NanoVNA-Saver の分割掃引の上限**に合わせた。 */
  points: { min: 2, max: 1001 },
  /** 掃引の上の端 (Hz)。V2 Plus4 の 4.4 GHz を超えて余裕を持たせる。 */
  frequencyMax: 10e9,
  /** `data:` の点の数とファイルの大きさ。 */
  dataPoints: 10001,
  dataBytes: 1_000_000,
  /** トレースとマーカーの数。**実機と同じ 4 つ**。 */
  traces: 4,
  markers: 4,
  /** `dut:` の素子の数。 */
  dutElements: 20,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 注釈の数と、1 つの字数。 */
  notes: 50,
  noteLength: 60,
  /** `- source` が図に書き出すフェンスの行数と、1 行の長さ (perfboard と同じ値)。 */
  sourceLines: 1000,
  sourceLineLength: 160,
} as const;

/**
 * `data:` に書けるファイル名。**`.md` の隣のファイルだけ** — `/` も `..` も
 * 通さない。共有された `.md` に `../../.ssh/…` を書かれても読みに行かない
 * (52 の docs/76)。宿主の側でも名前がそのままファイル名であることを確かめる。
 */
export const DATA_NAME = /^[\w-][\w.-]{0,63}\.s[12]p$/i;

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

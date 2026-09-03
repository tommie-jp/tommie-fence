/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 描画は同期処理なので、上限が無いと 1 枚のフェンスでサーバーや拡張ホストを
 * 止められてしまう。実在の回路には十分な余裕を取ったうえで必ず頭を打たせる。
 */
export const LIMITS = {
  parts: 200,
  /**
   * 図の下の部品リストに並べる行数。超えたぶんは「ほかに N 件」の 1 行にまとめる。
   * ブレッドボード 1 枚に挿さる部品数を大きく超えているので実用では頭を打たないが、
   * 上限が無いと `style.width` の頭打ちを抜けて巨大なラスタ画像を作れてしまう。
   */
  listedParts: 60,
  wires: 500,
  devicePins: 64,
  pinNameLength: 24,
  idLength: 32,
  labelLength: 60,
  /** 注釈の数と 1 つの字数。回路図フェンスと同じ数に揃えてある。 */
  notes: 200,
  noteLength: 60,
  titleLength: 60,
  /**
   * `- source` が図に書き出すフェンスの行数。**切ったことは図に書く**ので
   * 黙って消えない (`fence-kit` の `keptSourceLines`)。
   *
   * **1000 行まで通す** (実測 2026-09-04)。項目ごとの上限を全部使い切ると
   * フェンスは 1000 行を超えるので、80 行では自分の図の書き出しさえ切れていた。
   * 709 行のフェンスで 0.06 秒・530KB・高さ 8232 と測れたので、重さは問題にならない。
   */
  sourceLines: 1000,
  /** `points:` に置ける名前の数。 */
  points: 100,
  /** 報告に添える行の中身の長さ。長い行を丸ごと載せると帯が読めなくなる。 */
  snippetLength: 120,
} as const;

/**
 * `style:` に書ける大きさの範囲。図として成立する幅に収める。
 * width の上限は、フェンス 1 つで巨大なラスタ画像を作らせないための頭打ちでもある。
 */
export const STYLE_RANGES = {
  textSize: { min: 6, max: 24 },
  wireWidth: { min: 1, max: 8 },
  // 穴の間隔 (render/model/layout.ts の PITCH = 20) より必ず小さく。
  holeSize: { min: 2, max: 14 },
  width: { min: 120, max: 4000 },
} as const;

/** 図に載る文字の長さを切る。サロゲートペアを割らないようにコードポイントで数える。 */
export function clampText(text: string, max: number): string {
  const characters = [...text];
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}

/** 配線から `U1.7` の形で参照できる識別子か。参照できない名前は書き間違いとして弾く。 */
export const isReferenceable = (name: string): boolean => /^[\w-]+$/.test(name) && name.length <= LIMITS.idLength;

/** ピン名は空白を含まない短い名前 (`V+` `1-` `GND` など)。 */
export const isPinName = (name: string): boolean =>
  name.length > 0 && name.length <= LIMITS.pinNameLength && !/\s/.test(name);

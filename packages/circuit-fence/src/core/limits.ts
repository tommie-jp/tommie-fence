/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 検証と TeX 生成は同期処理なので、上限が無いと 1 枚のフェンスで拡張ホストを
 * 止められてしまう。実在の回路には十分な余裕を取ったうえで必ず頭を打たせる。
 */
export const LIMITS = {
  parts: 200,
  wires: 500,
  /**
   * 番地の列の上限。行は英字 1 文字なので a〜z の 26 行で頭が決まるが、
   * 列は数字なので上限を書かないと 1 行で巨大な図を作れてしまう。
   */
  columns: 99,
  idLength: 32,
  /** `10k` `100n` のような値。単位を綴った書き方まで許してもこの長さで足りる。 */
  valueLength: 24,
  /**
   * グリッドに描く点の数。1 点ごとに TeX の図形が 1 つ増えるので、
   * 上限が無いと `grid-to: z99` (2574 点) のような 1 行で描画が 10 秒を超え、
   * 描画は 1 枚ずつなので同じノートの他の図まで待たされる (実測で確認)。
   */
  gridCells: 600,
} as const;

/** 配線から `R1` `U1.out` の形で参照できる識別子か。参照できない名前は書き間違いとして弾く。 */
export const isReferenceable = (name: string): boolean => /^[\w-]+$/.test(name) && name.length <= LIMITS.idLength;

/**
 * `style:` に書ける大きさの範囲。図として成立する値に収める。
 * width の上限は、フェンス 1 つで巨大なラスタ画像を作らせないための頭打ちでもある。
 */
export const STYLE_RANGES = {
  /** 1 マスの大きさ (cm)。部品 1 個が収まる下限と、紙からはみ出さない上限。 */
  pitch: { min: 0.5, max: 5 },
  /** 線の太さ (pt)。 */
  wireWidth: { min: 0.2, max: 4 },
  /** 出力の横ドット数。 */
  width: { min: 120, max: 4000 },
} as const;

export type StyleRange = { readonly min: number; readonly max: number };

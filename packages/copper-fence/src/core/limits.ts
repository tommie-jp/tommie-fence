/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 描画は同期処理なので、上限が無いと 1 枚のフェンスで拡張ホストを止められる。
 *
 * **上限を置いていない数はいつか無限になる** (perfboard の Phase 3 で踏んだ)。
 * mm の座標も、数えられるもの (形・点・部品) も、全部ここで頭を打たせる。
 */
export const LIMITS = {
  /** 報告に添える行の中身の長さ。長い行を丸ごと載せると帯が読めなくなる。 */
  snippetLength: 120,
  /** 識別子の長さ。報告に載せる綴りの切り詰めにも使う。 */
  idLength: 32,
  /**
   * 板の辺の長さ (mm)。**200mm でも 1,575px** — 手で切る銅張り基板
   * (サンハヤト 31R は 100×75mm) を十分に超える。下は SMA の台座が載る幅。
   */
  boardMin: 5,
  boardMax: 200,
  /** 基材の厚さ (mm) と比誘電率の範囲。外は書き間違い (`h: 16` など)。 */
  hMin: 0.1,
  hMax: 10,
  erMin: 1,
  erMax: 20,
  /** 板の外へ出してよい距離 (mm)。注釈と SMA の胴が書ければ足りる。 */
  offBoard: 20,
  /** `copper:` に置ける形の数と、折れ線 1 本の点の数。 */
  copper: 200,
  polylinePoints: 20,
  /** 線路の幅・隙間・島の辺 (mm)。 */
  sizeMin: 0.05,
  sizeMax: 100,
  /** 板に載せられる部品の数と、箱 1 つの足の数。 */
  parts: 100,
  boxPins: 64,
  /** 引ける配線 (島どうしのジャンパ) の本数。 */
  wires: 200,
  /** 図に出る値・ラベルの長さ。 */
  labelLength: 60,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 注釈の数と、1 つの字数。 */
  notes: 200,
  noteLength: 60,
  /** `- source` が図に書き出すフェンスの行数と、1 行の長さ (perfboard と同じ値)。 */
  sourceLines: 1000,
  sourceLineLength: 160,
} as const;

/**
 * **手で切れる細さ** (mm)。カッターの刃で残せる線・切れる溝はこのくらいまで。
 * これより細い形は正しい図 (エッチングの寸法) のこともあるので、止めずに言う。
 */
export const HAND_CUT = 0.3;

/** 選べるテーマ。**既定は light**。 */
export const THEME_NAMES = ['light', 'dark', 'mono'] as const;

/** `style:` に書ける大きさの範囲。図として成立する幅に収める。 */
export const STYLE_RANGES = {
  width: { min: 120, max: 4000 },
} as const;

/** 配線から `P1` の形で参照できる名前か。参照できない名前は書き間違いとして弾く。 */
export const isReferenceable = (name: string): boolean =>
  /^[\w-]+$/.test(name) && name.length > 0 && name.length <= LIMITS.idLength;

/** 図に載る文字の長さを切る。サロゲートペアを割らないようコードポイントで数える。 */
export function clampText(text: string, max: number): string {
  const characters = [...text];
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}

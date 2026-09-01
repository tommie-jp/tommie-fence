/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 描画は同期処理なので、上限が無いと 1 枚のフェンスで拡張ホストを止められる。
 *
 * **Phase 0 に要るものだけ**を置いている。部品・配線の上限は
 * それを読むようになった Phase で足す (先回りしない)。
 */
export const LIMITS = {
  /** 報告に添える行の中身の長さ。長い行を丸ごと載せると帯が読めなくなる。 */
  snippetLength: 120,
  /** 識別子の長さ。報告に載せる綴りの切り詰めにも使う。 */
  idLength: 32,
  /**
   * 板の大きさの上限。実在する一番大きい板 (秋月 A タイプ 155×114mm) でも
   * 61 × 44 穴なので十分な余裕がある。上限が無いと、フェンス 1 つで
   * 巨大な SVG を作らせられる。
   */
  cols: 120,
  rows: 120,
  /** 板に載せられる部品の数。実在の基板を大きく超えているが、必ず頭を打たせる。 */
  parts: 200,
  /** 図に出る値・ラベルの長さ。 */
  labelLength: 60,
  /** 引ける配線の本数。全穴独立なので、ブレッドボードより線は多くなる。 */
  wires: 500,
  /** `points:` に置ける名前の数。 */
  points: 100,
  /** 図の題の長さ。 */
  titleLength: 60,
  /** 板の外の機器 1 つが持てる足の数と、足の名前の長さ。 */
  devicePins: 64,
  pinNameLength: 24,
  /** 注釈の数と、1 つの字数。 */
  notes: 200,
  noteLength: 60,
} as const;

/** 選べるテーマ。**既定は light**。 */
export const THEME_NAMES = ['light', 'dark', 'mono'] as const;

/** `style:` に書ける大きさの範囲。図として成立する幅に収める。 */
export const STYLE_RANGES = {
  // 上限は、フェンス 1 つで巨大なラスタ画像を作らせないための頭打ちでもある。
  width: { min: 120, max: 4000 },
} as const;

/** 配線から `R1` の形で参照できる名前か。参照できない名前は書き間違いとして弾く。 */
export const isReferenceable = (name: string): boolean =>
  /^[\w-]+$/.test(name) && name.length > 0 && name.length <= LIMITS.idLength;

/** 足の名前は空白を含まない短い名前 (`V+` `1-` `GND` など)。 */
export const isPinName = (name: string): boolean =>
  name.length > 0 && name.length <= LIMITS.pinNameLength && !/\s/.test(name);

/** 図に載る文字の長さを切る。サロゲートペアを割らないようコードポイントで数える。 */
export function clampText(text: string, max: number): string {
  const characters = [...text];
  return characters.length > max ? `${characters.slice(0, max).join('')}…` : text;
}

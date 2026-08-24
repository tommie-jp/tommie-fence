/**
 * 入力の大きさの上限。図は他人の書いたノートから渡ってくることがあり、
 * 描画は同期処理なので、上限が無いと 1 枚のフェンスでサーバーや拡張ホストを
 * 止められてしまう。実在の回路には十分な余裕を取ったうえで必ず頭を打たせる。
 */
export const LIMITS = {
  parts: 200,
  wires: 500,
  devicePins: 64,
  pinNameLength: 24,
  idLength: 32,
  labelLength: 60,
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

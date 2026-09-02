import { colorHint, isColor } from '../color.ts';
import { fenceError, safeToken } from '../errors.ts';
import type { Parsed } from './parts.ts';

/** 配線 1 本の書き方: `b7 -- c5` に、色を足せる。 */
const WIRE = /^(\S+)\s*--\s*(\S+)(?:\s+(\S+))?$/;

export type WrittenWire = { readonly from: string; readonly to: string; readonly color: string | null };

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

/**
 * `b7 -- c5 red` のような 1 行を読む。
 *
 * **端が番地か名前かはここでは決めない。** `points:` はフェンスのどこに書いても
 * よいので、全部読み終えてからでないと名前を引けない (解決は wiring/ の仕事)。
 */
export function parseWireLine(line: string): Parsed<WrittenWire> {
  const trimmed = line.trim();
  const found = WIRE.exec(trimmed);
  if (!found) {
    return fail(`配線は \`穴 -- 穴\` の形で書きます (例: b7 -- c5): ${safeToken(trimmed)}`);
  }

  const [, from = '', to = '', color] = found;
  if (color === undefined) return { ok: true, value: { from, to, color: null } };

  // **知らない色を素通ししない。** 色は stroke 属性へ流れるので、
  // 持っている名前か `#RRGGBB` の綴りだけを通す関門をここに置く。
  if (!isColor(color)) {
    return fail(`知らない配線の色です: ${safeToken(color)} (${colorHint()})`, color);
  }
  return { ok: true, value: { from, to, color: color.toLowerCase() } };
}

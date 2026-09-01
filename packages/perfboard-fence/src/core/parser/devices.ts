import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, clampText, isPinName, isReferenceable } from '../limits.ts';
import type { DeviceSpec, DeviceSide } from '../types.ts';
import type { Parsed } from './parts.ts';

/**
 * 板の外の機器 (電池・スピーカー・測定器)。**盤面には載らない**ので、
 * 部品ではなく別に持つ。配線からは `BAT.+` の形で指す。
 *
 * 書き方は入れ子 — 1 行に畳めない情報 (足の名前の並び) を持つため。
 */

const SIDES: readonly DeviceSide[] = ['top', 'bottom'];
const KEYS = ['type', 'at', 'label', 'pins'] as const;

const fail = (message: string, token?: string): Parsed<never> =>
  ({ ok: false, error: fenceError(message, null, token) });

export function parseDevice(id: string, entries: Record<string, unknown>): Parsed<DeviceSpec> {
  if (!isReferenceable(id)) {
    return fail(`機器の名前に使えません: ${safeToken(id)}`, id);
  }

  for (const key of Object.keys(entries)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      return fail(`知らない機器の項目です: ${safeToken(key)} (${KEYS.join(' / ')})`, key);
    }
  }

  // **入れ子なら機器、にしない。** 部品を書き間違えて字下げした人が、
  // 板の外に箱が出ているのを見て気づけないまま終わる。
  if (entries.type !== 'device') {
    const written = entries.type === undefined ? '(書かれていません)' : String(entries.type);
    return fail(
      `入れ子で書けるのは板の外の機器だけです: ${safeToken(id)} の type に device と書きます (いまは ${safeToken(written)})`,
      entries.type === undefined ? undefined : written,
    );
  }

  const at = entries.at ?? 'top';
  if (typeof at !== 'string' || !SIDES.includes(at as DeviceSide)) {
    return fail(`機器を置ける側は ${SIDES.join(' / ')} です: ${safeToken(String(at))}`, String(at));
  }

  const label = entries.label === undefined ? id : entries.label;
  if (typeof label !== 'string') return fail(`${safeToken(id)} の label は文字で書きます`);

  // **`pins: + -` と書ける。** YAML の並びに書くと `-` が箱の始まりに読まれて
  // `pins: ["+", "-"]` と括らされる — 電池の端子を書くたびに引っかかる罠なので、
  // 空白で区切った 1 行も受ける。
  const pins = typeof entries.pins === 'string'
    ? entries.pins.trim().split(/\s+/).filter((name) => name !== '')
    : entries.pins;
  if (!Array.isArray(pins) || pins.length === 0) {
    // **足が無い機器は配線の相手にならない。** 置いても図に箱が出るだけ。
    return fail(`${safeToken(id)} には足の名前を pins: + - のように書きます`);
  }
  if (pins.length > LIMITS.devicePins) {
    return fail(`${safeToken(id)} の足が多すぎます (${LIMITS.devicePins} 本まで)`);
  }

  const names: string[] = [];
  for (const pin of pins) {
    const name = typeof pin === 'number' ? String(pin) : pin;
    if (typeof name !== 'string' || !isPinName(name)) {
      return fail(`${safeToken(id)} の足の名前に使えません: ${safeToken(String(pin))}`, String(pin));
    }
    // 同じ名前が 2 つあると、配線がどちらを指すのか決まらない。
    if (names.includes(name)) return fail(`${safeToken(id)} の足の名前が重なっています: ${safeToken(name)}`, name);
    names.push(name);
  }

  return {
    ok: true,
    value: {
      id, at: at as DeviceSide, label: clampText(label, LIMITS.labelLength), pins: names, line: null,
    },
  };
}

import { resolveDeviceModel } from 'fence-kit';
import { fenceError, safeToken } from '../errors.ts';
import { LIMITS, clampText, isPinName, isReferenceable } from '../limits.ts';
import { isAddressSpelling } from '../model/address.ts';
import type { DeviceSpec, DeviceSide } from '../types.ts';
import type { Parsed } from './parts.ts';

/**
 * 基板の外の機器 (電池・スピーカー・測定器)。**盤面には載らない**ので、
 * 部品ではなく別に持つ。配線からは `BAT.+` の形で指す。
 *
 * 書き方は入れ子 — 1 行に畳めない情報 (ピンの名前の並び) を持つため。
 */

const SIDES: readonly DeviceSide[] = ['top', 'bottom'];
const KEYS = ['type', 'at', 'label', 'model', 'pins'] as const;

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
  // 基板の外に箱が出ているのを見て気づけないまま終わる。
  if (entries.type !== 'device') {
    const written = entries.type === undefined ? '(書かれていません)' : String(entries.type);
    return fail(
      `入れ子で書けるのは基板の外の機器だけです: ${safeToken(id)} の type に device と書きます (いまは ${safeToken(written)})`,
      entries.type === undefined ? undefined : written,
    );
  }

  // **`at:` は側か番地。** 番地で書けば、基板の外の好きな場所に置ける
  // (`-e1` のように基板の上、`n5` のように基板の下)。箱の左上がその番地に来る。
  const at = entries.at ?? 'top';
  if (typeof at !== 'string') {
    return fail(`機器を置ける側は ${SIDES.join(' / ')} か番地です: ${safeToken(String(at))}`, String(at));
  }
  const side = SIDES.includes(at as DeviceSide) ? (at as DeviceSide) : null;
  const where = side === null ? at : null;
  if (where !== null && !isAddressSpelling(where)) {
    return fail(
      `機器を置ける側は ${SIDES.join(' / ')} か番地です: ${safeToken(where)}`,
      where,
    );
  }

  // **機器の型番 (`model:`)。** 表からピンの名前を引く。label を書かなければ箱の名前は型番。
  const model = entries.model === undefined ? null : typeof entries.model === 'number' ? String(entries.model) : entries.model;
  if (model !== null && (typeof model !== 'string' || model.trim() === '')) {
    return fail(`${safeToken(id)} の model は型番の字で書きます`);
  }
  const label = entries.label === undefined ? (model ?? id) : entries.label;
  if (typeof label !== 'string') return fail(`${safeToken(id)} の label は文字で書きます`);

  // **`pins: + -` と書ける。** YAML の並びに書くと `-` が箱の始まりに読まれて
  // `pins: ["+", "-"]` と括らされる — 電池の端子を書くたびに引っかかる罠なので、
  // 空白で区切った 1 行も受ける。
  const writtenPins = typeof entries.pins === 'string'
    ? entries.pins.trim().split(/\s+/).filter((name) => name !== '')
    : entries.pins;
  const fromModel = model === null ? null : modelPins(model, writtenPins);
  if (fromModel !== null && !fromModel.ok) return fail(fromModel.message, fromModel.token);
  const pins = fromModel === null ? writtenPins : fromModel.names;
  if (!Array.isArray(pins) || pins.length === 0) {
    // **ピンが無い機器は配線の相手にならない。** 置いても図に箱が出るだけ。
    return fail(`${safeToken(id)} にはピンの名前を pins: + - のように書きます`);
  }
  if (pins.length > LIMITS.devicePins) {
    return fail(`${safeToken(id)} のピンが多すぎます (${LIMITS.devicePins} 本まで)`);
  }

  const names: string[] = [];
  for (const pin of pins) {
    const name = typeof pin === 'number' ? String(pin) : pin;
    if (typeof name !== 'string' || !isPinName(name)) {
      return fail(`${safeToken(id)} のピンの名前に使えません: ${safeToken(String(pin))}`, String(pin));
    }
    // 同じ名前が 2 つあると、配線がどちらを指すのか決まらない。
    if (names.includes(name)) return fail(`${safeToken(id)} のピンの名前が重なっています: ${safeToken(name)}`, name);
    names.push(name);
  }

  return {
    ok: true,
    value: {
      id,
      // 番地で置いたときの向きは、基板のどちら側に来るかで決まる (図を組むときに見る)。
      at: side ?? 'top',
      where,
      label: clampText(label, LIMITS.labelLength),
      pins: names,
      line: null,
    },
  };
}

/**
 * 型番からピンを決める。`pins:` が無ければ表の全部、あれば書いた名前だけ (表に無い名前は断る。
 * fence-kit の `resolveDeviceModel`。ほかの 2 つのフェンスと同じ決まり)。
 */
function modelPins(model: string, written: unknown) {
  if (written === undefined) return resolveDeviceModel(model, null);
  if (!Array.isArray(written)) return { ok: false as const, message: 'pins はピンの名前を並べて書きます', token: String(written) };
  return resolveDeviceModel(model, written.map((pin) => String(pin)));
}

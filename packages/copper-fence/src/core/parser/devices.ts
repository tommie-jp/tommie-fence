import { safeToken } from '../errors.ts';
import { LIMITS, clampText, isPinName } from '../limits.ts';
import { parsePoint, pointProblem } from '../model/point.ts';
import type { DeviceSpec, Side } from '../types.ts';
import { fail, ok } from './result.ts';
import type { LineResult } from './result.ts';

/**
 * 板の外の機器 (電源・測定器・マイク・アンテナ線)。**板には載らない**ので、
 * 部品ではなく別に持つ。配線からは `BAT.+` の形で指す (perfboard と同じ綴り)。
 *
 * 書き方は入れ子 — 足の名前の並びを持つので 1 行に畳めない。perfboard との違いは
 * 位置: 板に格子が無いので `at:` は **mm の点で、箱の中心**。
 */
const KEYS = ['type', 'at', 'label', 'pins', 'face'] as const;
const FACES: readonly Side[] = ['left', 'right', 'top', 'bottom'];

/** `pins: + -` と書ける (YAML の並びの `- ` が箱の始まりに読まれる罠を避ける)。 */
function pinList(raw: unknown): readonly unknown[] | null {
  if (typeof raw === 'string') return raw.trim().split(/\s+/).filter((name) => name !== '');
  return Array.isArray(raw) ? raw : null;
}

function readPins(id: string, raw: unknown): LineResult<readonly string[]> {
  const pins = pinList(raw);
  if (pins === null || pins.length === 0) {
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
    if (names.includes(name)) return fail(`${safeToken(id)} の足の名前が重なっています: ${safeToken(name)}`, name);
    names.push(name);
  }
  return ok(names);
}

export function parseDevice(id: string, entries: Record<string, unknown>): LineResult<Omit<DeviceSpec, 'line'>> {
  for (const key of Object.keys(entries)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      return fail(`知らない機器の項目です: ${safeToken(key)} (${KEYS.join(' / ')})`, key);
    }
  }
  // **入れ子なら機器、にしない。** 部品を書き間違えて字下げした人が、板の外に箱が出ているのを
  // 見て気づけないまま終わる。
  if (entries.type !== 'device') {
    const written = entries.type === undefined ? '(書かれていません)' : String(entries.type);
    return fail(
      `入れ子で書けるのは板の外の機器だけです: ${safeToken(id)} の type に device と書きます (いまは ${safeToken(written)})`,
      entries.type === undefined ? undefined : written,
    );
  }

  const written = entries.at;
  if (typeof written !== 'string') {
    return fail(`${safeToken(id)} の at に箱の中心を x,y (mm) で書きます (例: at: -12,20)`);
  }
  const at = parsePoint(written);
  if (at === null) {
    return fail(pointProblem(written) ?? `at として読めません: ${safeToken(written)} (x,y を mm で。例: at: -12,20)`, written);
  }

  const label = entries.label ?? id;
  if (typeof label !== 'string') return fail(`${safeToken(id)} の label は文字で書きます`);

  const face = typeof entries.face === 'string' ? entries.face.toLowerCase() : entries.face;
  if (face !== undefined && !(FACES as readonly unknown[]).includes(face)) {
    return fail(`face は ${FACES.join(' / ')} で書きます: ${safeToken(String(face))}`, String(face));
  }

  const pins = readPins(id, entries.pins);
  if (!pins.ok) return pins;
  return ok({
    id,
    at,
    label: clampText(label, LIMITS.labelLength),
    pins: pins.value,
    face: (face as Side | undefined) ?? null,
  });
}

import { safeToken } from '../errors.ts';
import { LIMITS, clampText, isPinName } from '../limits.ts';

/**
 * 部品を複数行のマップで書くときの形。
 * 1 行記法では表せないもの (ピン名を並べるボード外の機器など) に使う。
 */
export type ExpandedPart = {
  readonly type: string;
  readonly at: 'top' | 'bottom' | null;
  readonly label: string | null;
  readonly value: string | null;
  readonly pins: readonly string[] | null;
  readonly holes: readonly string[];
};

/**
 * `notes` は**描けたが使われなかった指定**の理由。読めた部分を捨てずに残したうえで、
 * 黙って落としたものを行番号つきで言うために返す (`style` の messages と同じ立て付け)。
 */
export type Validation =
  | { readonly ok: true; readonly value: ExpandedPart; readonly notes: readonly string[] }
  | { readonly ok: false; readonly message: string };

const KNOWN_KEYS = ['type', 'at', 'label', 'value', 'pins', 'holes'] as const;

const invalid = (message: string): Validation => ({ ok: false, message });

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const asText = (raw: unknown): string | null =>
  typeof raw === 'string' ? raw : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : null;

const asTextList = (raw: unknown): readonly string[] | null => {
  if (!Array.isArray(raw)) return null;
  const texts = raw.map(asText);
  return texts.every((item): item is string => item !== null) ? texts : null;
};

/**
 * 手書きの検証。スキーマライブラリを入れると圧縮後でも数百 KB 増え、
 * 拡張のバンドルにも他アプリへの埋め込みにも重いので、6 項目は自前で見る。
 */
export function validateExpandedPart(raw: unknown): Validation {
  if (!isRecord(raw)) return invalid('内容はマップ (key: value の並び) で書きます');

  const unknownKey = Object.keys(raw).find((key) => !KNOWN_KEYS.includes(key as (typeof KNOWN_KEYS)[number]));
  if (unknownKey !== undefined) {
    return invalid(`知らない項目です: ${safeToken(unknownKey)} (使えるのは ${KNOWN_KEYS.join(', ')})`);
  }

  const type = typeof raw.type === 'string' ? raw.type : null;
  if (type === null) return invalid('type に部品の種類を書きます');

  if (raw.at !== undefined && raw.at !== 'top' && raw.at !== 'bottom') {
    return invalid('at は top か bottom です');
  }

  const label = raw.label === undefined ? null : asText(raw.label);
  if (raw.label !== undefined && label === null) return invalid('label は文字列です');

  const value = raw.value === undefined ? null : asText(raw.value);
  if (raw.value !== undefined && value === null) return invalid('value は文字列です');

  const pins = raw.pins === undefined ? null : asTextList(raw.pins);
  if (raw.pins !== undefined && pins === null) return invalid('pins はピン名の配列です');
  if (pins && pins.length > LIMITS.devicePins) return invalid(`pins は ${LIMITS.devicePins} 本までです`);
  const repeated = pins?.find((pin, index) => pins.indexOf(pin) !== index);
  if (repeated !== undefined) return invalid(`ピン名 ${safeToken(repeated)} が 2 回出てきます`);
  const badPin = pins?.find((pin) => !isPinName(pin));
  if (badPin !== undefined) {
    return invalid(
      `ピン名 ${safeToken(badPin)} は使えません (空白を含まない ${LIMITS.pinNameLength} 文字までの名前)`,
    );
  }

  const holes = raw.holes === undefined ? [] : asTextList(raw.holes);
  if (holes === null) return invalid('holes は穴番地の配列です');

  // 機器の値は図のどこにも出ない (`render/devices.ts` の captionOf は `label ?? id`、
  // 部品リストの valueOf も機器はラベルしか見ない)。受理だけして黙って捨てると
  // 書いた人には何も伝わらないので、機器は描いたまま値だけを落として理由を返す。
  const notes: string[] = [];
  const drops = type === 'device' && value !== null;
  if (drops) notes.push('機器 (device) に value は使いません。箱に出す名前は label に書きます');
  const kept = drops ? null : value;

  return {
    ok: true,
    notes,
    value: {
      type,
      at: raw.at ?? null,
      label: label === null ? null : clampText(label, LIMITS.labelLength),
      value: kept === null ? null : clampText(kept, LIMITS.labelLength),
      pins,
      holes,
    },
  };
}

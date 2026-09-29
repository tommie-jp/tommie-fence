import { smdSpelling, smdTable } from 'fence-kit';
import type { SmdSpec } from 'fence-kit';

/**
 * copper の部品の種類と姿。**綴りは perfboard と同じ** — 同じ部品を 2 つの板で
 * 同じ字で書ける。違うのは置き方だけで、面実装は点 1 つ、足のある部品は端 2 つ、
 * 同軸は板の辺。
 *
 * **面実装の寸法は fence-kit の表 (mm) をそのまま引く** (52 の docs/64)。
 * この板は mm で描くので、換算すら要らない。
 */

/** 足のある 2 本足 (島から島へ渡す)。perfboard の 2 本足から、板の縁に付く物を除いた。 */
const LEADED = new Set([
  'resistor', 'capacitor', 'led', 'diode', 'inductor', 'crystal', 'buzzer',
  'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
  'zener', 'schottky', 'photodiode', 'varicap', 'diac', 'phototransistor',
  'reed', 'fuse', 'lamp',
]);

/** 足のある部品の姿。**perfboard と同じ表** (描き分けは fence-kit の胴が持つ)。 */
const LEADED_LOOKS: Readonly<Record<string, readonly string[]>> = {
  capacitor: ['ceramic', 'film', 'electrolytic', 'tantalum'],
  resistor: ['quarter', 'half'],
  diode: ['do35', 'do41'],
  zener: ['do35', 'do41'],
  schottky: ['do35', 'do41'],
  inductor: ['axial', 'radial'],
  led: ['3mm', '5mm'],
  phototransistor: ['3mm', '5mm'],
  crystal: ['hc49', 'cylinder'],
};

/**
 * 面実装の種類。**表の種類の欄より広い** — RF の板ではチップのコイルとフェライト
 * ビーズ (`bead`) を普通に使い、SOT-89 には MMIC (`ic3`) が載る (本の 4-18・8-6)。
 */
const SMD_TYPES: Readonly<Record<'chip' | 'leaded' | 'sot', readonly string[]>> = {
  chip: ['resistor', 'capacitor', 'inductor', 'bead', 'led'],
  leaded: ['diode', 'zener', 'schottky', 'varicap'],
  sot: ['transistor', 'ic3', 'regulator'],
};

/**
 * 足が 3〜4 本の部品 (島から島へ足を渡す)。**足の名前は並びの順** — 端を書く順でもある。
 * `transistor` と `regulator` は面実装 (SOT) も持つので、姿が下の表にあるときだけここへ来る。
 * 書かなければ表の最初の姿。
 *
 * `mmic` は 4 本足の MMIC アンプ (SOT-89: 1 番 IN、2 番 GND、3 番 OUT、タブの 4 番も GND)。
 * 足の名前は本の 8-6 (MMIC LNA) の表記に揃え、2 本目の GND は `GND2`。
 */
type MultiDef = { readonly pins: readonly string[]; readonly looks: readonly string[] };

const MULTI: Readonly<Record<string, MultiDef>> = {
  transistor: { pins: ['B', 'C', 'E'], looks: ['to92', 'to220'] },
  mosfet: { pins: ['G', 'D', 'S'], looks: ['to92', 'to220'] },
  regulator: { pins: ['IN', 'GND', 'OUT'], looks: ['to92', 'to220'] },
  mmic: { pins: ['IN', 'GND', 'OUT', 'GND2'], looks: ['sot89'] },
};

/** 多足の部品か。 */
export const isMulti = (type: string): boolean => Object.hasOwn(MULTI, type);

/** 多足の足の名前 (端を書く順)。 */
export const multiPins = (type: string): readonly string[] => MULTI[type]?.pins ?? [];

/** 多足の姿 (先頭が既定)。 */
export const multiLooks = (type: string): readonly string[] => MULTI[type]?.looks ?? [];

/** 略記。**perfboard と同じ** (畳んだ先の正式名しか出口には出ない)。 */
const ALIASES: Readonly<Record<string, string>> = {
  r: 'resistor',
  c: 'capacitor',
  l: 'inductor',
  d: 'diode',
  q: 'transistor',
  tr: 'transistor',
  reg: 'regulator',
  xtal: 'crystal',
  ec: 'capacitor/electrolytic',
  ecap: 'capacitor/electrolytic',
};

/** 端面の同軸。**書かなければメス** (板に付くのはたいていメス)。 */
export const SMA_LOOKS = ['female-edge', 'male-edge'] as const;

/** 箱 (SAW・缶・モジュール)。 */
export const BOX = 'box';

const SMD: ReadonlyMap<string, SmdSpec> = new Map(smdTable());

export type Kind =
  | { readonly kind: 'edge'; readonly type: 'sma'; readonly variant: string }
  | { readonly kind: 'chip'; readonly type: string; readonly variant: string; readonly spec: SmdSpec }
  | { readonly kind: 'sot'; readonly type: string; readonly variant: string; readonly spec: SmdSpec }
  | { readonly kind: 'box'; readonly type: 'box'; readonly variant: null }
  | { readonly kind: 'leaded'; readonly type: string; readonly variant: string | null }
  | { readonly kind: 'multi'; readonly type: string; readonly variant: string };

export type KindResult = { readonly ok: true; readonly value: Kind } | { readonly ok: false; readonly reason: string };

/** 書ける種類 (文書と `知らない種類` の文面に出す)。 */
export const typeNames = (): readonly string[] =>
  ['sma', BOX, ...new Set([...SMD_TYPES.chip, ...SMD_TYPES.leaded, ...SMD_TYPES.sot, ...Object.keys(MULTI), ...LEADED])];

/** 面実装の姿の見出し (`1608` `sot89`)。表の並び。 */
export const smdKeys = (kind: 'chip' | 'leaded' | 'sot'): readonly string[] =>
  smdTable().filter(([, spec]) => spec.kind === kind).map(([key]) => key);

/** 面実装の寸法を見出しで引く。 */
export const smdSpecOf = (key: string): SmdSpec | null => SMD.get(key) ?? null;

/** `種類[/姿]` を種類に直す。 */
export function resolveKind(written: string): KindResult {
  const lower = written.toLowerCase();
  const expanded = Object.hasOwn(ALIASES, lower) ? ALIASES[lower] ?? lower : lower;
  const slash = expanded.indexOf('/');
  const head = slash < 0 ? expanded : expanded.slice(0, slash);
  const type = Object.hasOwn(ALIASES, head) ? ALIASES[head] ?? head : head;
  const variant = slash < 0 ? null : expanded.slice(slash + 1);

  if (type === 'sma') {
    if (variant === null) return { ok: true, value: { kind: 'edge', type: 'sma', variant: 'female-edge' } };
    if ((SMA_LOOKS as readonly string[]).includes(variant)) {
      return { ok: true, value: { kind: 'edge', type: 'sma', variant } };
    }
    return {
      ok: false,
      reason: `銅張り基板の SMA は端面実装です (sma/female-edge か sma/male-edge。書かなければ female-edge): ${variant}`,
    };
  }
  if (type === BOX) {
    return variant === null
      ? { ok: true, value: { kind: 'box', type: 'box', variant: null } }
      : { ok: false, reason: `box に姿はありません: ${variant}` };
  }

  if (isMulti(type) && (variant === null || multiLooks(type).includes(variant))) {
    return { ok: true, value: { kind: 'multi', type, variant: variant ?? multiLooks(type)[0] ?? '' } };
  }
  if (isMulti(type) && !SMD_TYPES.sot.includes(type)) {
    return { ok: false, reason: `${type} の姿は ${multiLooks(type).join(' / ')} です: ${variant}` };
  }

  if (variant !== null) {
    const spec = smdSpecOf(variant);
    if (spec !== null) {
      if (spec.kind === 'row') return { ok: false, reason: `${variant} は box で書きます (例: U1: box 20,10 5x4mm 8)` };
      const allowed = SMD_TYPES[spec.kind];
      if (!allowed.includes(type)) {
        return { ok: false, reason: `${variant} に載る種類は ${allowed.join(' / ')} です: ${type}` };
      }
      return spec.kind === 'sot'
        ? { ok: true, value: { kind: 'sot', type, variant, spec } }
        : { ok: true, value: { kind: 'chip', type, variant, spec } };
    }
    // 別名 (`0603` `s-mini`) と変換基板 (`sot346-dip`) は**綴りとしては受けず**、
    // 書き直し先を言う (perfboard と同じ流儀)。この板に変換基板は無いので `-dip` は落とす。
    const spelled = smdSpelling(variant)?.replace(/-dip$/, '') ?? null;
    if (spelled !== null && spelled !== variant && smdSpecOf(spelled) !== null) {
      return { ok: false, reason: `${variant} は ${spelled} と書きます (${type}/${spelled})` };
    }
  }

  if (!LEADED.has(type)) {
    if (Object.values(SMD_TYPES).some((types) => types.includes(type))) {
      const keys = type === 'transistor' || type === 'ic3' || type === 'regulator'
        ? smdKeys('sot')
        : [...smdKeys('chip'), ...smdKeys('leaded')];
      const looks = isMulti(type) ? [...multiLooks(type), ...keys] : keys;
      return { ok: false, reason: `${type} は姿を書きます (${looks.map((key) => `${type}/${key}`).slice(0, 4).join(' / ')} …)` };
    }
    return { ok: false, reason: `知らない種類です: ${written}` };
  }
  if (variant === null) return { ok: true, value: { kind: 'leaded', type, variant: null } };
  const looks = LEADED_LOOKS[type] ?? [];
  if (!looks.includes(variant)) {
    const smd = [...smdKeys('chip'), ...smdKeys('leaded')]
      .filter((key) => (smdSpecOf(key)?.kind === 'chip' ? SMD_TYPES.chip : SMD_TYPES.leaded).includes(type));
    const all = [...looks, ...smd];
    return all.length === 0
      ? { ok: false, reason: `${type} に姿は書けません: ${variant}` }
      : { ok: false, reason: `${type} の姿は ${all.join(' / ')} です: ${variant}` };
  }
  return { ok: true, value: { kind: 'leaded', type, variant } };
}

/** 極性のある 2 本足か (先に書いた端がアノード)。 */
export const isPolar = (type: string): boolean =>
  ['led', 'diode', 'zener', 'schottky', 'varicap', 'photodiode'].includes(type);

/**
 * 置ける部品の語彙。**Phase 2 は 2 本足だけ。** 3 本足・DIP・SIP は次の Phase で、
 * 置けないものは「知らないふり」ではなく**置けないと言う**。
 *
 * 正式名は一般英語名で 1 つに保ち、略記は入口だけで畳む
 * (図・部品リスト・ネットリスト・エラーには正式名しか出ない)。
 * circuit-fence / breadboard-fence と同じ綴りに揃えてあるので、
 * 同じノートで 2 つのフェンスを書くときに語彙が 1 つで済む。
 */

/** 2 本足の部品。ここに無い種類は「置けません」と言う。 */
const TWO_LEAD = new Set([
  'resistor', 'capacitor', 'led', 'diode', 'inductor', 'crystal', 'buzzer',
  // 抵抗体を固めた部品。値は抵抗なのでキャプションの読み方も抵抗と同じ。
  'photoresistor', 'thermistor', 'thermistor-ntc', 'thermistor-ptc', 'varistor',
  // ダイオードの仲間。実物はどれも同じ形の胴で、カソード帯の位置が意味を持つ。
  'zener', 'schottky', 'photodiode',
  // ガラス管・玉に封じた部品。
  'fuse', 'lamp',
]);

/** まだ置けないが、名前は知っている種類。「知らない」と言うと綴りを疑わせてしまう。 */
const NOT_YET = new Set([
  'transistor', 'potentiometer', 'slide-switch', 'thyristor', 'triac', 'button', 'device',
]);

const ALIASES: Record<string, string> = {
  r: 'resistor',
  c: 'capacitor',
  l: 'inductor',
  d: 'diode',
  // 姿まで含む略記。電解コンデンサは種類ではなく `capacitor` の姿なので、
  // 略記 1 語が「種類 + 姿」に開く唯一の形になる。
  ec: 'capacitor/electrolytic',
  ecap: 'capacitor/electrolytic',
  ldr: 'photoresistor',
  ntc: 'thermistor-ntc',
  ptc: 'thermistor-ptc',
  xtal: 'crystal',
};

/** 種類ごとに選べる姿。ここに無い種類には `/…` を書けない。 */
const VARIANTS: Record<string, readonly string[]> = {
  capacitor: ['ceramic', 'film', 'electrolytic', 'tantalum'],
  led: ['3mm', '5mm'],
};

const own = (table: Record<string, unknown>, key: string): boolean => Object.hasOwn(table, key);

export const isTwoLead = (type: string): boolean => TWO_LEAD.has(type);
export const isKnownType = (type: string): boolean => TWO_LEAD.has(type) || NOT_YET.has(type);
export const twoLeadNames = (): readonly string[] => [...TWO_LEAD];
export const knownNames = (): readonly string[] => [...TWO_LEAD, ...NOT_YET, ...Object.keys(ALIASES)];

export type PartType = {
  readonly type: string;
  readonly variant: string | null;
  /**
   * 読めたが受け取れない書き方の理由。行番号を持っているのは呼ぶ側なので、
   * ここでは文面だけ返して報告は任せる。null なら何も問題はない。
   */
  readonly problem: string | null;
};

/** `capacitor/ceramic` を種類と姿に割る。略記はここで畳む。 */
export function splitPartType(written: string): PartType {
  const lower = written.trim().toLowerCase();
  if (lower === '') return { type: '', variant: null, problem: '部品の種類が書かれていません' };

  const [head = '', ...rest] = lower.split('/');
  const expanded = own(ALIASES, head) ? ALIASES[head] ?? head : head;
  const [type = '', aliasVariant] = expanded.split('/');
  // 略記が姿まで持っているとき (`ec`)、書かれた姿があればそちらを優先する。
  const variant = rest[0] ?? aliasVariant ?? null;

  if (rest.length > 1) {
    return { type, variant: null, problem: `姿は 1 つだけ書けます (${written})` };
  }
  if (variant === undefined || variant === null) return { type, variant: null, problem: null };

  const allowed = own(VARIANTS, type) ? VARIANTS[type] ?? [] : [];
  if (!allowed.includes(variant)) {
    const hint = allowed.length === 0
      ? `${type} に姿はありません`
      : `${type} に書ける姿は ${allowed.join(' / ')} です`;
    return { type, variant: null, problem: `知らない姿です: ${variant} (${hint})` };
  }
  return { type, variant, problem: null };
}

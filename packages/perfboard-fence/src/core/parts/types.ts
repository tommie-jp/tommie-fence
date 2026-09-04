import { boardPartNames, lookupBoardPart } from 'fence-kit';
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
  'zener', 'schottky', 'photodiode', 'varicap', 'diac',
  // ガラス管・玉に封じた部品。
  'reed', 'fuse', 'lamp',
  // 回路図にあって板に無かった実物 (52 の docs/21 の手順 7)。**電池は
  // ホルダーで数える** — 板に載るのはホルダーで、電池は差し替えるもの。
  // トグルスイッチは a 接点 (`switch`) と b 接点 (`switch-nc`) で別の品。
  'battery', 'solar', 'speaker', 'mic', 'switch', 'switch-nc',
  // 同軸コネクタ。**足は中心導体と GND の 2 本**で書く (実物は GND が 4 本だが、
  // 図とネットリストで意味を持つのは「どこが中心でどこが GND か」の 2 つ)。
  'sma',
]);

/** 3 本足の部品。**足の位置は書かれたとおり** — 実物の足は曲げられる。 */
const THREE_LEAD = new Set([
  'transistor', 'potentiometer', 'thyristor', 'triac', 'slide-switch', 'regulator',
]);

/** まだ置けないが、名前は知っている種類。「知らない」と言うと綴りを疑わせてしまう。 */
const NOT_YET = new Set(['button']);

/**
 * 1 行では書けない種類。**板の外の機器は入れ子で書く** — 足の名前の並びを
 * 持つので 1 行に畳めない。知らない種類として弾くと、書き方を探しに行かせる。
 */
const NESTED = new Set(['device']);

export const isNestedType = (type: string): boolean => NESTED.has(type);

const ALIASES: Record<string, string> = {
  q: 'transistor',
  tr: 'transistor',
  pot: 'potentiometer',
  scr: 'thyristor',
  reg: 'regulator',
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
  // 実物のワット数。1/4W は 6.5mm、1/2W は 9mm ほどで、挿す穴の間隔も変わる。
  resistor: ['quarter', 'half'],
  // 小信号のガラス管 (DO-35) と、1A クラスの黒いプラスチック (DO-41)。
  diode: ['do35', 'do41'],
  zener: ['do35', 'do41'],
  schottky: ['do35', 'do41'],
  // 芯に巻いた軸物と、樹脂で固めた立てた缶 (電源用)。
  inductor: ['axial', 'radial'],
  // ねじで回す半固定と、軸の立つボリューム。
  potentiometer: ['trimmer', 'knob'],
  led: ['3mm', '5mm'],
  // 平たい缶 (HC-49) と円筒 (時計用の 32.768kHz などに多い)。輪郭がまるで違う。
  crystal: ['hc49', 'cylinder'],
  // TO-92 は丸い小信号用、TO-220 は放熱タブつき。足の並びは書かれた穴で示す。
  // `sot23-dip` は**面実装を載せた変換基板**。SOT-23 の足の間隔は 0.95mm で
  // 2.54mm の穴には届かないので、実物も変換基板に載せてから差す。
  transistor: ['to92', 'to220', 'sot23-dip'],
  thyristor: ['to92', 'to220'],
  triac: ['to92', 'to220'],
  regulator: ['to92', 'to220'],
  // オスは中心にピンが立ち、メスは中心が穴。**姿で描き分ける** —
  // 図を見て挿す人が、合う相手を取り違えないように。
  // `-edge` は端面実装 (横置き)。板の縁から**胴が外へ張り出す**。
  sma: ['male', 'female', 'male-edge', 'female-edge'],
};

/**
 * **軸物** — 胴の両端から足が出る形。足を曲げて挿すので、胴そのものより
 * 狭い間隔には入らない。ラジアル (足が同じ側から出る形。LED・コンデンサ・
 * サーミスタなど) は足の間隔が 2.54mm で作られているので、ここには入れない。
 */
const AXIAL = new Set([
  'resistor', 'diode', 'zener', 'schottky', 'photodiode', 'inductor', 'fuse',
]);

export const isAxial = (type: string): boolean => AXIAL.has(type);

const own = (table: Record<string, unknown>, key: string): boolean => Object.hasOwn(table, key);

export const isTwoLead = (type: string): boolean => TWO_LEAD.has(type);
export const isThreeLead = (type: string): boolean => THREE_LEAD.has(type);
export const isKnownType = (type: string): boolean =>
  TWO_LEAD.has(type) || THREE_LEAD.has(type) || NOT_YET.has(type) || NESTED.has(type)
  || lookupBoardPart(type) !== null;
/**
 * パレットに出す**パッケージ物**。`dipN` / `sipN` は数を選べるが、一覧に全部
 * 並べても選べないので、**実物として売られている数**だけ出す。ここに無い数も
 * 種類の欄に打てば置ける (文法は今までどおり全部読む)。breadboard と同じ表。
 */
const DIP_SIZES: readonly number[] = [4, 6, 8, 14, 16, 18, 20, 24, 28, 40];
const SIP_SIZES: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 20, 40];

/** アンカー 1 つで置く形。マップからは 1 クリックで置ける。 */
export const packageNames = (): readonly string[] => [
  ...DIP_SIZES.map((pins) => `dip${pins}`),
  ...SIP_SIZES.map((pins) => `sip${pins}`),
  // マイコンボード。**breadboard と同じ表**から出す (fence-kit)。
  ...boardPartNames(),
];

export const placeableNames = (): readonly string[] => [...TWO_LEAD, ...THREE_LEAD, ...packageNames()];

/** その種類を指せる略記 (`r` → resistor)。パレットの検索が引く。 */
export const aliasesFor = (type: string): readonly string[] =>
  Object.entries(ALIASES).filter(([, name]) => name === type).map(([alias]) => alias);

/** 略記を正式名に畳む。知らない綴りはそのまま返す (呼ぶ側が断る)。 */
export const resolveTypeName = (type: string): string => (own(ALIASES, type) ? ALIASES[type] ?? type : type);
export const knownNames = (): readonly string[] =>
  [...TWO_LEAD, ...THREE_LEAD, ...NOT_YET, ...NESTED, ...boardPartNames(), ...Object.keys(ALIASES)];

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

/**
 * 端面実装 (横置き) の姿か。**胴が足の外へ張り出す**ので、描画も当たり判定も
 * 形が変わる。判定はここ 1 か所 — 別々に持つと、図と当たり判定が食い違う。
 */
export const isEdgeMount = (type: string, variant: string | null): boolean =>
  type === 'sma' && variant !== null && variant.endsWith('-edge');

/**
 * 姿の選べる種類と、その姿。**ここに載っている姿はすべて図の形が変わる**
 * (`render/parts.ts`)。描き分けないまま姿だけ受け取ると、書いた人は違いが図に
 * 出ているつもりで終わるので、**描けない姿はここに足さない**。
 * `render/parts.test.ts` が「姿ごとに図が違う」ことを見張る。
 */
export const variantTable = (): readonly (readonly [string, readonly string[]])[] =>
  Object.entries(VARIANTS).map(([type, looks]) => [type, looks] as const);

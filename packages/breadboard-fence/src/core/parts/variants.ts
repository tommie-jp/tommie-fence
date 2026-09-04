/**
 * 部品の姿 (パッケージ)。**種類が電気的な役割、姿が実物のかたち**で、
 * 同じ `capacitor` でもセラミックと電解では板の上の姿が違う。
 * フェンスには `capacitor/ceramic` のように種類に続けて書く。
 *
 * 色は種類のもの、形が姿のもの、と決めてある。図の中で
 * 「コンデンサだ」と分かるのは色、「どのコンデンサか」は形で読ませる。
 */

import { resolveAlias } from './aliases.ts';

export type PartType = {
  readonly type: string;
  readonly variant: string | null;
  /**
   * 読めたが受け取れない書き方の理由。行番号を持っているのは呼ぶ側なので、
   * ここでは文面だけ返して報告は任せる。null なら何も問題はない。
   */
  readonly problem: string | null;
};

/**
 * 種類ごとに選べる姿。ここに無い種類には `/…` を書けない。
 * 描き分けられない姿を黙って受け取ると、実物と違うかたちの図になるため。
 */
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
  // 実物の玉の大きさ。挿す穴は同じなので、変わるのは丸の大きさだけ。
  led: ['3mm', '5mm'],
  // TO-92 は丸い小信号用、TO-220 は放熱タブつき。足の並びはどちらもピン名で示す。
  // `sot23-dip` は**面実装を載せた変換基板**。SOT-23 の足の間隔は 0.95mm で
  // 2.54mm の穴には届かないので、実物も変換基板に載せてから差す。
  transistor: ['to92', 'to220', 'sot23-dip'],
  // サイリスタとトライアックも同じ 2 つのパッケージで売られている。
  thyristor: ['to92', 'to220'],
  triac: ['to92', 'to220'],
  // レギュレータも同じ 2 つ。1A クラスは TO-220、小電流は TO-92。
  regulator: ['to92', 'to220'],
  // オスは中心にピンが立ち、メスは中心が穴。**合う相手を取り違えない**ために
  // 描き分ける。板の縁に載せる横置き (`male-edge`) は perfboard だけ。
  sma: ['male', 'female'],
  // 平たい缶 (HC-49) と円筒 (時計用の 32.768kHz などに多い)。輪郭がまるで違う。
  crystal: ['hc49', 'cylinder'],
};

/**
 * 向きのある姿。**どちらの足がどちらかを図に描く**ので、ピン名に極性が要る。
 * 印の付く側は姿ごとに違う (電解はマイナス側の帯、タンタルはプラス側の印) が、
 * 「向きが要る」という一点だけがここの意味。
 */
const POLAR_VARIANTS: ReadonlySet<string> = new Set(['electrolytic', 'tantalum']);

/**
 * `capacitor/ceramic` を種類と姿に割る。`/` の左右どちらかが空のときは割らず、
 * 種類の名前として丸ごと返す (`capacitor/` は書きかけなので、知らない種類として
 * 書いたまま報告させる。ここで「姿が空です」と言うより直す場所が分かる)。
 */
export function splitPartType(token: string): PartType {
  const slash = token.indexOf('/');
  const half = slash <= 0 || slash === token.length - 1;
  const head = half ? token : token.slice(0, slash);
  const written = half ? null : token.slice(slash + 1);

  const expanded = resolveAlias(head);
  if (expanded === null) return { type: head, variant: written, problem: null };

  // 略記の畳んだ先は表の中の綴りなので、姿の切り出しに失敗することはない。
  const opened = splitOnSlash(expanded);
  if (opened.variant !== null && written !== null) {
    return {
      ...opened,
      problem: `略記 ${head} は ${expanded} の略なので、姿は続けて書けません`,
    };
  }
  return { type: opened.type, variant: written ?? opened.variant, problem: null };
}

function splitOnSlash(token: string): { type: string; variant: string | null } {
  const slash = token.indexOf('/');
  if (slash <= 0) return { type: token, variant: null };
  return { type: token.slice(0, slash), variant: token.slice(slash + 1) };
}

/**
 * その種類に選べる姿。種類名は入力から来るので、必ず自分の持ち物だけを引く
 * (fence-kit の `parts/boards.ts` と同じ理由。素の添字だと `constructor` が Object.prototype から拾える)。
 */
export const variantsOf = (type: string): readonly string[] =>
  Object.hasOwn(VARIANTS, type) ? VARIANTS[type] ?? [] : [];

/** 向きのある姿か。ピン名 `(+)` `(-)` を要求するかどうかがこれで決まる。 */
export const isPolarVariant = (variant: string): boolean => POLAR_VARIANTS.has(variant);

/** 姿を選べる種類。書けない種類に姿が付いたときの案内に使う。 */
export const typesWithVariants = (): readonly string[] => Object.keys(VARIANTS);

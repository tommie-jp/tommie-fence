/**
 * 部品の種類の略記。**読んだ直後に正式名へ畳む**ので、図・部品リスト・
 * ネットリスト・エラーには正式名しか出ない (circuit-fence と同じ方式)。
 *
 * 正式名は一般英語名で 1 つに保つという方針は変えていない。略記はあくまで
 * 打ちやすさのための入口で、**出口には現れない**。
 *
 * 畳む先が板の上に無いもの (`gnd` `op` `dc` `ac` など) は載せない。
 * グラウンドはレール、オペアンプは `dipN`、電源は `device` の領分で、
 * 略記だけ受け取っても挿す先が無い。
 */

const ALIASES: Record<string, string> = {
  r: 'resistor',
  c: 'capacitor',
  l: 'inductor',
  d: 'diode',
  // 姿まで含む略記。電解コンデンサは種類ではなく `capacitor` の姿なので、
  // 略記 1 語が「種類 + 姿」に開く唯一の形になる。
  ec: 'capacitor/electrolytic',
  ecap: 'capacitor/electrolytic',
  pot: 'potentiometer',
  ldr: 'photoresistor',
  ntc: 'thermistor-ntc',
  ptc: 'thermistor-ptc',
  xtal: 'crystal',
  scr: 'thyristor',
  btn: 'button',
  /**
   * v0.2.0 で正式名として公開した綴り。circuit-fence に合わせて `button` を
   * 正式名にしたが、**一度公開した名前は書いた図を壊さない**ので略記に落として残す。
   */
  pushbutton: 'button',
};

/**
 * 略記なら畳んだ先の綴りを返す。正式名やそれ以外は null。
 * 種類名は入力から来るので、必ず自分の持ち物だけを引く
 * (素の添字だと `constructor` が Object.prototype から拾える)。
 */
export const resolveAlias = (type: string): string | null =>
  Object.hasOwn(ALIASES, type) ? ALIASES[type] ?? null : null;

/** 書き間違いの候補を探すときに、正式名と一緒に当てる。 */
export const aliasNames = (): readonly string[] => Object.keys(ALIASES);

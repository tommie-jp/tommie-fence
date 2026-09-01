import { element } from 'fence-kit';

/**
 * マップに描く部品の形。**図の記号ではなく「掴むための似顔絵」**で、
 * 正確さは TeX (circuitikz) の仕事。ここが競うと、記号を 1 つ足すたびに
 * 2 か所を直す羽目になる。
 *
 * だから**代表形 + 汎用形**にする。部品の種類は 100 を超えるが、描き分けるのは
 * 「どれがどこにいるか掴める」ために要る分だけ。表に無い種類は箱に落ちる
 * (名前は箱の中に出るので、どの部品かは分かる)。
 *
 * 形は原点を中心に描く。2 端子は呼ぶ側が線の向きへ回すので、
 * **上下の非対称は意味を持たせない** (回すと下向きになる)。
 */

export type GlyphName =
  | 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'source' | 'switch' | 'meter'
  | 'ground' | 'port' | 'supply' | 'short' | 'box';

/** 描く形と、中に入れる 1 文字 (計器の A・V など)。 */
export type Glyph = { readonly name: GlyphName; readonly mark: string | null };

/** 代表形に寄せる表。ここに無い種類は箱になる。 */
const SHAPES: Record<string, GlyphName> = {
  resistor: 'resistor', 'resistor-var': 'resistor', potentiometer: 'resistor',
  photoresistor: 'resistor', thermistor: 'resistor', varistor: 'resistor',
  capacitor: 'capacitor', ecap: 'capacitor', varicap: 'capacitor',
  inductor: 'inductor',
  diode: 'diode', led: 'diode', zener: 'diode', schottky: 'diode',
  photodiode: 'diode', diac: 'diode',
  vsource: 'source', sine: 'source', square: 'source', triangle: 'source',
  isource: 'source', battery: 'source', solar: 'source',
  switch: 'switch', button: 'switch', reed: 'switch',
  ammeter: 'meter', voltmeter: 'meter', ohmmeter: 'meter',
  wattmeter: 'meter', galvanometer: 'meter', detector: 'meter',
  ground: 'ground', port: 'port', vcc: 'supply', vee: 'supply', short: 'short',
};

/** 計器の丸に入れる字。**同じ丸を字で描き分ける** (形を 6 つ持たない)。 */
const MARKS: Record<string, string> = {
  ammeter: 'A', voltmeter: 'V', ohmmeter: 'Ω',
  wattmeter: 'W', galvanometer: 'G', detector: 'D',
  vsource: '+', battery: '+', isource: 'I',
  sine: '~', square: '⊓', triangle: '∿', solar: '☀',
};

export const glyphOf = (type: string): Glyph => ({
  name: SHAPES[type] ?? 'box',
  mark: MARKS[type] ?? null,
});

/** 2 端子の胴の長さ。マスの間隔より短くして、隣の記号とくっつかないようにする。 */
const BODY = 20;
const HALF = BODY / 2;

const path = (d: string): string => element('path', { class: 'cf-glyph-line', d });
const circle = (r: number, klass = 'cf-glyph'): string =>
  element('circle', { class: klass, cx: 0, cy: 0, r });
const box = (width: number, height: number): string =>
  element('rect', {
    class: 'cf-glyph', x: -width / 2, y: -height / 2, width, height, rx: 2,
  });

/** 丸に入れる字。**字は回さない**ので、呼ぶ側が回した中では使わない。 */
const SHAPE: Record<GlyphName, () => string> = {
  resistor: () => box(BODY, 12),
  // 極板 2 枚。間を空けるのが「切れている」ことの目印。
  capacitor: () => path('M-3,-9 L-3,9 M3,-9 L3,9'),
  inductor: () => path('M-12,0 a4,4 0 0 1 8,0 a4,4 0 0 1 8,0 a4,4 0 0 1 8,0'),
  diode: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M6,-7 L6,7')}`,
  source: () => circle(9),
  // 開いた接点。閉じた形にすると「切れる部品」に見えない。
  switch: () => path('M-9,0 L5,-8'),
  meter: () => circle(9),
  // 大地。3 本の棒が下へ短くなる。
  ground: () => path('M0,-6 L0,0 M-8,0 L8,0 M-5,4 L5,4 M-2,8 L2,8'),
  port: () => circle(4, 'cf-glyph cf-glyph-open'),
  supply: () => path('M0,6 L0,-4 M-7,-4 L7,-4'),
  // 線だけ (`short` は記号を持たない)。
  short: () => '',
  box: () => box(26, 16),
};

/**
 * 形 1 つ分の markup。原点が中心で、**回すのは呼ぶ側**。
 * 字は入れない (回すと逆さまになるので、呼ぶ側が回さない層で置く)。
 */
export const drawGlyph = (name: GlyphName): string => SHAPE[name]();

/** 2 端子の胴が線の上で占める長さ。線を胴で切らずに引くかの判断に使う。 */
export const GLYPH_SPAN = HALF;

import { element, num } from 'fence-kit';
import type { PinSide } from '../parts.ts';

/**
 * マップに描く部品の形。**回路図の記号になるべく寄せた似顔絵**で、
 * 正確さそのものは TeX (circuitikz) の仕事。掴むための升目なので、
 * 細い線や規格ごとの差までは追わない。
 *
 * **以前は「代表形 + 箱」だった** (77 種のうち 40 種が箱)。実機で
 * 「描画する部品は回路図となるべく同じ図形にする」と言われて寄せた。
 * 掴むときに読むのは形なので、箱に名前を書くより形が似ているほうが速い。
 *
 * それでも**描き分けるのは形が違うところまで**にする。`schottky` と `diode`、
 * `npn` と `pnp` のように、細部だけが違うものは同じ形に落ちる (その差は図が言う)。
 * 表に無い種類は箱になる — DIP のような IC は箱が正しい姿でもある。
 *
 * 形は原点を中心に描く。2 端子は呼ぶ側が線の向きへ回すので、
 * **上下の非対称に意味を持たせない** (回すと下向きになる)。
 * 例外は `thyristor` のゲートで、実物が非対称なので回ると上下が入れ替わる。
 */

export type GlyphName =
  | 'resistor' | 'resistor-var' | 'potentiometer' | 'resistor-iec' | 'photoresistor'
  | 'capacitor' | 'ecap' | 'varicap' | 'inductor'
  | 'diode' | 'schottky' | 'photodiode' | 'led' | 'zener' | 'thyristor' | 'diac' | 'triac'
  | 'source' | 'dc-source' | 'ac-source' | 'square-source' | 'tri-source' | 'i-source' | 'solar'
  | 'battery' | 'switch' | 'switch-nc' | 'button' | 'button-nc'
  | 'reed' | 'spdt' | 'meter'
  | 'crystal' | 'fuse' | 'lamp' | 'speaker' | 'mic' | 'transformer' | 'coax'
  | 'bjt' | 'bjt-p' | 'fet' | 'fet-p' | 'fet-bulk' | 'fet-bulk-p'
  | 'jfet' | 'jfet-p' | 'igbt' | 'igbt-p' | 'opamp'
  | 'and' | 'and-inv' | 'or' | 'or-inv' | 'xor' | 'xor-inv' | 'buffer' | 'buffer-inv'
  | 'ground' | 'port' | 'supply-up' | 'supply-down' | 'short' | 'box';

/** 記号に添える字。**下に出すもの**は品種の名前 (`NTC`)、そうでなければ中に入る。 */
export type Mark = { readonly text: string; readonly below?: boolean };

/** 描く形と、添える字 (計器の A・V、サーミスタの NTC など)。 */
export type Glyph = { readonly name: GlyphName; readonly mark: Mark | null };

/** 記号に寄せる表。ここに無い種類は箱になる。 */
const SHAPES: Record<string, GlyphName> = {
  resistor: 'resistor',
  'resistor-var': 'resistor-var', potentiometer: 'potentiometer',
  // **感温・感圧は箱**。図が IEC の箱で描くので、折れ線に寄せない。
  thermistor: 'resistor-iec', 'thermistor-ntc': 'resistor-iec',
  'thermistor-ptc': 'resistor-iec', varistor: 'resistor-iec',
  photoresistor: 'photoresistor',
  capacitor: 'capacitor', ecap: 'ecap', varicap: 'varicap',
  inductor: 'inductor', transformer: 'transformer',
  diode: 'diode', schottky: 'schottky', photodiode: 'photodiode',
  led: 'led', zener: 'zener', diac: 'diac',
  thyristor: 'thyristor', triac: 'triac',
  // 直流電源だけ丸の中に ＋ − を描く (図と同じ)。波形の電源は丸 + 字のまま
  vsource: 'dc-source',
  sine: 'ac-source', square: 'square-source', triangle: 'tri-source',
  isource: 'i-source', solar: 'solar', battery: 'battery',
  switch: 'switch', 'switch-nc': 'switch-nc',
  button: 'button', 'button-nc': 'button-nc', reed: 'reed', spdt: 'spdt',
  ammeter: 'meter', voltmeter: 'meter', ohmmeter: 'meter',
  wattmeter: 'meter', galvanometer: 'meter', detector: 'meter',
  crystal: 'crystal', fuse: 'fuse', lamp: 'lamp', speaker: 'speaker', mic: 'mic',
  // 同軸コネクタ。**図と同じ丸と中心導体**にする (実機で頼まれた)。
  sma: 'coax',
  // ブザーは図がスピーカーの記号で描く (circuitikz にブザーの記号が無い)。
  buzzer: 'speaker',
  // スライドスイッチは図が切り替えスイッチと同じ記号。
  'slide-switch': 'spdt',
  npn: 'bjt', pnp: 'bjt-p',
  nmos: 'fet', pmos: 'fet-p', njfet: 'jfet', pjfet: 'jfet-p',
  'nmos-e': 'fet-bulk', 'pmos-e': 'fet-bulk-p', 'nmos-d': 'fet-bulk', 'pmos-d': 'fet-bulk-p',
  nigbt: 'igbt', pigbt: 'igbt-p',
  opamp: 'opamp',
  and: 'and', nand: 'and-inv',
  or: 'or', nor: 'or-inv',
  xor: 'xor', xnor: 'xor-inv',
  buffer: 'buffer', not: 'buffer-inv',
  ground: 'ground', port: 'port',
  // **電源レールは矢印**で、上下がその記号の意味 (だから回すのを断っている)。
  vcc: 'supply-up', vee: 'supply-down', short: 'short',
};

/**
 * 記号の中に置く字。**同じ丸を字で描き分ける** (計器の形を 6 つ持たない)。
 * 論理ゲートには字を入れない — 図が背の形で描き分けているので、こちらも形で分ける。
 */
const MARKS: Record<string, Mark> = {
  ammeter: { text: 'A' }, voltmeter: { text: 'V' }, ohmmeter: { text: 'Ω' },
  wattmeter: { text: 'W' }, galvanometer: { text: 'G' }, detector: { text: 'D' },
  // **サーミスタの品種は字でしか分からない。** 図が箱の下に 2 行目として
  // 書いているのと同じで、こちらも記号の下に出す (箱の中は斜めの線が通る)。
  'thermistor-ntc': { text: 'NTC', below: true },
  'thermistor-ptc': { text: 'PTC', below: true },
};

export const glyphOf = (type: string): Glyph => ({
  name: SHAPES[type] ?? 'box',
  mark: MARKS[type] ?? null,
});

/** 2 端子の胴の長さ。マスの間隔より短くして、隣の記号とくっつかないようにする。 */
const BODY = 20;
const HALF = BODY / 2;

/** 電源の丸の半径と、中に置く ＋ − の寸法 (図と同じ並び)。 */
const SOURCE_R = 9;
/** 記号の中心を丸の中心からどれだけ離すか。 */
const SIGN_AT = 4;
/** ＋ − の棒の半分の長さ。丸の縁 (線幅 1.5) に触れない大きさに取る。 */
const SIGN_ARM = 2;

const path = (d: string): string => element('path', { class: 'cf-glyph-line', d });
const circle = (r: number, klass = 'cf-glyph'): string =>
  element('circle', { class: klass, cx: 0, cy: 0, r });
const box = (width: number, height: number): string =>
  element('rect', {
    class: 'cf-glyph', x: -width / 2, y: -height / 2, width, height, rx: 2,
  });

/** 押しボタンの 2 つの接点。**離れているのが「切れている」の目印**。 */
const contacts = (): string =>
  element('circle', { class: 'cf-glyph', cx: -5, cy: 0, r: 1.6 })
  + element('circle', { class: 'cf-glyph', cx: 5, cy: 0, r: 1.6 });

/** 反転の丸 (NAND・NOR・NOT の出口)。**これが有る無しが唯一の違い**。 */
const bubble = (cx: number): string =>
  element('circle', { class: 'cf-glyph', cx, cy: 0, r: 2.5 });

/** 矢の頭の長さ。図の矢に合わせて、開きは 30 度。 */
const HEAD = 3.6;

/**
 * 矢 1 本の `d`。**頭は終点に付き、付け根の側へ開く。**
 *
 * 手で書いた座標だと、向きを変えるたびに 2 本の羽を計算し直すことになる
 * (トランジスタは n 形と p 形で矢が逆を向くので、8 本ぶん要る)。
 */
function arrow(x1: number, y1: number, x2: number, y2: number): string {
  const [dx, dy] = [x1 - x2, y1 - y2];
  const reach = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [(dx / reach) * HEAD, (dy / reach) * HEAD];
  const [cos, sin] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
  const wing = (turn: number): string =>
    `M${num(x2)},${num(y2)} L${num(x2 + ux * cos - turn * uy * sin)},${num(y2 + turn * ux * sin + uy * cos)}`;
  return `M${num(x1)},${num(y1)} L${num(x2)},${num(y2)} ${wing(1)} ${wing(-1)}`;
}

const SHAPE: Record<GlyphName, () => string> = {
  // 折れ線。circuitikz の既定 (米国式) と同じ姿にする。
  resistor: () => path('M-10,0 L-8.3,-5 L-5,5 L-1.7,-5 L1.7,5 L5,-5 L8.3,5 L10,0'),
  // 可変。折れ線を斜めの矢が貫く。
  'resistor-var': () =>
    `${SHAPE.resistor()}${path('M-8,8 L8,-8 M8,-8 L3.5,-7 M8,-8 L7,-3.5')}`,
  // ポテンショメータ。**上から下りる矢がワイパー** (可変抵抗の斜めの矢とは別の記号)。
  potentiometer: () =>
    `${SHAPE.resistor()}${path('M0,-12 L0,-4 M0,-4 L-1.8,-7.2 M0,-4 L1.8,-7.2')}`,
  // 感温・感圧。IEC の箱を斜めの線が貫く (図と同じ)。
  'resistor-iec': () => `${box(20, 10)}${path('M-7,6 L7,-6')}`,
  // 感光。箱へ光が差す 2 本の矢。
  photoresistor: () => `${box(20, 10)}${path('M-1.5,-10.5 L-5,-6 M-5,-6 L-2.4,-6.7 M-5,-6 L-4.2,-8.6'
    + ' M4.5,-10.5 L1,-6 M1,-6 L3.6,-6.7 M1,-6 L4.4,-8.6')}`,
  // 極板 2 枚。間を空けるのが「切れている」ことの目印。
  capacitor: () => path('M-3,-9 L-3,9 M3,-9 L3,9'),
  // 電解。片方が曲がった極板 (向きのある部品)。
  ecap: () => path('M-3,-9 L-3,9 M3,-9 q4,9 0,18'),
  // 可変容量。ダイオードの三角に極板 2 枚。
  varicap: () => `${path('M-7,-7 L1,0 L-7,7 Z')}${path('M1,-7 L1,7 M4.5,-7 L4.5,7')}`,
  inductor: () => path('M-10,0 a2.5,2.5 0 0 1 5,0 a2.5,2.5 0 0 1 5,0'
    + ' a2.5,2.5 0 0 1 5,0 a2.5,2.5 0 0 1 5,0'),
  // 2 つの巻線と鉄心。空芯ではないので芯の 2 本を引く。
  transformer: () =>
    path('M-7,-9 a4.5,4.5 0 0 0 0,9 a4.5,4.5 0 0 0 0,9'
      + ' M7,-9 a4.5,4.5 0 0 1 0,9 a4.5,4.5 0 0 1 0,9'
      + ' M-1.5,-9 L-1.5,9 M1.5,-9 L1.5,9'),
  diode: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M6,-7 L6,7')}`,
  // ショットキー。棒の両端が **S 字**に折れる (ツェナーは同じ向きに折れる)。
  schottky: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M9,-4 L9,-7 L6,-7 L6,7 L3,7 L3,4')}`,
  // 受光。**内へ入る 2 本の矢** (発光は外へ出る)。
  photodiode: () => `${SHAPE.diode()}${path('M4,-10 L0,-6 M0,-6 L2.7,-6.7 M0,-6 L0.7,-8.7'
    + ' M8,-8 L4,-4 M4,-4 L6.7,-4.7 M4,-4 L4.7,-6.7')}`,
  // 発光。外へ出る 2 本の矢。
  led: () => `${SHAPE.diode()}${path('M0,-6 L4,-10 M4,-10 L1.4,-9.5 M4,-10 L3.5,-7.4'
    + ' M4,-4 L8,-8 M8,-8 L5.4,-7.5 M8,-8 L7.5,-5.4')}`,
  // ツェナー。棒の両端が折れる。
  zener: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M9,-10 L6,-7 L6,7 L3,10')}`,
  // サイリスタ。棒からゲートが 1 本 (実物が上下非対称)。
  thyristor: () => `${SHAPE.diode()}${path('M6,-2 L12,-8')}`,
  // ダイアック。**上下に積んだ 2 つの三角が逆を向く** (どちら向きにも流れる)。
  // 横に並べた蝶ネクタイではない — 図はこの積み方で描く。
  diac: () => path('M-5,-8 L-5,8 M5,-8 L5,8 M5,-8 L-5,-4.5 L5,-1 M-5,8 L5,4.5 L-5,1'),
  // トライアック。ダイアックにゲートが 1 本。
  triac: () => `${SHAPE.diac()}${path('M5,-1 L11,-7')}`,
  source: () => circle(9),
  // 波形の電源。**丸の中に波を描く** (字だと回したときに向きを失う。`dc-source` と同じ理由)。
  'ac-source': () => circle(SOURCE_R) + path('M-6,0 c2,-6 4,-6 6,0 c2,6 4,6 6,0'),
  'square-source': () => circle(SOURCE_R) + path('M-6,0 L-6,-4 L0,-4 L0,4 L6,4 L6,0'),
  'tri-source': () => circle(SOURCE_R) + path('M-6,0 L-3,-4.5 L3,4.5 L6,0'),
  // 定電流源。丸の中の矢が向き (図と同じ)。
  'i-source': () => circle(SOURCE_R) + path('M-5,0 L5,0 M5,0 L2.2,-1.8 M5,0 L2.2,1.8'),
  // 太陽電池。**電池の極板に光の矢**が差す (図と同じで、丸の中に極板が入る)。
  // 矢は左上から — 図は左下だが、升目は記号の下に名前を置くので重なる。
  solar: () => circle(SOURCE_R)
    + path('M-2,-5 L-2,5 M2,-5 L2,5')
    + path('M-13,-13 L-8.5,-8.5 M-8.5,-8.5 L-9.2,-11.2 M-8.5,-8.5 L-11.2,-9.2'
      + ' M-9,-15 L-4.5,-10.5 M-4.5,-10.5 L-5.2,-13.2 M-4.5,-10.5 L-7.2,-11.2'),
  // 直流電源。**丸の中に ＋ と − を横に並べる** (図 = circuitikz と同じ)。
  //
  // 中に置く字 (MARKS) ではなく**記号の一部**として描くこと。字は回さない
  // 作りなので、縦置きの電源で ＋ が上に来ない (極性の印が向きを失う)。
  //
  // 寸法は半径から決める。棒の端でいちばん遠い点 (SIGN_AT + SIGN_ARM, SIGN_ARM)
  // が丸の内側 (r − 線幅) に収まるようにしてある — 決め打ちにすると丸の
  // 大きさを変えた時に静かに縁へ乗る。
  'dc-source': () => circle(SOURCE_R)
    + path(`M${-SIGN_AT - SIGN_ARM},0 H${-SIGN_AT + SIGN_ARM}`
      + ` M${-SIGN_AT},${-SIGN_ARM} V${SIGN_ARM}`)
    + path(`M${SIGN_AT - SIGN_ARM},0 H${SIGN_AT + SIGN_ARM}`),
  // 電池。**1 セル** — 長い極板と短い極板が 1 組 (図の `battery1` と同じ)。
  // 2 組にすると、図では電池 2 本の記号 (`battery2`) を指すことになる。
  battery: () => path('M-3,-8 L-3,8 M3,-4 L3,4'),
  // 開いた接点。閉じた形にすると「切れる部品」に見えない。
  switch: () => path('M-9,0 L5,-8'),
  // b 接点。**閉じた線を斜めの棒が横切る** (図と同じ)。棒が「押すと開く」の印。
  'switch-nc': () => path('M-9,0 L9,0 M2,5 L8,-6'),
  // 押しボタン (a 接点)。2 つの接点の上に、離れた押し板。
  button: () => `${contacts()}${path('M-6,-7 L6,-7 M0,-7 L0,-3')}`,
  // 押しボタン (b 接点)。押し板が接点に載っている。
  'button-nc': () => `${contacts()}${path('M-6,-4 L6,-4 M0,-4 L0,0')}`,
  // リードスイッチ。ガラス管の中の接点。
  reed: () => element('ellipse', { class: 'cf-glyph', cx: 0, cy: 0, rx: 10, ry: 5 })
    + path('M-7,1 L6,-3'),
  // 切り替え。1 つの極から 2 つの接点へ。接点の先は足の棒 (`SPAN` と同じ 10)
  // まで伸ばして、升目が引く棒とつなげる。
  spdt: () => path('M-9,0 L5,-6 M7,-6 L10,-6 M7,6 L10,6'),
  meter: () => circle(9),
  // 水晶。2 枚の極板に挟まれた板。
  crystal: () => `${path('M-6,-9 L-6,9 M6,-9 L6,9')}${box(6, 14)}`,
  // ヒューズ。線の上の細い箱 (図と同じで、箱を線は貫かない)。
  fuse: () => box(16, 8),
  // ランプ。丸に斜め十字。
  lamp: () => `${circle(8)}${path('M-5.7,-5.7 L5.7,5.7 M5.7,-5.7 L-5.7,5.7')}`,
  // スピーカー。線の上の振動板と、その上に開くホーン。
  speaker: () => path('M-7,-4 L7,-4 L7,4 L-7,4 Z M-4,-4 L-7,-10 L7,-10 L4,-4'),
  // 同軸コネクタ。丸の中の点が中心導体、外周が外皮 (図と同じ形)。
  coax: () => `${circle(8)}${element('circle', { class: 'cf-glyph-core', cx: 0, cy: 0, r: 2.2 })}`,
  // マイク。線に丸が載り、線が丸の底を塞ぐ。
  mic: () => element('circle', { class: 'cf-glyph', cx: 0, cy: -4, r: 6 })
    + path('M-6,2 L6,2'),
  // バイポーラ。**丸は付かない** (図が付けていない)。ベースの棒と 2 本の足。
  //
  // **矢はエミッタの足に付き、向きが n 形と p 形を分ける** — npn は外へ、
  // pnp は内へ (ベースの側へ)。図がそこだけで描き分けているので、こちらも分ける。
  // 足の出る辺も入れ替わる (`BJT_SIDE_P`) ので、矢は必ずエミッタの側に来る。
  bjt: () => path(`M-13,0 L-4,0 M-4,-7 L-4,7 M-4,-3 L6,-9 ${arrow(-4, 3, 6, 9)}`),
  'bjt-p': () => path(`M-13,0 L-4,0 M-4,-7 L-4,7 M-4,3 L6,9 ${arrow(6, -9, -4, -3)}`),
  // 電界効果。ゲートの棒とチャネルの棒が離れている (絶縁ゲート)。
  // **p 形はゲートに丸**が付く (図と同じ)。
  fet: () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ' M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9'),
  'fet-p': () => `${path('M-13,0 L-9.5,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ' M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9')}${bubble(-8)}`,
  // 基板の足を出す形 (増強形・空乏形)。**真ん中の矢が向きを言う** —
  // n 形はゲートへ向き、p 形は外を向く。
  'fet-bulk': () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9 M-3.5,0 L6,0 ${arrow(3, 0, -3.5, 0)}`),
  'fet-bulk-p': () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9 M-3.5,0 L6,0 ${arrow(-3.5, 0, 3, 0)}`),
  // 接合形。**チャネルは 1 本の棒**で、ゲートの矢がそこへ刺さる (絶縁ゲートと
  // 違って棒が離れていない)。n 形は内へ、p 形は外へ。
  jfet: () => path(`M-4,-7 L-4,7 M-4,-5 L6,-5 L6,-9 M-4,5 L6,5 L6,9 ${arrow(-13, 0, -4, 0)}`),
  'jfet-p': () => path(`M-4,-7 L-4,7 M-4,-5 L6,-5 L6,-9 M-4,5 L6,5 L6,9 ${arrow(-4, 0, -13, 0)}`),
  // IGBT。**絶縁ゲート + エミッタ側の矢** (出口がバイポーラ)。向きは npn / pnp と同じ。
  igbt: () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,-3 L6,-9 ${arrow(-3.5, 3, 6, 9)}`),
  'igbt-p': () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,3 L6,9 ${arrow(6, -9, -3.5, -3)}`),
  // 演算増幅器。出口を向いた三角。
  opamp: () => path('M-7,-9 L8,0 L-7,9 Z'),
  // 論理ゲート。**背の形で分ける** (図と同じ)。AND は平ら、OR は反り、
  // XOR は反りがもう 1 本。反転はどれも出口の丸。
  and: () => path('M-8,-9 L0,-9 A9,9 0 0 1 0,9 L-8,9 Z'),
  'and-inv': () => `${SHAPE.and()}${bubble(11.5)}`,
  or: () => path('M-8,-9 Q-3,0 -8,9 Q2,9 9,0 Q2,-9 -8,-9 Z'),
  'or-inv': () => `${SHAPE.or()}${bubble(11.5)}`,
  xor: () => `${SHAPE.or()}${path('M-11.5,-9 Q-6.5,0 -11.5,9')}`,
  'xor-inv': () => `${SHAPE.xor()}${bubble(11.5)}`,
  buffer: () => path('M-7,-9 L8,0 L-7,9 Z'),
  'buffer-inv': () => `${SHAPE.buffer()}${bubble(10.5)}`,
  // 大地。3 本の棒が下へ短くなる。
  ground: () => path('M0,-6 L0,0 M-8,0 L8,0 M-5,4 L5,4 M-2,8 L2,8'),
  port: () => circle(4, 'cf-glyph cf-glyph-open'),
  'supply-up': () => path('M0,8 L0,-8 M0,-8 L-4,-3 M0,-8 L4,-3'),
  'supply-down': () => path('M0,-8 L0,8 M0,8 L-4,3 M0,8 L4,3'),
  // 線だけ (`short` は記号を持たない)。
  short: () => '',
  box: () => box(26, 16),
};

/**
 * 形 1 つ分の markup。原点が中心で、**回すのは呼ぶ側**。
 * 字は入れない (回すと逆さまになるので、呼ぶ側が回さない層で置く)。
 */
export const drawGlyph = (name: GlyphName): string => SHAPE[name]();

/**
 * 記号が線の上で占める長さ (原点から片側)。**2 交点をつなぐ線をどこで切るか**。
 *
 * 図と同じで、**線は記号の縁で止まる** — コンデンサなら極板に触れ、抵抗なら
 * 折れ線の端に触れる。通しで引くと記号に中心線が重なり、コンデンサは
 * 「切れている」という記号の意味まで壊れる (実機で指摘された)。
 *
 * **形と一緒に動かす。** ここを `Record<GlyphName, number>` にしてあるのは、
 * 形を 1 つ足したときに値を書き忘れると型で止まるようにするため。
 */
const SPAN: Record<GlyphName, number> = {
  resistor: HALF, 'resistor-var': HALF, potentiometer: HALF, 'resistor-iec': HALF, photoresistor: HALF,
  capacitor: 3, ecap: 6, varicap: 7, inductor: HALF, transformer: 9,
  diode: 6, schottky: 9, photodiode: 6, led: 6, zener: 9, thyristor: 6, diac: 5, triac: 5,
  source: 9, 'dc-source': SOURCE_R, 'ac-source': SOURCE_R, 'square-source': SOURCE_R,
  'tri-source': SOURCE_R, 'i-source': SOURCE_R, solar: SOURCE_R, battery: 3, meter: 9,
  switch: 9, 'switch-nc': 9, button: 6, 'button-nc': 6, reed: HALF, spdt: HALF,
  crystal: 6, fuse: 8, lamp: 8, speaker: 7, mic: 6, coax: 8,
  bjt: 13, 'bjt-p': 13, fet: 13, 'fet-p': 13, 'fet-bulk': 13, 'fet-bulk-p': 13,
  jfet: 13, 'jfet-p': 13, igbt: 13, 'igbt-p': 13, opamp: 8,
  // 反転する形は**出口の丸の外側**まで取る。丸の手前から棒を出すと、
  // 棒が丸を突き抜けて出てくる (実機で見つけた)。
  and: 9, 'and-inv': 14, or: 9, 'or-inv': 14, xor: 9, 'xor-inv': 14,
  buffer: 8, 'buffer-inv': 13,
  ground: 8, port: 4, 'supply-up': 8, 'supply-down': 8,
  // 線そのものなので切らない。切ると何も残らない。
  short: 0,
  box: 13,
};

export const glyphSpan = (name: GlyphName): number => SPAN[name];

/**
 * 同じ辺に並ぶ足の間隔。**記号が実際に足を描いている位置**で決まる —
 * 接続点は足の先に出るので、ここが実際とずれると「どこにつながるのか
 * 分からない丸」になる (実機でオペアンプと AND ゲートで指摘された)。
 *
 * 1 辺に 1 本しか出ない記号 (トランジスタなど) では使わないが、
 * **形を足したときに書き忘れると型で止まる**よう、全部の形に値を持たせる。
 */
const LEG_GAP: Record<GlyphName, number> = {
  // 背の縁の上下 1/4 のあたりに入る。図の入力もそのくらいの高さ。
  and: 9, 'and-inv': 9, or: 9, 'or-inv': 9, xor: 9, 'xor-inv': 9,
  // 三角の背の、中心から外れた高さ (± の付く場所)。
  opamp: 9,
  // 巻線の両端。コイルは ±9 まで巻いてある。
  transformer: 18,
  // 開いた接点 2 つ。記号がその高さに描いてある。
  spdt: 12,
  // 箱は自分で伸びるので、読める間隔を選べる (名前が 8px)。
  box: 12,
  // ここから下は 1 辺に 1 本だけ。値は使われない。
  resistor: 12, 'resistor-var': 12, potentiometer: 12, 'resistor-iec': 12, photoresistor: 12,
  capacitor: 12, ecap: 12, varicap: 12, inductor: 12,
  diode: 12, schottky: 12, photodiode: 12, led: 12, zener: 12, thyristor: 12, diac: 12, triac: 12,
  source: 12, 'dc-source': 12, 'ac-source': 12, 'square-source': 12, 'tri-source': 12,
  'i-source': 12, solar: 12, battery: 12, meter: 12,
  switch: 12, 'switch-nc': 12, button: 12, 'button-nc': 12, reed: 12,
  crystal: 12, fuse: 12, lamp: 12, speaker: 12, mic: 12, coax: 12,
  bjt: 12, 'bjt-p': 12, fet: 12, 'fet-p': 12, 'fet-bulk': 12, 'fet-bulk-p': 12,
  jfet: 12, 'jfet-p': 12, igbt: 12, 'igbt-p': 12, buffer: 12, 'buffer-inv': 12,
  ground: 12, port: 12, 'supply-up': 12, 'supply-down': 12, short: 12,
};

export const legGap = (name: GlyphName): number => LEG_GAP[name];

/**
 * 足の名前を**胴の中に**書く記号と、その辺。
 *
 * オペアンプの ± は circuitikz が記号の一部として三角の中に描く。外に出すと
 * 図と見た目が違ううえ、± が指す足がどれなのかも遠くなる (実機で
 * 「回路図ではオペアンプの中に ＋・− があるのに editor では外にある」)。
 *
 * **辺ごとに指す。** 同じ記号でも出口 (`out`) は外に出すほうが読める —
 * 三角の先は細く、中に字を置く場所が無い。
 */
const NAMES_INSIDE: Partial<Record<GlyphName, PinSide>> = { opamp: 'left' };

export const namesInside = (name: GlyphName, side: PinSide): boolean =>
  NAMES_INSIDE[name] === side;

/**
 * 名前を入れる箱。**足の本数で伸びる** — DIP は片側に 20 本まで出るので、
 * 決め打ちの 26x16 では足が重なって 1 本ずつ押せない。
 */
export const drawBox = (halfWidth: number, halfHeight: number): string =>
  box(halfWidth * 2, halfHeight * 2);

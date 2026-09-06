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
  | 'bjt' | 'bjt-p' | 'fet' | 'fet-p' | 'fet-e' | 'fet-e-p' | 'fet-d' | 'fet-d-p'
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
  // **増強形と空乏形はチャネルで分かれる** (図と同じ。実機で頼まれた)。
  'nmos-e': 'fet-e', 'pmos-e': 'fet-e-p', 'nmos-d': 'fet-d', 'pmos-d': 'fet-d-p',
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

/**
 * 左を開けた丸 (同軸コネクタの外皮)。真横 (180 度) を中心に `gap` 度だけ
 * 開け、残りを弧で描く。**開き口から中心導体の線が入る**。
 */
const openCircle = (r: number, gap: number): string => {
  const at = (deg: number): string => {
    const rad = (deg * Math.PI) / 180;
    return `${num(r * Math.cos(rad))},${num(r * Math.sin(rad))}`;
  };
  // 弧は大きいほう (180 度超え) を、時計回りに描く。
  return path(`M${at(180 + gap)} A${r},${r} 0 1 1 ${at(180 - gap)}`);
};

/** 外皮の丸を開ける角度 (中心導体の入る向きから上下へ、度)。図と同じ。 */
const COAX_GAP = 24;

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

/**
 * 基板の足を出す FET (増強形・空乏形) の胴。**チャネルの棒だけが違う。**
 *
 * 図 (circuitikz の `nigfete` / `nigfetd`) と同じで、増強形はチャネルが
 * 3 つに切れ (電圧を掛けるまでチャネルが無い)、空乏形は 1 本でつながる。
 * **切れるのはチャネルの棒だけ** — ゲートの棒を切ると別の記号になる。
 */
const fetBulk = (channel: string, bulk: string): string =>
  path(`M-13,0 L-7,0 M-7,-7 L-7,7 ${channel}`
    + ` M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9 M-3.5,0 L6,0 ${bulk}`);

/** 空乏形のチャネル。端から端までの 1 本。 */
const CHANNEL_SOLID = 'M-3.5,-7 L-3.5,7';
/** 増強形のチャネル。3 つに切れている (図が描いているのと同じ数)。 */
const CHANNEL_BROKEN = 'M-3.5,-7 L-3.5,-3.8 M-3.5,-1.6 L-3.5,1.6 M-3.5,3.8 L-3.5,7';

/** 基板の足の矢。n 形はゲートへ向き、p 形は外を向く (図と同じ)。 */
const BULK_IN = arrow(3, 0, -3.5, 0);
const BULK_OUT = arrow(-3.5, 0, 3, 0);

const SHAPE: Record<GlyphName, () => string> = {
  // 折れ線。circuitikz の既定 (米国式) と同じ姿にする。
  resistor: () => path('M-10,0 L-8.3,-5 L-5,5 L-1.7,-5 L1.7,5 L5,-5 L8.3,5 L10,0'),
  // 可変。**折れ線の真ん中を、立った矢が貫く** (図と同じ)。45 度で端から端まで
  // 引くと、矢が折れ線の外まで伸びて別の記号に見えた (実機で「回路図の図形に
  // 近づける」)。図の矢は横 1 に対して縦 2.4 ほどの傾きで、上下へ突き抜ける。
  'resistor-var': () => `${SHAPE.resistor()}${path(arrow(3.5, 8.5, -3.5, -8.5))}`,
  // ポテンショメータ。**上から下りる矢がワイパー** (可変抵抗の斜めの矢とは別の記号)。
  // **矢先は折れ線の山の手前で止める** (図と同じ)。中まで下ろすと歯の間に
  // 刺さって見えた (実機で「矢印を図形とかぶらないようにする」)。
  potentiometer: () => `${SHAPE.resistor()}${path(arrow(0, -13, 0, -7))}`,
  // 感温・感圧。IEC の箱を斜めの線が貫く (図と同じ)。
  'resistor-iec': () => `${box(20, 10)}${path('M-7,6 L7,-6')}`,
  // 感光。箱へ光が差す 2 本の矢。**矢先と箱の間は空ける** — 触れると光の矢が
  // 箱から生えているように見える (実機で「矢印と本体に隙間を開ける」)。
  // 箱の上の縁は -5、線幅 1.5 の外側で -5.75。そこから更に離して止める。
  photoresistor: () => `${box(20, 10)}${path(`${arrow(-1.5, -12.5, -5, -8)} ${arrow(4.5, -12.5, 1, -8)}`)}`,
  // 極板 2 枚。間を空けるのが「切れている」ことの目印。
  capacitor: () => path('M-3,-9 L-3,9 M3,-9 L3,9'),
  // 電解。片方が曲がった極板 (向きのある部品)。
  ecap: () => path('M-3,-9 L-3,9 M3,-9 q4,9 0,18'),
  // 可変容量。ダイオードの三角に極板 2 枚。
  varicap: () => `${path('M-7,-7 L1,0 L-7,7 Z')}${path('M1,-7 L1,7 M4.5,-7 L4.5,7')}`,
  // コイル。**山は抵抗の折れ線と同じ高さ**まで巻く (実機で「コイルの高さを
  // 増やす。抵抗の高さと同じぐらいに」)。幅は 4 山で胴 (20) のままなので、
  // 弧は円ではなく縦に伸びた楕円になる。
  inductor: () => path('M-10,0 a2.5,5 0 0 1 5,0 a2.5,5 0 0 1 5,0'
    + ' a2.5,5 0 0 1 5,0 a2.5,5 0 0 1 5,0'),
  // 2 つの巻線と鉄心。空芯ではないので芯の 2 本を引く。
  transformer: () =>
    path('M-7,-9 a4.5,4.5 0 0 0 0,9 a4.5,4.5 0 0 0 0,9'
      + ' M7,-9 a4.5,4.5 0 0 1 0,9 a4.5,4.5 0 0 1 0,9'
      + ' M-1.5,-9 L-1.5,9 M1.5,-9 L1.5,9'),
  diode: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M6,-7 L6,7')}`,
  // ショットキー。棒の両端が **S 字**に折れる (ツェナーは同じ向きに折れる)。
  schottky: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M9,-4 L9,-7 L6,-7 L6,7 L3,7 L3,4')}`,
  // 受光。**内へ入る 2 本の矢** (発光は外へ出る)。
  // **矢は胴の上へ寄せる** — 元の場所では陰極の棒を横切り、三角の上の辺にも
  // 乗っていた (実機で「led の矢印が図形とかぶらないように矢印をずらす」。
  // 受光も同じ形なので一緒に離した)。
  photodiode: () => `${SHAPE.diode()}${path(`${arrow(0.5, -12, -3.5, -8)} ${arrow(4.5, -10.5, 0.5, -6.5)}`)}`,
  // 発光。外へ出る 2 本の矢。
  led: () => `${SHAPE.diode()}${path(`${arrow(-3.5, -8, 0.5, -12)} ${arrow(0.5, -6.5, 4.5, -10.5)}`)}`,
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
  // 矢は**左下から**入る — 図と同じ側。名前は記号の張り出しの外へ逃がすので
  // (`glyphTall`)、下に置いても重ならない。
  solar: () => circle(SOURCE_R)
    + path('M-2,-5 L-2,5 M2,-5 L2,5')
    + path('M-13,13 L-8.5,8.5 M-8.5,8.5 L-11.2,9.2 M-8.5,8.5 L-9.2,11.2'
      + ' M-9,15 L-4.5,10.5 M-4.5,10.5 L-7.2,11.2 M-4.5,10.5 L-5.2,13.2'),
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
  // b 接点。**閉じた線を、短い棒が 1 本斜めに横切る** (図と同じ)。
  // 倒れたレバーと横切る棒の 2 本を描いていたが、図はレバーを描かない —
  // 線が閉じていることと、横切る棒が「押すと開く」の印 (実機で「回路図の形に
  // 近づける」)。
  'switch-nc': () => path('M-9,0 L9,0 M-1,4 L5,-6'),
  // 押しボタン (a 接点)。2 つの接点の**上に離れた**押し板と、そこから伸びる軸。
  // **軸は上へ**出る (図と同じ) — 下へ出すと接点に届いて閉じた形に見える。
  button: () => `${contacts()}${path('M-6,-5 L6,-5 M0,-5 L0,-9')}`,
  // 押しボタン (b 接点)。**閉じる棒は接点の下の縁**を通り、軸はその反対 (上) へ
  // 伸びる (図と同じ。実機で「スイッチの下線が◯の下に接続するようにする」)。
  // 棒を接点の上に置くと、a 接点の浮いた押し板と見分けが付かない。
  'button-nc': () => `${contacts()}${path('M-6,1.6 L6,1.6 M0,1.6 L0,-7')}`,
  // リードスイッチ。ガラス管の中の接点。
  reed: () => element('ellipse', { class: 'cf-glyph', cx: 0, cy: 0, rx: 10, ry: 5 })
    + path('M-7,1 L6,-3'),
  // 切り替え。1 つの極から 2 つの接点へ。接点の先は足の棒 (`SPAN` と同じ 10)
  // まで伸ばして、升目が引く棒とつなげる。
  spdt: () => path('M-9,0 L5,-6 M7,-6 L10,-6 M7,6 L10,6'),
  meter: () => circle(9),
  // 水晶。2 枚の極板に挟まれた板。
  crystal: () => `${path('M-6,-9 L-6,9 M6,-9 L6,9')}${box(6, 14)}`,
  // ヒューズ。**線が箱を貫く** (図と同じ) — 溶断線が中を通っているのが記号。
  // 線は記号の側で引く。箱は地の色で塗るので、下を通る引き込み線は隠れる
  // (実機で「fuse は中心線を表示する」)。
  fuse: () => `${box(16, 8)}${path('M-8,0 L8,0')}`,
  // ランプ。丸に斜め十字。
  lamp: () => `${circle(8)}${path('M-5.7,-5.7 L5.7,5.7 M5.7,-5.7 L-5.7,5.7')}`,
  // スピーカー。線の上の振動板と、その上に開くホーン。
  speaker: () => path('M-7,-4 L7,-4 L7,4 L-7,4 Z M-4,-4 L-7,-10 L7,-10 L4,-4'),
  // 同軸コネクタ。丸の中の点が中心導体、外周が外皮 (図と同じ形)。
  // **外皮の丸は中心導体が入る側 (左) を開ける** — 閉じた丸だと、中心へ入る
  // 線が縁を横切って外皮 (アース) と中心がつながって見える
  // (実機で「SMA の図が間違っている。アースは中心に接続しない」)。
  coax: () => `${openCircle(8, COAX_GAP)}${element('circle', { class: 'cf-glyph-core', cx: 0, cy: 0, r: 2.2 })}`,
  // マイク。**線の上に丸が載り、天に振動板の棒**が渡る (図と同じ)。
  // 棒を底へ置くと、線と重なって丸を塞いだ別の記号になる。
  mic: () => element('circle', { class: 'cf-glyph', cx: 0, cy: -5, r: 5.5 })
    + path('M-5.5,-10.5 L5.5,-10.5'),
  // バイポーラ。**丸は付かない** (図が付けていない)。ベースの棒と 2 本の足。
  //
  // **矢はエミッタの足に付き、向きが n 形と p 形を分ける** — npn は外へ、
  // pnp は内へ (ベースの側へ)。図がそこだけで描き分けているので、こちらも分ける。
  // 足の出る辺も入れ替わる (`BJT_SIDE_P`) ので、矢は必ずエミッタの側に来る。
  bjt: () => path(`M-13,0 L-4,0 M-4,-7 L-4,7 M-4,-3 L6,-9 ${arrow(-4, 3, 6, 9)}`),
  'bjt-p': () => path(`M-13,0 L-4,0 M-4,-7 L-4,7 M-4,3 L6,9 ${arrow(6, -9, -4, -3)}`),
  // 電界効果。ゲートの棒とチャネルの棒が離れている (絶縁ゲート)。
  // **p 形はゲートに丸**が付く (図と同じ)。
  //
  // **矢はソースの足に付く。** 丸だけで n 形と p 形を分けると、升目の大きさでは
  // 読み取れない (実機で「FET の図形に必ず矢印を入れる」)。**足の出る辺が
  // 入れ替わる**ので (`FET_SIDE_P`)、ソースは n では下、p では上に来る。
  //
  // **この矢だけは向きの意味が違う。** 接合形のゲートの矢と `-e` / `-d` の
  // 基板の矢は **pn 接合の向き** (P から N へ) なので n 形が内を向くが、
  // 簡易記号のソースの矢は**電流の向き**で、バイポーラのエミッタと同じ
  // 読み方をする — だから n 形は**外**を向く。同じ n チャネルで矢が
  // 揃わないのは記号のほうの事情で、図 (circuitikz の `arrowmos`) も同じ。
  // 一度「逆では」と見て内向きに揃えたが、調べ直して戻した (2026-09-06)。
  fet: () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9 ${arrow(-3.5, 5, 3, 5)}`),
  'fet-p': () => `${path('M-13,0 L-9.5,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ` M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9 ${arrow(3, -5, -3.5, -5)}`)}${bubble(-8)}`,
  // 基板の足を出す形。**真ん中の矢が n・p を、チャネルの棒が増強形・空乏形を言う**
  // (実機で「pmos-e と pmos-d の区別が付くように実線と破線で分ける」)。
  'fet-e': () => fetBulk(CHANNEL_BROKEN, BULK_IN),
  'fet-e-p': () => fetBulk(CHANNEL_BROKEN, BULK_OUT),
  'fet-d': () => fetBulk(CHANNEL_SOLID, BULK_IN),
  'fet-d-p': () => fetBulk(CHANNEL_SOLID, BULK_OUT),
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
  capacitor: 3, ecap: 5, varicap: 4.5, inductor: HALF, transformer: 9,
  diode: 6, schottky: 6, photodiode: 6, led: 6, zener: 6, thyristor: 6, diac: 5, triac: 5,
  source: 9, 'dc-source': SOURCE_R, 'ac-source': SOURCE_R, 'square-source': SOURCE_R,
  'tri-source': SOURCE_R, 'i-source': SOURCE_R, solar: SOURCE_R, battery: 3, meter: 9,
  switch: 9, 'switch-nc': 9, button: 6, 'button-nc': 6, reed: HALF, spdt: HALF,
  crystal: 6, lamp: 8, speaker: 7, coax: 8,
  // **線が記号を貫く**ので切らない (ヒューズは溶断線、マイクは丸の底)。
  fuse: 0, mic: 0,
  bjt: 13, 'bjt-p': 13, fet: 13, 'fet-p': 13,
  'fet-e': 13, 'fet-e-p': 13, 'fet-d': 13, 'fet-d-p': 13,
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
 * 記号の**後ろ側** (足の出る -x の側) の張り出し。前後で形が違う記号だけが
 * 持ち、持たない形は `SPAN` と同じ。
 *
 * 1 つの数で両端を切ると、**短いほうの側に隙間**が空く (実機で「配線と部品の
 * 間を接続する」)。反転の丸は前にしか付かず (`nand` `nor` `not` `xnor`)、
 * ツェナーとショットキーの折れ、電解の曲がった極板、可変容量の 2 枚目の極板も
 * 片側にしか出ない。
 *
 * **測るのは足の高さでの張り出し。** ゲートの入口は上下に振ってあるので、
 * 反った背 (`or`) や重ねた弧 (`xor`) は真ん中より外側で線に当たる。
 */
const SPAN_BACK: Partial<Record<GlyphName, number>> = {
  // 極板 2 枚。前は曲がった極板の腹 (中心線の高さで 5)、後ろは真っ直ぐな 3。
  ecap: 3,
  // 三角の底。棒の折れは上下へ逃げるので、中心線には掛からない。
  zener: 6, schottky: 6,
  // 三角の底。前は 2 枚目の極板 (4.5) で止まる。
  varicap: 7,
  // 三角の背。前は先端 (8)。
  opamp: 7,
  // 極。前は接点の先 (10)。
  spdt: 9,
  // ゲートの背。**反転の丸は前にしか付かない**ので、後ろは丸の無い姿と同じ。
  and: 8, 'and-inv': 8,
  // 反った背は入口の高さ (±4.5) で -6.1 まで戻る。
  or: 6, 'or-inv': 6,
  // もう 1 本の弧が更に外側 (入口の高さで -9.6)。
  xor: 9.6, 'xor-inv': 9.6,
  // 三角の背。
  buffer: 7, 'buffer-inv': 7,
};

export const glyphSpanBack = (name: GlyphName): number => SPAN_BACK[name] ?? SPAN[name];

/**
 * 記号が**線と直交する向き**に張り出す長さ (原点から片側)。名前をその外へ
 * 置くために要る — 決め打ちの距離だと、背の高い記号 (ダイアック・水晶・
 * 電源の丸) に名前が乗る (実機で「diac の名前と図形が重なっている」)。
 *
 * **矢や光の線も入れて数える。** 胴だけで数えると、LED の矢の上に字が来る。
 * `SPAN` と同じで、形を足したときに書き忘れると型で止まる。
 */
const TALL: Record<GlyphName, number> = {
  resistor: 5, 'resistor-var': 9, potentiometer: 13, 'resistor-iec': 6, photoresistor: 13,
  capacitor: 9, ecap: 9, varicap: 7, inductor: 5, transformer: 9,
  diode: 7, schottky: 7, photodiode: 12, led: 12, zener: 10, thyristor: 8, diac: 8, triac: 9,
  source: 9, 'dc-source': 9, 'ac-source': 9, 'square-source': 9, 'tri-source': 9,
  'i-source': 9, solar: 15, battery: 8, meter: 9,
  switch: 8, 'switch-nc': 6, button: 9, 'button-nc': 8, reed: 5, spdt: 6,
  crystal: 9, fuse: 4, lamp: 8, speaker: 10, mic: 11, coax: 8,
  bjt: 9, 'bjt-p': 9, fet: 9, 'fet-p': 9, 'fet-e': 9, 'fet-e-p': 9, 'fet-d': 9, 'fet-d-p': 9,
  jfet: 9, 'jfet-p': 9, igbt: 9, 'igbt-p': 9, opamp: 9,
  and: 9, 'and-inv': 9, or: 9, 'or-inv': 9, xor: 9, 'xor-inv': 9, buffer: 9, 'buffer-inv': 9,
  ground: 8, port: 4, 'supply-up': 8, 'supply-down': 8,
  // 線そのもの。張り出さない。
  short: 0,
  // 箱は足の本数で伸びるので、呼ぶ側が測る (`reachOf`)。
  box: 12,
};

export const glyphTall = (name: GlyphName): number => TALL[name];

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
  bjt: 12, 'bjt-p': 12, fet: 12, 'fet-p': 12,
  'fet-e': 12, 'fet-e-p': 12, 'fet-d': 12, 'fet-d-p': 12,
  jfet: 12, 'jfet-p': 12, igbt: 12, 'igbt-p': 12, buffer: 12, 'buffer-inv': 12,
  ground: 12, port: 12, 'supply-up': 12, 'supply-down': 12, short: 12,
};

export const legGap = (name: GlyphName): number => LEG_GAP[name];

/**
 * 足の名前 (DIP の番号、`IN` / `OUT`、ボードの `GP0`) をどこに置くか。
 *
 * - `inside` — 胴の中。**これが既定** (実機で「すべての部品でピン名は内側に」)。
 *   外に出すと隣の升へはみ出し、部品を並べたときに名前どうしがぶつかる。
 * - `outside` — 足の先の丸の、更に外。
 * - `beside` — 足の先の丸の**脇**。記号にも足の線にも重ならない置き方。
 * - `over` — 足の**棒の上**。棒の真ん中に揃えて、胴と丸の間に収める。
 */
export type NamePlace = 'inside' | 'outside' | 'beside' | 'over';

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

/**
 * 足の名前を**丸の脇**へ出す記号。**3 本足のトランジスタが全部入る。**
 *
 * この族は胴が棒だけで、中が空いていない。中に書くと制御端子の字
 * (`G` / `B`) が棒や足の線に乗り、接合形では**ゲートの矢の上に**乗って、
 * n 形と p 形を分けているただ 1 つの印が読めなくなる (実機で
 * 「FET の G・D・S を図形と重ならないように」、続けて「NPN・PNP も同様に」
 * 「nigbt・pigbt も同様」)。
 *
 * **辺で置くので回転にそのまま乗る** — 左の足は丸の下、上下の足は丸の右。
 */
const NAMES_BESIDE: ReadonlySet<GlyphName> = new Set<GlyphName>([
  'fet', 'fet-p', 'fet-e', 'fet-e-p', 'fet-d', 'fet-d-p', 'jfet', 'jfet-p',
  'bjt', 'bjt-p', 'igbt', 'igbt-p',
  // 接点と丸の中も空いていない。切り替えスイッチは名前が接点に、同軸は
  // 中心導体に乗っていた (実機で「他の部品でもピン名が図形と重なっている
  // ものは FET 同様に」)。
  'spdt', 'coax',
  // ロジックゲートは入口の字が背の線に、出口が胴の中に乗る。
  // 出口の字は出さないが (`HIDDEN_PIN_NAMES`)、入口 2 本は残るので外へ。
  'and', 'and-inv', 'or', 'or-inv', 'xor', 'xor-inv', 'buffer', 'buffer-inv',
]);

/**
 * 足の名前を**棒の上**に書く記号。
 *
 * トランスは巻線が上下に 2 本ずつ出ていて、丸の外へ出すと巻線から遠くなり、
 * どちらの端の名前なのか読みにくい。図 (KiCad の `Transformer_1P_1S`) は
 * 番号を棒の上に置いている (実機で「ピン名の位置を変更する。図 1 に近づける」)。
 */
const NAMES_OVER: ReadonlySet<GlyphName> = new Set<GlyphName>(['transformer']);

export const namePlace = (name: GlyphName, side: PinSide): NamePlace => {
  if (NAMES_OVER.has(name)) return 'over';
  if (NAMES_BESIDE.has(name)) return 'beside';
  if (!(name in NAMES_INSIDE)) return 'inside';
  return NAMES_INSIDE[name] === side ? 'inside' : 'outside';
};

/**
 * 名前を出さない足。**形が既に言っていることを字で繰り返さない**
 * (実機で「ロジックゲートの 2 本足の部品はピン名を表示しない。3 本足の
 * `out` は非表示に」)。ゲートは三角の向きが入口と出口を言っていて、
 * 出口はどれも 1 本しか無い。2 入力の `1` と `2` は形では読めないので残す。
 *
 * **辺ではなく足の名前で指す。** 辺で指すと、回した記号 (`r90`) で
 * 消える足が入れ替わる。
 *
 * 消えるのは**字だけ**で、接続点は残る (`G1.out -- a5` と書けなくなっては困る)。
 */
const HIDDEN_PIN_NAMES: Partial<Record<GlyphName, ReadonlySet<string>>> = {
  buffer: new Set(['in', 'out']), 'buffer-inv': new Set(['in', 'out']),
  and: new Set(['out']), 'and-inv': new Set(['out']),
  or: new Set(['out']), 'or-inv': new Set(['out']),
  xor: new Set(['out']), 'xor-inv': new Set(['out']),
};

export const showsPinName = (name: GlyphName, pin: string): boolean =>
  !(HIDDEN_PIN_NAMES[name]?.has(pin) ?? false);

/**
 * 足の線を**記号の中心から**引く形。ふつうは記号の縁で止める (線が記号に
 * 重なると、コンデンサのように「切れている」という意味まで壊れる) が、
 * 同軸コネクタの中心導体は**丸の中の点まで届いているのが記号**なので、
 * 縁で止めると信号線がどこへ行くのか読めない (実機で指摘された)。
 */
const LEADS_FROM_CENTRE: Partial<Record<GlyphName, string>> = { coax: '1' };

export const leadsFromCentre = (name: GlyphName, pin: string): boolean =>
  LEADS_FROM_CENTRE[name] === pin;

/**
 * 名前を入れる箱。**足の本数で伸びる** — DIP は片側に 20 本まで出るので、
 * 決め打ちの 26x16 では足が重なって 1 本ずつ押せない。
 */
export const drawBox = (halfWidth: number, halfHeight: number): string =>
  box(halfWidth * 2, halfHeight * 2);

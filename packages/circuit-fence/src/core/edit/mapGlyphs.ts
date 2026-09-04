import { element } from 'fence-kit';

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
  | 'resistor' | 'resistor-var' | 'resistor-iec' | 'photoresistor'
  | 'capacitor' | 'ecap' | 'varicap' | 'inductor'
  | 'diode' | 'led' | 'zener' | 'thyristor' | 'diac' | 'triac'
  | 'source' | 'battery' | 'switch' | 'switch-nc' | 'button' | 'button-nc'
  | 'reed' | 'spdt' | 'meter'
  | 'crystal' | 'fuse' | 'lamp' | 'speaker' | 'mic' | 'transformer'
  | 'bjt' | 'fet' | 'opamp'
  | 'and' | 'and-inv' | 'or' | 'or-inv' | 'xor' | 'xor-inv' | 'buffer' | 'buffer-inv'
  | 'ground' | 'port' | 'supply-up' | 'supply-down' | 'short' | 'box';

/** 描く形と、中に入れる 1 文字 (計器の A・V など)。 */
export type Glyph = { readonly name: GlyphName; readonly mark: string | null };

/** 記号に寄せる表。ここに無い種類は箱になる。 */
const SHAPES: Record<string, GlyphName> = {
  resistor: 'resistor',
  'resistor-var': 'resistor-var', potentiometer: 'resistor-var',
  // **感温・感圧は箱**。図が IEC の箱で描くので、折れ線に寄せない。
  thermistor: 'resistor-iec', 'thermistor-ntc': 'resistor-iec',
  'thermistor-ptc': 'resistor-iec', varistor: 'resistor-iec',
  photoresistor: 'photoresistor',
  capacitor: 'capacitor', ecap: 'ecap', varicap: 'varicap',
  inductor: 'inductor', transformer: 'transformer',
  diode: 'diode', schottky: 'diode', photodiode: 'diode',
  led: 'led', zener: 'zener', diac: 'diac',
  thyristor: 'thyristor', triac: 'triac',
  vsource: 'source', sine: 'source', square: 'source', triangle: 'source',
  isource: 'source', solar: 'source', battery: 'battery',
  switch: 'switch', 'switch-nc': 'switch-nc',
  button: 'button', 'button-nc': 'button-nc', reed: 'reed', spdt: 'spdt',
  ammeter: 'meter', voltmeter: 'meter', ohmmeter: 'meter',
  wattmeter: 'meter', galvanometer: 'meter', detector: 'meter',
  crystal: 'crystal', fuse: 'fuse', lamp: 'lamp', speaker: 'speaker', mic: 'mic',
  npn: 'bjt', pnp: 'bjt',
  nmos: 'fet', pmos: 'fet', njfet: 'fet', pjfet: 'fet',
  'nmos-e': 'fet', 'pmos-e': 'fet', 'nmos-d': 'fet', 'pmos-d': 'fet',
  nigbt: 'fet', pigbt: 'fet',
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
const MARKS: Record<string, string> = {
  ammeter: 'A', voltmeter: 'V', ohmmeter: 'Ω',
  wattmeter: 'W', galvanometer: 'G', detector: 'D',
  vsource: '+', isource: 'I',
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

/** 押しボタンの 2 つの接点。**離れているのが「切れている」の目印**。 */
const contacts = (): string =>
  element('circle', { class: 'cf-glyph', cx: -5, cy: 0, r: 1.6 })
  + element('circle', { class: 'cf-glyph', cx: 5, cy: 0, r: 1.6 });

/** 反転の丸 (NAND・NOR・NOT の出口)。**これが有る無しが唯一の違い**。 */
const bubble = (cx: number): string =>
  element('circle', { class: 'cf-glyph', cx, cy: 0, r: 2.5 });

const SHAPE: Record<GlyphName, () => string> = {
  // 折れ線。circuitikz の既定 (米国式) と同じ姿にする。
  resistor: () => path('M-10,0 L-8.3,-5 L-5,5 L-1.7,-5 L1.7,5 L5,-5 L8.3,5 L10,0'),
  // 可変。折れ線を斜めの矢が貫く。
  'resistor-var': () =>
    `${SHAPE.resistor()}${path('M-8,8 L8,-8 M8,-8 L3.5,-7 M8,-8 L7,-3.5')}`,
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
  // 発光。外へ出る 2 本の矢。
  led: () => `${SHAPE.diode()}${path('M0,-6 L4,-10 M4,-10 L1.4,-9.5 M4,-10 L3.5,-7.4'
    + ' M4,-4 L8,-8 M8,-8 L5.4,-7.5 M8,-8 L7.5,-5.4')}`,
  // ツェナー。棒の両端が折れる。
  zener: () => `${path('M-6,-7 L6,0 L-6,7 Z')}${path('M9,-10 L6,-7 L6,7 L3,10')}`,
  // サイリスタ。棒からゲートが 1 本 (実物が上下非対称)。
  thyristor: () => `${SHAPE.diode()}${path('M6,-2 L12,-8')}`,
  // ダイアック。向かい合う三角 (どちら向きにも流れる)。
  diac: () => path('M-8,-7 L-8,7 L2,0 Z M8,7 L8,-7 L-2,0 Z'),
  // トライアック。ダイアックにゲートが 1 本。
  triac: () => `${SHAPE.diac()}${path('M6,-4 L12,-9')}`,
  source: () => circle(9),
  // 電池。長い極板と短い極板が 2 組 (丸ではない — 図が丸で描いていない)。
  battery: () => path('M-5,-8 L-5,8 M-1.5,-4 L-1.5,4 M2,-8 L2,8 M5.5,-4 L5.5,4'),
  // 開いた接点。閉じた形にすると「切れる部品」に見えない。
  switch: () => path('M-9,0 L5,-8'),
  // b 接点。閉じたまま、開く先を短い棒で示す。
  'switch-nc': () => path('M-9,0 L9,0 M7,-7 L7,-1'),
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
  // マイク。線に丸が載り、線が丸の底を塞ぐ。
  mic: () => element('circle', { class: 'cf-glyph', cx: 0, cy: -4, r: 6 })
    + path('M-6,2 L6,2'),
  // バイポーラ。**丸は付かない** (図が付けていない)。ベースの棒・2 本の足・
  // エミッタの矢。npn と pnp の違いは矢の向きだけなので、この大きさでは分けない。
  bjt: () => path('M-13,0 L-4,0 M-4,-7 L-4,7 M-4,-3 L6,-9 M-4,3 L6,9'
    + ' M6,9 L2.2,7.9 M6,9 L4.1,5.3'),
  // 電界効果。ゲートの棒とチャネルの棒が離れている (絶縁ゲート)。
  fet: () => path('M-13,0 L-7,0 M-7,-7 L-7,7 M-3.5,-7 L-3.5,7'
    + ' M-3.5,-5 L6,-5 L6,-9 M-3.5,5 L6,5 L6,9'),
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
  resistor: HALF, 'resistor-var': HALF, 'resistor-iec': HALF, photoresistor: HALF,
  capacitor: 3, ecap: 6, varicap: 7, inductor: HALF, transformer: 9,
  diode: 6, led: 6, zener: 9, thyristor: 6, diac: 8, triac: 8,
  source: 9, battery: 5.5, meter: 9,
  switch: 9, 'switch-nc': 9, button: 6, 'button-nc': 6, reed: HALF, spdt: HALF,
  crystal: 6, fuse: 8, lamp: 8, speaker: 7, mic: 6,
  bjt: 13, fet: 13, opamp: 8,
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
  resistor: 12, 'resistor-var': 12, 'resistor-iec': 12, photoresistor: 12,
  capacitor: 12, ecap: 12, varicap: 12, inductor: 12,
  diode: 12, led: 12, zener: 12, thyristor: 12, diac: 12, triac: 12,
  source: 12, battery: 12, meter: 12,
  switch: 12, 'switch-nc': 12, button: 12, 'button-nc': 12, reed: 12,
  crystal: 12, fuse: 12, lamp: 12, speaker: 12, mic: 12,
  bjt: 12, fet: 12, buffer: 12, 'buffer-inv': 12,
  ground: 12, port: 12, 'supply-up': 12, 'supply-down': 12, short: 12,
};

export const legGap = (name: GlyphName): number => LEG_GAP[name];

/**
 * 名前を入れる箱。**足の本数で伸びる** — DIP は片側に 20 本まで出るので、
 * 決め打ちの 26x16 では足が重なって 1 本ずつ押せない。
 */
export const drawBox = (halfWidth: number, halfHeight: number): string =>
  box(halfWidth * 2, halfHeight * 2);

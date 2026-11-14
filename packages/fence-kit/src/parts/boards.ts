/**
 * 基板に挿すマイコンボード。ピン名は**実物のピンアウトの印字そのまま**にする。
 * 図に出る名前と配線に書く名前が同じでなければ、図と回路を突き合わせられないため。
 *
 * **表だけを共有する。** 描き方は基板ごとに違う (ブレッドボードは溝をまたぎ、
 * ユニバーサル基板は穴の上に載る) が、**どのボードに何番のピンがあるか**は
 * 同じもの。片方に足したらもう片方が古くなる、を避けるためにここへ置く。
 */
export type BoardPart = {
  /** 部品リストと図に出す製品名。 */
  readonly name: string;
  readonly chip: string;
  /** 無線モジュールを載せた版か (図では USB と反対の端のアンテナで示す)。 */
  readonly wireless: boolean;
  /** 無線の代わりに、USB と反対の端に HDMI コネクタが付く版か (Tang Nano 9K)。 */
  readonly hdmi: boolean;
  /** ピンの 2 列の間隔 (ピッチ数)。Pico は 0.7 インチ = 7、Tang Nano 9K は 22.8 mm = 9。 */
  readonly rowSpan: number;
  /** 基板の縁がピン列の端から外へ出る量 (ピッチ数)。Pico は 0.55、Tang Nano 9K は USB と HDMI の分だけ長い。 */
  readonly reach: number;
  /** 回路図の箱の中に書く字。無ければ種類名 (長い種類名はピンの名前とぶつかるので、チップの名前に替える)。 */
  readonly mark?: string;
  /** ピンの名前。**1 番から順に** (DIP と同じ回り方: 1 列目を進み、折り返して 2 列目を戻る)。 */
  readonly pins: readonly string[];
  /**
   * 40 ピンとは別の、デバッグ用の 3 ピンのパッド (SWD)。**基板の穴には挿さらない**ので、
   * ブレッドボードではボード外の機器のピンと同じく線の端としてだけ指す (`MCU.SWCLK`)。
   * 無ければ持たない (Tang Nano 9K)。
   */
  readonly debug?: BoardDebug;
};

/**
 * デバッグ用のパッドの並びと位置。
 *
 * - `pads` は **1〜n/2 番の列の側から**順に (Pico は SWCLK・GND・SWDIO)。間は 0.1 インチ = 1 ピッチで、
 *   真ん中のパッドが 2 列の真ん中に来る
 * - `along` は n/2 番 (Pico の 20 番) のピンの位置から 1 番の側へ戻る量 (ピッチ数)。負なら端の側へ出る
 */
export type BoardDebug = { readonly pads: readonly string[]; readonly along: number };

/**
 * Raspberry Pi Pico の 40 ピンヘッダ。上から順に 1 番 (GP0) から 40 番 (VBUS) まで。
 * GND は 7 本あって名前が重なるので、**ピン番号を付けて区別する** (`GND3` は 3 番の GND)。
 * 33 番だけは実物の印字が AGND なのでそのまま使う。
 * Pico 2 (RP2350) は Pico と同じ並びなので、シリーズで 1 つの表を共有する。
 */
const PICO_PINS: readonly string[] = [
  'GP0', 'GP1', 'GND3', 'GP2', 'GP3', 'GP4', 'GP5', 'GND8', 'GP6', 'GP7',
  'GP8', 'GP9', 'GND13', 'GP10', 'GP11', 'GP12', 'GP13', 'GND18', 'GP14', 'GP15',
  'GP16', 'GP17', 'GND23', 'GP18', 'GP19', 'GP20', 'GP21', 'GND28', 'GP22', 'RUN',
  'GP26', 'GP27', 'AGND', 'GP28', 'ADC_VREF', '3V3', '3V3_EN', 'GND38', 'VSYS', 'VBUS',
];

/** Pico の外形。列の間 0.7 インチ、縁は端のピンから 0.55 ピッチ。 */
const PICO_SHAPE = { hdmi: false, rowSpan: 7, reach: 0.55 } as const;

/**
 * Pico シリーズの SWD のパッド (3 ピン、0.1 インチ)。公式のピンアウト図 (USB が上) で
 * **左から SWCLK・GND・SWDIO**、SWCLK が 1〜20 番の列の側 (Pico 2 / Pico W / Pico 2 W の
 * データシートの Figure 2)。GND は 40 ピンの GND と名前が重なるので `SWGND` と呼ぶ
 * (`GND3` と同じく、名前だけで指せるようにする。`SW` で始まる 3 本が書き間違いの候補にそろって出る)。
 *
 * - Pico / Pico 2 は **USB と反対の端**。データシートの寸法図で端から 1.6 mm (20 番・21 番の
 *   ピンの中心は 1.37 mm で、ほぼ同じ並び)。図では 0.3 ピッチ端へ寄せる (`along: -0.3`) —
 *   ピンと同じ位置だと、20 番・21 番のピンの名前の縦書きに輪が重なる
 * - Pico W / Pico 2 W は端にアンテナがあるので**中ほど** (端から 19.8 mm、20 番から 7.3 ピッチ)。
 *   図では 6.5 ピッチ (13 番と 14 番の間) に置く — 実物の位置だとパッドの名前が
 *   RP2040 / RP2350 の箱にかかる
 */
const PICO_DEBUG: BoardDebug = { pads: ['SWCLK', 'SWGND', 'SWDIO'], along: -0.3 };
const PICO_W_DEBUG: BoardDebug = { ...PICO_DEBUG, along: 6.5 };

/**
 * Sipeed Tang Nano 9K (Gowin GW1NR-9) の 2×24 ヘッダ。**1 番は USB-C 側の左上**、
 * 左の列を下へ 24 本、折り返して右の列を上へ 24 本。
 * 名前は Sipeed の wiki のピン配置図の **FPGA のピン番号に `IO` を付けた物** (`IO38`)。
 * 数字だけだと、ピンの番号 (`01`〜`48`) と見分けられない。電源の 3 本は印字どおり。
 * 右の列の `IO79`〜`IO86` は BANK3 で **1.8 V** (ほかの IO は 3.3 V)。
 * 出典: wiki のピン配置図と寸法図 (列の間 22.8169 mm = 9 ピッチ、基板 26.0 × 70.0 mm)。
 */
const TANG_NANO_9K_PINS: readonly string[] = [
  'IO38', 'IO37', 'IO36', 'IO39', 'IO25', 'IO26', 'IO27', 'IO28', 'IO29', 'IO30', 'IO33', 'IO34',
  'IO40', 'IO35', 'IO41', 'IO42', 'IO51', 'IO53', 'IO54', 'IO55', 'IO56', 'IO57', 'IO68', 'IO69',
  '3V3', 'GND', 'IO32', 'IO31', 'IO49', 'IO48', '5V', 'IO70', 'IO71', 'IO72', 'IO73', 'IO74',
  'IO75', 'IO76', 'IO77', 'IO79', 'IO80', 'IO81', 'IO82', 'IO83', 'IO84', 'IO85', 'IO86', 'IO63',
];

const BOARD_PARTS: Record<string, BoardPart> = {
  pico: { name: 'Pico', chip: 'RP2040', wireless: false, ...PICO_SHAPE, pins: PICO_PINS, debug: PICO_DEBUG },
  'pico-w': { name: 'Pico W', chip: 'RP2040', wireless: true, ...PICO_SHAPE, pins: PICO_PINS, debug: PICO_W_DEBUG },
  pico2: { name: 'Pico 2', chip: 'RP2350', wireless: false, ...PICO_SHAPE, pins: PICO_PINS, debug: PICO_DEBUG },
  'pico2-w': { name: 'Pico 2 W', chip: 'RP2350', wireless: true, ...PICO_SHAPE, pins: PICO_PINS, debug: PICO_W_DEBUG },
  'tang-nano-9k': {
    name: 'Tang Nano 9K', chip: 'GW1NR-9', wireless: false, hdmi: true, rowSpan: 9, reach: 2.28, mark: 'GW1NR', pins: TANG_NANO_9K_PINS,
  },
};

export const boardPartNames = (): readonly string[] => Object.keys(BOARD_PARTS);

/**
 * 種類名は入力から来るので、必ず自分の持ち物だけを引く (`render/palette.ts` と同じ理由)。
 * 素の添字だと `constructor` が Object.prototype から拾えてしまう。
 */
export const lookupBoardPart = (type: string): BoardPart | null =>
  Object.hasOwn(BOARD_PARTS, type) ? BOARD_PARTS[type] ?? null : null;

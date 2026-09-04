/**
 * 板に挿すマイコンボード。ピン名は**実物のピンアウトの印字そのまま**にする。
 * 図に出る名前と配線に書く名前が同じでなければ、図と回路を突き合わせられないため。
 *
 * **表だけを共有する。** 描き方は板ごとに違う (ブレッドボードは溝をまたぎ、
 * ユニバーサル基板は穴の上に載る) が、**どのボードに何番のピンがあるか**は
 * 同じもの。片方に足したらもう片方が古くなる、を避けるためにここへ置く。
 */
export type BoardPart = {
  /** 部品リストと図に出す製品名。 */
  readonly name: string;
  readonly chip: string;
  /** 無線モジュールを載せた版か (図では USB と反対の端のアンテナで示す)。 */
  readonly wireless: boolean;
  /** ピン 1 から 40 までの名前。 */
  readonly pins: readonly string[];
};

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

const BOARD_PARTS: Record<string, BoardPart> = {
  pico: { name: 'Pico', chip: 'RP2040', wireless: false, pins: PICO_PINS },
  'pico-w': { name: 'Pico W', chip: 'RP2040', wireless: true, pins: PICO_PINS },
  pico2: { name: 'Pico 2', chip: 'RP2350', wireless: false, pins: PICO_PINS },
  'pico2-w': { name: 'Pico 2 W', chip: 'RP2350', wireless: true, pins: PICO_PINS },
};

export const boardPartNames = (): readonly string[] => Object.keys(BOARD_PARTS);

/**
 * 種類名は入力から来るので、必ず自分の持ち物だけを引く (`render/palette.ts` と同じ理由)。
 * 素の添字だと `constructor` が Object.prototype から拾えてしまう。
 */
export const lookupBoardPart = (type: string): BoardPart | null =>
  Object.hasOwn(BOARD_PARTS, type) ? BOARD_PARTS[type] ?? null : null;

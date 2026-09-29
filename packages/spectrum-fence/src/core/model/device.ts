/**
 * 機種の表。**計器の型 (`kind`) が計算の道を決める** (52 の docs/88 §1):
 *
 * - `fft` — 波形を標本化して窓を掛け FFT (Analog Discovery の Spectrum)。窓・点数・リークが題
 * - `swept` — 線スペクトルを受信機 (RBW・ATT・LNA・フロア) でなぞる (tinySA)
 *
 * **「要確認」と書いた値は記憶か仕様表の読みで置いた仮の値。** AD2 と tinySA Ultra の
 * 実機で確かめてから直す (52 の docs/88 §9)。
 */
export type DeviceKind = 'fft' | 'swept';

export type LevelUnit = 'dBV' | 'dBm';

/**
 * 受信機の分解能帯域。`choices` は実機のメニューにある値 (auto はこの中から選ぶ)。
 * `free` なら範囲の中の値を何でも受ける (generic)。そうでなければ選択肢の値だけ。
 */
export type RbwSpec = { readonly min: number; readonly max: number; readonly choices: readonly number[]; readonly free?: boolean };

/** 表示の雑音の床 (DANL)。**この RBW・この周波数で、ATT 0・LNA 無しの値** (dBm)。 */
export type Danl = { readonly level: number; readonly rbw: number };

export type Device = {
  readonly kind: DeviceKind;
  /** 状態の行に出す名 (`AD2` `tinySA Ultra`)。 */
  readonly label: string;
  /** 測れる範囲 (Hz)。外を掃引したらお知らせ (図は描く)。 */
  readonly range: { readonly min: number; readonly max: number };
  /** 掃引型の点数。`choices` が空なら min〜max の整数を受ける (generic)。 */
  readonly points?: { readonly choices: readonly number[]; readonly default: number };
  /** FFT 型の標本の数の既定。 */
  readonly samples?: { readonly default: number };
  readonly rbw?: RbwSpec;
  readonly danl?: Danl;
  /** LNA の利得 (dB)。無ければ LNA を持たない機種。 */
  readonly lnaGain?: number;
  /** アッテネータの上限 (dB)。 */
  readonly attenMax?: number;
  /** 入力の上限。掃引型は dBm (線の電力の和)、FFT 型は V (波の peak の和)。 */
  readonly maxInput?: { readonly dbm?: number; readonly volts?: number };
  /** 表示の既定の単位と、上端 (ref) の既定 (その単位で)。 */
  readonly defaultUnit: LevelUnit;
  readonly defaultRef: number;
};

/** tinySA Ultra の RBW の選択肢 (公式 wiki のメニュー。Hz)。 */
const ULTRA_RBW = [200, 1e3, 3e3, 10e3, 30e3, 100e3, 300e3, 600e3, 850e3];
/** tinySA (Basic) の RBW の選択肢 (要確認)。 */
const BASIC_RBW = [3e3, 10e3, 30e3, 100e3, 300e3, 600e3];
/** generic の RBW の選択肢 (1-3 の並び、1 Hz〜10 MHz)。 */
const GENERIC_RBW = Array.from({ length: 15 }, (_, index) => (index % 2 === 0 ? 1 : 3) * 10 ** Math.floor(index / 2));

export const DEVICES = {
  // AD2: 14 bit・100 MS/s・±25 V・1 MΩ ‖ 24 pF。範囲は **BNC アダプター使用時の −3 dB 帯域 (30 MHz+)**
  // (Digilent の AD2 製品仕様。ヘッダーに直付けの帯域は未確認)。samples の既定 8192 (要確認)。
  ad2: {
    kind: 'fft', label: 'AD2', range: { min: 0, max: 30e6 }, samples: { default: 8192 },
    maxInput: { volts: 25 }, defaultUnit: 'dBV', defaultRef: 0,
  },
  // AD3: 14 bit・125 MS/s・±25 V・1 MΩ ‖ 24 pF。範囲は **BNC アダプター使用時の −3 dB 帯域 30 MHz+**
  // (−0.5 dB は 15 MHz、−0.1 dB は 6 MHz)。**BNC 無しの 2×15 ヘッダーは −3 dB で 9 MHz** (−0.5 dB は 2.9 MHz)。
  // WaveForms は標本化の 1/4 (31.25 MHz) まで設定できるが、結果はアナログ帯域で決まる。
  // 出典: Digilent AD3 Specifications / Reference Manual (Rev. 11/2023)。
  ad3: {
    kind: 'fft', label: 'AD3', range: { min: 0, max: 30e6 }, samples: { default: 8192 },
    maxInput: { volts: 25 }, defaultUnit: 'dBV', defaultRef: 0,
  },
  // Basic の DANL は Ultra と同じ仮の値 (要確認)。REF LEVEL の既定 −10 dBm も要確認。
  // START は 0 Hz から書ける (実機も 0 Hz から掃引できる。仕様の下限 100 kHz より下は校正の外 — 要確認)。
  tinysa: {
    kind: 'swept', label: 'tinySA', range: { min: 0, max: 960e6 },
    points: { choices: [51, 101, 145, 290], default: 290 },
    rbw: { min: 3e3, max: 600e3, choices: BASIC_RBW }, danl: { level: -102, rbw: 30e3 },
    attenMax: 31, maxInput: { dbm: 10 }, defaultUnit: 'dBm', defaultRef: -10,
  },
  // 仕様: LNA 無し・30 MHz・RBW 30 kHz で −102 dBm、入力の絶対最大 +6 dBm (推奨は +0 dBm 以下、DC ±5 V)。
  // 範囲は ULTRA モードの 6 GHz まで (通常は 100 kHz〜800 MHz。直線性は 5.3 GHz まで ±2 dB、6 GHz まで ±5 dB)。
  // 出典: https://www.tinysa.org/wiki/pmwiki.php?n=TinySA4.SpecificationLNA の利得 20 dB は要確認。
  'tinysa-ultra': {
    kind: 'swept', label: 'tinySA Ultra', range: { min: 0, max: 6e9 },
    points: { choices: [51, 101, 145, 290, 450], default: 450 },
    rbw: { min: 200, max: 850e3, choices: ULTRA_RBW }, danl: { level: -102, rbw: 30e3 }, lnaGain: 20,
    attenMax: 31.5, maxInput: { dbm: 6 }, defaultUnit: 'dBm', defaultRef: -10,
  },
  // 他社の据え置きや SDR 用。フロアは floor: で書く (無ければ −100 dBm)。
  generic: {
    kind: 'swept', label: 'Generic', range: { min: 0, max: 10e9 },
    points: { choices: [], default: 450 },
    rbw: { min: 1, max: 10e6, choices: GENERIC_RBW, free: true },
    attenMax: 70, defaultUnit: 'dBm', defaultRef: -10,
  },
} as const satisfies Record<string, Device>;

export type DeviceName = keyof typeof DEVICES;

export const DEVICE_NAMES = Object.keys(DEVICES) as readonly DeviceName[];

export const isDeviceName = (name: string): name is DeviceName => Object.hasOwn(DEVICES, name);

export const deviceOf = (name: DeviceName): Device => DEVICES[name];

/** generic で floor: を書かなかったときのフロア (dBm)。 */
export const GENERIC_FLOOR = -100;

/** `device:` が無い・読めないときの言い方。**受ける綴りを全部並べる**。 */
export const DEVICE_HINT = `device: は ${DEVICE_NAMES.join(' / ')} のどれかを書きます (計算の仕方が変わります)`;

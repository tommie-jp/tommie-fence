/**
 * 機種の表。**本数と標本化の上限だけを持つ** (レーンの高さや色は機種で変わらない)。
 *
 * - `ad3` — Analog Discovery 3 の Logic Analyzer。DIO 16 本 (LVCMOS 3.3 V、5 V 耐性)、
 *   標本化は最大 125 MS/s、バッファは 1 本あたり最大 32,768 標本 (WaveForms の Device Manager の
 *   選択肢。これを越える窓は Record モードが要る)。出典: Digilent AD3 Specifications
 *   (Rev. 11/2023) の Digital Channels
 * - `generic` — 他社のロジックアナライザや、機種を決めない図。標本化とバッファは検査しない
 */
export type Device = {
  /** 状態の行に出す名 (`AD3`)。 */
  readonly label: string;
  /** 使えるレーンの本数。 */
  readonly channels: number;
  /** 標本化の上限 (Hz)。null なら検査しない。 */
  readonly maxSampleRate: number | null;
  /** 1 本あたりのバッファ (標本)。null なら検査しない。 */
  readonly buffer: number | null;
};

export const DEVICES = {
  ad3: { label: 'AD3', channels: 16, maxSampleRate: 125e6, buffer: 32768 },
  generic: { label: 'Generic', channels: 32, maxSampleRate: null, buffer: null },
} as const satisfies Record<string, Device>;

export type DeviceName = keyof typeof DEVICES;

export const DEVICE_NAMES = Object.keys(DEVICES) as readonly DeviceName[];

export const isDeviceName = (name: string): name is DeviceName => Object.hasOwn(DEVICES, name);

export const deviceOf = (name: DeviceName): Device => DEVICES[name];

/** `device:` が無い・読めないときの言い方。**受ける綴りを全部並べる**。 */
export const DEVICE_HINT = `device: は ${DEVICE_NAMES.join(' / ')} のどれかを書きます (本数と標本化の検査が変わります)`;

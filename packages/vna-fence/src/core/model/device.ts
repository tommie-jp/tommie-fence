import { formatHertzShort } from './frequency.ts';

/**
 * 機種と測れる範囲 (52 の docs/68 §1)。**図の絵は変えない** — 範囲の外を掃引して
 * いないかを言うためだけに持つ。
 */
export const DEVICES = {
  h4: { label: 'NanoVNA-H4', min: 50e3, max: 1.5e9 },
  v2: { label: 'NanoVNA V2', min: 50e3, max: 3e9 },
  plus4: { label: 'NanoVNA V2 Plus4', min: 50e3, max: 4.4e9 },
} as const;

export type DeviceName = keyof typeof DEVICES;

export const DEVICE_NAMES = Object.keys(DEVICES) as readonly DeviceName[];

export const DEFAULT_DEVICE: DeviceName = 'h4';

export const isDeviceName = (name: string): name is DeviceName => Object.hasOwn(DEVICES, name);

/** 掃引が機種の範囲を外れていれば、その言い方。収まっていれば null。 */
export function rangeNotice(device: DeviceName, start: number, stop: number): string | null {
  const { label, min, max } = DEVICES[device];
  if (stop > max) {
    return `${label} は ${formatHertzShort(max)} までです (掃引の終わりが ${formatHertzShort(stop)})`;
  }
  if (start < min) {
    return `${label} は ${formatHertzShort(min)} からです (掃引の始めが ${formatHertzShort(start)})`;
  }
  return null;
}

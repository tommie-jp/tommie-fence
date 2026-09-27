import { formatHertzShort } from 'fence-kit';
import type { SpectralLine } from 'fence-kit';
import { GENERIC_FLOOR } from './device.ts';
import type { Device } from './device.ts';
import { dbmFromDbv, dbvFromPeak, formatSetting, powerSum } from './level.ts';

/**
 * 掃引型の受信機。**フロア = 機種の DANL + 10 log10(RBW ÷ 基準の RBW) + ATT − LNA の利得**
 * (52 の docs/86 決め 5)。アッテネータは信号の読みを変えず (実機が補正する)、フロアだけ上げる。
 * 理想のフロアは平ら (揺らさない — 同じ入力は同じ出力)。
 */
export type Receiver = { readonly rbw: number; readonly atten: number; readonly lna: boolean; readonly floor: number };

/** フロア (dBm)。generic は `floor:` (無ければ −100 dBm) に ATT を足す。 */
export function floorOf(device: Device, rbw: number, atten: number, lna: boolean, written: number | null): number {
  const lnaGain = lna ? device.lnaGain ?? 0 : 0;
  if (device.danl === undefined) return (written ?? GENERIC_FLOOR) + atten - lnaGain;
  return device.danl.level + 10 * Math.log10(rbw / device.danl.rbw) + atten - lnaGain;
}

/**
 * RBW の auto。**仮の規則: 掃引の幅 ÷ 点数 以上の選択肢のうち最小** (実機の規則は要確認)。
 * 選択肢に届かなければ一番広いもの。
 */
export function autoRbw(device: Device, span: number, points: number): number {
  const choices = device.rbw?.choices ?? [];
  const raw = span / points;
  return choices.find((one) => one >= raw) ?? choices.at(-1) ?? raw;
}

/** RBW の検査。選べない値なら理由 (受ける値の一覧)。 */
export function rbwProblem(device: Device, rbw: number): string | null {
  const spec = device.rbw;
  if (spec === undefined) return null;
  if (spec.free === true) {
    return rbw >= spec.min && rbw <= spec.max ? null : `${device.label} の RBW は ${formatHertzShort(spec.min)}〜${formatHertzShort(spec.max)} です`;
  }
  return spec.choices.includes(rbw) ? null : `${device.label} の RBW は ${spec.choices.map((one) => formatHertzShort(one)).join(' / ')} から選びます`;
}

/** 線 1 本の電力 (dBm、50 Ω)。0 Hz は直流 (rms = |値|)。 */
export const lineDbm = (line: SpectralLine): number =>
  dbmFromDbv(line.frequency === 0 ? (line.amplitude === 0 ? -200 : 20 * Math.log10(Math.abs(line.amplitude))) : dbvFromPeak(line.amplitude));

/** 線の電力の和が入力の上限を超えていれば、その言い方。 */
export function inputNotice(device: Device, lines: readonly SpectralLine[]): string | null {
  const limit = device.maxInput?.dbm;
  if (limit === undefined || lines.length === 0) return null;
  const total = powerSum(lines.map(lineDbm));
  if (total <= limit) return null;
  return `入力の上限 ${formatSetting(limit, 'dBm').replace(/^(?!−)/, '+')} を超えています (信号の電力の和が ${formatSetting(Math.round(total * 10) / 10, 'dBm').replace(/^(?!−)/, '+')}。アッテネータを先に入れます)`;
}

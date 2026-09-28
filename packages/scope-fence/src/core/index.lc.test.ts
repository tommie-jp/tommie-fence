import { describe, expect, test } from 'vitest';
import { renderScope } from './index.ts';

/** 読み値の行 (`CH2  2.50 V  1.56 mV`) の値を V で。 */
const valuesOf = (lines: readonly string[], name: string): readonly number[] => {
  const line = lines.find((one) => one.startsWith(name)) ?? '';
  const scale: Readonly<Record<string, number>> = { m: 1e-3, µ: 1e-6, '': 1 };
  return [...line.matchAll(/(-?\d+(?:\.\d+)?) (m|µ)?V/g)].map((match) => Number(match[1]) * (scale[match[2] ?? ''] ?? 1));
};

/**
 * 10-3 のチョッパ: 0/5 V・100 kHz・D = 50 % の方形波を L = 100 µH・C = 100 µF・負荷 R = 10 Ω の
 * LC に通す。f0 = 1/(2π√(LC)) = 1.59 kHz、Q = R·√(C/L) = 10。
 *
 * 出力の平均は D·V = 2.5 V。リップルは小リップルの近似 (L の電流の振れ ΔI = V·D(1−D)/(L·f)
 * が全部 C に流れ、C の電圧は 1 周期に ΔI/(8·f·C) だけ振れる) で
 * ΔV = D(1−D)·V / (8·L·C·f²) = 0.25 × 5 / (8 × 1e-8 × 1e10) = 1.5625 mV。
 * (1−D)·Vout/(8LCf²) と書いても同じ (Vout = D·V)。近似は f ≫ f0 (ここで 63 倍) と
 * 負荷の電流の振れを無視すること — 1.59kHz と f0 の丸め (0.1 %) を含めて 10 % で合わせる。
 * time: 20us/div は助走 (10·Q/(π f0) = 20 ms) が点の上限に収まる速さ (点の間隔 24 ns)。
 */
const CHOPPER = [
  'time: 20us/div',
  'trigger: ch1 rising 2.5V',
  'ch1: square 100kHz 2.5V offset 2.5V',
  'ch2: ch1 | lc 1.59kHz 10',
  'measure: [avg, vpp]',
].join('\n');

describe('renderScope — lc', () => {
  test('the chopper output averages D·V = 2.5 V with the small-ripple Vpp (1.56 mV)', () => {
    const result = renderScope(CHOPPER);
    expect(result.errors).toEqual([]);
    expect(result.notices).toEqual([]);
    const [avg = NaN, vpp = NaN] = valuesOf(result.readingLines, 'CH2');
    expect(avg).toBeCloseTo(2.5, 2);
    expect(Math.abs(vpp - 1.5625e-3) / 1.5625e-3).toBeLessThan(0.1);
  });

  test('says so when the step is coarser than 1/(20 f0)', () => {
    const result = renderScope('time: 1ms/div\ntrigger: ch1 rising 0V\nch1: sine 1kHz 1V\nch2: ch1 | lc 100kHz 1');
    expect(result.notices.map((one) => one.message)).toContain(
      'lc の f0 (100 kHz) に比べて画面の点の間隔 (1.221 µs) が 1/(20 f0) = 500.0 ns より粗いので、共振のあたりは正しく描けていません (time: を速くします)',
    );
  });

  test('says the warm-up was cut when the LC rings longer than the sample limit allows', () => {
    const result = renderScope(CHOPPER.replace('20us/div', '5us/div'));
    expect(result.notices.map((one) => one.message).join('\n')).toContain('定常まで回しきれていません');
  });
});

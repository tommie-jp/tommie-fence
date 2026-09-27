import { describe, expect, test } from 'vitest';
import { headroomNotice } from './headroom.ts';

const at = (level: number, f = 10e6) => ({ f, level, at: f });
const say = (level: number, ref: number, scale = 10, unit: 'dBm' | 'dBV' = 'dBm'): string | null =>
  headroomNotice({ peak: at(level), ref, scale, unit, line: null })?.message ?? null;

describe('headroomNotice — 山が低すぎる', () => {
  test('says how many divisions the peak sits below REF, and which ref: puts it 1〜2 divisions down', () => {
    expect(say(-52.1, -20)).toBe('一番高い山 (−52.10 dBm、10.000 MHz) は REF (−20 dBm) より 3.2 目盛下です (ref: -40dBm なら上端から 1.2 目盛)');
  });

  test('says nothing below 3 divisions, and speaks from exactly 3', () => {
    expect(say(-29.99, 0)).toBeNull();
    expect(say(-30, 0)).toBe('一番高い山 (−30.00 dBm、10.000 MHz) は REF (0 dBm) より 3.0 目盛下です (ref: -20dBm なら上端から 1.0 目盛)');
  });

  test('counts divisions with the written scale:, and rounds the suggestion to that scale below 10 dB', () => {
    expect(say(-52.1, 0, 5)).toBe('一番高い山 (−52.10 dBm、10.000 MHz) は REF (0 dBm) より 10.4 目盛下です (ref: -45dBm なら上端から 1.4 目盛)');
    expect(say(-30, 40, 20)).toBe('一番高い山 (−30.00 dBm、10.000 MHz) は REF (40 dBm) より 3.5 目盛下です (ref: -20dBm なら上端から 0.5 目盛)');
  });

  test('writes the suggestion in the display unit', () => {
    expect(say(-43.01, 0, 10, 'dBV')).toBe('一番高い山 (−43.01 dBV、10.000 MHz) は REF (0 dBV) より 4.3 目盛下です (ref: -30dBV なら上端から 1.3 目盛)');
  });
});

describe('headroomNotice — 山が上端で切れる', () => {
  test('says the peak is cut off and which ref: lets it in', () => {
    expect(say(-5, -10)).toBe('一番高い山 (−5.00 dBm、10.000 MHz) は REF (−10 dBm) より上で切れています (ref: 0dBm なら入ります)');
    expect(say(12.3, 0)).toBe('一番高い山 (12.30 dBm、10.000 MHz) は REF (0 dBm) より上で切れています (ref: 20dBm なら入ります)');
  });

  test('does not suggest a ref: that leaves the peak on the top line', () => {
    expect(say(0, -20)).toBe('一番高い山 (0.00 dBm、10.000 MHz) は REF (−20 dBm) より上で切れています (ref: 10dBm なら入ります)');
  });

  test('says nothing when the peak just touches REF', () => {
    expect(say(-10, -10)).toBeNull();
  });

  test('says when even the highest ref: cannot hold the peak', () => {
    expect(say(45, 30)).toBe('一番高い山 (45.00 dBm、10.000 MHz) は REF (30 dBm) より上で切れています (ref: の上限 40dBm でも入りません)');
  });
});

describe('headroomNotice — 言わないとき', () => {
  test('says nothing without a peak, or with only the bottom of the scale', () => {
    expect(headroomNotice({ peak: null, ref: 0, scale: 10, unit: 'dBm', line: null })).toBeNull();
    expect(say(-200, 0)).toBeNull();
  });

  test('points at the ref: line', () => {
    expect(headroomNotice({ peak: at(-5), ref: -10, scale: 10, unit: 'dBm', line: 4 })).toMatchObject({ line: 4, notice: true });
  });
});

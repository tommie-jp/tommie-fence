import { describe, expect, test } from 'vitest';
import { headerStepOf } from './pinGrid.ts';

/**
 * 片側にピンが並ぶ箱 (DIP・ボード・機器・ピンヘッダ) のピンの刻み (52 の docs/128)。
 * **刻みが番地 (小数 2 桁) に乗る**ので、相手の番地をピンの行に置けば `-|` がまっすぐ届く。
 */
describe('headerStepOf', () => {
  test('keeps the familiar half centimetre on the default pitch', () => {
    expect(headerStepOf(2)).toBe(0.5);
  });

  test('keeps the DIP at its old 0.48 cm on the textbook pitch of 1.2', () => {
    expect(headerStepOf(1.2)).toBeCloseTo(0.48, 10);
  });

  test('lands every step on an address written with two decimals', () => {
    for (const pitch of [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5]) {
      const cells = headerStepOf(pitch) / pitch;
      expect(Math.abs(cells * 100 - Math.round(cells * 100))).toBeLessThan(1e-9);
    }
  });

  test('never crowds the pin names below 0.4 cm', () => {
    for (const pitch of [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5]) {
      expect(headerStepOf(pitch)).toBeGreaterThanOrEqual(0.4 - 1e-9);
    }
  });
});

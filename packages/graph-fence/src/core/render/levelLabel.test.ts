import { describe, expect, test } from 'vitest';
import { levelLabelEnd } from './plot.ts';

const rect = { x: 0, y: 0, width: 400, height: 100 };

describe('levelLabelEnd', () => {
  test('keeps the label at the right end when no mark line crosses it', () => {
    expect(levelLabelEnd(rect, 40, [100])).toBe(397);
  });

  test('moves the label left of a mark line that would cross it', () => {
    expect(levelLabelEnd(rect, 40, [370])).toBe(367);
  });

  test('keeps moving left past mark lines that are close together', () => {
    expect(levelLabelEnd(rect, 40, [370, 340])).toBe(337);
  });

  test('stays at the right end when moving left would leave the frame', () => {
    expect(levelLabelEnd(rect, 40, [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390])).toBe(397);
  });
});

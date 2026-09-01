import { describe, expect, test } from 'vitest';
import { fit, textWidth } from './textFit.ts';

describe('textWidth', () => {
  test('counts a full-width character as twice a narrow one', () => {
    // 全角を英数字と同じ幅で数えると、日本語のラベルが板からはみ出して読めなくなる。
    expect(textWidth('あ')).toBeGreaterThan(textWidth('a'));
    expect(textWidth('あ')).toBe(1);
    expect(textWidth('ab')).toBeCloseTo(1.1);
  });

  test('counts by code point, so a surrogate pair is one character', () => {
    expect(textWidth('𠮷')).toBe(1);
  });

  test('is zero for an empty string', () => {
    expect(textWidth('')).toBe(0);
  });
});

describe('fit', () => {
  test('leaves text that already fits', () => {
    expect(fit('R1 10k', 100)).toBe('R1 10k');
  });

  test('cuts and marks the cut, so the value does not silently become a lie', () => {
    const cut = fit('R1 1000000000k', 5);

    expect(cut.endsWith('…')).toBe(true);
    expect(textWidth(cut)).toBeLessThanOrEqual(5);
  });

  test('keeps room for the ellipsis instead of letting it overflow', () => {
    expect(textWidth(fit('あ'.repeat(20), 6))).toBeLessThanOrEqual(6);
  });

  test('cuts everything when there is no room at all', () => {
    expect(fit('R1', 0)).toBe('…');
  });
});

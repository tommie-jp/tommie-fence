import { describe, expect, test } from 'vitest';
import { bannerHeight, errorLine, renderErrorCard } from './errorCard.ts';

const error = (message: string, line: number | null = 1) => ({ message, line });

describe('errorLine', () => {
  test('puts the line number in front of the message', () => {
    expect(errorLine(error('穴番地が読めません', 7))).toBe('7 行目: 穴番地が読めません');
  });

  test('leaves out the line number when there is none', () => {
    expect(errorLine(error('読めません', null))).toBe('読めません');
  });
});

describe('renderErrorCard', () => {
  test('returns a standalone drawing', () => {
    const svg = renderErrorCard([error('だめ')]);

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  test('wraps a long message so it stays inside the card', () => {
    const long = 'あ'.repeat(200);
    const svg = renderErrorCard([error(long)]);

    const lines = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1] ?? '');
    expect(lines.length).toBeGreaterThan(2);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(70);
  });

  test('grows the card to fit the number of lines it shows', () => {
    expect(bannerHeight([error('あ'.repeat(200))])).toBeGreaterThan(bannerHeight([error('短い')]));
  });
});

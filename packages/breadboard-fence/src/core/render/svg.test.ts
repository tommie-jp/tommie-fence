import { describe, expect, test } from 'vitest';
import { escapeXml, roundedPath } from './svg.ts';

describe('escapeXml', () => {
  test('escapes the characters that would otherwise break the markup', () => {
    expect(escapeXml('<a & "b" \'c\'>')).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;');
  });

  test('leaves plain text untouched', () => {
    expect(escapeXml('NJM4556A 10k')).toBe('NJM4556A 10k');
  });
});

describe('roundedPath', () => {
  test('returns a move and a line for a two point path', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 4)).toBe('M 0 0 L 10 0');
  });

  test('rounds the corner between two segments with a quadratic curve', () => {
    const path = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 30, y: 20 }], 5);

    expect(path).toContain('Q 0 20');
    expect(path.startsWith('M 0 0')).toBe(true);
  });

  test('never overshoots a segment that is shorter than the corner radius', () => {
    const path = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 30, y: 4 }], 20);

    expect(path).not.toContain('NaN');
    expect(path).toContain('Q 0 4');
  });

  test('returns an empty string when there is nothing to draw', () => {
    expect(roundedPath([{ x: 1, y: 1 }], 4)).toBe('');
    expect(roundedPath([], 4)).toBe('');
  });
});

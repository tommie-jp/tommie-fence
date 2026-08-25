import { describe, expect, test } from 'vitest';
import { hashOf } from './hash.ts';

describe('hashOf', () => {
  test('gives the same key for the same TeX', () => {
    expect(hashOf('\\draw (a1);')).toBe(hashOf('\\draw (a1);'));
  });

  test('gives a different key when the drawing changes', () => {
    expect(hashOf('\\draw (a1);')).not.toBe(hashOf('\\draw (a2);'));
  });

  test('gives a key that is safe to put in an attribute', () => {
    expect(hashOf('\\draw (a1);')).toMatch(/^[0-9a-z]+$/);
  });

  test('handles an empty string', () => {
    expect(hashOf('')).toMatch(/^[0-9a-z]+$/);
  });
});

import { describe, expect, test } from 'vitest';
import { leadSpan } from './place.ts';

describe.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('継承された名前 %s', (word) => {
  test('gets the fallback lead span like any unknown type', () => {
    expect(leadSpan(word)).toBe(3);
  });
});

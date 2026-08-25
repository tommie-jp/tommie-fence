import { describe, expect, test } from 'vitest';
import { LIMITS, isReferenceable } from './limits.ts';

describe('isReferenceable', () => {
  test('accepts the ids parts are named with', () => {
    expect(isReferenceable('R1')).toBe(true);
    expect(isReferenceable('OUT')).toBe(true);
    expect(isReferenceable('Q_1')).toBe(true);
  });

  test('rejects a name that a wire could not point at', () => {
    expect(isReferenceable('R 1')).toBe(false);
    expect(isReferenceable('R.1')).toBe(false);
    expect(isReferenceable('')).toBe(false);
  });

  test('rejects a name longer than the id limit', () => {
    expect(isReferenceable('a'.repeat(LIMITS.idLength))).toBe(true);
    expect(isReferenceable('a'.repeat(LIMITS.idLength + 1))).toBe(false);
  });
});

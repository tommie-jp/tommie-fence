import { describe, expect, test } from 'vitest';
import { KEY_KINDS, TOP_LEVEL_KEYS } from './types.ts';

describe('KEY_KINDS', () => {
  test('has exactly the keys of TOP_LEVEL_KEYS, so a new key cannot skip the kind check', () => {
    expect(Object.keys(KEY_KINDS).sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  });

  test('gives every key at least one kind of instrument', () => {
    for (const kinds of Object.values(KEY_KINDS)) expect(kinds.length).toBeGreaterThan(0);
  });
});

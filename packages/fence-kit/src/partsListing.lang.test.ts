import { describe, expect, test } from 'vitest';
import { lookupRole, pinoutTable } from './parts/pinouts.ts';
import { PARTS_HEADINGS, PARTS_HEADINGS_BY_LANG, partKind, valueWithRole } from './partsListing.ts';

const JAPANESE = /[぀-ヿ一-鿿＀-￯]/u;

describe('parts listing in English', () => {
  test('gives every pinout row an English role without Japanese characters', () => {
    for (const row of pinoutTable()) {
      const english = lookupRole(row.models[0] ?? '', 'en');
      expect(english, row.models[0]).not.toBeNull();
      expect(english, row.models[0]).not.toMatch(JAPANESE);
    }
  });

  test('keeps the Japanese output unchanged by default', () => {
    expect(valueWithRole('CD4081')).toBe('CD4081 (2 入力 AND ×4)');
    expect(valueWithRole('CD4081', 'ja')).toBe('CD4081 (2 入力 AND ×4)');
    expect(PARTS_HEADINGS_BY_LANG.ja).toEqual(PARTS_HEADINGS);
  });

  test('adds the English role to the model', () => {
    expect(valueWithRole('CD4081', 'en')).toBe('CD4081 (2-input AND ×4)');
    expect(valueWithRole('LM358', 'en')).toBe('LM358 (op-amp ×2)');
    expect(valueWithRole('XYZ', 'en')).toBe('XYZ');
  });

  test('keeps only the frequency for the ceramic filter in both languages', () => {
    expect(valueWithRole('SFU455B')).toBe('SFU455B (455 kHz)');
    expect(valueWithRole('SFU455B', 'en')).toBe('SFU455B (455 kHz)');
    expect(partKind('sip3', null, 'SFU455B', 'en')).toBe('ceramic filter');
  });
});

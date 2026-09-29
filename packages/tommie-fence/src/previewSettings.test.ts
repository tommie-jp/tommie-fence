import { describe, expect, test } from 'vitest';
import { imageAfterFenceMode } from './previewSettings.ts';

describe('tommieFence.preview.imageAfterFence', () => {
  test('reads the three values as they are', () => {
    expect(imageAfterFenceMode('collapse')).toBe('collapse');
    expect(imageAfterFenceMode('hide')).toBe('hide');
    expect(imageAfterFenceMode('show')).toBe('show');
  });

  test('falls back to collapse for a missing or misspelt value', () => {
    expect(imageAfterFenceMode(undefined)).toBe('collapse');
    expect(imageAfterFenceMode('Show')).toBe('collapse');
    expect(imageAfterFenceMode(true)).toBe('collapse');
  });
});

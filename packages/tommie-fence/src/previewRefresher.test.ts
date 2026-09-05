import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPreviewRefresher, REFRESH_DELAY_MS } from './previewRefresher.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPreviewRefresher', () => {
  test('waits a moment before asking, so a burst becomes one refresh', () => {
    const refresh = vi.fn();
    const refresher = createPreviewRefresher(refresh);

    refresher.request();
    refresher.request();
    refresher.request();
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('asks again for a drawing that finished after the last refresh', () => {
    const refresh = vi.fn();
    const refresher = createPreviewRefresher(refresh);

    refresher.request();
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    refresher.request();
    vi.advanceTimersByTime(REFRESH_DELAY_MS);

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('keeps going when the editor refuses to refresh', () => {
    const refresh = vi.fn(() => {
      throw new Error('コマンドがありません');
    });
    const refresher = createPreviewRefresher(refresh);

    refresher.request();
    expect(() => vi.advanceTimersByTime(REFRESH_DELAY_MS)).not.toThrow();

    refresher.request();
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

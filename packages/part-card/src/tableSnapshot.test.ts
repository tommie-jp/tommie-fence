import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { tableSnapshot } from './tableSnapshot.ts';

/**
 * TS の部品の表を部品カードへ移すあいだの守りの網 (52 の docs/160 の段 0)。移す前に控えた表の中身と、
 * 今の表が**並びを除いて**同じであることを見る。行を消し忘れても、写し違えても落ちる。次の Release のあとで消す。
 */
const saved = JSON.parse(readFileSync(new URL('./tableSnapshot.json', import.meta.url), 'utf8')) as Record<string, unknown>;

describe('移す前と同じ表', () => {
  const now = tableSnapshot();

  test('has the same rows (keyed by table and model)', () => {
    expect(Object.keys(now)).toEqual(Object.keys(saved));
  });

  test.each(Object.keys(saved))('%s reads the same', (key) => {
    expect(now[key]).toEqual(saved[key]);
  });
});

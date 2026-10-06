import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
// @ts-expect-error ビルドの道具 (.mjs) で、型を持たない
import { collectExamples } from '../scripts/examples.mjs';

/**
 * 例の隣のデータ (`data:` が指す CSV・Touchstone) を、`.md` と同じ場所へ写す
 * (52 の docs/120)。頁は例を開くとき、本文が指す名前だけを取りに行く。
 */
const out = mkdtempSync(join(tmpdir(), 'pg-examples-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('例の隣のデータ', () => {
  test('graph・scope・spectrum・vna の例が指すデータが、.md の隣に写る', async () => {
    await collectExamples(join(import.meta.dirname, '../..'), out);

    expect(existsSync(join(out, 'graph/00-resonance.csv'))).toBe(true);
    expect(existsSync(join(out, 'scope/00-rc-charging-ch.csv'))).toBe(true);
    expect(existsSync(join(out, 'spectrum/05-antenna-fm.csv'))).toBe(true);
    expect(existsSync(join(out, 'vna/00-series-100.s2p'))).toBe(true);
  });
});

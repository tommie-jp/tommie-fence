import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { STAMP_TEXT, VERSION } from './version.ts';

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as { version: string };

describe('VERSION', () => {
  test('is the same number the extension is published under', () => {
    // ここが食い違うと、刻んだ図の版と入れた拡張の版が別のものを指す。
    expect(VERSION).toBe(manifest.version);
  });

  test('reads as the name of the tool followed by the number', () => {
    expect(STAMP_TEXT).toBe(`breadboard-fence ${VERSION}`);
  });
});

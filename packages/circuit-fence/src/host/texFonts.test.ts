import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadTexFonts, texFontDir } from './texFonts.ts';

describe('loadTexFonts', () => {
  test('reads each font the drawing asks for as base64', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tex-fonts-'));
    writeFileSync(join(dir, 'cmr10.ttf'), Buffer.from([1, 2, 3]));

    expect(loadTexFonts(['cmr10'], dir)).toEqual(new Map([['cmr10', 'AQID']]));
  });

  test('skips a font that is not in the folder instead of failing the drawing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tex-fonts-'));

    expect(loadTexFonts(['cmr10'], dir).size).toBe(0);
  });

  test('refuses a name that is not a TeX font name, so it cannot reach outside the folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tex-fonts-'));

    expect(loadTexFonts(['../secret'], dir).size).toBe(0);
  });
});

describe('texFontDir', () => {
  test('finds the fonts that ship with the TeX engine', () => {
    // プレビューが読み込んでいるのと同じ BaKoMa の TTF。
    expect(loadTexFonts(['cmr10', 'cmmi10'], texFontDir()).size).toBe(2);
  });
});

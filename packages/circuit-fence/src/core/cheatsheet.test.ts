import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { NOTE_ALIGNS, NOTE_COLOR_NAMES, NOTE_LEADINGS, NOTE_SIZE_NAMES } from './notes.ts';
import { PART_ALIASES, partTypeNames } from './parts.ts';
import { STYLE_KEYS } from './parser/style.ts';
import { THEME_NAMES } from './render/theme.ts';

/**
 * 早見表 (docs/cheatsheet.md) が実装から遅れていないか。
 *
 * この 1 枚は「LLM にそのまま渡す」ためのものなので、載っていない種類は
 * 書かれないし、消えた種類は書かれ続ける。文法リファレンスと違って
 * 説明が無いぶん、抜けを目で見つけられない。**名前の集合だけ**を見張る
 * (書きぶりまで縛ると、直すたびにテストを直すことになる)。
 */
const CHEATSHEET = readFileSync(fileURLToPath(new URL('../../docs/cheatsheet.md', import.meta.url)), 'utf8');

const mentions = (name: string): boolean => CHEATSHEET.includes(`\`${name}\``);

describe('docs/cheatsheet.md', () => {
  test('names every part type', () => {
    expect(partTypeNames().filter((name) => !mentions(name))).toEqual([]);
  });

  test('names every abbreviation', () => {
    expect(Object.keys(PART_ALIASES).filter((name) => !mentions(name))).toEqual([]);
  });

  test('names every word a note can carry', () => {
    const words = [...NOTE_COLOR_NAMES, ...NOTE_SIZE_NAMES, ...NOTE_ALIGNS, ...NOTE_LEADINGS, 'bold'];

    expect(words.filter((name) => !mentions(name))).toEqual([]);
  });

  test('names every theme', () => {
    expect(THEME_NAMES.filter((name) => !mentions(name))).toEqual([]);
  });

  test('names every item style: can carry', () => {
    expect(STYLE_KEYS.filter((name) => !mentions(name))).toEqual([]);
  });
});

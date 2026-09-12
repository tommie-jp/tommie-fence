import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellNote } from './spellNote.ts';

/** **例と文法リファレンスの注釈の行が、1 行残らず組み直しと一致する**こと。 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 頭の `- ` を 1 つ外し、桁揃えの空白を潰す。 */
const flat = (text: string): string => text.trim().replace(/^-\s/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractBreadboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const note of parseFence(fence.source).doc.notes) {
      expect(flat(spellNote(note)), `${label} の ${note.line} 行目`).toBe(flat(lines[note.line - 1] ?? ''));
    }
  }
};

describe('spellNote', () => {
  test.each(files)('%s の注釈の行は、組み直しても同じ', (name) => {
    check(name, readFileSync(join(DIR, name), 'utf8'));
  });

  test('文法リファレンスの注釈の行も、組み直しても同じ', () => {
    check('01-syntax.md', readFileSync(SYNTAX, 'utf8'));
  });

  // **書いていない色を足さない。** 印は赤が既定なので、読んだ値には色が入っている。
  test('色を書かない印に色を足さない', () => {
    const { doc } = parseFence('board: half\nparts:\n  R1: resistor a5 a10\nnotes:\n  - circle R1\n');

    expect(spellNote(doc.notes[0]!)).toBe('circle R1');
  });

  test('本文の引用はそのまま戻す', () => {
    const { doc } = parseFence('board: half\nnotes:\n  - text a5: "R1: 330"\n');

    expect(spellNote(doc.notes[0]!)).toBe('text a5: "R1: 330"');
  });
});

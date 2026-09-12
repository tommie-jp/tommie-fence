import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPerfboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellNote } from './spellNote.ts';

/** **例と文法リファレンスの注釈の行が、1 行残らず組み直しと一致する**こと。 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 頭の `- ` を 1 つ外し、桁揃えの空白を潰す。 */
const flat = (text: string): string => text.trim().replace(/^-\s/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractPerfboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const note of parseFence(fence.source).doc.notes) {
      if (note.line === null) continue;
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

  // 色も向きも語の並びが自由なので、書かれた順のまま戻す。
  test('色と向きの語を、書かれた順のまま戻す', () => {
    const { doc } = parseFence('board: 12x8\nnotes:\n  - text b3 r90 blue: 縦書き\n');

    expect(spellNote(doc.notes[0]!)).toBe('text b3 r90 blue: 縦書き');
  });
});

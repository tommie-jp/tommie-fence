import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellNote } from './spellNote.ts';

/**
 * **例と文法リファレンスの注釈の行が、1 行残らず組み直しと一致する**こと。
 * ずれると、書き換えたとたんに書いていない色が足され、語の並びが変わり、
 * 本文の引用が外れる。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 頭の `- ` を 1 つ外し、桁揃えの空白を潰す。 */
const flat = (text: string): string => text.trim().replace(/^-\s/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractCircuitFences(markdown)) {
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

  // **書いていない色を足さない。** 読んだ値には既定の色が入っている。
  test('色を書かない印に色を足さない', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3\nnotes:\n  - circle R1\n');

    expect(spellNote(doc.notes[0]!)).toBe('circle R1');
  });

  // **引用はそのまま。** 規則で付け直すと、要らない引用を外す行がある。
  test('本文の引用はそのまま戻す', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: "R1: 10k"\n');

    expect(spellNote(doc.notes[0]!)).toBe('text b1: "R1: 10k"');
  });
});

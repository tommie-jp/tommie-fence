import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPerfboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellWire } from './spellWire.ts';

/** **例と文法リファレンスの配線の行が、1 行残らず組み直しと一致する**こと。 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 頭の `- ` と行末のコメントを外し、桁揃えの空白を潰す。 */
const flat = (text: string): string =>
  text.replace(/\s+#\s.*$/, '').trim().replace(/^-\s/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractPerfboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const wire of parseFence(fence.source).doc.wires) {
      if (wire.line === null) continue;
      expect(flat(spellWire(wire)), `${label} の ${wire.line} 行目`).toBe(flat(lines[wire.line - 1] ?? ''));
    }
  }
};

describe('spellWire', () => {
  test.each(files)('%s の配線の行は、組み直しても同じ', (name) => {
    check(name, readFileSync(join(DIR, name), 'utf8'));
  });

  test('文法リファレンスの配線の行も、組み直しても同じ', () => {
    check('01-syntax.md', readFileSync(SYNTAX, 'utf8'));
  });

  test('色を書かない配線は色を足さない', () => {
    const { doc } = parseFence('board: 12x8\nwires:\n  - b7 -- c5\n');

    expect(spellWire(doc.wires[0]!)).toBe('b7 -- c5');
  });
});

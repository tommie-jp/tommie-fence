import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPerfboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellPart } from './spellPart.ts';

/**
 * **例と文法リファレンスの部品の行が、1 行残らず組み直しと一致する**こと。
 * ずれると、書き換えたとたんに書いた人の綴りが変わる。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/**
 * 桁揃えの空白は作らないので潰す。**行末のコメントも外す** —
 * `# …` は YAML が値を読む前に落とすので、仕様には残らない
 * (書き換えた行のコメントを写すのは呼ぶ側の仕事)。
 */
const flat = (text: string): string =>
  text.replace(/\s+#\s.*$/, '').trim().replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractPerfboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const part of parseFence(fence.source).doc.parts) {
      // 行の分からない部品は比べる相手がいない。
      if (part.line === null) continue;
      expect(flat(spellPart(part)), `${label} の ${part.id}`).toBe(flat(lines[part.line - 1] ?? ''));
    }
  }
};

describe('spellPart', () => {
  test('見本が 1 つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s の部品の行は、組み直しても同じ', (name) => {
    check(name, readFileSync(join(DIR, name), 'utf8'));
  });

  test('文法リファレンスの部品の行も、組み直しても同じ', () => {
    check('01-syntax.md', readFileSync(SYNTAX, 'utf8'));
  });

  test('向きの語も戻る', () => {
    const { doc } = parseFence('board: 12x8\nparts:\n  U1: dip8 c3 r90\n');

    expect(spellPart(doc.parts[0]!)).toBe('U1: dip8 c3 r90');
  });
});

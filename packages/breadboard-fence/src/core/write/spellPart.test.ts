import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellPart } from './spellPart.ts';

/**
 * **例と文法リファレンスの部品の行が、1 行残らず組み直しと一致する**こと。
 * ずれると、書き換えたとたんに書いた人の綴りが変わる (書いていない足の名前
 * `(1)` が足される、`points:` の名前が番地に化ける、略記が正式名になる)。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/**
 * 桁揃えの空白は作らないので、比べるときに潰す。
 *
 * **行末のコメントも外す。** `# …` は YAML が値を読む前に落とすので、
 * 仕様には残らない (組み直す側からは見えない)。書き換えた行のコメントを
 * 残すのは**呼ぶ側の仕事** — 元の行から写す (段 3 で繋ぐときの決め)。
 */
const flat = (text: string): string =>
  text.replace(/\s+#\s.*$/, '').trim().replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractBreadboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const part of parseFence(fence.source).doc.parts) {
      const made = spellPart(part);
      // 機器はブロックで書くので 1 行に落ちない (組み直さない)。
      if (made === null) continue;
      expect(flat(made), `${label} の ${part.id}`).toBe(flat(lines[part.line - 1] ?? ''));
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

  test('機器は組み直さない (ブロックで書くので 1 行に落ちない)', () => {
    const fence = 'board: half\nparts:\n  BAT:\n    type: device\n    at: bottom\n';
    const [device] = parseFence(fence).doc.parts;

    expect(device?.type).toBe('device');
    expect(spellPart(device!)).toBeNull();
  });
});

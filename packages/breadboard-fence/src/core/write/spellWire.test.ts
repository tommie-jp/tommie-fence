import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellWires, wiresByLine } from './spellWire.ts';

/**
 * **例と文法リファレンスの配線の行が、1 行残らず組み直しと一致する**こと。
 * ずれると、書き換えたとたんに書いた人の綴りが変わる (鎖が割れる、
 * `points:` の名前が番地に化ける、迂回ヒントが落ちる)。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/**
 * 比べる前に、頭の `- ` (YAML の並びの印) と行末のコメントを外し、
 * 桁揃えの空白を潰す。**`- ` は 1 つだけ外す** — レールの番地は `-t50` と
 * 書くので、まとめて削ると番地の頭まで持っていかれる。
 */
const flat = (text: string): string =>
  text.replace(/\s+#\s.*$/, '').trim().replace(/^-\s/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractBreadboardFences(markdown)) {
    const lines = fence.source.split('\n');
    for (const [line, wires] of wiresByLine(parseFence(fence.source).doc.wires)) {
      expect(flat(spellWires(wires)), `${label} の ${line} 行目`).toBe(flat(lines[line - 1] ?? ''));
    }
  }
};

describe('spellWires', () => {
  test.each(files)('%s の配線の行は、組み直しても同じ', (name) => {
    check(name, readFileSync(join(DIR, name), 'utf8'));
  });

  test('文法リファレンスの配線の行も、組み直しても同じ', () => {
    check('01-syntax.md', readFileSync(SYNTAX, 'utf8'));
  });

  test('同じ行の 2 本を 1 本の鎖に戻す', () => {
    const { doc } = parseFence('board: half\nwires:\n  - b10 -- b14 -- b21 orange\n');
    const wires = [...wiresByLine(doc.wires).values()][0] ?? [];

    expect(wires).toHaveLength(2);
    expect(spellWires(wires)).toBe('b10 -- b14 -- b21 orange');
  });
});

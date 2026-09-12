import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellWires, wiresByLine } from './spellWire.ts';

/**
 * **例と文法リファレンスの配線の行が、1 行残らず組み直しと一致する**こと。
 * ずれると、書き換えたとたんに書いた人の綴りが変わる (鎖が 2 行に割れる、
 * `points:` の名前が番地に化ける、演算子が `--` に均される)。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 桁揃えの空白は作らないので、比べるときに潰す。頭の `- ` も外す。 */
const flat = (text: string): string => text.trim().replace(/^-\s*/, '').replace(/\s+/g, ' ');

const check = (label: string, markdown: string): void => {
  for (const fence of extractCircuitFences(markdown)) {
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

  // 1 行が 2 本以上になる形 (`a1 -- b1 -- c1`) を鎖に戻せること。
  test('同じ行の 2 本を 1 本の鎖に戻す', () => {
    const { doc } = parseFence('parts:\n  R1: resistor a1 a3\nwires:\n  - a1 -- b1 -| c1\n');
    const wires = [...wiresByLine(doc.wires).values()][0] ?? [];

    expect(wires).toHaveLength(2);
    expect(spellWires(wires)).toBe('a1 -- b1 -| c1');
  });
});

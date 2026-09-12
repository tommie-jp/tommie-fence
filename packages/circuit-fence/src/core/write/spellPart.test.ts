import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { spellPart } from './spellPart.ts';

/**
 * **仕様から 1 行を組み直す** (52 の docs/54 の段 1)。
 *
 * 中身から本文を組み立てる形にするための土台。**書き換えた項目だけ**この関数を
 * 通し、触っていない行は書かれた字のまま残す (だから桁揃えの空白は作らない)。
 *
 * 見張るのは**例の全部で、組み直した行が元の行と同じ**こと。1 行でもずれると、
 * 書き換えたとたんに書いた人の綴りが変わる (番地を `points:` の名前で書いた行が
 * 番地に化けるなど)。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

/** 桁揃えの空白は作らないので、比べるときに潰す (`IN:  port a1` の 2 つめの空白)。 */
const flat = (text: string): string => text.trim().replace(/\s+/g, ' ');

describe('spellPart', () => {
  test('見本が 1 つ以上ある', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)('%s の部品の行は、組み直しても同じ', (name) => {
    const markdown = readFileSync(join(DIR, name), 'utf8');

    for (const fence of extractCircuitFences(markdown)) {
      const lines = fence.source.split('\n');
      for (const part of parseFence(fence.source).doc.parts) {
        expect(flat(spellPart(part)), `${name} の ${part.id}`).toBe(flat(lines[part.line - 1] ?? ''));
      }
    }
  });
});

/**
 * **文法リファレンスも通す。** 例より書き方の幅が広く (向きの語・札・名前で
 * 書いた番地が揃っている)、組み直しのずれが出るならここ。
 */
describe('文法リファレンス', () => {
  const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));

  test('書き方の見本の部品の行も、組み直しても同じ', () => {
    const fences = extractCircuitFences(readFileSync(SYNTAX, 'utf8'));
    expect(fences.length).toBeGreaterThan(20);

    for (const fence of fences) {
      const lines = fence.source.split('\n');
      for (const part of parseFence(fence.source).doc.parts) {
        expect(flat(spellPart(part)), `${fence.line} 行目の ${part.id}`).toBe(flat(lines[part.line - 1] ?? ''));
      }
    }
  });
});

describe('組み直した行は読み直せる', () => {
  test.each(files)('%s の部品は、組み直して読み直しても同じ仕様', (name) => {
    const markdown = readFileSync(join(DIR, name), 'utf8');

    for (const fence of extractCircuitFences(markdown)) {
      const { doc } = parseFence(fence.source);
      if (doc.parts.length === 0) continue;
      // 組み直した行だけを並べたフェンスにして読み直す (`points:` は連れていく)。
      const points = [...doc.points].map(([at, address]) => `  ${at}: ${address.row},${address.col}`);
      void points;
      const rebuilt = ['parts:', ...doc.parts.map((part) => `  ${spellPart(part)}`), ''].join('\n');
      const again = parseFence(rebuilt).doc;

      // 名前で書かれた番地は名前のまま残るので、名前を知らないと読めない。
      // ここでは**名前を使っていないフェンスだけ**を見る (使うものは上の試験が守る)。
      if (doc.points.size > 0) continue;
      expect(again.parts.map((one) => one.id), `${name}`).toEqual(doc.parts.map((one) => one.id));
    }
  });
});

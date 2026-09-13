import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractBreadboardFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { writeFence } from './writeFence.ts';

/**
 * **触っていない行は 1 字も動かない**こと (52 の docs/54 の段 1)。
 *
 * 組み直した行と書かれた行は、中身が同じでも字が違う (桁揃えの空白は
 * こちらで作らない)。だから「変わったか」を字の比べでは決められず、
 * **変えた側が行を挙げる**形にしてある。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

const check = (label: string, markdown: string): void => {
  for (const fence of extractBreadboardFences(markdown)) {
    const { doc } = parseFence(fence.source);
    expect(writeFence(fence.source, doc).join('\n'), `${label} の ${fence.line} 行目`).toBe(fence.source);
  }
};

describe('writeFence', () => {
  test.each(files)('%s は、書き換えなければ 1 字も変わらない', (name) => {
    check(name, readFileSync(join(DIR, name), 'utf8'));
  });

  test('文法リファレンスも、書き換えなければ 1 字も変わらない', () => {
    check('01-syntax.md', readFileSync(SYNTAX, 'utf8'));
  });
});

describe('書き換えた行だけ組み直す', () => {
  const SOURCE = [
    'board: half',
    'parts:',
    '  R1:  resistor a5 a10 330  # 分圧の上側',
    '  D1:  led a14(A) a17(K) red',
    'wires:',
    '  - +t5 -- a5 red',
    '',
  ].join('\n');

  test('挙げた行だけが変わり、字下げとコメントは残る', () => {
    const { doc } = parseFence(SOURCE);
    const written = writeFence(SOURCE, doc, new Set([3]));

    expect(written[2]).toBe('  R1: resistor a5 a10 330 # 分圧の上側');
    // 揃えて書いた D1 の行は動かない。
    expect(written[3]).toBe('  D1:  led a14(A) a17(K) red');
  });

  test('組み直した本文は読み直せる', () => {
    const { doc } = parseFence(SOURCE);
    const written = writeFence(SOURCE, doc, new Set([3, 4, 6])).join('\n');

    expect(parseFence(written).errors).toEqual([]);
    expect(parseFence(written).doc.parts.map((one) => one.id)).toEqual(['R1', 'D1']);
  });
});

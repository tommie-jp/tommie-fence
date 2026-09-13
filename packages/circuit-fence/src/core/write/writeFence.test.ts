import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractCircuitFences } from '../fences.ts';
import { parseFence } from '../parser/parseFence.ts';
import { writeFence } from './writeFence.ts';

/**
 * **触っていない行は 1 字も動かない**こと (52 の docs/54 の段 1)。
 *
 * 組み直した行と書かれた行は、中身が同じでも字が違う (桁揃えの空白は
 * こちらで作らない)。だから「変わったか」を字の比べでは決められず、
 * **変えた側が行を挙げる**形にしてある。挙がっていない行はそのまま返す。
 */

const DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));
const SYNTAX = fileURLToPath(new URL('../../../docs/01-syntax.md', import.meta.url));
const files = readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();

const check = (label: string, markdown: string): void => {
  for (const fence of extractCircuitFences(markdown)) {
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
    'title: 図01',
    'parts:',
    '  IN:  port a1',            // 桁揃えの空白つき
    '  R1:  resistor a1 a3 10k', // これを書き換える
    'wires:',
    '  - a3 -- b1',
    '',
  ].join('\n');

  test('挙げた行だけが変わる', () => {
    const { doc } = parseFence(SOURCE);
    const written = writeFence(SOURCE, doc, new Set([4]));

    // 揃えて書いた IN の行は動かない。
    expect(written[2]).toBe('  IN:  port a1');
    expect(written[4]).toBe('wires:');
  });

  test('組み直した行にも、書かれていた字下げを付ける', () => {
    const { doc } = parseFence(SOURCE);

    expect(writeFence(SOURCE, doc, new Set([4]))[3]).toBe('  R1: resistor a1 a3 10k');
  });

  // **行末のコメントは残す。** 読んだ中身には入っていないので、書かれた行から写す。
  test('行末のコメントを残す', () => {
    const withNote = SOURCE.replace('  R1:  resistor a1 a3 10k', '  R1:  resistor a1 a3 10k  # 分圧の上側');
    const { doc } = parseFence(withNote);

    expect(writeFence(withNote, doc, new Set([4]))[3]).toBe('  R1: resistor a1 a3 10k # 分圧の上側');
  });

  // 引用の中の `#` はコメントではない。
  test('引用の中の # をコメントと間違えない', () => {
    const source = 'parts:\n  R1: resistor a1 a3\nnotes:\n  - text b1: "R1: #1"\n';
    const { doc } = parseFence(source);

    expect(writeFence(source, doc, new Set([4]))[3]).toBe('  - text b1: "R1: #1"');
  });

  test('配線は 1 行にまとめて組み直す', () => {
    const source = 'parts:\n  R1: resistor a1 a3\nwires:\n  - a1 -- b1 -- c1\n';
    const { doc } = parseFence(source);

    expect(writeFence(source, doc, new Set([4]))[3]).toBe('  - a1 -- b1 -- c1');
  });

  test('組み直した本文は読み直せる', () => {
    const { doc } = parseFence(SOURCE);
    const written = writeFence(SOURCE, doc, new Set([3, 4])).join('\n');

    expect(parseFence(written).errors).toEqual([]);
    expect(parseFence(written).doc.parts.map((one) => one.id)).toEqual(['IN', 'R1']);
  });
});

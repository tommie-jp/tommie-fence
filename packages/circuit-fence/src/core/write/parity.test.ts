import { describe, expect, test } from 'vitest';
import { setField } from '../edit/field.ts';
import { applyRewrite } from '../edit/shared.ts';
import { parseFence } from '../parser/parseFence.ts';
import type { PartSpec } from '../types.ts';
import { writeFence } from './writeFence.ts';

/**
 * **中身から組み直した本文が、いまの当て方と 1 字も違わない**こと
 * (52 の docs/54 — 段 3 の土台)。
 *
 * いまの当て方は「行の中の綴りだけ差し替える」ので、桁揃えもコメントも残る。
 * 置き換えた先が同じ字を出せなければ、**コードは半分になるが書いた人の書式は
 * 壊れる**ことになる。だから置き換える前に、ここで並べて見張る。
 *
 * ここが落ちたら、`dressLine` (字下げ・語の間の空白・コメント) か、
 * 1 行を組み直す側 (`spellPart`) のどちらかが書かれた字を落としている。
 */

/** いまの当て方 — 行の中の綴りを差し替える。 */
const byTokens = (source: string, id: string, field: string, text: string): string => {
  const result = setField(source, id, field as never, text);
  if (!result.ok) throw new Error(result.error.message);
  return applyRewrite(source, result.value);
};

/** 置き換えた先 — 中身を直して本文を組み直す。 */
const byDocument = (source: string, id: string, change: (part: PartSpec) => PartSpec): string => {
  const { doc } = parseFence(source);
  const part = doc.parts.find((one) => one.id === id);
  if (part === undefined) throw new Error(`部品がありません: ${id}`);
  const parts = doc.parts.map((one) => (one.id === id ? change(one) : one));
  return writeFence(source, { ...doc, parts }, new Set([part.line])).join('\n');
};

/** 桁を揃えて書いた見本 (例 01-rc-lowpass と同じ書き方)。 */
const ALIGNED = ['parts:', '  IN:  port a1', '  R1:  resistor a1 a2 10k', ''].join('\n');

describe('中身から組み直しても、いまの当て方と同じ字', () => {
  test('値を直す', () => {
    expect(byDocument(ALIGNED, 'R1', (part) => ({ ...part, value: '22k' } as PartSpec)))
      .toBe(byTokens(ALIGNED, 'R1', 'value', '22k'));
  });

  test('値を消す', () => {
    expect(byDocument(ALIGNED, 'R1', (part) => ({ ...part, value: null } as PartSpec)))
      .toBe(byTokens(ALIGNED, 'R1', 'value', ''));
  });

  test('値を足す', () => {
    const bare = ['parts:', '  IN:  port a1', '  R1:  resistor a1 a2', ''].join('\n');

    expect(byDocument(bare, 'R1', (part) => ({ ...part, value: '10k' } as PartSpec)))
      .toBe(byTokens(bare, 'R1', 'value', '10k'));
  });

  test('ラベルを足す', () => {
    expect(byDocument(ALIGNED, 'R1', (part) => ({ ...part, label: 'Rin' } as PartSpec)))
      .toBe(byTokens(ALIGNED, 'R1', 'label', 'Rin'));
  });

  test('種類を替える', () => {
    expect(byDocument(ALIGNED, 'R1', (part) => ({ ...part, type: 'capacitor', written: 'capacitor' } as PartSpec)))
      .toBe(byTokens(ALIGNED, 'R1', 'type', 'capacitor'));
  });

  // 行末のコメントも、書かれた空白ごと残ること。
  test('コメントの付いた行でも同じ', () => {
    const noted = ['parts:', '  R1:  resistor a1 a2 10k  # 分圧の上側', ''].join('\n');

    expect(byDocument(noted, 'R1', (part) => ({ ...part, value: '22k' } as PartSpec)))
      .toBe(byTokens(noted, 'R1', 'value', '22k'));
  });
});

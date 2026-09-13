import { describe, expect, test } from 'vitest';
import { setField } from '../edit/field.ts';
import { movePart } from '../edit/move.ts';
import { applyEdits } from '../edit/shared.ts';
import { formatAddress, parseAddress } from '../model/address.ts';
import type { Address } from '../model/address.ts';
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

/** 部品を動かす — いまの当て方。 */
const moveByTokens = (source: string, id: string, to: string): string => {
  const result = movePart(source, id, parseAddress(to) as Address);
  if (!result.ok) throw new Error(result.error.message);
  return applyEdits(source, result.value.edits);
};

/** 部品を動かす — 中身を直して組み直す (アンカーの移動量で全部を平行移動)。 */
const moveByDocument = (source: string, id: string, to: string): string =>
  byDocument(source, id, (part) => {
    const target = parseAddress(to) as Address;
    const anchor = part.kind === 'two-terminal' ? part.from : part.at;
    const shift = (address: Address): Address =>
      ({ row: address.row + target.row - anchor.row, col: address.col + target.col - anchor.col });
    if (part.kind === 'two-terminal') {
      const from = shift(part.from);
      const next = shift(part.to);
      return { ...part, from, to: next, spelling: [formatAddress(from), formatAddress(next)] };
    }
    const at = shift(part.at);
    return { ...part, at, spelling: [formatAddress(at)] } as PartSpec;
  });

describe('動かしても、いまの当て方と同じ字', () => {
  test('2 端子を動かす (揃えあり)', () => {
    expect(moveByDocument(ALIGNED, 'R1', 'c1')).toBe(moveByTokens(ALIGNED, 'R1', 'c1'));
  });

  test('1 端子を動かす', () => {
    expect(moveByDocument(ALIGNED, 'IN', 'b3')).toBe(moveByTokens(ALIGNED, 'IN', 'b3'));
  });

  test('多端子を動かす (向きの語つき)', () => {
    const turned = ['parts:', '  Q1:  npn b5 r90 2SC1815', ''].join('\n');

    expect(moveByDocument(turned, 'Q1', 'd8')).toBe(moveByTokens(turned, 'Q1', 'd8'));
  });

  test('コメントの付いた行を動かす', () => {
    const noted = ['parts:', '  R1:  resistor a1 a2 10k  # 分圧の上側', ''].join('\n');

    expect(moveByDocument(noted, 'R1', 'e4')).toBe(moveByTokens(noted, 'R1', 'e4'));
  });
});

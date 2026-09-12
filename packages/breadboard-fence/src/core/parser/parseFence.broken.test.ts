import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseFence } from './parseFence.ts';
import { insertPart } from '../edit/insert.ts';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { renderBreadboard } from '../index.ts';

/**
 * **読めない行があっても止めない** (52 の docs/54)。
 *
 * 以前は YAML が 1 か所でも転ぶと `doc: null` を返し、置く・動かす・消すが
 * 全部「フェンスを読めないので…できません」で断られ、**升目が空になった**
 * (52 の docs/51 で踏んだ姿そのもの)。**エディタが主体**なので、読めた所は
 * 返し、読めなかった行だけ行番号つきで言う。
 */

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

/**
 * 52 の docs/51 で踏んだ形。機器のブロックの頭と中身の間に部品の行が割り込み、
 * 4 行目から下の入れ子が読めない。**その上の `R3` と `wires:` は読める。**
 */
const BROKEN_BLOCK = [
  'board: half',
  'parts:',
  '  R3: resistor a1 a5 1k',
  '  BAT:',
  '  R1: resistor e5 e10',
  '    type: device',
  '    at: bottom',
  'wires:',
  '  - a1 -- a5',
  '',
].join('\n');

/** 閉じ忘れたフロー形式 (`examples/errors/01-unreadable.md`)。 */
const UNCLOSED = ['board: half', 'parts:', '  R1: [unclosed', ''].join('\n');

describe('YAML が転んでも読めた所は返す', () => {
  test('転んだ行があっても doc は返る', () => {
    expect(parseFence(BROKEN_BLOCK).doc).not.toBeNull();
  });

  test('転んだ行の上に書いた部品は読める', () => {
    expect(parseFence(BROKEN_BLOCK).doc.parts.map((one) => one.id)).toContain('R3');
  });

  test('転んだ行の下に書いた配線も読める', () => {
    expect(parseFence(BROKEN_BLOCK).doc.wires).toHaveLength(1);
  });

  test('読めなかった行は行番号つきで言う', () => {
    const { errors } = parseFence(BROKEN_BLOCK);
    expect(errors.some((one) => one.message.includes('YAML の構文エラー'))).toBe(true);
  });

  test('何も読めない壊れ方でも doc は返る (中身は空)', () => {
    const { doc, errors } = parseFence(UNCLOSED);
    expect(doc.parts).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('中身がマップでなくても doc は返る', () => {
    const { doc, errors } = parseFence('ただの字\n');
    expect(doc.parts).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('読めない行があっても編集できる', () => {
  test('部品を置ける', () => {
    const result = insertPart(BROKEN_BLOCK, { id: 'R9', type: 'resistor', at: [at('c1')] });
    expect(result.ok).toBe(true);
  });

  test('置いた部品は読み直せて、転んだ行はそのまま残る', () => {
    const result = insertPart(BROKEN_BLOCK, { id: 'R9', type: 'resistor', at: [at('c1')] });
    if (!result.ok) throw new Error(result.error.message);
    const written = applyLineEdits(BROKEN_BLOCK, result.value.lines);

    expect(parseFence(written).doc.parts.map((one) => one.id)).toContain('R9');
    // 転んだ行は触らない (直すのは書いた人)。
    expect(written).toContain('    type: device');
  });
});

describe('図は読めた所まで描く', () => {
  test('転んだ行があっても、読めた部品で板が描ける', () => {
    const { svg, errors } = renderBreadboard(BROKEN_BLOCK);
    expect(svg).not.toBe('');
    expect(errors.length).toBeGreaterThan(0);
  });
});

/**
 * **どんな字を渡しても落ちない。** 部分的に読む形にした以上、`yaml` が返す
 * 中途半端な木 (値がマップ・並び・null、鍵が数) をそのまま読むことになる。
 * 落ちると図もエディタも消えるので、読めないことより落ちないことが先。
 */
const NASTY = [
  '', ' ', '\n\n', '\t', '- 1', '[', '{', '{{{', ']]]', '#',
  'parts:', 'parts: 1', 'parts: []', 'parts: {}', 'parts:\n  - 1',
  'parts:\n  R1:', 'parts:\n  R1: {}', 'parts:\n  R1: []', 'parts:\n  1: 2',
  'parts:\n  R1: [unclosed', 'parts:\n  R1: a: b: c', 'parts:\n R1: x\n  R2: y',
  'wires:', 'wires: 1', 'wires:\n  - ', 'notes:\n  - text b1: a: b',
  'style: 1', 'points: 1', 'title:', 'title: []',
  'a: '.repeat(300), '&x *x', '*x', '---\n---',
];

describe('どんな字でも落ちない', () => {
  test.each(NASTY)('%j を読んでも投げない', (source) => {
    expect(() => parseFence(source)).not.toThrow();
  });

  test.each(NASTY)('%j を読んだ答えには doc がある', (source) => {
    expect(parseFence(source).doc).not.toBeNull();
  });
});

describe('図を組む側も落ちない', () => {
  test.each(NASTY)('%j から図を組もうとしても投げない', (source) => {
    expect(() => renderBreadboard(source)).not.toThrow();
  });
});

import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseFence } from './parseFence.ts';
import { insertPart } from '../edit/insert.ts';
import { parseAddress } from '../model/address.ts';
import type { Address } from '../types.ts';
import { renderPerfboard } from '../index.ts';

/**
 * **読めない行があっても、板が書いていなくても止めない** (52 の docs/54)。
 *
 * この板だけは `board:` が無いと穴の数が決まらないので `doc: null` を返して
 * いた。**書き始める前から止まる**ということなので、既定の板を持たせて、
 * 最初に置いたときに `board:` が書かれる形にする。
 */

const at = (text: string): Address => {
  const address = parseAddress(text);
  if (address === null) throw new Error(`番地ではありません: ${text}`);
  return address;
};

/** 機器のブロックの中身が読めない形 (52 の docs/51 と同じ割り込み)。 */
const BROKEN_BLOCK = [
  'board: 12x7',
  'parts:',
  '  R3: resistor b2 b6 1k',
  'devices:',
  '  BAT:',
  '  R1: resistor e2 e6',
  '    type: device',
  '',
].join('\n');

describe('空でも板が書いていなくても doc は返る', () => {
  test('空のフェンスでも doc は返る', () => {
    expect(parseFence('').doc).not.toBeNull();
  });

  test('空のフェンスには既定の板が入る', () => {
    expect(parseFence('').doc.board.cols).toBeGreaterThan(0);
  });

  test('board: が無くても、書いてある部品は読める', () => {
    const { doc } = parseFence('parts:\n  R1: resistor b2 b6 1k\n');
    expect(doc.parts.map((one) => one.id)).toEqual(['R1']);
  });

  test('board: が無いことは言う (既定で描いていると分かるように)', () => {
    const { errors } = parseFence('parts:\n  R1: resistor b2 b6 1k\n');
    expect(errors.some((one) => one.message.includes('board:'))).toBe(true);
  });
});

describe('YAML が転んでも読めた所は返す', () => {
  test('転んだ行の上に書いた部品は読める', () => {
    expect(parseFence(BROKEN_BLOCK).doc.parts.map((one) => one.id)).toContain('R3');
  });

  test('読めなかった行は言う', () => {
    expect(parseFence(BROKEN_BLOCK).errors.length).toBeGreaterThan(0);
  });

  test('中身がマップでなくても doc は返る', () => {
    const { doc, errors } = parseFence('ただの字\n');
    expect(doc.parts).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('読めない行があっても編集できる', () => {
  test('部品を置ける', () => {
    const result = insertPart(BROKEN_BLOCK, { id: 'R9', type: 'resistor', at: [at('d2')] });
    expect(result.ok).toBe(true);
  });

  test('空のフェンスにも置ける', () => {
    const result = insertPart('', { id: 'R1', type: 'resistor', at: [at('b2')] });
    expect(result.ok).toBe(true);
  });

  test('空のフェンスに置くと board: も書かれる', () => {
    const result = insertPart('', { id: 'R1', type: 'resistor', at: [at('b2')] });
    if (!result.ok) throw new Error(result.error.message);
    const written = applyLineEdits('', result.value.lines);

    expect(written).toContain('board:');
    expect(parseFence(written).doc.parts.map((one) => one.id)).toEqual(['R1']);
  });
});

describe('図は読めた所まで描く', () => {
  test('転んだ行があっても、読めた部品で板が描ける', () => {
    const { svg, errors } = renderPerfboard(BROKEN_BLOCK);
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
    expect(() => renderPerfboard(source)).not.toThrow();
  });
});

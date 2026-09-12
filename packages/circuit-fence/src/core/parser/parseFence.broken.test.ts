import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';
import { insertPart } from '../edit/insert.ts';
import { parseAddress } from '../model/address.ts';
import { applyRewrite } from '../edit/shared.ts';
import { compileCircuit } from '../index.ts';

/**
 * **読めない行があっても止めない** (52 の docs/54)。
 *
 * 以前は YAML が 1 か所でも転ぶと `doc: null` を返し、置く・動かす・消すが
 * 全部「フェンスを読めないので…できません」で断られていた。**エディタが主体**
 * なので、読めた所は返し、読めなかった行だけ行番号つきで言う。
 */

/**
 * 注釈の字に `: ` を引用符なしで書いた形 (`examples/errors/04-notes.md`)。
 * YAML は 5 行目で転ぶが、その上の `title:` と `parts:` は読める。
 */
const BROKEN_NOTE = [
  'title: 図01',
  'parts:',
  '  R1: resistor a1 a3 10k',
  'notes:',
  '  - text b1: R1: resistor a1 a3 10k',
  '',
].join('\n');

/** 閉じ忘れたフロー形式。**その行から下がまるごと読めない**、いちばん重い壊れ方。 */
const UNCLOSED = ['parts:', '  R1: [unclosed', ''].join('\n');

describe('YAML が転んでも読めた所は返す', () => {
  test('転んだ行があっても doc は返る', () => {
    expect(parseFence(BROKEN_NOTE).doc).not.toBeNull();
  });

  test('転んだ行の上に書いた部品は読める', () => {
    expect(parseFence(BROKEN_NOTE).doc.parts.map((one) => one.id)).toEqual(['R1']);
  });

  test('転んだ行の上に書いた題も読める', () => {
    expect(parseFence(BROKEN_NOTE).doc.title).toBe('図01');
  });

  test('読めなかった行は行番号つきで言う', () => {
    const { errors } = parseFence(BROKEN_NOTE);
    expect(errors.some((one) => one.message.includes('YAML の構文エラー') && one.line === 5)).toBe(true);
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
    const result = insertPart(BROKEN_NOTE, { id: 'R2', type: 'resistor', at: [parseAddress('c1')!] });
    expect(result.ok).toBe(true);
  });

  test('置いた部品は読み直せて、転んだ行はそのまま残る', () => {
    const result = insertPart(BROKEN_NOTE, { id: 'R2', type: 'resistor', at: [parseAddress('c1')!] });
    if (!result.ok) throw new Error(result.error.message);
    const written = applyRewrite(BROKEN_NOTE, result.value);

    expect(parseFence(written).doc.parts.map((one) => one.id)).toEqual(['R1', 'R2']);
    // 転んだ行は触らない (直すのは書いた人)。
    expect(written).toContain('  - text b1: R1: resistor a1 a3 10k');
  });
});

describe('図は読めた所まで描く', () => {
  test('転んだ行があっても、読めた部品で図が組める', () => {
    const { tex, errors } = compileCircuit(BROKEN_NOTE);
    expect(tex).not.toBeNull();
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
    expect(() => compileCircuit(source)).not.toThrow();
  });
});

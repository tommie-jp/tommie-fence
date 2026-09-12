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

describe('置いた行が読めないときは断る', () => {
  // **「置きました」と言って何も増えないのが一番わるい。** 根がマップでない本文
  // (ただの字) へ行を足すと、足した行ごと読めなくなる。読めた所を返す形に
  // した以上、その代償は黙って払わずに理由を言う (52 の docs/54)。
  test('ただの字の本文に置こうとすると断る', () => {
    expect(insertPart('ただの字\n', { id: 'R9', type: 'resistor', at: [parseAddress('c1')!] }).ok).toBe(false);
  });

  test('読めるフェンスなら今までどおり置ける', () => {
    const result = insertPart(BROKEN_NOTE, { id: 'R9', type: 'resistor', at: [parseAddress('c1')!] });

    expect(result.ok).toBe(true);
  });

  // 並びの本文も同じ — `parts:` を足しても根は並びのままで、置いた行は読めない。
  test('並びの本文に置こうとすると断る', () => {
    expect(insertPart('- a1 -- a3\n', { id: 'R9', type: 'resistor', at: [parseAddress('c1')!] }).ok).toBe(false);
  });
});

describe('同じ行の YAML エラーは 1 件にする', () => {
  // yaml は 1 つの壊れ方を別の角度から 2 度言うことがある (「Nested mappings…」と
  // 「Implicit keys…」)。帯は人が読む場所で件数に頭打ちがあるので、同じ行の
  // 2 件目は落とす。**直す場所は行なので、行が分かれば足りる。**
  test('1 つの行について 1 件だけ言う', () => {
    const { errors } = parseFence('parts:\n  R1: resistor a1 a3\n  BAT:\n  R2: resistor e1 e3\n    type: device\n');
    const yaml = errors.filter((one) => one.message.includes('YAML の構文エラー'));
    const lines = yaml.map((one) => one.line);

    expect(new Set(lines).size).toBe(yaml.length);
  });
});

describe('図を組む側も落ちない', () => {
  test.each(NASTY)('%j から図を組もうとしても投げない', (source) => {
    expect(() => compileCircuit(source)).not.toThrow();
  });
});

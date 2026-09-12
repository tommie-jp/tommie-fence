import { describe, expect, test } from 'vitest';
import { applyLineEdits } from 'fence-kit';
import { parseFence } from './parseFence.ts';
import { duplicatePart, insertPart, insertWire } from '../edit/insert.ts';
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
  test('空のフェンスでも、中身は空で形が揃う', () => {
    const { doc } = parseFence('');

    expect([doc.parts.length, doc.wires.length, doc.devices.length]).toEqual([0, 0, 0]);
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

  test.each(NASTY)('%j を読んでも、中身の形は揃っている', (source) => {
    const { doc } = parseFence(source);

    expect(doc.board.cols).toBeGreaterThan(0);
  });
});

describe('board: を書き足す', () => {
  const NO_BOARD = 'parts:\n  R1: resistor b2 b6 1k\n';

  test('board: が無いフェンスに置くと書き足す', () => {
    const result = insertPart(NO_BOARD, { id: 'R2', type: 'resistor', at: [at('d2')] });
    if (!result.ok) throw new Error(result.error.message);

    expect(applyLineEdits(NO_BOARD, result.value.lines)).toContain('board: ');
  });

  // **複製も「置く」の一種。** 置くときだけ書き足すと、複製で増やした
  // フェンスは「board: が要ります」と言われ続ける。
  test('board: が無いフェンスで複製しても書き足す', () => {
    const result = duplicatePart(NO_BOARD, 'R1', 'R2');
    if (!result.ok) throw new Error(result.error.message);

    expect(applyLineEdits(NO_BOARD, result.value.lines)).toContain('board: ');
  });

  test('配線を引くときも書き足す', () => {
    const source = 'parts:\n  R1: resistor b2 b6 1k\n';
    const result = insertWire(source, at('b2'), at('b10'));
    if (!result.ok) throw new Error(result.error.message);

    expect(applyLineEdits(source, result.value.lines)).toContain('board: ');
  });

  // **2 つ書かれると「board: が 2 つあります」で図が出続ける** ので気づきにくい。
  // 置く・配線・複製の 3 つとも見る。
  test.each([
    ['置く', (source: string) => insertPart(source, { id: 'R2', type: 'resistor', at: [at('d2')] })],
    ['配線', (source: string) => insertWire(source, at('b2'), at('b10'))],
    ['複製', (source: string) => duplicatePart(source, 'R1', 'R2')],
  ])('board: があるフェンスに %s と、board: は 1 つのまま', (_label, run) => {
    const written = 'board: 12x7\nparts:\n  R1: resistor b2 b6 1k\n';
    const result = run(written);
    if (!result.ok) throw new Error(result.error.message);

    const out = applyLineEdits(written, result.value.lines);
    expect(out.split('\n').filter((line) => line.startsWith('board:'))).toHaveLength(1);
  });
});

describe('board: が読めないとき', () => {
  // **書いた板と描いた板が食い違ったまま黙らない。** 前は `doc: null` で図が
  // 出なかったので誤った図は出なかった。読めた所を返す形にした以上、
  // 何の板で描いているかは言わないと、読み手が図を信じてしまう。
  test('読めない board: では、既定の板で描いていることを言う', () => {
    const { doc, errors } = parseFence('board: elegoo-5x7\nparts:\n  R1: resistor b2 b6\n');

    expect(doc.board.cols).toBe(25);
    expect(errors.some((one) => one.message.includes('既定の板'))).toBe(true);
  });

  test('大きすぎる板でも、描いた板を言う', () => {
    const { errors } = parseFence('board: 1000x1000\n');

    expect(errors.some((one) => one.message.includes('既定の板'))).toBe(true);
  });

  // **読めた所は捨てない。** 色が読めないだけで大きさまで捨てると、
  // 書いてある 10x8 ではなく既定の 25x15 の図が黙って出る。
  test('色が読めなくても、書いてある大きさで描く', () => {
    const { doc, errors } = parseFence('board:\n  size: 10x8\n  color: gold\nparts:\n  R1: resistor b2 b6\n');

    expect([doc.board.cols, doc.board.rows]).toEqual([10, 8]);
    expect(errors.some((one) => one.message.includes('gold'))).toBe(true);
    expect(errors.some((one) => one.message.includes('既定の板'))).toBe(false);
  });

  test('board: が書いてあれば「board: が要ります」は言わない', () => {
    const { errors } = parseFence('board: elegoo-5x7\n');

    expect(errors.some((one) => one.message.includes('board: が要ります'))).toBe(false);
  });
});

describe('board: を書き足す先', () => {
  // **YAML の文書開始記号やディレクティブの上に入れない。** 行 1 に無条件で
  // 差し込むと、読めていたフェンスをエディタ自身が読めなくする。
  test('--- の下に入れる', () => {
    const source = '---\nparts:\n  R1: resistor c2 c6\n';
    const result = insertPart(source, { id: 'R2', type: 'resistor', at: [at('e2')] });
    if (!result.ok) throw new Error(result.error.message);
    const out = applyLineEdits(source, result.value.lines);

    expect(out.startsWith('---\n')).toBe(true);
    expect(parseFence(out).doc.parts.map((one) => one.id)).toEqual(['R1', 'R2']);
  });

  test('%YAML のディレクティブの下に入れる', () => {
    const source = '%YAML 1.2\n---\nparts:\n  R1: resistor c2 c6\n';
    const result = insertPart(source, { id: 'R2', type: 'resistor', at: [at('e2')] });
    if (!result.ok) throw new Error(result.error.message);
    const out = applyLineEdits(source, result.value.lines);

    expect(out.startsWith('%YAML 1.2\n---\n')).toBe(true);
    expect(parseFence(out).doc.parts.map((one) => one.id)).toEqual(['R1', 'R2']);
  });

  test('先頭のコメントの下に入れる', () => {
    const source = '# めも\nparts:\n  R1: resistor c2 c6\n';
    const result = insertPart(source, { id: 'R2', type: 'resistor', at: [at('e2')] });
    if (!result.ok) throw new Error(result.error.message);

    expect(applyLineEdits(source, result.value.lines).startsWith('# めも\n')).toBe(true);
  });

  // 機器を `board` と名付けると、字下げされた `board:` が本文に現れる。
  test('字下げされた board: は頭のキーと数えない', () => {
    const source = 'devices:\n  board:\n    type: device\n    at: bottom\nparts:\n  R1: resistor c2 c6\n';
    const result = insertPart(source, { id: 'R2', type: 'resistor', at: [at('e2')] });
    if (!result.ok) throw new Error(result.error.message);

    expect(applyLineEdits(source, result.value.lines)).toContain('board: 25x15');
  });
});

describe('置いた行が読めないときは断る', () => {
  // **「置きました」と言って何も増えないのが一番わるい。** 根がマップでない本文
  // (ただの字) へ行を足すと、足した行ごと読めなくなる。読めた所を返す形に
  // した以上、その代償は黙って払わずに理由を言う (52 の docs/54)。
  test('ただの字の本文に置こうとすると断る', () => {
    expect(insertPart('ただの字\n', { id: 'R9', type: 'resistor', at: [at('d2')] }).ok).toBe(false);
  });

  test('読めるフェンスなら今までどおり置ける', () => {
    const result = insertPart(BROKEN_BLOCK, { id: 'R9', type: 'resistor', at: [at('d2')] });

    expect(result.ok).toBe(true);
  });

  /**
   * 並びの本文では**置ける**。`board:` を頭に書き足すぶん根がマップになり、
   * 続く `parts:` も読めるようになるため。もとの `- a1 -- a3` は読めないまま
   * 帯に出る (直すのは書いた人で、エディタは触らない)。
   */
  test('並びの本文では、board: を書くぶん置ける', () => {
    const result = insertPart('- a1 -- a3\n', { id: 'R9', type: 'resistor', at: [at('d2')] });
    if (!result.ok) throw new Error(result.error.message);
    const out = applyLineEdits('- a1 -- a3\n', result.value.lines);

    expect(parseFence(out).doc.parts.map((one) => one.id)).toEqual(['R9']);
    expect(out).toContain('- a1 -- a3');
  });
});

describe('同じ行の YAML エラーは 1 件にする', () => {
  // yaml は 1 つの壊れ方を別の角度から 2 度言うことがある (「Nested mappings…」と
  // 「Implicit keys…」)。帯は人が読む場所で件数に頭打ちがあるので、同じ行の
  // 2 件目は落とす。**直す場所は行なので、行が分かれば足りる。**
  test('1 つの行について 1 件だけ言う', () => {
    const { errors } = parseFence(BROKEN_BLOCK);
    const yaml = errors.filter((one) => one.message.includes('YAML の構文エラー'));
    const lines = yaml.map((one) => one.line);

    expect(new Set(lines).size).toBe(yaml.length);
  });
});

describe('図を組む側も落ちない', () => {
  test.each(NASTY)('%j から図を組もうとしても投げない', (source) => {
    expect(() => renderPerfboard(source)).not.toThrow();
  });
});

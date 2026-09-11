import { describe, expect, test } from 'vitest';
import { asDocument, changedSpan, fenceAt, fencesIn, labelOf, lineOfOffset, replaceFence, spanOffsets, titleOf } from './document.ts';

const DOC = [
  '# 例',                       // 0
  '',                           // 1
  '```breadboard',              // 2
  'title: 図01 LED',            // 3
  'board: half',                // 4
  '```',                        // 5
  '',                           // 6
  'つづき。',                    // 7
  '',                           // 8
  '```circuit',                 // 9
  'title: 図02 RC',             // 10
  'parts:',                     // 11
  '```',                        // 12
  '',                           // 13
].join('\n');

describe('fencesIn', () => {
  /**
   * **`line` は本文の 1 行目で 0 始まり** (開き記号の行ではない)。
   * `fence-kit` の `fenceLine` と同じ数え方で、ここをずらすと書き換えが
   * 1 行ずれる。上の DOC では開き記号が 2 行目、本文は 3 行目から。
   */
  test('言語をまたいで行順に並べる', () => {
    // Act
    const found = fencesIn(DOC);

    // Assert
    expect(found.map((one) => [one.kind, one.line, one.title])).toEqual([
      ['breadboard', 3, '図01 LED'],
      ['circuit', 10, '図02 RC'],
    ]);
  });

  test('本文はフェンスの中身そのもの', () => {
    expect(fencesIn(DOC)[0]?.source).toBe('title: 図01 LED\nboard: half\n');
  });

  test('フェンスが無ければ空', () => {
    expect(fencesIn('# 見出しだけ\n')).toEqual([]);
  });

  test('知らない言語のフェンスは数えない', () => {
    expect(fencesIn('```yaml\na: 1\n```\n')).toEqual([]);
  });
});

describe('titleOf', () => {
  test('title をそのまま返す', () => {
    expect(titleOf('title: 図01 LED と抵抗\nboard: half\n')).toBe('図01 LED と抵抗');
  });

  test('引用符は外す', () => {
    expect(titleOf('title: "図02 RC"\n')).toBe('図02 RC');
    expect(titleOf("title: '図02 RC'\n")).toBe('図02 RC');
  });

  test('無ければ null (種類で言うのは呼ぶ側)', () => {
    expect(titleOf('board: 12x7\n')).toBeNull();
    expect(titleOf('title:   \n')).toBeNull();
  });

  /** 部品の中の題は図の題ではない。 */
  test('字下げした title は拾わない', () => {
    expect(titleOf('parts:\n  title: これは部品\n')).toBeNull();
  });

  test('長い題は切る', () => {
    const said = titleOf(`title: ${'あ'.repeat(200)}\n`);

    expect(said?.length).toBeLessThan(70);
    expect(said?.endsWith('…')).toBe(true);
  });
});

describe('labelOf', () => {
  test('題が無ければ種類で言う (無題の行にしない)', () => {
    const [one] = fencesIn('```perfboard\nboard: 12x7\n```\n');

    expect(one && labelOf(one)).toBe('perfboard の図');
  });
});

/**
 * **カーソルのある所が「いまのフェンス」** — 拡張と同じ決め方。
 * 記号の行もそのフェンスの中と数える (記号の上で「外」と言われると、
 * 掴めない理由が分からない)。
 */
describe('fenceAt', () => {
  const fences = fencesIn(DOC);

  test('本文の行はそのフェンス', () => {
    expect(fenceAt(fences, 3)).toBe(0);
    expect(fenceAt(fences, 4)).toBe(0);
    expect(fenceAt(fences, 11)).toBe(1);
  });

  test('開き記号と閉じ記号の行も中と数える', () => {
    expect(fenceAt(fences, 2)).toBe(0);
    expect(fenceAt(fences, 5)).toBe(0);
    expect(fenceAt(fences, 9)).toBe(1);
    expect(fenceAt(fences, 12)).toBe(1);
  });

  test('フェンスの外は -1', () => {
    expect(fenceAt(fences, 0)).toBe(-1);
    expect(fenceAt(fences, 7)).toBe(-1);
    expect(fenceAt(fences, 13)).toBe(-1);
  });
});

describe('lineOfOffset', () => {
  test('位置を行に直す', () => {
    expect(lineOfOffset(DOC, 0)).toBe(0);
    expect(lineOfOffset(DOC, DOC.indexOf('board: half'))).toBe(4);
    expect(lineOfOffset(DOC, DOC.indexOf('parts:'))).toBe(11);
  });
});

/** 配ってあるリンクはフェンス 1 本を運ぶ。開く前に文書へ仕立てる。 */
describe('asDocument', () => {
  test('フェンス 1 本の Markdown にする', () => {
    expect(asDocument('breadboard', 'board: half\n')).toBe('```breadboard\nboard: half\n```\n');
  });

  test('仕立てた文書は、そのフェンス 1 本として読み直せる', () => {
    const found = fencesIn(asDocument('circuit', 'title: 図01\nparts:\n'));

    expect(found).toEqual([{ kind: 'circuit', line: 1, source: 'title: 図01\nparts:\n', title: '図01' }]);
  });
});

describe('replaceFence', () => {
  test('そのフェンスの本文だけを入れ替える', () => {
    // Arrange
    const [one] = fencesIn(DOC);

    // Act
    const out = one ? replaceFence(DOC, one, 'title: 別の図\n') : '';

    // Assert
    expect(out).toContain('title: 別の図');
    expect(out).not.toContain('board: half');
  });

  /** 書き戻すときに要る性質。**開いていない行は 1 字も変えない。** */
  test('散文も、もう 1 つのフェンスも動かさない', () => {
    const [one] = fencesIn(DOC);
    const out = one ? replaceFence(DOC, one, 'x\n') : '';

    expect(out.split('\n')[0]).toBe('# 例');
    expect(out).toContain('つづき。');
    expect(out).toContain('title: 図02 RC');
  });

  test('行数が変わっても、後ろのフェンスを読み直せる', () => {
    const [one] = fencesIn(DOC);
    const out = one ? replaceFence(DOC, one, 'a\nb\nc\nd\n') : '';

    expect(fencesIn(out).map((f) => [f.kind, f.title])).toEqual([
      ['breadboard', null],
      ['circuit', '図02 RC'],
    ]);
  });
});

/**
 * **殻が書き換えた所を、Markdown の窓を開いたときに選んでおく** (52 の docs/48)。
 * 窓にすると「掴む → 字が変わる」を同時には見せられないので、開いた瞬間に
 * 「ここが変わった」を見せる。頭と尻の同じ行を削って、残ったところが変わった所。
 */
describe('changedSpan', () => {
  const WAS = ['# 例', '```breadboard', 'parts:', '  R1: resistor a5 a10', '  D1: led b12 b13', '```', ''].join('\n');

  test('同じなら null', () => {
    expect(changedSpan(WAS, WAS)).toBeNull();
  });

  test('1 行だけ変われば、その 1 行', () => {
    // Arrange: 殻が R1 を動かした
    const moved = WAS.replace('a5 a10', 'a7 a12');

    // Act & Assert
    expect(changedSpan(WAS, moved)).toEqual({ from: 3, to: 4 });
  });

  test('行が増えたら、増えた行', () => {
    const added = WAS.replace('  D1: led b12 b13', '  D1: led b12 b13\n  R2: resistor c1 c3');

    expect(changedSpan(WAS, added)).toEqual({ from: 5, to: 6 });
  });

  /** 消えただけのときは選ぶ行が無い。**その位置にカーソルを置く** (`from === to`)。 */
  test('行が消えただけなら、幅の無い範囲', () => {
    const dropped = WAS.replace('  R1: resistor a5 a10\n', '');

    expect(changedSpan(WAS, dropped)).toEqual({ from: 3, to: 3 });
  });

  test('離れた 2 か所が変われば、その間ぜんぶ', () => {
    const both = WAS.replace('a5 a10', 'a7 a12').replace('b12 b13', 'b14 b15');

    expect(changedSpan(WAS, both)).toEqual({ from: 3, to: 5 });
  });

  /** 頭で数えた行を尻でもう一度数えない (同じ行が並ぶ文書で範囲が裏返る)。 */
  test('頭と尻が重ならない', () => {
    expect(changedSpan('a\nb\na', 'a')).toEqual({ from: 1, to: 1 });
    expect(changedSpan('a', 'a\nb\na')).toEqual({ from: 1, to: 3 });
  });

  test('1 行目が変われば 0 から', () => {
    expect(changedSpan(WAS, WAS.replace('# 例', '# 例 2'))).toEqual({ from: 0, to: 1 });
  });
});

describe('spanOffsets', () => {
  const TEXT = 'a\nbc\nd';

  test('行の範囲を字の位置に直す。改行は含めない', () => {
    expect(spanOffsets(TEXT, { from: 1, to: 2 })).toEqual({ start: 2, end: 4 });
    expect(TEXT.slice(2, 4)).toBe('bc');
  });

  test('何行にもまたがる', () => {
    expect(spanOffsets(TEXT, { from: 0, to: 3 })).toEqual({ start: 0, end: 6 });
  });

  test('幅の無い範囲は、その行の頭', () => {
    expect(spanOffsets(TEXT, { from: 1, to: 1 })).toEqual({ start: 2, end: 2 });
  });

  /** 尻の行が消えたときは、指す行がもう無い。文書の終わりに置く。 */
  test('文書の外を指したら、文書の終わり', () => {
    expect(spanOffsets(TEXT, { from: 5, to: 5 })).toEqual({ start: 6, end: 6 });
    expect(spanOffsets(TEXT, { from: 2, to: 9 })).toEqual({ start: 5, end: 6 });
  });
});

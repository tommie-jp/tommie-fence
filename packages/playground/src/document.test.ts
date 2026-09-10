import { describe, expect, test } from 'vitest';
import { asDocument, fenceAt, fencesIn, labelOf, lineOfOffset, replaceFence, titleOf } from './document.ts';

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

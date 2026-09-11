import { describe, expect, test } from 'vitest';
import { EMPTY_DOC, createWorkspace, spanToReveal } from './workspace.ts';
import type { Doc } from './workspace.ts';

/**
 * **頁が持つ文書 1 つの状態** (52 の docs/49)。欄の字が正で、ここは
 * 「いまのフェンス」「直したか」「殻が直前に書き換えた所」を数えるだけ。
 * DOM は知らない — 字の出し入れは外から渡す。
 */

const DOC = [
  '# 例',                       // 0
  '',                           // 1
  '```breadboard',              // 2
  'title: 図01 LED',            // 3
  'board: half',                // 4
  '```',                        // 5
  '',                           // 6
  '```circuit',                 // 7
  'title: 図02 RC',             // 8
  'parts:',                     // 9
  '```',                        // 10
  '',                           // 11
].join('\n');

const led: Doc = { ...EMPTY_DOC, name: '01-led.md', title: 'LED' };

/** 欄の代わり。字を 1 本持つだけ。 */
const boxed = (initial = '') => {
  let text = initial;
  const ws = createWorkspace({ text: () => text, setText: (next) => { text = next; } });
  return { ws, text: () => text };
};

describe('open', () => {
  test('文書を開くと、字が入って最初のフェンスが「いま」になる', () => {
    // Arrange
    const { ws, text } = boxed();

    // Act
    ws.open(led, DOC);

    // Assert
    expect(text()).toBe(DOC);
    expect(ws.doc).toBe(led);
    expect(ws.fences.map((one) => one.title)).toEqual(['図01 LED', '図02 RC']);
    expect(ws.current()?.title).toBe('図01 LED');
    expect(ws.dirty()).toBe(false);
  });

  test('開いたときの字を覚えていて、直すと dirty になる', () => {
    const { ws } = boxed();
    ws.open(led, DOC);

    ws.setText(DOC.replace('half', 'full'));

    expect(ws.dirty()).toBe(true);
    expect(ws.pristine).toBe(DOC);
  });

  test('text は欄の字をそのまま返す', () => {
    const { ws } = boxed('typed');

    expect(ws.text()).toBe('typed');
  });

  /** 前の文書の 1 本目と同じ題が新しい文書の 2 本目にあっても、1 本目から始まる。 */
  test('開き直すと、いつも 1 本目から', () => {
    const { ws } = boxed();
    ws.open(led, '```circuit\nparts:\n```\n');

    ws.open(led, '```breadboard\nboard: half\n```\n\n```circuit\nparts:\n```\n');

    expect(ws.at).toBe(0);
    expect(ws.current()?.kind).toBe('breadboard');
  });

  test('何も開いていなければ dirty ではない (名前が無い)', () => {
    const { ws } = boxed('typed');

    expect(ws.dirty()).toBe(false);
  });
});

describe('reread', () => {
  test('行が増えても、同じフェンスを見続ける', () => {
    const { ws } = boxed();
    ws.open(led, DOC);
    ws.select(1);

    ws.setText(`# 前置き\n\n${DOC}`);

    expect(ws.at).toBe(1);
    expect(ws.current()?.title).toBe('図02 RC');
    expect(ws.current()?.line).toBe(10);
  });

  test('見ていたフェンスが消えたら、残りの中で番号を詰める', () => {
    const { ws } = boxed();
    ws.open(led, DOC);
    ws.select(1);

    ws.setText(DOC.split('\n').slice(0, 7).join('\n'));

    expect(ws.at).toBe(0);
    expect(ws.current()?.title).toBe('図01 LED');
  });

  test('フェンスが無くなれば「いま」は null', () => {
    const { ws } = boxed();
    ws.open(led, DOC);

    ws.setText('# 見出しだけ\n');

    expect(ws.current()).toBeNull();
    expect(ws.at).toBe(0);
  });
});

describe('select / bind / follow', () => {
  test('範囲の外と、いまと同じ番号は false', () => {
    const { ws } = boxed();
    ws.open(led, DOC);

    expect(ws.select(0)).toBe(false);
    expect(ws.select(2)).toBe(false);
    expect(ws.select(-1)).toBe(false);
    expect(ws.select(1)).toBe(true);
    expect(ws.at).toBe(1);
  });

  test('bind は本文の 1 行目で引く (殻の fenceLine)', () => {
    const { ws } = boxed();
    ws.open(led, DOC);

    expect(ws.bind(8)).toBe(true);
    expect(ws.at).toBe(1);
    expect(ws.bind(8)).toBe(false);
    expect(ws.bind(99)).toBe(false);
  });

  test('follow はカーソルの位置 (字の番号) で引く。外なら動かない', () => {
    const { ws } = boxed();
    ws.open(led, DOC);

    expect(ws.follow(DOC.indexOf('parts:'))).toBe(true);
    expect(ws.at).toBe(1);
    expect(ws.follow(0)).toBe(false);
    expect(ws.at).toBe(1);
  });
});

describe('replace (殻からの書き換え)', () => {
  test('変わった所を控え、字を入れ替えて数え直す', () => {
    const { ws, text } = boxed();
    ws.open(led, DOC);

    ws.replace(DOC.replace('board: half', 'board: full'));

    expect(text()).toContain('board: full');
    expect(ws.touched).toEqual({ from: 4, to: 5 });
  });

  test('同じ字なら控えは変わらない', () => {
    const { ws } = boxed();
    ws.open(led, DOC);
    ws.replace(DOC.replace('half', 'full'));

    ws.replace(DOC.replace('half', 'full'));

    expect(ws.touched).toEqual({ from: 4, to: 5 });
  });

  test('欄で打つ・別の文書を開くと控えは消える', () => {
    const { ws } = boxed();
    ws.open(led, DOC);
    ws.replace(DOC.replace('half', 'full'));

    ws.forget();
    expect(ws.touched).toBeNull();

    ws.replace(DOC);
    ws.open(led, DOC);
    expect(ws.touched).toBeNull();
  });
});

describe('kept', () => {
  test('書き戻したら、その字が新しい pristine になる', () => {
    const { ws } = boxed();
    ws.open(led, DOC);
    const typed = DOC.replace('half', 'full');
    ws.setText(typed);

    ws.kept(typed);

    expect(ws.dirty()).toBe(false);
    expect(ws.pristine).toBe(typed);
  });
});

/**
 * **窓を開いたとき、欄のどこを見せるか** (52 の docs/48)。
 * 殻が直前に書き換えた所 → カーソルがいまのフェンスの中ならそのまま →
 * 外ならいまのフェンスの 1 行目。
 */
describe('spanToReveal', () => {
  const { ws } = boxed();
  ws.open(led, DOC);
  const fences = ws.fences;

  test('控えがいまのフェンスの中なら、それ', () => {
    expect(spanToReveal({ fences, at: 0, touched: { from: 4, to: 5 }, caretLine: 0 })).toEqual({ from: 4, to: 5 });
  });

  test('控えが別のフェンスのものなら使わない', () => {
    // 図は B (at: 1) なのに A の行を選ぶと、次に欄を触った瞬間に図が A へ戻る。
    expect(spanToReveal({ fences, at: 1, touched: { from: 4, to: 5 }, caretLine: 0 })).toEqual({ from: 8, to: 8 });
  });

  test('控えが無く、カーソルがいまのフェンスの中なら動かさない', () => {
    expect(spanToReveal({ fences, at: 1, touched: null, caretLine: 9 })).toBeNull();
  });

  test('カーソルが外なら、いまのフェンスの本文の 1 行目', () => {
    expect(spanToReveal({ fences, at: 1, touched: null, caretLine: 4 })).toEqual({ from: 8, to: 8 });
  });

  test('フェンスが無ければ null', () => {
    expect(spanToReveal({ fences: [], at: 0, touched: null, caretLine: 0 })).toBeNull();
  });
});

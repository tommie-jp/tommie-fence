import { describe, expect, test } from 'vitest';
import {
  DEFAULT_NOTE_ALIGN, DEFAULT_NOTE_SIZE, NOTE_ALIGNS, NOTE_COLOR_NAMES, NOTE_COLORS, NOTE_INK,
  NOTE_LEADINGS, NOTE_MARK_COLOR, NOTE_SIZE_NAMES, isNoteAlign, isNoteLeading, isNoteSize,
  noteColor, noteEm, noteFontTex, noteLine, noteSourceLine, noteSpan, noteWidth,
  svgTextAnchorOf, texAnchorOf, texColorOf,
} from './notes.ts';
import type { NoteLeading, NoteSize } from './notes.ts';

describe('注釈の色', () => {
  test('名前で引ける', () => {
    expect(noteColor('red')).toBe(NOTE_COLORS.red);
  });

  test('知らない名前は引けない', () => {
    expect(noteColor('rainbow')).toBeNull();
  });

  // 表を素の `[名前]` で引くと、Object.prototype にある名前が当たってしまう。
  // 引けたことにすると色として扱われ、TeX に無い色名や色でない値が図まで届く。
  test('Object.prototype にある名前は色として引けない', () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(noteColor(name)).toBeNull();
    }
  });

  test('色を書かなかった注釈は地の文字色になる', () => {
    expect(noteColor(null)).toBe(NOTE_INK);
  });

  test('使える色を並べられる', () => {
    expect(NOTE_COLOR_NAMES).toContain('red');
    expect(NOTE_COLOR_NAMES).toContain('blue');
  });

  // render/theme.ts は #000 / #fff / gray を目印にして図の色を塗り替える。
  // そこに入る値をパレットに置くと、注釈だけテーマに引きずられて色が変わる。
  test('テーマの塗り替えが目印にしている色とぶつからない', () => {
    for (const value of Object.values(NOTE_COLORS)) {
      expect(['#000000', '#000', '#ffffff', '#fff', 'gray']).not.toContain(value);
    }
  });

  test('字を置く目印の色とぶつからない', () => {
    expect(NOTE_MARK_COLOR).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.values(NOTE_COLORS)).not.toContain(NOTE_MARK_COLOR);
  });

  test('TeX に渡す色の名前は表から作る (書き手の字がそのまま入らない)', () => {
    expect(texColorOf('red')).toMatch(/^[A-Za-z]+$/);
  });
});

describe('注釈の大きさ', () => {
  const LADDER: readonly NoteSize[] = ['tiny', 'small', 'normal', 'large', 'huge'];

  test('極小から極大まで 5 段ある', () => {
    expect(NOTE_SIZE_NAMES).toEqual([...LADDER]);
  });

  test('書かなかったときは普通の大きさ', () => {
    expect(DEFAULT_NOTE_SIZE).toBe('normal');
  });

  test('表にある名前だけを大きさとして通す', () => {
    expect(isNoteSize('huge')).toBe(true);
    expect(isNoteSize('enormous')).toBe(false);
  });

  test('Object.prototype にある名前は大きさとして通さない', () => {
    for (const name of ['toString', 'constructor', '__proto__']) {
      expect(isNoteSize(name)).toBe(false);
    }
  });

  test('小さいほうから順に大きくなる', () => {
    const sizes = LADDER.map(noteEm);
    for (const [index, em] of sizes.entries()) {
      if (index === 0) continue;
      expect(em).toBeGreaterThan(sizes[index - 1] ?? 0);
    }
  });

  // 図に入る大きさは、実機に通した TeX の指定だけにする (CLAUDE.md 約束 6)。
  test('TeX に渡す指定は表から作る (書き手の字がそのまま入らない)', () => {
    for (const size of LADDER) {
      expect(noteFontTex(size, false)).toMatch(/^\\[A-Za-z]+$/);
    }
  });

  test('太字は TeX の指定を書き足す', () => {
    expect(noteFontTex('normal', true)).toBe(`${noteFontTex('normal', false)}\\bfseries`);
  });

  test('行送りも字の大きさで決まる', () => {
    expect(noteLine('huge')).toBeGreaterThan(noteLine('tiny'));
  });

  test('書き出しの行送りも字の大きさで決まる', () => {
    expect(noteSourceLine('huge', null)).toBeGreaterThan(noteSourceLine('tiny', null));
  });

  // 書き出しは字が続けて並ぶので、地の文と同じ行送りだと間が空いて読みにくい。
  test('書き出しの行送りは地の文より詰める', () => {
    for (const size of LADDER) {
      expect(noteSourceLine(size, null)).toBeLessThan(noteLine(size));
    }
  });

  // 詰めすぎると上の行の下がりと下の行の上がりが噛む。
  test('書き出しの行送りでも、字が上下でぶつからない', () => {
    for (const size of LADDER) {
      expect(noteSourceLine(size, null)).toBeGreaterThan(noteEm(size));
    }
  });
});

describe('書き出しの行送りの段', () => {
  const LADDER: readonly NoteSize[] = ['tiny', 'small', 'normal', 'large', 'huge'];
  const STEPS: readonly (NoteLeading | null)[] = [null, ...NOTE_LEADINGS];

  test('tight は既定よりさらに詰める', () => {
    expect(noteSourceLine('normal', 'tight')).toBeLessThan(noteSourceLine('normal', null));
  });

  test('loose は字の注釈と同じだけ空ける', () => {
    expect(noteSourceLine('normal', 'loose')).toBeCloseTo(noteLine('normal'), 10);
  });

  // 1 em を割ると、上の行の下がりと下の行の上がりが噛む。
  test('どの段でも、字の高さは下回らない', () => {
    for (const size of LADDER) {
      for (const leading of STEPS) {
        expect(noteSourceLine(size, leading)).toBeGreaterThanOrEqual(noteEm(size));
      }
    }
  });

  test('段も字の大きさで決まる', () => {
    for (const leading of STEPS) {
      expect(noteSourceLine('huge', leading)).toBeGreaterThan(noteSourceLine('tiny', leading));
    }
  });

  // 語は 1 つの並びに混ぜて書く。同じ名前があると、どちらの意味か決められない。
  test('段の名前は、大きさや寄せの名前とぶつからない', () => {
    for (const name of NOTE_LEADINGS) {
      expect(isNoteSize(name)).toBe(false);
      expect(isNoteAlign(name)).toBe(false);
      expect(noteColor(name)).toBeNull();
    }
  });

  test('Object.prototype にある名前は段として引けない', () => {
    for (const name of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(isNoteLeading(name)).toBe(false);
    }
  });
});

describe('noteWidth', () => {
  test('空の文字は場所を取らない', () => {
    expect(noteWidth('', 'normal')).toBe(0);
  });

  test('日本語は ASCII より広く見積もる', () => {
    expect(noteWidth('あい', 'normal')).toBeGreaterThan(noteWidth('ab', 'normal'));
  });

  test('字が増えれば広くなる', () => {
    expect(noteWidth('abcd', 'normal')).toBeGreaterThan(noteWidth('ab', 'normal'));
  });

  test('大きい字ほど広く見積もる', () => {
    expect(noteWidth('abcd', 'huge')).toBeGreaterThan(noteWidth('abcd', 'tiny'));
  });
});

describe('注釈の寄せ', () => {
  test('左・真ん中・右の 3 つ', () => {
    expect(NOTE_ALIGNS).toEqual(['left', 'center', 'right']);
  });

  test('書かなかったときは左寄せ (番地が字の左端)', () => {
    expect(DEFAULT_NOTE_ALIGN).toBe('left');
  });

  test('表にある名前だけを寄せとして通す', () => {
    expect(isNoteAlign('center')).toBe(true);
    expect(isNoteAlign('middle')).toBe(false);
    expect(isNoteAlign('toString')).toBe(false);
  });

  test('TikZ のアンカーは表から作る', () => {
    expect(texAnchorOf('left')).toBe('west');
    expect(texAnchorOf('right')).toBe('east');
    expect(texAnchorOf('center')).toBe('center');
  });

  // 左寄せは今までと同じ出力にしたいので、属性を足さない。
  test('左寄せは SVG に属性を足さない', () => {
    expect(svgTextAnchorOf('left')).toBeNull();
    expect(svgTextAnchorOf('center')).toBe('middle');
    expect(svgTextAnchorOf('right')).toBe('end');
  });
});

describe('noteSpan', () => {
  test('左寄せは番地から右へ広がる', () => {
    expect(noteSpan(2, 1, 'left')).toEqual({ from: 2, to: 3 });
  });

  test('右寄せは番地から左へ広がる', () => {
    expect(noteSpan(2, 1, 'right')).toEqual({ from: 1, to: 2 });
  });

  test('真ん中寄せは番地の両側へ広がる', () => {
    expect(noteSpan(2, 1, 'center')).toEqual({ from: 1.5, to: 2.5 });
  });
});

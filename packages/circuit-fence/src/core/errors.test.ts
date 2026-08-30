import { describe, expect, test } from 'vitest';
import { attachSourceText, fail, fenceError, ok, safeToken, shiftErrors, snippetOf } from './errors.ts';
import { LIMITS } from './limits.ts';

describe('safeToken', () => {
  test('keeps the characters an identifier or a value is written with', () => {
    expect(safeToken('R1')).toBe('R1');
    expect(safeToken('10k')).toBe('10k');
    expect(safeToken('U1.out')).toBe('U1.out');
  });

  test('replaces markup so an error message cannot carry a tag into the page', () => {
    expect(safeToken('<script>alert(1)</script>')).toBe('script alert 1 /script');
  });

  test('trims a token that is too long to sit in an error message', () => {
    expect(safeToken('a'.repeat(40))).toBe(`${'a'.repeat(32)}…`);
  });

  test('collapses whitespace so a multi-line value stays on one line', () => {
    expect(safeToken('a\n\nb')).toBe('a b');
  });
});

describe('fenceError', () => {
  test('carries the line the reader has to go and fix', () => {
    expect(fenceError('斜めです', 3)).toEqual({ message: '斜めです', line: 3 });
  });

  test('accepts a null line for a problem that belongs to no single line', () => {
    expect(fenceError('部品が多すぎます', null)).toEqual({ message: '部品が多すぎます', line: null });
  });

  test('carries the second line the message points at, instead of writing it into the text', () => {
    // 本文に「(2 行目)」と書いてしまうと、Markdown の行へずらすときに直せない。
    expect(fenceError('重なっています', 3, 1)).toEqual({ message: '重なっています', line: 3, related: 1 });
  });

  test('carries the spelling that could not be read, so the line can be pointed at later', () => {
    expect(fenceError('種類 resistr は知りません', 2, null, 'resistr')).toEqual({
      message: '種類 resistr は知りません',
      line: 2,
      token: 'resistr',
    });
  });
});

describe('snippetOf', () => {
  test('keeps the line as written, indentation included, so the column stays honest', () => {
    expect(snippetOf('  R1: resistor a1 a3')).toBe('  R1: resistor a1 a3');
  });

  test('drops trailing whitespace, which no reader can see anyway', () => {
    expect(snippetOf('  R1: r a1 a3   \r')).toBe('  R1: r a1 a3');
  });

  test('turns a control character into a space so one character stays one column', () => {
    // 詰めて落とすと、そこから先の桁が 1 つずつずれてキャレットが的を外す。
    expect(snippetOf('a\tb')).toBe('a b');
  });

  test('says nothing for a line with nothing on it', () => {
    expect(snippetOf('   ')).toBeNull();
  });

  test('turns the C1 controls into spaces too, which a terminal reads as escapes', () => {
    // U+009B は端末が CSI として読む。素で流すと、他人の書いたノートが端末を操れる。
    // 描画側の escapeHtml はこの帯の字を**消す**ので、揃えておかないと印の位置もずれる。
    expect(snippetOf('a\u009b31mb')).toBe('a 31mb');
  });

  test('turns the characters that split a line into spaces', () => {
    // 帯は white-space: pre で組むので、U+2028 は帯の中で行を割る。
    // 1 行のはずの中身が 2 行になると、印だけが別のところに残る。
    expect(snippetOf('a\u2028b')).toBe('a b');
    expect(snippetOf('a\u2029b')).toBe('a b');
  });

  test('turns the characters that reorder text into spaces', () => {
    // U+202E から先は右から左に並び替わる。書いていない行を見せる字は通さない。
    expect(snippetOf('a\u202eb')).toBe('a b');
    expect(snippetOf('a\u200bb')).toBe('a b');
    expect(snippetOf('a\ufeffb')).toBe('a b');
  });

  test('trims by characters, not by the units they are stored in', () => {
    // UTF-16 の数で切ると絵文字が真っ二つになり、片割れが出口へ出る。
    const trimmed = snippetOf('\u{1f600}'.repeat(200)) ?? '';

    expect([...trimmed]).toHaveLength(LIMITS.snippetLength + 1);
    expect(trimmed.endsWith('\u{1f600}…')).toBe(true);
  });

  test('trims a line too long to sit under an error message', () => {
    expect(snippetOf('x'.repeat(200))).toBe(`${'x'.repeat(LIMITS.snippetLength)}…`);
  });
});

describe('attachSourceText', () => {
  const source = ['parts:', '  R1: resistr a1 a3', ''].join('\n');

  test('adds the line the reader has to go and look at', () => {
    expect(attachSourceText([fenceError('種類 resistr は知りません', 2)], source)).toEqual([
      { message: '種類 resistr は知りません', line: 2, text: '  R1: resistr a1 a3' },
    ]);
  });

  test('folds the spelling into a column and drops it, so no raw input reaches the output', () => {
    expect(attachSourceText([fenceError('種類 resistr は知りません', 2, null, 'resistr')], source)).toEqual([
      { message: '種類 resistr は知りません', line: 2, text: '  R1: resistr a1 a3', column: 7, span: 7 },
    ]);
  });

  test('leaves an error that belongs to no line alone', () => {
    expect(attachSourceText([fenceError('部品が多すぎます', null)], source)).toEqual([
      { message: '部品が多すぎます', line: null },
    ]);
  });

  test('adds nothing when the line is past the end of the fence', () => {
    expect(attachSourceText([fenceError('読めません', 9)], source)).toEqual([{ message: '読めません', line: 9 }]);
  });

  test('points at nothing when the spelling is only part of a longer word', () => {
    // `a1` を `a10` の中に見つけて指すと、書いていないところにキャレットが立つ。
    const written = ['parts:', '  R1: r a10 a3', ''].join('\n');

    expect(attachSourceText([fenceError('読めません', 2, null, 'a1')], written)).toEqual([
      { message: '読めません', line: 2, text: '  R1: r a10 a3' },
    ]);
  });

  test('points at nothing when the same spelling is written more than once on the line', () => {
    // `resistr: resistr a1 a3` の 1 つめは読めている部品 ID。先頭を選ぶと、
    // 読めているほうにキャレットが立つ。どれか分からないなら指さない。
    const written = ['parts:', '  resistr: resistr a1 a3', ''].join('\n');
    const [error] = attachSourceText([fenceError('種類 resistr は知りません', 2, null, 'resistr')], written);

    expect(error?.text).toBe('  resistr: resistr a1 a3');
    expect(error?.column).toBeUndefined();
  });

  test('keeps a column that was already known, instead of hunting for it again', () => {
    // YAML の構文エラーはライブラリが桁まで返す。探し直す理由がない。
    const [error] = attachSourceText([{ message: 'YAML の構文エラー', line: 2, column: 3 }], source);

    expect(error?.column).toBe(3);
    expect(error?.span).toBeUndefined();
  });
});

describe('Result', () => {
  test('ok carries the value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  test('fail carries the message and the line', () => {
    expect(fail('読めません', 7)).toEqual({ ok: false, error: { message: '読めません', line: 7 } });
  });
});

describe('shiftErrors', () => {
  test('moves the line from the fence to the document', () => {
    expect(shiftErrors([fenceError('斜めです', 3)], 10)).toEqual([{ message: '斜めです', line: 13 }]);
  });

  test('moves the line the message points at as well', () => {
    // 片方だけ動かすと、帯の「(2 行目)」だけが元のフェンスの行を指したままになる。
    expect(shiftErrors([fenceError('重なっています', 3, 2)], 10)).toEqual([
      { message: '重なっています', line: 13, related: 12 },
    ]);
  });

  test('leaves an error that belongs to no line where it is', () => {
    expect(shiftErrors([fenceError('部品が多すぎます', null)], 10)).toEqual([
      { message: '部品が多すぎます', line: null },
    ]);
  });

  test('carries the line content and the column along, which belong to the fence, not the document', () => {
    // 行番号だけがずれる。中身と桁はフェンスの行から取ったものなので動かさない。
    expect(shiftErrors([{ message: '読めません', line: 3, text: '  R1: r a1', column: 7, span: 1 }], 10)).toEqual([
      { message: '読めません', line: 13, text: '  R1: r a1', column: 7, span: 1 },
    ]);
  });
});

import { describe, expect, test } from 'vitest';
import { fenceError } from '../errors.ts';
import { errorLine, messageLine, renderErrorBanner, renderErrorCard } from './errorCard.ts';

describe('errorLine', () => {
  test('names the fence first so the reader knows who is complaining', () => {
    expect(errorLine(fenceError('種類 resistr は知りません', 7))).toBe('circuit: 7 行目: 種類 resistr は知りません');
  });

  test('puts the line before the message so the reader knows where to go', () => {
    expect(errorLine(fenceError('斜めです', 3))).toBe('circuit: 3 行目: 斜めです');
  });

  test('leaves out the line when the problem belongs to no single line', () => {
    expect(errorLine(fenceError('部品が多すぎます', null))).toBe('circuit: 部品が多すぎます');
  });
});

describe('errorLine の相手の行', () => {
  test('adds the second line the message points at', () => {
    expect(errorLine(fenceError('部品 R2 が R1 と同じ場所に重なっています', 11, 10))).toBe(
      'circuit: 11 行目: 部品 R2 が R1 と同じ場所に重なっています (10 行目)',
    );
  });
});

describe('messageLine', () => {
  test('leaves the prefix off for callers that put their own label in front', () => {
    expect(messageLine(fenceError('斜めです', 3))).toBe('3 行目: 斜めです');
  });
});

describe('renderErrorBanner', () => {
  test('returns nothing when everything was readable', () => {
    expect(renderErrorBanner([])).toBe('');
  });

  test('lists each error with its line', () => {
    const html = renderErrorBanner([fenceError('斜めです', 3), fenceError('番地の形ではありません', 5)]);

    expect(html).toContain('circuit: 3 行目: 斜めです');
    expect(html).toContain('circuit: 5 行目: 番地の形ではありません');
  });

  test('escapes the message so an error cannot carry markup into the page', () => {
    const html = renderErrorBanner([fenceError('<img src=x onerror=alert(1)>', 1)]);

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('shows the line the reader has to go and fix, not just its number', () => {
    // プレビューではフェンスが図に差し替わるので、行番号だけでは照らす先がない。
    const html = renderErrorBanner([{ message: '種類 resistr は知りません', line: 2, text: '  R1: resistr a1 a3' }]);

    expect(html).toContain('R1: resistr a1 a3');
  });

  test('marks the spelling that could not be read', () => {
    const html = renderErrorBanner([
      { message: '種類 resistr は知りません', line: 2, text: '  R1: resistr a1 a3', column: 7, span: 7 },
    ]);

    expect(html).toContain('<mark>resistr</mark>');
  });

  test('escapes the line content too, which is written by someone else', () => {
    const html = renderErrorBanner([{ message: '読めません', line: 1, text: '<img src=x onerror=alert(1)>' }]);

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('escapes the line content around a mark as well', () => {
    const html = renderErrorBanner([{ message: '読めません', line: 1, text: '<a><b><c>', column: 4, span: 3 }]);

    expect(html).not.toContain('<a>');
    expect(html).toContain('&lt;a&gt;<mark>&lt;b&gt;</mark>&lt;c&gt;');
  });

  // 1 件が行の中身と印で 2〜3 行を使うようになったので、並べる数は少ない。
  test('sums up the tail instead of printing every error', () => {
    const errors = Array.from({ length: 12 }, (_, index) => fenceError(`エラー ${index}`, index + 1));
    const html = renderErrorBanner(errors);

    expect(html).toContain('ほかに 7 件');
    expect(html).not.toContain('エラー 9');
  });
});

describe('renderErrorCard', () => {
  test('says the fence could not be read and lists why', () => {
    const html = renderErrorCard([fenceError('YAML の構文エラー', 2)]);

    expect(html).toContain('circuit');
    expect(html).toContain('circuit: 2 行目: YAML の構文エラー');
  });

  test('escapes the message here too', () => {
    const html = renderErrorCard([fenceError('</div><script>alert(1)</script>', 1)]);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

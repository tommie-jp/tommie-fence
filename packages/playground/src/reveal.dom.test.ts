// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { showSpan } from './reveal.ts';

/**
 * **欄の中の、その範囲を見せる** (52 の docs/48)。Markdown の窓を開いたときに、
 * 殻が直前に書き換えた行を選んでおくのに使う。
 *
 * jsdom は字を並べない (高さが測れない) ので、寄せる量はブラウザで確かめる。
 * ここで見るのは「選ぶ・焦点を移すか」の決め。
 */
const areaWith = (text: string): HTMLTextAreaElement => {
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  return area;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('showSpan', () => {
  test('範囲を選ぶ', () => {
    // Arrange
    const area = areaWith('a\nbc\nd');

    // Act
    showSpan(area, { start: 2, end: 4 }, { focus: true });

    // Assert
    expect([area.selectionStart, area.selectionEnd]).toEqual([2, 4]);
  });

  test('頼まれたときだけ焦点を移す', () => {
    const area = areaWith('a\nbc\nd');

    showSpan(area, { start: 2, end: 4 }, { focus: true });

    expect(document.activeElement).toBe(area);
  });

  /** **指で触る端末では焦点を移さない** — キーボードが出て、窓の図が隠れる。 */
  test('焦点を移さないときも、範囲は選んでおく', () => {
    const area = areaWith('a\nbc\nd');
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();

    showSpan(area, { start: 2, end: 4 }, { focus: false });

    expect(document.activeElement).toBe(other);
    expect([area.selectionStart, area.selectionEnd]).toEqual([2, 4]);
  });

  test('測り終わったら、測るための写しを残さない', () => {
    const area = areaWith('a\nbc\nd');

    showSpan(area, { start: 2, end: 4 }, { focus: false });

    expect(document.body.children).toHaveLength(1);
  });
});

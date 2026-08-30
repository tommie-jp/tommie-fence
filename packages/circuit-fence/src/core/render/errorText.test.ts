import { describe, expect, test } from 'vitest';
import { fenceError } from '../errors.ts';
import { snippetLines } from './errorText.ts';

describe('snippetLines', () => {
  test('says nothing when the line content was never attached', () => {
    expect(snippetLines(fenceError('部品が多すぎます', null))).toEqual([]);
  });

  test('shows the line on its own when the column is not known', () => {
    expect(snippetLines({ message: '読めません', line: 2, text: '  R1: resistr a1 a3' })).toEqual([
      '      R1: resistr a1 a3',
    ]);
  });

  test('underlines the spelling that could not be read', () => {
    expect(
      snippetLines({ message: '読めません', line: 2, text: '  R1: resistr a1 a3', column: 7, span: 7 }),
    ).toEqual(['      R1: resistr a1 a3', '          ^^^^^^^']);
  });

  test('counts a full-width character as the two columns a terminal gives it', () => {
    // 日本語の値と注釈は普通に入る。1 桁と数えるとキャレットが左へずれる。
    expect(snippetLines({ message: '読めません', line: 1, text: 'あ b', column: 3, span: 1 })).toEqual([
      '    あ b',
      '       ^',
    ]);
  });

  test('drops a column that points past the end of the line it was trimmed to', () => {
    expect(snippetLines({ message: '読めません', line: 1, text: 'abc', column: 9, span: 2 })).toEqual(['    abc']);
  });

  test('underlines at least one column, so a zero-length spelling still points somewhere', () => {
    expect(snippetLines({ message: '読めません', line: 1, text: 'abc', column: 2, span: 0 })).toEqual([
      '    abc',
      '     ^',
    ]);
  });
});

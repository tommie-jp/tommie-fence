import { describe, expect, test } from 'vitest';
import { isNoteRotation, noteRotationOf } from './notes.ts';
import { readTurnWords } from './parser/compact.ts';
import { glyphOf } from './edit/mapGlyphs.ts';

// 利用者の語で普通のオブジェクトを引くと、継承された名前まで当たる。
describe.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('継承された名前 %s', (word) => {
  test('is not a note rotation', () => {
    expect(isNoteRotation(word)).toBe(false);
    expect(noteRotationOf(word)).toBeNull();
  });

  test('is refused as a turn word with the usual message', () => {
    const result = readTurnWords(word, [word], 1);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('は読めません');
  });

  test('draws as a plain box with no mark', () => {
    expect(glyphOf(word)).toEqual({ name: 'box', mark: null });
  });
});

import { describe, expect, test } from 'vitest';
import { isNoteRotation, noteRotationOf } from './notes.ts';

// 利用者の語で普通のオブジェクトを引くと、継承された名前まで当たる。
describe.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('継承された名前 %s', (word) => {
  test('is not a note rotation', () => {
    expect(isNoteRotation(word)).toBe(false);
    expect(noteRotationOf(word)).toBeNull();
  });
});

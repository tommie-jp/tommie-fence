import { describe, expect, test } from 'vitest';
import { parseStyle } from './style.ts';

// 利用者の語で普通のオブジェクトを引くと、継承された名前 (constructor など) まで当たる。
describe('parseStyle — on / off の語', () => {
  test.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'rejects the inherited name %s as a flag',
    (word) => {
      const { errors } = parseStyle({ stamp: word }, 1);

      expect(errors.map((error) => error.message)).toEqual(['stamp は on か off で書きます']);
    },
  );

  test('still reads on and off, spelled as words in any case', () => {
    expect(parseStyle({ stamp: ' ON ' }, 1)).toMatchObject({ style: { stamp: true }, errors: [] });
    expect(parseStyle({ stamp: 'off' }, 1)).toMatchObject({ style: { stamp: false }, errors: [] });
  });
});

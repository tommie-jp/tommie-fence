import { describe, expect, test } from 'vitest';
import { handleAt, handleOf, isRepeatedName, nameOfHandle, partOfHandle } from './handles.ts';
import { parseFence } from '../parser/parseFence.ts';

const partsOf = (...rows: string[]) => {
  const { doc } = parseFence(`${rows.join('\n')}\n`);
  if (doc === null) throw new Error('YAML を読めませんでした');
  return doc.parts;
};

const RAILS = partsOf('parts:', '  VCC: vcc a1', '  R1: resistor a1 a3', '  VCC: vcc e1', '  VCC: vcc g1');

describe('handleAt', () => {
  test('leaves a name that stands alone as it is, so nothing else has to change', () => {
    expect(handleAt(RAILS, 1)).toBe('R1');
  });

  test('numbers the repeats from the second one, in the order they were written', () => {
    expect(handleAt(RAILS, 0)).toBe('VCC');
    expect(handleAt(RAILS, 2)).toBe('VCC#2');
    expect(handleAt(RAILS, 3)).toBe('VCC#3');
  });

  test('says nothing for an index that is not there', () => {
    expect(handleAt(RAILS, 9)).toBe('');
  });
});

describe('partOfHandle', () => {
  test('finds the one the number points at', () => {
    expect(partOfHandle(RAILS, 'VCC#3')).toBe(RAILS[3]);
    expect(partOfHandle(RAILS, 'R1')).toBe(RAILS[1]);
  });

  test('reads a handle with no number as the first of that name', () => {
    expect(partOfHandle(RAILS, 'VCC')).toBe(RAILS[0]);
  });

  test('finds nothing when the number points past the last one', () => {
    expect(partOfHandle(RAILS, 'VCC#4')).toBeNull();
  });

  test('refuses a number that is not a number, rather than falling back to the first', () => {
    // `VCC#a` を 1 つ目に読むと、綴りを間違えた人が違う部品を書き換えたことに
    // 気づけない。
    expect(partOfHandle(RAILS, 'VCC#a')).toBeNull();
    expect(partOfHandle(RAILS, 'VCC#2#3')).toBeNull();
  });
});

describe('nameOfHandle', () => {
  test('gives back the name that is drawn, for the words shown to a person', () => {
    expect(nameOfHandle('VCC#2')).toBe('VCC');
    expect(nameOfHandle('R1')).toBe('R1');
  });
});

describe('handleOf と isRepeatedName', () => {
  test('names a part from the list it came out of', () => {
    expect(handleOf(RAILS, RAILS[2] as (typeof RAILS)[number])).toBe('VCC#2');
  });

  test('knows which names are shared', () => {
    expect(isRepeatedName(RAILS, 'VCC')).toBe(true);
    expect(isRepeatedName(RAILS, 'R1')).toBe(false);
  });
});

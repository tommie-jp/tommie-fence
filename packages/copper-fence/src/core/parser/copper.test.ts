import { describe, expect, test } from 'vitest';
import { parseCopperLine } from './copper.ts';

const read = (text: string) => parseCopperLine('X1', text);
const reason = (text: string): string => {
  const result = read(text);
  return result.ok ? '' : result.error.message;
};

describe('line', () => {
  test('reads points, the width and the groove', () => {
    expect(read('line 0,10 40,10 3.06')).toEqual({
      ok: true, value: { kind: 'line', id: 'X1', points: [{ x: 0, y: 10 }, { x: 40, y: 10 }], width: 3.06, gap: null, line: null },
    });
    const bent = read('line 0,10 20,10 20,3 1.5 gap 0.3');
    expect(bent.ok && bent.value).toMatchObject({ points: [{ x: 0, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 3 }], width: 1.5, gap: 0.3 });
  });

  test('says what is missing', () => {
    expect(reason('line 0,10')).toMatch(/点を 2 つ以上と幅/);
    expect(reason('line 0,10 40,10')).toMatch(/幅 \(mm\) を書きます/);
    expect(reason('line 0,10 40,10 wide')).toMatch(/幅として読めません: wide/);
    expect(reason('line 0,10 40,10 3 gap')).toMatch(/gap のあとに溝の幅/);
    expect(reason('line 0,10 40,10 3 red')).toMatch(/読めない語です: red/);
  });

  test('refuses a point written twice and a point it cannot read', () => {
    expect(reason('line 0,10 0,10 40,10 3')).toMatch(/同じ点が続いています/);
    expect(reason('line 0,10 40.123,10 3')).toMatch(/小数は 2 桁まで/);
  });

  test('caps the number of points', () => {
    const points = Array.from({ length: 21 }, (_, index) => `${index},${index % 2 === 0 ? 0 : 1}`).join(' ');
    expect(reason(`line ${points} 1`)).toMatch(/20 個まで/);
  });
});

describe('pad / slot / via', () => {
  test('reads a pad with or without its size', () => {
    expect(read('pad 30,3 4x3')).toEqual({ ok: true, value: { kind: 'pad', id: 'X1', at: { x: 30, y: 3 }, width: 4, height: 3, line: null } });
    const plain = read('pad 30,3');
    expect(plain.ok && plain.value).toMatchObject({ width: 4, height: 4 });
  });

  test('wants the size of a slot', () => {
    expect(reason('slot 25,45')).toMatch(/切り欠きの大きさ/);
    const slot = read('slot 25,45 30x2');
    expect(slot.ok && slot.value).toMatchObject({ kind: 'slot', width: 30, height: 2 });
  });

  test('reads a via with the default or a written drill', () => {
    const plain = read('via 30,5');
    const drilled = read('via 30,5 1.2');
    expect(plain.ok && plain.value).toMatchObject({ kind: 'via', drill: 0.8 });
    expect(drilled.ok && drilled.value).toMatchObject({ drill: 1.2 });
    expect(reason('via 30,5 big')).toMatch(/穴の径/);
    expect(reason('via')).toMatch(/中心を x,y/);
  });

  test('refuses a size it cannot read and words left over', () => {
    expect(reason('pad 30,3 4by4')).toMatch(/大きさとして読めません/);
    expect(reason('pad 30,3 4x4 extra')).toMatch(/読めない語です/);
    expect(reason('pad here')).toMatch(/中心として読めません/);
  });
});

test('names the shapes it knows when the kind is unknown', () => {
  expect(reason('trace 0,0 1,1 1')).toMatch(/知らない形です: trace \(line \/ pad \/ via \/ slot\)/);
});

import { describe, expect, test } from 'vitest';
import { ATTACH_MAX_BYTES, checkAttachment, dataNamesIn, missingNote, sourceOf, withAttachment } from './data.ts';

describe('data: が指す名前', () => {
  test('フェンスの data: から名前だけを取る (凡例の名前は含めない)', () => {
    expect(dataNamesIn('title: x\ndata: 00-resonance.csv 計算\nx: 1\n')).toEqual(['00-resonance.csv']);
  });

  test('同じ名前は 1 度だけ、行の順に並べる', () => {
    expect(dataNamesIn('data: a.csv\ndata: b.s2p\ndata: a.csv\n')).toEqual(['a.csv', 'b.s2p']);
  });

  test('字下げした data: と、コメント行は拾わない', () => {
    expect(dataNamesIn('parts:\n  data: x.csv\n# data: y.csv\n')).toEqual([]);
  });

  test('読めない名前 (/ や .. を含む) は拾わない', () => {
    expect(dataNamesIn('data: ../x.csv\ndata: a/b.csv\ndata: ok.csv\n')).toEqual(['ok.csv']);
  });

  test('data: が無ければ空', () => {
    expect(dataNamesIn('title: x\n')).toEqual([]);
  });
});

describe('添付の受け付け', () => {
  test('csv・s1p・s2p・txt の名前は受ける', () => {
    for (const name of ['a.csv', 'B.S2P', 'x.s1p', '5-1 rc.txt']) {
      expect(checkAttachment(name, 10)).toBeNull();
    }
  });

  test('拡張子が違えば理由を言って断る', () => {
    expect(checkAttachment('a.md', 10)).toContain('.csv');
  });

  test('/ や \\ や .. を含む名前は断る', () => {
    expect(checkAttachment('../a.csv', 10)).toContain('名前');
    expect(checkAttachment('a/b.csv', 10)).toContain('名前');
    expect(checkAttachment('a\\b.csv', 10)).toContain('名前');
  });

  test('1 MB を超えたら断る', () => {
    expect(checkAttachment('a.csv', ATTACH_MAX_BYTES)).toBeNull();
    expect(checkAttachment('a.csv', ATTACH_MAX_BYTES + 1)).toContain('MB');
  });
});

describe('添付の持ち方', () => {
  test('足しても元の表は変えない', () => {
    const before: ReadonlyMap<string, string> = new Map([['a.csv', '1']]);
    const after = withAttachment(before, 'b.csv', '2');
    expect([...before.keys()]).toEqual(['a.csv']);
    expect([...after.keys()]).toEqual(['a.csv', 'b.csv']);
  });

  test('同じ名前は新しい中身で置き換える', () => {
    const after = withAttachment(new Map([['a.csv', '1']]), 'a.csv', '2');
    expect(after.get('a.csv')).toBe('2');
  });

  test('読み口は名前で引き、無ければ null', () => {
    const read = sourceOf(new Map([['a.csv', 'x,y']]));
    expect(read('a.csv')).toBe('x,y');
    expect(read('b.csv')).toBeNull();
  });

  test('継承した名前 (constructor) では引けない', () => {
    expect(sourceOf(new Map())('constructor')).toBeNull();
  });
});

describe('添えていないデータの案内', () => {
  test('data: の名前が添付に無ければ、名前を並べて釦を案内する', () => {
    const note = missingNote('data: a.csv\n', new Map());

    expect(note).toContain('a.csv');
    expect(note).toContain('データを添える');
  });

  test('添えてあれば null', () => {
    expect(missingNote('data: a.csv\n', new Map([['a.csv', 'x']]))).toBeNull();
  });

  test('data: が無ければ null', () => {
    expect(missingNote('title: x\n', new Map())).toBeNull();
  });
});

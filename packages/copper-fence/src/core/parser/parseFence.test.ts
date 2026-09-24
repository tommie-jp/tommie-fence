import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

const messages = (source: string): string[] => parseFence(source).errors.map((error) => error.message);

describe('parseFence', () => {
  test('reads every section of a fence', () => {
    const { doc, errors } = parseFence([
      'board:',
      '  size: 50x30mm',
      '  h: 0.8',
      '  er: 4.2',
      '  ground: both',
      '  cut: 0.3',
      'f: 2.4G',
      'title: 図1',
      'copper:',
      '  L1: line 0,10 50,10 1.5',
      'parts:',
      '  J1: sma left 10',
      'wires:',
      '  - 1,1 -- 2,2',
      'notes:',
      '  - mark 1,1',
      '  - text 2,2: 字',
      'style: dark',
    ].join('\n'));

    expect(errors).toEqual([]);
    expect(doc.board).toEqual({ width: 50, height: 30, h: 0.8, er: 4.2, ground: 'both', cut: 0.3 });
    expect(doc.f).toBe(2.4e9);
    expect(doc.title).toBe('図1');
    expect(doc.copper[0]).toMatchObject({ id: 'L1', line: 10 });
    expect(doc.parts[0]).toMatchObject({ id: 'J1', line: 12 });
    expect(doc.wires[0]).toMatchObject({ from: '1,1', line: 14 });
    expect(doc.notes.map((note) => note.kind)).toEqual(['mark', 'text']);
    expect(doc.style.theme).toBe('dark');
  });

  test('draws on the default board without stopping when board: is left out', () => {
    const { doc, errors } = parseFence('title: x');
    expect(doc.board.width).toBe(40);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ notice: true });
    expect(errors[0]?.message).toMatch(/既定の板 \(40x20mm・h 1.6・εr 4.4・back\)/);
  });

  test('keeps what it could read of the board', () => {
    const { doc } = parseFence('board:\n  h: 0.8\n  ground: front');
    expect(doc.board).toMatchObject({ width: 40, h: 0.8, ground: 'front' });
    expect(messages('board:\n  h: 0.8')).toEqual([expect.stringMatching(/size: が無いので/)]);
    expect(parseFence('board: 40x20\n').doc.board.width).toBe(40);
  });

  test('names what it cannot read on the board', () => {
    const said = messages('board:\n  size: 40x20\n  h: 16\n  er: x\n  ground: top\n  cut: 0\n  colour: red');
    expect(said).toEqual(expect.arrayContaining([
      expect.stringMatching(/40x20: 単位を付けます/),
      expect.stringMatching(/h は基材の厚さ/),
      expect.stringMatching(/er は比誘電率/),
      expect.stringMatching(/ground は back \/ front \/ both \/ none/),
      expect.stringMatching(/cut は溝の幅/),
      expect.stringMatching(/知らない board の項目です: colour/),
    ]));
    expect(messages('board:\n  size: [1]')).toEqual([expect.stringMatching(/大きさは/)]);
  });

  test('says the fence is empty, and what the outside must look like', () => {
    expect(messages('')).toEqual(['copper フェンスが空です (board: から書き始めます)']);
    expect(messages('- a\n- b')).toEqual([expect.stringMatching(/一番外側は/)]);
  });

  test('keeps going past a YAML error, and says it once per line', () => {
    const { doc, errors } = parseFence('board: 40x20mm\ncopper:\n  L1: line 0,10 40,10 3\n  L2: [unclosed\n');
    expect(doc.copper.map((spec) => spec.id)).toContain('L1');
    expect(errors.some((error) => error.message.startsWith('YAML の構文エラー'))).toBe(true);
  });

  test('refuses unknown and repeated keys', () => {
    expect(messages('board: 40x20mm\nbored: 1')).toEqual([expect.stringMatching(/知らないキーです: bored/)]);
    expect(messages('board: 40x20mm\ntitle: a\ntitle: b')).toEqual([expect.stringMatching(/title: が 2 つあります/)]);
  });

  test('keeps one list of names for islands and parts', () => {
    const said = messages([
      'board: 40x20mm',
      'copper:',
      '  P1: pad 5,5',
      '  10,5: pad 1,1',
      '  "a b": pad 2,2',
      'parts:',
      '  P1: sma left 10',
    ].join('\n'));
    expect(said).toEqual(expect.arrayContaining([
      expect.stringMatching(/名前が重なっています: P1/),
      '名前に使えません: 10 5 (英数字と _ - で 32 字まで)',
      '名前に使えません: a b (英数字と _ - で 32 字まで)',
    ]));
  });

  test('says what is wrong with each section, and keeps the rest', () => {
    const said = messages([
      'board: 40x20mm',
      'f: 2.4m',
      'title: [x]',
      'copper: nope',
      'parts:',
      '  J1: [1]',
      '  J2: sma nowhere 1',
      'wires: nope',
      'notes:',
      '  - 1',
      '  - circle 1,1',
      '  - text 1,1: x',
    ].join('\n'));
    expect(said).toEqual(expect.arrayContaining([
      expect.stringMatching(/f: は周波数/),
      expect.stringMatching(/title: には図の題/),
      expect.stringMatching(/copper: は `名前: 中身` の並び/),
      expect.stringMatching(/J1 の中身を 1 行で/),
      expect.stringMatching(/載せる辺を書きます/),
      expect.stringMatching(/wires: は/),
      expect.stringMatching(/知らない注釈です: 1|注釈は/),
      expect.stringMatching(/知らない注釈です: circle/),
    ]));
    expect(messages('board: 40x20mm\nnotes: 1')).toEqual([expect.stringMatching(/notes: は/)]);
    expect(messages('board: 40x20mm\nwires:\n  - [1]\n  - P1 - P2')).toHaveLength(2);
  });

  test('treats an empty title as no title', () => {
    expect(parseFence('board: 40x20mm\ntitle: ""').doc.title).toBeNull();
  });

  test('caps how many shapes, wires and notes it reads', () => {
    const many = (count: number, make: (index: number) => string): string =>
      Array.from({ length: count }, (_, index) => make(index)).join('\n');
    expect(messages(`board: 40x20mm\ncopper:\n${many(201, (i) => `  P${i}: pad 1,1`)}`))
      .toEqual([expect.stringMatching(/copper: が多すぎます/)]);
    expect(messages(`board: 40x20mm\nwires:\n${many(201, () => '  - 1,1 -- 2,2')}`))
      .toEqual([expect.stringMatching(/配線が多すぎます/)]);
    expect(messages(`board: 40x20mm\nnotes:\n${many(201, () => '  - mark 1,1')}`))
      .toEqual([expect.stringMatching(/注釈が多すぎます/)]);
  });
});

import { describe, expect, test } from 'vitest';
import { parseNoteLine } from './notes.ts';
import { NO_TURN } from '../parts/orient.ts';

describe('parseNoteLine', () => {
  test('reads a mark on one hole', () => {
    expect(parseNoteLine('mark b3', null)).toEqual({
      ok: true,
      value: { kind: 'mark', turn: NO_TURN, from: 'b3', to: null, color: null, text: null },
    });
  });

  test('takes a colour after the holes', () => {
    expect(parseNoteLine('mark b3 red', null).ok && parseNoteLine('mark b3 red', null)).toMatchObject({
      value: { color: 'red' },
    });
  });

  test('reads a box and an arrow, which take two holes', () => {
    expect(parseNoteLine('box b3 e7', null).ok && parseNoteLine('box b3 e7', null)).toMatchObject({
      value: { kind: 'box', turn: NO_TURN, from: 'b3', to: 'e7' },
    });
    expect(parseNoteLine('arrow b3 e7 blue', null).ok && parseNoteLine('arrow b3 e7 blue', null)).toMatchObject({
      value: { kind: 'arrow', to: 'e7', color: 'blue' },
    });
  });

  test('reads text, keeping the words as written', () => {
    const result = parseNoteLine('text b3', 'ここに 注意');

    expect(result.ok && result.value).toMatchObject({ kind: 'text', from: 'b3', text: 'ここに 注意' });
  });

  test('says a box needs two holes', () => {
    expect(parseNoteLine('box b3', null).ok).toBe(false);
  });

  test('says text needs something to say', () => {
    expect(parseNoteLine('text b3', null).ok).toBe(false);
    expect(parseNoteLine('text b3', '  ').ok).toBe(false);
  });

  test('names a kind it does not know', () => {
    const result = parseNoteLine('circle b3', null);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('circle');
  });

  test('refuses a colour it cannot draw', () => {
    expect(parseNoteLine('mark b3 chartreuse', null).ok).toBe(false);
  });

  test('refuses an extra word after a colour, rather than dropping it', () => {
    expect(parseNoteLine('mark b3 red green', null).ok).toBe(false);
  });

  test('says so when the line is empty', () => {
    expect(parseNoteLine('   ', null).ok).toBe(false);
  });
});

describe('source', () => {
  test('reads a bare source, which takes no hole at all', () => {
    expect(parseNoteLine('source', null)).toEqual({
      ok: true,
      value: { kind: 'source', turn: NO_TURN, from: null, to: null, color: null, text: null },
    });
  });

  test('takes a colour, since it has no words to confuse it with', () => {
    expect(parseNoteLine('source blue', null).ok && parseNoteLine('source blue', null)).toMatchObject({
      value: { kind: 'source', color: 'blue' },
    });
  });

  test('refuses a hole, so nobody writes one expecting it to move', () => {
    const result = parseNoteLine('source b3', null);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('b3');
  });

  test('refuses a colour it cannot draw', () => {
    expect(parseNoteLine('source chartreuse', null).ok).toBe(false);
  });
});

describe('parts', () => {
  test('reads a bare parts, which takes no hole at all', () => {
    expect(parseNoteLine('parts', null)).toEqual({
      ok: true,
      value: { kind: 'parts', turn: NO_TURN, from: null, to: null, color: null, text: null },
    });
  });

  test('takes a colour, the way the listing does', () => {
    expect(parseNoteLine('parts blue', null)).toMatchObject({
      ok: true,
      value: { kind: 'parts', color: 'blue' },
    });
  });

  test('says the table cannot be placed, rather than calling the address an unknown colour', () => {
    const result = parseNoteLine('parts b3', null);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('番地は書けません');
  });
});

describe('source の断り方 (レビューで出た穴)', () => {
  test('says it is a colour it does not know, not that a hole was written', () => {
    const result = parseNoteLine('source chartreuse', null);

    expect(!result.ok && result.error.message).toContain('知らない色');
  });

  test('says a hole cannot be written when one was', () => {
    const result = parseNoteLine('source b3', null);

    expect(!result.ok && result.error.message).toContain('番地は書けません');
  });

  test('quotes the spelling as it was written, so the caret lands on it', () => {
    const result = parseNoteLine('source B3', null);

    expect(!result.ok && result.error.message).toContain('B3');
  });
});

describe('text の向き', () => {
  // **番地のあとは全部言葉**なので、そこに向きの語を置くと「r90 で始まる注釈」と
  // 区別が付かない。姿の区切りと同じ `/` に載せる (実機で頼まれて足した)。
  test('reads a turn written on the kind', () => {
    expect(parseNoteLine('text c3 r90', 'ここ').ok && parseNoteLine('text c3 r90', 'ここ')).toMatchObject({
      value: { kind: 'text', turn: { rotate: 90, mirror: false }, text: 'ここ' },
    });
  });

  test('reads a mirror, and both together', () => {
    expect(parseNoteLine('text c3 mirror', 'ここ').ok && parseNoteLine('text c3 mirror', 'ここ')).toMatchObject({
      value: { turn: { rotate: 0, mirror: true } },
    });
    expect(parseNoteLine('text c3 r180 mirror', 'ここ').ok && parseNoteLine('text c3 r180 mirror', 'ここ')).toMatchObject({
      value: { turn: { rotate: 180, mirror: true } },
    });
  });

  test('keeps the words after the hole as the words', () => {
    // `r90` で始まる注釈も、種類に向きを書かなければそのまま言葉になる。
    expect(parseNoteLine('text c3', 'r90 のこと').ok && parseNoteLine('text c3', 'r90 のこと')).toMatchObject({
      value: { turn: NO_TURN, text: 'r90 のこと' },
    });
  });

  test('names the words it knows when the turn cannot be read', () => {
    const result = parseNoteLine('text c3 r45', 'ここ');

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('r90');
  });

  test('refuses a turn on a note that has no direction', () => {
    // 向きを書けるのは text だけ。ほかの印は色しか書けないので、
    // 「知らない色です」と言って書ける色を並べる (直す場所が分かる)。
    const result = parseNoteLine('mark c3 r90', null);

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('知らない色です');
  });
});

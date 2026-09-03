import { describe, expect, test } from 'vitest';
import { parseNoteLine } from './notes.ts';
import { NO_TURN } from '../parts/orient.ts';

describe('parseNoteLine', () => {
  test('reads a mark on one hole', () => {
    expect(parseNoteLine('mark b3')).toEqual({
      ok: true,
      value: { kind: 'mark', turn: NO_TURN, from: 'b3', to: null, color: null, text: null },
    });
  });

  test('takes a colour after the holes', () => {
    expect(parseNoteLine('mark b3 red').ok && parseNoteLine('mark b3 red')).toMatchObject({
      value: { color: 'red' },
    });
  });

  test('reads a box and an arrow, which take two holes', () => {
    expect(parseNoteLine('box b3 e7').ok && parseNoteLine('box b3 e7')).toMatchObject({
      value: { kind: 'box', turn: NO_TURN, from: 'b3', to: 'e7' },
    });
    expect(parseNoteLine('arrow b3 e7 blue').ok && parseNoteLine('arrow b3 e7 blue')).toMatchObject({
      value: { kind: 'arrow', to: 'e7', color: 'blue' },
    });
  });

  test('reads text, keeping the words as written', () => {
    const result = parseNoteLine('text b3 ここに 注意');

    expect(result.ok && result.value).toMatchObject({ kind: 'text', from: 'b3', text: 'ここに 注意' });
  });

  test('says a box needs two holes', () => {
    expect(parseNoteLine('box b3').ok).toBe(false);
  });

  test('says text needs something to say', () => {
    expect(parseNoteLine('text b3').ok).toBe(false);
  });

  test('names a kind it does not know', () => {
    const result = parseNoteLine('circle b3');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('circle');
  });

  test('refuses a colour it cannot draw', () => {
    expect(parseNoteLine('mark b3 chartreuse').ok).toBe(false);
  });

  test('refuses an extra word after a colour, rather than dropping it', () => {
    expect(parseNoteLine('mark b3 red green').ok).toBe(false);
  });

  test('says so when the line is empty', () => {
    expect(parseNoteLine('   ').ok).toBe(false);
  });
});

describe('source', () => {
  test('reads a bare source, which takes no hole at all', () => {
    expect(parseNoteLine('source')).toEqual({
      ok: true,
      value: { kind: 'source', turn: NO_TURN, from: null, to: null, color: null, text: null },
    });
  });

  test('takes a colour, since it has no words to confuse it with', () => {
    expect(parseNoteLine('source blue').ok && parseNoteLine('source blue')).toMatchObject({
      value: { kind: 'source', color: 'blue' },
    });
  });

  test('refuses a hole, so nobody writes one expecting it to move', () => {
    const result = parseNoteLine('source b3');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('b3');
  });

  test('refuses a colour it cannot draw', () => {
    expect(parseNoteLine('source chartreuse').ok).toBe(false);
  });
});

describe('parts', () => {
  test('reads a bare parts, which takes no hole at all', () => {
    expect(parseNoteLine('parts')).toEqual({
      ok: true,
      value: { kind: 'parts', turn: NO_TURN, from: null, to: null, color: null, text: null },
    });
  });

  test('takes a colour, the way the listing does', () => {
    expect(parseNoteLine('parts blue')).toMatchObject({
      ok: true,
      value: { kind: 'parts', color: 'blue' },
    });
  });

  test('says the table cannot be placed, rather than calling the address an unknown colour', () => {
    const result = parseNoteLine('parts b3');

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toContain('番地は書けません');
  });
});

describe('source の断り方 (レビューで出た穴)', () => {
  test('says it is a colour it does not know, not that a hole was written', () => {
    const result = parseNoteLine('source chartreuse');

    expect(!result.ok && result.error.message).toContain('知らない色');
  });

  test('says a hole cannot be written when one was', () => {
    const result = parseNoteLine('source b3');

    expect(!result.ok && result.error.message).toContain('番地は書けません');
  });

  test('quotes the spelling as it was written, so the caret lands on it', () => {
    const result = parseNoteLine('source B3');

    expect(!result.ok && result.error.message).toContain('B3');
  });
});

describe('text の向き', () => {
  // **番地のあとは全部言葉**なので、そこに向きの語を置くと「r90 で始まる注釈」と
  // 区別が付かない。姿の区切りと同じ `/` に載せる (実機で頼まれて足した)。
  test('reads a turn written on the kind', () => {
    expect(parseNoteLine('text/r90 c3 ここ').ok && parseNoteLine('text/r90 c3 ここ')).toMatchObject({
      value: { kind: 'text', turn: { rotate: 90, mirror: false }, text: 'ここ' },
    });
  });

  test('reads a mirror, and both together', () => {
    expect(parseNoteLine('text/mirror c3 ここ').ok && parseNoteLine('text/mirror c3 ここ')).toMatchObject({
      value: { turn: { rotate: 0, mirror: true } },
    });
    expect(parseNoteLine('text/r180/mirror c3 ここ').ok && parseNoteLine('text/r180/mirror c3 ここ')).toMatchObject({
      value: { turn: { rotate: 180, mirror: true } },
    });
  });

  test('keeps the words after the hole as the words', () => {
    // `r90` で始まる注釈も、種類に向きを書かなければそのまま言葉になる。
    expect(parseNoteLine('text c3 r90 のこと').ok && parseNoteLine('text c3 r90 のこと')).toMatchObject({
      value: { turn: NO_TURN, text: 'r90 のこと' },
    });
  });

  test('names the words it knows when the turn cannot be read', () => {
    const result = parseNoteLine('text/r45 c3 ここ');

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('r90');
  });

  test('refuses a turn on a note that has no direction', () => {
    const result = parseNoteLine('mark/r90 c3');

    expect(result.ok).toBe(false);
    expect(result.ok || result.error.message).toContain('text だけ');
  });
});

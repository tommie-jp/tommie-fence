import { describe, expect, test } from 'vitest';
import { createBoard, holeStrip, isOnBoard, offBoardReason, resolveBoard } from './board.ts';
import { parseAddress } from './address.ts';

const at = (text: string) => parseAddress(text)!;

describe('createBoard', () => {
  test('keeps the size it was given', () => {
    expect(createBoard({ cols: 28, rows: 18 })).toEqual({ cols: 28, rows: 18, slots: false, color: null, land: null, slotColor: null });
  });
});

describe('offBoardReason', () => {
  const board = createBoard({ cols: 28, rows: 18 });

  test('says nothing about an address on the board', () => {
    expect(offBoardReason(board, at('a1'))).toBeNull();
    expect(offBoardReason(board, at('r28'))).toBeNull();
  });

  test('lets an address just outside the board through, so the edge copper can be wired', () => {
    // 縁の銅箔は穴の格子のちょうど 1 つ外。指せないとそこへ配線を引けない。
    for (const written of ['a0', 'a-1', '01', '-a1', 'a29', 's1']) {
      expect(offBoardReason(board, at(written))).toBeNull();
    }
  });

  test('says which way it ran off, because the fix is different', () => {
    expect(offBoardReason(board, at('a33'))).toContain('28 列');
    expect(offBoardReason(board, at('w1'))).toContain('18 行');
  });

  test('names the address it is talking about', () => {
    expect(offBoardReason(board, at('a33'))).toContain('a33');
  });

  test('isOnBoard is about the holes, not about what can be written', () => {
    expect(isOnBoard(board, at('r28'))).toBe(true);
    expect(isOnBoard(board, at('s29'))).toBe(false);
    // 板の外は書けるが、穴の上ではない。
    expect(isOnBoard(board, at('a0'))).toBe(false);
  });
});

describe('holeStrip', () => {
  test('gives every hole an identity of its own', () => {
    // **ここがブレッドボードとの分かれ目。** あちらは同じ列の 5 穴が内部で
    // つながっているので列がストリップになるが、ユニバーサル基板は全穴が独立で、
    // 導通は配線でしか生まれない。
    expect(holeStrip(at('b3'))).toBe('hole:2,3');
    expect(holeStrip(at('b3'))).not.toBe(holeStrip(at('c3')));
    expect(holeStrip(at('b3'))).not.toBe(holeStrip(at('b4')));
  });
});

describe('resolveBoard', () => {
  test('reads 列x行, the order the board is sold in', () => {
    // 秋月 C タイプは 72×47mm、つまり長辺 × 短辺。板の呼び方と同じ順にする。
    const found = resolveBoard('28x18');

    expect(found.ok && found.board).toEqual({ cols: 28, rows: 18, slots: false, color: null, land: null, slotColor: null });
  });

  test('takes the multiplication sign the reports themselves print', () => {
    // 報告も docs の表も `25×15` と書く。読めないと、写して貼った人が転ぶ。
    const found = resolveBoard('25×15');

    expect(found.ok && found.board).toEqual({ cols: 25, rows: 15, slots: false, color: null, land: null, slotColor: null });
  });

  test('takes a capital X and spaces around it', () => {
    const found = resolveBoard('28 X 18');

    expect(found.ok && found.board).toEqual({ cols: 28, rows: 18, slots: false, color: null, land: null, slotColor: null });
  });

  test('refuses a size that is not two numbers', () => {
    for (const text of ['28', '28x', 'x18', '28x18x2', 'axb', '', '0x18', '28x0', '-1x18']) {
      expect(resolveBoard(text).ok).toBe(false);
    }
  });

  test('reads a hole count as a hole count', () => {
    const found = resolveBoard('25x15');

    expect(found.ok && found.board).toEqual({ cols: 25, rows: 15, slots: false, color: null, land: null, slotColor: null });
    expect(found.ok && found.named).toBeNull();
    expect(found.ok && found.notice).toBeNull();
  });

  test('reads a name from the catalogue', () => {
    const found = resolveBoard('akizuki-c');

    expect(found.ok && found.board).toEqual({ cols: 25, rows: 15, slots: false, color: null, land: null, slotColor: null });
    expect(found.ok && found.named?.key).toBe('akizuki-c');
  });

  test('reads a size with a unit as the board sold at that size', () => {
    expect(resolveBoard('72x47mm')).toEqual(resolveBoard('akizuki-c'));
  });

  test('warns when a bare number is the size of a board it knows', () => {
    // `board: 72x47` は 72 列 × 47 行 (3,384 穴) として通ってしまう。
    // ミリのつもりで書いた人に、**黙って別物の図が出る**。
    const found = resolveBoard('72x47');

    expect(found.ok && found.board).toEqual({ cols: 72, rows: 47, slots: false, color: null, land: null, slotColor: null });
    expect(found.ok && found.notice).toContain('穴数として読みました');
    expect(found.ok && found.notice).toContain('akizuki-c');
  });

  test('says nothing extra about a hole count that is not a board size', () => {
    const found = resolveBoard('25x15');

    expect(found.ok && found.notice).toBeNull();
  });

  test('says the limit was hit, not that the spelling was unreadable', () => {
    // 直す手が違う。`offBoardReason` が行と列を言い分けるのと同じ理由。
    const found = resolveBoard('1000x1000');

    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).toContain('120');
    expect(!found.ok && found.reason).not.toContain('読めません');
  });

  test('offers the board a rounded size was probably meant for', () => {
    // 7×5cm は汎用基板の呼び名で、秋月 C (72×47mm) とは別の板。
    // **当てはめずに教える** — 丸めて当てると違う板の穴数で図が出る。
    const found = resolveBoard('7x5cm');

    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).toContain('akizuki-c');
    expect(!found.ok && found.reason).toContain('72×47mm');
  });

  test('offers no near board when nothing is near, and still says how to write one', () => {
    const found = resolveBoard('300x200mm');

    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).not.toContain('近いのは');
    expect(!found.ok && found.reason).toContain('列x行');
  });

  test('lists what it has when the name is not one of them', () => {
    const found = resolveBoard('elegoo-5x7');

    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).toContain('akizuki-c');
  });

  test('falls back to how to write a size when nothing can be made of it', () => {
    const found = resolveBoard('...');

    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).toContain('列x行');
  });
});

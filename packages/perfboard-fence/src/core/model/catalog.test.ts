import { describe, expect, test } from 'vitest';
import { boardNames, catalogBoards, lookupBoard, nearestBoard, parseMillimetres } from './catalog.ts';

describe('parseMillimetres', () => {
  test('reads a size written with a unit', () => {
    expect(parseMillimetres('72x47mm')).toEqual([72, 47]);
  });

  test('reads centimetres as ten millimetres', () => {
    // 板は cm でも mm でも呼ばれる。呼び名が違うだけで同じ板。
    expect(parseMillimetres('7.2x4.7cm')).toEqual([72, 47]);
  });

  test('takes a fraction of a millimetre (the shop writes 47.5)', () => {
    expect(parseMillimetres('72x47.5mm')).toEqual([72, 47.5]);
  });

  test('refuses a size with no unit, because that is the hole count', () => {
    // **単位が無ければ穴数**。ここで実寸として読むと、25x15 の板が
    // 25mm × 15mm になる。
    expect(parseMillimetres('25x15')).toBeNull();
  });

  test('refuses what is not two numbers and a unit', () => {
    for (const text of ['mm', '72mm', '72x47km', '72x47x2mm', 'axbmm', '', '0x47mm', '72x0mm']) {
      expect(parseMillimetres(text)).toBeNull();
    }
  });
});

describe('lookupBoard', () => {
  test('finds a board by its name', () => {
    expect(lookupBoard('akizuki-c')?.cols).toBe(25);
    expect(lookupBoard('akizuki-c')?.rows).toBe(15);
  });

  test('takes the short name the shop uses', () => {
    expect(lookupBoard('c')).toBe(lookupBoard('akizuki-c'));
  });

  test('does not care about case or surrounding space', () => {
    expect(lookupBoard('  AKIZUKI-C ')).toBe(lookupBoard('akizuki-c'));
  });

  test('does not care about the case of the unit either', () => {
    // 名前も短い名前も大小を問わないので、単位だけ問うと**そこだけ落ちる**。
    expect(lookupBoard('72X47MM')).toBe(lookupBoard('akizuki-c'));
  });

  test('reads the spellings that name the board it counted', () => {
    for (const spelling of ['72x47mm', '7.2x4.7cm']) {
      expect(lookupBoard(spelling)).toBe(lookupBoard('akizuki-c'));
    }
  });

  test('does not take a near spelling for the board it counted', () => {
    // 「C タイプ」でも 72×47.5mm は**別の板**で、外形図の格子は 27 × 17。
    // 同じ呼び名に寄せると、違う穴数の図が黙って出る。
    expect(lookupBoard('72x47.5mm')).toBeNull();
    expect(lookupBoard('72x48mm')).toBeNull();
  });

  test('does not know a size it has never counted', () => {
    // 7×5cm (70×50mm) は汎用基板の呼び名で、秋月 C (72×47mm) とは別の板。
    // 丸めて当てると**違う板の穴数で図が出る**。
    expect(lookupBoard('7x5cm')).toBeNull();
  });

  test('does not answer with something off Object.prototype', () => {
    expect(lookupBoard('constructor')).toBeNull();
    expect(lookupBoard('toString')).toBeNull();
  });

  test('every board it knows has a plausible grid for its size', () => {
    // 穴は 2.54mm 間隔なので、穴の広がりは板より小さく、縁は板の端まで届かない。
    // 上限は 10mm — A タイプの外形図で左右の余白が 8.9mm あり、6mm では狭すぎた。
    for (const board of catalogBoards()) {
      const [mmWide, mmTall] = board.mm[0]!;
      const marginX = (mmWide - (board.cols - 1) * 2.54) / 2;
      const marginY = (mmTall - (board.rows - 1) * 2.54) / 2;
      expect(marginX).toBeGreaterThan(0);
      expect(marginY).toBeGreaterThan(0);
      expect(marginX).toBeLessThan(10);
      expect(marginY).toBeLessThan(10);
    }
  });
});

describe('boardNames', () => {
  test('lists the full names, not the short ones', () => {
    expect(boardNames()).toContain('akizuki-c');
    expect(boardNames()).not.toContain('c');
  });
});

describe('nearestBoard', () => {
  test('offers the board a rounded size was probably meant for', () => {
    // 7x5cm と書いた人が探しているのは、たぶん 72×47mm の C タイプ。
    expect(nearestBoard([70, 50])).toBe(lookupBoard('akizuki-c'));
  });

  test('offers nothing when nothing is close', () => {
    expect(nearestBoard([500, 400])).toBeNull();
  });

  test('offers nothing for a size turned on its side', () => {
    // 5x7cm (50×70mm) は縦長の板。**書かれたとおりに読む**ので、
    // 横長の C タイプを勝手に寝かせて当てはめない。
    expect(nearestBoard([50, 70])).toBeNull();
  });
});

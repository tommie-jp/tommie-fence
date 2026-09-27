import { describe, expect, test } from 'vitest';
import { parseFence } from './parseFence.ts';

/**
 * **長さはすべて `mm` を付ける** (直下の CLAUDE.md の文法の方針 1)。以前は線路の幅・溝・
 * 穴径は単位を受けず、パッドは `mm` を付けても付けなくてもよく、`size:` だけ mm 必須、
 * `h:` `cut:` は単位の概念が無く、`f:` は素の数を Hz で読んでいた。
 * 点 (`x,y`) と SMA の辺に沿った位置は番地なので素の数のまま。`er:` は無次元。
 */
const messages = (source: string): string =>
  parseFence(source).errors.map((error) => error.message).join('\n');

describe('copper の単位', () => {
  test('reads every length with mm, and keeps points, the SMA position and er bare', () => {
    const { doc, errors } = parseFence([
      'board:',
      '  size: 50x30mm',
      '  h: 0.8mm',
      '  er: 4.2',
      '  cut: 0.3mm',
      'f: 2.4GHz',
      'copper:',
      '  L1: line 0,10 50,10 1.5mm gap 0.3mm',
      '  P1: pad 30,3 4x4mm',
      '  V1: via 30,5 0.8mm',
      '  X1: slot 20,16 20x1mm',
      'parts:',
      '  J1: sma left 10',
      '  U1: box 20,20 5x5mm 6',
    ].join('\n'));

    expect(errors).toEqual([]);
    expect(doc.board).toMatchObject({ h: 0.8, er: 4.2, cut: 0.3 });
    expect(doc.f).toBe(2.4e9);
    expect(doc.copper[0]).toMatchObject({ width: 1.5, gap: 0.3 });
    expect(doc.copper[1]).toMatchObject({ width: 4, height: 4 });
    expect(doc.copper[2]).toMatchObject({ drill: 0.8 });
  });

  test('refuses a bare length, and says how to write it', () => {
    expect(messages('copper:\n  L1: line 0,10 40,10 3')).toContain('3mm');
    expect(messages('copper:\n  L1: line 0,10 40,10 3mm gap 0.3')).toContain('0.3mm');
    expect(messages('copper:\n  P1: pad 30,3 4x4')).toContain('4x4mm');
    expect(messages('copper:\n  V1: via 30,5 0.8')).toContain('0.8mm');
    expect(messages('copper:\n  X1: slot 20,16 20x1')).toContain('20x1mm');
    expect(messages('parts:\n  U1: box 20,10 5x5 6')).toContain('5x5mm');
  });

  test('refuses a bare thickness and cut on the board', () => {
    expect(messages('board:\n  size: 40x20mm\n  h: 1.6')).toContain('1.6mm');
    expect(messages('board:\n  size: 40x20mm\n  cut: 0.3')).toContain('0.3mm');
  });

  test('refuses a bare frequency', () => {
    expect(messages('f: 2400000000')).toContain('接頭辞');
    expect(messages('board: 40x20mm\nf: 2.4G')).toBe('');
  });
});

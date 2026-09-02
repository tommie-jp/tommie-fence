import { describe, expect, test } from 'vitest';
import { crossingPoints } from './crossings.ts';

const at = (x: number, y: number) => ({ x, y });
const line = (x1: number, y1: number, x2: number, y2: number) =>
  ({ from: at(x1, y1), to: at(x2, y2) });

describe('crossingPoints', () => {
  test('finds where two wires meet away from their ends', () => {
    // 縦と横が真ん中で出会う。**接点ではない** — この板は穴どうしがつながらない。
    const found = crossingPoints([line(0, 10, 20, 10), line(10, 0, 10, 20)]);

    expect(found[0]).toEqual([]);
    expect(found[1]).toEqual([at(10, 10)]);
  });

  test('leaves wires that only meet at a hole alone', () => {
    // 同じ穴に集まる線は本当につながっている。跨ぐと嘘になる。
    expect(crossingPoints([line(0, 0, 10, 0), line(10, 0, 10, 10)])[1]).toEqual([]);
  });

  test('leaves wires that never meet alone', () => {
    expect(crossingPoints([line(0, 0, 10, 0), line(0, 10, 10, 10)])[1]).toEqual([]);
  });

  test('leaves a wire whose end sits on another wire alone', () => {
    // ここは交差ではなく書き方の問題 (T 字)。跨いでも読めるようにはならない。
    expect(crossingPoints([line(0, 10, 20, 10), line(10, 10, 10, 20)])[1]).toEqual([]);
  });

  test('gives the later wire every crossing it makes', () => {
    const found = crossingPoints([
      line(0, 10, 20, 10), line(0, 20, 20, 20), line(10, 0, 10, 30),
    ]);

    expect(found[2]).toEqual([at(10, 10), at(10, 20)]);
  });
});

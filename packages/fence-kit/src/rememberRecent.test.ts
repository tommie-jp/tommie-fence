import { describe, expect, test } from 'vitest';
import { rememberRecent } from './rememberRecent.ts';

describe('rememberRecent', () => {
  test('同じ入力なら数え直さず、同じ答えを返す', () => {
    // Arrange
    let calls = 0;
    const parse = rememberRecent((source: string) => {
      calls += 1;
      return { source };
    });

    // Act
    const first = parse('a');
    const again = parse('a');

    // Assert
    expect(calls).toBe(1);
    expect(again).toBe(first);
  });

  test('入力が違えば数え直す', () => {
    // Arrange
    let calls = 0;
    const parse = rememberRecent((source: string) => {
      calls += 1;
      return { source };
    });

    // Act
    parse('a');
    parse('b');

    // Assert
    expect(calls).toBe(2);
  });

  test('元の本文と当てたあとを交互に読んでも、元のほうは当たり続ける', () => {
    // Arrange — 試し当ての形。`source` は変わらず、`after` は動かすたびに変わる。
    let calls = 0;
    const parse = rememberRecent((source: string) => {
      calls += 1;
      return { source };
    });

    // Act
    parse('source');
    for (let step = 0; step < 5; step += 1) {
      parse(`after ${step}`);
      parse('source');
    }

    // Assert — 数え直したのは `after` の 5 回と、最初の 1 回だけ。
    expect(calls).toBe(6);
  });

  test('覚える数を超えたら、いちばん古いものから落とす', () => {
    // Arrange
    let calls = 0;
    const parse = rememberRecent((source: string) => {
      calls += 1;
      return { source };
    }, 2);

    // Act
    parse('a');
    parse('b');
    parse('c');
    parse('a');

    // Assert — a は 2 度数えた (b と c に押し出された)。
    expect(calls).toBe(4);
  });

  test('答えが undefined でも覚える', () => {
    // Arrange
    let calls = 0;
    const look = rememberRecent((_key: string) => {
      calls += 1;
      return undefined;
    });

    // Act
    look('a');
    look('a');

    // Assert
    expect(calls).toBe(1);
  });
});

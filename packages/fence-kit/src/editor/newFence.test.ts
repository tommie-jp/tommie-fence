import { describe, expect, test } from 'vitest';
import { fenceToAppend } from './newFence.ts';

/** 足したあとの全文と、開き記号の行の中身。 */
const made = (text: string, language: string) => {
  const { added, line } = fenceToAppend(text, language);
  const after = `${text}${added}`;
  return { after, line, at: after.split('\n')[line - 1] };
};

describe('fenceToAppend', () => {
  test('文書の終わりに、空のフェンスを足す', () => {
    const { after, line } = made('# メモ\n\n本文。\n', 'perfboard');

    expect(after).toBe('# メモ\n\n本文。\n\n```perfboard\n```\n');
    expect(line).toBe(5);
  });

  test('末尾に改行が無くても、間を 1 行空ける', () => {
    expect(made('# メモ', 'circuit').after).toBe('# メモ\n\n```circuit\n```\n');
  });

  test('すでに空行で終わっていれば、空行を足さない', () => {
    expect(made('# メモ\n\n', 'circuit').after).toBe('# メモ\n\n```circuit\n```\n');
  });

  test('空の文書なら、頭から書く', () => {
    const { after, line } = made('', 'breadboard');

    expect(after).toBe('```breadboard\n```\n');
    expect(line).toBe(1);
  });

  // **書いてある字は 1 字も消さない。** 空行だけの文書でも、その空行は残す。
  test('空行だけの文書でも、書いてある行は残す', () => {
    expect(made('\n\n\n', 'circuit').after).toBe('\n\n\n```circuit\n```\n');
  });

  // 行がずれると、殻が別の行に結び付く。
  test.each(['', '# メモ', '# メモ\n', '# メモ\n\n', 'a\nb\nc\n', '\n\n\n'])(
    '%j に足しても、返す行は開き記号のある行そのもの',
    (text) => {
      expect(made(text, 'circuit').at).toBe('```circuit');
    },
  );
});

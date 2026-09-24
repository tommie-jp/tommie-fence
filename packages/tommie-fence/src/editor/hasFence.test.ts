import { describe, expect, test } from 'vitest';
import { firstFenceBodyLine, hasFence } from './hasFence.ts';

/**
 * 題の右の釦を出すかどうか。**描かれるフェンスがあるときだけ** —
 * 切り出しは fence-kit の `extractFences` と同じ規則 (2 つ目の規則を持たない)。
 */
const LANGUAGES = ['circuit', 'bread', 'perf'];
/** 書かれうる綴り。長い綴りは別名として読み続ける (52 の docs/08)。 */
const SPELLINGS = ['circuit', 'bread', 'breadboard', 'perf', 'perfboard'];
const doc = (...lines: readonly string[]): string => `${lines.join('\n')}\n`;

describe('hasFence', () => {
  test.each(SPELLINGS)('finds a %s fence', (language) => {
    expect(hasFence(doc('# 見出し', '', `\`\`\`${language}`, 'parts:', '```'), LANGUAGES)).toBe(true);
  });

  test('ignores fences of other languages', () => {
    expect(hasFence(doc('```yaml', 'parts:', '```', '```ts', 'const a = 1;', '```'), LANGUAGES)).toBe(false);
  });

  test('ignores a markdown file without fences', () => {
    expect(hasFence(doc('# ただの文書', '', 'circuit という字は出てくる。'), LANGUAGES)).toBe(false);
  });

  test('matches the language as a whole word', () => {
    expect(hasFence(doc('```circuitry', 'x', '```'), LANGUAGES)).toBe(false);
  });

  test('accepts tildes, an indent of up to 3 and words after the language', () => {
    expect(hasFence(doc('~~~circuit', 'parts:', '~~~'), LANGUAGES)).toBe(true);
    expect(hasFence(doc('   ```breadboard', 'board: half', '   ```'), LANGUAGES)).toBe(true);
    expect(hasFence(doc('```perfboard title=x', 'board: 16x8', '```'), LANGUAGES)).toBe(true);
  });

  test('reads CRLF documents', () => {
    expect(hasFence('```circuit\r\nparts:\r\n```\r\n', LANGUAGES)).toBe(true);
  });

  test('counts a fence that is still being written (not closed yet)', () => {
    // 書き始めた瞬間に釦が出る。閉じ記号を打つまで待たせない。
    expect(hasFence(doc('```circuit', 'parts:'), LANGUAGES)).toBe(true);
  });

  test('does not count a fence written inside another code block', () => {
    // プレビューでも図にならない (コードとして出る) ので、掴む物が無い。
    expect(hasFence(doc('````markdown', '```circuit', 'parts:', '```', '````'), LANGUAGES)).toBe(false);
  });
});

describe('firstFenceBodyLine', () => {
  test('points at the first body line of the topmost fence, whatever its language', () => {
    // Arrange — perfboard が上、circuit が下。
    const markdown = doc('# 見出し', '', '```perfboard', 'board: 16x8', '```', '', '```circuit', 'parts:', '```');

    // Act / Assert — perfboard の開き記号は 3 行目、本文は 4 行目。
    expect(firstFenceBodyLine(markdown, LANGUAGES)).toBe(4);
  });

  test('is null when there is no fence to open', () => {
    expect(firstFenceBodyLine(doc('# ただの文書'), LANGUAGES)).toBeNull();
  });
});

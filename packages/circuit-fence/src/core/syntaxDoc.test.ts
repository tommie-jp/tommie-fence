import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { NOTE_BOX_SOLID, NOTE_KINDS } from './notes.ts';

/**
 * 文法リファレンス (docs/01-syntax.md) の注釈の一覧が、実装から遅れていないか。
 *
 * 早見表 (02-cheatsheet.md) には cheatsheet.test.ts の見張りがあるが、
 * こちらには無かった。`line` を足したとき**節だけが増えて一覧の表が
 * 取り残され**、「書けるのは 5 種類」と書いたまま 6 種類になっていた。
 * 種類は増える側なので、増やした人が表を直し忘れたことに気づける形にしておく。
 *
 * 見るのは**名前と数だけ**。書きぶりまで縛ると、文章を直すたびに
 * テストを直すことになる (早見表の見張りと同じ考え)。
 */
const SYNTAX = readFileSync(fileURLToPath(new URL('../../docs/01-syntax.md', import.meta.url)), 'utf8');

/** 注釈の節だけを切り出す。ほかの節に出てくる同じ語を数に入れないため。 */
const NOTES_SECTION = /\n## 注釈 \(`notes:`\)\n([\s\S]*?)\n## /.exec(SYNTAX)?.[1] ?? '';

/**
 * 節の頭にある一覧の表。**種類を数えるのはここだけ**にする — 節の見出し
 * (`### 直線 — …`) で見ると、表に載せ忘れても見張りが通ってしまう。
 */
const SUMMARY_TABLE = /\n(\|[\s\S]*?)\n\n/.exec(NOTES_SECTION)?.[1] ?? '';

describe('docs/01-syntax.md の注釈', () => {
  test('注釈の節がある', () => {
    expect(NOTES_SECTION).not.toBe('');
  });

  test('書ける種類が全部一覧の表に載っている', () => {
    expect(NOTE_KINDS.filter((kind) => !SUMMARY_TABLE.includes(`- ${kind} `))).toEqual([]);
  });

  test('「書けるのは N 種類」の数が種類の数と合っている', () => {
    expect(NOTES_SECTION).toContain(`書けるのは ${NOTE_KINDS.length} 種類`);
  });

  test('枠を実線で引く語が載っている', () => {
    expect(NOTES_SECTION).toContain(`\`${NOTE_BOX_SOLID}\``);
  });
});

import { describe, expect, test } from 'vitest';
import { applyChanges, docOver, replaceLines } from './doc.ts';

/** 散文とフェンスが混ざった、普通の Markdown。 */
const DOC = [
  '# 例',                       // 0
  '',                           // 1
  '```breadboard',              // 2
  'title: 図01',                // 3
  'parts:',                     // 4
  '  R1: resistor a9 b9',       // 5
  '```',                        // 6
  '',                           // 7
].join('\n');

/**
 * **文書は全文** (52 の docs/43)。かつては「フェンス 1 本を記号で挟んだ
 * 偽の文書」を組んでいたが、頁が Markdown を丸ごと持つようになったので、
 * そのまま行に割って渡す。
 */
describe('docOver', () => {
  test('書き換えたあとの全文を見せる (覚え込まない)', () => {
    // Arrange
    let now = DOC;
    const document = docOver(() => now);

    // Act
    now = DOC.replace('図01', '図02');

    // Assert
    expect(document.getText()).toContain('図02');
    expect(document.lineAt(3).text).toBe('title: 図02');
  });

  test('行は文書の行そのもの (散文もフェンスの記号も数える)', () => {
    const document = docOver(() => DOC);

    expect(document.lineCount).toBe(8);
    expect(document.lineAt(0).text).toBe('# 例');
    expect(document.lineAt(2).text).toBe('```breadboard');
    expect(document.lineAt(5).text).toBe('  R1: resistor a9 b9');
  });

  test('範囲の外は投げる (黙って空行を返さない)', () => {
    const document = docOver(() => DOC);

    expect(() => document.lineAt(99)).toThrow(/99 行目/);
  });
});

describe('applyChanges', () => {
  const lines = DOC.split('\n');

  test('控えと合えば当てる', () => {
    // Act
    const out = applyChanges(lines, [
      { line: 5, from: { column: 15, text: 'a9' }, to: { column: 15, text: 'a10' } },
    ]);

    // Assert
    expect(out?.[5]).toBe('  R1: resistor a10 b9');
  });

  test('同じ行に 2 か所あっても、右がずれない', () => {
    const out = applyChanges(lines, [
      { line: 5, from: { column: 15, text: 'a9' }, to: { column: 15, text: 'a10' } },
      { line: 5, from: { column: 18, text: 'b9' }, to: { column: 19, text: 'b10' } },
    ]);

    expect(out?.[5]).toBe('  R1: resistor a10 b10');
  });

  test('控えと合わなければ何もしない', () => {
    const out = applyChanges(lines, [
      { line: 5, from: { column: 15, text: 'z9' }, to: { column: 15, text: 'a10' } },
    ]);

    expect(out).toBeNull();
  });

  test('無い行を指していたら何もしない', () => {
    expect(applyChanges(lines, [
      { line: 99, from: { column: 0, text: 'x' }, to: { column: 0, text: 'y' } },
    ])).toBeNull();
  });
});

describe('replaceLines', () => {
  const lines = DOC.split('\n');

  /** 本文は 3 行目から 3 行 (`title:` / `parts:` / `  R1:`)。 */
  test('フェンスの本文だけを丸ごと入れ替える', () => {
    const out = replaceLines(lines, 3, 3, ['title: 別の図']);

    expect(out?.join('\n')).toBe(['# 例', '', '```breadboard', 'title: 別の図', '```', ''].join('\n'));
  });

  test('散文の行は 1 字も動かさない', () => {
    const out = replaceLines(lines, 3, 3, ['x']);

    expect(out?.[0]).toBe('# 例');
    expect(out?.at(-1)).toBe('');
  });

  test('文書からはみ出す指定は断る', () => {
    expect(replaceLines(lines, 3, 99, ['x'])).toBeNull();
    expect(replaceLines(lines, 3, 0, ['x'])).toBeNull();
  });
});

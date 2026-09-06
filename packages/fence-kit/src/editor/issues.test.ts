import { describe, expect, test } from 'vitest';
import { renderIssues } from './issues.ts';
import { describeDiff, strippedIndent } from './edits.ts';
import { keptSourceLines } from '../sourceListing.ts';
import { stampText } from '../stamp.ts';

/**
 * マップの下の帯と、その周りの小さな道具。**3 つのフェンスが同じものを使う**
 * ので、どれか 1 つのテストから落ちると誰も見ていないことになる。
 */

const row = (over: Partial<Parameters<typeof renderIssues>[0][number]> = {}) =>
  ({ kind: 'error' as const, line: 3, text: '読めませんでした', ...over });

describe('帯', () => {
  test('says nothing when there is nothing to say', () => {
    expect(renderIssues([])).toBe('');
  });

  test('marks the row so the click can jump to the line', () => {
    const html = renderIssues([row()]);

    expect(html).toContain('data-line="3"');
    expect(html).toContain('cf-error');
  });

  test('leaves the line off when it does not know one, so no row is dead to the click', () => {
    // 手掛かりを付けると、押しても何も起きない行ができる。
    expect(renderIssues([row({ line: null })])).not.toContain('data-line');
  });

  test('tells a notice from an error, since only one of them means the fence broke', () => {
    expect(renderIssues([row({ kind: 'notice' })])).toContain('cf-notice');
  });

  test('escapes the text, because the panel does not sanitise what the extension returns', () => {
    expect(renderIssues([row({ text: '<script>x</script>' })])).not.toContain('<script>');
  });

  test('keeps the snippet as markup, since the caller escaped it already', () => {
    expect(renderIssues([row({ snippet: '<code>a5</code>' })])).toContain('<code>a5</code>');
  });

  test('stops before the band pushes the map off the panel, and counts the rest', () => {
    const many = Array.from({ length: 20 }, (_, index) => row({ line: index + 1 }));
    const html = renderIssues(many);

    expect(html).toContain('ほかに 8 件');
    expect(html.match(/data-line=/g)).toHaveLength(12);
  });
});

describe('字下げの数え方', () => {
  test('counts what the fence actually stripped from that line', () => {
    // 開き記号より浅い行からは、剥がした量が少ない。一律に足し戻すと桁がずれる
    // (箇条書きの中のフェンスで実際に踏んだ)。
    expect(strippedIndent('   ```breadboard', '   parts:')).toBe(3);
    expect(strippedIndent('   ```breadboard', ' parts:')).toBe(1);
    expect(strippedIndent('```breadboard', '    parts:')).toBe(0);
  });
});

describe('接続の変化の一言', () => {
  test('says nothing when nothing changed, because saying so would be a lie', () => {
    expect(describeDiff({ lost: [], gained: [] })).toBeNull();
  });

  test('names what came apart and what came together', () => {
    const said = describeDiff({ lost: [['R1.1', 'a5']], gained: [['R1.2', 'b7']] });

    expect(said).toContain('離れた接続: R1.1 — a5');
    expect(said).toContain('つながった接続: R1.2 — b7');
  });

  test('says only the half that happened', () => {
    expect(describeDiff({ lost: [['R1.1', 'a5']], gained: [] })).not.toContain('つながった');
    expect(describeDiff({ lost: [], gained: [['R1.2', 'b7']] })).not.toContain('離れた');
  });
});

describe('フェンスの書き出し', () => {
  test('drops the blank tail, which came from evening out the newlines', () => {
    expect(keptSourceLines('a\nb\n\n\n', 10)).toEqual(['a', 'b']);
  });

  test('says how much it cut, rather than letting the listing end silently', () => {
    expect(keptSourceLines('a\nb\nc\nd', 2)).toEqual(['a', 'b', '… ほかに 2 行']);
  });

  test('keeps everything when it fits', () => {
    expect(keptSourceLines('a\nb', 5)).toEqual(['a', 'b']);
  });
});

describe('版の印', () => {
  test('puts the name and the version on one line', () => {
    expect(stampText('breadboard-fence', '0.7.0')).toBe('breadboard-fence 0.7.0');
  });
});

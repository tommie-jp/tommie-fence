import { describe, expect, test } from 'vitest';
import { NOTE_MARK_COLOR } from '../notes.ts';
import { applyNotes } from './noteText.ts';

/** node-tikzjax が目印のノードに対して実際に返す形 (実機で確かめた並び)。 */
const marker = (transform: string): string =>
  `<g fill="${NOTE_MARK_COLOR}" stroke="${NOTE_MARK_COLOR}">` +
  `<text x="-71.87" y="-65.495" fill="${NOTE_MARK_COLOR}" stroke="none" ` +
  `font-family="cmr8" font-size="8" transform="${transform}">X</text></g>`;

const SVG = `<svg viewBox="0 0 10 10"><path d="M0 0"/>${marker('translate(1 2)')}</svg>`;

describe('applyNotes', () => {
  test('目印を注釈の文字に差し替える', () => {
    const svg = applyNotes(SVG, [{ text: 'ここで分圧する', color: '#e5534b' }]);

    expect(svg).toContain('>ここで分圧する</text>');
    expect(svg).not.toContain('>X</text>');
  });

  test('目印の置かれた位置と大きさをそのまま使う', () => {
    const svg = applyNotes(SVG, [{ text: 'あ', color: '#e5534b' }]);

    expect(svg).toContain('x="-71.87"');
    expect(svg).toContain('y="-65.495"');
    expect(svg).toContain('transform="translate(1 2)"');
    expect(svg).toContain('font-size="8"');
  });

  test('文字の色は注釈ごとに入れ替える', () => {
    const svg = applyNotes(SVG, [{ text: 'あ', color: '#4c8eda' }]);

    expect(svg).toContain('fill="#4c8eda"');
    expect(svg).toMatch(/<text[^>]*fill="#4c8eda"[^>]*>あ<\/text>/);
  });

  test('日本語の出るフォントに差し替える (TeX のフォントには字形が無い)', () => {
    const svg = applyNotes(SVG, [{ text: 'あ', color: '#e5534b' }]);

    expect(svg).not.toContain('font-family="cmr8"');
    expect(svg).toMatch(/font-family="[^"]*sans-serif"/);
  });

  test('XML として読まれる字はエスケープする', () => {
    const svg = applyNotes(SVG, [{ text: 'a<b>&', color: '#e5534b' }]);

    expect(svg).toContain('>a&lt;b&gt;&amp;</text>');
  });

  test('目印を書いた順に当てる', () => {
    const many = `<svg>${marker('translate(1 2)')}${marker('translate(3 4)')}</svg>`;
    const svg = applyNotes(many, [
      { text: 'いち', color: '#e5534b' },
      { text: 'に', color: '#4c8eda' },
    ]);

    expect(svg.indexOf('いち')).toBeLessThan(svg.indexOf('に'));
    expect(svg).toMatch(/translate\(1 2\)">いち/);
    expect(svg).toMatch(/translate\(3 4\)">に/);
  });

  test('差し替えた後は器から目印の色を外す', () => {
    const svg = applyNotes(SVG, [{ text: 'あ', color: '#e5534b' }]);

    expect(svg).not.toContain(`<g fill="${NOTE_MARK_COLOR}"`);
    expect(svg).toContain('<g>');
  });

  test('注釈が無ければ何も変えない', () => {
    expect(applyNotes(SVG, [])).toBe(SVG);
  });

  // 数が食い違うのは、TeX の側で目印が落ちたということ。黙って消すと
  // 「注釈を書いたのに出ない」だけが残るので、目印を残して図に見せる。
  test('注釈より目印が多ければ、余った目印はそのまま残す', () => {
    const many = `<svg>${marker('translate(1 2)')}${marker('translate(3 4)')}</svg>`;
    const svg = applyNotes(many, [{ text: 'いち', color: '#e5534b' }]);

    // 器の色は外しても、当てられなかった目印の字はそのまま図に出る。
    expect(svg).toContain(`fill="${NOTE_MARK_COLOR}" stroke="none"`);
    expect(svg).toContain('>X</text>');
  });

  test('目印より注釈が多くても落ちない', () => {
    const svg = applyNotes(SVG, [
      { text: 'いち', color: '#e5534b' },
      { text: 'に', color: '#e5534b' },
    ]);

    expect(svg).toContain('いち');
    expect(svg).not.toContain('に<');
  });
});

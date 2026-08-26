import { describe, expect, test } from 'vitest';
import { NOTE_MARK_COLOR } from '../notes.ts';
import type { NoteOverlay } from '../types.ts';
import { applyNotes } from './noteText.ts';

/** node-tikzjax が目印のノードに対して実際に返す形 (実機で確かめた並び)。 */
const marker = (transform: string): string =>
  `<g fill="${NOTE_MARK_COLOR}" stroke="${NOTE_MARK_COLOR}">` +
  `<text x="-71.87" y="-65.495" fill="${NOTE_MARK_COLOR}" stroke="none" ` +
  `font-family="cmr8" font-size="8" transform="${transform}">X</text></g>`;

const SVG = `<svg viewBox="0 0 10 10"><path d="M0 0"/>${marker('translate(1 2)')}</svg>`;

/** 書かれなかったところは既定のまま、という注釈 1 つ。 */
const note = (text: string, look: Partial<NoteOverlay> = {}): NoteOverlay => ({
  text,
  color: '#e5534b',
  mono: false,
  bold: false,
  align: 'left',
  ...look,
});

describe('applyNotes', () => {
  test('目印を注釈の文字に差し替える', () => {
    const svg = applyNotes(SVG, [note('ここで分圧する')]);

    expect(svg).toContain('>ここで分圧する</text>');
    expect(svg).not.toContain('>X</text>');
  });

  test('目印の置かれた位置と大きさをそのまま使う', () => {
    const svg = applyNotes(SVG, [note('あ')]);

    expect(svg).toContain('x="-71.87"');
    expect(svg).toContain('y="-65.495"');
    expect(svg).toContain('transform="translate(1 2)"');
    expect(svg).toContain('font-size="8"');
  });

  test('文字の色は注釈ごとに入れ替える', () => {
    const svg = applyNotes(SVG, [note('あ', { color: '#4c8eda' })]);

    expect(svg).toContain('fill="#4c8eda"');
    expect(svg).toMatch(/<text[^>]*fill="#4c8eda"[^>]*>あ<\/text>/);
  });

  test('日本語の出るフォントに差し替える (TeX のフォントには字形が無い)', () => {
    const svg = applyNotes(SVG, [note('あ')]);

    expect(svg).not.toContain('font-family="cmr8"');
    expect(svg).toMatch(/font-family="[^"]*sans-serif"/);
  });

  test('XML として読まれる字はエスケープする', () => {
    const svg = applyNotes(SVG, [note('a<b>&')]);

    expect(svg).toContain('>a&lt;b&gt;&amp;</text>');
  });

  test('目印を書いた順に当てる', () => {
    const many = `<svg>${marker('translate(1 2)')}${marker('translate(3 4)')}</svg>`;
    const svg = applyNotes(many, [note('いち'), note('に', { color: '#4c8eda' })]);

    expect(svg.indexOf('いち')).toBeLessThan(svg.indexOf('に'));
    expect(svg).toMatch(/translate\(1 2\)">いち/);
    expect(svg).toMatch(/translate\(3 4\)">に/);
  });

  test('差し替えた後は器から目印の色を外す', () => {
    const svg = applyNotes(SVG, [note('あ')]);

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
    const svg = applyNotes(many, [note('いち')]);

    // 器の色は外しても、当てられなかった目印の字はそのまま図に出る。
    expect(svg).toContain(`fill="${NOTE_MARK_COLOR}" stroke="none"`);
    expect(svg).toContain('>X</text>');
  });

  test('目印より注釈が多くても落ちない', () => {
    const svg = applyNotes(SVG, [note('いち'), note('に')]);

    expect(svg).toContain('いち');
    expect(svg).not.toContain('に<');
  });
});

describe('applyNotes の見た目', () => {
  // TeX は太さをフォントの名前 (cmbx8) で表すが、差し込むときにフォントごと
  // 入れ替えるのでその指定は消える。太さはこちらで書き直す。
  test('太字は font-weight で書き直す', () => {
    const svg = applyNotes(SVG, [note('あ', { bold: true })]);

    expect(svg).toMatch(/<text[^>]*font-weight="bold"[^>]*>あ<\/text>/);
  });

  test('太字でなければ font-weight を足さない', () => {
    expect(applyNotes(SVG, [note('あ')])).not.toContain('font-weight');
  });

  // 目印は 1 文字で、差し込む本物の字とは幅が違う。寄せは TeX には決められない
  // ので、番地の点に対してどちら側に置くかを SVG に決めさせる。
  test('右寄せは番地で字を終わらせる', () => {
    const svg = applyNotes(SVG, [note('あ', { align: 'right' })]);

    expect(svg).toMatch(/<text[^>]*text-anchor="end"[^>]*>あ<\/text>/);
  });

  test('真ん中寄せは番地を字の真ん中にする', () => {
    const svg = applyNotes(SVG, [note('あ', { align: 'center' })]);

    expect(svg).toMatch(/<text[^>]*text-anchor="middle"[^>]*>あ<\/text>/);
  });

  // 左寄せは SVG の既定と同じなので、足す前と同じ出力にする。
  test('左寄せは属性を足さない', () => {
    expect(applyNotes(SVG, [note('あ')])).not.toContain('text-anchor');
  });

  test('等幅の注釈は字下げを保つ', () => {
    const svg = applyNotes(SVG, [note('  parts:', { mono: true })]);

    expect(svg).toContain('xml:space="preserve"');
    expect(svg).toMatch(/font-family="[^"]*monospace"/);
  });

  test('見た目をいくつ書いても、位置と大きさは TeX の決めたまま', () => {
    const svg = applyNotes(SVG, [note('あ', { bold: true, align: 'center' })]);

    expect(svg).toContain('x="-71.87"');
    expect(svg).toContain('font-size="8"');
    expect(svg).toContain('transform="translate(1 2)"');
  });
});

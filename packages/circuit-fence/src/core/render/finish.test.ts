import { describe, expect, test } from 'vitest';
import { NOTE_MARK_COLOR, NOTE_MARK_TEXT } from '../notes.ts';
import { VERSION } from '../version.ts';
import type { NoteOverlay } from '../types.ts';
import { finishSvg, markSvg } from './finish.ts';
import { DEFAULT_THEME } from './theme.ts';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><g/></svg>';

const NOTES: readonly NoteOverlay[] = [];

describe('markSvg', () => {
  test('writes the version onto the root element', () => {
    expect(markSvg(SVG)).toContain(`data-circuit-fence="${VERSION}"`);
  });

  test('leaves the rest of the drawing untouched', () => {
    expect(markSvg(SVG).replace(` data-circuit-fence="${VERSION}"`, '')).toBe(SVG);
  });

  test('marks a drawing that starts with whitespace', () => {
    expect(markSvg(`\n${SVG}`)).toContain('data-circuit-fence=');
  });

  test('does not mark twice', () => {
    const marked = markSvg(markSvg(SVG));

    expect(marked.match(/data-circuit-fence=/g)).toHaveLength(1);
  });

  test('leaves something that is not a drawing alone', () => {
    expect(markSvg('<p>図を描いています…</p>')).toBe('<p>図を描いています…</p>');
  });
});

describe('finishSvg', () => {
  test('marks every drawing it finishes', () => {
    expect(finishSvg(SVG, { notes: NOTES, theme: DEFAULT_THEME, width: null })).toContain(
      `data-circuit-fence="${VERSION}"`,
    );
  });

  test('paints the drawing in the theme', () => {
    const dark = { ...DEFAULT_THEME, ink: '#e6edf3' };
    const black = SVG.replace('<g/>', '<g stroke="#000"/>');

    expect(finishSvg(black, { notes: NOTES, theme: dark, width: null })).toContain('stroke="#e6edf3"');
  });

  test('writes the outer size asked for', () => {
    expect(finishSvg(SVG, { notes: NOTES, theme: DEFAULT_THEME, width: 320 })).toContain('width="320"');
  });

  test('fits an unsized drawing to the reading text only when asked', () => {
    const fitted = finishSvg(SVG, { notes: NOTES, theme: DEFAULT_THEME, width: null, fitToText: true });

    expect(fitted).toMatch(/width="[\d.]+em"/);
    expect(finishSvg(SVG, { notes: NOTES, theme: DEFAULT_THEME, width: null })).not.toContain('em"');
  });

  test('lets a written size win over fitting to the reading text', () => {
    const sized = finishSvg(SVG, { notes: NOTES, theme: DEFAULT_THEME, width: 320, fitToText: true });

    expect(sized).toContain('width="320"');
    expect(sized).not.toContain('em"');
  });

  test('fills in the note text before the theme repaints it', () => {
    // 色を書かなかった注釈は黒で出て、そのあと文字色に塗り替わる。
    // 順番が逆になると、注釈だけが黒のまま暗いテーマの地に沈む。
    const mark = `<text fill="${NOTE_MARK_COLOR}" font-family="cmr10">${NOTE_MARK_TEXT}</text>`;
    const note: NoteOverlay = { text: 'あ', color: '#000000', mono: false, bold: false, align: 'left' };
    const finished = finishSvg(SVG.replace('<g/>', `<g>${mark}</g>`), {
      notes: [note],
      theme: { ...DEFAULT_THEME, ink: '#e6edf3' },
      width: null,
    });

    expect(finished).toContain('>あ</text>');
    expect(finished).toContain('fill="#e6edf3"');
    expect(finished).not.toContain(NOTE_MARK_COLOR);
  });
});
